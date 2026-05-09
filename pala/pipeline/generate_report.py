"""
Generate a self-contained HTML monthly spending report from Firefly III.
Defaults to previous month. Override with: REPORT_MONTH=2026-03 python3 generate_report.py
"""
import json
import os
import sys
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from setup_categories import BUDGETS

FIREFLY_URL = "http://localhost:7076"
TOKEN = os.environ.get("FIREFLY_ACCESS_TOKEN", "")
REPORTS_DIR = Path(__file__).parent / "reports"

BUDGETS_ORDER = ["Food", "Going Out", "Getting Around", "Home", "Health & Wellbeing", "Subscriptions", "Travel"]

# ── Pala design system ─────────────────────────────────────────────────────────
# Tokens + components inlined so the report opens as a single self-contained file.
_PALA_CSS = """\
@import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,300;1,400;1,500;1,600;1,700;1,800&display=swap');

:root {
  --pala-blue:        #073363;
  --pala-blue-700:    #04244A;
  --pala-blue-500:    #0A4485;
  --pala-blue-300:    #2D63A1;
  --pala-blue-100:    rgba(108, 197, 154, 0.12);
  --pala-mint:        #149966;
  --pala-mint-bright: #6CC59A;
  --pala-mint-ink:    #B6E5C9;
  --pala-mint-100:    rgba(20, 153, 102, 0.18);
  --paper:            #0D1B30;
  --paper-warm:       #112340;
  --paper-cool:       #08152A;
  --ink:              #E8ECF3;
  --ink-muted:        #B6C0D2;
  --ink-soft:         #8896AE;
  --ink-faint:        #5C6A82;
  --rule:             rgba(255, 255, 255, 0.10);
  --rule-strong:      rgba(255, 255, 255, 0.20);
  --rule-hair:        rgba(255, 255, 255, 0.05);
  --status-ok:        #6CC59A;
  --status-warn:      #E0A24A;
  --status-alarm:     #E16C6C;
  --on-blue:          #FFFFFF;
  --on-blue-soft:     rgba(255, 255, 255, 0.78);
  --on-blue-faint:    rgba(255, 255, 255, 0.55);
  --on-blue-rule:     rgba(255, 255, 255, 0.18);
  --font-display:     "Crimson Pro", Georgia, serif;
  --font-body:        "Crimson Pro", Georgia, serif;
  --font-tag:         "Crimson Pro", Georgia, serif;
  --font-data:        ui-monospace, "SF Mono", Menlo, "Cascadia Code", Consolas, monospace;
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;
  --radius-sm: 2px; --radius-md: 4px;
  --shadow-card: 0 1px 2px rgba(0,0,0,.30), 0 4px 12px rgba(0,0,0,.20);
  --track-tag:   0.18em;
  --track-tight: 0.12em;
  --track-disp:  -0.02em;
  color-scheme: dark;
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }

/* ── Shell ── */
body {
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink);
  background: var(--paper-cool);
  font-size-adjust: 0.514;
  -webkit-font-smoothing: antialiased;
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
}

/* ── Rail ── */
.rail {
  background: var(--pala-blue);
  padding: var(--sp-6) var(--sp-5);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
  min-height: 100vh;
}
.rail::after {
  content: "";
  position: absolute;
  top: var(--sp-6); right: 0;
  width: 4px; height: 56px;
  background: var(--pala-mint-bright);
}
.rail__brand {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
  letter-spacing: var(--track-disp);
  color: var(--on-blue);
}
.rail__sub {
  font-style: italic;
  font-weight: 500;
  font-size: 13px;
  color: var(--pala-mint-bright);
  margin-top: 3px;
}
.rail__section-label {
  font-family: var(--font-tag);
  font-weight: 600;
  font-size: 10px;
  letter-spacing: var(--track-tag);
  text-transform: uppercase;
  color: var(--pala-mint-bright);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--on-blue-rule);
  margin-bottom: var(--sp-3);
}
.rail-stat { padding: var(--sp-2) 0; }
.rail-stat__name {
  font-size: 12px;
  color: var(--on-blue-soft);
  margin-bottom: 2px;
}
.rail-stat__value {
  font-family: var(--font-data);
  font-size: 17px;
  font-weight: 600;
  color: var(--on-blue);
  font-feature-settings: "tnum" 1;
  letter-spacing: -0.02em;
}
.rail-stat__value--mint  { color: var(--pala-mint-bright); }
.rail-stat__value--alarm { color: var(--status-alarm); }
.rail__footer {
  margin-top: auto;
  font-family: var(--font-tag);
  font-size: 10px;
  letter-spacing: var(--track-tag);
  text-transform: uppercase;
  color: var(--on-blue-faint);
}

/* ── Main ── */
main { padding: var(--sp-6) var(--sp-7); }
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--sp-6);
  padding-bottom: var(--sp-5);
  border-bottom: 1px solid var(--rule);
}
.page-tag {
  font-family: var(--font-tag);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: var(--track-tag);
  text-transform: uppercase;
  color: var(--pala-mint-bright);
  display: block;
  margin-bottom: var(--sp-2);
}
.page-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 30px;
  line-height: 1.1;
  letter-spacing: var(--track-disp);
  color: var(--ink);
}
.page-head-meta {
  font-family: var(--font-tag);
  font-size: 11px;
  letter-spacing: var(--track-tag);
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-top: var(--sp-2);
}

/* ── Stats strip ── */
.stats-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-4);
  margin-bottom: var(--sp-6);
}
.stat-card {
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  padding: var(--sp-5);
  box-shadow: var(--shadow-card);
}
.stat-card__label {
  font-family: var(--font-tag);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: var(--track-tag);
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: var(--sp-2);
}
.stat-card__value {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 36px;
  line-height: 1;
  letter-spacing: var(--track-disp);
  color: var(--ink);
  font-feature-settings: "tnum" 1, "lnum" 1;
}
.stat-card__value--mint  { color: var(--pala-mint-bright); }
.stat-card__value--alarm { color: var(--status-alarm); }

/* ── Panel cards ── */
.panel {
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--sp-5);
  overflow: hidden;
}
.panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  border-bottom: 1px solid var(--rule);
}
.panel__title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.panel__meta {
  font-family: var(--font-tag);
  font-weight: 500;
  font-size: 11px;
  letter-spacing: var(--track-tag);
  text-transform: uppercase;
  color: var(--ink-faint);
}

/* ── Table ── */
.pala-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: 14px;
}
.pala-table thead th {
  font-family: var(--font-tag);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: var(--track-tag);
  text-transform: uppercase;
  color: var(--ink-faint);
  text-align: left;
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--rule-strong);
  background: var(--paper-cool);
}
.pala-table thead th.r { text-align: right; }
.pala-table tbody td {
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--rule-hair);
  color: var(--ink-muted);
  vertical-align: middle;
}
.pala-table tbody tr:last-child td { border-bottom: none; }
.pala-table tbody tr:hover td { background: var(--paper-warm); color: var(--ink); }
.td-data {
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--ink);
  font-feature-settings: "tnum" 1;
  text-align: right;
  white-space: nowrap;
}
.td-dim { color: var(--ink-soft); font-size: 13px; }
.td-budget {
  font-family: var(--font-tag);
  font-size: 10px;
  letter-spacing: var(--track-tight);
  text-transform: uppercase;
  color: var(--ink-faint);
}

/* ── Budget progress ── */
.progress-cell { min-width: 100px; }
.budget-bar {
  height: 3px;
  background: var(--rule-strong);
  border-radius: 2px;
  margin-bottom: 5px;
}
.budget-bar__fill { height: 3px; border-radius: 2px; }
.pill {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-tag);
  font-weight: 600;
  font-size: 10px;
  letter-spacing: var(--track-tight);
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
}
.pill--ok    { background: rgba(20,153,102,.18); color: var(--pala-mint-bright); }
.pill--warn  { background: rgba(224,162,74,.16); color: #E5B574; }
.pill--alarm { background: rgba(225,108,108,.16); color: #ED9A9A; }
.pill--none  { background: var(--rule); color: var(--ink-faint); }
"""


