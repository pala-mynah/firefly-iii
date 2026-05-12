
(function () {
  const tok  = () => localStorage.getItem("pala_pat") || "";
  const base = () => (localStorage.getItem("pala_url") || location.origin).replace(/\/$/, "") + "/api/v1";

  let _budgetHistCache = null;

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

  // Period selector. Encoded in URL as ?period=<token>:
  //   YYYY        → full calendar year     (kind='year')
  //   YYYY-Qn     → calendar quarter n=1..4 (kind='quarter')
  //   YYYY-MM     → calendar month         (kind='month')
  //   (absent)    → current calendar month
  // Returns ISO start/end + Date objects + an "anchor" (cursor date for
  // "today within this period" math: today if period contains today, else end-of-period).
  const periodRange = () => {
    const now = new Date();
    const raw = qs("period") || "";
    let kind = "month", y, m, q;
    let mat;
    if ((mat = raw.match(/^(\d{4})$/))) {
      kind = "year"; y = +mat[1];
    } else if ((mat = raw.match(/^(\d{4})-Q([1-4])$/i))) {
      kind = "quarter"; y = +mat[1]; q = +mat[2];
    } else if ((mat = raw.match(/^(\d{4})-(\d{2})$/))) {
      kind = "month"; y = +mat[1]; m = +mat[2] - 1;
    } else {
      kind = "month"; y = now.getFullYear(); m = now.getMonth();
    }
    let startDate, endDate, token, label;
    if (kind === "year") {
      startDate = new Date(y, 0, 1);
      endDate   = new Date(y, 12, 0);
      token     = `${y}`;
      label     = `${y}`;
    } else if (kind === "quarter") {
      const qm = (q - 1) * 3;
      startDate = new Date(y, qm, 1);
      endDate   = new Date(y, qm + 3, 0);
      token     = `${y}-Q${q}`;
      label     = `Q${q} ${y}`;
    } else {
      startDate = new Date(y, m, 1);
      endDate   = new Date(y, m + 1, 0);
      token     = `${y}-${String(m + 1).padStart(2, "0")}`;
      label     = `${startDate.getDate()} ${startDate.toLocaleDateString("en", { month: "short" })} \u2013 ${endDate.getDate()} ${endDate.toLocaleDateString("en", { month: "short" })} ${y}`;
    }
    let anchor = now;
    if (now > endDate)        anchor = endDate;
    else if (now < startDate) anchor = startDate;
    return {
      start: startDate.toISOString().slice(0, 10),
      end:   endDate.toISOString().slice(0, 10),
      startDate, endDate, anchor,
      kind, y, m, q, token, label,
      isCurrent: now >= startDate && now <= endDate,
      // helpers for shifting siblings
      ym: kind === "month" ? token : null,
    };
  };

  // Wires the .period-badge in the global navbar: renders the right label,
  // chevron prev/next (same-kind sibling), and a click-to-open dropdown
  // with months/quarters/years. Runs once on boot. Defers a tick so the
  // chrome IIFE (which is registered as a DOMContentLoaded listener after
  // pala-live.js) has time to insert the navbar.
  function wirePeriodChrome() {
    const badge = document.querySelector(".pala-navbar .period-badge");
    if (!badge) return;
    if (badge.dataset.palaWired === "1") return;
    badge.dataset.palaWired = "1";

    const P = periodRange();
    const now = new Date();
    document.body.setAttribute("data-period", P.label);
    const span = badge.querySelector("span");
    if (span) span.textContent = P.label;

    // Navigate to a new period token (or clear).
    const goTo = (token) => {
      const url = new URL(location.href);
      if (token) url.searchParams.set("period", token);
      else       url.searchParams.delete("period");
      location.href = url.toString();
    };

    // Shift one sibling in the current period kind (month/quarter/year).
    const shift = (delta) => {
      let next;
      if (P.kind === "year") {
        const ny = P.y + delta;
        if (ny > now.getFullYear()) return;
        next = `${ny}`;
      } else if (P.kind === "quarter") {
        let nq = P.q + delta, ny = P.y;
        while (nq > 4) { nq -= 4; ny += 1; }
        while (nq < 1) { nq += 4; ny -= 1; }
        // cap: don't allow quarters that start after current month
        const startMonth = (nq - 1) * 3;
        const startDate = new Date(ny, startMonth, 1);
        if (startDate > now) return;
        next = `${ny}-Q${nq}`;
      } else {
        const d = new Date(P.y, (P.m ?? 0) + delta, 1);
        if (d > now) return;
        next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      goTo(next);
    };

    const arrows = badge.querySelectorAll("a");
    const prevA = arrows[0], nextA = arrows[1];
    if (prevA) prevA.addEventListener("click", (e) => { e.preventDefault(); shift(-1); });
    if (nextA) {
      nextA.addEventListener("click", (e) => { e.preventDefault(); shift(+1); });
      const atNow = P.isCurrent;
      if (atNow) { nextA.style.opacity = "0.35"; nextA.style.cursor = "not-allowed"; nextA.title = "Already at current"; }
    }

    // ── Dropdown menu ────────────────────────────────────────────────
    // Always anchor the dropdown's content on the SELECTED year (P.y) so
    // when the user picks 2024 they then see Q1-Q4 of 2024 etc.
    if (!document.getElementById("pala-period-dropdown-style")) {
      const st = document.createElement("style");
      st.id = "pala-period-dropdown-style";
      st.textContent = `
        .pala-navbar .period-badge { position:relative; }
        .pala-period-dd { position:absolute; top:calc(100% + 6px); right:0; z-index:1100;
          min-width:260px; background:var(--pala-navy-card); border:1px solid var(--pala-navy-border);
          border-radius:8px; padding:.4rem 0; box-shadow:0 8px 24px rgba(0,0,0,.35);
          font-size:.82rem; color:var(--pala-text); }
        .pala-period-dd[hidden] { display:none; }
        .pala-period-dd .ppd-section { padding:.25rem 0; }
        .pala-period-dd .ppd-section + .ppd-section { border-top:1px solid var(--pala-navy-border); }
        .pala-period-dd .ppd-title { padding:.35rem .8rem .15rem; font-size:.7rem;
          letter-spacing:.06em; text-transform:uppercase; color:var(--pala-muted); }
        .pala-period-dd .ppd-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; }
        .pala-period-dd a { display:flex; justify-content:space-between; align-items:center;
          padding:.35rem .8rem; color:var(--pala-text); text-decoration:none; cursor:pointer; }
        .pala-period-dd a:hover:not(.ppd-disabled) { background:rgba(62,207,178,.10); color:var(--pala-mint); }
        .pala-period-dd a.ppd-active { color:var(--pala-mint); }
        .pala-period-dd a.ppd-active::before { content:"\u2713"; margin-right:.45rem; }
        .pala-period-dd a.ppd-disabled { opacity:.35; pointer-events:none; }
        .pala-period-dd .ppd-meta { color:var(--pala-muted); font-size:.72rem; }
        .pala-navbar .period-badge span { cursor:pointer; }
        .pala-navbar .period-badge span::after { content:"\u25BE"; margin-left:.4rem; font-size:.7rem; color:var(--pala-muted); }
      `;
      document.head.appendChild(st);
    }

    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const dd = document.createElement("div");
    dd.className = "pala-period-dd";
    dd.hidden = true;

    // Pick a context year. If the selected period is on a different year,
    // anchor the dropdown to that year; else use current.
    const ctxY = P.y;
    const isFutureMonth = (yy, mm) => yy > now.getFullYear() || (yy === now.getFullYear() && mm > now.getMonth());
    const isFutureQuarter = (yy, qq) => isFutureMonth(yy, (qq - 1) * 3);
    const isFutureYear = (yy) => yy > now.getFullYear();

    // 1) Three most recent months relative to context year. If ctxY is the
    //    current year, last 3 are (now, now-1, now-2). If ctxY is past,
    //    last 3 are Oct, Nov, Dec of that year (the year's 3 newest months).
    let monthAnchor;
    if (ctxY === now.getFullYear()) {
      monthAnchor = { y: now.getFullYear(), m: now.getMonth() };
    } else if (ctxY < now.getFullYear()) {
      monthAnchor = { y: ctxY, m: 11 };
    } else {
      monthAnchor = { y: now.getFullYear(), m: now.getMonth() };
    }
    const recentMonths = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(monthAnchor.y, monthAnchor.m - i, 1);
      recentMonths.push({ y: d.getFullYear(), m: d.getMonth() });
    }

    const mkAnchor = (token, label, opts = {}) => {
      const cls = [];
      if (opts.active)  cls.push("ppd-active");
      if (opts.disabled) cls.push("ppd-disabled");
      const meta = opts.meta ? `<span class="ppd-meta">${esc(opts.meta)}</span>` : "";
      return `<a data-token="${esc(token)}" class="${cls.join(" ")}">${esc(label)}${meta}</a>`;
    };

    const monthsHtml = recentMonths.map(({ y: yy, m: mm }) => {
      const tok = `${yy}-${String(mm + 1).padStart(2, "0")}`;
      const isNow = yy === now.getFullYear() && mm === now.getMonth();
      const isSel = P.kind === "month" && P.y === yy && P.m === mm;
      return mkAnchor(tok, `${MONTHS[mm]} ${yy}`, { active: isSel, meta: isNow ? "This month" : "" });
    }).join("");

    const quartersHtml = [1, 2, 3, 4].map((qq) => {
      const tok = `${ctxY}-Q${qq}`;
      const isSel  = P.kind === "quarter" && P.y === ctxY && P.q === qq;
      const fut    = isFutureQuarter(ctxY, qq);
      const qStart = MONTHS[(qq - 1) * 3];
      const qEnd   = MONTHS[(qq - 1) * 3 + 2];
      return mkAnchor(tok, `Q${qq} ${ctxY}`, { active: isSel, disabled: fut, meta: `${qStart}\u2013${qEnd}` });
    }).join("");

    const yearsList = [];
    for (let yy = now.getFullYear(); yy >= now.getFullYear() - 5; yy--) yearsList.push(yy);
    const yearsHtml = yearsList.map((yy) => {
      const isSel = P.kind === "year" && P.y === yy;
      const isNow = yy === now.getFullYear();
      return mkAnchor(`${yy}`, `${yy}`, { active: isSel, meta: isNow ? "This year" : "" });
    }).join("");

    dd.innerHTML = `
      <div class="ppd-section">
        <div class="ppd-title">Months</div>
        ${monthsHtml}
      </div>
      <div class="ppd-section">
        <div class="ppd-title">Quarters \u00b7 ${ctxY}</div>
        <div class="ppd-grid">${quartersHtml}</div>
      </div>
      <div class="ppd-section">
        <div class="ppd-title">Years</div>
        <div class="ppd-grid">${yearsHtml}</div>
      </div>
      <div class="ppd-section">
        ${mkAnchor("", "Reset to this month")}
      </div>
    `;
    badge.appendChild(dd);

    dd.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-token]");
      if (!a) return;
      e.preventDefault();
      goTo(a.dataset.token);
    });

    if (span) {
      span.title = "Click to choose a period";
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        dd.hidden = !dd.hidden;
      });
    }
    document.addEventListener("click", (e) => {
      if (dd.hidden) return;
      if (e.target === span || badge.contains(e.target)) return;
      dd.hidden = true;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !dd.hidden) dd.hidden = true;
    });
  }

  const setTbody  = (html) => { const tb = document.querySelector(".card .table tbody"); if (tb) tb.innerHTML = html; };
  const setTitle  = (txt)  => { const el = document.querySelector(".card-header .card-title"); if (el) el.textContent = txt; };
  const setFooter = (html) => { const f = document.querySelector(".card-footer"); if (f) f.innerHTML = html; };
  const loadingRow = (cols) => `<tr><td colspan="${cols}" class="text-muted p-3">Loading…</td></tr>`;
  const errorRow   = (cols, e) => `<tr><td colspan="${cols}" class="text-danger p-3">Failed: ${esc(e.message)}</td></tr>`;
  const emptyRow   = (cols, msg) => `<tr><td colspan="${cols}" class="text-muted p-3">${msg}</td></tr>`;

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

  async function pageTransactions() {
    const filter = qs("filter"), type = qs("type"), cat = qs("cat"), catId = qs("cat_id"), budget = qs("budget"), budgetId = qs("budget_id"), account = qs("account");
    const TYPE_MAP = { expense: "withdrawal", expenses: "withdrawal", income: "deposit", transfers: "transfer", all: "all" };
    // Honor explicit ?start/?end (or alias ?after/?before, used by side-panel links)
    // or fall back to the global period selector.
    const after = qs("after") || qs("start"), before = qs("before") || qs("end");
    const P = periodRange();
    const rangeStart = after  || P.start;
    const rangeEnd   = before || P.end;
    const explicitRange = !!(after || before);
    const rangeQS = `start=${rangeStart}&end=${rangeEnd}`;
    let path;
    if (catId)         path = `/categories/${catId}/transactions?limit=500&${rangeQS}`;
    else if (budgetId) path = `/budgets/${budgetId}/transactions?limit=500&${rangeQS}`;
    else               path = `/transactions?limit=500&${rangeQS}`;
    if (type) path += "&type=" + (TYPE_MAP[type] || type);
    setTbody(loadingRow(5));
    try {
      const res = await api(path);
      let rows = res.data;
      if (filter === "uncategorised") rows = rows.filter((t) => !t.attributes.transactions[0].category_id);
      if (cat && !catId) rows = rows.filter((t) => t.attributes.transactions[0].category_name === cat);
      if (budget && !budgetId) rows = rows.filter((t) => slug(t.attributes.transactions[0].budget_name || "") === budget);
      if (account) rows = rows.filter((t) => String(t.attributes.transactions[0].source_id) === account || String(t.attributes.transactions[0].destination_id) === account);
      let catName = cat, budgetName = budget;
      if (catId && rows[0]) catName = rows[0].attributes.transactions[0].category_name || `#${catId}`;
      if (budgetId && rows[0]) budgetName = rows[0].attributes.transactions[0].budget_name || `#${budgetId}`;

      const titleParts = [];
      if (filter === "uncategorised") titleParts.push("Uncategorised");
      if (type) titleParts.push(type[0].toUpperCase() + type.slice(1));
      if (catName) titleParts.push("· " + catName);
      if (budgetName) titleParts.push("· " + budgetName);
      setTitle(titleParts.length ? titleParts.join(" ") : "Transactions");
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
      const PAGE_SIZE = 25;
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      let curPage = 1;
      const renderRow = (t) => {
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
      };
      const renderPage = (p) => {
        curPage = Math.min(Math.max(1, p), totalPages);
        const lo = (curPage - 1) * PAGE_SIZE;
        const hi = Math.min(rows.length, lo + PAGE_SIZE);
        setTbody(rows.slice(lo, hi).map(renderRow).join(""));
        wireCategorize();
        // pageinfo
        const info = document.querySelector('[data-k="tx-pageinfo"]');
        if (info) info.textContent = `${lo + 1}\u2013${hi} of ${rows.length}`;
        // pagination links
        const nav = document.querySelector('[data-k="tx-pagination"] ul');
        if (nav) {
          // build a compact pager: « 1 … (p-1) p (p+1) … N »
          const want = new Set([1, totalPages, curPage, curPage - 1, curPage + 1]);
          const pages = [...want].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
          const parts = [];
          parts.push(`<li class="page-item ${curPage === 1 ? "disabled" : ""}"><a class="page-link" href="#" data-pg="${curPage - 1}">&laquo;</a></li>`);
          let prev = 0;
          for (const n of pages) {
            if (n - prev > 1) parts.push('<li class="page-item disabled"><span class="page-link">…</span></li>');
            parts.push(`<li class="page-item ${n === curPage ? "active" : ""}"><a class="page-link" href="#" data-pg="${n}">${n}</a></li>`);
            prev = n;
          }
          parts.push(`<li class="page-item ${curPage === totalPages ? "disabled" : ""}"><a class="page-link" href="#" data-pg="${curPage + 1}">&raquo;</a></li>`);
          nav.innerHTML = parts.join("");
          nav.querySelectorAll("a.page-link").forEach((a) => {
            a.addEventListener("click", (ev) => {
              ev.preventDefault();
              const n = Number(a.dataset.pg);
              if (!Number.isFinite(n) || n < 1 || n > totalPages || n === curPage) return;
              renderPage(n);
              // scroll the table back to top so the new page is visible from the start
              const scrollBox = document.querySelector(".tx-scroll");
              if (scrollBox) scrollBox.scrollTop = 0;
            });
          });
        }
      };
      renderPage(1);
      // ── Per-day histogram on top ─────────────────────────────────────
      try {
        const svg = document.querySelector('.tx-histo-svg');
        const info = document.querySelector('[data-k="tx-histo-info"]');
        if (svg && rows.length) {
          // bucket counts by yyyy-mm-dd
          const counts = {};
          for (const t of rows) {
            const d = (t.attributes.transactions[0].date || "").slice(0, 10);
            if (!d) continue;
            counts[d] = (counts[d] || 0) + 1;
          }
          // span the FULL queried range (rangeStart \u2192 rangeEnd) so empty days
          // are visible \u2014 e.g. a past month with no tx still shows all 30 days.
          const days = [];
          const start = new Date(rangeStart + "T00:00:00Z");
          const end   = new Date(rangeEnd + "T00:00:00Z");
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
              const k = cur.toISOString().slice(0, 10);
              days.push({ date: k, n: counts[k] || 0 });
            }
          }
          const N = days.length;
          const maxN = Math.max(1, ...days.map(d => d.n));
          const VBW = 1000, VBH = 60, PAD_X = 4, PAD_TOP = 4, PAD_BOT = 2;
          const usableW = VBW - PAD_X * 2;
          const usableH = VBH - PAD_TOP - PAD_BOT;
          const barW = N > 0 ? Math.max(1, (usableW / N) - 1) : 0;
          const today = periodRange().anchor.toISOString().slice(0, 10);
          const bars = days.map((d, i) => {
            const x = PAD_X + i * (usableW / Math.max(1, N));
            const h = (d.n / maxN) * usableH;
            const y = PAD_TOP + (usableH - h);
            const isToday = d.date === today;
            const fill = isToday ? "var(--pala-mint)" : (d.n > 0 ? "rgba(62,207,178,.55)" : "rgba(255,255,255,.06)");
            return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(1, h).toFixed(2)}" fill="${fill}" rx="1"><title>${d.date} \u00b7 ${d.n} transaction${d.n === 1 ? "" : "s"}</title></rect>`;
          }).join("");
          svg.innerHTML = bars;
          const axisWrap = document.querySelector('[data-k="tx-histo-axis"]');
          if (axisWrap && N > 0) {
            const fmtAxis = (iso) => {
              try { return new Date(iso + "T00:00:00Z").toLocaleDateString("en", { day: "2-digit", month: "short" }); }
              catch { return iso; }
            };
            const labels = N > 1
              ? [days[0].date, days[Math.floor(N / 2)].date, days[N - 1].date]
              : [days[0].date, days[0].date, days[0].date];
            axisWrap.innerHTML = `
              <span class="text-muted small">${fmtAxis(labels[0])}</span>
              <span class="text-muted small">${fmtAxis(labels[1])}</span>
              <span class="text-muted small">${fmtAxis(labels[2])}</span>`;
          }
          if (info) info.textContent = `${N} day${N === 1 ? "" : "s"} \u00b7 peak ${maxN}/day`;
        } else if (svg) {
          svg.innerHTML = "";
          if (info) info.textContent = "no data";
        }
      } catch (e) { console.warn("tx histogram:", e); }
      const TYPE_MAP2 = { expense: "withdrawal", expenses: "withdrawal", income: "deposit", transfers: "transfer" };
      const rangeType = TYPE_MAP2[type] || (type === "all" ? "all" : null);
      let count = rows.length, net = 0;
      for (const t of rows) for (const tx of t.attributes.transactions) {
        if (tx.type === "withdrawal") net -= Number(tx.amount);
        else if (tx.type === "deposit") net += Number(tx.amount);
      }
      const setK = (k, v, cls) => {
        const el = document.querySelector(`[data-k="${k}"]`);
        if (!el) return;
        el.textContent = v;
        if (cls) el.className = el.className.replace(/text-(success|danger|muted)/g, "") + " " + cls;
      };
      const titleEl = document.querySelector('[data-k="tx-summary-title"]');
      const TYPE_TITLES = { withdrawal: "Withdrawals", deposit: "Deposits", transfer: "Transfers" };
      const titleRangeLabel = explicitRange
        ? `${dat(rangeStart)} \u2192 ${dat(rangeEnd)}`
        : periodRange().startDate.toLocaleDateString("en", { month: "long", year: "numeric" });
      if (titleEl) titleEl.textContent = `${TYPE_TITLES[rangeType] || "Transactions"}: ${titleRangeLabel}`;
      setK("tx-count", String(count));
      const netCls = net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-muted";
      const netTxt = net === 0 ? "—" : (net > 0 ? "+" : "−") + "\u20ac" + Math.abs(net).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      setK("tx-net", netTxt, netCls);
      setK("tx-range", `${dat(rangeStart)} → ${dat(rangeEnd)}`);
      liveTxSidebar(rangeType).catch((e) => console.warn("tx sidebar:", e));
    } catch (e) { setTbody(errorRow(5, e)); }
  }

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
          const totals = {};
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
    const P = periodRange();
    const today = P.anchor;
    const y = P.startDate.getFullYear(), m = P.startDate.getMonth();
    const monthStart = P.startDate;
    const monthEnd   = P.endDate;
    const iso = (d) => d.toISOString().slice(0, 10);
    const startStr = P.start, endStr = P.end;
    const dayOfMonth = today.getDate();
    const daysInMonth = monthEnd.getDate();
    const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
    const monthLabel = monthStart.toLocaleDateString("en", { month: "short", year: "numeric" });
    // badge label is now managed centrally by wirePeriodChrome()

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
    let historyByBudget = new Map();
    let perMonthBudgetSeries = [];
    try {
      const monthResponses = await Promise.all(
        monthRanges.map((r) =>
          api(`/budgets?start=${r.start}&end=${r.end}`).then((res) => res.data || [])
        )
      );
      monthResponses.forEach((data, mi) => {
        const range = monthRanges[mi];
        const monthEntry = { ym: range.start.slice(0, 7), label: range.label, isCurrent: range.isCurrent, totals: {} };
        data.forEach((b) => {
          const s = Math.abs(Number(b.attributes?.spent?.[0]?.sum || 0));
          monthEntry.totals[b.id] = s;
          if (!historyByBudget.has(b.id)) historyByBudget.set(b.id, []);
          historyByBudget.get(b.id).push({
            label: range.label, spent: s, isCurrent: range.isCurrent,
          });
        });
        perMonthBudgetSeries.push(monthEntry);
      });
    } catch (e) {
      console.warn("pageBudgets: per-month history failed (mini-hist will be empty)", e);
    }
    const limitByBudget = new Map();
    for (const l of limits) {
      const a = l.attributes || {};
      const bid = String(a.budget_id || "");
      if (!bid) continue;
      limitByBudget.set(bid, (limitByBudget.get(bid) || 0) + Number(a.amount || 0));
    }
    const records = budgets
      .filter((b) => b.attributes && b.attributes.active !== false)
      .map((b, i) => {
        const a = b.attributes;
        const name = a.name;
        const limit = limitByBudget.get(String(b.id)) || 0;
        const spent = Math.abs(Number(a.spent?.[0]?.sum || 0));
        const pctRaw = limit > 0 ? (spent / limit) * 100 : (spent > 0 ? 100 : 0);
        const pct = Math.min(pctRaw, 110);
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
      .filter((r) => r.limit > 0 || r.spent > 0)
      .sort((a, b) => b.limit - a.limit);

    // Parallel: fetch current-month transactions per budget so each card can show
    // top categories feeding it (cat-stack-block on the static markup).
    const catsByBudget = new Map();
    try {
      const txResponses = await Promise.all(
        records.map((r) =>
          api(`/budgets/${r.id}/transactions?start=${startStr}&end=${endStr}&limit=500`)
            .then((res) => res.data || [])
            .catch(() => [])
        )
      );
      records.forEach((r, idx) => {
        const totals = {};
        for (const t of txResponses[idx]) {
          const inner = t.attributes?.transactions?.[0]; if (!inner) continue;
          if (inner.type && inner.type !== "withdrawal") continue;
          const key = inner.category_name || "Uncategorised";
          const id  = inner.category_id || "";
          if (!totals[key]) totals[key] = { id, name: key, amt: 0 };
          totals[key].amt += Math.abs(Number(inner.amount || 0));
        }
        const sorted = Object.values(totals).sort((a, b) => b.amt - a.amt).slice(0, 3);
        catsByBudget.set(r.id, sorted);
      });
    } catch (e) {
      console.warn("pageBudgets: per-budget tx for cat-stack failed", e);
    }
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

        const cats = catsByBudget.get(r.id) || [];
        const catMax = cats.length ? Math.max(1, ...cats.map(c => c.amt)) : 1;
        const catShade = (i) => {
          // primary then two muted tints of the budget color
          if (i === 0) return r.color;
          const tints = ["rgba(255,255,255,.45)", "rgba(255,255,255,.28)"];
          return tints[i - 1] || tints[1];
        };
        const catRowsHtml = cats.map((c, i) => {
          const w = Math.round((c.amt / catMax) * 100);
          const href = c.id ? `category-show.html?id=${c.id}` : `transactions.html?budget=${r.slug}`;
          return `<a href="${href}" class="cat-row" onclick="event.stopPropagation()">
              <span class="dot" style="background:${catShade(i)}"></span>
              <span class="name">${escapeHtml(c.name)}</span>
              <span class="bar"><span class="fill" style="width:${w}%;background:${catShade(i)}"></span></span>
              <span class="amt">${fmtEur(c.amt)}</span>
            </a>`;
        }).join("");
        const catBlockHtml = cats.length ? `
          <div class="cat-stack-block">
            <div class="cat-stack-label">Top categories this month</div>
            <div class="cat-list">${catRowsHtml}</div>
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
              ${catBlockHtml}
              ${histHtml}
            </div>
          </a>
        `;
        grid.appendChild(col);
      });
    }
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
    if (typeof window.applyBudgetFocus === "function") {
      try { window.applyBudgetFocus(); } catch (e) { console.warn(e); }
    }
    _budgetHistCache = {
      records: records.map(r => ({ id: r.id, name: r.name, color: r.color, limit: r.limit })),
      perMonth: perMonthBudgetSeries,
    };
    liveHistoricChart().catch((e) => console.warn("liveHistoricChart failed:", e));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function liveHistoricChart() {
    const wrap = document.getElementById("histWrap");
    if (!wrap) return;
    const monthsEls = wrap.querySelectorAll(".history-month");
    if (!monthsEls.length) return;
    monthsEls.forEach((el) => {
      const stack = el.querySelector(".history-stack");
      if (stack) stack.style.height = "0%";
    });
    const today = new Date();
    const dom = today.getDate();
    const dnTab = document.querySelector('#histTabs button[data-mode="dayn"]');
    if (dnTab) dnTab.textContent = `Day-${dom}`;
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
        const cache = _budgetHistCache;
        const monthByYm = cache ? Object.fromEntries(cache.perMonth.map(m => [m.ym, m])) : {};
        const records = cache?.records || [];
        const colorOf = Object.fromEntries(records.map(r => [r.id, r.color]));
        const nameOf  = Object.fromEntries(records.map(r => [r.id, r.name]));

        const perElem = elems.map((el, i) => {
          const ym = monthDefs[i].ym;
          const totals = monthByYm[ym]?.totals || {};
          const totalSpent = Object.values(totals).reduce((a, b) => a + b, 0);
          const totalBudgeted = budgetedByMonth[ym] || 0;
          return { el, ym, totals, totalSpent, totalBudgeted };
        });
        const capEur = (() => {
          const m = Math.max(...perElem.map(p => p.totalSpent), 0);
          return Math.max(50, Math.ceil((m * 1.1) / 50) * 50);
        })();

        let maxPctSeen = 0;
        perElem.forEach((p) => {
          p.el.classList.remove("over", "under");
          const stack = p.el.querySelector(".history-stack");
          const eP = p.el.querySelector(".euro");
          const pctEl = p.el.querySelector(".pct");
          if (!stack) return;
          stack.classList.add("live-segs");

          if (p.el.dataset.hasData !== "1" || (mode === "pct" && p.totalBudgeted <= 0) || p.totalSpent <= 0) {
            stack.style.height = "0%";
            stack.innerHTML = "";
            if (eP) eP.textContent = "";
            if (pctEl) pctEl.textContent = "";
            return;
          }

          let stackPct;
          let segHeights;
          if (mode === "pct") {
            const usedPct = (p.totalSpent / p.totalBudgeted) * 100;
            maxPctSeen = Math.max(maxPctSeen, usedPct);
            const visPct = Math.min(usedPct, 110);
            stackPct = visPct / 110 * 100;
            if (usedPct > 100) p.el.classList.add("over");
            segHeights = records.map(r => ({
              id: r.id, color: r.color, name: r.name,
              h: (p.totals[r.id] || 0) / p.totalSpent * stackPct,
              euros: p.totals[r.id] || 0,
              pct: p.totalBudgeted > 0 ? (p.totals[r.id] || 0) / p.totalBudgeted * 100 : 0,
            }));
            if (eP) eP.textContent = eu(p.totalSpent);
            if (pctEl) pctEl.textContent = Math.round(usedPct) + "%";
            p.el.setAttribute("title",
              `${monthDefs[perElem.indexOf(p)].label} \u00b7 ${Math.round(usedPct)}% used \u00b7 ${eu(p.totalSpent)} / ${eu(p.totalBudgeted)}`);
          } else {
            stackPct = p.totalSpent / capEur * 100;
            segHeights = records.map(r => ({
              id: r.id, color: r.color, name: r.name,
              h: (p.totals[r.id] || 0) / p.totalSpent * stackPct,
              euros: p.totals[r.id] || 0,
            }));
            if (eP) eP.textContent = eu(p.totalSpent);
            if (pctEl) pctEl.textContent = "";
            p.el.setAttribute("title",
              `${monthDefs[perElem.indexOf(p)].label} \u00b7 spent ${eu(p.totalSpent)}`);
          }
          stack.style.height = stackPct + "%";
          stack.innerHTML = segHeights
            .filter(s => s.h > 0)
            .map(s => `<div class="history-seg" style="height:${s.h}%; background:${s.color}" title="${esc(s.name)} \u00b7 ${eu(s.euros)}${s.pct != null ? ` (${Math.round(s.pct)}%)` : ""}"></div>`)
            .join("");
        });
        wrap.querySelector(".history-avgline")?.remove();
        if (header) {
          if (!records.length) {
            header.textContent = mode === "pct"
              ? "% used \u00b7 per-envelope view \u2014 no budget data yet"
              : "\u20ac per envelope \u2014 no budget data yet";
          } else {
            header.textContent = mode === "pct"
              ? `% of monthly budget used \u00b7 stacked by envelope \u00b7 max ${Math.round(maxPctSeen)}%`
              : `\u20ac spent per envelope \u00b7 cap ${eu(capEur)}`;
          }
        }
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

  async function liveTxSidebar(rangeType /* 'withdrawal'|'deposit'|'transfer'|'all' */) {
    // Anchor on the selected period — "previous 3 months" means 3 months ending at the period's end.
    const today = periodRange().anchor;
    const months = [];
    for (let k = 0; k < 3; k++) {
      const s = new Date(today.getFullYear(), today.getMonth() - k, 1);
      const e = new Date(today.getFullYear(), today.getMonth() - k + 1, 0);
      months.push({
        start: s.toISOString().slice(0, 10),
        end: e.toISOString().slice(0, 10),
        label: s.toLocaleDateString("en", { month: "long", year: "numeric" }),
      });
    }
    const wrap = document.querySelector('[data-k="tx-monthlist"] .tx-monthlist-body');
    if (!wrap) return;
    try {
      const responses = await Promise.all(months.map((m) => {
        const qp = `start=${m.start}&end=${m.end}&limit=500` + (rangeType && rangeType !== "all" ? `&type=${rangeType}` : "");
        return api(`/transactions?${qp}`).then((r) => r.data || []).catch(() => []);
      }));
      wrap.innerHTML = months.map((m, i) => {
        const rows = responses[i];
        let count = 0, sum = 0;
        for (const t of rows) for (const tx of t.attributes.transactions) {
          count++;
          if (tx.type === "withdrawal") sum -= Number(tx.amount);
          else if (tx.type === "deposit") sum += Number(tx.amount);
        }
        const sumCls = sum > 0 ? "text-success" : sum < 0 ? "text-danger" : "text-muted";
        const sumTxt = (sum >= 0 ? "+" : "−") + "\u20ac" + Math.abs(Math.round(sum)).toLocaleString("de-AT");
        const href = `transactions.html?start=${m.start}&end=${m.end}` + (rangeType && rangeType !== "all" ? `&type=${rangeType}` : "");
        return `<div class="card mb-2">
          <div class="card-header py-2"><h6 class="card-title mb-0"><a href="${href}">${esc(m.label)}</a></h6></div>
          <div class="card-body p-0"><table class="table table-sm mb-0"><tbody>
            <tr><td class="text-muted small">Count</td><td class="text-end small">${count}</td></tr>
            <tr><td class="text-muted small">Net</td><td class="text-end small ${sumCls}">${count ? sumTxt : "—"}</td></tr>
          </tbody></table></div>
        </div>`;
      }).join("");
    } catch (e) { wrap.innerHTML = `<div class="text-danger small">Failed: ${esc(e.message)}</div>`; }
  }

  async function pageReports() {
    const accSel  = document.getElementById("rep-accounts");
    const startEl = document.getElementById("rep-start");
    const endEl   = document.getElementById("rep-end");
    const gen     = document.getElementById("rep-generate");
    const presets = document.getElementById("rep-presets");
    const saved   = document.getElementById("rep-saved");
    const saveBtn = document.getElementById("rep-save");
    const results = document.getElementById("rep-results");
    if (!accSel) return;
    const { start, end } = periodRange();
    startEl.value = start; endEl.value = end;
    try {
      const accts = (await api("/accounts?type=asset")).data || [];
      accSel.innerHTML = accts.map((a) => `<option value="${a.id}" selected>${esc(a.attributes.name)}</option>`).join("") || `<option disabled>No asset accounts</option>`;
    } catch (e) { accSel.innerHTML = `<option disabled>Failed: ${esc(e.message)}</option>`; }
    const thisYear = new Date().getFullYear();
    const years = [thisYear, thisYear - 1, thisYear - 2];
    const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    presets.innerHTML = years.map((y) => {
      const yLink = `<a href="#" class="fw-bold text-decoration-none" style="color:var(--pala-mint)" data-rng="${y}-01-01..${y}-12-31">${y}</a>`;
      const quarters = [1,2,3,4].map((q) => {
        const sm = (q - 1) * 3, em = sm + 2;
        const sd = `${y}-${String(sm+1).padStart(2,"0")}-01`;
        const ed = `${y}-${String(em+1).padStart(2,"0")}-${new Date(y, em+1, 0).getDate()}`;
        return `<a href="#" class="text-muted text-decoration-none" data-rng="${sd}..${ed}">Q${q}</a>`;
      }).join("");
      const ms = MONTH_LABELS.map((lab, i) => {
        const sd = `${y}-${String(i+1).padStart(2,"0")}-01`;
        const ed = `${y}-${String(i+1).padStart(2,"0")}-${new Date(y, i+1, 0).getDate()}`;
        return `<a href="#" class="text-muted text-decoration-none" data-rng="${sd}..${ed}">${lab}</a>`;
      }).join("");
      return `<div class="list-group-item py-2">
        <div class="d-flex flex-wrap gap-2">${yLink}${quarters}</div>
        <div class="d-flex flex-wrap gap-2 mt-1">${ms}</div>
      </div>`;
    }).join("");
    presets.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-rng]"); if (!a) return;
      e.preventDefault();
      const [s, ee] = a.dataset.rng.split("..");
      startEl.value = s; endEl.value = ee;
    });
    const SAVED_KEY = "pala_reports_saved";
    function loadSaved() {
      try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; }
    }
    function renderSaved() {
      const list = loadSaved();
      saved.innerHTML = list.length
        ? list.map((r, i) => `<a href="#" class="list-group-item list-group-item-action d-flex justify-content-between align-items-start" data-saved="${i}">
            <span><span class="d-block">${esc(r.label)}</span><small class="text-muted">${esc(r.start)} → ${esc(r.end)}</small></span>
            <button class="btn btn-sm text-muted" data-rm="${i}" title="Remove"><i class="fa-solid fa-xmark"></i></button>
          </a>`).join("")
        : `<div class="list-group-item py-2 text-muted">No saved reports yet.</div>`;
    }
    renderSaved();
    saved.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (rm) {
        e.preventDefault(); e.stopPropagation();
        const list = loadSaved();
        list.splice(Number(rm.dataset.rm), 1);
        localStorage.setItem(SAVED_KEY, JSON.stringify(list));
        renderSaved();
        return;
      }
      const item = e.target.closest("[data-saved]");
      if (item) {
        e.preventDefault();
        const r = loadSaved()[Number(item.dataset.saved)];
        if (r) { startEl.value = r.start; endEl.value = r.end; gen.click(); }
      }
    });
    saveBtn.onclick = () => {
      const list = loadSaved();
      const s = startEl.value, ee = endEl.value;
      const label = prompt("Name this report:", `${s} → ${ee}`);
      if (!label) return;
      list.unshift({ label, start: s, end: ee });
      localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 20)));
      renderSaved();
    };
    gen.onclick = async () => {
      const s = startEl.value, ee = endEl.value;
      results.innerHTML = `<div class="card mt-3"><div class="card-body text-muted">Generating report…</div></div>`;
      try {
        const txAll = (await api(`/transactions?start=${s}&end=${ee}&limit=1000`)).data || [];
        const acctFilter = new Set([...accSel.selectedOptions].map((o) => o.value));
        let income = 0, expense = 0, transferIn = 0, transferOut = 0, count = 0;
        const catTotals = {};
        const acctSpend = {};
        for (const t of txAll) for (const tx of t.attributes.transactions) {
          if (acctFilter.size) {
            const sid = String(tx.source_id || ""), did = String(tx.destination_id || "");
            if (!acctFilter.has(sid) && !acctFilter.has(did)) continue;
          }
          count++;
          const amt = Number(tx.amount);
          if (tx.type === "withdrawal") {
            expense += amt;
            const ck = tx.category_name || "Uncategorised";
            catTotals[ck] = (catTotals[ck] || 0) + amt;
            const ak = tx.source_name || "—";
            acctSpend[ak] = (acctSpend[ak] || 0) + amt;
          } else if (tx.type === "deposit") {
            income += amt;
          } else if (tx.type === "transfer") {
            if (acctFilter.has(String(tx.destination_id))) transferIn += amt;
            if (acctFilter.has(String(tx.source_id))) transferOut += amt;
          }
        }
        const net = income - expense;
        const cats = Object.entries(catTotals).sort((a,b) => b[1]-a[1]).slice(0, 10);
        const accts = Object.entries(acctSpend).sort((a,b) => b[1]-a[1]).slice(0, 10);
        const totalCat = cats.reduce((a, [,v]) => a+v, 0) || 1;
        const totalAcc = accts.reduce((a, [,v]) => a+v, 0) || 1;
        results.innerHTML = `
          <div class="row g-3 mt-1">
            <div class="col-xl-3"><div class="card h-100"><div class="card-body">
              <div class="text-muted small text-uppercase" style="letter-spacing:.05em">Net for period</div>
              <div class="fs-3" style="font-family:'Crimson Pro',serif;color:${net>=0?'var(--pala-mint)':'var(--pala-danger)'}">${net>=0?'+':'−'}\u20ac${Math.abs(net).toLocaleString("de-AT",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              <div class="text-muted small mt-2">${count} txn${count===1?'':'s'} \u00b7 ${esc(s)} \u2192 ${esc(ee)}</div>
            </div></div></div>
            <div class="col-xl-3"><div class="card h-100"><div class="card-body">
              <div class="text-muted small text-uppercase" style="letter-spacing:.05em">Income</div>
              <div class="fs-3" style="font-family:'Crimson Pro',serif;color:var(--pala-success)">${fmt(income)}</div>
              ${transferIn?`<div class="text-muted small mt-2">+ ${fmt(transferIn)} transfers in</div>`:''}
            </div></div></div>
            <div class="col-xl-3"><div class="card h-100"><div class="card-body">
              <div class="text-muted small text-uppercase" style="letter-spacing:.05em">Expense</div>
              <div class="fs-3" style="font-family:'Crimson Pro',serif;color:var(--pala-danger)">${fmt(expense)}</div>
              ${transferOut?`<div class="text-muted small mt-2">+ ${fmt(transferOut)} transfers out</div>`:''}
            </div></div></div>
            <div class="col-xl-3"><div class="card h-100"><div class="card-body">
              <div class="text-muted small text-uppercase" style="letter-spacing:.05em">Average / day</div>
              <div class="fs-3" style="font-family:'Crimson Pro',serif">${fmt(expense / Math.max(1, daysBetween(s, ee)))}</div>
              <div class="text-muted small mt-2">${daysBetween(s, ee)} days</div>
            </div></div></div>
          </div>
          <div class="row g-3 mt-0">
            <div class="col-xl-6"><div class="card"><div class="card-header"><h6 class="card-title">Top categories</h6></div><div class="card-body p-0"><table class="table table-sm mb-0"><tbody>
              ${cats.length ? cats.map(([n,v]) => `<tr><td><a href="transactions.html?cat=${encodeURIComponent(n)}&start=${s}&end=${ee}">${esc(n)}</a><div class="progress mt-1" style="height:4px"><div class="progress-bar" style="width:${(v/totalCat*100).toFixed(1)}%"></div></div></td><td class="text-end text-danger num">${fmt(v)}</td></tr>`).join("") : `<tr><td class="text-muted p-3">No expenses in range.</td></tr>`}
            </tbody></table></div></div></div>
            <div class="col-xl-6"><div class="card"><div class="card-header"><h6 class="card-title">Top sources</h6></div><div class="card-body p-0"><table class="table table-sm mb-0"><tbody>
              ${accts.length ? accts.map(([n,v]) => `<tr><td>${esc(n)}<div class="progress mt-1" style="height:4px"><div class="progress-bar" style="width:${(v/totalAcc*100).toFixed(1)}%;background:var(--pala-info)"></div></div></td><td class="text-end text-danger num">${fmt(v)}</td></tr>`).join("") : `<tr><td class="text-muted p-3">—</td></tr>`}
            </tbody></table></div></div></div>
          </div>`;
      } catch (e) {
        results.innerHTML = `<div class="card mt-3"><div class="card-body text-danger">Failed: ${esc(e.message)}</div></div>`;
      }
    };
    gen.click();
  }
  function daysBetween(a, b) {
    return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000) + 1);
  }

  async function pageSearch() {
    const qEl = document.getElementById("srch-q");
    const go = document.getElementById("srch-go");
    const ruleBtn = document.getElementById("srch-rule");
    const parsedEl = document.getElementById("srch-parsed");
    const titleEl = document.getElementById("srch-title");
    const rows = document.getElementById("srch-rows");
    if (!qEl) return;
    const last = sessionStorage.getItem("pala_srch_q") || qs("q") || "";
    if (last) qEl.value = last;

    function parseQuery(q) {
      const tokens = (q || "").trim().split(/\s+/).filter(Boolean);
      const filters = {}; const text = [];
      for (const t of tokens) {
        const m = t.match(/^(category|cat|tag|after|before|amount_more|amount_less|type|source|destination):(.+)$/i);
        if (m) filters[m[1].toLowerCase()] = m[2];
        else text.push(t);
      }
      return { text: text.join(" "), filters };
    }

    async function run() {
      const q = qEl.value.trim();
      sessionStorage.setItem("pala_srch_q", q);
      const { text, filters } = parseQuery(q);
      parsedEl.innerHTML = "";
      if (text)     parsedEl.insertAdjacentHTML("beforeend", `<li>Text: <strong class="text-mint">${esc(text)}</strong></li>`);
      for (const k of Object.keys(filters)) parsedEl.insertAdjacentHTML("beforeend", `<li>Filter: ${esc(k)} = <strong>${esc(filters[k])}</strong></li>`);
      if (!q) { rows.innerHTML = `<tr><td colspan="7" class="text-muted p-3">Enter a query and press Search.</td></tr>`; titleEl.textContent = "Results"; return; }
      rows.innerHTML = `<tr><td colspan="7" class="text-muted p-3">Searching…</td></tr>`;
      try {
        let data;
        try {
          data = (await api(`/search/transactions?query=${encodeURIComponent(q)}&limit=200`)).data || [];
        } catch {
          let path = "/transactions?limit=500";
          if (filters.after)  path += `&start=${filters.after}`;
          if (filters.before) path += `&end=${filters.before}`;
          if (filters.type)   path += `&type=${filters.type}`;
          const fb = (await api(path)).data || [];
          const tl = text.toLowerCase();
          data = fb.filter((t) => {
            const tx = t.attributes.transactions[0];
            if (tl && !((tx.description||"").toLowerCase().includes(tl) || (tx.category_name||"").toLowerCase().includes(tl) || (tx.source_name||"").toLowerCase().includes(tl) || (tx.destination_name||"").toLowerCase().includes(tl))) return false;
            if (filters.category && (tx.category_name||"").toLowerCase() !== filters.category.toLowerCase() && !(tx.category_name||"").toLowerCase().includes(filters.category.toLowerCase())) return false;
            if (filters.amount_more && Number(tx.amount) < Number(filters.amount_more)) return false;
            if (filters.amount_less && Number(tx.amount) > Number(filters.amount_less)) return false;
            return true;
          });
        }
        titleEl.innerHTML = `Results <span class="text-muted small fw-normal">— ${data.length} transaction${data.length===1?'':'s'}</span>`;
        if (!data.length) { rows.innerHTML = `<tr><td colspan="7" class="text-muted p-3">No matches.</td></tr>`; return; }
        rows.innerHTML = data.slice(0, 200).map((t) => {
          const tx = t.attributes.transactions[0];
          const amt = Number(tx.amount);
          const sign = tx.type === "deposit" ? "+" : "−";
          const cls = tx.type === "deposit" ? "text-success" : tx.type === "transfer" ? "text-info" : "text-danger";
          const ico = tx.type === "deposit" ? "fa-arrow-right text-success" : tx.type === "transfer" ? "fa-arrows-left-right text-info" : "fa-arrow-left text-danger";
          return `<tr>
            <td class="text-center"><i class="fa-solid ${ico}"></i></td>
            <td>${esc(tx.description)}</td>
            <td>${esc(tx.source_name || "")}</td>
            <td>${esc(tx.destination_name || "")}</td>
            <td class="text-end ${cls} text-nowrap">${sign}${fmt(amt)}</td>
            <td class="text-nowrap text-muted small">${dat(tx.date)}</td>
            <td>${tx.category_id ? `<a href="transactions.html?cat_id=${tx.category_id}">${esc(tx.category_name)}</a>` : `<span class="text-muted">—</span>`}</td>
          </tr>`;
        }).join("");
      } catch (e) {
        rows.innerHTML = `<tr><td colspan="7" class="text-danger p-3">Failed: ${esc(e.message)}</td></tr>`;
      }
    }
    go.onclick = (e) => { e.preventDefault(); run(); };
    qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    ruleBtn.onclick = (e) => {
      e.preventDefault();
      const { text, filters } = parseQuery(qEl.value);
      const prefill = {
        description: text || qEl.value,
        category_name: filters.category || filters.cat || "",
      };
      location.href = "rules.html?prefill=" + encodeURIComponent(JSON.stringify(prefill));
    };
    if (qEl.value) run();
  }

  async function pagePreferences() {
    const status = document.getElementById("pref-status");
    const setStatus = (t, ok) => { if (!status) return; status.textContent = t; status.style.color = ok ? "var(--pala-mint)" : "var(--pala-danger)"; };
    let prefs = {};
    try {
      const res = await api("/preferences");
      for (const p of (res.data || [])) prefs[p.attributes.name] = p.attributes.data;
    } catch (e) {
      setStatus("Couldn't load preferences: " + e.message, false);
    }
    document.querySelectorAll("[data-pref]").forEach((el) => {
      const k = el.dataset.pref;
      const v = prefs[k];
      if (v === undefined || v === null) return;
      if (el.type === "checkbox") el.checked = !!v;
      else if (el.type === "radio") el.checked = String(el.value) === String(v);
      else if (el.tagName === "SELECT" && el.multiple) {
        const set = new Set(Array.isArray(v) ? v.map(String) : [String(v)]);
        [...el.options].forEach((o) => { o.selected = set.has(o.value); });
      } else el.value = v;
    });

    const save = document.getElementById("pref-save");
    if (!save) return;
    save.onclick = async () => {
      setStatus("Saving…", true);
      const updates = {};
      document.querySelectorAll("[data-pref]").forEach((el) => {
        const k = el.dataset.pref;
        let v;
        if (el.type === "checkbox") v = el.checked;
        else if (el.type === "radio") { if (!el.checked) return; v = el.value; }
        else if (el.tagName === "SELECT" && el.multiple) v = [...el.selectedOptions].map((o) => o.value);
        else v = el.value;
        updates[k] = v;
      });
      try {
        await Promise.all(Object.entries(updates).map(([name, data]) =>
          api("/preferences/" + encodeURIComponent(name), {
            method: "PUT", body: JSON.stringify({ data }),
          }).catch((e) => { throw new Error(`${name}: ${e.message}`); })
        ));
        setStatus("Saved " + Object.keys(updates).length + " preference" + (Object.keys(updates).length===1?"":"s"), true);
      } catch (e) {
        setStatus("Save failed: " + e.message, false);
      }
    };
  }

  async function pageProfile() {
    const tokEl = document.getElementById("pf-token");
    const urlEl = document.getElementById("pf-url");
    const saveBtn = document.getElementById("pf-save");
    const statusEl = document.getElementById("pf-token-status");
    const uidEl = document.getElementById("pf-uid");
    const emailEl = document.getElementById("pf-email");
    const roleEl = document.getElementById("pf-role");

    if (tokEl) tokEl.value = localStorage.getItem("pala_pat") || "";
    if (urlEl) urlEl.value = localStorage.getItem("pala_url") || location.origin;

    try {
      const r = await api("/about/user");
      const a = r.data.attributes;
      if (uidEl)   uidEl.textContent   = r.data.id;
      if (emailEl) emailEl.textContent = a.email || "—";
      if (roleEl && a.role) roleEl.innerHTML = `\u00b7 role <span>${esc(a.role)}</span>`;
    } catch (e) {
      if (uidEl) uidEl.textContent = "—";
      if (emailEl) emailEl.textContent = "(API unreachable)";
    }

    if (saveBtn) saveBtn.onclick = () => {
      localStorage.setItem("pala_pat", tokEl.value.trim());
      localStorage.setItem("pala_url", urlEl.value.trim().replace(/\/$/, ""));
      if (statusEl) { statusEl.textContent = "Saved \u2713"; statusEl.style.color = "var(--pala-mint)"; }
      setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 2000);
    };
  }

  function boot() {
    // Defer one tick: the chrome IIFE registers its DOMContentLoaded
    // listener AFTER pala-live.js, so on first load the navbar isn't in
    // the DOM yet when our boot fires. setTimeout pushes us past it.
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    const sub  = document.body.dataset.sub;
    if (page === "accounts")                          return pageAccounts();
    if (page === "account-show") return (window.__palaExtra && window.__palaExtra.pageAccountShow ? window.__palaExtra.pageAccountShow() : null);
    if (page === "transactions")                      return pageTransactions();
    if (page === "budgets")                           return pageBudgets();
    if (page === "budget-show") return (window.__palaExtra && window.__palaExtra.pageBudgetShow ? window.__palaExtra.pageBudgetShow() : null);
    if (page === "category-show") return (window.__palaExtra && window.__palaExtra.pageCategoryShow ? window.__palaExtra.pageCategoryShow() : null);
    if (page === "transaction-show") return (window.__palaExtra && window.__palaExtra.pageTransactionShow ? window.__palaExtra.pageTransactionShow() : null);
    if (page === "classification" && sub === "categories") return pageCategories();
    if (page === "classification" && sub === "tags") return (window.__palaExtra && window.__palaExtra.pageTags ? window.__palaExtra.pageTags() : null);
    if (page === "bills")                             return pageBills();
    if (page === "piggy")                             return pagePiggy();
    if (page === "automation" && sub === "rules")     return pageRules();
    if (page === "automation" && sub === "recurring") return pageRecurring();
    if (page === "reports")                           return pageReports();
    if (page === "search")                            return pageSearch();
    if (page === "preferences")                       return pagePreferences();
    if (page === "profile")                           return pageProfile();
    if (page === "dashboard" || page === "index")     return pageDashboard();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
