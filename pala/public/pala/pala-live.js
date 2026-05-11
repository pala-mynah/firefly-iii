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

  /* ─── Budgets list: rewrite card links + cat-row links to real ids ─────── */
  async function pageBudgets() {
    try {
      const [bRes, cRes] = await Promise.all([api("/budgets"), api("/categories")]);
      const bMap = new Map(); // slug → id
      bRes.data.forEach((b) => bMap.set(slug(b.attributes.name), b.id));
      const cMap = new Map();
      cRes.data.forEach((c) => cMap.set(slug(c.attributes.name), c.id));

      document.querySelectorAll(".bud-link[data-href]").forEach((el) => {
        const nm = el.querySelector(".bud-head .name")?.textContent || "";
        const id = bMap.get(slug(nm));
        if (id) el.dataset.href = `budget-show.html?id=${id}`;
      });
      document.querySelectorAll('a[href*="category-show.html?cat="], .cat-row[href*="category-show.html?cat="]').forEach((a) => {
        const m = a.getAttribute("href").match(/cat=([^&]+)/);
        if (!m) return;
        const id = cMap.get(decodeURIComponent(m[1]));
        if (id) a.setAttribute("href", `category-show.html?id=${id}`);
      });
    } catch (e) { /* leave static links as-is */ }

    // Live charts when focus mode is active
    const focusMode = new URLSearchParams(location.search).get("focus");
    if (focusMode === "spent")    liveDayN().catch((e) => console.warn("liveDayN failed:", e));
    if (focusMode === "budgeted") liveBudgeted().catch((e) => console.warn("liveBudgeted failed:", e));
  }

  /* ─── Total budgeted per month (last N months with data) ──────────────── */
  async function liveBudgeted() {
    const card = document.getElementById("budgetedCard");
    if (!card) return;
    const today = new Date();
    // Try last 12 months; keep only months that have any budget limit
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const s = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
      months.push({
        start: s.toISOString().slice(0, 10),
        end: e.toISOString().slice(0, 10),
        label: s.toLocaleDateString("en", { month: "short" }),
        ym: s.toISOString().slice(0, 7),
      });
    }
    // Pull all budgets, then their limits across the full range
    const startAll = months[0].start, endAll = months[months.length - 1].end;
    let totalsByMonth = {};
    try {
      const lim = await api(`/budget-limits?start=${startAll}&end=${endAll}`);
      for (const l of (lim.data || [])) {
        const a = l.attributes;
        const ym = (a.start || "").slice(0, 7);
        if (!ym) continue;
        totalsByMonth[ym] = (totalsByMonth[ym] || 0) + Number(a.amount || 0);
      }
    } catch (_) { /* fallback: sum from /budgets per period */ }
    // If no limits returned, fallback: sum auto_budget_amount × N months
    if (Object.keys(totalsByMonth).length === 0) {
      const bRes = await api("/budgets");
      const autoSum = bRes.data.reduce((a, b) => a + Number(b.attributes.auto_budget_amount || 0), 0);
      months.forEach((m) => (totalsByMonth[m.ym] = autoSum));
    }
    // Keep only months with data
    const live = months.filter((m) => totalsByMonth[m.ym] > 0).map((m) => ({ ...m, total: totalsByMonth[m.ym] }));
    if (!live.length) return;
    const max = Math.max(...live.map((m) => m.total), 1);
    const cap = Math.ceil((max * 1.1) / 100) * 100 || 100;
    const eu = (n) => "€" + Math.round(n).toLocaleString("de-AT");

    // Rebuild bars to match live month count
    const bars = card.querySelector(".budg-bars");
    const labels = card.querySelector(".budg-labels");
    if (bars && labels) {
      bars.style.gridTemplateColumns = `repeat(${live.length}, 1fr)`;
      labels.style.gridTemplateColumns = `repeat(${live.length}, 1fr)`;
      bars.innerHTML = live.map((m, i) => {
        const isCurr = i === live.length - 1;
        return `<div class="dayn-col${isCurr ? " current" : ""}" title="${m.label} · ${eu(m.total)}">
          <div class="dayn-bar${isCurr ? " current" : ""}" style="height:${(m.total / cap) * 100}%"></div>
          <span class="v">${eu(m.total)}</span>
        </div>`;
      }).join("");
      labels.innerHTML = live.map((m, i) => {
        const isCurr = i === live.length - 1;
        return isCurr ? `<span class="text-mint"><b>${m.label}</b></span>` : `<span>${m.label}</span>`;
      }).join("");
    }
    const yaxis = card.querySelector(".budg-yaxis");
    if (yaxis) {
      yaxis.innerHTML = [cap, cap * 0.75, cap * 0.5, cap * 0.25, 0]
        .map((l) => `<span>${eu(l)}</span>`).join("");
    }
    const stat = card.querySelector(".budg-header-stat");
    if (stat) {
      stat.innerHTML = `<b style="color:var(--pala-mint)">${eu(live[live.length - 1].total)}</b> this month · ${live.length} month${live.length === 1 ? "" : "s"} of data`;
    }
  }

  /* ─── Day-N cumulative chart (last 12 months, day-of-month-today) ───── */
  async function liveDayN() {
    const card = document.getElementById("dayNCard");
    if (!card) return;
    const today = new Date();
    const dom = today.getDate();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const s = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const lastDay = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
      const endDom = Math.min(dom, lastDay);
      const e = new Date(s.getFullYear(), s.getMonth(), endDom);
      months.push({
        start: s.toISOString().slice(0, 10),
        end: e.toISOString().slice(0, 10),
        label: s.toLocaleDateString("en", { month: "short" }),
      });
    }
    const totals = await Promise.all(
      months.map(async (m) => {
        const r = await api(`/transactions?start=${m.start}&end=${m.end}&type=withdrawal&limit=500`);
        let sum = 0;
        for (const t of r.data) for (const tr of t.attributes.transactions) sum += Number(tr.amount);
        return sum;
      })
    );
    const max = Math.max(...totals, 1);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const cap = Math.ceil((max * 1.1) / 100) * 100 || 100;
    const eu = (n) => "€" + Math.round(n).toLocaleString("de-AT");

    const cols = card.querySelectorAll(".dayn-col");
    cols.forEach((col, i) => {
      const bar = col.querySelector(".dayn-bar");
      const v = col.querySelector(".v");
      if (!bar) return;
      const val = totals[i] || 0;
      bar.style.height = (val / cap) * 100 + "%";
      if (v) v.textContent = eu(val);
      bar.classList.remove("over", "under", "current");
      col.classList.toggle("current", i === cols.length - 1);
      if (i === cols.length - 1) bar.classList.add("current");
      else if (val > avg * 1.1) bar.classList.add("over");
      else if (val < avg * 0.85) bar.classList.add("under");
      col.setAttribute("title", `${months[i].label} · day 1–${(months[i].end || "").slice(-2)} → ${eu(val)}`);
    });

    const avgLine = card.querySelector(".dayn-avgline");
    if (avgLine) {
      avgLine.style.bottom = `calc(100% * ${avg} / ${cap})`;
      const lbl = avgLine.querySelector("span");
      if (lbl) lbl.textContent = `avg ${eu(avg)}`;
    }
    const yaxis = card.querySelector(".dayn-yaxis");
    if (yaxis) {
      yaxis.innerHTML = [cap, cap * 0.75, cap * 0.5, cap * 0.25, 0]
        .map((l) => `<span>${eu(l)}</span>`).join("");
    }
    const labels = card.querySelectorAll(".dayn-labels span");
    labels.forEach((el, i) => {
      if (i < months.length) {
        const isCurr = i === labels.length - 1;
        el.innerHTML = isCurr ? `<b>${months[i].label}</b>` : months[i].label;
        el.classList.toggle("text-mint", isCurr);
      }
    });
    const current = totals[totals.length - 1] || 0;
    const diff = avg ? ((current - avg) / avg) * 100 : 0;
    const stat = card.querySelector(".card-header > span.text-muted.small");
    if (stat) {
      const color = diff < 0 ? "var(--pala-mint)" : "var(--pala-danger)";
      const word = diff < 0 ? "under" : "over";
      stat.innerHTML = `<b style="color:var(--pala-mint)">${eu(current)}</b> this month · 12-mo avg ${eu(avg)} · <span style="color:${color}">${Math.abs(diff).toFixed(1)}% ${word}</span>`;
    }
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
