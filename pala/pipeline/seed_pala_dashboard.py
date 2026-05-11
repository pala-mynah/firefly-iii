#!/usr/bin/env python3
"""
seed_pala_dashboard.py — wipe & seed Firefly with the Pala dashboard data model.

Idempotent. Run once after a fresh Firefly DB, or anytime you want to reset the
demo state. Reads FIREFLY_ACCESS_TOKEN from the environment (see pala/.env).

What it does, in order:
  1. Deletes all existing categories, budgets, budget-limits, rule-groups, rules.
     (Accounts and transactions are NOT touched unless --wipe-tx is passed.)
  2. Creates the 8 envelopes from DESIGN.md §4, each with a monthly available
     budget and a budget-limit for the current month + 5 prior months.
  3. Creates the matching categories (Supermarket, Cafes, Drinking, etc.).
  4. (If --mock) generates ~80 mock transactions across the last 3 months,
     each tagged with both its budget and its category, against account id 1
     (AT80 George). A handful of ATM-withdrawal transfers AT80 → AT53 are
     created to populate the "outside budgets · deliberate" bucket.

Usage:
  FIREFLY_ACCESS_TOKEN=... python3 seed_pala_dashboard.py [--mock] [--wipe-tx]
"""

from __future__ import annotations

import argparse
import calendar
import os
import random
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Iterable

import requests

# ────────────────────────────────────────────────────────────────────────────
# config
# ────────────────────────────────────────────────────────────────────────────

FIREFLY_URL = os.getenv("FIREFLY_URL", "http://localhost:7076").rstrip("/")
TOKEN = os.getenv("FIREFLY_ACCESS_TOKEN")
if not TOKEN:
    sys.exit("FIREFLY_ACCESS_TOKEN missing — source pala/.env first.")

H = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "Accept": "application/vnd.api+json",
}

ASSET_ACCOUNT_ID = "1"        # AT80 George (Erste Bank)
SAVINGS_ACCOUNT_ID = "2"      # AT53 Erste Sparziel (round-ups)
CURRENCY = "EUR"
RNG = random.Random(20260111)  # deterministic mocks


# ────────────────────────────────────────────────────────────────────────────
# the Pala data model (DESIGN.md §4)
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class Envelope:
    name: str
    monthly: float           # available budget, EUR / month
    categories: list[str]    # child categories
    merchants: list[str] = field(default_factory=list)  # for mock tx descriptions
    avg_tx: float = 0.0      # average ticket size for mock tx generation
    tx_per_month: int = 6    # how many mock tx per month to generate

ENVELOPES: list[Envelope] = [
    Envelope("Groceries", 450, ["Supermarket", "Fresh Market & Butcher", "Bakeries"],
             ["BILLA", "SPAR", "HOFER", "MERKUR", "DENN'S", "Naschmarkt", "Anker", "Ströck"],
             avg_tx=22, tx_per_month=14),
    Envelope("Going Out", 250, ["Restaurants", "Cafes"],
             ["Figlmüller", "Plachutta", "Café Central", "Café Sperl", "Phil", "Espresso Wien"],
             avg_tx=18, tx_per_month=10),
    Envelope("Sins", 120, ["Drinking", "Smoking"],
             ["Krah Krah", "Loos Bar", "Tabak Trafik", "Wein & Co"],
             avg_tx=12, tx_per_month=7),
    Envelope("Transport", 100, ["Public Transport", "Fuel"],
             ["Wiener Linien", "ÖBB", "OMV", "SHELL", "BP"],
             avg_tx=14, tx_per_month=5),
    Envelope("Subscription", 80, ["Subs — Infrastructure", "Subs — Lifestyle"],
             ["A1 Telekom", "Magenta", "Spotify", "Netflix", "Patreon"],
             avg_tx=12, tx_per_month=5),
    Envelope("Lifestyle", 200, ["Entertainment & Culture", "Sports & Activities"],
             ["Stadtkino", "Burgtheater", "John Harris Fitness", "Decathlon", "Albertina"],
             avg_tx=24, tx_per_month=6),
    Envelope("Living", 300, ["Health", "Home & Hardware", "Bureaucracy"],
             ["Apotheke", "BIPA", "OBI", "IKEA", "Bauhaus", "Magistrat"],
             avg_tx=28, tx_per_month=6),
    Envelope("Travel", 150, ["Travel & Accommodation"],
             ["Booking.com", "Flixbus", "Airbnb", "ÖBB"],
             avg_tx=85, tx_per_month=2),
]

