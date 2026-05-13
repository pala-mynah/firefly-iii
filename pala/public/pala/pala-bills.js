/* pala-bills.js — Bills list + bill detail. */
(function () {
  const { api, esc, fmt, dat, qs, $k, setTbody, loadingRow, errorRow, emptyRow,
          wirePeriodChrome, fbase } = window.Pala;

  const toast = (kind, t, opts) => window.palaToast ? window.palaToast[kind](t, opts) : null;

  const txRow = (t) => {
    const inner = t.attributes.transactions[0];
    const amt = parseFloat(inner.amount);
    const sign = inner.type === "deposit" ? "+" : inner.type === "transfer" ? "" : "−";
    const cls  = inner.type === "deposit" ? "text-success" : inner.type === "transfer" ? "text-info" : "text-danger";
    const counter = inner.type === "deposit" ? inner.source_name : inner.destination_name;
    return `<tr>
      <td><a class="kv-link" href="transaction-show.html?tx=${t.id}">${dat(inner.date)}</a></td>
      <td>${esc(inner.description || "—")}</td>
      <td>${esc(counter || "—")}</td>
      <td class="text-end ${cls}" style="font-variant-numeric:tabular-nums;">${sign}${fmt(amt)}</td>
    </tr>`;
  };

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
          <td><a href="bill-show.html?id=${b.id}">${esc(at.name)}</a><small class="text-muted d-block">${esc(at.repeat_freq || "")}</small></td>
          <td class="text-end text-nowrap">${fmt(amt)}</td>
          <td>${at.paid_dates && at.paid_dates.length ? `<span class="text-success">Paid ${dat(at.paid_dates[0].date)}</span>` : `<span class="text-muted">Unpaid</span>`}</td>
          <td class="d-none d-lg-table-cell text-muted small">${dat(at.next_expected_match)}</td>
          <td class="d-none d-lg-table-cell">${at.active ? `<span class="badge bg-success-subtle text-success">Active</span>` : `<span class="badge bg-secondary">Inactive</span>`}</td>
        </tr>`;
      }).join(""));
    } catch (e) { setTbody(errorRow(6, e)); }
  }

  async function pageBillShow() {
    const id = qs("id");
    if (!id) { const el = $k("bill-name"); if (el) el.textContent = "No subscription specified"; return; }
    try {
      const today = new Date();
      const yStart = `${today.getFullYear()}-01-01`;
      const yEnd   = `${today.getFullYear()}-12-31`;
      const res = await api(`/bills/${id}?start=${yStart}&end=${yEnd}`);
      const a = res.data.attributes;
      const sym = a.currency_symbol || "€";
      const lo = parseFloat(a.amount_min || 0), hi = parseFloat(a.amount_max || 0);
      document.title = `${a.name} — Firefly III · Pala`;
      if ($k("bill-name"))     $k("bill-name").textContent     = a.name;
      if ($k("bill-id-line"))  $k("bill-id-line").textContent  = `#${id}`;
      if ($k("bill-repeat"))   $k("bill-repeat").textContent   = `Every ${a.repeat_freq}${a.skip ? `, skipping ${a.skip}` : ""}`;
      if ($k("bill-amount"))   $k("bill-amount").textContent   = `${sym}${lo.toFixed(2)} – ${sym}${hi.toFixed(2)}`;
      if ($k("bill-range"))    $k("bill-range").textContent    = `${sym}${lo.toFixed(2)} – ${sym}${hi.toFixed(2)}`;
      if ($k("bill-next"))     $k("bill-next").textContent     = a.next_expected_match ? dat(a.next_expected_match) : "—";
      if ($k("bill-paid-ytd")) $k("bill-paid-ytd").textContent = a.paid_dates && a.paid_dates.length ? fmt((lo + hi)/2 * a.paid_dates.length) : "—";
      if ($k("bill-avg"))      $k("bill-avg").textContent      = fmt((lo + hi) / 2);
      if ($k("bill-currency")) $k("bill-currency").textContent = `${a.currency_code} (${sym})`;
      if ($k("bill-freq"))     $k("bill-freq").textContent     = a.repeat_freq;
      if ($k("bill-skip"))     $k("bill-skip").textContent     = String(a.skip || 0);
      if ($k("bill-group"))    $k("bill-group").textContent    = a.object_group_title || "—";
      if ($k("bill-notes"))    $k("bill-notes").innerHTML      = a.notes ? `<div class="note-box">${esc(a.notes)}</div>` : '<span class="text-muted">—</span>';
      if ($k("bill-created"))  $k("bill-created").textContent  = a.created_at ? new Date(a.created_at).toLocaleString("en-GB") : "—";
      if ($k("bill-updated"))  $k("bill-updated").textContent  = a.updated_at ? new Date(a.updated_at).toLocaleString("en-GB") : "—";

      const chip = $k("bill-status-chip");
      const statusCls = a.active ? (a.next_expected_match && new Date(a.next_expected_match) < today ? "late" : "active") : "inactive";
      if (chip) chip.className = "bill-status-chip " + statusCls;
      if ($k("bill-status-label")) $k("bill-status-label").textContent = a.active ? (statusCls === "late" ? "Late" : "Active") : "Inactive";

      const paid = new Set((a.paid_dates || []).map(d => (d.date || d).slice(0,7)));
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        months.push({ ym, label: d.toLocaleDateString("en-GB", { month: "short" }), paid: paid.has(ym), future: d > today });
      }
      if ($k("bill-history")) $k("bill-history").innerHTML = months.map(m => `<div class="dot ${m.future ? 'fut' : m.paid ? 'hit' : 'miss'}"><div class="m">${m.label}</div><div class="a">${m.future ? '·' : m.paid ? '✓' : '–'}</div></div>`).join("");

      const tx = await api(`/bills/${id}/transactions?limit=100`).catch(() => ({ data: [] }));
      const rows = tx.data || [];
      const txBody = $k("bill-tx-body");
      if (txBody) {
        if (!rows.length) txBody.innerHTML = '<tr><td colspan="4" class="text-muted small p-3">No linked transactions.</td></tr>';
        else txBody.innerHTML = rows.slice(0, 30).map(txRow).join("");
      }
      if ($k("bill-tx-count")) $k("bill-tx-count").textContent = `${rows.length} linked`;

      const edit = $k("bill-edit-btn"); if (edit) edit.href = `${fbase()}/bills/edit/${id}`;
      $k("bill-act-toggle")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const want = !a.active;
        try {
          await api(`/bills/${id}`, { method: "PUT", body: JSON.stringify({ active: want }) });
          toast("success", want ? "Subscription resumed" : "Subscription paused");
          setTimeout(() => location.reload(), 600);
        } catch (err) { toast("danger", "Update failed", { msg: err.message }); }
      });
      if ($k("bill-act-toggle-label")) $k("bill-act-toggle-label").textContent = a.active ? "Pause" : "Resume";
      $k("bill-act-rules")?.addEventListener("click", (e) => { e.preventDefault(); location.href = `${fbase()}/rules/select/${id}`; });
      $k("bill-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete subscription?", message: `"${a.name}" will be removed. Linked transactions are kept.`, confirmLabel: "Delete", danger: true }))) return;
        try {
          await api(`/bills/${id}`, { method: "DELETE" });
          toast("danger", "Subscription deleted", { msg: a.name });
          setTimeout(() => location.href = "bills.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { const el = $k("bill-name"); if (el) el.textContent = "Failed to load"; console.error(e); }
  }

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    if (page === "bills")          pageBills();
    else if (page === "bill-show") pageBillShow();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
