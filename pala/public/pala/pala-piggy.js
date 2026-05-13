/* pala-piggy.js — Piggy banks list + piggy detail. */
(function () {
  const { api, esc, fmt, dat, qs, $k, setTbody, loadingRow, errorRow, emptyRow,
          wirePeriodChrome, fbase } = window.Pala;

  const toast = (kind, t, opts) => window.palaToast ? window.palaToast[kind](t, opts) : null;

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
          <td><a href="piggy-show.html?id=${p.id}">${esc(at.name)}</a></td>
          <td class="text-end text-nowrap">${fmt(saved)}</td>
          <td class="d-none d-md-table-cell"><div class="progress" style="height:6px;background:#13203a"><div class="progress-bar bg-success" style="width:${pct}%"></div></div></td>
          <td class="text-end d-none d-md-table-cell text-muted">${target ? fmt(target) : "—"}</td>
        </tr>`;
      }).join(""));
    } catch (e) { setTbody(errorRow(5, e)); }
  }

  async function pagePiggyShow() {
    const id = qs("id");
    if (!id) { const el = $k("piggy-name"); if (el) el.textContent = "No piggy specified"; return; }
    try {
      const res = await api(`/piggy_banks/${id}`);
      const a = res.data.attributes;
      const sym = a.currency_symbol || "€";
      document.title = `${a.name} — Firefly III · Pala`;
      if ($k("piggy-name"))        $k("piggy-name").textContent        = a.name;
      if ($k("piggy-id-line"))     $k("piggy-id-line").textContent     = `#${id}`;
      if ($k("piggy-account"))     $k("piggy-account").textContent     = `In ${a.account_name || "—"}`;
      if ($k("piggy-target-date")) $k("piggy-target-date").textContent = a.target_date ? `Target by ${dat(a.target_date)}` : "No target date";

      const saved = parseFloat(a.current_amount || 0);
      const target = parseFloat(a.target_amount || 0);
      const remaining = Math.max(0, target - saved);
      const pct = target > 0 ? Math.min(100, (saved / target * 100)) : 0;
      if ($k("piggy-saved"))     $k("piggy-saved").textContent     = `${sym}${saved.toFixed(2)}`;
      if ($k("piggy-target"))    $k("piggy-target").textContent    = target ? `${sym}${target.toFixed(2)}` : "—";
      if ($k("piggy-remaining")) $k("piggy-remaining").textContent = `${sym}${remaining.toFixed(2)}`;
      if ($k("piggy-pct"))       $k("piggy-pct").textContent       = pct.toFixed(0) + "%";
      const fill = $k("piggy-fill"); if (fill) fill.style.width = pct + "%";
      if ($k("piggy-pct-label"))  $k("piggy-pct-label").textContent  = pct.toFixed(1) + "%";
      if ($k("piggy-currency"))   $k("piggy-currency").textContent   = `${a.currency_code} (${sym})`;
      if ($k("piggy-start-date")) $k("piggy-start-date").textContent = dat(a.start_date);
      if ($k("piggy-group"))      $k("piggy-group").textContent      = a.object_group_title || "—";
      if ($k("piggy-notes"))      $k("piggy-notes").innerHTML        = a.notes ? `<div class="note-box">${esc(a.notes)}</div>` : '<span class="text-muted">—</span>';
      if ($k("piggy-created"))    $k("piggy-created").textContent    = a.created_at ? new Date(a.created_at).toLocaleString("en-GB") : "—";

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
        const v = await palaPrompt({
          title: sign > 0 ? "Add money" : "Remove money",
          message: sign > 0 ? `How much to add to ${a.name}?` : `How much to take from ${a.name}?`,
          placeholder: "0.00",
          confirmLabel: sign > 0 ? "Add" : "Remove",
        });
        if (!v || isNaN(parseFloat(v))) return;
        const amt = (sign * Math.abs(parseFloat(v))).toFixed(2);
        try {
          await api(`/piggy_banks/${id}`, { method: "PUT", body: JSON.stringify({ current_amount: (saved + parseFloat(amt)).toFixed(2) }) });
          toast("success", sign > 0 ? "Money added" : "Money removed", { msg: `${sign > 0 ? "+" : "−"}${sym}${Math.abs(parseFloat(amt)).toFixed(2)}` });
          setTimeout(() => location.reload(), 600);
        } catch (err) { toast("danger", "Update failed", { msg: err.message }); }
      };
      $k("piggy-add-btn")?.addEventListener("click", () => addRemove(+1));
      $k("piggy-remove-btn")?.addEventListener("click", () => addRemove(-1));

      $k("piggy-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete piggy bank?", message: `"${a.name}" will be removed. The saved money stays in the linked account.`, confirmLabel: "Delete", danger: true }))) return;
        try {
          await api(`/piggy_banks/${id}`, { method: "DELETE" });
          toast("danger", "Piggy bank deleted", { msg: a.name });
          setTimeout(() => location.href = "piggy.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { const el = $k("piggy-name"); if (el) el.textContent = "Failed to load"; console.error(e); }
  }

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    if (page === "piggy")       pagePiggy();
    else if (page === "piggy-show") pagePiggyShow();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