OUTSIDE_BUDGET_CATEGORIES = ["Cash Withdrawals"]  # deliberate; not under any budget


# ────────────────────────────────────────────────────────────────────────────
# tiny api client
# ────────────────────────────────────────────────────────────────────────────

def api(method: str, path: str, *, ok_status: tuple[int, ...] = (), **kw) -> dict | None:
    """`ok_status` lists extra status codes (besides 2xx) to treat as success and return None."""
    url = f"{FIREFLY_URL}/api/v1{path}"
    r = requests.request(method, url, headers=H, **kw)
    if r.status_code in ok_status:
        return None
    if r.status_code == 204 or not r.text:
        return None
    if not r.ok:
        sys.exit(f"{method} {url} → {r.status_code}: {r.text[:400]}")
    return r.json()


def paged(path: str) -> Iterable[dict]:
    page = 1
    while True:
        res = api("GET", f"{path}?page={page}&limit=100")
        if not res or not res.get("data"):
            return
        yield from res["data"]
        meta = res.get("meta", {}).get("pagination", {})
        if page >= meta.get("total_pages", 1):
            return
        page += 1


# ────────────────────────────────────────────────────────────────────────────
# wipe
# ────────────────────────────────────────────────────────────────────────────

def wipe_metadata() -> None:
    print("→ wiping rules, rule-groups, budget-limits, budgets, categories…")
    # rules first (FK on rule-groups, budgets, categories)
    for r in paged("/rules"):
        api("DELETE", f"/rules/{r['id']}")
    for g in paged("/rule-groups"):
        api("DELETE", f"/rule-groups/{g['id']}")
    # available-budgets are auto-managed; budget-limits hang off budgets
    for b in paged("/budgets"):
        for lim in paged(f"/budgets/{b['id']}/limits"):
            api("DELETE", f"/budgets/{b['id']}/limits/{lim['id']}")
        api("DELETE", f"/budgets/{b['id']}")
    for c in paged("/categories"):
        api("DELETE", f"/categories/{c['id']}")
    print("  ✓ metadata wiped")


def wipe_transactions() -> None:
    print("→ wiping transactions…")
    n = 0
    for t in paged("/transactions"):
        api("DELETE", f"/transactions/{t['id']}")
        n += 1
    print(f"  ✓ {n} transactions deleted")


# ────────────────────────────────────────────────────────────────────────────
# create envelopes + categories
# ────────────────────────────────────────────────────────────────────────────

def month_range(end: date, months_back: int) -> list[tuple[date, date]]:
    """[(first, last)] for each of the last `months_back` calendar months ending at `end`."""
    out = []
    y, m = end.year, end.month
    for _ in range(months_back):
        first = date(y, m, 1)
        last = date(y, m, calendar.monthrange(y, m)[1])
        out.append((first, last))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(out))


