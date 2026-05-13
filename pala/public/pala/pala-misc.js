/* pala-misc.js — Reports, Search, Preferences, Profile. */
(function () {
  const { api, esc, fmt, dat, qs, $k, wirePeriodChrome, periodRange } = window.Pala;

  function daysBetween(a, b) {
    return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000) + 1);
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
              <div class="fs-3" style="font-family:'Crimson Pro',serif;color:${net>=0?'var(--pala-mint)':'var(--pala-danger)'}">${net>=0?'+':'−'}€${Math.abs(net).toLocaleString("de-AT",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              <div class="text-muted small mt-2">${count} txn${count===1?'':'s'} · ${esc(s)} → ${esc(ee)}</div>
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
            if (filters.category && !(tx.category_name||"").toLowerCase().includes(filters.category.toLowerCase())) return false;
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
      const prefill = { description: text || qEl.value, category_name: filters.category || filters.cat || "" };
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
    } catch (e) { setStatus("Couldn't load preferences: " + e.message, false); }
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
          api("/preferences/" + encodeURIComponent(name), { method: "PUT", body: JSON.stringify({ data }) })
            .catch((e) => { throw new Error(`${name}: ${e.message}`); })
        ));
        setStatus("Saved " + Object.keys(updates).length + " preference" + (Object.keys(updates).length===1?"":"s"), true);
      } catch (e) { setStatus("Save failed: " + e.message, false); }
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
      if (roleEl && a.role) roleEl.innerHTML = `· role <span>${esc(a.role)}</span>`;
    } catch (e) {
      if (uidEl)   uidEl.textContent   = "—";
      if (emailEl) emailEl.textContent = "(API unreachable)";
    }
    if (saveBtn) saveBtn.onclick = () => {
      localStorage.setItem("pala_pat", tokEl.value.trim());
      localStorage.setItem("pala_url", urlEl.value.trim().replace(/\/$/, ""));
      if (statusEl) { statusEl.textContent = "Saved ✓"; statusEl.style.color = "var(--pala-mint)"; }
      setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 2000);
    };
  }

  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    if (page === "reports")     pageReports();
    else if (page === "search") pageSearch();
    else if (page === "preferences") pagePreferences();
    else if (page === "profile")     pageProfile();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
