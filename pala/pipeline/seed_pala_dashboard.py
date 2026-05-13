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

ASSET_ACCOUNT_ID = "1"        # AT80 George (Erste Bank) — reassigned by create_accounts()
SAVINGS_ACCOUNT_ID = "2"      # AT53 Erste Sparziel (round-ups)  — reassigned by create_accounts()
CURRENCY = "EUR"
MOCK_TAG = "pala-mock"        # every seeded tx carries this tag for safe cleanup
RNG = random.Random(20260111)  # deterministic mocks

MOCK_ACCOUNTS = [
    {
        "name": "Checking · George",
        "type": "asset",
        "account_role": "defaultAsset",
        "currency_code": CURRENCY,
        "opening_balance": "500.00",
        "opening_balance_date": "2024-01-01",
        "notes": "Mock account seeded by Pala dashboard.",
    },
    {
        "name": "Savings · Sparziel",
        "type": "asset",
        "account_role": "savingAsset",
        "currency_code": CURRENCY,
        "opening_balance": "3000.00",
        "opening_balance_date": "2024-01-01",
        "notes": "Mock account seeded by Pala dashboard.",
    },
]


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
# bills (recurring subscriptions) and piggy-banks (savings goals)
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class Bill:
    name: str
    amount: float
    repeat: str               # 'monthly' | 'quarterly' | 'yearly'
    days_ago_last_paid: int   # so Firefly computes next_expected_match correctly
    notes: str = "Seeded by Pala dashboard."

# Tuned so next_expected_match lands across the 30-day widget window with a
# realistic spread: a couple overdue-ish, a couple within 7 days, the rest neutral.
BILLS: list[Bill] = [
    Bill("Magenta Internet",   39.90, "monthly",  32),  # ~2 days overdue
    Bill("Spotify",             10.99, "monthly",  28),  # due in ~2 days
    Bill("Patreon Pledges",      5.00, "monthly",  25),  # due in ~5 days
    Bill("Netflix",             17.99, "monthly",  18),  # due in ~12 days
    Bill("A1 Telekom Mobile",   34.90, "monthly",   8),  # due in ~22 days
    Bill("ÖBB Klimaticket",   1095.00, "yearly",  340),  # due in ~25 days (annual)
]

@dataclass
class Piggy:
    name: str
    target: float
    current: float
    target_date: str | None   # ISO date or None
    notes: str = "Seeded by Pala dashboard."

PIGGIES: list[Piggy] = [
    Piggy("Iceland trip 2026",  1500.0,  420.0, target_date="2026-08-15"),
    Piggy("Emergency fund",     3000.0, 1100.0, target_date="2030-01-01"),  # placeholder — widget treats far-future as "no target"
    Piggy("New laptop",         1800.0,  650.0, target_date="2026-12-01"),
]

# Uncategorised withdrawals — populate the "Needs attention" dashboard widget.
UNCATEGORISED_MOCKS = [
    ("Unknown merchant",       18.40),
    ("Reimburse: lunch",       12.00),
    ("Misc · receipt missing",  6.50),
    ("VENDOR #4592",           24.80),
]

@dataclass
class Rule:
    title: str
    description: str
    trigger_type: str        # 'description_contains', 'description_starts', 'amount_more', ...
    trigger_value: str
    actions: list[tuple[str, str]]  # [(action_type, value)]
    strict: bool = True
    stop_processing: bool = False

# Rules that auto-categorise the mock transactions if they came in fresh.
RULES: list[Rule] = [
    Rule("Auto-tag groceries · BILLA",   "Anything from BILLA → Groceries",
         "description_contains", "BILLA",
         [("set_category", "Supermarket"), ("set_budget", "Groceries")]),
    Rule("Auto-tag groceries · HOFER",   "Anything from HOFER → Groceries",
         "description_contains", "HOFER",
         [("set_category", "Supermarket"), ("set_budget", "Groceries")]),
    Rule("Auto-tag subs · Netflix",      "Netflix → Subs Lifestyle",
         "description_contains", "Netflix",
         [("set_category", "Subs — Lifestyle"), ("set_budget", "Subscription")]),
    Rule("Auto-tag subs · Spotify",      "Spotify → Subs Lifestyle",
         "description_contains", "Spotify",
         [("set_category", "Subs — Lifestyle"), ("set_budget", "Subscription")]),
    Rule("Auto-tag transport · ÖBB",     "ÖBB → Public Transport",
         "description_contains", "ÖBB",
         [("set_category", "Public Transport"), ("set_budget", "Transport")]),
    Rule("Auto-tag ATM withdrawals",     "ATM Withdrawal → Cash Withdrawals",
         "description_starts", "ATM Withdrawal",
         [("set_category", "Cash Withdrawals"), ("add_tag", "cash")],
         strict=True, stop_processing=True),
]

