/* pala-tags.js — Tags list + tag detail. */
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

  async function pageTags() {
    const cloudEl = $k("tags-cloud");
    const bodyEl  = $k("tags-tbody");
    try {
      const res = await api("/tags?limit=200");
      const list = res.data || [];
      if (!list.length) {
        if (cloudEl) cloudEl.innerHTML = '<span class="text-muted">No tags yet.</span>';
        if (bodyEl)  bodyEl.innerHTML  = `<tr><td colspan="5" class="text-muted p-3">No tags yet.</td></tr>`;
        return;
      }
      const enriched = await Promise.all(list.map(async (t) => {
        const tag = t.attributes.tag;
        try {
          const txr = await api(`/tags/${encodeURIComponent(tag)}/transactions?limit=200`);
          let count = 0, sum = 0, last = "";
          for (const tr of (txr.data || [])) for (const inner of tr.attributes.transactions) {
            count++;
            const a = Number(inner.amount);
            if (inner.type === "withdrawal") sum -= a;
            else if (inner.type === "deposit") sum += a;
            if (!last || inner.date > last) last = inner.date;
          }
          return { tag, count, sum, last };
        } catch { return { tag, count: 0, sum: 0, last: "" }; }
      }));
      enriched.sort((a, b) => b.count - a.count);
      const maxCount = Math.max(...enriched.map((e) => e.count), 1);
      if (cloudEl) cloudEl.innerHTML = enriched.slice(0, 30).map((e) => {
        const size = 0.85 + (Math.sqrt(e.count / maxCount) * 0.8);
        return `<a href="transactions.html?tag=${encodeURIComponent(e.tag)}" style="font-size:${size.toFixed(2)}rem">#${esc(e.tag)} <small>${e.count}</small></a>`;
      }).join(" ");
      if (bodyEl) bodyEl.innerHTML = enriched.map((e) => {
        const cls = e.sum > 0 ? "text-success" : e.sum < 0 ? "text-danger" : "text-muted";
        const sumTxt = e.sum === 0 ? "—" : (e.sum > 0 ? "+" : "−") + fmt(Math.abs(e.sum));
        return `<tr>
          <td><div class="btn-group btn-group-sm"><a href="#" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-pencil fa-fw"></i></a><a href="#" class="btn btn-sm btn-outline-danger"><i class="fa-solid fa-trash fa-fw"></i></a></div></td>
          <td><a href="transactions.html?tag=${encodeURIComponent(e.tag)}">${esc(e.tag)}</a></td>
          <td class="text-end">${e.count}</td>
          <td class="text-end ${cls} d-none d-md-table-cell">${sumTxt}</td>
          <td class="d-none d-lg-table-cell text-muted small">${e.last ? dat(e.last) : "—"}</td>
        </tr>`;
      }).join("");
    } catch (e) {
      if (cloudEl) cloudEl.innerHTML = `<span class="text-danger">Failed: ${esc(e.message)}</span>`;
      if (bodyEl)  bodyEl.innerHTML  = `<tr><td colspan="5" class="text-danger p-3">Failed: ${esc(e.message)}</td></tr>`;
    }
  }

  async function pageTagShow() {
    const idOrTag = qs("id") || qs("tag");
    if (!idOrTag) { const el = $k("tag-name"); if (el) el.textContent = "No tag specified"; return; }
    try {
      const res = await api(`/tags/${encodeURIComponent(idOrTag)}`);
      const a = res.data.attributes;
      const tagId = res.data.id;
      const tagName = a.tag;
      document.title = `#${tagName} — Firefly III · Pala`;
      if ($k("tag-name")) $k("tag-name").textContent = tagName;
      if ($k("tag-id-line")) $k("tag-id-line").textContent = `#${tagId}`;
      if ($k("tag-date-range")) $k("tag-date-range").textContent = a.date ? `Reference date: ${dat(a.date)}` : (a.description || "");

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
      if ($k("tag-count"))  $k("tag-count").textContent  = rows.length;
      if ($k("tag-spent"))  $k("tag-spent").textContent  = fmt(spent);
      if ($k("tag-income")) $k("tag-income").textContent = fmt(income);
      const net = income - spent;
      const netEl = $k("tag-net");
      if (netEl) { netEl.textContent = (net >= 0 ? "+" : "−") + fmt(Math.abs(net)); netEl.className = "kpi-value " + (net >= 0 ? "text-success" : "text-danger"); }

      const renderBars = (key, map) => {
        const arr = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8);
        const max = arr[0] ? arr[0][1] : 1;
        const el = $k(key);
        if (!el) return;
        el.innerHTML = arr.length
          ? arr.map(([name, v]) => `<div class="bar-row"><div class="bar-name">${esc(name)}</div><div class="bar"><div class="bar-fill" style="width:${Math.max(2, (v/max*100)).toFixed(1)}%"></div></div><div class="bar-val">${fmt(v)}</div></div>`).join("")
          : '<div class="text-muted small">No data.</div>';
      };
      renderBars("tag-by-category",     byCat);
      renderBars("tag-by-counterparty", byCounter);

      const txBody = $k("tag-tx-body");
      if (txBody) {
        if (!rows.length) txBody.innerHTML = '<tr><td colspan="4" class="text-muted small p-3">No transactions tagged.</td></tr>';
        else txBody.innerHTML = rows.slice(0, 30).map(txRow).join("");
      }
      if ($k("tag-tx-count")) $k("tag-tx-count").textContent = rows.length;
      if ($k("tag-tx-info"))  $k("tag-tx-info").textContent  = rows.length > 30 ? `Showing 30 of ${rows.length}` : `${rows.length} transactions`;
      const all = $k("tag-tx-all"); if (all) all.href = `transactions.html?tag=${encodeURIComponent(tagName)}`;
      const edit = $k("tag-edit-btn"); if (edit) edit.href = `${fbase()}/tags/edit/${tagId}`;

      $k("tag-act-rename")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const v = await palaPrompt({ title: "Rename tag", message: "New name for this tag:", value: tagName, confirmLabel: "Rename" });
        if (!v || v === tagName) return;
        try {
          await api(`/tags/${encodeURIComponent(tagName)}`, { method: "PUT", body: JSON.stringify({ tag: v }) });
          toast("success", "Tag renamed", { msg: `→ #${v}` });
          setTimeout(() => location.href = `tag-show.html?tag=${encodeURIComponent(v)}`, 600);
        } catch (err) { toast("danger", "Rename failed", { msg: err.message }); }
      });
      $k("tag-act-export")?.addEventListener("click", (e) => { e.preventDefault(); location.href = `${fbase()}/export?tag=${encodeURIComponent(tagName)}`; });
      $k("tag-act-delete")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!(await palaConfirm({ title: "Delete tag?", message: `Tag #${tagName} will be removed from ${rows.length} transactions. Transactions themselves are kept.`, confirmLabel: "Delete", danger: true }))) return;
        try {
          await api(`/tags/${encodeURIComponent(tagName)}`, { method: "DELETE" });
          toast("danger", "Tag deleted", { msg: `#${tagName}` });
          setTimeout(() => location.href = "tags.html", 600);
        } catch (err) { toast("danger", "Delete failed", { msg: err.message }); }
      });
    } catch (e) { const el = $k("tag-name"); if (el) el.textContent = "Failed to load"; console.error(e); }
  }

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    const sub  = document.body.dataset.sub;
    if (page === "tag-show") pageTagShow();
    else if (page === "classification" && sub === "tags") pageTags();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
