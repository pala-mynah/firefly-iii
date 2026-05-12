/* pala-live.js — live-data + interactions for every Pala page.
   Activates per page via body[data-page] (+ optional data-sub).

   Include once at the end of each page:
     <script src="pala-live.js"></script>
*/
(function () {
  const tok  = () => localStorage.getItem("pala_pat") || "";
  const base = () => (localStorage.getItem("pala_url") || location.origin).replace(/\/$/, "") + "/api/v1";

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => "€" + Number(n).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dat = (s) => s ? new Date(s).toLocaleDateString("en-GB") : "—";
  const qs  = (k) => new URLSearchParams(location.search).get(k);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function api(path, opts = {}) {
    const r = await fetch(base() + path, {
      headers: { Authorization: "Bearer " + tok(), Accept: "application/json", "Content-Type": "application/json" },
      ...opts,
    });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.status === 204 ? null : r.json();
  }

  const periodRange = () => {
    const t = new Date();
    return {
      start: new Date(t.getFullYear(), t.getMonth(), 1).toISOString().slice(0, 10),
      end:   new Date(t.getFullYear(), t.getMonth() + 1, 0).toISOString().slice(0, 10),
    };
  };

  const setTbody  = (html) => { const tb = document.querySelector(".card .table tbody"); if (tb) tb.innerHTML = html; };
  const setTitle  = (txt)  => { const el = document.querySelector(".card-header .card-title"); if (el) el.textContent = txt; };
  const setFooter = (html) => { const f = document.querySelector(".card-footer"); if (f) f.innerHTML = html; };
  const loadingRow = (cols) => `<tr><td colspan="${cols}" class="text-muted p-3">Loading…</td></tr>`;
  const errorRow   = (cols, e) => `<tr><td colspan="${cols}" class="text-danger p-3">Failed: ${esc(e.message)}</td></tr>`;
  const emptyRow   = (cols, msg) => `<tr><td colspan="${cols}" class="text-muted p-3">${msg}</td></tr>`;

  /* ─── Accounts list (?type=asset|expense|revenue|liabilities) ──────────── */
  async function pageAccounts() {
    if (qs("id")) return pageAccountShow();
    const type = qs("type") || "asset";
    const TITLES = { asset: "Asset accounts", expense: "Expense accounts", revenue: "Revenue accounts", liabilities: "Liabilities" };
    document.title = (TITLES[type] || "Accounts") + " — Firefly III · Pala";
    setTitle(TITLES[type] || "Accounts");
    setTbody(loadingRow(5));
    try {
      const res = await api(`/accounts?type=${type}`);
      if (!res.data.length) return setTbody(emptyRow(5, `No ${type} accounts yet.`));
      setTbody(res.data.map((a) => {
        const at = a.attributes, bal = parseFloat(at.current_balance || 0);
        const cls = bal >= 0 ? "text-success" : "text-danger";
        return `<tr>
          <td><div class="btn-group btn-group-sm"><a href="#" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-pencil fa-fw"></i></a></div></td>
          <td><a href="account-show.html?id=${a.id}">${esc(at.name)}</a>${at.iban ? `<small class="text-muted d-block">${esc(at.iban)}</small>` : ""}</td>
          <td class="text-end ${cls} text-nowrap">${fmt(bal)}</td>
          <td class="text-end d-none d-md-table-cell text-muted">—</td>
          <td class="d-none d-lg-table-cell text-muted small">${dat(at.last_activity)}</td>
        </tr>`;
      }).join(""));
      const total = res.data.reduce((a, x) => a + parseFloat(x.attributes.current_balance || 0), 0);
      setFooter(`<span>${res.data.length} accounts</span><span>Total: <span class="${total >= 0 ? "text-success" : "text-danger"}">${fmt(total)}</span></span>`);
    } catch (e) { setTbody(errorRow(5, e)); }
  }

  /* ─── Account detail (?id=N) ───────────────────────────────────────────── */
  async function pageAccountShow() {
    const id = qs("id");
    if (!id) return;
    try {
      const acc = (await api(`/accounts/${id}`)).data;
      const at = acc.attributes;
      setTitle(at.name);
      document.title = at.name + " — Firefly III · Pala";
      const meta = document.querySelector(".card-body table tbody");
      if (meta) meta.innerHTML = `
        <tr><th>IBAN</th><td>${esc(at.iban || "—")}</td></tr>
        <tr><th>Type</th><td>${esc(at.type)}</td></tr>
        <tr><th>Currency</th><td>${esc(at.currency_code)}</td></tr>
        <tr><th>Balance</th><td>${fmt(at.current_balance || 0)}</td></tr>
        <tr><th>Opened</th><td>${dat(at.opening_balance_date)}</td></tr>`;
      const tx = (await api(`/accounts/${id}/transactions?limit=50`)).data;
      const txBody = document.querySelectorAll(".card .table tbody")[1];
      if (!txBody) return;
      if (!tx.length) { txBody.innerHTML = emptyRow(6, "No transactions."); return; }
      txBody.innerHTML = tx.map((t) => {
        const inner = t.attributes.transactions[0];
        const amt = parseFloat(inner.amount);
        const sign = inner.type === "deposit" ? "+" : "−";
        const cls = inner.type === "deposit" ? "text-success" : inner.type === "transfer" ? "text-info" : "text-danger";
        const icon = inner.type === "deposit" ? "fa-arrow-right text-success" : inner.type === "transfer" ? "fa-arrows-left-right text-info" : "fa-arrow-left text-danger";
        return `<tr>
          <td class="text-center"><i class="fa-solid ${icon}"></i></td>
          <td>${esc(inner.description)}</td>
          <td class="text-end ${cls} text-nowrap">${sign}${fmt(amt)}</td>
          <td class="text-muted small">${dat(inner.date)}</td>
          <td>${inner.category_id ? `<a href="transactions.html?cat_id=${inner.category_id}">${esc(inner.category_name)}</a>` : ""}</td>
          <td class="text-muted small">${esc(inner.source_name || "")} → ${esc(inner.destination_name || "")}</td>
        </tr>`;
      }).join("");
    } catch (e) { setTbody(errorRow(6, e)); }
  }

  /* ─── Transactions ─────────────────────────────────────────────────────── */
  async function pageTransactions() {
    const filter = qs("filter"), type = qs("type"), cat = qs("cat"), catId = qs("cat_id"), budget = qs("budget"), budgetId = qs("budget_id"), account = qs("account");
    const TYPE_MAP = { expense: "withdrawal", expenses: "withdrawal", income: "deposit", transfers: "transfer", all: "all" };
    let path;
    if (catId)         path = `/categories/${catId}/transactions?limit=200`;
    else if (budgetId) path = `/budgets/${budgetId}/transactions?limit=200`;
    else               path = "/transactions?limit=200";
    if (type) path += (path.includes("?") ? "&" : "?") + "type=" + (TYPE_MAP[type] || type);
    setTbody(loadingRow(5));
    try {
      const res = await api(path);
      let rows = res.data;
      if (filter === "uncategorised") rows = rows.filter((t) => !t.attributes.transactions[0].category_id);
      if (cat && !catId) rows = rows.filter((t) => t.attributes.transactions[0].category_name === cat);
      if (budget && !budgetId) rows = rows.filter((t) => slug(t.attributes.transactions[0].budget_name || "") === budget);
      if (account) rows = rows.filter((t) => String(t.attributes.transactions[0].source_id) === account || String(t.attributes.transactions[0].destination_id) === account);

      // Resolve cat_id / budget_id to a display name for the filter chip
      let catName = cat, budgetName = budget;
      if (catId && rows[0]) catName = rows[0].attributes.transactions[0].category_name || `#${catId}`;
      if (budgetId && rows[0]) budgetName = rows[0].attributes.transactions[0].budget_name || `#${budgetId}`;

      const titleParts = [];
      if (filter === "uncategorised") titleParts.push("Uncategorised");
      if (type) titleParts.push(type[0].toUpperCase() + type.slice(1));
      if (catName) titleParts.push("· " + catName);
      if (budgetName) titleParts.push("· " + budgetName);
      setTitle(titleParts.length ? titleParts.join(" ") : "Transactions");

      // Visible filter chip so user knows narrowing is applied + can clear it
      const head = document.querySelector("main.pala-main .page-head");
      if (head && (type || filter || catName || budgetName || account)) {
        const chips = [];
        if (type)       chips.push(`<span>Type: <b>${esc(type)}</b></span>`);
        if (filter)     chips.push(`<span>Filter: <b>${esc(filter)}</b></span>`);
        if (catName)    chips.push(`<span>Category: <b>${esc(catName)}</b></span>`);
        if (budgetName) chips.push(`<span>Budget: <b>${esc(budgetName)}</b></span>`);
        if (account)    chips.push(`<span>Account: <b>${esc(account)}</b></span>`);
        const chipHtml = `<div class="filter-bar" style="display:flex;gap:.5rem;align-items:center;margin:.4rem 0 1rem;font-size:.78rem;color:var(--pala-muted);">
          <i class="fa-solid fa-filter"></i>${chips.join("")}
          <a href="transactions.html" class="ms-1" style="color:var(--pala-mint);text-decoration:none;">Clear ✕</a>
        </div>`;
        head.insertAdjacentHTML("afterend", chipHtml);
      }

      if (!rows.length) return setTbody(emptyRow(5, "No transactions match."));
      setTbody(rows.map((t) => {
        const tx = t.attributes.transactions[0];
        const amt = parseFloat(tx.amount);
        const sign = tx.type === "deposit" ? "+" : "−";
        const cls = tx.type === "deposit" ? "text-success" : tx.type === "transfer" ? "text-info" : "text-danger";
        const catCell = tx.category_id
          ? `<a href="transactions.html?cat_id=${tx.category_id}">${esc(tx.category_name)}</a>`
          : `<button class="btn btn-sm btn-outline-warning categorize-btn" data-tx="${t.id}"><i class="fa-solid fa-tag fa-xs"></i> Set category</button>`;
        return `<tr>
          <td class="text-muted small text-nowrap">${dat(tx.date)}</td>
          <td>${esc(tx.description)}<small class="text-muted d-block">${esc(tx.source_name || "")} → ${esc(tx.destination_name || "")}</small></td>
          <td>${catCell}</td>
          <td class="text-end ${cls} text-nowrap">${sign}${fmt(amt)}</td>
          <td class="d-none d-lg-table-cell">${tx.budget_id ? `<a href="transactions.html?budget_id=${tx.budget_id}" class="badge bg-secondary text-decoration-none">${esc(tx.budget_name)}</a>` : ""}</td>
        </tr>`;
      }).join(""));
      wireCategorize();
    } catch (e) { setTbody(errorRow(5, e)); }
  }

  /* ─── Categories list (uses numeric id for stable links) ───────────────── */
  async function pageCategories() {
    setTbody(loadingRow(3));
    try {
      const res = await api("/categories");
      if (!res.data.length) return setTbody(emptyRow(3, "No categories yet."));
      setTbody(res.data.map((c) => `<tr>
        <td><div class="btn-group btn-group-sm"><a href="#" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-pencil fa-fw"></i></a></div></td>
        <td><a href="transactions.html?cat_id=${c.id}">${esc(c.attributes.name)}</a></td>
        <td class="text-muted small">—</td>
      </tr>`).join(""));
    } catch (e) { setTbody(errorRow(3, e)); }
  }

  /* ─── Tags list ────────────────────────────────────────────────────────── */
  async function pageTags() {
    setTbody(loadingRow(3));
    try {
      const res = await api("/tags");
      if (!res.data.length) return setTbody(emptyRow(3, "No tags yet."));
      setTbody(res.data.map((t) => `<tr>
        <td><div class="btn-group btn-group-sm"><a href="#" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-pencil fa-fw"></i></a></div></td>
        <td><a href="#">${esc(t.attributes.tag)}</a></td>
        <td class="text-muted small">${dat(t.attributes.date)}</td>
      </tr>`).join(""));
    } catch (e) { setTbody(errorRow(3, e)); }
  }

  /* ─── Bills ────────────────────────────────────────────────────────────── */
  async function pageBills() {
    setTbody(loadingRow(6));
    try {
      const res = await api("/bills");
      if (!res.data.length) return setTbody(emptyRow(6, "No subscriptions yet."));
      setTbody(res.data.map((b) => {
        const at = b.attributes;
        const amt = (parseFloat(at.amount_min || 0) + parseFloat(at.amount_max || 0)) / 2;
        return `<tr>
          <td><div class="btn-group btn-group-sm"><a href="#" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-pencil fa-fw"></i></a><a href="#" class="btn btn-sm btn-outline-danger"><i class="fa-solid fa-trash fa-fw"></i></a></div></td>
          <td><a href="#">${esc(at.name)}</a><small class="text-muted d-block">${esc(at.repeat_freq || "")}</small></td>
          <td class="text-end text-nowrap">${fmt(amt)}</td>
          <td>${at.paid_dates && at.paid_dates.length ? `<span class="text-success">Paid ${dat(at.paid_dates[0].date)}</span>` : `<span class="text-muted">Unpaid</span>`}</td>
          <td class="d-none d-lg-table-cell text-muted small">${dat(at.next_expected_match)}</td>
          <td class="d-none d-lg-table-cell">${at.active ? `<span class="badge bg-success-subtle text-success">Active</span>` : `<span class="badge bg-secondary">Inactive</span>`}</td>
        </tr>`;
      }).join(""));
    } catch (e) { setTbody(errorRow(6, e)); }
  }

  /* ─── Piggy banks ──────────────────────────────────────────────────────── */
  async function pagePiggy() {
    setTbody(loadingRow(5));
    try {
      const res = await api("/piggy-banks");
      if (!res.data.length) return setTbody(emptyRow(5, "No piggy banks yet."));
      setTbody(res.data.map((p) => {
        const at = p.attributes;
        const saved = parseFloat(at.current_amount || 0);
        const target = parseFloat(at.target_amount || 0);
        const pct = target ? Math.min(100, (saved / target) * 100) : 0;
        return `<tr>
          <td><div class="btn-group btn-group-sm"><a href="#" class="btn btn-sm btn-outline-success"><i class="fa-solid fa-plus fa-fw"></i></a><a href="#" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-pencil fa-fw"></i></a></div></td>
          <td><a href="#">${esc(at.name)}</a></td>
          <td class="text-end text-nowrap">${fmt(saved)}</td>
          <td class="d-none d-md-table-cell"><div class="progress" style="height:6px;background:#13203a"><div class="progress-bar bg-success" style="width:${pct}%"></div></div></td>
          <td class="text-end d-none d-md-table-cell text-muted">${target ? fmt(target) : "—"}</td>
        </tr>`;
      }).join(""));
    } catch (e) { setTbody(errorRow(5, e)); }
  }

  /* ─── Recurring transactions ───────────────────────────────────────────── */
  async function pageRecurring() {
    setTbody(loadingRow(5));
    try {
      const res = await api("/recurrences");
      if (!res.data.length) return setTbody(emptyRow(5, "No recurrences yet."));
      setTbody(res.data.map((r) => {
        const at = r.attributes;
        const tx0 = at.transactions?.[0] || {};
        return `<tr>
          <td><div class="btn-group btn-group-sm"><a href="#" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-pencil fa-fw"></i></a></div></td>
          <td><a href="#">${esc(at.title)}</a><small class="text-muted d-block">${esc(at.description || "")}</small></td>
          <td class="text-end text-nowrap">${fmt(tx0.amount || 0)}</td>
          <td class="text-muted small">${esc(at.repetitions?.[0]?.type || "")}</td>
          <td class="text-muted small">${dat(at.first_date)}</td>
        </tr>`;
      }).join(""));
    } catch (e) { setTbody(errorRow(5, e)); }
  }

  /* ─── Rules (list + ?prefill= form) ────────────────────────────────────── */
  async function pageRules() {
    const p = qs("prefill");
    if (p) return rulesPrefill(p);
    setTbody(loadingRow(4));
    try {
      const res = await api("/rules");
      if (!res.data.length) return setTbody(emptyRow(4, "No rules yet."));
      setTbody(res.data.map((r) => {
        const at = r.attributes;
        const trig = (at.triggers || []).map((t) => `${t.type}: ${t.value}`).join("; ");
        const acts = (at.actions || []).map((a) => `${a.type}: ${a.value}`).join("; ");
        return `<tr>
          <td><div class="btn-group btn-group-sm"><a href="#" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-pencil fa-fw"></i></a></div></td>
          <td><a href="#">${esc(at.title)}</a></td>
          <td class="small text-muted">${esc(trig)}</td>
          <td class="small text-muted">${esc(acts)}</td>
        </tr>`;
      }).join(""));
    } catch (e) { setTbody(errorRow(4, e)); }
  }

  async function rulesPrefill(p) {
    let data; try { data = JSON.parse(p); } catch { return; }
    const main = document.querySelector("main.pala-main") || document.body;
    const html = `<div class="card mb-3" id="prefillCard">
      <div class="card-header"><h3 class="card-title">New rule (prefilled)</h3></div>
      <div class="card-body">
        <div class="mb-2"><label class="form-label">Title</label>
          <input class="form-control" id="pf-title" value="Auto-categorize ${esc(data.description || "").slice(0, 40)}"></div>
        <div class="mb-2"><label class="form-label">Trigger · description contains</label>
          <input class="form-control" id="pf-trig" value="${esc(data.description || "").split(/\s+/).slice(0, 2).join(" ")}"></div>
        <div class="mb-2"><label class="form-label">Action · set category to</label>
          <input class="form-control" value="${esc(data.category_name || "")}" readonly></div>
        <input type="hidden" id="pf-cat" value="${esc(data.category_id || "")}">
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn-primary" id="pf-save">Create rule</button>
          <a class="btn btn-outline-secondary" href="rules.html">Cancel</a>
        </div>
      </div></div>`;
    main.insertAdjacentHTML("afterbegin", html);
    document.getElementById("pf-save").onclick = async () => {
      const title = document.getElementById("pf-title").value;
      const trig = document.getElementById("pf-trig").value;
      const groups = await api("/rule-groups");
      let gid = groups.data[0]?.id;
      if (!gid) {
        const ng = await api("/rule-groups", { method: "POST", body: JSON.stringify({ title: "Auto-rules" }) });
        gid = ng.data.id;
      }
      await api("/rules", {
        method: "POST",
        body: JSON.stringify({
          title, rule_group_id: gid, trigger: "store-journal", strict: true, active: true,
          triggers: [{ type: "description_contains", value: trig }],
          actions:  [{ type: "set_category",        value: data.category_name }],
        }),
      });
      location.href = "rules.html";
    };
  }

  /* ─── Categorize modal ─────────────────────────────────────────────────── */
  function wireCategorize() {
    document.querySelectorAll(".categorize-btn").forEach((b) => {
      if (b.dataset.bound) return;
      b.dataset.bound = "1";
      b.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const txId = b.dataset.tx;
        const cats = (await api("/categories")).data
          .map((c) => `<option value="${c.id}">${esc(c.attributes.name)}</option>`).join("");
        const html = `<div class="modal fade" id="catModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content" style="background:#1e2d45;color:#d6e4f0;border:1px solid #253550">
          <div class="modal-header"><h5 class="modal-title">Set category</h5></div>
          <div class="modal-body">
            <select class="form-select" id="catSel"><option value="">— pick a category —</option>${cats}</select>
            <div class="form-check mt-3"><input class="form-check-input" type="checkbox" id="ruleCk" checked><label class="form-check-label" for="ruleCk">Create a rule from this transaction</label></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="catSave">Save</button></div>
        </div></div></div>`;
        document.body.insertAdjacentHTML("beforeend", html);
        const modalEl = document.getElementById("catModal");
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        document.getElementById("catSave").onclick = async () => {
          const catId = document.getElementById("catSel").value;
          const catName = document.getElementById("catSel").selectedOptions[0]?.textContent || "";
          if (!catId) return;
          const tx = (await api("/transactions/" + txId)).data;
          const inner = tx.attributes.transactions[0];
          await api("/transactions/" + txId, {
            method: "PUT",
            body: JSON.stringify({ transactions: [{ transaction_journal_id: inner.transaction_journal_id, category_id: catId }] }),
          });
          const wantRule = document.getElementById("ruleCk").checked;
          modal.hide();
          if (wantRule) {
            const prefill = { description: inner.description, category_id: catId, category_name: catName };
            location.href = "rules.html?prefill=" + encodeURIComponent(JSON.stringify(prefill));
          } else { location.reload(); }
        };
        modalEl.addEventListener("hidden.bs.modal", () => modalEl.remove());
      };
    });
  }

  /* ─── Dashboard: live cat-chips per envelope + attention wiring ────────── */
  async function pageDashboard() {
    const tryEnhance = async (attempt = 0) => {
      if (attempt > 20) return;
      if (!document.querySelector("a.pace-row.hero")) return setTimeout(() => tryEnhance(attempt + 1), 300);
      try {
        const { start, end } = periodRange();
        const budgets = await api("/budgets");
        for (const b of budgets.data) {
          const row = document.querySelector(`a.pace-row.hero[data-budget-id="${b.id}"]`) ||
                      document.querySelector(`a.pace-row.hero[href*="budget=${slug(b.attributes.name)}"]`);
          if (!row) continue;
          const cats = row.querySelector(".pace-cats");
          if (!cats) continue;
          const txs = await api(`/budgets/${b.id}/transactions?start=${start}&end=${end}&limit=500`);
          const totals = {}; // key: cat_id|UNCAT  → {name, amt}
          for (const t of txs.data) {
            const inner = t.attributes.transactions[0];
            const key = inner.category_id || "UNCAT";
            if (!totals[key]) totals[key] = { name: inner.category_name || "Uncategorised", id: inner.category_id, amt: 0 };
            totals[key].amt += parseFloat(inner.amount);
          }
          const chips = Object.values(totals).sort((a, b) => b.amt - a.amt)
            .map((c) => {
              const href = c.id ? `transactions.html?cat_id=${c.id}` : `transactions.html?filter=uncategorised&budget_id=${b.id}`;
              return `<a href="${href}" class="cat-chip">${esc(c.name)}<span class="cat-amt">${fmt(c.amt)}</span></a>`;
            }).join("");
          cats.innerHTML = chips || `<span class="text-muted small">No transactions yet</span>`;
        }
      } catch (e) { console.warn("enhanceDashboard:", e); }
    };
    tryEnhance();

    document.querySelectorAll(".attention-row").forEach((row) => {
      const title = row.querySelector(".attention-title")?.textContent || "";
      if (/categor|tag|uncateg/i.test(title)) row.setAttribute("href", "transactions.html?filter=uncategorised");
    });

    // Live donut legend: replace stale hard-coded category rows with real top categories
    try {
      const legend = document.querySelector(".donut-legend");
      if (legend) {
        const { start, end } = periodRange();
        const tx = await api(`/transactions?start=${start}&end=${end}&type=withdrawal&limit=500`);
        const totals = {}; let uncatTotal = 0, uncatCount = 0;
        for (const t of tx.data) {
          const inner = t.attributes.transactions[0];
          const amt = parseFloat(inner.amount);
          if (inner.category_id) {
            if (!totals[inner.category_id]) totals[inner.category_id] = { id: inner.category_id, name: inner.category_name, amt: 0 };
            totals[inner.category_id].amt += amt;
          } else { uncatTotal += amt; uncatCount++; }
        }
        const sorted = Object.values(totals).sort((a, b) => b.amt - a.amt);
        const top = sorted.slice(0, 4);
        const rest = sorted.slice(4);
        const swatches = ["#3ecfb2", "#5bafd6", "#f0a84a", "#a48cd2", "#e05c6a"];
        let html = top.map((c, i) => `<a href="transactions.html?cat_id=${c.id}" class="donut-legend-row">
          <span class="donut-legend-swatch" style="background:${swatches[i]}"></span>
          <span class="donut-legend-name">${esc(c.name)}</span>
          <span class="donut-legend-amt">${fmt(c.amt)}</span>
          <span class="donut-legend-delta">—</span></a>`).join("");
        if (rest.length) {
          const restTotal = rest.reduce((s, c) => s + c.amt, 0);
          html += `<a href="categories.html" class="donut-legend-row">
            <span class="donut-legend-swatch" style="background:${swatches[4]}"></span>
            <span class="donut-legend-name">${rest.length} other categories</span>
            <span class="donut-legend-amt">${fmt(restTotal)}</span>
            <span class="donut-legend-delta">—</span></a>`;
        }
        if (uncatCount) {
          html += `<a href="transactions.html?filter=uncategorised" class="donut-legend-row">
            <span class="donut-legend-swatch" style="background:#7a9bbf"></span>
            <span class="donut-legend-name">Uncategorised <span class="flag info"><i class="fa-solid fa-tag"></i> ${uncatCount}</span></span>
            <span class="donut-legend-amt">${fmt(uncatTotal)}</span>
            <span class="donut-legend-delta">—</span></a>`;
        }
        if (html) legend.innerHTML = html;
      }
    } catch (e) { console.warn("donut legend:", e); }
  }

  /* ─── Budgets list: live KPIs + simplified envelope cards ──────────────── */
  const BUDGET_COLOR_BY_SLUG = {
    "groceries":     "var(--bud-groceries)",
    "going-out":     "var(--bud-going-out)",
    "sins":          "var(--bud-sins)",
    "transport":     "var(--bud-transport)",
    "subscription":  "var(--bud-subs)",
    "subscriptions": "var(--bud-subs)",
    "lifestyle":     "var(--bud-lifestyle)",
    "living":        "var(--bud-living)",
    "travel":        "var(--bud-travel)",
  };
  const BUDGET_FALLBACK_PALETTE = ["#3ecfb2","#5dd9bf","#86e3cd","#4ca7e0","#e0b46c","#b59ad8","#9ad8be","#d8a5a5","#7fbcd2","#c8b89d"];

  function budgetColor(name, fallbackIdx) {
    return BUDGET_COLOR_BY_SLUG[slug(name)] || BUDGET_FALLBACK_PALETTE[fallbackIdx % BUDGET_FALLBACK_PALETTE.length];
  }

  function fmtEur(n) {
    const abs = Math.abs(n);
    const s = abs.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? "-\u20ac" : "\u20ac") + s;
  }
  function fmtEurInt(n) {
    return "\u20ac" + Math.round(n).toLocaleString("de-AT");
  }

  async function pageBudgets() {
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth();
    const monthStart = new Date(y, m, 1);
    const monthEnd   = new Date(y, m + 1, 0);
    const iso = (d) => d.toISOString().slice(0, 10);
    const startStr = iso(monthStart), endStr = iso(monthEnd);
    const dayOfMonth = today.getDate();
    const daysInMonth = monthEnd.getDate();
    const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
    const monthLabel = monthStart.toLocaleDateString("en", { month: "short", year: "numeric" });

    // Update page-head subtitle + body data-period (navbar reads from this)
    document.body.setAttribute("data-period",
      `${monthStart.getDate()} ${monthStart.toLocaleDateString("en", { month: "short" })} \u2013 ${daysInMonth} ${monthEnd.toLocaleDateString("en", { month: "short" })} ${y}`);
    const periodEl = document.querySelector(".pala-navbar .period-badge span");
    if (periodEl) periodEl.textContent = document.body.getAttribute("data-period");

    let budgets = [], limits = [];
    try {
      [budgets, limits] = await Promise.all([
        api(`/budgets?start=${startStr}&end=${endStr}`).then((r) => r.data || []),
        api(`/budget-limits?start=${startStr}&end=${endStr}`).then((r) => r.data || []),
      ]);
    } catch (e) {
      console.warn("pageBudgets: API failed, leaving static markup", e);
      liveHistoricChart().catch(() => {});
      return;
    }

    // Fetch 12-month spent series in parallel (one call per past month, current included)
    const HIST_MONTHS = 12;
    const monthRanges = [];
    for (let k = HIST_MONTHS - 1; k >= 0; k--) {
      const ms = new Date(y, m - k, 1);
      const me = new Date(y, m - k + 1, 0);
      monthRanges.push({
        start: iso(ms), end: iso(me),
        label: ms.toLocaleDateString("en", { month: "short" }),
        isCurrent: k === 0,
      });
    }
    let historyByBudget = new Map(); // id → [{label, pct, spent, isCurrent, isOver}]
    try {
      const monthResponses = await Promise.all(
        monthRanges.map((r) =>
          api(`/budgets?start=${r.start}&end=${r.end}`).then((res) => res.data || [])
        )
      );
      monthResponses.forEach((data, mi) => {
        const range = monthRanges[mi];
        data.forEach((b) => {
          const s = Math.abs(Number(b.attributes?.spent?.[0]?.sum || 0));
          if (!historyByBudget.has(b.id)) historyByBudget.set(b.id, []);
          historyByBudget.get(b.id).push({
            label: range.label, spent: s, isCurrent: range.isCurrent,
          });
        });
      });
    } catch (e) {
      console.warn("pageBudgets: per-month history failed (mini-hist will be empty)", e);
    }

    // Sum limits per budget id (a budget can have multiple limit rows in a period)
    const limitByBudget = new Map();
    for (const l of limits) {
      const a = l.attributes || {};
      const bid = String(a.budget_id || "");
      if (!bid) continue;
      limitByBudget.set(bid, (limitByBudget.get(bid) || 0) + Number(a.amount || 0));
    }

    // Build records, keep only active budgets
    const records = budgets
      .filter((b) => b.attributes && b.attributes.active !== false)
      .map((b, i) => {
        const a = b.attributes;
        const name = a.name;
        const limit = limitByBudget.get(String(b.id)) || 0;
        const spent = Math.abs(Number(a.spent?.[0]?.sum || 0));
        const pctRaw = limit > 0 ? (spent / limit) * 100 : (spent > 0 ? 100 : 0);
        const pct = Math.min(pctRaw, 110); // clamp visual fill
        const left = limit - spent;
        let status = "on";
        if (pctRaw > 100) status = "over";
        else if (pctRaw >= 85) status = "watch";
        return {
          id: b.id, name, slug: slug(name),
          color: budgetColor(name, i),
          limit, spent, left, pct, pctRaw, status,
        };
      })
      .filter((r) => r.limit > 0 || r.spent > 0) // hide truly empty budgets
      .sort((a, b) => b.limit - a.limit);        // biggest budgets first

    // Find the cards grid (the row containing .bud-link cards)
    const anchorCard = document.querySelector(".bud-link");
    const grid = anchorCard?.closest(".row");
    if (grid) {
      grid.innerHTML = "";
      const expectedPacePct = daysInMonth > 0 ? (dayOfMonth / daysInMonth) * 100 : 0;
      records.forEach((r) => {
        const leftColor =
          r.status === "over"  ? "var(--pala-danger)"
        : r.status === "watch" ? "var(--pala-warn,#e0b46c)"
        : "var(--pala-mint)";
        const leftLabel = r.left >= 0
          ? `${fmtEur(r.left)} left`
          : `${fmtEur(Math.abs(r.left))} over`;
        const pillCls = r.status === "over" ? "over" : (r.status === "watch" ? "warn" : "ok");
        const pillText = r.status === "over" ? "over" : (r.status === "watch" ? "watch" : "on pace");
        const expectedPctTxt = Math.round(expectedPacePct);

        // Build mini-history bars from per-budget series (denominator = current limit)
        const series = historyByBudget.get(r.id) || [];
        const denom = r.limit > 0 ? r.limit : Math.max(1, ...series.map(s => s.spent));
        const histSpents = series.map(s => s.spent);
        const histAvg = series.length ? series.reduce((a,b) => a + b, 0) / series.length : 0;
        const histMaxPct = denom > 0 ? Math.max(...histSpents, 0) / denom * 100 : 0;
        const histAvgPct = denom > 0 ? histAvg / denom * 100 : 0;
        const barsHtml = series.map(s => {
          const pct = denom > 0 ? (s.spent / denom) * 100 : 0;
          const isOver = pct > 100;
          const cls = [s.isCurrent ? "current" : "", isOver ? "over" : ""].filter(Boolean).join(" ");
          const h = Math.min(pct, 110);
          const title = `${s.label} ${Math.round(pct)}% \u00b7 ${fmtEur(s.spent)}`;
          return `<div class="col ${cls}" style="height:${h}%" title="${title}"></div>`;
        }).join("");
        const firstLabel = series[0]?.label || "";
        const lastLabel = series[series.length - 1]?.label || "";
        const histHtml = series.length ? `
          <div class="mini-hist-block">
            <div class="cat-stack-label">% of budget used \u00b7 last ${series.length} months</div>
            <div class="mini-hist">${barsHtml}</div>
            <div class="mini-hist-legend"><span>${escapeHtml(firstLabel)}</span><span>avg ${Math.round(histAvgPct)}% \u00b7 max ${Math.round(histMaxPct)}%</span><span>${escapeHtml(lastLabel)}</span></div>
          </div>` : "";

        const col = document.createElement("div");
        col.className = "col-lg-6 col-xl-4";
        col.innerHTML = `
          <a class="card bud-link" href="budget-show.html?id=${r.id}" data-budget-id="${r.id}" style="text-decoration:none; color:inherit; display:block;">
            <div class="bud-card">
              <div class="bud-head">
                <div class="name"><span class="swatch" style="background:${r.color}"></span>${escapeHtml(r.name)}</div>
                <div class="vals">
                  <div class="big">${fmtEur(r.spent)} <span class="text-muted">/ ${fmtEur(r.limit)}</span></div>
                  <div class="delta" style="color:${leftColor}; font-variant-numeric:tabular-nums;">${leftLabel}</div>
                </div>
              </div>
              <div class="bud-pace" title="${Math.round(r.pctRaw)}% used">
                <div class="fill" style="width:${r.pct}%; background:${r.color}"></div>
                <div class="marker" style="left:${expectedPacePct}%"></div>
              </div>
              <div class="bud-status-row">
                <span>Day ${dayOfMonth}/${daysInMonth} \u00b7 expected ${expectedPctTxt}%</span>
                <span class="bud-pill ${pillCls}">${pillText}</span>
              </div>
              ${histHtml}
            </div>
          </a>
        `;
        grid.appendChild(col);
      });
    }

    // ─── KPI strip ───
    const totBudgeted = records.reduce((a, r) => a + r.limit, 0);
    const totSpent    = records.reduce((a, r) => a + r.spent, 0);
    const totAvail    = totBudgeted - totSpent;
    const pctUsed     = totBudgeted > 0 ? (totSpent / totBudgeted) * 100 : 0;
    const counts = { on: 0, watch: 0, over: 0 };
    records.forEach((r) => { counts[r.status]++; });
    const envCount = records.length;

    const setText = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt; };
    const setHtml = (sel, html) => { const el = document.querySelector(sel); if (el) el.innerHTML = html; };

    setText("#budTitleSub", `${envCount} envelope${envCount === 1 ? "" : "s"} \u00b7 ${fmtEurInt(totBudgeted)}/mo`);
    setText('[data-k="budgeted-eyebrow"]',
      monthStart.toLocaleDateString("en", { month: "short" }) + " budgeted");
    // re-inject the arrow icon (textContent wiped it)
    const eyebrowEl = document.querySelector('[data-k="budgeted-eyebrow"]');
    if (eyebrowEl) eyebrowEl.innerHTML = `${monthStart.toLocaleDateString("en", { month: "short" })} budgeted <i class="fa-solid fa-arrow-right kpi-arrow"></i>`;
    setHtml('[data-k="budgeted-amount"]', `${fmtEurInt(totBudgeted)}<span class="text-muted" style="font-weight:400">.00</span>`);
    setText('[data-k="budgeted-meta"]', `across ${envCount} envelope${envCount === 1 ? "" : "s"}`);

    setHtml('[data-k="spent-amount"]',
      `<span class="${totSpent > totBudgeted ? 'text-danger' : ''}">${fmtEur(totSpent)}</span>`);
    setText('[data-k="spent-meta"]', `${Math.round(pctUsed)}% used \u00b7 day ${dayOfMonth} of ${daysInMonth}`);

    const availColor = totAvail < 0 ? "var(--pala-danger)" : "var(--pala-mint)";
    setHtml('[data-k="available-amount"]', `<span style="color:${availColor}">${fmtEur(totAvail)}</span>`);
    setText('[data-k="available-meta"]', daysLeft > 0
      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in period`
      : "last day of period");

    setText('[data-stat="on"]',    counts.on);
    setText('[data-stat="watch"]', counts.watch);
    setText('[data-stat="over"]',  counts.over);
    setText('[data-k="status-meta"]', daysLeft > 0
      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in period`
      : "last day of period");

    // Re-apply focus styling now that cards exist
    if (typeof window.applyBudgetFocus === "function") {
      try { window.applyBudgetFocus(); } catch (e) { console.warn(e); }
    }

    // Live historic chart (always — supports tab clicks regardless of focus)
    liveHistoricChart().catch((e) => console.warn("liveHistoricChart failed:", e));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ─── Historic chart: live data for Total + Day-N modes ───────────── */
  async function liveHistoricChart() {
    const wrap = document.getElementById("histWrap");
    if (!wrap) return;
    const monthsEls = wrap.querySelectorAll(".history-month");
    if (!monthsEls.length) return;
    // Hide mocked stacks immediately — stay empty until live data lands
    monthsEls.forEach((el) => {
      const stack = el.querySelector(".history-stack");
      if (stack) stack.style.height = "0%";
    });
    const today = new Date();
    const dom = today.getDate();
    // Update Day-N tab label to today's day-of-month
    const dnTab = document.querySelector('#histTabs button[data-mode="dayn"]');
    if (dnTab) dnTab.textContent = `Day-${dom}`;

    // Build 12 month windows ending with the current month
    const monthDefs = [];
    for (let i = 11; i >= 0; i--) {
      const s = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const me = new Date(s.getFullYear(), s.getMonth() + 1, 0);
      const lastDay = me.getDate();
      const endDom = Math.min(dom, lastDay);
      const dnEnd = new Date(s.getFullYear(), s.getMonth(), endDom);
      monthDefs.push({
        start: s.toISOString().slice(0, 10),
        end: me.toISOString().slice(0, 10),
        dnEnd: dnEnd.toISOString().slice(0, 10),
        ym: s.toISOString().slice(0, 7),
        label: s.toLocaleDateString("en", { month: "short" }),
      });
    }
    const startAll = monthDefs[0].start;
    const endAll = monthDefs[monthDefs.length - 1].end;

    // Budgeted totals across full range
    let budgetedByMonth = {};
    try {
      const lim = await api(`/budget-limits?start=${startAll}&end=${endAll}`);
      for (const l of (lim.data || [])) {
        const a = l.attributes;
        const ym = (a.start || "").slice(0, 7);
        if (!ym) continue;
        budgetedByMonth[ym] = (budgetedByMonth[ym] || 0) + Number(a.amount || 0);
      }
    } catch (_) { /* swallow */ }

    // Day-N spend per month, parallel
    const dn = await Promise.all(
      monthDefs.map(async (m) => {
        try {
          const r = await api(`/transactions?start=${m.start}&end=${m.dnEnd}&type=withdrawal&limit=500`);
          let sum = 0, count = 0;
          for (const t of (r.data || [])) for (const tr of t.attributes.transactions) { sum += Number(tr.amount); count++; }
          return { spend: sum, txCount: count };
        } catch (_) { return { spend: 0, txCount: 0 }; }
      })
    );

    // Wire the last N month-elements (HTML has 12 hardcoded)
    const elems = Array.from(monthsEls).slice(-monthDefs.length);
    const eu = (n) => "\u20ac" + Math.round(n).toLocaleString("de-AT");
    elems.forEach((el, i) => {
      const m = monthDefs[i];
      const budgeted = budgetedByMonth[m.ym] || 0;
      const spend = dn[i].spend;
      const hasData = budgeted > 0 || dn[i].txCount > 0;
      el.dataset.budgeted = budgeted;
      el.dataset.spend = spend;
      el.dataset.hasData = hasData ? "1" : "0";
      el.classList.toggle("nodata-month", !hasData);
      el.classList.toggle("current", i === elems.length - 1);
      el.setAttribute("title", hasData
        ? `${m.label} \u00b7 budgeted ${eu(budgeted)} \u00b7 spent through day ${dom} ${eu(spend)}`
        : `${m.label} \u00b7 no data`);
      const labelEl = el.querySelector(".history-label");
      if (labelEl) labelEl.textContent = m.label;
      if (!el.querySelector(".euro")) {
        const eP = document.createElement("div"); eP.className = "euro"; el.appendChild(eP);
      }
      if (!el.querySelector(".nodata")) {
        const nd = document.createElement("div"); nd.className = "nodata"; el.appendChild(nd);
      }
    });

    function repaint() {
      const mode = (wrap.className.match(/mode-(total|dayn|pct|eur)/) || [, "pct"])[1];
      const valFor = (el) => mode === "total" ? Number(el.dataset.budgeted)
                          : mode === "dayn"  ? Number(el.dataset.spend) : null;
      const header = wrap.parentElement.querySelector(".card-header .text-muted.small");

      if (mode === "pct" || mode === "eur") {
        // Live wiring for stacked envelope modes not yet implemented — leave bars empty.
        elems.forEach((el) => {
          el.classList.remove("over", "under");
          const stack = el.querySelector(".history-stack");
          if (stack) stack.style.height = "0%";
          const eP = el.querySelector(".euro"); if (eP) eP.textContent = "";
        });
        wrap.querySelector(".history-avgline")?.remove();
        if (header) header.textContent = mode === "pct"
          ? "% used \u00b7 per-envelope view \u2014 coming soon"
          : "\u20ac amount per envelope \u2014 coming soon";
        return;
      }

      const valid = elems.filter((el) => el.dataset.hasData === "1").map((el) => ({ el, v: valFor(el) }));
      if (!valid.length) return;
      const max = Math.max(...valid.map((x) => x.v), 1);
      const cap = Math.ceil((max * 1.1) / 50) * 50 || 100;
      const denom = valid.length;
      const avg = mode === "dayn" ? valid.reduce((a, x) => a + x.v, 0) / denom : 0;

      elems.forEach((el, i) => {
        const stack = el.querySelector(".history-stack");
        const eP = el.querySelector(".euro");
        const isCurr = i === elems.length - 1;
        el.classList.remove("over", "under");
        if (el.dataset.hasData !== "1") {
          if (stack) stack.style.height = "0%";
          if (eP) eP.textContent = "";
          return;
        }
        const v = valFor(el);
        if (stack) stack.style.height = (v / cap * 100) + "%";
        if (eP) eP.textContent = eu(v);
        if (mode === "dayn" && !isCurr) {
          if (v > avg * 1.1) el.classList.add("over");
          else if (v < avg * 0.85) el.classList.add("under");
        }
      });

      let avgEl = wrap.querySelector(".history-avgline");
      if (mode === "dayn") {
        if (!avgEl) {
          avgEl = document.createElement("div");
          avgEl.className = "history-avgline";
          avgEl.innerHTML = "<span></span>";
          wrap.querySelector(".history-bars")?.appendChild(avgEl);
        }
        avgEl.style.bottom = (avg / cap * 100) + "%";
        avgEl.querySelector("span").textContent = `avg ${eu(avg)} \u00b7 ${denom} mo`;
      } else if (avgEl) {
        avgEl.remove();
      }

      if (header) {
        header.textContent = mode === "total"
          ? `Total budgeted per month \u00b7 last ${denom} month${denom === 1 ? "" : "s"} with data`
          : `Cumulative spend day 1 \u2192 ${dom} each month \u00b7 ${denom}-mo average`;
      }
    }

    document.getElementById("histTabs")?.addEventListener("click", (e) => {
      if (e.target.matches("button[data-mode]")) setTimeout(repaint, 0);
    });
    repaint();
  }

  /* ─── Budget detail (?id=N) ───────────────────────────────────────────── */
  async function pageBudgetShow() {
    const id = qs("id");
    if (!id) return;
    try {
      const b = (await api(`/budgets/${id}`)).data;
      const name = b.attributes.name;
      const h1 = document.querySelector(".page-head h1");
      if (h1) h1.innerHTML = `<span class="dot"></span>${esc(name)}`;
      document.title = `${name} — Firefly III · Pala`;
      const crumbs = document.querySelector("[data-crumbs]");
      if (crumbs) crumbs.dataset.crumbs = `Home/Budgets/${name}`;

      // Rewrite "View all N →" + rules link to real id
      document.querySelectorAll('a[href*="budget_id=1"]').forEach((a) =>
        a.setAttribute("href", a.getAttribute("href").replace(/budget_id=\d+/, "budget_id=" + id)));

      // Live tx table = the last .card .table tbody on the page
      const { start, end } = periodRange();
      const tx = (await api(`/budgets/${id}/transactions?start=${start}&end=${end}&limit=200`)).data;
      const tbodies = document.querySelectorAll(".card .table tbody");
      const tb = tbodies[tbodies.length - 1];
      if (tb) {
        if (!tx.length) tb.innerHTML = emptyRow(6, "No transactions this month.");
        else tb.innerHTML = tx.slice(0, 12).map((t) => {
          const tr = t.attributes.transactions[0];
          const amt = Number(tr.amount);
          const sign = tr.type === "withdrawal" ? "−" : tr.type === "deposit" ? "+" : "";
          const cls = tr.type === "withdrawal" ? "text-danger" : tr.type === "deposit" ? "text-mint" : "text-muted";
          const ico = tr.type === "withdrawal" ? "fa-arrow-left text-danger" : "fa-arrow-right text-mint";
          return `<tr>
            <td class="text-center"><i class="fa-solid ${ico}"></i></td>
            <td>${esc(tr.description)}</td>
            <td class="num">${dat(tr.date)}</td>
            <td>${tr.category_name ? esc(tr.category_name) : '<span class="text-muted">—</span>'}</td>
            <td class="text-muted">${esc(tr.source_name || tr.destination_name || "")}</td>
            <td class="text-end num ${cls}">${sign}€${amt.toFixed(2)}</td>
          </tr>`;
        }).join("");
      }
      const viewAll = document.querySelector('a[href*="transactions.html?budget_id"]');
      if (viewAll) viewAll.textContent = `View all ${tx.length} →`;
    } catch (e) {
      const tbodies = document.querySelectorAll(".card .table tbody");
      const tb = tbodies[tbodies.length - 1];
      if (tb) tb.innerHTML = errorRow(6, e);
    }
  }

  /* ─── Category detail (?id=N) ─────────────────────────────────────────── */
  async function pageCategoryShow() {
    const id = qs("id");
    if (!id) return;
    try {
      const c = (await api(`/categories/${id}`)).data;
      const name = c.attributes.name;
      const h1 = document.querySelector(".page-head h1");
      if (h1) h1.innerHTML = `<span class="dot"></span>${esc(name)}`;
      document.title = `${name} — Firefly III · Pala`;
      const crumbs = document.querySelector("[data-crumbs]");
      if (crumbs) crumbs.dataset.crumbs = `Home/Categories/${name}`;

      // Live tx table = last tbody on the page
      const { start, end } = periodRange();
      const tx = (await api(`/categories/${id}/transactions?start=${start}&end=${end}&limit=200`)).data;
      const tbodies = document.querySelectorAll(".card .table tbody");
      const tb = tbodies[tbodies.length - 1];
      if (tb) {
        if (!tx.length) tb.innerHTML = emptyRow(6, "No transactions this month.");
        else tb.innerHTML = tx.slice(0, 12).map((t) => {
          const tr = t.attributes.transactions[0];
          const amt = Number(tr.amount);
          const sign = tr.type === "withdrawal" ? "−" : tr.type === "deposit" ? "+" : "";
          const cls = tr.type === "withdrawal" ? "text-danger" : tr.type === "deposit" ? "text-mint" : "text-muted";
          const ico = tr.type === "withdrawal" ? "fa-arrow-left text-danger" : "fa-arrow-right text-mint";
          const merchant = tr.type === "withdrawal" ? (tr.destination_name || "") : (tr.source_name || "");
          return `<tr>
            <td class="text-center"><i class="fa-solid ${ico}"></i></td>
            <td>${esc(tr.description)}</td>
            <td class="num">${dat(tr.date)}</td>
            <td>${esc(merchant)}</td>
            <td class="text-muted">${esc(tr.type === "withdrawal" ? (tr.source_name || "") : (tr.destination_name || ""))}</td>
            <td class="text-end num ${cls}">${sign}€${amt.toFixed(2)}</td>
          </tr>`;
        }).join("");
      }
      document.querySelectorAll('a[href*="cat_id=3"]').forEach((a) =>
        a.setAttribute("href", a.getAttribute("href").replace(/cat_id=\d+/, "cat_id=" + id)));
      const viewAll = document.querySelector('a[href*="transactions.html?cat_id"]');
      if (viewAll && /View all/.test(viewAll.textContent)) viewAll.textContent = `View all ${tx.length} →`;
    } catch (e) {
      const tbodies = document.querySelectorAll(".card .table tbody");
      const tb = tbodies[tbodies.length - 1];
      if (tb) tb.innerHTML = errorRow(6, e);
    }
  }

  /* ─── Boot ─────────────────────────────────────────────────────────────── */
  function boot() {
    const page = document.body.dataset.page;
    const sub  = document.body.dataset.sub;
    if (page === "accounts")                          return pageAccounts();
    if (page === "transactions")                      return pageTransactions();
    if (page === "budgets")                           return pageBudgets();
    if (page === "budget-show")                       return pageBudgetShow();
    if (page === "category-show")                     return pageCategoryShow();
    if (page === "classification" && sub === "categories") return pageCategories();
    if (page === "classification" && sub === "tags")       return pageTags();
    if (page === "bills")                             return pageBills();
    if (page === "piggy")                             return pagePiggy();
    if (page === "automation" && sub === "rules")     return pageRules();
    if (page === "automation" && sub === "recurring") return pageRecurring();
    if (page === "dashboard" || page === "index")     return pageDashboard();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
