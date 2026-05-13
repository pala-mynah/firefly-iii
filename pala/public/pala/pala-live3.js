/* pala-live3.js — Phase 2 detail-page handlers.
   Tag, Bill, Rule, Piggy, Recurring. Each page is identified by
   <body data-page="..."> and self-contained inside an IIFE. */
(function () {
  const tok  = () => localStorage.getItem("pala_pat") || "";
  const base = () => (localStorage.getItem("pala_url") || location.origin).replace(/\/$/, "") + "/api/v1";
  const fbase = () => (localStorage.getItem("pala_url") || location.origin).replace(/\/$/, "");
  const esc  = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt  = (n) => "€" + Number(n).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dat  = (s) => s ? new Date(s).toLocaleDateString("en-GB") : "—";
  const qs   = (k) => new URLSearchParams(location.search).get(k);
  async function api(path, opts = {}) {
    const r = await fetch(base() + path, {
      headers: { Authorization: "Bearer " + tok(), Accept: "application/json", "Content-Type": "application/json" },
      ...opts,
    });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.status === 204 ? null : r.json();
  }
  const $k = (k) => document.querySelector(`[data-k="${k}"]`);
  const setText = (k, v) => { const el = $k(k); if (el) el.textContent = v; };
  const setHTML = (k, v) => { const el = $k(k); if (el) el.innerHTML = v; };
  const toast   = (kind, t, opts) => window.palaToast ? window.palaToast[kind](t, opts) : null;
  const txRow = (t, opts = {}) => {
    const inner = t.attributes.transactions[0];
    const amt = parseFloat(inner.amount);
    const sign = inner.type === "deposit" ? "+" : inner.type === "transfer" ? "" : "−";
    const cls  = inner.type === "deposit" ? "text-success" : inner.type === "transfer" ? "text-info" : "text-danger";
    const counter = inner.type === "deposit" ? inner.source_name : inner.destination_name;
    const cols = opts.simple
      ? `<td><a class="kv-link" href="transaction-show.html?tx=${t.id}">${dat(inner.date)}</a></td><td>${esc(inner.description || "—")}</td><td class="text-end ${cls}" style="font-variant-numeric:tabular-nums;">${sign}${fmt(amt)}</td>`
      : `<td><a class="kv-link" href="transaction-show.html?tx=${t.id}">${dat(inner.date)}</a></td><td>${esc(inner.description || "—")}</td><td>${esc(counter || "—")}</td><td class="text-end ${cls}" style="font-variant-numeric:tabular-nums;">${sign}${fmt(amt)}</td>`;
    return `<tr>${cols}</tr>`;
  };

  /* ─── Tag detail ─────────────────────────────────────────────────────── */
  async function pageTagShow() {
    const idOrTag = qs("id") || qs("tag");
    if (!idOrTag) { setText("tag-name", "No tag specified"); return; }
    try {
      const res = await api(`/tags/${encodeURIComponent(idOrTag)}`);
      const a = res.data.attributes;
      const tagId = res.data.id;
      const tagName = a.tag;
      document.title = `#${tagName} — Firefly III · Pala`;
      setText("tag-name", tagName);
      setText("tag-id-line", `#${tagId}`);
      setText("tag-date-range", a.date ? `Reference date: ${dat(a.date)}` : (a.description || ""));

      const tx = await api(`/tags/${encodeURIComponent(tagName)}/transactions?limit=200`).catch(() => ({ data: [] }));
      const rows = tx.data || [];
      let spent = 0, income = 0;
      const byCat = new Map(), byCounter = new Map();
      rows.forEach(t => {
        const i = t.attributes.transactions[0];
        const amt = parseFloat(i.amount);
        if (i.type === "deposit") income += amt;
        else if (i.type === "withdrawal") spent += amt;
        const cat = i.category_name || "(no category)";
        byCat.set(cat, (byCat.get(cat) || 0) + (i.type === "withdrawal" ? amt : 0));
        const cp = i.type === "deposit" ? i.source_name : i.destination_name;
        if (cp) byCounter.set(cp, (byCounter.get(cp) || 0) + amt);
      });
      setText("tag-count",  rows.length);
      setText("tag-spent",  fmt(spent));
      setText("tag-income", fmt(income));
      const net = income - spent;
      const netEl = $k("tag-net");
      if (netEl) { netEl.textContent = (net >= 0 ? "+" : "−") + fmt(Math.abs(net)); netEl.className = "kpi-value " + (net >= 0 ? "text-success" : "text-danger"); }

      const renderBars = (key, map) => {
        const arr = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8);
        const max = arr[0] ? arr[0][1] : 1;
        setHTML(key, arr.length
          ? arr.map(([name, v]) => `<div class="bar-row"><div class="bar-name">${esc(name)}</div><div class="bar"><div class="bar-fill" style="width:${Math.max(2, (v/max*100)).toFixed(1)}%"></div></div><div class="bar-val">${fmt(v)}</div></div>`).join("")
          : '<div class="text-muted small">No data.</div>');
      };
      renderBars("tag-by-category",     byCat);
      renderBars("tag-by-counterparty", byCounter);

      const txBody = $k("tag-tx-body");
      if (txBody) {
        if (!rows.length) txBody.innerHTML = '<tr><td colspan="4" class="text-muted small p-3">No transactions tagged.</td></tr>';
        else txBody.innerHTML = rows.slice(0, 30).map(t => txRow(t)).join("");
      }
      setText("tag-tx-count", rows.length);
      setText("tag-tx-info", rows.length > 30 ? `Showing 30 of ${rows.length}` : `${rows.length} transactions`);
      const all = $k("tag-tx-all"); if (all) all.href = `transactions.html?tag=${encodeURIComponent(tagName)}`;

      const edit = $k("tag-edit-btn"); if (edit) edit.href = `${fbase()}/tags/edit/${tagId}`;

      $k("tag-act-rename")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const v = await palaPrompt({ title: "Rename tag", message: "New name for this tag:", value: tagName, confirmLabel: "Rename" });
        if (!v || v === tagName) return;
        try { await api(`/tags/${encodeURIComponent(tagName)}`, { method: "PUT", body: JSON.stringify({ tag: v }) });
          toast("success", "Tag renamed", { msg: `→ #${v}` }); setTimeout(() => location.href = `tag-show.html?tag=${encodeURIComponent(v)}`, 600);
        } catch (err) { toast("danger", "Rename failed", { msg: err.message }); }
      });
      $k("tag-act-export")?.addEventListener("click", (e) => { e.preventDefault(); location.href = `${fbase()}/export?tag=${encodeURIComponent(tagName)}`; });
      $k("tag-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete tag?", message: `Tag #${tagName} will be removed from ${rows.length} transactions. Transactions themselves are kept.`, confirmLabel: "Delete", danger: true }))) return;
        try { await api(`/tags/${encodeURIComponent(tagName)}`, { method: "DELETE" });
          toast("danger", "Tag deleted", { msg: `#${tagName}` }); setTimeout(() => location.href = "tags.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { setText("tag-name", "Failed to load"); console.error(e); }
  }

  /* ─── Bill detail ────────────────────────────────────────────────────── */
  async function pageBillShow() {
    const id = qs("id");
    if (!id) { setText("bill-name", "No subscription specified"); return; }
    try {
      const today = new Date();
      const yStart = `${today.getFullYear()}-01-01`;
      const yEnd   = `${today.getFullYear()}-12-31`;
      const res = await api(`/bills/${id}?start=${yStart}&end=${yEnd}`);
      const a = res.data.attributes;
      const sym = a.currency_symbol || "€";
      const lo = parseFloat(a.amount_min || 0), hi = parseFloat(a.amount_max || 0);
      document.title = `${a.name} — Firefly III · Pala`;
      setText("bill-name", a.name);
      setText("bill-id-line", `#${id}`);
      setText("bill-repeat", `Every ${a.repeat_freq}${a.skip ? `, skipping ${a.skip}` : ""}`);
      setText("bill-amount", `${sym}${lo.toFixed(2)} – ${sym}${hi.toFixed(2)}`);
      setText("bill-range", `${sym}${lo.toFixed(2)} – ${sym}${hi.toFixed(2)}`);
      const nextDate = (a.next_expected_match || (a.next_expected_match_diff || ""));
      setText("bill-next", a.next_expected_match ? dat(a.next_expected_match) : "—");
      setText("bill-paid-ytd", a.paid_dates && a.paid_dates.length ? fmt((lo + hi)/2 * a.paid_dates.length) : "—");
      setText("bill-avg", fmt((lo + hi) / 2));
      setText("bill-currency", `${a.currency_code} (${sym})`);
      setText("bill-freq", a.repeat_freq);
      setText("bill-skip", String(a.skip || 0));
      setText("bill-group", a.object_group_title || "—");
      setHTML("bill-notes", a.notes ? `<div class="note-box">${esc(a.notes)}</div>` : '<span class="text-muted">—</span>');
      setText("bill-created", a.created_at ? new Date(a.created_at).toLocaleString("en-GB") : "—");
      setText("bill-updated", a.updated_at ? new Date(a.updated_at).toLocaleString("en-GB") : "—");

      const chip = $k("bill-status-chip");
      const statusCls = a.active ? (a.next_expected_match && new Date(a.next_expected_match) < today ? "late" : "active") : "inactive";
      if (chip) chip.className = "bill-status-chip " + statusCls;
      setText("bill-status-label", a.active ? (statusCls === "late" ? "Late" : "Active") : "Inactive");

      // History strip — paid_dates is array of "yyyy-mm-dd"
      const paid = new Set((a.paid_dates || []).map(d => (d.date || d).slice(0,7)));
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        months.push({ ym, label: d.toLocaleDateString("en-GB", { month: "short" }), paid: paid.has(ym), future: d > today });
      }
      setHTML("bill-history", months.map(m => `<div class="dot ${m.future ? 'fut' : m.paid ? 'hit' : 'miss'}"><div class="m">${m.label}</div><div class="a">${m.future ? '·' : m.paid ? '✓' : '–'}</div></div>`).join(""));

      // Linked transactions
      const tx = await api(`/bills/${id}/transactions?limit=100`).catch(() => ({ data: [] }));
      const rows = tx.data || [];
      const txBody = $k("bill-tx-body");
      if (txBody) {
        if (!rows.length) txBody.innerHTML = '<tr><td colspan="4" class="text-muted small p-3">No linked transactions.</td></tr>';
        else txBody.innerHTML = rows.slice(0, 30).map(t => txRow(t)).join("");
      }
      setText("bill-tx-count", `${rows.length} linked`);

      const edit = $k("bill-edit-btn"); if (edit) edit.href = `${fbase()}/bills/edit/${id}`;
      $k("bill-act-toggle")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const want = !a.active;
        try { await api(`/bills/${id}`, { method: "PUT", body: JSON.stringify({ active: want }) });
          toast("success", want ? "Subscription resumed" : "Subscription paused"); setTimeout(() => location.reload(), 600);
        } catch (err) { toast("danger", "Update failed", { msg: err.message }); }
      });
      setText("bill-act-toggle-label", a.active ? "Pause" : "Resume");
      $k("bill-act-rules")?.addEventListener("click", (e) => { e.preventDefault(); location.href = `${fbase()}/rules/select/${id}`; });
      $k("bill-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete subscription?", message: `“${a.name}” will be removed. Linked transactions are kept.`, confirmLabel: "Delete", danger: true }))) return;
        try { await api(`/bills/${id}`, { method: "DELETE" });
          toast("danger", "Subscription deleted", { msg: a.name }); setTimeout(() => location.href = "bills.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { setText("bill-name", "Failed to load"); console.error(e); }
  }

  /* ─── Rule detail ────────────────────────────────────────────────────── */
  async function pageRuleShow() {
    const id = qs("id");
    if (!id) { setText("rule-title", "No rule specified"); return; }
    try {
      const res = await api(`/rules/${id}`);
      const a = res.data.attributes;
      document.title = `${a.title} — Firefly III · Pala`;
      setText("rule-title", a.title);
      setText("rule-id-line", `#${id}`);
      setText("rule-description", a.description || "");
      setText("rule-group", a.rule_group_title || "—");
      const groupEl = $k("rule-group"); if (groupEl && a.rule_group_id) groupEl.href = `rules.html#group-${a.rule_group_id}`;
      setText("rule-order", a.order || "—");
      setText("rule-trigger-type", a.trigger);
      setText("rule-created", a.created_at ? new Date(a.created_at).toLocaleString("en-GB") : "—");
      setText("rule-updated", a.updated_at ? new Date(a.updated_at).toLocaleString("en-GB") : "—");

      const setFlag = (k, on, labelOn, labelOff) => {
        const el = $k(k);
        if (!el) return;
        el.className = "flag-chip " + (on ? "on" : "off");
        el.textContent = on ? labelOn : labelOff;
      };
      setFlag("rule-active",    a.active,        "Active",     "Inactive");
      setFlag("rule-strict",    a.strict,        "Strict",     "Lenient");
      setFlag("rule-stoponhit", a.stop_processing,"Stop on hit","Continue");

      const trigs   = (a.triggers || []).filter(t => t.type !== "user_action");
      const actions = a.actions || [];
      setText("rule-trigger-count", trigs.length);
      setText("rule-action-count", actions.length);
      setText("rule-triggers-mode", `(${a.strict ? "all must match" : "any may match"})`);

      setHTML("rule-triggers", trigs.length
        ? trigs.map((t, i) => `<div class="rule-step${t.active === false ? " disabled" : ""}${t.stop_processing ? " stop" : ""}"><div class="num">${i+1}.</div><div class="ico"><i class="fa-solid fa-filter"></i></div><div class="body"><code>${esc(t.type)}</code> ${t.value ? '<span class="text-muted">→</span> ' + esc(t.value) : ""}</div></div>`).join("")
        : '<div class="text-muted small p-3">No triggers.</div>');
      setHTML("rule-actions", actions.length
        ? actions.map((t, i) => `<div class="rule-step${t.active === false ? " disabled" : ""}${t.stop_processing ? " stop" : ""}"><div class="num">${i+1}.</div><div class="ico"><i class="fa-solid fa-bolt"></i></div><div class="body"><code>${esc(t.type)}</code> ${t.value ? '<span class="text-muted">→</span> ' + esc(t.value) : ""}${t.stop_processing ? ' <span class="text-warning small">· stop after</span>' : ""}</div></div>`).join("")
        : '<div class="text-muted small p-3">No actions.</div>');

      const edit = $k("rule-edit-btn"); if (edit) edit.href = `${fbase()}/rules/edit/${id}`;
      $k("rule-test-btn")?.addEventListener("click", async () => {
        try {
          const r = await api(`/rules/${id}/test`);
          const hits = (r.data || []).slice(0, 20);
          palaModal({
            title: `Test results — ${hits.length} matching transaction${hits.length === 1 ? "" : "s"}`,
            wide: true,
            body: hits.length ? `<div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Date</th><th>Description</th><th class="text-end">Amount</th></tr></thead><tbody>${hits.map(t => txRow(t, { simple: true })).join("")}</tbody></table></div>` : '<p class="text-muted">No matching transactions found.</p>',
            footer: `<button class="btn btn-outline-secondary" data-act="ok">Close</button>`,
            onClose: () => {},
          }).footEl.querySelector('[data-act="ok"]').addEventListener("click", (e) => e.target.closest(".pala-backdrop").click());
        } catch (err) { toast("danger", "Test failed", { msg: err.message }); }
      });
      $k("rule-fire-btn")?.addEventListener("click", async () => {
        if (!(await palaConfirm({ title: "Fire rule on existing transactions?", message: "All transactions matching this rule will be modified by its actions. This may take a moment.", confirmLabel: "Fire" }))) return;
        try { await api(`/rules/${id}/trigger`, { method: "POST" }); toast("success", "Rule fired", { msg: "Matching transactions have been updated." }); }
        catch (err) { toast("danger", "Fire failed", { msg: err.message }); }
      });
      setText("rule-act-toggle-label", a.active ? "Disable" : "Enable");
      $k("rule-act-toggle")?.addEventListener("click", async (e) => {
        e.preventDefault();
        try { await api(`/rules/${id}`, { method: "PUT", body: JSON.stringify({ active: !a.active }) });
          toast("success", a.active ? "Rule disabled" : "Rule enabled"); setTimeout(() => location.reload(), 600);
        } catch (err) { toast("danger", "Update failed", { msg: err.message }); }
      });
      $k("rule-act-duplicate")?.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const body = { title: a.title + " (copy)", description: a.description, rule_group_id: a.rule_group_id, trigger: a.trigger, strict: a.strict, stop_processing: a.stop_processing, active: false, triggers: a.triggers || [], actions: a.actions || [] };
          const cr = await api(`/rules`, { method: "POST", body: JSON.stringify(body) });
          toast("success", "Rule duplicated", { msg: "Saved as “" + body.title + "”", actions: [{ label: "Open", onClick: () => location.href = `rule-show.html?id=${cr.data.id}` }] });
        } catch (err) { toast("danger", "Duplicate failed", { msg: err.message }); }
      });
      $k("rule-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete rule?", message: `“${a.title}” will be permanently removed. Past changes to transactions are kept.`, confirmLabel: "Delete", danger: true }))) return;
        try { await api(`/rules/${id}`, { method: "DELETE" });
          toast("danger", "Rule deleted", { msg: a.title }); setTimeout(() => location.href = "rules.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { setText("rule-title", "Failed to load"); console.error(e); }
  }

  /* ─── Piggy detail ───────────────────────────────────────────────────── */
  async function pagePiggyShow() {
    const id = qs("id");
    if (!id) { setText("piggy-name", "No piggy specified"); return; }
    try {
      const res = await api(`/piggy_banks/${id}`);
      const a = res.data.attributes;
      const sym = a.currency_symbol || "€";
      document.title = `${a.name} — Firefly III · Pala`;
      setText("piggy-name", a.name);
      setText("piggy-id-line", `#${id}`);
      setText("piggy-account", `In ${a.account_name || "—"}`);
      setText("piggy-target-date", a.target_date ? `Target by ${dat(a.target_date)}` : "No target date");

      const saved = parseFloat(a.current_amount || 0);
      const target = parseFloat(a.target_amount || 0);
      const remaining = Math.max(0, target - saved);
      const pct = target > 0 ? Math.min(100, (saved / target * 100)) : 0;
      setText("piggy-saved", `${sym}${saved.toFixed(2)}`);
      setText("piggy-target", target ? `${sym}${target.toFixed(2)}` : "—");
      setText("piggy-remaining", `${sym}${remaining.toFixed(2)}`);
      setText("piggy-pct", pct.toFixed(0) + "%");
      const fill = $k("piggy-fill"); if (fill) fill.style.width = pct + "%";
      setText("piggy-pct-label", pct.toFixed(1) + "%");
      setText("piggy-currency", `${a.currency_code} (${sym})`);
      setText("piggy-start-date", dat(a.start_date));
      setText("piggy-group", a.object_group_title || "—");
      setHTML("piggy-notes", a.notes ? `<div class="note-box">${esc(a.notes)}</div>` : '<span class="text-muted">—</span>');
      setText("piggy-created", a.created_at ? new Date(a.created_at).toLocaleString("en-GB") : "—");

      const ev = await api(`/piggy_banks/${id}/events?limit=100`).catch(() => ({ data: [] }));
      const events = ev.data || [];
      const evWrap = $k("piggy-events");
      if (evWrap) {
        if (!events.length) evWrap.innerHTML = '<div class="text-muted small p-3">No events.</div>';
        else evWrap.innerHTML = events.map(e => {
          const ea = e.attributes;
          const amt = parseFloat(ea.amount);
          const sign = amt >= 0 ? "+" : "−";
          const cls  = amt >= 0 ? "text-success" : "text-danger";
          return `<div class="event-row"><div class="e-when">${dat(ea.created_at)}</div><div class="e-what">${esc(ea.transaction_journal_id ? "Linked transaction" : "Manual entry")}</div><div class="e-amt ${cls}">${sign}${fmt(Math.abs(amt))}</div></div>`;
        }).join("");
      }

      const edit = $k("piggy-edit-btn"); if (edit) edit.href = `${fbase()}/piggy-banks/edit/${id}`;

      const addRemove = async (sign) => {
        const v = await palaPrompt({ title: sign > 0 ? "Add money" : "Remove money", message: sign > 0 ? `How much to add to ${a.name}?` : `How much to take from ${a.name}?`, placeholder: "0.00", confirmLabel: sign > 0 ? "Add" : "Remove" });
        if (!v || isNaN(parseFloat(v))) return;
        const amt = (sign * Math.abs(parseFloat(v))).toFixed(2);
        try { await api(`/piggy_banks/${id}`, { method: "PUT", body: JSON.stringify({ current_amount: (saved + parseFloat(amt)).toFixed(2) }) });
          toast("success", sign > 0 ? "Money added" : "Money removed", { msg: `${sign > 0 ? "+" : "−"}${sym}${Math.abs(parseFloat(amt)).toFixed(2)}` });
          setTimeout(() => location.reload(), 600);
        } catch (err) { toast("danger", "Update failed", { msg: err.message }); }
      };
      $k("piggy-add-btn")?.addEventListener("click", () => addRemove(+1));
      $k("piggy-remove-btn")?.addEventListener("click", () => addRemove(-1));
      $k("piggy-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete piggy bank?", message: `“${a.name}” will be removed. The saved money stays in the linked account.`, confirmLabel: "Delete", danger: true }))) return;
        try { await api(`/piggy_banks/${id}`, { method: "DELETE" });
          toast("danger", "Piggy bank deleted", { msg: a.name }); setTimeout(() => location.href = "piggy.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { setText("piggy-name", "Failed to load"); console.error(e); }
  }

  /* ─── Recurring detail ───────────────────────────────────────────────── */
  async function pageRecurringShow() {
    const id = qs("id");
    if (!id) { setText("rec-title", "No recurring specified"); return; }
    try {
      const res = await api(`/recurrences/${id}`);
      const a = res.data.attributes;
      const tpl = (a.transactions && a.transactions[0]) || {};
      const rep = (a.repetitions && a.repetitions[0]) || {};
      const sym = tpl.currency_symbol || "€";
      const amt = parseFloat(tpl.amount || 0);
      document.title = `${a.title} — Firefly III · Pala`;
      setText("rec-title", a.title);
      setText("rec-id-line", `#${id}`);
      setText("rec-description", a.description || "");
      setText("rec-type", tpl.type ? tpl.type.charAt(0).toUpperCase() + tpl.type.slice(1) : "—");
      setText("rec-amount", `${sym}${amt.toFixed(2)}`);

      const occ = rep.occurrences || [];
      const future = occ.filter(d => new Date(d) >= new Date());
      setText("rec-next", future.length ? dat(future[0]) : "—");
      setText("rec-latest", a.latest_date ? dat(a.latest_date) : "—");

      const activeChip = $k("rec-active-chip");
      if (activeChip) { activeChip.className = "flag-chip " + (a.active ? "on" : "off"); activeChip.textContent = a.active ? "Active" : "Paused"; }

      setText("rec-source", tpl.source_name || "—");
      setText("rec-destination", tpl.destination_name || "—");
      setHTML("rec-category", tpl.category_id ? `<a class="kv-link" href="category-show.html?id=${tpl.category_id}">${esc(tpl.category_name)}</a>` : '<span class="text-muted">—</span>');
      setHTML("rec-budget",   tpl.budget_id   ? `<a class="kv-link" href="budget-show.html?id=${tpl.budget_id}">${esc(tpl.budget_name)}</a>`     : '<span class="text-muted">—</span>');
      setHTML("rec-tags", (tpl.tags || []).length ? tpl.tags.map(t => `<a class="tag-pill" href="tag-show.html?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join(" ") : '<span class="text-muted">—</span>');
      setText("rec-currency", `${tpl.currency_code || "—"} (${sym})`);
      setHTML("rec-notes", a.notes ? `<div class="note-box">${esc(a.notes)}</div>` : '<span class="text-muted">—</span>');

      setText("rec-repeats", `${rep.type || "—"} · ${rep.moment || ""}`);
      setText("rec-skip", String(rep.skip || 0));
      setText("rec-first-date", dat(a.first_date));
      setText("rec-repeat-until", a.repeat_until ? dat(a.repeat_until) : (a.nr_of_repetitions ? `${a.nr_of_repetitions} times` : "Forever"));
      setText("rec-apply-rules", a.apply_rules ? "Yes" : "No");
      setText("rec-nr-fired", String(a.nr_of_repetitions || rep.repetitions || 0));

      setHTML("rec-upcoming", future.length
        ? future.slice(0, 8).map(d => `<div class="upcoming-row"><div class="u-date">${dat(d)}</div><div class="u-amt">${sym}${amt.toFixed(2)}</div></div>`).join("")
        : '<div class="text-muted small p-3">No upcoming occurrences.</div>');

      const tx = await api(`/recurrences/${id}/transactions?limit=100`).catch(() => ({ data: [] }));
      const rows = tx.data || [];
      const txBody = $k("rec-tx-body");
      if (txBody) {
        if (!rows.length) txBody.innerHTML = '<tr><td colspan="3" class="text-muted small p-3">No generated transactions yet.</td></tr>';
        else txBody.innerHTML = rows.slice(0, 30).map(t => txRow(t, { simple: true })).join("");
      }
      setText("rec-tx-count", `${rows.length} generated`);

      const edit = $k("rec-edit-btn"); if (edit) edit.href = `${fbase()}/recurring/edit/${id}`;
      setText("rec-act-toggle-label", a.active ? "Pause" : "Resume");
      $k("rec-act-toggle")?.addEventListener("click", async (e) => {
        e.preventDefault();
        try { await api(`/recurrences/${id}`, { method: "PUT", body: JSON.stringify({ active: !a.active }) });
          toast("success", a.active ? "Recurring paused" : "Recurring resumed"); setTimeout(() => location.reload(), 600);
        } catch (err) { toast("danger", "Update failed", { msg: err.message }); }
      });
      $k("rec-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete recurring?", message: `“${a.title}” will be removed. Already-generated transactions are kept.`, confirmLabel: "Delete", danger: true }))) return;
        try { await api(`/recurrences/${id}`, { method: "DELETE" });
          toast("danger", "Recurring deleted", { msg: a.title }); setTimeout(() => location.href = "recurring.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { setText("rec-title", "Failed to load"); console.error(e); }
  }

  /* ─── Dispatch ───────────────────────────────────────────────────────── */
  function boot3() {
    const page = document.body.dataset.page;
    if (page === "tag-show")       pageTagShow();
    else if (page === "bill-show") pageBillShow();
    else if (page === "rule-show") pageRuleShow();
    else if (page === "piggy-show") pagePiggyShow();
    else if (page === "recurring-show") pageRecurringShow();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot3);
  else boot3();
})();
