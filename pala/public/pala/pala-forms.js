/* Pala form helpers — autocomplete pickers, currency input, date input.
   Exposes: palaAutocomplete, palaAccountPicker, palaCategoryPicker,
            palaBudgetPicker, palaTagPicker, palaCurrencyPicker,
            palaInitForm.

   Each picker is a higher-level wrapper that knows which Firefly API to
   query and how to render results. They all use palaAutocomplete under the
   hood.

   Conventions:
   - Picker mounts on a wrapper element. The wrapper holds an <input> the
     user types into AND a hidden <input> for the chosen ID. Pickers return
     a controller with .clear(), .set(id, name), .value().
   - "Allow new" mode shows a "Create '<query>'" item at the bottom of
     results; clicking it returns { id: null, name: query, isNew: true }. */

(function () {
  const tok  = () => localStorage.getItem("pala_pat") || "";
  const base = () => (localStorage.getItem("pala_url") || location.origin).replace(/\/$/, "") + "/api/v1";
  const esc  = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);

  async function apiGet(path) {
    const r = await fetch(base() + path, {
      headers: { Authorization: "Bearer " + tok(), Accept: "application/json" },
    });
    if (!r.ok) throw new Error(path + ": " + r.status);
    return r.json();
  }

  /* ─── Core autocomplete ─────────────────────────────────────────────
     mount(wrapper, {
       placeholder, initialId, initialName,
       fetch:  async (query) => [{ id, name, sub? }],
       allowNew: bool,
       onChange: (sel | null) => void,
     }) → { value, set, clear, focus, destroy }
  ─────────────────────────────────────────────────────────────────── */
  function palaAutocomplete(wrapper, opts) {
    wrapper.classList.add("pala-ac");
    wrapper.innerHTML = `
      <input class="form-control" autocomplete="off" placeholder="${esc(opts.placeholder || "")}" value="${esc(opts.initialName || "")}">
      <input type="hidden" data-id value="${esc(opts.initialId || "")}">
      <div class="pala-ac-results empty"></div>`;
    const inp = wrapper.querySelector("input.form-control");
    const hid = wrapper.querySelector("[data-id]");
    const res = wrapper.querySelector(".pala-ac-results");

    let items = [];
    let activeIdx = -1;
    let token = 0;
    let lastQuery = "";

    const closeResults = () => { res.classList.add("empty"); activeIdx = -1; };
    const openResults  = () => { res.classList.remove("empty"); };

    const renderResults = (list, query) => {
      const html = list.map((it, i) => `
        <div class="pala-ac-item${i === activeIdx ? " active" : ""}" data-i="${i}">
          <span>${esc(it.name)}</span>
          ${it.sub ? `<span class="pala-ac-sub">${esc(it.sub)}</span>` : ""}
        </div>`).join("");
      const createRow = (opts.allowNew && query && !list.some((x) => x.name.toLowerCase() === query.toLowerCase()))
        ? `<div class="pala-ac-item pala-ac-create" data-i="-1"><i class="fa-solid fa-plus"></i> Create &ldquo;${esc(query)}&rdquo;</div>`
        : "";
      res.innerHTML = html + createRow;
      list.length || createRow ? openResults() : closeResults();
      res.querySelectorAll(".pala-ac-item").forEach((row) => {
        row.addEventListener("mousedown", (e) => { e.preventDefault(); pick(+row.dataset.i, query); });
      });
    };

    const pick = (i, query) => {
      let sel;
      if (i === -1) sel = { id: null, name: query, isNew: true };
      else          sel = items[i];
      if (!sel) return;
      inp.value = sel.name;
      hid.value = sel.id || "";
      closeResults();
      if (opts.onChange) try { opts.onChange(sel); } catch {}
    };

    const runFetch = async (q) => {
      const my = ++token;
      try {
        const list = await opts.fetch(q);
        if (my !== token) return; // superseded
        items = list || [];
        activeIdx = -1;
        renderResults(items, q);
      } catch (e) {
        if (my !== token) return;
        items = []; res.innerHTML = `<div class="pala-ac-item text-muted"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message)}</div>`;
        openResults();
      }
    };

    inp.addEventListener("input", () => {
      const q = inp.value.trim();
      hid.value = ""; // clears prior selection until they pick
      lastQuery = q;
      if (opts.onChange) try { opts.onChange(null); } catch {}
      if (!q) { items = []; closeResults(); return; }
      runFetch(q);
    });
    inp.addEventListener("focus", () => {
      if (items.length || (opts.allowNew && lastQuery)) openResults();
      else if (inp.value.trim()) runFetch(inp.value.trim());
    });
    inp.addEventListener("blur", () => setTimeout(closeResults, 120));
    inp.addEventListener("keydown", (e) => {
      const rows = res.querySelectorAll(".pala-ac-item");
      if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(rows.length - 1, activeIdx + 1); rows.forEach((r,i)=>r.classList.toggle("active", i===activeIdx)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); rows.forEach((r,i)=>r.classList.toggle("active", i===activeIdx)); }
      else if (e.key === "Enter") {
        if (activeIdx >= 0 && rows[activeIdx]) { e.preventDefault(); pick(+rows[activeIdx].dataset.i, lastQuery); }
        else if (opts.allowNew && lastQuery) { e.preventDefault(); pick(-1, lastQuery); }
      } else if (e.key === "Escape") { closeResults(); }
    });

    return {
      value: () => ({ id: hid.value || null, name: inp.value.trim() }),
      set:   (id, name) => { hid.value = id || ""; inp.value = name || ""; },
      clear: () => { hid.value = ""; inp.value = ""; items = []; closeResults(); },
      focus: () => inp.focus(),
      destroy: () => { wrapper.innerHTML = ""; },
    };
  }

  /* ─── Account picker ────────────────────────────────────────────────
     opts.type: 'asset' | 'expense' | 'revenue' | 'liabilities' | undefined
     opts.allowNew: when source/destination is free-text, Firefly creates
                   the expense/revenue account on submit; UI just keeps the
                   typed name and returns { id:null, name }.
  ─────────────────────────────────────────────────────────────────── */
  function palaAccountPicker(wrapper, opts = {}) {
    const typeQ = opts.type ? `&type=${encodeURIComponent(opts.type)}` : "";
    return palaAutocomplete(wrapper, {
      placeholder: opts.placeholder || "Type an account name",
      initialId:   opts.initialId,
      initialName: opts.initialName,
      allowNew:    opts.allowNew !== false,
      onChange:    opts.onChange,
      fetch: async (q) => {
        const data = await apiGet(`/autocomplete/accounts?query=${encodeURIComponent(q)}${typeQ}&limit=15`);
        // /autocomplete/accounts returns array of { id, name, name_with_balance?, type, currency_code }
        return (Array.isArray(data) ? data : []).map((a) => ({
          id: String(a.id), name: a.name, sub: a.type || "",
        }));
      },
    });
  }

  /* ─── Category picker ───────────────────────────────────────────── */
  function palaCategoryPicker(wrapper, opts = {}) {
    return palaAutocomplete(wrapper, {
      placeholder: opts.placeholder || "Type a category",
      initialId:   opts.initialId,
      initialName: opts.initialName,
      allowNew:    opts.allowNew !== false,
      onChange:    opts.onChange,
      fetch: async (q) => {
        const data = await apiGet(`/autocomplete/categories?query=${encodeURIComponent(q)}&limit=15`);
        return (Array.isArray(data) ? data : []).map((a) => ({ id: String(a.id), name: a.name }));
      },
    });
  }

  /* ─── Budget picker ─────────────────────────────────────────────── */
  function palaBudgetPicker(wrapper, opts = {}) {
    return palaAutocomplete(wrapper, {
      placeholder: opts.placeholder || "Type a budget",
      initialId:   opts.initialId,
      initialName: opts.initialName,
      allowNew:    false, // Firefly does NOT auto-create budgets from tx
      onChange:    opts.onChange,
      fetch: async (q) => {
        const data = await apiGet(`/autocomplete/budgets?query=${encodeURIComponent(q)}&limit=15`);
        return (Array.isArray(data) ? data : []).map((a) => ({ id: String(a.id), name: a.name }));
      },
    });
  }

  /* ─── Tag picker (multi) ────────────────────────────────────────── */
  // Renders a chip area + an autocomplete input below it.
  // .value() → array of names (Firefly accepts tag names, not IDs)
  function palaTagPicker(wrapper, opts = {}) {
    wrapper.classList.add("pala-ac");
    wrapper.style.position = "relative";
    wrapper.innerHTML = `
      <div data-chips class="d-flex flex-wrap gap-1 mb-1"></div>
      <div data-ac></div>`;
    const chipsEl = wrapper.querySelector("[data-chips]");
    const acEl = wrapper.querySelector("[data-ac]");
    let chosen = Array.isArray(opts.initial) ? opts.initial.slice() : [];

    const renderChips = () => {
      chipsEl.innerHTML = chosen.map((t, i) => `
        <span class="tag-pill" style="display:inline-flex;align-items:center;gap:.3rem;">
          ${esc(t)}
          <button type="button" class="btn-close btn-close-white" style="font-size:.55rem;filter:invert(1);opacity:.7;" data-rm="${i}" aria-label="Remove"></button>
        </span>`).join("");
      chipsEl.querySelectorAll("[data-rm]").forEach((b) => {
        b.addEventListener("click", () => { chosen.splice(+b.dataset.rm, 1); renderChips(); opts.onChange && opts.onChange(chosen.slice()); });
      });
    };
    renderChips();

    const ac = palaAutocomplete(acEl, {
      placeholder: opts.placeholder || "Add a tag",
      allowNew: true,
      fetch: async (q) => {
        const data = await apiGet(`/autocomplete/tags?query=${encodeURIComponent(q)}&limit=15`);
        return (Array.isArray(data) ? data : []).map((a) => ({ id: String(a.id), name: a.name }));
      },
      onChange: (sel) => {
        if (!sel) return;
        if (!chosen.includes(sel.name)) chosen.push(sel.name);
        ac.clear();
        renderChips();
        if (opts.onChange) opts.onChange(chosen.slice());
      },
    });

    return {
      value: () => chosen.slice(),
      set:   (arr) => { chosen = arr.slice(); renderChips(); },
      clear: () => { chosen = []; renderChips(); ac.clear(); },
      focus: () => ac.focus(),
    };
  }

  /* ─── Currency picker ───────────────────────────────────────────── */
  // Returns a <select> populated from /currencies. Mounts on a wrapper.
  // .value() → { code, id, symbol }
  async function palaCurrencyPicker(wrapper, opts = {}) {
    wrapper.innerHTML = `<select class="form-select"><option>Loading currencies…</option></select>`;
    const sel = wrapper.querySelector("select");
    try {
      const data = await apiGet("/currencies?limit=200");
      const arr = (data.data || []).filter((c) => !c.attributes.disabled).sort((a,b) => a.attributes.code.localeCompare(b.attributes.code));
      sel.innerHTML = arr.map((c) => {
        const a = c.attributes;
        const isInit = opts.initialCode ? a.code === opts.initialCode : a.default;
        return `<option value="${c.id}" data-code="${esc(a.code)}" data-symbol="${esc(a.symbol)}" ${isInit ? "selected" : ""}>${esc(a.code)} — ${esc(a.name)}</option>`;
      }).join("");
    } catch (e) {
      sel.innerHTML = `<option value="">${esc("Failed: " + e.message)}</option>`;
    }
    return {
      value: () => {
        const o = sel.selectedOptions[0];
        return o ? { id: o.value, code: o.dataset.code, symbol: o.dataset.symbol } : null;
      },
      set: (code) => {
        for (const o of sel.options) if (o.dataset.code === code) { sel.value = o.value; return; }
      },
      el: sel,
    };
  }

  /* ─── Form scaffolding helpers ──────────────────────────────────── */
  // Read all [data-field] elements into an object.
  function palaReadForm(root) {
    const out = {};
    root.querySelectorAll("[data-field]").forEach((el) => {
      const key = el.dataset.field;
      if (el.type === "checkbox") out[key] = el.checked;
      else if (el.type === "number") out[key] = el.value === "" ? null : Number(el.value);
      else out[key] = el.value;
    });
    return out;
  }

  // Highlight errors returned by Firefly's POST/PUT validation.
  // err: { errors: { field: [msg,...] } } or { message: '...' }
  function palaShowFormErrors(root, err) {
    root.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    root.querySelectorAll("[data-error-for]").forEach((el) => el.remove());
    if (err && err.errors) {
      for (const [field, msgs] of Object.entries(err.errors)) {
        const el = root.querySelector(`[data-field="${CSS.escape(field)}"]`);
        if (el) {
          el.classList.add("is-invalid");
          const m = document.createElement("div");
          m.className = "text-danger small mt-1";
          m.dataset.errorFor = field;
          m.textContent = Array.isArray(msgs) ? msgs.join(" ") : String(msgs);
          el.parentNode.appendChild(m);
        }
      }
    }
  }

  window.palaAutocomplete   = palaAutocomplete;
  window.palaAccountPicker  = palaAccountPicker;
  window.palaCategoryPicker = palaCategoryPicker;
  window.palaBudgetPicker   = palaBudgetPicker;
  window.palaTagPicker      = palaTagPicker;
  window.palaCurrencyPicker = palaCurrencyPicker;
  window.palaReadForm       = palaReadForm;
  window.palaShowFormErrors = palaShowFormErrors;
})();
