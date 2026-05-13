/* pala-rules.js — Rules list + rule detail. */
(function () {
  const { api, esc, fmt, dat, qs, $k, setTbody, loadingRow, errorRow, emptyRow,
          wirePeriodChrome, fbase } = window.Pala;

  const toast = (kind, t, opts) => window.palaToast ? window.palaToast[kind](t, opts) : null;

  const txRow = (t, opts = {}) => {
    const inner = t.attributes.transactions[0];
    const amt = parseFloat(inner.amount);
    const sign = inner.type === "deposit" ? "+" : inner.type === "transfer" ? "" : "−";
    const cls  = inner.type === "deposit" ? "text-success" : inner.type === "transfer" ? "text-info" : "text-danger";
    if (opts.simple) {
      return `<tr>
        <td><a class="kv-link" href="transaction-show.html?tx=${t.id}">${dat(inner.date)}</a></td>
        <td>${esc(inner.description || "—")}</td>
        <td class="text-end ${cls}" style="font-variant-numeric:tabular-nums;">${sign}${fmt(amt)}</td>
      </tr>`;
    }
    const counter = inner.type === "deposit" ? inner.source_name : inner.destination_name;
    return `<tr>
      <td><a class="kv-link" href="transaction-show.html?tx=${t.id}">${dat(inner.date)}</a></td>
      <td>${esc(inner.description || "—")}</td>
      <td>${esc(counter || "—")}</td>
      <td class="text-end ${cls}" style="font-variant-numeric:tabular-nums;">${sign}${fmt(amt)}</td>
    </tr>`;
  };

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
          <td><a href="rule-show.html?id=${r.id}">${esc(at.title)}</a></td>
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

  async function pageRuleShow() {
    const id = qs("id");
    if (!id) { const el = $k("rule-title"); if (el) el.textContent = "No rule specified"; return; }
    try {
      const res = await api(`/rules/${id}`);
      const a = res.data.attributes;
      document.title = `${a.title} — Firefly III · Pala`;
      if ($k("rule-title"))       $k("rule-title").textContent       = a.title;
      if ($k("rule-id-line"))     $k("rule-id-line").textContent     = `#${id}`;
      if ($k("rule-description")) $k("rule-description").textContent = a.description || "";
      const groupEl = $k("rule-group");
      if (groupEl) { groupEl.textContent = a.rule_group_title || "—"; if (a.rule_group_id) groupEl.href = `rules.html#group-${a.rule_group_id}`; }
      if ($k("rule-order"))        $k("rule-order").textContent        = a.order || "—";
      if ($k("rule-trigger-type")) $k("rule-trigger-type").textContent = a.trigger;
      if ($k("rule-created"))      $k("rule-created").textContent      = a.created_at ? new Date(a.created_at).toLocaleString("en-GB") : "—";
      if ($k("rule-updated"))      $k("rule-updated").textContent      = a.updated_at ? new Date(a.updated_at).toLocaleString("en-GB") : "—";

      const setFlag = (k, on, labelOn, labelOff) => {
        const el = $k(k); if (!el) return;
        el.className = "flag-chip " + (on ? "on" : "off");
        el.textContent = on ? labelOn : labelOff;
      };
      setFlag("rule-active",    a.active,          "Active",      "Inactive");
      setFlag("rule-strict",    a.strict,          "Strict",      "Lenient");
      setFlag("rule-stoponhit", a.stop_processing, "Stop on hit", "Continue");

      const trigs   = (a.triggers || []).filter(t => t.type !== "user_action");
      const actions = a.actions || [];
      if ($k("rule-trigger-count"))  $k("rule-trigger-count").textContent  = trigs.length;
      if ($k("rule-action-count"))   $k("rule-action-count").textContent   = actions.length;
      if ($k("rule-triggers-mode"))  $k("rule-triggers-mode").textContent  = `(${a.strict ? "all must match" : "any may match"})`;

      if ($k("rule-triggers")) $k("rule-triggers").innerHTML = trigs.length
        ? trigs.map((t, i) => `<div class="rule-step${t.active === false ? " disabled" : ""}${t.stop_processing ? " stop" : ""}"><div class="num">${i+1}.</div><div class="ico"><i class="fa-solid fa-filter"></i></div><div class="body"><code>${esc(t.type)}</code> ${t.value ? '<span class="text-muted">→</span> ' + esc(t.value) : ""}</div></div>`).join("")
        : '<div class="text-muted small p-3">No triggers.</div>';
      if ($k("rule-actions")) $k("rule-actions").innerHTML = actions.length
        ? actions.map((t, i) => `<div class="rule-step${t.active === false ? " disabled" : ""}${t.stop_processing ? " stop" : ""}"><div class="num">${i+1}.</div><div class="ico"><i class="fa-solid fa-bolt"></i></div><div class="body"><code>${esc(t.type)}</code> ${t.value ? '<span class="text-muted">→</span> ' + esc(t.value) : ""}${t.stop_processing ? ' <span class="text-warning small">· stop after</span>' : ""}</div></div>`).join("")
        : '<div class="text-muted small p-3">No actions.</div>';

      const edit = $k("rule-edit-btn"); if (edit) edit.href = `${fbase()}/rules/edit/${id}`;

      $k("rule-test-btn")?.addEventListener("click", async () => {
        try {
          const r = await api(`/rules/${id}/test`);
          const hits = (r.data || []).slice(0, 20);
          palaModal({
            title: `Test results — ${hits.length} matching transaction${hits.length === 1 ? "" : "s"}`,
            wide: true,
            body: hits.length
              ? `<div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Date</th><th>Description</th><th class="text-end">Amount</th></tr></thead><tbody>${hits.map(t => txRow(t, { simple: true })).join("")}</tbody></table></div>`
              : '<p class="text-muted">No matching transactions found.</p>',
            footer: `<button class="btn btn-outline-secondary" data-act="ok">Close</button>`,
            onClose: () => {},
          }).footEl.querySelector('[data-act="ok"]').addEventListener("click", (e) => e.target.closest(".pala-backdrop").click());
        } catch (err) { toast("danger", "Test failed", { msg: err.message }); }
      });

      $k("rule-fire-btn")?.addEventListener("click", async () => {
        if (!(await palaConfirm({ title: "Fire rule on existing transactions?", message: "All transactions matching this rule will be modified by its actions. This may take a moment.", confirmLabel: "Fire" }))) return;
        try {
          await api(`/rules/${id}/trigger`, { method: "POST" });
          toast("success", "Rule fired", { msg: "Matching transactions have been updated." });
        } catch (err) { toast("danger", "Fire failed", { msg: err.message }); }
      });

      if ($k("rule-act-toggle-label")) $k("rule-act-toggle-label").textContent = a.active ? "Disable" : "Enable";
      $k("rule-act-toggle")?.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await api(`/rules/${id}`, { method: "PUT", body: JSON.stringify({ active: !a.active }) });
          toast("success", a.active ? "Rule disabled" : "Rule enabled");
          setTimeout(() => location.reload(), 600);
        } catch (err) { toast("danger", "Update failed", { msg: err.message }); }
      });

      $k("rule-act-duplicate")?.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const body = { title: a.title + " (copy)", description: a.description, rule_group_id: a.rule_group_id, trigger: a.trigger, strict: a.strict, stop_processing: a.stop_processing, active: false, triggers: a.triggers || [], actions: a.actions || [] };
          const cr = await api(`/rules`, { method: "POST", body: JSON.stringify(body) });
          toast("success", "Rule duplicated", { msg: `Saved as "${body.title}"`, actions: [{ label: "Open", onClick: () => location.href = `rule-show.html?id=${cr.data.id}` }] });
        } catch (err) { toast("danger", "Duplicate failed", { msg: err.message }); }
      });

      $k("rule-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete rule?", message: `"${a.title}" will be permanently removed. Past changes to transactions are kept.`, confirmLabel: "Delete", danger: true }))) return;
        try {
          await api(`/rules/${id}`, { method: "DELETE" });
          toast("danger", "Rule deleted", { msg: a.title });
          setTimeout(() => location.href = "rules.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { const el = $k("rule-title"); if (el) el.textContent = "Failed to load"; console.error(e); }
  }

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    const sub  = document.body.dataset.sub;
    if (page === "automation" && sub === "rules") pageRules();
    else if (page === "rule-show")                pageRuleShow();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