@dataclass
class Recurring:
    title: str
    amount: float
    description: str
    destination: str   # expense-account name; auto-created on first POST
    category: str
    budget: str
    repeat_type: str   # 'monthly' | 'weekly' | 'yearly'
    moment: str = "1"  # day-of-month for monthly
    days_ahead: int = 5  # first_date = today + N days

RECURRING: list[Recurring] = [
    Recurring("Monthly · Gym membership",  29.90, "John Harris Fitness",  "John Harris Fitness", "Sports & Activities", "Lifestyle",   "monthly", "5",  3),
    Recurring("Monthly · Apartment cleaning", 60.00, "Reinigung Hausverwaltung", "Putzfirma",      "Home & Hardware",     "Living",      "monthly", "10", 7),
    Recurring("Weekly · Vegetable box",    18.50, "Bio-Kistl Wochenlieferung", "Adamah BioHof", "Fresh Market & Butcher", "Groceries",   "weekly",  "3",  2),
]


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
    # Bulk destroy via /data/destroy is orders of magnitude faster than per-row DELETE.
    # Note: /data/destroy doesn't accept rule_groups — drop those one-by-one after rules.
    for obj in ("rules", "budgets", "categories"):
        api("DELETE", f"/data/destroy?objects={obj}&confirm=Are%20you%20sure%3F")
    # Rule-groups are now empty; delete them individually.
    for g in paged("/rule-groups"):
        api("DELETE", f"/rule-groups/{g['id']}")
    print("  ✓ metadata wiped")


def wipe_transactions() -> None:
    print("→ wiping transactions (bulk)…")
    api("DELETE", "/data/destroy?objects=transactions&confirm=Are%20you%20sure%3F")
    print("  ✓ transactions deleted")


def wipe_accounts() -> None:
    """Wipe ALL accounts (asset, expense, revenue, liability). Cascades to any tx."""
    print("→ wiping accounts (bulk)…")
    api("DELETE", "/data/destroy?objects=accounts&confirm=Are%20you%20sure%3F")
    print("  ✓ accounts deleted")


def create_accounts() -> None:
    """Create the 2 mock asset accounts and record their IDs into module globals."""
    global ASSET_ACCOUNT_ID, SAVINGS_ACCOUNT_ID
    print(f"→ creating {len(MOCK_ACCOUNTS)} asset accounts…")
    ids = []
    for spec in MOCK_ACCOUNTS:
        r = api("POST", "/accounts", json=spec)
        ids.append(r["data"]["id"])
        print(f"  ✓ {spec['name']:<25} id={r['data']['id']}")
    ASSET_ACCOUNT_ID, SAVINGS_ACCOUNT_ID = ids[0], ids[1]


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
                     budget_id: str | None, category_id: str | None) -> None:
    tx = {
        "type": "withdrawal",
        "date": when.isoformat(),
        "amount": f"{amount:.2f}",
        "description": description,
        "source_id": ASSET_ACCOUNT_ID,
        "destination_name": description.split()[0],  # auto-creates expense account
        "currency_code": CURRENCY,
        "tags": [MOCK_TAG],
    }
    if category_id:
        tx["category_id"] = category_id
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
        "tags": [MOCK_TAG],
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
        "tags": [MOCK_TAG],
    }], "apply_rules": False})


def clean_mocks() -> None:
    """Delete every transaction tagged MOCK_TAG."""
    print(f"→ cleaning transactions tagged '{MOCK_TAG}'…")
    n = 0
    try:
        # /tags/{tag}/transactions accepts the tag name directly
        for t in paged(f"/tags/{MOCK_TAG}/transactions"):
            api("DELETE", f"/transactions/{t['id']}")
            n += 1
    except SystemExit:
        # tag doesn't exist — nothing to clean
        print(f"  ✓ tag '{MOCK_TAG}' not found, nothing to delete")
        return
    print(f"  ✓ {n} mock transactions deleted")
    # also drop the tag itself if empty
    try:
        api("DELETE", f"/tags/{MOCK_TAG}")
        print(f"  ✓ tag '{MOCK_TAG}' removed")
    except SystemExit:
        pass


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

    # Uncategorised mocks — only in the current month so they surface in the
    # dashboard "Needs attention" widget, which scopes to the selected period.
    cur_first, cur_last = months[-1]
    hi = min(cur_last.day, today.day)
    lo = max(1, hi - 14)
    for desc, amt in UNCATEGORISED_MOCKS:
        day = RNG.randint(lo, hi)
        when = date(cur_first.year, cur_first.month, day)
        store_withdrawal(when, amt, desc, budget_id=None, category_id=None)
        tx_count += 1

    print(f"  ✓ {tx_count} mock transactions created")


