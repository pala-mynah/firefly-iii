/* pala-categories.js — Categories list + category detail. */
(function () {
  const { api, esc, fmt, dat, qs, slug, $k, setTbody, loadingRow, errorRow, emptyRow,
          wirePeriodChrome } = window.Pala;

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

  async function pageCategoryShow() {
    let id = qs("id"), slugP = qs("cat");
    try {
      if (!id && slugP) {
        const list = (await api("/categories")).data;
        const match = list.find((c) => slug(c.attributes.name) === slugP);
        if (match) id = match.id;
      }
      if (!id) { if ($k("cs-title")) $k("cs-title").textContent = "No category specified"; return; }

      const today = new Date();
      const sCur  = new Date(today.getFullYear(), today.getMonth(), 1);
      const eCur  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const sPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const ePrev = new Date(today.getFullYear(), today.getMonth(), 0);
      const sYTD  = new Date(today.getFullYear(), 0, 1);

      const [cat, txCur, txPrev, txYTD] = await Promise.all([
        api(`/categories/${id}`),
        api(`/categories/${id}/transactions?start=${sCur.toISOString().slice(0,10)}&end=${eCur.toISOString().slice(0,10)}&limit=500`).catch(() => ({ data: [] })),
        api(`/categories/${id}/transactions?start=${sPrev.toISOString().slice(0,10)}&end=${ePrev.toISOString().slice(0,10)}&limit=500`).catch(() => ({ data: [] })),
        api(`/categories/${id}/transactions?start=${sYTD.toISOString().slice(0,10)}&end=${eCur.toISOString().slice(0,10)}&limit=2000`).catch(() => ({ data: [] })),
      ]);
      const name = cat.data.attributes.name;
      document.title = name + " — Firefly III · Pala";
      if ($k("cs-title")) $k("cs-title").textContent = name;
      if ($k("cs-sub")) $k("cs-sub").innerHTML = `Category · ${(txCur.data || []).length} transactions this month · <a href="categories.html">← all categories</a>`;

      const sumWithdrawal = (rows) => (rows || []).reduce((acc, t) =>
        acc + t.attributes.transactions.reduce((a, tr) =>
          a + (tr.type === "withdrawal" ? Number(tr.amount) : 0), 0), 0);

      const curSpent = sumWithdrawal(txCur.data);
      const prevSpent = sumWithdrawal(txPrev.data);
      const ytdSpent = sumWithdrawal(txYTD.data);
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
      const monthVals = await Promise.all(months.map((m) =>
        api(`/categories/${id}/transactions?start=${m.s}&end=${m.e}&limit=500`).then((r) => sumWithdrawal(r.data || [])).catch(() => 0)
      ));
      const avg12 = monthVals.reduce((a, b) => a + b, 0) / monthVals.length;
      const maxIdx = monthVals.indexOf(Math.max(...monthVals));
      const minIdx = monthVals.indexOf(Math.min(...monthVals));

      if ($k("cs-spent")) $k("cs-spent").textContent = fmt(curSpent);
      if ($k("cs-spent-meta")) $k("cs-spent-meta").textContent =
        `${(txCur.data || []).reduce((c, t) => c + t.attributes.transactions.length, 0)} transactions`;
      if ($k("cs-last")) $k("cs-last").textContent = fmt(prevSpent);
      if ($k("cs-last-delta")) {
        const delta = curSpent - prevSpent;
        const pct = prevSpent > 0 ? (delta / prevSpent) * 100 : 0;
        const up = delta > 0, flat = Math.abs(delta) < 0.5;
        const cls = flat ? "" : up ? "up" : "down";
        const icon = flat ? "fa-minus" : up ? "fa-arrow-up" : "fa-arrow-down";
        $k("cs-last-delta").className = "kpi-delta " + cls;
        $k("cs-last-delta").innerHTML =
          `<i class="fa-solid ${icon} fa-xs"></i> ${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta))} · ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% MoM`;
      }
      if ($k("cs-avg")) $k("cs-avg").innerHTML = `${fmt(avg12)}<span class="text-muted" style="font-weight:400">/mo</span>`;
      if ($k("cs-avg-meta")) $k("cs-avg-meta").textContent =
        `max ${fmt(monthVals[maxIdx])} (${months[maxIdx].label}) · min ${fmt(monthVals[minIdx])} (${months[minIdx].label})`;
      if ($k("cs-ytd-label")) $k("cs-ytd-label").textContent = `YTD · ${today.getFullYear()}`;
      if ($k("cs-ytd")) $k("cs-ytd").textContent = fmt(ytdSpent);
      const ytdMonths = today.getMonth() + 1;
      if ($k("cs-ytd-meta")) $k("cs-ytd-meta").textContent =
        `${ytdMonths} month${ytdMonths===1?"":"s"} · avg ${fmt(ytdSpent / ytdMonths)}/mo`;
      const barsEl = $k("cs-months-bars");
      const ceil = Math.max(...monthVals, 1);
      if (barsEl) barsEl.innerHTML = months.map((m, i) => {
        const v = monthVals[i];
        const h = (v / ceil) * 100;
        const cur = m.isCurrent ? " current" : "";
        return `<div class="mb-bar${cur}" style="height:${h.toFixed(1)}%" title="${m.label} · ${fmt(v)}"><span class="v">${fmt(v).replace(",00","").replace(".00","")}</span></div>`;
      }).join("");
      const labelsEl = $k("cs-months-labels");
      if (labelsEl) labelsEl.innerHTML = months.map((m) =>
        m.isCurrent ? `<span class="text-mint">${m.label}</span>` : `<span>${m.label}</span>`).join("");
      if ($k("cs-months-stats")) $k("cs-months-stats").innerHTML =
        `<span>total <b>${fmt(monthVals.reduce((a, b) => a + b, 0))}</b></span>
         <span>avg <b>${fmt(avg12)}</b>/mo</span>
         <span>max <b>${fmt(monthVals[maxIdx])}</b> (${months[maxIdx].label})</span>
         <span>min <b>${fmt(monthVals[minIdx])}</b> (${months[minIdx].label})</span>`;
      const merchMap = {};
      let txCount = 0, biggest = { amt: 0, name: "", date: "" };
      const dates = [];
      for (const t of (txCur.data || [])) for (const tr of t.attributes.transactions) {
        if (tr.type !== "withdrawal") continue;
        txCount++;
        const a = Number(tr.amount);
        const m = tr.destination_name || tr.source_name || "Unknown";
        if (!merchMap[m]) merchMap[m] = { name: m, amount: 0, count: 0 };
        merchMap[m].amount += a;
        merchMap[m].count++;
        if (a > biggest.amt) biggest = { amt: a, name: m, date: tr.date };
        dates.push(new Date(tr.date));
      }
      const merchants = Object.values(merchMap).sort((a, b) => b.amount - a.amount);
      const merchTotal = merchants.reduce((a, b) => a + b.amount, 0) || 1;
      const merchEl = $k("cs-merchants");
      if (merchEl) {
        if (!merchants.length) merchEl.innerHTML = '<div class="text-muted p-3">No merchants this period.</div>';
        else merchEl.innerHTML = merchants.slice(0, 6).map((m, i) => {
          const pct = (m.amount / merchTotal) * 100;
          return `<a href="transactions.html?cat_id=${id}" class="merch-row">
            <span class="rank">${i + 1}</span>
            <span class="nm">${esc(m.name)}</span>
            <span class="bar"><span class="fill" style="width:${pct.toFixed(1)}%; opacity:${1 - i * 0.12};"></span></span>
            <span class="amt">${fmt(m.amount)}</span>
            <span class="pct">${pct.toFixed(0)}%</span>
          </a>`;
        }).join("");
      }
      if ($k("cs-merchants-footer")) $k("cs-merchants-footer").innerHTML =
        `<i class="fa-solid fa-circle-info"></i> ${merchants.length} distinct merchant${merchants.length===1?"":"s"} this period`;
      if ($k("cs-stats-count")) $k("cs-stats-count").textContent = String(txCount);
      if ($k("cs-stats-avg")) $k("cs-stats-avg").textContent = txCount ? fmt(curSpent / txCount) : "—";
      if ($k("cs-stats-biggest")) $k("cs-stats-biggest").innerHTML =
        biggest.name ? `${fmt(biggest.amt)} <small>${esc(biggest.name)} · ${dat(biggest.date)}</small>` : "—";
      if ($k("cs-stats-gap")) {
        if (dates.length > 1) {
          dates.sort((a, b) => a - b);
          let gap = 0;
          for (let i = 1; i < dates.length; i++) gap += (dates[i] - dates[i-1]) / 86400000;
          $k("cs-stats-gap").textContent = (gap / (dates.length - 1)).toFixed(1) + " days";
        } else $k("cs-stats-gap").textContent = "—";
      }
      const allYtd = (txYTD.data || []).flatMap((t) => t.attributes.transactions.map((x) => x.date));
      if ($k("cs-stats-first")) {
        const earliest = allYtd.sort()[0];
        $k("cs-stats-first").textContent = earliest ? dat(earliest) : "—";
      }
      const recAmount = merchants.filter((m) => m.count >= 2).reduce((a, m) => a + m.amount, 0);
      const oneOff = curSpent - recAmount;
      const recPct = curSpent > 0 ? (recAmount / curSpent) * 100 : 0;
      const oneOffPct = 100 - recPct;
      if ($k("cs-split-bar")) $k("cs-split-bar").innerHTML =
        `<div class="seg seg-oneoff" style="width:${oneOffPct.toFixed(0)}%">${oneOffPct.toFixed(0)}%</div>
         <div class="seg seg-recur dark" style="width:${recPct.toFixed(0)}%">${recPct.toFixed(0)}%</div>`;
      if ($k("cs-split-legend")) $k("cs-split-legend").innerHTML =
        `<span class="item"><span class="sw" style="background:var(--cat-color)"></span>One-off <b class="ms-1">${fmt(oneOff)}</b></span>
         <span class="item"><span class="sw" style="background:var(--pala-info)"></span>Repeat-merchant <b class="ms-1">${fmt(recAmount)}</b></span>`;
      if ($k("cs-split-note")) $k("cs-split-note").textContent =
        recAmount > 0
          ? `Merchants seen 2+ times this period count as repeat spend.`
          : "All spend this period was to unique merchants.";
      const budgetSeen = {};
      for (const t of (txCur.data || [])) for (const tr of t.attributes.transactions) {
        if (tr.budget_id) budgetSeen[tr.budget_id] = tr.budget_name;
      }
      if ($k("cs-linked-budget")) {
        const ids = Object.keys(budgetSeen);
        $k("cs-linked-budget").innerHTML = ids.length
          ? ids.map((bid) => `<a href="budget-show.html?id=${bid}"><b style="color:var(--pala-mint)">${esc(budgetSeen[bid])}</b></a>`).join(" · ")
          : '<span class="text-muted">—</span>';
      }
      if ($k("cs-linked-rules")) $k("cs-linked-rules").innerHTML = `<a href="rules.html">Manage →</a>`;
      const acctsSeen = {};
      for (const t of (txCur.data || [])) for (const tr of t.attributes.transactions) {
        if (tr.source_id && tr.type === "withdrawal") acctsSeen[tr.source_id] = tr.source_name;
      }
      if ($k("cs-linked-accounts")) {
        const ids = Object.keys(acctsSeen);
        $k("cs-linked-accounts").innerHTML = ids.length
          ? ids.map((aid) => `<a href="account-show.html?id=${aid}" class="chip">${esc(acctsSeen[aid])}</a>`).join("")
          : '<span class="text-muted">—</span>';
      }
      if ($k("cs-linked-tags")) $k("cs-linked-tags").innerHTML = '<span class="text-muted small">—</span>';
      const txBody = $k("cs-tx-body");
      if (txBody) {
        const txs = txCur.data || [];
        if (!txs.length) txBody.innerHTML = `<tr><td colspan="6" class="text-muted p-3">No transactions this period.</td></tr>`;
        else txBody.innerHTML = txs.slice(0, 12).map((t) => {
          const tr = t.attributes.transactions[0];
          const amt = Number(tr.amount);
          const sign = tr.type === "withdrawal" ? "−" : "+";
          const cls = tr.type === "withdrawal" ? "text-danger" : "text-mint";
          const ico = tr.type === "withdrawal" ? "fa-arrow-left text-danger" : "fa-arrow-right text-mint";
          const merchant = tr.type === "withdrawal" ? (tr.destination_name || "") : (tr.source_name || "");
          return `<tr>
            <td class="text-center"><i class="fa-solid ${ico}"></i></td>
            <td>${esc(tr.description)}</td>
            <td class="num">${dat(tr.date)}</td>
            <td>${esc(merchant)}</td>
            <td class="text-muted">${esc(tr.type === "withdrawal" ? (tr.source_name || "") : (tr.destination_name || ""))}</td>
            <td class="text-end num ${cls}">${sign}${fmt(amt)}</td>
          </tr>`;
        }).join("");
      }
      if ($k("cs-tx-viewall")) {
        $k("cs-tx-viewall").setAttribute("href", "transactions.html?cat_id=" + id);
        $k("cs-tx-viewall").textContent = `View all ${(txCur.data || []).length} →`;
      }
      if ($k("cs-tx-title")) $k("cs-tx-title").textContent = `Transactions · current period`;
      const crumbs = document.querySelector("[data-crumbs]");
      if (crumbs) crumbs.dataset.crumbs = `Home/Categories/${name}`;
    } catch (e) {
      console.error(e);
      if ($k("cs-title")) $k("cs-title").textContent = "Failed to load: " + e.message;
    }
  }

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    const sub  = document.body.dataset.sub;
    if (page === "classification" && sub === "categories") pageCategories();
    else if (page === "category-show") pageCategoryShow();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