# ── API helpers ────────────────────────────────────────────────────────────────

def api(path: str) -> dict | list:
    req = urllib.request.Request(
        f"{FIREFLY_URL}{path}",
        headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def get_all(path: str) -> list:
    results, page = [], 1
    sep = "&" if "?" in path else "?"
    while True:
        data = api(f"{path}{sep}page={page}&limit=100")
        results.extend(data.get("data", []))
        meta = data.get("meta", {}).get("pagination", {})
        if page >= meta.get("total_pages", 1):
            break
        page += 1
    return results


def month_range(year: int, month: int) -> tuple[str, str]:
    start = date(year, month, 1)
    end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)
    return start.isoformat(), end.isoformat()


# ── Data fetching ──────────────────────────────────────────────────────────────

def fetch_data(year: int, month: int) -> dict:
    start, end = month_range(year, month)

    # Totals — one request, pre-summed by Firefly
    summary = api(f"/api/v1/summary/basic?start={start}&end={end}")
    total_out = abs(float(next(v["monetary_value"] for k, v in summary.items() if k.startswith("spent-in-"))))
    total_in  = abs(float(next(v["monetary_value"] for k, v in summary.items() if k.startswith("earned-in-"))))

    # Category spending — pre-summed, difference_float is negative
    by_category: dict[str, float] = {
        c["name"]: abs(c["difference_float"])
        for c in api(f"/api/v1/insight/expense/category?start={start}&end={end}")
    }

    # Budget spending — derived from category totals + BUDGETS mapping
    # (insight/expense/budget is always empty for API-imported transactions)
    by_budget: dict[str, float] = defaultdict(float)
    for cat, amt in by_category.items():
        if cat in BUDGETS:
            by_budget[BUDGETS[cat]] += amt

    # Budget limits — requires per-budget fetch (no insight endpoint for this)
    budgets_raw = get_all("/api/v1/budgets")
    budget_limits: dict[str, float] = {}
    for b in budgets_raw:
        bid = b["id"]
        limits = get_all(f"/api/v1/budgets/{bid}/limits?start={start}&end={end}")
        if limits:
            budget_limits[b["attributes"]["name"]] = float(limits[0]["attributes"]["amount"])

    # Merchant spending — expense accounts, pre-summed
    by_merchant: dict[str, float] = {
        m["name"]: abs(m["difference_float"])
        for m in api(f"/api/v1/insight/expense/expense?start={start}&end={end}")
    }

    # Account balances
    balances: dict[str, float] = {
        a["attributes"]["name"]: float(a["attributes"]["current_balance"])
        for a in api("/api/v1/accounts?type=asset").get("data", [])
    }

    return {
        "year": year, "month": month, "start": start, "end": end,
        "total_in": total_in, "total_out": total_out,
        "by_category": by_category,
        "by_budget": dict(by_budget),
        "budget_limits": budget_limits,
        "by_merchant": by_merchant,
        "balances": balances,
    }