# ────────────────────────────────────────────────────────────────────────────
# bills + piggy-banks
# ────────────────────────────────────────────────────────────────────────────

def wipe_bills() -> None:
    print("→ wiping bills…")
    for b in paged("/bills"):
        api("DELETE", f"/bills/{b['id']}")
    print("  ✓ bills deleted")


def wipe_piggies() -> None:
    print("→ wiping piggy-banks…")
    for p in paged("/piggy-banks"):
        api("DELETE", f"/piggy-banks/{p['id']}")
    print("  ✓ piggy-banks deleted")


def create_bills() -> None:
    today = date.today()
    print(f"→ creating {len(BILLS)} bills…")
    for b in BILLS:
        last_paid = today - timedelta(days=b.days_ago_last_paid)
        api("POST", "/bills", json={
            "name": b.name,
            "amount_min": f"{b.amount * 0.98:.2f}",
            "amount_max": f"{b.amount * 1.02:.2f}",
            "date": last_paid.isoformat(),
            "repeat_freq": b.repeat,
            "skip": 0,
            "active": True,
            "currency_code": CURRENCY,
            "notes": b.notes,
        })
        print(f"  ✓ {b.name:<22} €{b.amount:>6.2f} {b.repeat:<9} last paid {b.days_ago_last_paid}d ago")


def create_piggies() -> None:
    print(f"→ creating {len(PIGGIES)} piggy-banks on savings account {SAVINGS_ACCOUNT_ID}…")
    today = date.today()
    for i, p in enumerate(PIGGIES, start=1):
        payload = {
            "name": p.name,
            "accounts": [{"account_id": SAVINGS_ACCOUNT_ID, "current_amount": f"{p.current:.2f}"}],
            "target_amount": f"{p.target:.2f}",
            "start_date": today.isoformat(),
            "transaction_currency_code": CURRENCY,
            "order": i,
            "notes": p.notes,
        }
        if p.target_date:
            payload["target_date"] = p.target_date
        api("POST", "/piggy-banks", json=payload)
        pct = 100.0 * p.current / p.target if p.target else 0
        print(f"  ✓ {p.name:<22} €{p.current:>7.2f}/€{p.target:>7.2f} ({pct:>4.0f}%)")


def upsert_bills() -> None:
    existing = existing_index("/bills")
    if existing:
        print(f"✓ found {len(existing)} existing bills, skipping creation")
        return
    create_bills()


def upsert_piggies() -> None:
    existing = existing_index("/piggy-banks")
    if existing:
        print(f"✓ found {len(existing)} existing piggy-banks, skipping creation")
        return
    create_piggies()


# ─────────────────────────────────────────────────────────────────────────────
# rules + recurrences
# ─────────────────────────────────────────────────────────────────────────────

def ensure_pala_rule_group() -> str:
    """Find or create the 'Pala automations' rule group, return its id."""
    for g in paged("/rule-groups"):
        if g["attributes"]["title"] == "Pala automations":
            return g["id"]
    r = api("POST", "/rule-groups", json={
        "title": "Pala automations",
        "description": "Auto-classification rules seeded by Pala.",
        "active": True,
    })
    return r["data"]["id"]


def create_rules() -> None:
    print(f"→ creating {len(RULES)} rules…")
    gid = ensure_pala_rule_group()
    for i, rule in enumerate(RULES, start=1):
        actions = []
        for act_type, val in rule.actions:
            actions.append({
                "type": act_type, "value": val,
                "order": len(actions) + 1, "active": True, "stop_processing": False,
            })
        payload = {
            "title": rule.title,
            "description": rule.description,
            "rule_group_id": gid,
            "order": i,
            "trigger": "store-journal",
            "strict": rule.strict,
            "stop_processing": rule.stop_processing,
            "active": True,
            "triggers": [{
                "type": rule.trigger_type, "value": rule.trigger_value,
                "order": 1, "active": True, "stop_processing": False,
            }],
            "actions": actions,
        }
        api("POST", "/rules", json=payload)
        print(f"  ✓ {rule.title:<36} {rule.trigger_type}={rule.trigger_value!r}")


