/* pala-live2.js — heavy detail-page handlers (budget-show, category-show, account-show, tags).
   Split out of pala-live.js so each file stays under the static-serve size cap.
   Loaded AFTER pala-live.js on the 4 detail pages. */
(function () {
  const tok  = () => localStorage.getItem("pala_pat") || "";
  const base = () => (localStorage.getItem("pala_url") || location.origin).replace(/\/$/, "") + "/api/v1";
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

  /* ─── Account detail ─────────────────────────────────────────────────── */
  async function pageAccountShow() {
    const $k = (k) => document.querySelector(`[data-k="${k}"]`);
    const id = qs("id");
    if (!id) { if ($k("ac-title")) $k("ac-title").textContent = "No account specified"; return; }
    try {
      const today = new Date();
      const sCur = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const eCur = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
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
        let running = bal;
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

  /* ─── Tags ───────────────────────────────────────────────────────────── */
  async function pageTags() {
    const $k = (k) => document.querySelector(`[data-k="${k}"]`);
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

  /* ─── Budget detail ──────────────────────────────────────────────────── */
  async function pageBudgetShow() {
    const $k = (k) => document.querySelector(`[data-k="${k}"]`);
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
        const cats = Object.values(txByCat).slice(0, 6);
        $k("bs-setup-categories").innerHTML = cats.length
          ? cats.map((c) => c.id
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
      const $kE = (k) => document.querySelector(`[data-k="${k}"]`);
      if ($kE("bs-title")) $kE("bs-title").textContent = "Failed to load: " + e.message;
    }
  }

  /* ─── Category detail ────────────────────────────────────────────────── */
  async function pageCategoryShow() {
    const $k = (k) => document.querySelector(`[data-k="${k}"]`);
    let id = qs("id"), slugP = qs("cat");
    try {
      if (!id && slugP) {
        const list = (await api("/categories")).data;
        const match = list.find((c) => slug(c.attributes.name) === slugP);
        if (match) id = match.id;
      }
      if (!id) { if ($k("cs-title")) $k("cs-title").textContent = "No category specified"; return; }

      const today = new Date();
      const sCur = new Date(today.getFullYear(), today.getMonth(), 1);
      const eCur = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const sPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const ePrev = new Date(today.getFullYear(), today.getMonth(), 0);
      const sYTD = new Date(today.getFullYear(), 0, 1);

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
        const va = $k("cs-tx-viewall");
        va.setAttribute("href", "transactions.html?cat_id=" + id);
        va.textContent = `View all ${(txCur.data || []).length} →`;
      }
      if ($k("cs-tx-title")) $k("cs-tx-title").textContent = `Transactions · current period`;
      const crumbs = document.querySelector("[data-crumbs]");
      if (crumbs) crumbs.dataset.crumbs = `Home/Categories/${name}`;
    } catch (e) {
      console.error(e);
      const $kE = (k) => document.querySelector(`[data-k="${k}"]`);
      if ($kE("cs-title")) $kE("cs-title").textContent = "Failed to load: " + e.message;
    }
  }

  window.__palaExtra = { pageAccountShow, pageTags, pageBudgetShow, pageCategoryShow, pageTransactionShow };

  // Self-boot in case pala-live.js is already past its boot() call.
  function boot2() {
    const page = document.body.dataset.page;
    const sub  = document.body.dataset.sub;
    if (page === "account-show")  return pageAccountShow();
    if (page === "budget-show")   return pageBudgetShow();
    if (page === "category-show") return pageCategoryShow();
    if (page === "transaction-show") return pageTransactionShow();
    if (page === "classification" && sub === "tags") return pageTags();
  }

  /* ─── Transaction detail ─────────────────────────────────────────────── */
  async function pageTransactionShow() {
    const $k = (k) => document.querySelector(`[data-k="${k}"]`);
    const setText = (k, v) => { const el = $k(k); if (el) el.textContent = v; };
    const setHTML = (k, v) => { const el = $k(k); if (el) el.innerHTML = v; };
    const id = qs("tx") || qs("id");
    if (!id) { setText("tx-desc", "No transaction specified"); return; }
    const rawPeriod = qs("period") || "";
    const periodQS = rawPeriod ? `?period=${encodeURIComponent(rawPeriod)}` : "";
    const backBtn = $k("tx-back-btn");
    if (backBtn) backBtn.setAttribute("href", `transactions.html${periodQS}`);

    try {
      const res = await api(`/transactions/${id}`);
      const splits = (res.data && res.data.attributes && res.data.attributes.transactions) || [];
      if (!splits.length) { setText("tx-desc", "Transaction has no splits"); return; }
      const first = splits[0];
      const type = (first.type || "").toLowerCase();
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const chip = $k("tx-type-chip");
      if (chip) chip.className = "tx-type-chip " + type;
      setText("tx-type-label", typeLabel);
      const isSplit = splits.length > 1;
      const totalAmt = splits.reduce((s, x) => s + Math.abs(Number(x.amount || 0)), 0);
      const amtCls = type === "deposit" ? "text-success" : type === "transfer" ? "text-info" : "text-danger";
      const amtSign = type === "deposit" ? "+" : type === "transfer" ? "" : "−";
      const amtEl = $k("tx-amount");
      if (amtEl) { amtEl.className = "tx-amount " + amtCls; amtEl.textContent = amtSign + fmt(totalAmt) + (isSplit ? " (split)" : ""); }
      const desc = isSplit ? (res.data.attributes.group_title || first.description || "Split transaction") : (first.description || "—");
      setText("tx-desc", desc);
      document.title = desc + " — Firefly III · Pala";
      setText("tx-date", dat(first.date));
      setText("tx-id-line", "#" + id + (isSplit ? " · " + splits.length + " splits" : ""));

      if (!isSplit && first.foreign_amount && first.foreign_currency_code) {
        const fEl = $k("tx-foreign");
        if (fEl) { fEl.hidden = false; fEl.textContent = `≈ ${first.foreign_currency_symbol || ""}${Number(first.foreign_amount).toFixed(2)} ${first.foreign_currency_code}`; }
        const fRow = $k("tx-foreign-row");
        if (fRow) fRow.hidden = false;
        setText("tx-foreign-amt", `${first.foreign_currency_symbol || ""}${Number(first.foreign_amount).toFixed(2)} ${first.foreign_currency_code}`);
      }

      const acctPill = (aid, name, icon) => aid
        ? `<a class="acct-pill" href="account-show.html?id=${aid}"><i class="fa-solid ${icon} fa-fw"></i>${esc(name || "—")}</a>`
        : `<span class="acct-pill"><i class="fa-solid ${icon} fa-fw"></i>${esc(name || "—")}</span>`;
      const srcIcon = type === "deposit" ? "fa-money-bill-trend-up" : "fa-wallet";
      const dstIcon = type === "deposit" ? "fa-wallet" : type === "transfer" ? "fa-piggy-bank" : "fa-cart-shopping";
      setHTML("tx-flow", acctPill(first.source_id, first.source_name, srcIcon) + '<i class="fa-solid fa-arrow-right"></i>' + acctPill(first.destination_id, first.destination_name, dstIcon));

      setHTML("tx-category", first.category_id ? `<a class="kv-link" href="category-show.html?id=${first.category_id}">${esc(first.category_name || "—")}</a>` : '<span class="text-muted">—</span>');
      setHTML("tx-budget",   first.budget_id   ? `<a class="kv-link" href="budget-show.html?id=${first.budget_id}">${esc(first.budget_name || "—")}</a>`     : '<span class="text-muted">—</span>');
      setHTML("tx-bill",     first.bill_id     ? `<a class="kv-link" href="bills.html#bill-${first.bill_id}">${esc(first.bill_name || "Bill #" + first.bill_id)}</a>` : '<span class="text-muted">—</span>');
      const tags = (first.tags || []).map(t => `<a class="tag-pill" href="transactions.html?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join("");
      setHTML("tx-tags", tags || '<span class="text-muted">—</span>');
      setText("tx-currency", first.currency_code ? `${first.currency_code} (${first.currency_symbol || ""})` : "—");
      const proc = (first.book_date ? dat(first.book_date) + " · book" : "") + (first.process_date ? (first.book_date ? " · " : "") + dat(first.process_date) + " · process" : "");
      setText("tx-process", proc || dat(first.date));
      const note = first.notes && String(first.notes).trim();
      setHTML("tx-notes", note ? `<div class="note-box">${esc(note)}</div>` : '<span class="text-muted">—</span>');

      if (isSplit) {
        const card = $k("tx-splits-card");
        if (card) card.hidden = false;
        setText("tx-splits-count", `· ${splits.length} parts`);
        const body = $k("tx-splits-body");
        if (body) {
          body.innerHTML = splits.map((s, i) => {
            const sAmt = Math.abs(Number(s.amount || 0));
            const sCat = s.category_id ? `<a class="kv-link" href="category-show.html?id=${s.category_id}">${esc(s.category_name || "—")}</a>` : '<span class="text-muted">—</span>';
            const sBud = s.budget_id ? ` · <a class="kv-link" href="budget-show.html?id=${s.budget_id}">${esc(s.budget_name)}</a>` : "";
            const sCounter = type === "deposit" ? s.source_name : s.destination_name;
            return `<div class="split-row"><div class="d-flex justify-content-between align-items-baseline"><div><div class="split-num">Split ${i + 1}</div><div>${esc(s.description || "—")}</div><div class="text-muted small">${sCat}${sBud} · ${esc(sCounter || "")}</div></div><div class="${amtCls}" style="font-variant-numeric:tabular-nums; font-weight:500;">${amtSign}${fmt(sAmt)}</div></div></div>`;
          }).join("");
        }
      }

      const attrs = res.data.attributes;
      setText("tx-created", attrs.created_at ? new Date(attrs.created_at).toLocaleString("en-GB") : "—");
      setText("tx-updated", attrs.updated_at ? new Date(attrs.updated_at).toLocaleString("en-GB") : "—");
      setText("tx-internal-ref", first.internal_reference || "—");
      setText("tx-external-id", first.external_id || "—");
      const url = first.external_url;
      setHTML("tx-external-url", url ? `<a class="kv-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)} <i class="fa-solid fa-arrow-up-right-from-square fa-xs"></i></a>` : '<span class="text-muted">—</span>');
      setText("tx-reconciled", first.reconciled ? "Yes" : "No");

      const baseUrl = (localStorage.getItem("pala_url") || location.origin).replace(/\/$/, "");
      const editBtn = $k("tx-edit-btn");   if (editBtn)  editBtn.setAttribute("href",  `${baseUrl}/transactions/edit/${id}`);
      const cloneBtn = $k("tx-clone-btn"); if (cloneBtn) cloneBtn.setAttribute("href", `${baseUrl}/transactions/clone/${id}`);
      const delBtn = $k("tx-delete-btn");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!confirm("Delete this transaction? This cannot be undone.")) return;
          try { await api(`/transactions/${id}`, { method: "DELETE" }); location.href = `transactions.html${periodQS}`; }
          catch (e) { alert("Delete failed: " + e.message); }
        });
      }

      const counterId   = type === "deposit" ? first.source_id   : first.destination_id;
      const counterName = type === "deposit" ? first.source_name : first.destination_name;
      if (counterId) {
        try {
          const sim = await api(`/accounts/${counterId}/transactions?limit=5`);
          const list = (sim.data || []).filter(t => t.id !== id).slice(0, 4);
          setText("tx-similar-label", `More with ${counterName}`);
          setHTML("tx-similar", list.length ? list.map(t => {
            const inner = t.attributes.transactions[0];
            const a = Number(inner.amount);
            const aSign = inner.type === "deposit" ? "+" : inner.type === "transfer" ? "" : "−";
            const aCls = inner.type === "deposit" ? "text-success" : inner.type === "transfer" ? "text-info" : "text-danger";
            return `<a href="transaction-show.html?tx=${t.id}${rawPeriod ? '&period=' + encodeURIComponent(rawPeriod) : ''}" class="d-flex justify-content-between py-1 text-decoration-none" style="color:var(--pala-text);"><span>${esc(inner.description || "—")} <span class="text-muted small">· ${dat(inner.date)}</span></span><span class="${aCls}">${aSign}${fmt(a)}</span></a>`;
          }).join("") : '<span class="text-muted small">No other transactions.</span>');
        } catch { setHTML("tx-similar", '<span class="text-muted small">—</span>'); }
      } else { setHTML("tx-similar", '<span class="text-muted small">—</span>'); }

      if (first.category_id) {
        try {
          const cr = await api(`/categories/${first.category_id}/transactions?limit=5`);
          const list = (cr.data || []).filter(t => t.id !== id).slice(0, 4);
          setText("tx-cat-recent-label", `More in ${first.category_name}`);
          setHTML("tx-cat-recent", list.length ? list.map(t => {
            const inner = t.attributes.transactions[0];
            const a = Number(inner.amount);
            const aSign = inner.type === "deposit" ? "+" : inner.type === "transfer" ? "" : "−";
            const aCls = inner.type === "deposit" ? "text-success" : inner.type === "transfer" ? "text-info" : "text-danger";
            return `<a href="transaction-show.html?tx=${t.id}${rawPeriod ? '&period=' + encodeURIComponent(rawPeriod) : ''}" class="d-flex justify-content-between py-1 text-decoration-none" style="color:var(--pala-text);"><span>${esc(inner.description || "—")} <span class="text-muted small">· ${dat(inner.date)}</span></span><span class="${aCls}">${aSign}${fmt(a)}</span></a>`;
          }).join("") : '<span class="text-muted small">No other transactions in this category.</span>');
        } catch { setHTML("tx-cat-recent", '<span class="text-muted small">—</span>'); }
      } else { setHTML("tx-cat-recent", '<span class="text-muted small">—</span>'); }

      try {
        const lk = await api(`/transactions/${id}/links`);
        const links = lk.data || [];
        const linksEl = $k("tx-links");
        if (linksEl) {
          if (!links.length) linksEl.innerHTML = '<div class="text-muted small p-3">No linked transactions.</div>';
          else linksEl.innerHTML = links.map(l => {
            const a = l.attributes || {};
            const otherId = a.inward_id === id ? a.outward_id : a.inward_id;
            return `<a href="transaction-show.html?tx=${otherId}" class="d-block px-3 py-2 text-decoration-none" style="color:var(--pala-text); border-bottom:1px solid var(--pala-navy-border);"><span class="text-muted small">${esc(a.link_type_name || "linked")}</span> · #${otherId}</a>`;
          }).join("");
        }
      } catch {
        const linksEl = $k("tx-links");
        if (linksEl) linksEl.innerHTML = '<div class="text-muted small p-3">No linked transactions.</div>';
      }

      const b = document.body;
      if (b) b.dataset.crumbs = `Home/Transactions/${desc.slice(0, 60)}`;
    } catch (e) {
      console.error(e);
      setText("tx-desc", "Failed to load: " + e.message);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot2);
  else boot2();
})();
