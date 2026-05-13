/* pala-budgets.js — Budgets list + budget detail + historic chart. */
(function () {
  const { api, esc, fmt, dat, qs, slug, $k, setTbody, loadingRow, errorRow, emptyRow,
          periodRange, wirePeriodChrome } = window.Pala;

  let _budgetHistCache = null;

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
    return (n < 0 ? "-€" : "€") + s;
  }
  function fmtEurInt(n) {
    return "€" + Math.round(n).toLocaleString("de-AT");
  }
  const escH = esc; // alias — esc covers &<>" which is sufficient for template literals

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
          historyByBudget.get(b.id).push({ label: range.label, spent: s, isCurrent: range.isCurrent });
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
          const title = `${s.label} ${Math.round(pct)}% · ${fmtEur(s.spent)}`;
          return `<div class="col ${cls}" style="height:${h}%" title="${title}"></div>`;
        }).join("");
        const firstLabel = series[0]?.label || "";
        const lastLabel = series[series.length - 1]?.label || "";
        const histHtml = series.length ? `
          <div class="mini-hist-block">
            <div class="cat-stack-label">% of budget used · last ${series.length} months</div>
            <div class="mini-hist">${barsHtml}</div>
            <div class="mini-hist-legend"><span>${escH(firstLabel)}</span><span>avg ${Math.round(histAvgPct)}% · max ${Math.round(histMaxPct)}%</span><span>${escH(lastLabel)}</span></div>
          </div>` : "";

        const cats = catsByBudget.get(r.id) || [];
        const catMax = cats.length ? Math.max(1, ...cats.map(c => c.amt)) : 1;
        const catShade = (i) => {
          if (i === 0) return r.color;
          const tints = ["rgba(255,255,255,.45)", "rgba(255,255,255,.28)"];
          return tints[i - 1] || tints[1];
        };
        const catRowsHtml = cats.map((c, i) => {
          const w = Math.round((c.amt / catMax) * 100);
          const href = c.id ? `category-show.html?id=${c.id}` : `transactions.html?budget=${r.slug}`;
          return `<a href="${href}" class="cat-row" onclick="event.stopPropagation()">
              <span class="dot" style="background:${catShade(i)}"></span>
              <span class="name">${escH(c.name)}</span>
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
                <div class="name"><span class="swatch" style="background:${r.color}"></span>${escH(r.name)}</div>
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
                <span>Day ${dayOfMonth}/${daysInMonth} · expected ${expectedPctTxt}%</span>
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

    const setTextSel = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt; };
    const setHtmlSel = (sel, html) => { const el = document.querySelector(sel); if (el) el.innerHTML = html; };

    setTextSel("#budTitleSub", `${envCount} envelope${envCount === 1 ? "" : "s"} · ${fmtEurInt(totBudgeted)}/mo`);
    setTextSel('[data-k="budgeted-eyebrow"]', monthStart.toLocaleDateString("en", { month: "short" }) + " budgeted");
    const eyebrowEl = document.querySelector('[data-k="budgeted-eyebrow"]');
    if (eyebrowEl) eyebrowEl.innerHTML = `${monthStart.toLocaleDateString("en", { month: "short" })} budgeted <i class="fa-solid fa-arrow-right kpi-arrow"></i>`;
    setHtmlSel('[data-k="budgeted-amount"]', `${fmtEurInt(totBudgeted)}<span class="text-muted" style="font-weight:400">.00</span>`);
    setTextSel('[data-k="budgeted-meta"]', `across ${envCount} envelope${envCount === 1 ? "" : "s"}`);
    setHtmlSel('[data-k="spent-amount"]', `<span class="${totSpent > totBudgeted ? 'text-danger' : ''}">${fmtEur(totSpent)}</span>`);
    setTextSel('[data-k="spent-meta"]', `${Math.round(pctUsed)}% used · day ${dayOfMonth} of ${daysInMonth}`);
    const availColor = totAvail < 0 ? "var(--pala-danger)" : "var(--pala-mint)";
    setHtmlSel('[data-k="available-amount"]', `<span style="color:${availColor}">${fmtEur(totAvail)}</span>`);
    setTextSel('[data-k="available-meta"]', daysLeft > 0
      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in period`
      : "last day of period");
    setTextSel('[data-stat="on"]',    counts.on);
    setTextSel('[data-stat="watch"]', counts.watch);
    setTextSel('[data-stat="over"]',  counts.over);
    setTextSel('[data-k="status-meta"]', daysLeft > 0
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
    const eu = (n) => "€" + Math.round(n).toLocaleString("de-AT");
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
        ? `${m.label} · budgeted ${eu(budgeted)} · spent through day ${dom} ${eu(spend)}`
        : `${m.label} · no data`);
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
        const cachRecs = cache?.records || [];
        const colorOf = Object.fromEntries(cachRecs.map(r => [r.id, r.color]));
        const nameOf  = Object.fromEntries(cachRecs.map(r => [r.id, r.name]));

        const perElem = elems.map((el, i) => {
          const ym = monthDefs[i].ym;
          const totals = monthByYm[ym]?.totals || {};
          const totalSpent = Object.values(totals).reduce((a, b) => a + b, 0);
          const totalBudgeted = budgetedByMonth[ym] || 0;
          return { el, ym, totals, totalSpent, totalBudgeted };
        });
        const capEur = (() => {
          const mx = Math.max(...perElem.map(p => p.totalSpent), 0);
          return Math.max(50, Math.ceil((mx * 1.1) / 50) * 50);
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
            segHeights = cachRecs.map(r => ({
              id: r.id, color: r.color, name: r.name,
              h: (p.totals[r.id] || 0) / p.totalSpent * stackPct,
              euros: p.totals[r.id] || 0,
              pct: p.totalBudgeted > 0 ? (p.totals[r.id] || 0) / p.totalBudgeted * 100 : 0,
            }));
            if (eP) eP.textContent = eu(p.totalSpent);
            if (pctEl) pctEl.textContent = Math.round(usedPct) + "%";
            p.el.setAttribute("title",
              `${monthDefs[perElem.indexOf(p)].label} · ${Math.round(usedPct)}% used · ${eu(p.totalSpent)} / ${eu(p.totalBudgeted)}`);
          } else {
            stackPct = p.totalSpent / capEur * 100;
            segHeights = cachRecs.map(r => ({
              id: r.id, color: r.color, name: r.name,
              h: (p.totals[r.id] || 0) / p.totalSpent * stackPct,
              euros: p.totals[r.id] || 0,
            }));
            if (eP) eP.textContent = eu(p.totalSpent);
            if (pctEl) pctEl.textContent = "";
            p.el.setAttribute("title",
              `${monthDefs[perElem.indexOf(p)].label} · spent ${eu(p.totalSpent)}`);
          }
          stack.style.height = stackPct + "%";
          stack.innerHTML = segHeights
            .filter(s => s.h > 0)
            .map(s => `<div class="history-seg" style="height:${s.h}%; background:${s.color}" title="${esc(s.name)} · ${eu(s.euros)}${s.pct != null ? ` (${Math.round(s.pct)}%)` : ""}"></div>`)
            .join("");
        });
        wrap.querySelector(".history-avgline")?.remove();
        if (header) {
          if (!cachRecs.length) {
            header.textContent = mode === "pct"
              ? "% used · per-envelope view — no budget data yet"
              : "€ per envelope — no budget data yet";
          } else {
            header.textContent = mode === "pct"
              ? `% of monthly budget used · stacked by envelope · max ${Math.round(maxPctSeen)}%`
              : `€ spent per envelope · cap ${eu(capEur)}`;
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
        avgEl.querySelector("span").textContent = `avg ${eu(avg)} · ${denom} mo`;
      } else if (avgEl) {
        avgEl.remove();
      }

      if (header) {
        header.textContent = mode === "total"
          ? `Total budgeted per month · last ${denom} month${denom === 1 ? "" : "s"} with data`
          : `Cumulative spend day 1 → ${dom} each month · ${denom}-mo average`;
      }
    }

    document.getElementById("histTabs")?.addEventListener("click", (e) => {
      if (e.target.matches("button[data-mode]")) setTimeout(repaint, 0);
    });
    repaint();
  }

  /* ─── Budget detail ──────────────────────────────────────────────────────── */
  async function pageBudgetShow() {
    let id = qs("id"), slug2 = qs("budget");
    try {
      if (!id && slug2) {
        const list = (await api("/budgets")).data;
        const match = list.find((b) => slug(b.attributes.name) === slug2);
        if (match) id = match.id;
      }
      if (!id) { if ($k("bs-title")) $k("bs-title").textContent = "No budget specified"; return; }
      const today = new Date();
      const periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const periodEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const sISO = periodStart.toISOString().slice(0, 10);
      const eISO = periodEnd.toISOString().slice(0, 10);
      const daysInMonth = periodEnd.getDate();
      const dayOfMonth  = Math.min(today.getDate(), daysInMonth);
      const expectedPct = (dayOfMonth / daysInMonth) * 100;

      const [budRes, limRes, txRes] = await Promise.all([
        api(`/budgets/${id}`),
        api(`/budgets/${id}/limits?start=${sISO}&end=${eISO}`).catch(() => ({ data: [] })),
        api(`/budgets/${id}/transactions?start=${sISO}&end=${eISO}&limit=500`).catch(() => ({ data: [] })),
      ]);
      const b = budRes.data, at = b.attributes;
      const name = at.name;
      document.title = `${name} — Firefly III · Pala`;
      if ($k("bs-title")) $k("bs-title").textContent = name;

      const limAmt = limRes.data[0] ? Number(limRes.data[0].attributes.amount) : 0;
      let spent = 0;
      const txByCat = {};
      const txByAcct = new Set();
      const dailyCum = Array(daysInMonth + 1).fill(0);
      for (const t of (txRes.data || [])) for (const tr of t.attributes.transactions) {
        if (tr.type !== "withdrawal") continue;
        const a = Number(tr.amount);
        spent += a;
        const d = new Date(tr.date).getDate();
        for (let k = d; k <= daysInMonth; k++) dailyCum[k] += a;
        const cid = tr.category_id || "_uncat";
        if (!txByCat[cid]) txByCat[cid] = { id: tr.category_id, name: tr.category_name || "Uncategorised", amount: 0, count: 0 };
        txByCat[cid].amount += a;
        txByCat[cid].count++;
        if (tr.source_id) txByAcct.add(tr.source_name || tr.source_id);
      }
      const remaining = Math.max(0, limAmt - spent);
      const pctUsed = limAmt > 0 ? (spent / limAmt) * 100 : 0;
      const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
      const dailyBudget = daysLeft > 0 ? remaining / daysLeft : 0;
      if ($k("bs-sub")) $k("bs-sub").innerHTML =
        `Envelope · feeds ${Object.keys(txByCat).length} categor${Object.keys(txByCat).length === 1 ? "y" : "ies"} this period · <a href="budgets.html">← all budgets</a>`;
      if ($k("bs-spent")) $k("bs-spent").textContent = fmt(spent);
      if ($k("bs-spent-meta")) $k("bs-spent-meta").textContent =
        limAmt > 0 ? `of ${fmt(limAmt)} budgeted · ${pctUsed.toFixed(1)}%` : "no limit set this period";
      if ($k("bs-remaining")) {
        $k("bs-remaining").textContent = remaining > 0 ? fmt(remaining) : (limAmt > 0 ? "over by " + fmt(spent - limAmt) : "—");
        $k("bs-remaining").className = "kpi-amount " + (remaining > 0 ? "text-mint" : "text-danger");
      }
      if ($k("bs-remaining-meta")) $k("bs-remaining-meta").textContent =
        daysLeft > 0 ? `${daysLeft} day${daysLeft===1?"":"s"} left · ~${fmt(dailyBudget)}/day to spend` : "period over";
      const months = [];
      for (let k = 11; k >= 0; k--) {
        const s = new Date(today.getFullYear(), today.getMonth() - k, 1);
        const e = new Date(today.getFullYear(), today.getMonth() - k + 1, 0);
        months.push({
          s: s.toISOString().slice(0, 10),
          e: e.toISOString().slice(0, 10),
          label: s.toLocaleDateString("en", { month: "short" }),
          isCurrent: k === 0,
        });
      }
      const monthResults = await Promise.all(months.map((m) =>
        api(`/budgets/${id}/transactions?start=${m.s}&end=${m.e}&limit=500`).then((r) =>
          (r.data || []).reduce((acc, t) => acc + t.attributes.transactions.reduce((a, tr) =>
            a + (tr.type === "withdrawal" ? Number(tr.amount) : 0), 0), 0)).catch(() => 0)
      ));
      const monthLimits = await Promise.all(months.map((m) =>
        api(`/budgets/${id}/limits?start=${m.s}&end=${m.e}`).then((r) =>
          r.data[0] ? Number(r.data[0].attributes.amount) : limAmt).catch(() => limAmt)
      ));
      const monthPcts = monthResults.map((v, i) => monthLimits[i] > 0 ? (v / monthLimits[i]) * 100 : 0);
      const avgSpend = monthResults.reduce((a, b) => a + b, 0) / monthResults.length;
      const maxIdx = monthResults.indexOf(Math.max(...monthResults));
      const minIdx = monthResults.indexOf(Math.min(...monthResults));
      const avgPct = monthPcts.reduce((a, b) => a + b, 0) / monthPcts.length;
      const maxP = Math.max(...monthPcts), minP = Math.min(...monthPcts);

      if ($k("bs-avg")) $k("bs-avg").innerHTML = `${fmt(avgSpend)}<span class="text-muted" style="font-weight:400">/mo</span>`;
      if ($k("bs-avg-meta")) $k("bs-avg-meta").textContent =
        `max ${fmt(monthResults[maxIdx])} (${months[maxIdx].label}) · min ${fmt(monthResults[minIdx])} (${months[minIdx].label})`;
      const diff = pctUsed - expectedPct;
      const onPace = Math.abs(diff) < 5;
      const overshoot = diff > 5;
      if ($k("bs-status")) {
        const icon = onPace ? "fa-check-circle" : overshoot ? "fa-triangle-exclamation" : "fa-thumbs-up";
        const txt = onPace ? "On pace" : overshoot ? "Overspending" : "Ahead of pace";
        $k("bs-status").innerHTML = `<i class="fa-solid ${icon}"></i> ${txt}`;
        $k("bs-status").className = "kpi-amount " + (overshoot ? "text-danger" : "text-mint");
        $k("bs-status").style.fontSize = "1.3rem";
        $k("bs-status").style.display = "flex";
        $k("bs-status").style.alignItems = "center";
        $k("bs-status").style.gap = ".5rem";
      }
      if ($k("bs-status-meta")) $k("bs-status-meta").textContent =
        limAmt > 0
          ? `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp vs day-${dayOfMonth} pace line`
          : "no limit to pace against";
      if ($k("bs-pace-title")) $k("bs-pace-title").textContent = `Pacing · day ${dayOfMonth} of ${daysInMonth}`;
      if ($k("bs-pace-sub")) $k("bs-pace-sub").textContent =
        `expected at ${expectedPct.toFixed(0)}% · currently ${pctUsed.toFixed(0)}%`;
      if ($k("bs-pace-axis") && limAmt > 0) {
        $k("bs-pace-axis").innerHTML =
          [0, .25, .5, .75, 1].map((p) => `<span>${fmt(limAmt * p).replace(",00","")}</span>`).join("");
      }
      if ($k("bs-pace-fill")) $k("bs-pace-fill").style.width = Math.min(100, pctUsed) + "%";
      if ($k("bs-pace-marker") && limAmt > 0) {
        $k("bs-pace-marker").style.left = expectedPct + "%";
        $k("bs-pace-marker").style.display = "block";
        const lbl = $k("bs-pace-marker-label");
        if (lbl) lbl.textContent = `day ${dayOfMonth} · ${expectedPct.toFixed(0)}%`;
      }
      if ($k("bs-pace-meta")) $k("bs-pace-meta").innerHTML =
        `<span class="text-mint num">${fmt(spent)}</span> spent · <span class="num">${fmt(remaining)}</span> remaining`;
      if ($k("bs-pace-pill")) $k("bs-pace-pill").textContent =
        onPace ? `on pace · ~${fmt(dailyBudget)}/day to spend`
               : overshoot ? `over pace by ${diff.toFixed(1)}pp`
                           : `under pace by ${Math.abs(diff).toFixed(1)}pp`;
      const svg = $k("bs-burn");
      if (svg && limAmt > 0) {
        const xOf = (day) => 40 + ((day - 1) / (daysInMonth - 1)) * 540;
        const yOf = (eur) => 220 - Math.min(1, eur / limAmt) * 200;
        const points = [];
        for (let d = 1; d <= dayOfMonth; d++) points.push([xOf(d), yOf(dailyCum[d])]);
        const ptsStr = points.map((p) => p[0].toFixed(0) + "," + p[1].toFixed(0)).join(" ");
        const areaD  = "M" + ptsStr.replace(/ /g, " L") + " L" + xOf(dayOfMonth).toFixed(0) + ",220 Z";
        const todayX = xOf(dayOfMonth);
        const polyActual = svg.querySelector(".actual");
        const areaPath = svg.querySelector(".actual-area");
        const todayLine = svg.querySelector(".today");
        const todayDot = svg.querySelector(".today-dot");
        const todayLabel = [...svg.querySelectorAll(".axis")].find((t) => t.textContent === "today");
        if (polyActual) polyActual.setAttribute("points", ptsStr);
        if (areaPath) areaPath.setAttribute("d", areaD);
        if (todayLine) { todayLine.setAttribute("x1", todayX); todayLine.setAttribute("x2", todayX); }
        if (todayDot) { todayDot.setAttribute("cx", todayX); todayDot.setAttribute("cy", yOf(dailyCum[dayOfMonth])); }
        if (todayLabel) todayLabel.setAttribute("x", todayX);
        svg.querySelectorAll("circle.dot").forEach((d) => d.remove());
        const axisLabels = [...svg.querySelectorAll(".axis text[text-anchor='end']")];
        const yVals = [0, 0.25, 0.5, 0.75, 1].map((p) => limAmt * p);
        axisLabels.forEach((t, i) => {
          if (i < yVals.length) t.textContent = "€" + Math.round(yVals[i]);
        });
      }
      const catBody = $k("bs-cats");
      if (catBody) {
        const cats = Object.values(txByCat).sort((a, b) => b.amount - a.amount);
        if (!cats.length) catBody.innerHTML = `<tr><td colspan="6" class="text-muted p-3">No spend this period.</td></tr>`;
        else catBody.innerHTML = cats.map((cc) => `
          <tr${cc.id ? ` onclick="location.href='category-show.html?id=${cc.id}'" style="cursor:pointer;"` : ""}>
            <td><span class="swatch" style="background:var(--pala-mint)"></span><span class="name">${esc(cc.name)}</span></td>
            <td><span class="text-muted small">${cc.count} tx</span></td>
            <td class="num">${fmt(cc.amount)}</td>
            <td class="num text-muted">—</td>
            <td class="num text-muted">—</td>
            <td class="text-end"><span class="text-muted">—</span></td>
          </tr>`).join("");
      }
      const histBars = $k("bs-history-bars");
      if (histBars) {
        const ceil = Math.max(110, ...monthPcts) || 100;
        histBars.innerHTML = months.map((m, i) => {
          const p = monthPcts[i];
          const h = (p / ceil) * 100;
          const over = p > 100;
          const cur = m.isCurrent ? " current" : "";
          const o = over ? " over" : "";
          return `<div class="bar${cur}${o}" style="height:${h.toFixed(1)}%" title="${m.label} · ${p.toFixed(0)}% (${fmt(monthResults[i])})"><span class="pct">${p.toFixed(0)}</span></div>`;
        }).join("");
      }
      const histLabels = $k("bs-history-labels");
      if (histLabels) histLabels.innerHTML = months.map((m) =>
        m.isCurrent ? `<span class="text-mint">${m.label}</span>` : `<span>${m.label}</span>`).join("");
      if ($k("bs-history-stats")) $k("bs-history-stats").innerHTML =
        `<span>avg <b>${avgPct.toFixed(0)}%</b></span>
         <span>max <b${maxP > 100 ? ' class="text-danger"' : ""}>${maxP.toFixed(0)}%</b> (${months[monthPcts.indexOf(maxP)].label})</span>
         <span>min <b>${minP.toFixed(0)}%</b> (${months[monthPcts.indexOf(minP)].label})</span>`;
      if ($k("bs-setup-amount")) $k("bs-setup-amount").textContent = limAmt > 0 ? fmt(limAmt) : "no limit";
      if ($k("bs-setup-period")) $k("bs-setup-period").textContent = "Monthly · current period " + dat(sISO) + " → " + dat(eISO);
      if ($k("bs-setup-categories")) {
        const cats2 = Object.values(txByCat).slice(0, 6);
        $k("bs-setup-categories").innerHTML = cats2.length
          ? cats2.map((c) => c.id
              ? `<a href="category-show.html?id=${c.id}" class="chip">${esc(c.name)}</a>`
              : `<span class="chip">${esc(c.name)}</span>`).join("")
          : '<span class="text-muted small">—</span>';
      }
      if ($k("bs-setup-accounts")) {
        const accts = [...txByAcct].slice(0, 6);
        $k("bs-setup-accounts").innerHTML = accts.length
          ? accts.map((a) => `<span class="chip">${esc(a)}</span>`).join("")
          : '<span class="text-muted small">—</span>';
      }
      if ($k("bs-setup-rules")) $k("bs-setup-rules").innerHTML = `<a href="rules.html">Manage →</a>`;
      if ($k("bs-setup-created")) $k("bs-setup-created").textContent = dat(at.created_at);
      const recur = $k("bs-recurring");
      if (recur) {
        try {
          const rr = (await api("/recurrences?limit=50")).data || [];
          const matches = rr.filter((r) =>
            (r.attributes.transactions || []).some((tr) => String(tr.budget_id) === String(id))
          );
          if (!matches.length) {
            recur.innerHTML = '<div class="text-muted small" style="padding:.6rem .8rem;">No recurring transactions linked.</div>';
          } else {
            recur.innerHTML = matches.slice(0, 4).map((r) => {
              const ra = r.attributes;
              const tr0 = (ra.transactions || [])[0] || {};
              const next = ra.first_date || ra.repetitions?.[0]?.next_date || "";
              return `<div class="recur-row">
                <div class="ic"><i class="fa-solid fa-arrows-rotate"></i></div>
                <div>
                  <div class="nm">${esc(ra.title || tr0.description || "Recurring")}</div>
                  <div class="meta">${esc(ra.description || "")} · next ${dat(next) || "—"}</div>
                </div>
                <div class="amt">≈ ${fmt(tr0.amount || 0)}</div>
              </div>`;
            }).join("");
          }
        } catch { recur.innerHTML = '<div class="text-muted small" style="padding:.6rem .8rem;">—</div>'; }
      }
      const tbodies = document.querySelectorAll(".card .table tbody");
      const tb = tbodies[tbodies.length - 1];
      const txs = (txRes.data || []);
      if (tb) {
        if (!txs.length) tb.innerHTML = `<tr><td colspan="6" class="text-muted p-3">No transactions this period.</td></tr>`;
        else tb.innerHTML = txs.slice(0, 12).map((t) => {
          const tr = t.attributes.transactions[0];
          const amt = Number(tr.amount);
          const sign = tr.type === "withdrawal" ? "−" : "+";
          const cls = tr.type === "withdrawal" ? "text-danger" : "text-mint";
          const ico = tr.type === "withdrawal" ? "fa-arrow-left text-danger" : "fa-arrow-right text-mint";
          return `<tr>
            <td class="text-center"><i class="fa-solid ${ico}"></i></td>
            <td>${esc(tr.description)}</td>
            <td class="num">${dat(tr.date)}</td>
            <td>${tr.category_id ? `<a href="category-show.html?id=${tr.category_id}">${esc(tr.category_name)}</a>` : '<span class="text-muted">—</span>'}</td>
            <td class="text-muted">${esc(tr.source_name || tr.destination_name || "")}</td>
            <td class="text-end num ${cls}">${sign}${fmt(amt)}</td>
          </tr>`;
        }).join("");
      }
      const viewAll = $k("bs-tx-viewall");
      if (viewAll) {
        viewAll.setAttribute("href", "transactions.html?budget_id=" + id);
        viewAll.textContent = `View all ${txs.length} →`;
      }
      const txTitle = $k("bs-tx-title");
      if (txTitle) txTitle.textContent = `Transactions in ${name} · current period`;
      const crumbs = document.querySelector("[data-crumbs]");
      if (crumbs) crumbs.dataset.crumbs = `Home/Budgets/${name}`;
    } catch (e) {
      console.error(e);
      if ($k("bs-title")) $k("bs-title").textContent = "Failed to load: " + e.message;
    }
  }

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    if (page === "budgets")          pageBudgets();
    else if (page === "budget-show") pageBudgetShow();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