def create_envelopes(history_months: int = 6) -> dict[str, str]:
    """Returns {envelope_name: budget_id}."""
    print(f"→ creating {len(ENVELOPES)} budgets with {history_months}mo of limits…")
    today = date.today()
    months = month_range(today, history_months)
    name_to_id: dict[str, str] = {}
    for env in ENVELOPES:
        r = api("POST", "/budgets", json={
            "name": env.name,
            "active": True,
            "auto_budget_type": "reset",
            "auto_budget_period": "monthly",
            "auto_budget_amount": str(env.monthly),
            "auto_budget_currency_code": CURRENCY,
        })
        bid = r["data"]["id"]
        name_to_id[env.name] = bid
        for first, last in months:
            # 422 = a limit already exists for this period (auto-budget created it). Skip.
            api("POST", f"/budgets/{bid}/limits", ok_status=(422,), json={
                "budget_id": bid,
                "start": first.isoformat(),
                "end": last.isoformat(),
                "amount": str(env.monthly),
                "currency_code": CURRENCY,
            })
        print(f"  ✓ {env.name:<14} €{env.monthly:>5} × {history_months}mo")
    return name_to_id


def create_categories() -> dict[str, str]:
    """Returns {category_name: category_id}."""
    all_cats: list[str] = []
    for env in ENVELOPES:
        all_cats.extend(env.categories)
    all_cats.extend(OUTSIDE_BUDGET_CATEGORIES)
    print(f"→ creating {len(all_cats)} categories…")
    name_to_id: dict[str, str] = {}
    for name in all_cats:
        r = api("POST", "/categories", json={"name": name})
        name_to_id[name] = r["data"]["id"]
    print("  ✓ categories created")
    return name_to_id


# ────────────────────────────────────────────────────────────────────────────
# mock transactions
# ────────────────────────────────────────────────────────────────────────────

def store_withdrawal(when: date, amount: float, description: str,
                     budget_id: str | None, category_id: str) -> None:
    tx = {
        "type": "withdrawal",
        "date": when.isoformat(),
        "amount": f"{amount:.2f}",
        "description": description,
        "source_id": ASSET_ACCOUNT_ID,
        "destination_name": description.split()[0],  # auto-creates expense account
        "currency_code": CURRENCY,
        "category_id": category_id,
    }
    if budget_id:
        tx["budget_id"] = budget_id
    api("POST", "/transactions", json={"transactions": [tx], "apply_rules": False})


def store_transfer(when: date, amount: float, description: str) -> None:
    api("POST", "/transactions", json={"transactions": [{
        "type": "transfer",
        "date": when.isoformat(),
        "amount": f"{amount:.2f}",
        "description": description,
        "source_id": ASSET_ACCOUNT_ID,
        "destination_id": SAVINGS_ACCOUNT_ID,
        "currency_code": CURRENCY,
    }], "apply_rules": False})


def store_deposit(when: date, amount: float, description: str, source: str) -> None:
    api("POST", "/transactions", json={"transactions": [{
        "type": "deposit",
        "date": when.isoformat(),
        "amount": f"{amount:.2f}",
        "description": description,
        "source_name": source,
        "destination_id": ASSET_ACCOUNT_ID,
        "currency_code": CURRENCY,
    }], "apply_rules": False})


def generate_mocks(budget_ids: dict[str, str], category_ids: dict[str, str],
                   months_back: int = 3) -> None:
    print(f"→ generating mock transactions for {months_back}mo…")
    today = date.today()
    months = month_range(today, months_back)
    tx_count = 0

    for first, last in months:
        # salary on the 1st
        store_deposit(first, 2400, "Salary", "Employer GmbH")
        tx_count += 1

        # transactions per envelope
        for env in ENVELOPES:
            bid = budget_ids[env.name]
            for _ in range(env.tx_per_month):
                day = RNG.randint(first.day, min(last.day, today.day if (first.year, first.month) == (today.year, today.month) else last.day))
                when = date(first.year, first.month, day)
                cat = RNG.choice(env.categories)
                merchant = RNG.choice(env.merchants) if env.merchants else cat
                amt = round(RNG.gauss(env.avg_tx, env.avg_tx * 0.35), 2)
                amt = max(2.0, amt)
                store_withdrawal(when, amt, f"{merchant}", bid, category_ids[cat])
                tx_count += 1

        # 2 ATM withdrawals per month (outside budgets, deliberate)
        for _ in range(2):
            day = RNG.randint(first.day, min(last.day, today.day if (first.year, first.month) == (today.year, today.month) else last.day))
            when = date(first.year, first.month, day)
            store_withdrawal(when, round(RNG.choice([50, 100, 100, 150, 200]), 2),
                             "ATM Withdrawal", None, category_ids["Cash Withdrawals"])
            tx_count += 1

        # 1 round-up transfer to savings
        store_transfer(last, round(RNG.uniform(8, 24), 2), "Round-up to Sparziel")
        tx_count += 1

    print(f"  ✓ {tx_count} mock transactions created")


