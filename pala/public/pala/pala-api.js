/* pala-api.js — shared core. Exposes window.Pala namespace for all domain files. */
(function () {
  const tok   = () => localStorage.getItem("pala_pat") || "";
  const base  = () => (localStorage.getItem("pala_url") || location.origin).replace(/\/$/, "") + "/api/v1";
  const fbase = () => (localStorage.getItem("pala_url") || location.origin).replace(/\/$/, "");

  const esc  = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt  = (n) => "€" + Number(n).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dat  = (s) => s ? new Date(s).toLocaleDateString("en-GB") : "—";
  const qs   = (k) => new URLSearchParams(location.search).get(k);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function api(path, opts = {}) {
    const r = await fetch(base() + path, {
      headers: { Authorization: "Bearer " + tok(), Accept: "application/json", "Content-Type": "application/json" },
      ...opts,
    });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.status === 204 ? null : r.json();
  }

  const $k        = (k) => document.querySelector(`[data-k="${k}"]`);
  const setTbody  = (html) => { const tb = document.querySelector(".card .table tbody"); if (tb) tb.innerHTML = html; };
  const setTitle  = (txt)  => { const el = document.querySelector(".card-header .card-title"); if (el) el.textContent = txt; };
  const setFooter = (html) => { const f = document.querySelector(".card-footer"); if (f) f.innerHTML = html; };
  const loadingRow = (cols) => `<tr><td colspan="${cols}" class="text-muted p-3">Loading…</td></tr>`;
  const errorRow   = (cols, e) => `<tr><td colspan="${cols}" class="text-danger p-3">Failed: ${esc(e.message)}</td></tr>`;
  const emptyRow   = (cols, msg) => `<tr><td colspan="${cols}" class="text-muted p-3">${msg}</td></tr>`;

  // Period selector. Encoded in URL as ?period=<token>:
  //   YYYY        → full calendar year     (kind='year')
  //   YYYY-Qn     → calendar quarter n=1..4 (kind='quarter')
  //   YYYY-MM     → calendar month         (kind='month')
  //   (absent)    → current calendar month
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
      label     = `${startDate.getDate()} ${startDate.toLocaleDateString("en", { month: "short" })} – ${endDate.getDate()} ${endDate.toLocaleDateString("en", { month: "short" })} ${y}`;
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
      ym: kind === "month" ? token : null,
    };
  };

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

    const goTo = (token) => {
      const url = new URL(location.href);
      if (token) url.searchParams.set("period", token);
      else       url.searchParams.delete("period");
      location.href = url.toString();
    };

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
        .pala-period-dd a.ppd-active::before { content:"✓"; margin-right:.45rem; }
        .pala-period-dd a.ppd-disabled { opacity:.35; pointer-events:none; }
        .pala-period-dd .ppd-meta { color:var(--pala-muted); font-size:.72rem; }
        .pala-navbar .period-badge span { cursor:pointer; }
        .pala-navbar .period-badge span::after { content:"▾"; margin-left:.4rem; font-size:.7rem; color:var(--pala-muted); }
      `;
      document.head.appendChild(st);
    }

    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const dd = document.createElement("div");
    dd.className = "pala-period-dd";
    dd.hidden = true;

    const ctxY = P.y;
    const isFutureMonth = (yy, mm) => yy > now.getFullYear() || (yy === now.getFullYear() && mm > now.getMonth());
    const isFutureQuarter = (yy, qq) => isFutureMonth(yy, (qq - 1) * 3);

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
      if (opts.active)   cls.push("ppd-active");
      if (opts.disabled) cls.push("ppd-disabled");
      const meta = opts.meta ? `<span class="ppd-meta">${esc(opts.meta)}</span>` : "";
      return `<a data-token="${esc(token)}" class="${cls.join(" ")}">${esc(label)}${meta}</a>`;
    };

    const monthsHtml = recentMonths.map(({ y: yy, m: mm }) => {
      const tok2 = `${yy}-${String(mm + 1).padStart(2, "0")}`;
      const isNow = yy === now.getFullYear() && mm === now.getMonth();
      const isSel = P.kind === "month" && P.y === yy && P.m === mm;
      return mkAnchor(tok2, `${MONTHS[mm]} ${yy}`, { active: isSel, meta: isNow ? "This month" : "" });
    }).join("");

    const quartersHtml = [1, 2, 3, 4].map((qq) => {
      const tok2 = `${ctxY}-Q${qq}`;
      const isSel  = P.kind === "quarter" && P.y === ctxY && P.q === qq;
      const fut    = isFutureQuarter(ctxY, qq);
      const qStart = MONTHS[(qq - 1) * 3];
      const qEnd   = MONTHS[(qq - 1) * 3 + 2];
      return mkAnchor(tok2, `Q${qq} ${ctxY}`, { active: isSel, disabled: fut, meta: `${qStart}–${qEnd}` });
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
        <div class="ppd-title">Quarters · ${ctxY}</div>
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

  window.Pala = {
    tok, base, fbase, api, esc, fmt, dat, qs, slug,
    $k, setTbody, setTitle, setFooter, loadingRow, errorRow, emptyRow,
    periodRange, wirePeriodChrome,
  };
})();
