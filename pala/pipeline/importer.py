"""Import George CSV exports directly into Firefly III via API."""
import csv
import os
import sys
from datetime import datetime
from pathlib import Path

import urllib.request
import urllib.error
import json

FIREFLY_URL = "http://localhost:7076"
TOKEN = os.environ.get("FIREFLY_ACCESS_TOKEN", "")

GEORGE_ACCOUNT_ID = 1
SAVINGS_ACCOUNT_ID = 2

# Opening balances — update these when changing the date range
GEORGE_OPENING_BALANCE = "276.84"
SAVINGS_OPENING_BALANCE = "16.00"
OPENING_BALANCE_DATE = "2026-01-01"


def parse_amount(value: str) -> float:
    return float(value.replace(".", "").replace(",", "."))


def parse_date(value: str) -> str:
    return datetime.strptime(value.strip(), "%d.%m.%Y").strftime("%Y-%m-%d")


def is_roundup(description: str) -> bool:
    return "Worauf sparen Sie?" in description


def get_external_id(row: dict) -> str | None:
    return (row.get("Buchungsreferenz") or row.get("Zahlungsreferenz") or "").strip() or None


def post_transaction(payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{FIREFLY_URL}/api/v1/transactions",
        data=data,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        # 422 with duplicate hash = already imported, skip silently
        if e.code == 422 and "duplicate" in body.lower():
            return {"duplicate": True}
        print(f"  ERROR {e.code}: {body[:200]}")
        return {"error": True}


def import_current_account(path: Path):
    print(f"\n=== {path.name} (current account) ===")
    ok = dupes = errors = 0

    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            amount = parse_amount(row["Betrag"])
            if amount == 0:
                continue
            description = row["Buchungs-Details"].strip() or row.get("Zahlungsreferenz", "").strip() or "—"
            date = parse_date(row["Buchungsdatum"])
            external_id = get_external_id(row)
            partner_name = row["Partnername"].strip() or None
            partner_iban = row["Partner IBAN"].strip() or None

            if is_roundup(description):
                txn = {
                    "type": "transfer",
                    "date": date,
                    "amount": str(abs(amount)),
                    "description": description,
                    "source_id": GEORGE_ACCOUNT_ID,
                    "destination_id": SAVINGS_ACCOUNT_ID,
                    "external_id": external_id,
                }
            elif amount < 0:
                txn = {
                    "type": "withdrawal",
                    "date": date,
                    "amount": str(abs(amount)),
                    "description": description,
                    "source_id": GEORGE_ACCOUNT_ID,
                    "destination_name": partner_name or description[:50],
                    "destination_iban": partner_iban,
                    "external_id": external_id,
                }
            else:
                txn = {
                    "type": "deposit",
                    "date": date,
                    "amount": str(amount),
                    "description": description,
                    "destination_id": GEORGE_ACCOUNT_ID,
                    "source_name": partner_name or description[:50],
                    "source_iban": partner_iban,
                    "external_id": external_id,
                }

            result = post_transaction({"error_if_duplicate_hash": True, "apply_rules": True, "transactions": [txn]})
            if result.get("duplicate"):
                dupes += 1
            elif result.get("error"):
                errors += 1
            else:
                ok += 1

    print(f"  imported: {ok}  duplicates skipped: {dupes}  errors: {errors}")


def import_savings_account(path: Path):
    print(f"\n=== {path.name} (savings account) ===")
    ok = dupes = skipped = errors = 0

    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            description = row["Buchungs-Details"].strip()

            # Round-ups are already imported as transfers from the current account side
            if is_roundup(description):
                skipped += 1
                continue

            amount = parse_amount(row["Betrag"])
            if amount == 0:
                continue
            date = parse_date(row["Buchungsdatum"])
            external_id = get_external_id(row)
            partner_name = row["Partnername"].strip() or None
            partner_iban = row["Partner IBAN"].strip() or None

            if amount < 0:
                txn = {
                    "type": "withdrawal",
                    "date": date,
                    "amount": str(abs(amount)),
                    "description": description,
                    "source_id": SAVINGS_ACCOUNT_ID,
                    "destination_name": partner_name or description[:50],
                    "destination_iban": partner_iban,
                    "external_id": external_id,
                }
            else:
                txn = {
                    "type": "deposit",
                    "date": date,
                    "amount": str(amount),
                    "description": description,
                    "destination_id": SAVINGS_ACCOUNT_ID,
                    "source_name": partner_name or description[:50],
                    "source_iban": partner_iban,
                    "external_id": external_id,
                }

            result = post_transaction({"error_if_duplicate_hash": True, "apply_rules": True, "transactions": [txn]})
            if result.get("duplicate"):
                dupes += 1
            elif result.get("error"):
                errors += 1
            else:
                ok += 1

    print(f"  imported: {ok}  round-ups skipped: {skipped}  duplicates: {dupes}  errors: {errors}")


if __name__ == "__main__":
    if not TOKEN:
        print("Set FIREFLY_ACCESS_TOKEN in .env")
        sys.exit(1)

    base = Path(__file__).parent
    current = base / "AT802011184223518400_2026-01-01_2026-05-05_utf8.csv"
    savings = base / "AT532011184223518401_2026-01-01_2026-05-05_utf8.csv"

    import_current_account(current)
    import_savings_account(savings)