# ────────────────────────────────────────────────────────────────────────────
# main
# ────────────────────────────────────────────────────────────────────────────

def existing_index(path: str) -> dict[str, str]:
    """Returns {name: id} for whatever is currently at /path (budgets, categories, ...)."""
    return {x["attributes"]["name"]: x["id"] for x in paged(path)}


def mock_tx_signature_exists() -> bool:
    """Cheap check: does at least one mock-looking tx already exist?"""
    # Salary deposits are the easiest fingerprint.
    res = api("GET", "/search/transactions?query=description%3A%22Salary%22&limit=1")
    return bool(res and res.get("data"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="mode", required=True)

    p_meta = sub.add_parser("meta", help="create 8 budgets + categories. Idempotent — skips anything already there.")
    p_meta.add_argument("--history", type=int, default=6, help="months of budget-limit history (default 6)")
    p_meta.add_argument("--wipe", action="store_true", help="wipe existing budgets/categories/rules first")

    p_mock = sub.add_parser("mock", help="create mock transactions. Idempotent — skips if Salary tx already present.")
    p_mock.add_argument("--months", type=int, default=3, help="months of mock tx history (default 3)")
    p_mock.add_argument("--force", action="store_true", help="create even if mock tx already detected")

    p_reset = sub.add_parser("reset", help="NUCLEAR: wipe transactions + budgets + categories + rules, then re-seed everything.")
    p_reset.add_argument("--history", type=int, default=6)
    p_reset.add_argument("--months", type=int, default=3)

    args = ap.parse_args()

    print(f"Firefly URL: {FIREFLY_URL}")
    print("=" * 60)

    if args.mode == "meta":
        if args.wipe:
            wipe_metadata()
        budget_ids = upsert_envelopes(history_months=args.history)
        upsert_categories()
        _ = budget_ids  # silence linter

    elif args.mode == "mock":
        if not args.force and mock_tx_signature_exists():
            print("✓ mock transactions already present (found a Salary tx). Use --force to add more, or `reset` for a clean slate.")
            return
        budget_ids = existing_index("/budgets")
        category_ids = existing_index("/categories")
        missing_envs = [e.name for e in ENVELOPES if e.name not in budget_ids]
        if missing_envs:
            sys.exit(f"missing budgets: {missing_envs}. Run `meta` first.")
        generate_mocks(budget_ids, category_ids, months_back=args.months)

    elif args.mode == "reset":
        wipe_metadata()
        wipe_transactions()
        budget_ids = create_envelopes(history_months=args.history)
        category_ids = create_categories()
        generate_mocks(budget_ids, category_ids, months_back=args.months)

    print("=" * 60)
    print("done.")


# ────────────────────────────────────────────────────────────────────────────
# upsert variants — idempotent (skip if already present by name)
# ────────────────────────────────────────────────────────────────────────────

def upsert_envelopes(history_months: int = 6) -> dict[str, str]:
    existing = existing_index("/budgets")
    if existing:
        print(f"✓ found {len(existing)} existing budgets, skipping creation")
        return existing
    return create_envelopes(history_months=history_months)


def upsert_categories() -> dict[str, str]:
    existing = existing_index("/categories")
    if existing:
        print(f"✓ found {len(existing)} existing categories, skipping creation")
        return existing
    return create_categories()


if __name__ == "__main__":
    main()
