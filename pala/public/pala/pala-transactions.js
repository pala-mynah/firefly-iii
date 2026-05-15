/* pala-transactions.js — Transactions list + transaction detail. */
(function () {
  const { api, esc, fmt, dat, qs, slug, $k, setTbody, setTitle,
          loadingRow, errorRow, emptyRow, periodRange, wirePeriodChrome, fbase } = window.Pala;

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

  async function liveTxSidebar(rangeType) {
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
        const sumTxt = (sum >= 0 ? "+" : "−") + "€" + Math.abs(Math.round(sum)).toLocaleString("de-AT");
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

  async function pageTransactions() {
    const filter = qs("filter"), type = qs("type"), cat = qs("cat"), catId = qs("cat_id"), budget = qs("budget"), budgetId = qs("budget_id"), account = qs("account");
    const TYPE_MAP = { expense: "withdrawal", expenses: "withdrawal", income: "deposit", transfers: "transfer", all: "all" };
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
        const info = document.querySelector('[data-k="tx-pageinfo"]');
        if (info) info.textContent = `${lo + 1}–${hi} of ${rows.length}`;
        const nav = document.querySelector('[data-k="tx-pagination"] ul');
        if (nav) {
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
              const scrollBox = document.querySelector(".tx-scroll");
              if (scrollBox) scrollBox.scrollTop = 0;
            });
          });
        }
      };
      renderPage(1);

      try {
        const svg = document.querySelector('.tx-histo-svg');
        const info = document.querySelector('[data-k="tx-histo-info"]');
        if (svg && rows.length) {
          const counts = {};
          for (const t of rows) {
            const d = (t.attributes.transactions[0].date || "").slice(0, 10);
            if (!d) continue;
            counts[d] = (counts[d] || 0) + 1;
          }
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
            return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(1, h).toFixed(2)}" fill="${fill}" rx="1"><title>${d.date} · ${d.n} transaction${d.n === 1 ? "" : "s"}</title></rect>`;
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
          if (info) info.textContent = `${N} day${N === 1 ? "" : "s"} · peak ${maxN}/day`;
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
        ? `${dat(rangeStart)} → ${dat(rangeEnd)}`
        : periodRange().startDate.toLocaleDateString("en", { month: "long", year: "numeric" });
      if (titleEl) titleEl.textContent = `${TYPE_TITLES[rangeType] || "Transactions"}: ${titleRangeLabel}`;
      setK("tx-count", String(count));
      const netCls = net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-muted";
      const netTxt = net === 0 ? "—" : (net > 0 ? "+" : "−") + "€" + Math.abs(net).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      setK("tx-net", netTxt, netCls);
      setK("tx-range", `${dat(rangeStart)} → ${dat(rangeEnd)}`);
      liveTxSidebar(rangeType).catch((e) => console.warn("tx sidebar:", e));
    } catch (e) { setTbody(errorRow(5, e)); }
  }

  async function pageTransactionShow() {
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

      const baseUrl = fbase();
      const editBtn = $k("tx-edit-btn");
      if (editBtn) editBtn.setAttribute("href", `${baseUrl}/transactions/edit/${id}`);

      const cloneViaApi = async () => {
        const transactions = splits.map((s) => {
          const t = {
            type: s.type,
            date: (s.date || "").slice(0, 10),
            amount: String(s.amount),
            description: s.description || (res.data.attributes.group_title || "Clone"),
            source_id: s.source_id || undefined,
            source_name: s.source_id ? undefined : s.source_name,
            destination_id: s.destination_id || undefined,
            destination_name: s.destination_id ? undefined : s.destination_name,
            category_id: s.category_id || undefined,
            budget_id: s.budget_id || undefined,
            bill_id: s.bill_id || undefined,
            piggy_bank_id: s.piggy_bank_id || undefined,
            tags: s.tags || [],
            notes: s.notes || undefined,
            currency_id: s.currency_id || undefined,
            foreign_amount: s.foreign_amount || undefined,
            foreign_currency_id: s.foreign_currency_id || undefined,
          };
          Object.keys(t).forEach((k) => t[k] === undefined && delete t[k]);
          return t;
        });
        const body = {
          group_title: splits.length > 1 ? (res.data.attributes.group_title || "Clone of " + (first.description || "transaction")) : null,
          transactions,
        };
        const created = await api(`/transactions`, { method: "POST", body: JSON.stringify(body) });
        return created.data && created.data.id;
      };

      const wireAct = (key, handler) => {
        const el = $k(key);
        if (!el) return;
        el.addEventListener("click", async (ev) => { ev.preventDefault(); try { await handler(); } catch (e) { console.error(e); if (window.palaToast) palaToast.danger("Action failed", { msg: e.message }); } });
      };

      wireAct("tx-act-clone", async () => {
        const newId = await cloneViaApi();
        if (!newId) throw new Error("Server did not return new transaction id");
        if (window.palaToast) palaToast.success("Transaction cloned", {
          msg: "Created as #" + newId,
          actions: [{ label: "Open clone", onClick: () => { location.href = `transaction-show.html?tx=${newId}${periodQS ? "&" + periodQS.slice(1) : ""}`; } }],
        });
      });

      wireAct("tx-act-clone-edit", async () => {
        const newId = await cloneViaApi();
        if (!newId) throw new Error("Server did not return new transaction id");
        location.href = `${baseUrl}/transactions/edit/${newId}`;
      });

      const wireConvert = (key, target) => wireAct(key, async () => {
        if (type === target) {
          if (window.palaToast) palaToast.info("Already a " + target);
          return;
        }
        const counterLabel = target === "deposit" ? "Source (revenue) account name" : target === "transfer" ? "Destination (asset) account name" : "Destination (expense) account name";
        const placeholderEx = target === "deposit" ? "Salary, Refund, …" : target === "transfer" ? "Savings, Cash, …" : "Billa, Spar, …";
        const newName = await palaPrompt({
          title: "Convert to " + target,
          message: "Firefly needs to know which account on the other side. Enter a name (existing or new).",
          placeholder: placeholderEx,
          confirmLabel: "Convert",
        });
        if (newName == null || !newName.trim()) return;
        const body = (target === "deposit")
          ? { source_name: newName.trim() }
          : { destination_name: newName.trim() };
        await api(`/transactions/${id}/convert/${target}`, { method: "POST", body: JSON.stringify(body) });
        if (window.palaToast) palaToast.success("Converted to " + target, { msg: "Reloading…" });
        setTimeout(() => location.reload(), 600);
      });
      wireConvert("tx-act-convert-deposit",    "deposit");
      wireConvert("tx-act-convert-transfer",   "transfer");
      wireConvert("tx-act-convert-withdrawal", "withdrawal");

      wireAct("tx-act-link",      () => { location.href = `${baseUrl}/transactions/show/${id}#linked-transactions`; });
      wireAct("tx-act-rule",      () => { location.href = `${baseUrl}/rules/create-from-journal/${id}`; });
      wireAct("tx-act-recurring", () => { location.href = `${baseUrl}/recurring/create-from-journal/${id}`; });

      wireAct("tx-act-delete", async () => {
        const ok = await palaConfirm({
          title: "Delete transaction?",
          message: `"${desc}" will be permanently removed. This cannot be undone.`,
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        await api(`/transactions/${id}`, { method: "DELETE" });
        if (window.palaToast) palaToast.danger("Transaction deleted", { msg: desc, timeout: 1800 });
        setTimeout(() => { location.href = `transactions.html${periodQS}`; }, 600);
      });

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
        const lk = await api(`/transactions/${id}/transaction-links`);
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
      const setText2 = (k, v) => { const el = $k(k); if (el) el.textContent = v; };
      setText2("tx-desc", "Failed to load: " + e.message);
    }
  }

  /* ─── New transaction form ────────────────────────────────────────────── */
  // The form body is generated from a template string so it can be mounted
  // EITHER on a standalone page (transaction-new.html) OR inside a palaModal
  // triggered from any "+" button.
  const NEW_TX_FORM_HTML = `
    <div style="padding:0 0 .25rem;">
      <div class="tx-type-pills" data-k="tx-type-pills">
        <button type="button" data-type="withdrawal" class="active withdrawal"><i class="fa-solid fa-arrow-left"></i>Withdrawal</button>
        <button type="button" data-type="deposit"><i class="fa-solid fa-arrow-right"></i>Deposit</button>
        <button type="button" data-type="transfer"><i class="fa-solid fa-arrows-rotate"></i>Transfer</button>
      </div>
    </div>
    <form id="tx-form" autocomplete="off">
      <input type="hidden" data-field="type" value="withdrawal">
      <div data-k="splits"></div>
      <div style="padding:0 0 .25rem;">
        <button type="button" class="add-split-btn" data-k="add-split">
          <i class="fa-solid fa-plus"></i> Add split
        </button>
      </div>
    </form>
    <template id="split-template-inline">
      <div class="split-block" data-k="split-row">
        <div class="split-header">
          <span class="split-num">Split <span data-k="split-num">1</span></span>
          <button type="button" class="btn btn-sm btn-outline-danger ms-auto" data-k="remove-split" hidden>
            <i class="fa-solid fa-xmark fa-fw"></i> Remove
          </button>
        </div>
        <div class="form-grid">
          <div class="form-row full">
            <label class="form-label">Description</label>
            <input class="form-control" data-field="description" placeholder="What was this for?">
          </div>
          <div class="form-row">
            <label class="form-label" data-k="source-label">Source account</label>
            <div data-k="source-picker"></div>
          </div>
          <div class="form-row">
            <label class="form-label" data-k="destination-label">Destination account</label>
            <div data-k="destination-picker"></div>
          </div>
          <div class="form-row">
            <label class="form-label">Amount</label>
            <div class="input-group">
              <span class="input-group-text">€</span>
              <input class="form-control" type="number" step="0.01" data-field="amount" placeholder="0.00" required>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">Date</label>
            <input class="form-control" type="date" data-field="date" required>
          </div>
          <div class="form-row">
            <label class="form-label">Category</label>
            <div data-k="category-picker"></div>
          </div>
          <div class="form-row">
            <label class="form-label">Budget</label>
            <div data-k="budget-picker"></div>
          </div>
          <div class="form-row full">
            <label class="form-label">Tags</label>
            <div data-k="tag-picker"></div>
          </div>
          <div class="form-row full">
            <label class="form-label">Notes</label>
            <textarea class="form-control" rows="2" data-field="notes" placeholder="Optional notes (markdown allowed)"></textarea>
          </div>
        </div>
      </div>
    </template>
  `;

  // Wire a transaction-creation form mounted inside `root`. Returns
  //   { submit: async () => true | false }
  // so callers (modal or page) can drive submit from their own footer button.
  function initTransactionForm(root, opts = {}) {
    const form = root.querySelector("#tx-form");
    if (!form) { console.warn("initTransactionForm: no #tx-form"); return null; }
    const splitsHost = form.querySelector('[data-k="splits"]');
    const tmpl       = root.querySelector("#split-template, #split-template-inline");
    const typePills  = root.querySelector('[data-k="tx-type-pills"]');
    const typeHidden = form.querySelector('[data-field="type"]');
    const addBtn     = form.querySelector('[data-k="add-split"]');
    if (!splitsHost || !tmpl || !typePills) { console.warn("initTransactionForm: missing parts"); return null; }

    const splits = [];

    const labelsForType = (type) => {
      if (type === "deposit")   return { src: "Source (revenue)",  dst: "Destination (asset)",   srcType: "revenue", dstType: "asset" };
      if (type === "transfer")  return { src: "Source (asset)",    dst: "Destination (asset)",   srcType: "asset",   dstType: "asset" };
      return                          { src: "Source (asset)",    dst: "Destination (expense)", srcType: "asset",   dstType: "expense" };
    };

    function applyType(type) {
      typeHidden.value = type;
      typePills.querySelectorAll("button").forEach((b) => {
        const active = b.dataset.type === type;
        b.classList.toggle("active", active);
        b.classList.remove("withdrawal", "deposit", "transfer");
        if (active) b.classList.add(type);
      });
      const L = labelsForType(type);
      splits.forEach((s) => {
        s.rowEl.querySelector('[data-k="source-label"]').textContent      = L.src;
        s.rowEl.querySelector('[data-k="destination-label"]').textContent = L.dst;
        rebuildPickers(s, type);
      });
    }

    function rebuildPickers(split, type) {
      const L = labelsForType(type);
      const srcHost = split.rowEl.querySelector('[data-k="source-picker"]');
      const dstHost = split.rowEl.querySelector('[data-k="destination-picker"]');
      const oldSrc = split.source?.value();
      const oldDst = split.destination?.value();
      srcHost.innerHTML = ""; dstHost.innerHTML = "";
      split.source = palaAccountPicker(srcHost, {
        type: L.srcType,
        placeholder: L.src.replace(/\s*\([^)]*\)/, ""),
        initialId:   oldSrc?.id   || "",
        initialName: oldSrc?.name || "",
        allowNew: type !== "transfer" && L.srcType !== "asset",
      });
      split.destination = palaAccountPicker(dstHost, {
        type: L.dstType,
        placeholder: L.dst.replace(/\s*\([^)]*\)/, ""),
        initialId:   oldDst?.id   || "",
        initialName: oldDst?.name || "",
        allowNew: type !== "transfer" && L.dstType !== "asset",
      });
    }

    function addSplit() {
      const frag = tmpl.content.cloneNode(true);
      const rowEl = frag.querySelector('[data-k="split-row"]');
      splitsHost.appendChild(frag);
      const split = { rowEl };
      splits.push(split);
      rowEl.querySelector('[data-field="date"]').value = new Date().toISOString().slice(0, 10);
      split.category = palaCategoryPicker(rowEl.querySelector('[data-k="category-picker"]'), { placeholder: "Pick or create a category" });
      split.budget   = palaBudgetPicker(rowEl.querySelector('[data-k="budget-picker"]'),     { placeholder: "Pick a budget (optional)" });
      split.tags     = palaTagPicker(rowEl.querySelector('[data-k="tag-picker"]'),           { placeholder: "Add a tag and press Enter" });
      rebuildPickers(split, typeHidden.value || "withdrawal");
      renumberSplits();
    }

    function renumberSplits() {
      splits.forEach((s, i) => {
        s.rowEl.querySelector('[data-k="split-num"]').textContent = String(i + 1);
        const removeBtn = s.rowEl.querySelector('[data-k="remove-split"]');
        removeBtn.hidden = splits.length === 1;
        removeBtn.onclick = () => {
          const idx = splits.indexOf(s);
          if (idx < 0) return;
          splits.splice(idx, 1);
          s.rowEl.remove();
          renumberSplits();
        };
      });
    }

    typePills.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-type]");
      if (!btn) return;
      applyType(btn.dataset.type);
    });
    addBtn.addEventListener("click", addSplit);

    addSplit();
    applyType(opts.initialType || "withdrawal");

    async function submit() {
      form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
      form.querySelectorAll("[data-error-for]").forEach((el) => el.remove());
      const type = typeHidden.value || "withdrawal";
      const groupTitle = splits.length > 1
        ? splits.map((s) => s.rowEl.querySelector('[data-field="description"]').value).filter(Boolean).join(" / ")
        : null;
      const transactions = splits.map((s) => {
        const f = palaReadForm(s.rowEl);
        const src = s.source.value();
        const dst = s.destination.value();
        const tx = {
          type, date: f.date,
          description: f.description || "(no description)",
          amount: String(f.amount ?? ""),
          tags: s.tags.value() || [],
        };
        if (src.id) tx.source_id = src.id; else if (src.name) tx.source_name = src.name;
        if (dst.id) tx.destination_id = dst.id; else if (dst.name) tx.destination_name = dst.name;
        const cat = s.category.value();
        if (cat.id) tx.category_id = cat.id; else if (cat.name) tx.category_name = cat.name;
        const bud = s.budget.value();
        if (bud.id) tx.budget_id = bud.id;
        if (f.notes) tx.notes = f.notes;
        return tx;
      });
      try {
        const r = await api(`/transactions`, {
          method: "POST",
          body: JSON.stringify({ group_title: groupTitle, transactions, apply_rules: true }),
        });
        const newId = r.data?.id;
        const label = groupTitle || splits[0].rowEl.querySelector('[data-field="description"]').value;
        if (window.palaToast) palaToast.success("Transaction saved", {
          msg: label,
          actions: newId ? [{ label: "Open", onClick: () => { location.href = `transaction-show.html?tx=${newId}`; } }] : [],
        });
        return { ok: true, id: newId, label };
      } catch (err) {
        let body = null;
        try {
          const txt = err.message || "";
          const idx = txt.indexOf("{");
          if (idx >= 0) body = JSON.parse(txt.slice(idx));
        } catch {}
        if (body?.errors) {
          const flattened = {};
          for (const [k, v] of Object.entries(body.errors)) {
            const m = k.match(/^transactions\.(\d+)\.(.+)$/);
            if (m) flattened[m[2]] = v;
            else flattened[k] = v;
          }
          if (splits[0]) palaShowFormErrors(splits[0].rowEl, { errors: flattened });
        }
        if (window.palaToast) palaToast.danger("Save failed", { msg: body?.message || err.message });
        return { ok: false, err: body?.message || err.message };
      }
    }

    return { submit, form };
  }

  // Page mode — used by the standalone transaction-new.html. The page's own
  // <form> + footer buttons are wired here; we still call initTransactionForm
  // for the actual field/picker setup.
  function pageTransactionNew() {
    const form = document.getElementById("tx-form");
    if (!form) return;
    // Page version has its template id="split-template" — keep working.
    const ctrl = initTransactionForm(document, { initialType: "withdrawal" });
    if (!ctrl) return;
    const submitBtn = form.querySelector('[data-k="submit-btn"]');
    const statusEl  = form.querySelector('[data-k="form-status"]');
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      submitBtn.disabled = true; statusEl.textContent = "Saving\u2026";
      const r = await ctrl.submit();
      if (r.ok) {
        statusEl.textContent = "";
        setTimeout(() => { location.href = r.id ? `transaction-show.html?tx=${r.id}` : "transactions.html"; }, 700);
      } else {
        submitBtn.disabled = false;
        statusEl.textContent = "Save failed.";
      }
    });
  }

  // Modal mode — drop the form into a palaModal triggered by any "+" button.
  // Exposed as window.palaNewTransaction so any page can call it.
  function openNewTransactionModal(opts = {}) {
    if (!window.palaModal) { console.warn("palaModal not loaded"); return; }
    const m = palaModal({
      title: "New transaction",
      wide: true,
      body: NEW_TX_FORM_HTML,
      footer: `
        <button class="btn btn-outline-secondary" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save"><i class="fa-solid fa-check"></i> Save</button>`,
    });
    const ctrl = initTransactionForm(m.bodyEl, { initialType: opts.initialType || "withdrawal" });
    if (!ctrl) { m.close(); return; }
    const cancel = m.footEl.querySelector('[data-act="cancel"]');
    const save   = m.footEl.querySelector('[data-act="save"]');
    cancel.addEventListener("click", () => m.close());
    save.addEventListener("click", async () => {
      save.disabled = true; save.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving\u2026';
      const r = await ctrl.submit();
      if (r.ok) {
        m.close();
        if (opts.onSaved) try { opts.onSaved(r); } catch {}
        // Refresh the current page if it's the transactions list / dashboard.
        const page = document.body.dataset.page;
        if (page === "transactions" || page === "dashboard") setTimeout(() => location.reload(), 400);
      } else {
        save.disabled = false; save.innerHTML = '<i class="fa-solid fa-check"></i> Save';
      }
    });
  }
  window.palaNewTransaction = openNewTransactionModal;



  function boot() {
    setTimeout(() => { try { wirePeriodChrome(); } catch (e) { console.warn("period chrome:", e); } }, 0);
    const page = document.body.dataset.page;
    if (page === "transactions")     pageTransactions();
    else if (page === "transaction-show") pageTransactionShow();
    else if (page === "transaction-new")  pageTransactionNew();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
