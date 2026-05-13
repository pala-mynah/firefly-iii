/* pala-accounts.js — Accounts list + account detail. */
(function () {
  const { api, esc, fmt, dat, qs, $k, setTbody, setTitle, setFooter,
          loadingRow, errorRow, emptyRow, wirePeriodChrome } = window.Pala;

  async function pageAccounts() {
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

  async function pageAccountShow() {
    const id = qs("id");
    if (!id) { if ($k("ac-title")) $k("ac-title").textContent = "No account specified"; return; }
    try {
      const today = new Date();
      const [acc, tx] = await Promise.all([
        api(`/accounts/${id}`),
        api(`/accounts/${id}/transactions?limit=100`).catch(() => ({ data: [] })),
      ]);
      const at = acc.data.attributes;
      const name = at.name;
      document.title = name + " — Firefly III · Pala";
      if ($k("ac-title")) $k("ac-title").textContent = name;
      if ($k("ac-iban")) $k("ac-iban").textContent = at.iban || "—";
      if ($k("ac-type")) $k("ac-type").textContent = at.type ? at.type.charAt(0).toUpperCase() + at.type.slice(1) : "—";
      if ($k("ac-currency")) $k("ac-currency").textContent = at.currency_code ? `${at.currency_code} (${at.currency_symbol || ""})` : "—";
      const bal = parseFloat(at.current_balance || 0);
      if ($k("ac-balance")) {
        $k("ac-balance").textContent = fmt(bal);
        $k("ac-balance").className = bal >= 0 ? "text-success" : "text-danger";
      }
      if ($k("ac-opened")) $k("ac-opened").textContent = dat(at.opening_balance_date);

      const crumbs = document.querySelector("[data-crumbs]");
      if (crumbs) crumbs.dataset.crumbs = `Home/Accounts/${name}`;
      const txBody = $k("ac-tx-body");
      const rows = tx.data || [];
      if (txBody) {
        if (!rows.length) txBody.innerHTML = `<tr><td colspan="6" class="text-muted p-3">No transactions.</td></tr>`;
        else txBody.innerHTML = rows.slice(0, 30).map((t) => {
          const inner = t.attributes.transactions[0];
          const amt = parseFloat(inner.amount);
          const sign = inner.type === "deposit" ? "+" : inner.type === "transfer" ? "" : "−";
          const cls = inner.type === "deposit" ? "text-success" : inner.type === "transfer" ? "text-info" : "text-danger";
          const icon = inner.type === "deposit" ? "fa-arrow-right text-success" : inner.type === "transfer" ? "fa-arrows-left-right text-info" : "fa-arrow-left text-danger";
          const counter = inner.type === "deposit" ? inner.source_name : inner.destination_name;
          return `<tr>
            <td class="text-center"><i class="fa-solid ${icon}"></i></td>
            <td>${esc(inner.description)}</td>
            <td class="text-end ${cls} text-nowrap">${sign}${fmt(amt)}</td>
            <td class="text-nowrap text-muted small">${dat(inner.date)}</td>
            <td>${inner.category_id ? `<a href="category-show.html?id=${inner.category_id}">${esc(inner.category_name)}</a>` : '<span class="text-muted">—</span>'}</td>
            <td class="text-muted">${esc(counter || "")}</td>
          </tr>`;
        }).join("");
      }
      const chart = $k("ac-chart");
      if (chart) {
        const days = 30;
        const series = Array(days).fill(bal);
        const startDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1);
        for (const t of rows) for (const tr of t.attributes.transactions) {
          const d = new Date(tr.date);
          if (d < startDay) continue;
          const amt = Number(tr.amount);
          const delta = tr.type === "deposit" ? amt : tr.type === "withdrawal" ? -amt : (String(tr.source_id) === id ? -amt : amt);
          const dayIdx = Math.floor((d - startDay) / 86400000);
          for (let k = 0; k < dayIdx; k++) series[k] -= delta;
        }
        const mn = Math.min(...series), mx = Math.max(...series);
        const rng = mx - mn || 1;
        const xOf = (i) => 20 + (i / (days - 1)) * 360;
        const yOf = (v) => 220 - ((v - mn) / rng) * 180 - 10;
        const pts = series.map((v, i) => xOf(i).toFixed(0) + "," + yOf(v).toFixed(0)).join(" ");
        chart.innerHTML = `
          <svg viewBox="0 0 400 240" preserveAspectRatio="none" style="width:100%; height:100%;">
            <defs><linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#3ecfb2" stop-opacity=".25"/>
              <stop offset="100%" stop-color="#3ecfb2" stop-opacity="0"/>
            </linearGradient></defs>
            <path d="M${pts.replace(/ /g, " L")} L${xOf(days-1).toFixed(0)},230 L${xOf(0).toFixed(0)},230 Z" fill="url(#acGrad)"/>
            <polyline points="${pts}" fill="none" stroke="#3ecfb2" stroke-width="1.5"/>
            <text x="20" y="14" fill="rgba(255,255,255,.5)" font-size="10">${fmt(mx)}</text>
            <text x="20" y="234" fill="rgba(255,255,255,.5)" font-size="10">${fmt(mn)}</text>
            <text x="380" y="14" text-anchor="end" fill="rgba(255,255,255,.5)" font-size="10">30 days · today ${fmt(bal)}</text>
          </svg>`;
      }
    } catch (e) {
      console.error(e);
      if ($k("ac-title")) $k("ac-title").textContent = "Failed to load: " + e.message;
    }
  }

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    if (page === "accounts")     pageAccounts();
    else if (page === "account-show") pageAccountShow();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