def upsert_rules() -> None:
    existing = [r for r in paged("/rules") if r["attributes"]["title"].startswith("Auto-tag")]
    if existing:
        print(f"✓ found {len(existing)} existing pala rules, skipping creation")
        return
    create_rules()


def wipe_rules() -> None:
    print("→ wiping rules + rule-groups…")
    api("DELETE", "/data/destroy?objects=rules&confirm=Are%20you%20sure%3F")
    for g in paged("/rule-groups"):
        api("DELETE", f"/rule-groups/{g['id']}")
    print("  ✓ rules + groups deleted")


def create_recurrences() -> None:
    print(f"→ creating {len(RECURRING)} recurring transactions…")
    today = date.today()
    # We need an expense account id to use as destination_id on the recurrence template.
    # Look up by name; auto-create if missing.
    cat_ids = existing_index("/categories")
    bud_ids = existing_index("/budgets")
    for rec in RECURRING:
        # Resolve destination expense account — fetch one page directly to
        # avoid paged()'s ?page= concat clashing with the ?type= query.
        dest_id = None
        accs = api("GET", "/accounts?type=expense&limit=200")
        for a in (accs.get("data") or []):
            if a["attributes"]["name"] == rec.destination:
                dest_id = a["id"]; break
        if not dest_id:
            ar = api("POST", "/accounts", json={
                "name": rec.destination, "type": "expense",
                "currency_code": CURRENCY,
            })
            dest_id = ar["data"]["id"]

        first = today + timedelta(days=rec.days_ahead)
        payload = {
            "type": "withdrawal",
            "title": rec.title,
            "first_date": first.isoformat(),
            "apply_rules": True,
            "active": True,
            "notes": "Seeded by Pala dashboard.",
            "nr_of_repetitions": 12,
            "repetitions": [{
                "type": rec.repeat_type,
                "moment": rec.moment,
                "skip": 0,
                "weekend": 1,
            }],
            "transactions": [{
                "amount": f"{rec.amount:.2f}",
                "description": rec.description,
                "currency_code": CURRENCY,
                "source_id": ASSET_ACCOUNT_ID,
                "destination_id": dest_id,
                "category_id": cat_ids.get(rec.category),
                "budget_id":   bud_ids.get(rec.budget),
                "tags": [MOCK_TAG],
            }],
        }
        api("POST", "/recurrences", json=payload)
        print(f"  ✓ {rec.title:<34} €{rec.amount:>6.2f} {rec.repeat_type:<7} → {rec.destination}")


def upsert_recurrences() -> None:
    existing = existing_index("/recurrences")
    if existing:
        print(f"✓ found {len(existing)} existing recurrences, skipping creation")
        return
    create_recurrences()


def wipe_recurrences() -> None:
    print("→ wiping recurrences…")
    # The /recurrences listing 500s if Firefly has a corrupt row from a failed
    # POST. Tolerate that — wipe_accounts() at the end of `reset` will cascade.
    try:
        for r in paged("/recurrences"):
            api("DELETE", f"/recurrences/{r['id']}", ok_status=(404, 422))
    except SystemExit as e:
        print(f"  ⚠ recurrence listing failed ({e}); will be cleared by account wipe.")
        return
    print("  ✓ recurrences deleted")


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

    p_clean = sub.add_parser("clean-mocks", help="Surgically delete every transaction tagged 'pala-mock'. Leaves real data intact.")

    args = ap.parse_args()

    print(f"Firefly URL: {FIREFLY_URL}")
    print("=" * 60)

    if args.mode == "meta":
        if args.wipe:
            wipe_recurrences()
            wipe_rules()
            wipe_bills()
            wipe_piggies()
            wipe_metadata()
        budget_ids = upsert_envelopes(history_months=args.history)
        upsert_categories()
        upsert_bills()
        upsert_piggies()
        upsert_rules()
        upsert_recurrences()
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
        wipe_recurrences()
        wipe_bills()
        wipe_piggies()
        wipe_metadata()  # also clears rules
        wipe_transactions()
        wipe_accounts()
        create_accounts()
        # Create bills + piggies BEFORE the expensive tx generation loop so schema
        # errors fail in seconds instead of after ~200 transaction POSTs.
        create_bills()
        create_piggies()
        budget_ids = create_envelopes(history_months=args.history)
        category_ids = create_categories()
        create_rules()
        generate_mocks(budget_ids, category_ids, months_back=args.months)
        create_recurrences()

    elif args.mode == "clean-mocks":
        clean_mocks()

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
