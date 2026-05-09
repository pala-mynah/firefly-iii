
"""
Create Firefly III categories and auto-categorization rules from George transaction data.
Safe to re-run — skips anything that already exists.
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error
from collections import defaultdict

FIREFLY_URL = "http://localhost:7076"
TOKEN = os.environ.get("FIREFLY_ACCESS_TOKEN", "")

OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "qwen2.5:0.5b"

_POS_PREFIX = re.compile(
    r'^(?:POS|E-COMM) [\d,.]+ (?:\w+ )?K1 \d{2}\.\d{2}\. \d{2}:\d{2} '
)


def normalize_desc(desc: str) -> str:
    desc = _POS_PREFIX.sub('', desc)
    return ' '.join(desc.split()).upper()


# category name → list of (condition_type, value) pairs
# "starts_with" matches the START of the normalized description (merchant name is always first
# after the POS/E-COMM prefix is stripped). Use "contains" only when the keyword is buried
# mid-string (e.g. reference numbers, or merchants behind a payment-terminal prefix like MS*).
CATEGORIES = {
    "Groceries": [
        ("starts_with", "DELHAIZE"),
        ("starts_with", "COLRUYT"),
        ("starts_with", "CARREFOUR"),
        ("starts_with", "ALDI"),
        ("starts_with", "BILLA"),
        ("starts_with", "SPAR DANKT"),
        ("starts_with", "SPAR"),
        ("starts_with", "TEGUT"),
        ("starts_with", "MKT CRF"),
        ("starts_with", "FARM COOP"),
    ],
    "Fresh Market & Butcher": [
        ("starts_with", "WESLEY S BUTCHER"),
        ("starts_with", "MEAT FACTORY"),
        ("starts_with", "POISSONERIE VERBIST"),
        ("starts_with", "BXL FOOD MARKET"),
        ("starts_with", "XUAN MINH"),
    ],
    "Restaurants & Cafes": [
        ("starts_with", "CHOUKE"),
        ("starts_with", "FLOW FOOD"),
        ("starts_with", "RESTAURANT ATOMIUM"),
        ("starts_with", "RISTORANTE DA ENZO"),
        ("starts_with", "LEIB UND SEELE"),
        ("starts_with", "BINDAAS"),
        ("starts_with", "FERHAT"),
        ("starts_with", "BISTRIOUI"),
        ("starts_with", "LPQ TONGRES"),
        ("starts_with", "SUMUP *ANSOML"),
        ("starts_with", "ARAP GASTRO"),
        ("starts_with", "WICO"),          # covers WICO'S and WICO"S
        ("starts_with", "MANOA"),
        ("starts_with", "PEPES"),
        ("starts_with", "LS BOUBOULE"),
        ("starts_with", "MUNDACA MENA"),
        ("starts_with", "PAY*KRIAKOS"),
        ("starts_with", "GLOBAL CHIKEN"),
    ],
    "Bars & Drinks": [
        ("starts_with", "TAVERNE L IMPAIR"),
        ("starts_with", "TUPI IM GOATN"),
        ("starts_with", "BARC"),
        ("starts_with", "PYTHON"),
        ("starts_with", "ROBERT"),
        ("starts_with", "CAFE FRIDA"),
        ("starts_with", "CCV*IJSBAR"),
        ("starts_with", "SPC*VERTRETUNG NRW"),
    ],
    "Bakeries & Coffee": [
        ("starts_with", "SCHAEFERS BACKSTUBEN"),
        ("starts_with", "AIDA"),
        ("starts_with", "VLDG"),
        ("starts_with", "BOULANGERIE"),
        ("starts_with", "BAECKEREI ZOETTL"),
        ("starts_with", "TULIPE SPECIALTY"),
        ("starts_with", "BIO CAFE BLUETEZEIT"),
        ("starts_with", "CAFE MIU"),
        ("starts_with", "LILLE BUTIK"),
    ],
    "Public Transport": [
        ("starts_with", "STIB"),
        ("starts_with", "DB AUTOMAT"),
    ],
    "Fuel": [
        ("starts_with", "SHELL 5151"),
        ("starts_with", "TINQ MACHELEN"),
        ("starts_with", "ESSO GIBERVILLE"),
        ("starts_with", "DYNEFF"),
        ("starts_with", "Q8 106274"),
    ],
    "Travel & Accommodation": [
        ("contains",    "WOMBAT"),         # appears as "MS* WOMBATS..." — not at start
        ("starts_with", "LSP*WOMBAR"),
        ("starts_with", "LSP*KHANITTHA"),
        ("starts_with", "VILLE DE DINAN"),
        ("starts_with", "BOULOUIS FRANCOIS"),
        ("starts_with", "ELLA-LENBACHHAUS"),
        ("starts_with", "SCHLOSS UND GARTENVERW"),
    ],
    "Subscriptions — Infrastructure": [
        ("starts_with", "EDPNET"),
        ("starts_with", "PROTON"),
        ("starts_with", "REIBERT ENERGIE"),
        ("contains",    "100/0547/88866"),  # reference buried inside "+++100/0547/88866+++"
        ("starts_with", "KONTOFÜHRUNG"),
    ],
    "Subscriptions — Lifestyle": [
        ("starts_with", "OPENAI"),
        ("starts_with", "PAYPAL *STEAM"),
        ("starts_with", "NVIDIA"),
    ],
    "Entertainment & Culture": [
        ("starts_with", "CINEMA AVENTURE"),
        ("starts_with", "SUMUP *CITY"),
        ("starts_with", "CITY KINOS"),
        ("starts_with", "DGT*ABAY HORIZONS"),
    ],
    "Home & Hardware": [
        ("starts_with", "IKEA"),
        ("starts_with", "GAMMA 667"),
        ("starts_with", "MEDIA MARKT"),
        ("starts_with", "PATEL BV"),
    ],
    "Health": [
        ("starts_with", "GLOBAL MEDICAL SERVICE"),
        ("starts_with", "PRONTOPHOT"),
    ],
    "Sports & Activities": [
        ("starts_with", "ACROYOGA BRUSSELS"),
        ("starts_with", "TONKAR-WASH"),
        ("starts_with", "KINDERKISTE"),
        ("starts_with", "ABAJAM"),
        ("starts_with", "PAUL 28.01.2026"),
    ],
    "Bureaucracy": [
        ("starts_with", "APPPJO"),
    ],
    "Cash Withdrawals": [
        ("starts_with", "SB-AUSZAHLUNG"),
    ],
    "Tobacco & Misc": [
        ("starts_with", "TABAK"),
    ],
}

CONDITION_TYPE_MAP = {
    "starts_with": "description_starts",
    "contains":    "description_contains",
}

BUDGETS: dict[str, str] = {
    "Groceries":                      "Food",
    "Fresh Market & Butcher":         "Food",
    "Bakeries & Coffee":              "Food",
    "Restaurants & Cafes":            "Going Out",
    "Bars & Drinks":                  "Going Out",
    "Entertainment & Culture":        "Going Out",
    "Public Transport":               "Getting Around",
    "Fuel":                           "Getting Around",
    "Home & Hardware":                "Home",
    "Health":                         "Health & Wellbeing",
    "Sports & Activities":            "Health & Wellbeing",
    "Subscriptions — Infrastructure": "Subscriptions",
    "Subscriptions — Lifestyle":      "Subscriptions",
    "Travel & Accommodation":         "Travel",
}

BILLS = [
    {"name": "EDPNET",          "amount_min": "30",  "amount_max": "60",  "repeat_freq": "monthly"},
    {"name": "Proton",          "amount_min": "8",   "amount_max": "12",  "repeat_freq": "monthly"},
    {"name": "Reibert Energie", "amount_min": "75",  "amount_max": "85",  "repeat_freq": "monthly"},
    {"name": "Electricity",     "amount_min": "95",  "amount_max": "105", "repeat_freq": "monthly"},
    {"name": "OpenAI",          "amount_min": "20",  "amount_max": "25",  "repeat_freq": "monthly"},
    {"name": "Steam",           "amount_min": "3",   "amount_max": "30",  "repeat_freq": "monthly"},
    {"name": "NVIDIA",          "amount_min": "10",  "amount_max": "14",  "repeat_freq": "monthly"},
]


def api(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        f"{FIREFLY_URL}{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            return json.loads(body) if body.strip() else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} → {e.code}: {e.read().decode()[:300]}")


def get_all(path: str) -> list:
    results = []
    page = 1
    while True:
        data = api("GET", f"{path}?page={page}&limit=100")
        results.extend(data.get("data", []))
        meta = data.get("meta", {}).get("pagination", {})
        if page >= meta.get("total_pages", 1):
            break
        page += 1
    return results


def setup_budgets() -> None:
    existing = {b["attributes"]["name"] for b in get_all("/api/v1/budgets")}
    for budget_name in dict.fromkeys(BUDGETS.values()):
        if budget_name not in existing:
            api("POST", "/api/v1/budgets", {"name": budget_name, "active": True})
            print(f"  budget created: {budget_name}")
        else:
            print(f"  budget exists:  {budget_name}")


def setup_bills() -> None:
    existing = {b["attributes"]["name"] for b in get_all("/api/v1/bills")}
    for bill in BILLS:
        if bill["name"] not in existing:
            api("POST", "/api/v1/bills", {
                "name": bill["name"],
                "amount_min": bill["amount_min"],
                "amount_max": bill["amount_max"],
                "date": "2026-01-01",
                "repeat_freq": bill["repeat_freq"],
                "active": True,
                "currency_code": "EUR",
            })
            print(f"  bill created: {bill['name']}")
        else:
            print(f"  bill exists:  {bill['name']}")


def setup_categories() -> dict[str, str]:
    """Create categories, return name→id map."""
    existing = {c["attributes"]["name"]: c["id"] for c in get_all("/api/v1/categories")}
    result = {}
    for name in CATEGORIES:
        if name in existing:
            result[name] = existing[name]
            print(f"  category exists: {name}")
        else:
            resp = api("POST", "/api/v1/categories", {"name": name})
            result[name] = resp["data"]["id"]
            print(f"  category created: {name}")
    return result


def cleanup_stale_categories() -> None:
    """Delete categories no longer in CATEGORIES, clearing them from transactions first."""
    existing = {c["attributes"]["name"]: c["id"] for c in get_all("/api/v1/categories")}
    stale = {name: cid for name, cid in existing.items() if name not in CATEGORIES}
    if not stale:
        return
    for name, cid in stale.items():
        txns = get_all(f"/api/v1/categories/{cid}/transactions")
        for t in txns:
            group_id = t["id"]
            for split in t["attributes"]["transactions"]:
                if split.get("category_name") == name:
                    try:
                        api("PUT", f"/api/v1/transactions/{group_id}", {
                            "apply_rules": False,
                            "transactions": [{**split, "category_name": ""}],
                        })
                    except RuntimeError as e:
                        print(f"  warn: {e}")
        api("DELETE", f"/api/v1/categories/{cid}")
        print(f"  deleted stale category: {name} ({len(txns)} transactions cleared)")


def cleanup_stale_rule_groups() -> None:
    """Delete Auto: rule groups for categories no longer in CATEGORIES."""
    valid = {f"Auto: {name}" for name in CATEGORIES}
    for group in get_all("/api/v1/rule-groups"):
        title = group["attributes"]["title"]
        if title.startswith("Auto: ") and title not in valid:
            api("DELETE", f"/api/v1/rule-groups/{group['id']}")
            print(f"  deleted stale rule group: {title}")


def setup_rules(category_ids: dict[str, str]) -> list[str]:
    """Create rule groups and rules, return list of rule IDs."""
    existing_groups = {g["attributes"]["title"]: g["id"] for g in get_all("/api/v1/rule-groups")}
    rule_ids = []

    for category_name, conditions in CATEGORIES.items():
        group_title = f"Auto: {category_name}"

        if group_title in existing_groups:
            group_id = existing_groups[group_title]
            print(f"  rule group exists: {group_title}")
        else:
            resp = api("POST", "/api/v1/rule-groups", {"title": group_title, "active": True})
            group_id = resp["data"]["id"]
            print(f"  rule group created: {group_title}")

        existing_rules = {r["attributes"]["title"].upper() for r in get_all(f"/api/v1/rule-groups/{group_id}/rules")}

        for condition_type, value in conditions:
            rule_title = f"{value}"
            if rule_title.upper() in existing_rules:
                continue

            actions = [{"type": "set_category", "value": category_name}]
            if category_name in BUDGETS:
                actions.append({"type": "set_budget", "value": BUDGETS[category_name]})

            rule = {
                "title": rule_title,
                "rule_group_id": group_id,
                "trigger": "store-journal",
                "active": True,
                "strict": True,
                "stop_processing": False,
                "triggers": [
                    {"type": CONDITION_TYPE_MAP[condition_type], "value": value, "stop_processing": False, "active": True},
                    {"type": "transaction_type", "value": "withdrawal", "stop_processing": False, "active": True},
                ],
                "actions": actions,
            }
            try:
                resp = api("POST", "/api/v1/rules", rule)
                rule_ids.append(resp["data"]["id"])
            except RuntimeError as e:
                if "422" in str(e) and "already in use" in str(e):
                    print(f"  warn: rule title '{rule_title}' already taken globally, skipping")
                else:
                    raise

    return rule_ids


def classify_with_llm(description: str) -> str | None:
    category_list = "\n".join(f"- {c}" for c in CATEGORIES)
    prompt = (
        "Classify this bank transaction into exactly one category. "
        "Reply with ONLY the category name, nothing else.\n\n"
        f"Categories:\n{category_list}\n\nTransaction: {description}"
    )
    body = json.dumps({"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            result = json.load(r).get("response", "").strip()
            return result if result in CATEGORIES else None
    except Exception:
        return None


def clear_transfer_categories():
    """Remove any category mistakenly set on transfer transactions (e.g. round-ups)."""
    print("\nClearing categories from transfers...")
    txns = get_all("/api/v1/accounts/1/transactions")
    cleared = 0
    for t in txns:
        group_id = t["id"]
        for split in t["attributes"]["transactions"]:
            if split.get("type") == "transfer" and split.get("category_name"):
                try:
                    api("PUT", f"/api/v1/transactions/{group_id}", {
                        "apply_rules": False,
                        "transactions": [{**split, "category_name": "", "category_id": None,
                                          "budget_name": "", "budget_id": None}],
                    })
                    cleared += 1
                except RuntimeError as e:
                    print(f"  warn: {e}")
    print(f"  cleared: {cleared}")


def apply_rules_retroactively(_rule_ids: list[str]):
    """Directly categorize existing transactions by matching description patterns."""
    print("\nApplying categories to existing transactions...")

    # Build normalized keyword lookup: (ctype, UPPERCASE_KEYWORD, category)
    lookup: list[tuple[str, str, str]] = [
        (ctype, value.upper(), category)
        for category, conditions in CATEGORIES.items()
        for ctype, value in conditions
    ]

    txns = get_all("/api/v1/accounts/1/transactions")
    updated = llm_updated = 0

    for t in txns:
        group_id = t["id"]
        for split in t["attributes"]["transactions"]:
            if split.get("category_name"):
                continue
            if split.get("type") != "withdrawal":
                continue

            desc_norm = normalize_desc(split.get("description") or "")

            # Pass 1: keyword match against normalized description
            via_llm = False
            matched = next(
                (cat for ctype, kw, cat in lookup
                 if (ctype == "starts_with" and desc_norm.startswith(kw))
                 or (ctype == "contains"    and kw in desc_norm)),
                None,
            )

            # Pass 2: LLM fallback
            if not matched:
                matched = classify_with_llm(desc_norm)
                if matched:
                    print(f"  LLM: {desc_norm[:60]} → {matched}")
                    via_llm = True

            if not matched:
                continue

            update = {**split, "category_name": matched}
            if matched in BUDGETS:
                update["budget_name"] = BUDGETS[matched]

            try:
                api("PUT", f"/api/v1/transactions/{group_id}", {
                    "apply_rules": False,
                    "transactions": [update],
                })
                if via_llm:
                    llm_updated += 1
                else:
                    updated += 1
            except RuntimeError as e:
                print(f"  warn: {e}")

    print(f"  categorized: {updated + llm_updated}  (keyword: {updated}  llm: {llm_updated})")


def show_uncategorized():
    """Print uncategorized withdrawal transactions grouped by description."""
    print("\nFetching uncategorized transactions...")
    txns = get_all("/api/v1/accounts/1/transactions")

    named = defaultdict(list)     # has an opponent name
    described = defaultdict(list) # no opponent name, group by description keywords

    for t in txns:
        for split in t["attributes"]["transactions"]:
            if not split.get("category_name") and split["type"] == "withdrawal":
                opponent = split.get("opposing_account_name") or ""
                desc = split.get("description") or ""
                amount = float(split["amount"])
                if opponent:
                    named[opponent].append(amount)
                else:
                    described[desc].append(amount)

    if not named and not described:
        print("  All withdrawal transactions are categorized!")
        return

    if named:
        print(f"\n{'Opponent name (unmatched)':<45} {'#':>4}  {'Total':>9}")
        print("-" * 62)
        for k, v in sorted(named.items(), key=lambda x: sum(x[1]), reverse=True):
            print(f"{k:<45} {len(v):>4}  {sum(v):>9.2f}")

    if described:
        print(f"\n{'Description (no partner name)':<65} {'#':>4}  {'Total':>9}")
        print("-" * 82)
        for k, v in sorted(described.items(), key=lambda x: sum(x[1]), reverse=True):
            print(f"{k[:65]:<65} {len(v):>4}  {sum(v):>9.2f}")


if __name__ == "__main__":
    if not TOKEN:
        print("Set FIREFLY_ACCESS_TOKEN")
        sys.exit(1)

    print("=== Categories ===")
    category_ids = setup_categories()
    cleanup_stale_categories()

    print("\n=== Budgets ===")
    setup_budgets()

    print("\n=== Bills ===")
    setup_bills()

    print("\n=== Rules ===")
    cleanup_stale_rule_groups()
    new_rule_ids = setup_rules(category_ids)
    print(f"\n  {len(new_rule_ids)} new rules created")

    clear_transfer_categories()
    apply_rules_retroactively(new_rule_ids)

    show_uncategorized()