# ── Rendering helpers ──────────────────────────────────────────────────────────

def fmt(amount: float) -> str:
    return f"€{amount:,.2f}"


def pct_bar(spent: float, limit: float) -> str:
    if not limit:
        return '<span class="pill pill--none">no limit</span>'
    pct = min(spent / limit * 100, 100)
    if pct >= 90:
        bar_color, pill_cls = "var(--status-alarm)", "pill--alarm"
    elif pct >= 70:
        bar_color, pill_cls = "var(--status-warn)", "pill--warn"
    else:
        bar_color, pill_cls = "var(--pala-mint-bright)", "pill--ok"
    return (
        f'<div class="budget-bar"><div class="budget-bar__fill" style="width:{pct:.0f}%;background:{bar_color}"></div></div>'
        f'<span class="pill {pill_cls}">{pct:.0f} %</span>'
    )


def render_html(d: dict) -> str:
    month_name = datetime(d["year"], d["month"], 1).strftime("%B %Y")
    net = d["total_in"] - d["total_out"]
    net_class = "stat-card__value--mint" if net >= 0 else "stat-card__value--alarm"

    # Rail: account balances
    balance_rail = ""
    for name, bal in d["balances"].items():
        bal_class = "rail-stat__value--mint" if bal >= 0 else "rail-stat__value--alarm"
        balance_rail += (
            f'<div class="rail-stat">'
            f'<div class="rail-stat__name">{name}</div>'
            f'<div class="rail-stat__value {bal_class}">{fmt(bal)}</div>'
            f'</div>'
        )

    # Rail: period summary
    net_rail_class = "rail-stat__value--mint" if net >= 0 else "rail-stat__value--alarm"
    period_rail = (
        f'<div class="rail-stat">'
        f'<div class="rail-stat__name">Income</div>'
        f'<div class="rail-stat__value rail-stat__value--mint">{fmt(d["total_in"])}</div>'
        f'</div>'
        f'<div class="rail-stat">'
        f'<div class="rail-stat__name">Expenses</div>'
        f'<div class="rail-stat__value">{fmt(d["total_out"])}</div>'
        f'</div>'
        f'<div class="rail-stat">'
        f'<div class="rail-stat__name">Net</div>'
        f'<div class="rail-stat__value {net_rail_class}">{fmt(net)}</div>'
        f'</div>'
    )

    # Budget rows
    budget_rows = ""
    for b in BUDGETS_ORDER:
        spent = d["by_budget"].get(b, 0)
        limit = d["budget_limits"].get(b, 0)
        limit_str = f'<span class="td-data">{fmt(limit)}</span>' if limit else '<span class="td-dim">—</span>'
        bar = pct_bar(spent, limit)
        budget_rows += (
            f"<tr>"
            f"<td>{b}</td>"
            f'<td class="td-data">{fmt(spent)}</td>'
            f"<td>{limit_str}</td>"
            f'<td class="progress-cell">{bar}</td>'
            f"</tr>"
        )

    # Category rows grouped by budget
    cat_rows = ""
    for b in BUDGETS_ORDER + ["(none)"]:
        cats = sorted(
            [(cat, amt) for cat, amt in d["by_category"].items()
             if (BUDGETS.get(cat, "(none)") == b)],
            key=lambda x: -x[1],
        )
        for cat, amt in cats:
            budget_label = b if b != "(none)" else ""
            cat_rows += (
                f"<tr>"
                f"<td>{cat}</td>"
                f'<td class="td-budget">{budget_label}</td>'
                f'<td class="td-data">{fmt(amt)}</td>'
                f"</tr>"
            )
    if d["by_category"].get("Uncategorized"):
        cat_rows += (
            f"<tr>"
            f"<td>Uncategorized</td>"
            f"<td></td>"
            f'<td class="td-data">{fmt(d["by_category"]["Uncategorized"])}</td>'
            f"</tr>"
        )

    # Top merchants
    top_merchants = sorted(d["by_merchant"].items(), key=lambda x: -x[1])[:10]
    merchant_rows = "".join(
        f"<tr><td>{m[:50]}</td><td class='td-data'>{fmt(a)}</td></tr>"
        for m, a in top_merchants
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monthly Report — {month_name}</title>
<style>
{_PALA_CSS}
</style>
</head>
<body>

<aside class="rail">
  <div>
    <div class="rail__brand">Pala</div>
    <div class="rail__sub">Personal finance</div>
  </div>

  <div>
    <div class="rail__section-label">Period</div>
    <div class="rail-stat">
      <div class="rail-stat__name">{month_name}</div>
      <div class="rail-stat__value" style="font-size:12px;font-family:var(--font-data);color:var(--on-blue-soft);">{d["start"]} – {d["end"]}</div>
    </div>
  </div>

  <div>
    <div class="rail__section-label">Summary</div>
    {period_rail}
  </div>

  <div>
    <div class="rail__section-label">Balances</div>
    {balance_rail}
  </div>

  <div class="rail__footer">Generated {date.today().isoformat()}</div>
</aside>

<main>
  <header class="page-head">
    <div>
      <span class="page-tag">Finance / Monthly Report</span>
      <h1 class="page-title">{month_name}</h1>
    </div>
  </header>

  <div class="stats-strip">
    <div class="stat-card">
      <div class="stat-card__label">Income</div>
      <div class="stat-card__value stat-card__value--mint">{fmt(d["total_in"])}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Expenses</div>
      <div class="stat-card__value stat-card__value--alarm">{fmt(d["total_out"])}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Net</div>
      <div class="stat-card__value {net_class}">{fmt(net)}</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel__head">
      <h2 class="panel__title">Budgets</h2>
      <span class="panel__meta">Monthly envelopes</span>
    </div>
    <table class="pala-table">
      <thead>
        <tr>
          <th>Budget</th>
          <th class="r">Spent</th>
          <th class="r">Limit</th>
          <th>Progress</th>
        </tr>
      </thead>
      <tbody>
        {budget_rows}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <div class="panel__head">
      <h2 class="panel__title">Categories</h2>
    </div>
    <table class="pala-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Budget</th>
          <th class="r">Spent</th>
        </tr>
      </thead>
      <tbody>
        {cat_rows}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <div class="panel__head">
      <h2 class="panel__title">Top merchants</h2>
      <span class="panel__meta">by total spend</span>
    </div>
    <table class="pala-table">
      <thead>
        <tr>
          <th>Merchant</th>
          <th class="r">Total</th>
        </tr>
      </thead>
      <tbody>
        {merchant_rows}
      </tbody>
    </table>
  </div>

</main>
</body>
</html>"""


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not TOKEN:
        print("Set FIREFLY_ACCESS_TOKEN")
        sys.exit(1)

    override = os.environ.get("REPORT_MONTH")
    if override:
        year, month = int(override[:4]), int(override[5:7])
    else:
        today = date.today()
        month = today.month - 1 or 12
        year  = today.year if today.month > 1 else today.year - 1

    print(f"Generating report for {year}-{month:02d}...")
    data = fetch_data(year, month)

    REPORTS_DIR.mkdir(exist_ok=True)
    out = REPORTS_DIR / f"{year}-{month:02d}.html"
    out.write_text(render_html(data), encoding="utf-8")
    print(f"Report saved: {out}")