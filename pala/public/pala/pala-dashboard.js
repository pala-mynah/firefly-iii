/* pala-dashboard.js — Dashboard: budget-hero enhancement + live hydration. */
(function () {
  const { api: palaApi, esc, fmt, slug, periodRange, wirePeriodChrome } = window.Pala;

  /* ── pageDashboard: enhances budget hero cards with category chips ── */
  async function pageDashboard() {
    const tryEnhance = async (attempt = 0) => {
      if (attempt > 20) return;
      if (!document.querySelector("a.pace-row.hero")) return setTimeout(() => tryEnhance(attempt + 1), 300);
      try {
        const { start, end } = periodRange();
        const budgets = await palaApi("/budgets");
        for (const b of budgets.data) {
          const row = document.querySelector(`a.pace-row.hero[data-budget-id="${b.id}"]`) ||
                      document.querySelector(`a.pace-row.hero[href*="budget=${slug(b.attributes.name)}"]`);
          if (!row) continue;
          const cats = row.querySelector(".pace-cats");
          if (!cats) continue;
          const txs = await palaApi(`/budgets/${b.id}/transactions?start=${start}&end=${end}&limit=500`);
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
        const tx = await palaApi(`/transactions?start=${start}&end=${end}&type=withdrawal&limit=500`);
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

  /* ── Live hydration (index.html pass-2 logic) ─────────────────────────── */
  const LS_PAT = 'pala_pat';
  const LS_URL = 'pala_url';
  const DEFAULT_URL = (location.protocol === 'http:' || location.protocol === 'https:')
    ? location.origin
    : 'http://localhost:7076';

  const fmtEUR  = n => '€' + Math.round(n).toLocaleString('en-US');
  const fmtEURc = n => {
    const s = (Math.abs(n)).toFixed(2);
    const [whole, cents] = s.split('.');
    const sign = n < 0 ? '−' : '';
    return sign + '€' + Number(whole).toLocaleString('en-US') + '<span class="text-muted" style="font-weight:400">.' + cents + '</span>';
  };
  const $  = sel => document.querySelector(sel);
  const setText = (selector, html) => { const el = $(selector); if (el) el.innerHTML = html; };
  const escH = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function showSetup() {
    const urlEl = $('#pala-url-input'), patEl = $('#pala-pat-input'), modal = $('#pala-setup-modal');
    if (!modal) return;
    if (urlEl) urlEl.value = localStorage.getItem(LS_URL) || DEFAULT_URL;
    if (patEl) patEl.value = localStorage.getItem(LS_PAT) || '';
    modal.style.display = 'flex';
  }
  function hideSetup() { const el = $('#pala-setup-modal'); if (el) el.style.display = 'none'; }

  function dashApi(path) {
    const base = localStorage.getItem(LS_URL) || DEFAULT_URL;
    const pat  = localStorage.getItem(LS_PAT);
    return fetch(base + '/api/v1' + path, {
      headers: { 'Authorization': 'Bearer ' + pat, 'Accept': 'application/vnd.api+json' },
    }).then(r => { if (!r.ok) throw new Error(path + ' → ' + r.status); return r.json(); });
  }

  function monthBounds() {
    const now = new Date();
    const raw = new URLSearchParams(location.search).get('period') || '';
    let y, m0, m1, mat;
    if ((mat = raw.match(/^(\d{4})$/))) {
      y = +mat[1]; m0 = 0; m1 = 12;
    } else if ((mat = raw.match(/^(\d{4})-Q([1-4])$/i))) {
      y = +mat[1]; m0 = (+mat[2] - 1) * 3; m1 = m0 + 3;
    } else if ((mat = raw.match(/^(\d{4})-(\d{2})$/))) {
      y = +mat[1]; m0 = +mat[2] - 1; m1 = m0 + 1;
    } else {
      y = now.getFullYear(); m0 = now.getMonth(); m1 = m0 + 1;
    }
    const start = new Date(y, m0, 1);
    const end   = new Date(y, m1, 0);
    const iso = x => x.toISOString().slice(0, 10);
    return { start: iso(start), end: iso(end) };
  }

  function periodLabel(start, end) {
    const s = new Date(start), e = new Date(end);
    const month = e.toLocaleString('en-US', { month: 'long' });
    return s.getDate() + ' – ' + e.getDate() + ' ' + month + ' ' + e.getFullYear();
  }

  async function hydrate() {
    const status = $('#pala-live-status');
    const banner = $('#pala-live-banner');
    if (banner) banner.style.display = 'block';
    if (status) status.textContent = 'fetching summary…';

    const { start, end } = monthBounds();
    const sum = await dashApi(`/summary/basic?start=${start}&end=${end}`);

    let netWorth = 0, spent = 0, earned = 0;
    for (const k of Object.keys(sum)) {
      if (k.startsWith('net-worth-in-')) netWorth = parseFloat(sum[k].monetary_value);
      else if (k.startsWith('spent-in-'))  spent    = Math.abs(parseFloat(sum[k].monetary_value));
      else if (k.startsWith('earned-in-')) earned   = parseFloat(sum[k].monetary_value);
    }
    const saved = earned - spent;
    const savingsRate = earned > 0 ? Math.round((saved / earned) * 100) : 0;

    setText('[data-pala="networth"]', fmtEURc(netWorth));
    setText('[data-pala="spent"]',    '€' + spent.toFixed(2));
    setText('[data-pala="earned"]',   '€' + earned.toFixed(2));
    setText('[data-pala="saved"]',    '€' + saved.toFixed(2));

    const mlabel = (new Date()).toLocaleString('en-US', { month: 'short' });
    setText('[data-pala="spent-label"]',  `Spent · ${mlabel}`);
    setText('[data-pala="earned-label"]', `Earned · ${mlabel}`);
    setText('[data-pala="saved-label"]',  `Saved · ${mlabel} <span class="stat-trend up">${savingsRate}% rate</span>`);
    setText('[data-pala="networth-delta"]', '');
    setText('[data-pala="spent-delta"]',    '');
    setText('[data-pala="earned-delta"]',   '');

    if (status) status.textContent = 'fetching budgets…';
    try {
      const budgets = await dashApi(`/budgets?start=${start}&end=${end}`);
      let budgeted = 0, budSpent = 0;
      for (const b of budgets.data) {
        const a = b.attributes || {};
        if (Array.isArray(a.spent)) for (const s of a.spent) budSpent += Math.abs(parseFloat(s.sum) || 0);
        if (a.auto_budget_amount) budgeted += parseFloat(a.auto_budget_amount);
      }
      const avail = Math.max(0, budgeted - budSpent);
      setText('[data-pala="avail"]', fmtEURc(avail));
      setText('[data-pala="avail-meta"]', `remaining of ${fmtEUR(budgeted)} across ${budgets.data.length} budgets`);
      const daysLeft = (new Date(end) - new Date()) / 86400000 | 0;
      setText('[data-pala="avail-label"]', `Available budget <span class="stat-trend">${Math.max(0, daysLeft)} days left</span>`);
    } catch (e) { console.warn('budget fetch failed', e); }

    if (status) status.textContent = 'rendering envelopes…';
    try { await hydrateBudgetHero(start, end); } catch (e) { console.warn('budget hero failed', e); }
    try { await hydrateDonut(start, end); }      catch (e) { console.warn('donut failed', e); }
    try { await hydrateRecent(start, end); }     catch (e) { console.warn('recent tx failed', e); }
    try { await hydrateSubs(start, end); }       catch (e) { console.warn('subs failed', e); }
    try { await hydratePiggy(); }                catch (e) { console.warn('piggy failed', e); }
    try { await hydrateAttention(start, end); }  catch (e) { console.warn('attention failed', e); }

    if (status) {
      status.textContent = '✓ live';
      setTimeout(() => { status.textContent = 'live · ' + (new Date()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }, 1200);
    }
  }

  async function hydrateBudgetHero(start, end) {
    const budgets = await dashApi(`/budgets?start=${start}&end=${end}`);
    const today = new Date();
    const endDate = new Date(end);
    const daysInMonth = endDate.getDate();
    const dayOfMonth = Math.min(today.getDate(), daysInMonth);
    const pacePct = (dayOfMonth / daysInMonth) * 100;
    const monthName = endDate.toLocaleString('en-US', { month: 'long' });
    let totalBudgeted = 0, totalSpent = 0;
    const rows = [];
    for (const b of budgets.data) {
      const a = b.attributes || {};
      if (!a.active) continue;
      const budgeted = parseFloat(a.auto_budget_amount || 0) || 0;
      let spent = 0;
      if (Array.isArray(a.spent)) for (const s of a.spent) spent += Math.abs(parseFloat(s.sum) || 0);
      totalBudgeted += budgeted; totalSpent += spent;
      const spentPct = budgeted > 0 ? (spent / budgeted) * 100 : 0;
      const remaining = Math.max(0, budgeted - spent);
      const daysLeft = Math.max(1, daysInMonth - dayOfMonth);
      const perDay = remaining / daysLeft;
      let pillClass = 'ok', pillText = 'on pace';
      if (spentPct > 100)               { pillClass = 'over';  pillText = 'over'; }
      else if (spentPct > pacePct + 10) { pillClass = 'over';  pillText = `+${Math.round(spentPct - pacePct)}% over pace`; }
      else if (spentPct < pacePct - 15) { pillClass = 'under'; pillText = `${Math.round(pacePct - spentPct)}% under`; }
      let fillClass = '';
      if (spentPct > 100) fillClass = 'over';
      else if (spentPct < pacePct - 15) fillClass = 'under';
      const statusText = spentPct > 100
        ? `€${(spent - budgeted).toFixed(2)} over · day ${dayOfMonth} of ${daysInMonth}`
        : `€${remaining.toFixed(2)} left · ~€${perDay.toFixed(0)}/day to spend`;
      rows.push(`
        <div class="col-md-6">
          <a href="budgets.html?budget_id=${b.id}" class="pace-row hero" data-budget-id="${b.id}">
            <div class="pace-head"><span class="name">${escH(a.name)}</span><span class="vals">€${spent.toFixed(2)} / €${budgeted.toFixed(2)}</span></div>
            <div class="pace-track">
              <div class="pace-fill ${fillClass}" style="width:${Math.min(100, spentPct).toFixed(1)}%"></div>
              <div class="pace-marker" style="left:${pacePct.toFixed(1)}%" title="Day ${dayOfMonth} of ${daysInMonth}"></div>
            </div>
            <div class="pace-status">
              <span>${statusText}</span>
              <span class="pill ${pillClass}">${pillText}</span>
            </div>
          </a>
        </div>`);
    }
    const grid = document.getElementById('pala-envelope-grid');
    if (grid) grid.innerHTML = rows.join('');
    setText('[data-pala="budget-hero-title"]',   `Budgets · ${monthName}`);
    setText('[data-pala="budget-hero-summary"]',  `${budgets.data.length} envelopes · €${totalSpent.toFixed(2)} of €${totalBudgeted.toFixed(2)} spent`);
    setText('[data-pala="budget-hero-pace"]',     `Day ${dayOfMonth} of ${daysInMonth} · expected <span class="text-mint" style="font-variant-numeric:tabular-nums">${Math.round(pacePct)}%</span>`);
  }

  async function hydrateDonut(start, end) {
    const PALETTE = ['#3ecfb2','#5bafd6','#f0a84a','#a48cd2','#e05c6a','#7a9bbf','#d97a8a','#8cc9a0'];
    let cats = [];
    try {
      const r = await dashApi(`/insight/expense/category?start=${start}&end=${end}`);
      cats = (r || []).map(x => ({
        id: x.id, name: x.name || 'Uncategorised',
        amt: Math.abs(parseFloat(x.difference_float || x.difference || 0)),
      })).filter(x => x.amt > 0).sort((a,b) => b.amt - a.amt);
    } catch (e) { console.warn('insight/expense/category failed, falling back', e); }
    if (!cats.length) {
      try {
        const r = await dashApi(`/categories?start=${start}&end=${end}`);
        cats = (r.data || []).map(d => {
          const a = d.attributes || {};
          let amt = 0;
          if (Array.isArray(a.spent)) for (const s of a.spent) amt += Math.abs(parseFloat(s.sum) || 0);
          return { id: d.id, name: a.name, amt };
        }).filter(x => x.amt > 0).sort((a,b) => b.amt - a.amt);
      } catch (e) { console.warn('categories fallback failed', e); }
    }
    const monthName = (new Date(end)).toLocaleString('en-US', { month: 'long' });
    setText('[data-pala="donut-title"]', `Spend by category · ${monthName}`);
    const segsEl = document.getElementById('pala-donut-segs');
    const legEl  = document.getElementById('pala-donut-legend');
    if (!segsEl || !legEl) return;
    segsEl.innerHTML = ''; legEl.innerHTML = '';
    if (!cats.length) { legEl.innerHTML = '<div class="text-muted small p-3">No category spend this period.</div>'; return; }
    const total = cats.reduce((s,c) => s + c.amt, 0);
    const top = cats.slice(0, 5);
    const rest = cats.slice(5);
    const restAmt = rest.reduce((s,c) => s + c.amt, 0);
    const display = top.slice();
    if (restAmt > 0) display.push({ id: 'all', name: `${rest.length} other categor${rest.length === 1 ? 'y' : 'ies'}`, amt: restAmt, isOther: true });
    const C = 2 * Math.PI * 56;
    let offset = 0;
    display.forEach((c, i) => {
      const frac = c.amt / total;
      const dash = (frac * C).toFixed(2);
      const color = PALETTE[i % PALETTE.length];
      segsEl.insertAdjacentHTML('beforeend',
        `<circle cx="70" cy="70" r="56" stroke="${color}" stroke-dasharray="${dash} ${C.toFixed(2)}" stroke-dashoffset="-${offset.toFixed(2)}"/>`);
      const href = c.isOther ? 'categories.html' : (c.id ? `category-show.html?cat=${encodeURIComponent(c.id)}` : 'transactions.html?filter=uncategorised');
      const pct = (frac * 100).toFixed(0);
      legEl.insertAdjacentHTML('beforeend',
        `<a href="${href}" class="donut-legend-row">
          <span class="donut-legend-swatch" style="background:${color}"></span>
          <span class="donut-legend-name">${escH(c.name)}</span>
          <span class="donut-legend-amt">${fmtEURc(c.amt)}</span>
          <span class="donut-legend-delta">${pct}%</span>
        </a>`);
      offset += frac * C;
    });
  }

  async function hydrateRecent(start, end) {
    const el = document.getElementById('pala-recent-tx');
    if (!el) return;
    const r = await dashApi(`/transactions?start=${start}&end=${end}&limit=8&page=1`);
    const rows = (r.data || []).slice(0, 8);
    const rawPeriod = new URLSearchParams(location.search).get('period') || '';
    const periodQS = rawPeriod ? `period=${encodeURIComponent(rawPeriod)}` : '';
    const recentCard = el.closest('.card');
    const seeAll = recentCard ? recentCard.querySelector('a.card-header-link[href^="transactions.html"]') : null;
    if (seeAll && periodQS) seeAll.setAttribute('href', `transactions.html?${periodQS}`);
    if (!rows.length) { el.innerHTML = '<div class="text-muted small p-3">No transactions in this period.</div>'; return; }
    el.innerHTML = rows.map(t => {
      const tx = (t.attributes && t.attributes.transactions && t.attributes.transactions[0]) || {};
      const type = (tx.type || '').toLowerCase();
      const amt = parseFloat(tx.amount || 0);
      const dateStr = tx.date ? new Date(tx.date).toLocaleString('en-US', { month: 'short', day: 'numeric' }) : '';
      let icon, cls, amtPrefix;
      if (type === 'deposit')       { icon = 'fa-arrow-right';    cls = 'text-success'; amtPrefix = '+'; }
      else if (type === 'transfer') { icon = 'fa-arrows-rotate';  cls = 'text-info';    amtPrefix = ''; }
      else                          { icon = 'fa-arrow-left';     cls = 'text-danger';  amtPrefix = '−'; }
      const cat  = tx.category_name || (type === 'transfer' ? 'Transfer' : (type === 'deposit' ? 'Income' : 'Uncategorised'));
      const acct = tx.source_name && tx.destination_name ? `${tx.source_name} → ${tx.destination_name}` : (tx.source_name || tx.destination_name || '');
      const txQS = `?tx=${t.id}${rawPeriod ? '&period=' + encodeURIComponent(rawPeriod) : ''}`;
      return `<a href="transaction-show.html${txQS}" class="tx-row" data-tx-id="${t.id}">
        <i class="fa-solid ${icon} ${cls} tx-dir"></i>
        <div>
          <div class="tx-name">${escH(tx.description || '—')}</div>
          <div class="tx-meta">${escH(cat)} · ${escH(acct)}</div>
        </div>
        <span class="tx-amt ${cls}">${amtPrefix}€${amt.toFixed(2)}</span>
        <span class="tx-date">${escH(dateStr)}</span>
      </a>`;
    }).join('');
  }

  function billNextDue(a) {
    if (Array.isArray(a.pay_dates) && a.pay_dates[0]) return new Date(a.pay_dates[0]);
    if (a.next_expected_match) return new Date(a.next_expected_match);
    if (!a.date) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(a.date); d.setHours(0,0,0,0);
    const step = {
      daily:       (x) => x.setDate(x.getDate() + 1),
      weekly:      (x) => x.setDate(x.getDate() + 7),
      monthly:     (x) => x.setMonth(x.getMonth() + 1),
      quarterly:   (x) => x.setMonth(x.getMonth() + 3),
      'half-year': (x) => x.setMonth(x.getMonth() + 6),
      yearly:      (x) => x.setFullYear(x.getFullYear() + 1),
    }[a.repeat_freq];
    if (!step) return null;
    let i = 0;
    while (d < today && i++ < 200) step(d);
    const prev = new Date(d);
    const stepBack = {
      daily:       (x) => x.setDate(x.getDate() - 1),
      weekly:      (x) => x.setDate(x.getDate() - 7),
      monthly:     (x) => x.setMonth(x.getMonth() - 1),
      quarterly:   (x) => x.setMonth(x.getMonth() - 3),
      'half-year': (x) => x.setMonth(x.getMonth() - 6),
      yearly:      (x) => x.setFullYear(x.getFullYear() - 1),
    }[a.repeat_freq];
    if (stepBack) stepBack(prev);
    const prevDiff = (today - prev) / 86400000;
    return (prevDiff > 0 && prevDiff <= 7) ? prev : d;
  }

  async function hydrateSubs() {
    const el = document.getElementById('pala-subs');
    if (!el) return;
    const r = await dashApi('/bills');
    const today = new Date(); today.setHours(0,0,0,0);
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 30);
    const items = [];
    for (const b of (r.data || [])) {
      const a = b.attributes || {};
      if (a.active === false) continue;
      const d = billNextDue(a);
      if (!d || d > horizon) continue;
      const amt = (parseFloat(a.amount_min || 0) + parseFloat(a.amount_max || 0)) / 2;
      items.push({ id: b.id, name: a.name, due: d, amt });
    }
    items.sort((x,y) => x.due - y.due);
    const top = items.slice(0, 4);
    if (!top.length) {
      el.innerHTML = '<div class="text-muted small p-3">No subscriptions due in the next 30 days.</div>';
      setText('[data-pala="subs-footer"]', '<span>Next 30 days · 0 bills</span><span class="text-text">—</span>');
      return;
    }
    el.innerHTML = top.map(it => {
      const diff = Math.round((it.due - today) / 86400000);
      let dotCls = '', when;
      if (diff <= 0)      { dotCls = 'due-now';  when = diff === 0 ? 'today' : `${-diff}d overdue`; }
      else if (diff <= 7) { dotCls = 'due-soon'; when = `in ${diff} day${diff === 1 ? '' : 's'}`; }
      else                {                       when = `in ${diff} days`; }
      return `<a href="bills.html?bill=${encodeURIComponent(it.id)}" class="sub-row">
        <span class="sub-dot ${dotCls}"></span>
        <span class="sub-name">${escH(it.name)}</span>
        <span class="sub-when">${escH(when)}</span>
        <span class="sub-amt">~€${it.amt.toFixed(2)}</span>
      </a>`;
    }).join('');
    const totalAmt = items.reduce((s,i) => s + i.amt, 0);
    setText('[data-pala="subs-footer"]', `<span>Next 30 days · ${items.length} bill${items.length === 1 ? '' : 's'}</span><span class="text-text">~€${totalAmt.toFixed(2)}</span>`);
  }

  async function hydratePiggy() {
    const el = document.getElementById('pala-piggy');
    if (!el) return;
    const r = await dashApi('/piggy-banks');
    const items = (r.data || []).map(p => {
      const a = p.attributes || {};
      const cur = parseFloat(a.current_amount || 0);
      const tgt = parseFloat(a.target_amount || 0);
      return { id: p.id, name: a.name, cur, tgt, pct: tgt > 0 ? (cur / tgt) * 100 : 0, target_date: a.target_date };
    }).sort((a,b) => b.tgt - a.tgt).slice(0, 3);
    if (!items.length) { el.innerHTML = '<div class="text-muted small">No piggy banks set up.</div>'; return; }
    el.innerHTML = items.map(p => {
      const fillClass = p.pct >= 100 ? '' : (p.pct < 50 ? 'under' : '');
      let metaRight = '';
      if (p.target_date) {
        const days = Math.max(1, Math.round((new Date(p.target_date) - new Date()) / 86400000));
        const months = Math.max(1, Math.round(days / 30));
        const need = Math.max(0, p.tgt - p.cur);
        metaRight = months > 0 ? `~€${(need / months).toFixed(0)}/mo to hit ${new Date(p.target_date).toLocaleString('en-US', { month: 'short', year: 'numeric' })}` : '';
      }
      return `<a href="piggy.html?piggy=${encodeURIComponent(p.id)}" class="piggy-row">
        <div class="piggy-head"><span class="name">${escH(p.name)}</span><span class="vals">${fmtEURc(p.cur)} / ${fmtEURc(p.tgt)}</span></div>
        <div class="pace-track"><div class="pace-fill ${fillClass}" style="width:${Math.min(100, p.pct).toFixed(1)}%"></div></div>
        <div class="piggy-meta"><span>${Math.round(p.pct)}% funded</span><span>${escH(metaRight)}</span></div>
      </a>`;
    }).join('');
  }

  async function hydrateAttention(start, end) {
    const el = document.getElementById('pala-attention');
    if (!el) return;
    const items = [];
    try {
      const r = await dashApi(`/transactions?start=${start}&end=${end}&type=withdrawal&limit=50&page=1`);
      const uncat = (r.data || []).filter(t => {
        const tx = (t.attributes && t.attributes.transactions && t.attributes.transactions[0]) || {};
        return !tx.category_name && !tx.category_id;
      });
      if (uncat.length) {
        const sum = uncat.reduce((s,t) => s + Math.abs(parseFloat(t.attributes.transactions[0].amount || 0)), 0);
        const dates = uncat.map(t => new Date(t.attributes.transactions[0].date)).sort((a,b) => a - b);
        const oldest = dates[0] && dates[0].toLocaleString('en-US', { month: 'short', day: 'numeric' });
        items.push({
          href: 'transactions.html?filter=uncategorised', iconClass: 'warn', icon: 'fa-question',
          title: `${uncat.length} transaction${uncat.length === 1 ? '' : 's'} need a category`,
          meta: `€${sum.toFixed(2)} · oldest from ${oldest}`,
        });
      }
    } catch (e) {}
    try {
      const r = await dashApi('/bills');
      const today = new Date(); today.setHours(0,0,0,0);
      const due = [];
      for (const b of (r.data || [])) {
        const a = b.attributes || {};
        if (a.active === false) continue;
        const d = billNextDue(a);
        if (!d) continue;
        const diff = (d - today) / 86400000;
        if (diff <= 0) due.push({ id: b.id, name: a.name, days: -diff, amt: (parseFloat(a.amount_min || 0) + parseFloat(a.amount_max || 0)) / 2 });
      }
      if (due.length) {
        const top = due.sort((a,b) => b.days - a.days)[0];
        items.push({
          href: `bills.html?bill=${encodeURIComponent(top.id)}`, iconClass: 'danger', icon: 'fa-clock',
          title: top.days === 0 ? `${top.name} is due today` : `${top.name} is ${top.days}d overdue`,
          meta: `~€${top.amt.toFixed(2)} · bill not yet matched`,
        });
      }
    } catch (e) {}
    setText('[data-pala="attention-count"]', items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'all clear');
    if (!items.length) { el.innerHTML = '<div class="text-muted small p-3">Nothing needs attention right now. 🎉</div>'; return; }
    el.innerHTML = items.map(i => `
      <a href="${i.href}" class="attention-row">
        <div class="attention-icon ${i.iconClass}"><i class="fa-solid ${i.icon}"></i></div>
        <div class="attention-body">
          <div class="attention-title">${escH(i.title)}</div>
          <div class="attention-meta">${escH(i.meta)}</div>
        </div>
        <i class="fa-solid fa-chevron-right"></i>
      </a>`).join('');
  }

  async function bootHydration() {
    if (!localStorage.getItem(LS_PAT)) { showSetup(); return; }
    const saveEl = $('#pala-setup-save');
    if (saveEl) saveEl.addEventListener('click', () => {
      const pat = $('#pala-pat-input')?.value.trim();
      const url = $('#pala-url-input')?.value.trim().replace(/\/$/, '');
      if (!pat) return;
      localStorage.setItem(LS_PAT, pat);
      localStorage.setItem(LS_URL, url || DEFAULT_URL);
      hideSetup();
      bootHydration();
    });
    const clearEl = $('#pala-setup-clear');
    if (clearEl) clearEl.addEventListener('click', hideSetup);
    const discEl = $('#pala-disconnect');
    if (discEl) discEl.addEventListener('click', () => { localStorage.removeItem(LS_PAT); location.reload(); });
    try {
      await hydrate();
    } catch (e) {
      console.error('pala live data failed:', e);
      const banner = $('#pala-live-banner');
      const status = $('#pala-live-status');
      if (banner) banner.style.display = 'block';
      if (status) status.textContent = '⚠ ' + e.message + ' — click ✕ to re-enter token';
    }
  }

  window.palaReconnect = showSetup;

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    if (page !== "dashboard" && page !== "index") return;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.period-pills button');
      if (!btn) return;
      btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    pageDashboard();
    bootHydration();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
