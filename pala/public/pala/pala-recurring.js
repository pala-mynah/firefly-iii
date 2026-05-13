/* pala-recurring.js — Recurring transactions list + detail. */
(function () {
  const { api, esc, fmt, dat, qs, $k, setTbody, loadingRow, errorRow, emptyRow,
          wirePeriodChrome, fbase } = window.Pala;

  const toast = (kind, t, opts) => window.palaToast ? window.palaToast[kind](t, opts) : null;

  const txRow = (t) => {
    const inner = t.attributes.transactions[0];
    const amt = parseFloat(inner.amount);
    const sign = inner.type === "deposit" ? "+" : inner.type === "transfer" ? "" : "−";
    const cls  = inner.type === "deposit" ? "text-success" : inner.type === "transfer" ? "text-info" : "text-danger";
    return `<tr>
      <td><a class="kv-link" href="transaction-show.html?tx=${t.id}">${dat(inner.date)}</a></td>
      <td>${esc(inner.description || "—")}</td>
      <td class="text-end ${cls}" style="font-variant-numeric:tabular-nums;">${sign}${fmt(amt)}</td>
    </tr>`;
  };

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
          <td><a href="recurring-show.html?id=${r.id}">${esc(at.title)}</a><small class="text-muted d-block">${esc(at.description || "")}</small></td>
          <td class="text-end text-nowrap">${fmt(tx0.amount || 0)}</td>
          <td class="text-muted small">${esc(at.repetitions?.[0]?.type || "")}</td>
          <td class="text-muted small">${dat(at.first_date)}</td>
        </tr>`;
      }).join(""));
    } catch (e) { setTbody(errorRow(5, e)); }
  }

  async function pageRecurringShow() {
    const id = qs("id");
    if (!id) { const el = $k("rec-title"); if (el) el.textContent = "No recurring specified"; return; }
    try {
      const res = await api(`/recurrences/${id}`);
      const a = res.data.attributes;
      const tpl = (a.transactions && a.transactions[0]) || {};
      const rep = (a.repetitions && a.repetitions[0]) || {};
      const sym = tpl.currency_symbol || "€";
      const amt = parseFloat(tpl.amount || 0);
      document.title = `${a.title} — Firefly III · Pala`;
      if ($k("rec-title"))       $k("rec-title").textContent       = a.title;
      if ($k("rec-id-line"))     $k("rec-id-line").textContent     = `#${id}`;
      if ($k("rec-description")) $k("rec-description").textContent = a.description || "";
      if ($k("rec-type"))        $k("rec-type").textContent        = tpl.type ? tpl.type.charAt(0).toUpperCase() + tpl.type.slice(1) : "—";
      if ($k("rec-amount"))      $k("rec-amount").textContent      = `${sym}${amt.toFixed(2)}`;

      const occ = rep.occurrences || [];
      const future = occ.filter(d => new Date(d) >= new Date());
      if ($k("rec-next"))   $k("rec-next").textContent   = future.length ? dat(future[0]) : "—";
      if ($k("rec-latest")) $k("rec-latest").textContent = a.latest_date ? dat(a.latest_date) : "—";

      const activeChip = $k("rec-active-chip");
      if (activeChip) { activeChip.className = "flag-chip " + (a.active ? "on" : "off"); activeChip.textContent = a.active ? "Active" : "Paused"; }

      if ($k("rec-source"))      $k("rec-source").textContent      = tpl.source_name || "—";
      if ($k("rec-destination")) $k("rec-destination").textContent = tpl.destination_name || "—";
      if ($k("rec-category"))    $k("rec-category").innerHTML      = tpl.category_id ? `<a class="kv-link" href="category-show.html?id=${tpl.category_id}">${esc(tpl.category_name)}</a>` : '<span class="text-muted">—</span>';
      if ($k("rec-budget"))      $k("rec-budget").innerHTML        = tpl.budget_id   ? `<a class="kv-link" href="budget-show.html?id=${tpl.budget_id}">${esc(tpl.budget_name)}</a>`     : '<span class="text-muted">—</span>';
      if ($k("rec-tags"))        $k("rec-tags").innerHTML          = (tpl.tags || []).length ? tpl.tags.map(t => `<a class="tag-pill" href="tag-show.html?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join(" ") : '<span class="text-muted">—</span>';
      if ($k("rec-currency"))    $k("rec-currency").textContent    = `${tpl.currency_code || "—"} (${sym})`;
      if ($k("rec-notes"))       $k("rec-notes").innerHTML         = a.notes ? `<div class="note-box">${esc(a.notes)}</div>` : '<span class="text-muted">—</span>';

      if ($k("rec-repeats"))       $k("rec-repeats").textContent       = `${rep.type || "—"} · ${rep.moment || ""}`;
      if ($k("rec-skip"))          $k("rec-skip").textContent          = String(rep.skip || 0);
      if ($k("rec-first-date"))    $k("rec-first-date").textContent    = dat(a.first_date);
      if ($k("rec-repeat-until"))  $k("rec-repeat-until").textContent  = a.repeat_until ? dat(a.repeat_until) : (a.nr_of_repetitions ? `${a.nr_of_repetitions} times` : "Forever");
      if ($k("rec-apply-rules"))   $k("rec-apply-rules").textContent   = a.apply_rules ? "Yes" : "No";
      if ($k("rec-nr-fired"))      $k("rec-nr-fired").textContent      = String(a.nr_of_repetitions || rep.repetitions || 0);

      if ($k("rec-upcoming")) $k("rec-upcoming").innerHTML = future.length
        ? future.slice(0, 8).map(d => `<div class="upcoming-row"><div class="u-date">${dat(d)}</div><div class="u-amt">${sym}${amt.toFixed(2)}</div></div>`).join("")
        : '<div class="text-muted small p-3">No upcoming occurrences.</div>';

      const tx = await api(`/recurrences/${id}/transactions?limit=100`).catch(() => ({ data: [] }));
      const rows = tx.data || [];
      const txBody = $k("rec-tx-body");
      if (txBody) {
        if (!rows.length) txBody.innerHTML = '<tr><td colspan="3" class="text-muted small p-3">No generated transactions yet.</td></tr>';
        else txBody.innerHTML = rows.slice(0, 30).map(txRow).join("");
      }
      if ($k("rec-tx-count")) $k("rec-tx-count").textContent = `${rows.length} generated`;

      const edit = $k("rec-edit-btn"); if (edit) edit.href = `${fbase()}/recurring/edit/${id}`;
      if ($k("rec-act-toggle-label")) $k("rec-act-toggle-label").textContent = a.active ? "Pause" : "Resume";
      $k("rec-act-toggle")?.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await api(`/recurrences/${id}`, { method: "PUT", body: JSON.stringify({ active: !a.active }) });
          toast("success", a.active ? "Recurring paused" : "Recurring resumed");
          setTimeout(() => location.reload(), 600);
        } catch (err) { toast("danger", "Update failed", { msg: err.message }); }
      });
      $k("rec-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete recurring?", message: `"${a.title}" will be removed. Already-generated transactions are kept.`, confirmLabel: "Delete", danger: true }))) return;
        try {
          await api(`/recurrences/${id}`, { method: "DELETE" });
          toast("danger", "Recurring deleted", { msg: a.title });
          setTimeout(() => location.href = "recurring.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { const el = $k("rec-title"); if (el) el.textContent = "Failed to load"; console.error(e); }
  }

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    const sub  = document.body.dataset.sub;
    if (page === "automation" && sub === "recurring") pageRecurring();
    else if (page === "recurring-show")               pageRecurringShow();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
