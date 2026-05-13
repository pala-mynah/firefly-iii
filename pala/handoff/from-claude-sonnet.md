# Handoff note — from Claude Sonnet

## What just landed (branch: `pala-js-refactor`)

The JS module refactor is complete and pushed to GitHub.

### What changed

The 3 monolithic `pala-live*.js` files (2,994 lines) are **deleted** and replaced
with 12 domain-specific modules:

| File | Responsibility |
|------|---------------|
| `pala-api.js` | Shared core — exposes `window.Pala` namespace |
| `pala-accounts.js` | Account list + account detail |
| `pala-bills.js` | Bills list + bill detail |
| `pala-budgets.js` | Budgets list + budget detail + historic chart |
| `pala-categories.js` | Categories list + category detail |
| `pala-tags.js` | Tags list + tag detail |
| `pala-transactions.js` | Transactions list + detail + categorize modal |
| `pala-piggy.js` | Piggy banks list + piggy detail |
| `pala-recurring.js` | Recurrences list + recurring detail |
| `pala-rules.js` | Rules list + rule detail + prefill form |
| `pala-misc.js` | Reports, Search, Preferences, Profile |
| `pala-dashboard.js` | Dashboard hydration + live data layer |

Every HTML page now loads in this order:
```
bootstrap → pala-shell.js → pala-ui.js → pala-api.js → [domain].js
```

All inline sidebar IIFEs have been removed from HTML pages.

### `window.Pala` namespace (from pala-api.js)

```js
window.Pala = {
  tok, base, fbase, api, esc, fmt, dat, qs, slug,
  $k, setTbody, setTitle, setFooter, loadingRow, errorRow, emptyRow,
  periodRange, wirePeriodChrome,
}
```

Each domain file destructures what it needs from `window.Pala`.

### What still needs doing

1. **Testing** — smoke-test each page in the browser. The test files are:
   - `pala-test.html` — iframe-based smoke tests
   - `pala-api-test.html` — API endpoint tests (untracked)

2. **Merge to claude-design** — once tests pass, merge `pala-js-refactor` into
   `claude-design`.

3. **"New X" buttons** — all list-page add/edit/delete buttons link to `#`.
   Needs wiring to actual Firefly native UI URLs (using `fbase()`).

4. **Profile page dead links** — change email/password, MFA, logout other
   sessions, delete account links currently go nowhere.

5. **Fix list-page detail links** — piggy list links to `piggy-show.html`,
   recurring list links to `recurring-show.html`, rules list links to
   `rule-show.html`. These were `href="#"` in the old code; I updated the
   anchor `href` in the new domain files.

### Previous fix (still applies)

The `/api/v1/recurrences` 500 error was fixed in
`app/Support/JsonApi/Enrichments/RecurringEnrichment.php` (three patches for
soft-deleted accounts, empty transaction arrays, and null currencies).

---

If you want me to do anything else, write to `handoff/from-claude-design.md`.

— Claude Sonnet
