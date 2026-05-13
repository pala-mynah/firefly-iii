/* Pala UI helpers — toast, confirm, modal, prompt.
   Exposes globals: palaToast, palaConfirm, palaModal, palaPrompt.
   No dependencies (works without Bootstrap modal JS). */

(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);

  /* ─── Toast ───────────────────────────────────────────────────────── */
  function getToastWrap() {
    let w = document.querySelector(".pala-toast-wrap");
    if (!w) { w = document.createElement("div"); w.className = "pala-toast-wrap"; document.body.appendChild(w); }
    return w;
  }
  // palaToast(title, opts?)
  //   opts.msg       — secondary message text
  //   opts.kind      — success | danger | warning | info | "" (default)
  //   opts.icon      — FA icon class string. If omitted, inferred from kind.
  //   opts.actions   — array of { label, onClick }
  //   opts.timeout   — ms. 0 = sticky. Default 3500.
  function palaToast(title, opts = {}) {
    const kind = opts.kind || "";
    const iconCls = opts.icon || ({
      success: "fa-solid fa-circle-check",
      danger:  "fa-solid fa-circle-exclamation",
      warning: "fa-solid fa-triangle-exclamation",
      info:    "fa-solid fa-circle-info",
      "":      "fa-solid fa-circle-info",
    }[kind]);
    const wrap = getToastWrap();
    const el = document.createElement("div");
    el.className = "pala-toast" + (kind ? " " + kind : "");
    el.innerHTML = `
      <div class="pala-toast-icon"><i class="${iconCls}"></i></div>
      <div class="pala-toast-body">
        <div class="pala-toast-title">${esc(title)}</div>
        ${opts.msg ? `<div class="pala-toast-msg">${esc(opts.msg)}</div>` : ""}
        ${Array.isArray(opts.actions) && opts.actions.length ? `<div class="pala-toast-actions">${opts.actions.map((a,i)=>`<button class="btn btn-link" data-act="${i}">${esc(a.label)}</button>`).join("")}</div>` : ""}
      </div>
      <button class="pala-toast-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>`;
    wrap.appendChild(el);
    const dismiss = () => {
      if (el.classList.contains("leaving")) return;
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector(".pala-toast-close").addEventListener("click", dismiss);
    if (Array.isArray(opts.actions)) {
      el.querySelectorAll("[data-act]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const a = opts.actions[+btn.dataset.act];
          try { a && a.onClick && a.onClick(); } finally { dismiss(); }
        });
      });
    }
    const timeout = opts.timeout == null ? 3500 : opts.timeout;
    if (timeout > 0) setTimeout(dismiss, timeout);
    return { dismiss };
  }
  // Sugar
  palaToast.success = (t, o) => palaToast(t, { ...o, kind: "success" });
  palaToast.danger  = (t, o) => palaToast(t, { ...o, kind: "danger" });
  palaToast.warning = (t, o) => palaToast(t, { ...o, kind: "warning" });
  palaToast.info    = (t, o) => palaToast(t, { ...o, kind: "info" });

  /* ─── Modal ───────────────────────────────────────────────────────── */
  // palaModal({ title, body, footer, wide, onClose }) → { el, close }
  //   body / footer: HTML string OR element OR function (el)=> {...}
  function palaModal(opts) {
    const back = document.createElement("div");
    back.className = "pala-backdrop";
    back.innerHTML = `
      <div class="pala-modal${opts.wide ? " wide" : ""}">
        <div class="pala-modal-header">
          <h3 class="pala-modal-title">${esc(opts.title || "")}</h3>
          <button class="pala-modal-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="pala-modal-body"></div>
        ${opts.footer != null ? '<div class="pala-modal-footer"></div>' : ""}
      </div>`;
    document.body.appendChild(back);
    const root = back.querySelector(".pala-modal");
    const bodyEl = root.querySelector(".pala-modal-body");
    const footEl = root.querySelector(".pala-modal-footer");

    const fill = (host, val) => {
      if (val == null) return;
      if (typeof val === "string") host.innerHTML = val;
      else if (val instanceof Node) host.appendChild(val);
      else if (typeof val === "function") val(host);
    };
    fill(bodyEl, opts.body);
    if (footEl) fill(footEl, opts.footer);

    let closed = false;
    const close = (result) => {
      if (closed) return; closed = true;
      back.style.animation = "palaFade .12s ease-in reverse";
      root.style.animation = "palaPop .14s ease-in reverse";
      setTimeout(() => {
        back.remove();
        if (opts.onClose) try { opts.onClose(result); } catch {}
      }, 130);
    };
    root.querySelector(".pala-modal-close").addEventListener("click", () => close());
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);

    return { el: root, bodyEl, footEl, close };
  }

  /* ─── Confirm ─────────────────────────────────────────────────────── */
  // palaConfirm({ title, message, confirmLabel, cancelLabel, danger }) → Promise<bool>
  function palaConfirm(opts) {
    const { title = "Confirm", message = "Are you sure?", confirmLabel = "OK", cancelLabel = "Cancel", danger = false } = opts || {};
    return new Promise((resolve) => {
      const m = palaModal({
        title,
        body: `<p style="margin:0;color:var(--pala-text);font-size:.92rem;">${esc(message)}</p>`,
        footer: `
          <button class="btn btn-outline-secondary" data-act="cancel">${esc(cancelLabel)}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${esc(confirmLabel)}</button>`,
        onClose: (r) => resolve(r === "ok"),
      });
      m.footEl.querySelector('[data-act="cancel"]').addEventListener("click", () => m.close("cancel"));
      m.footEl.querySelector('[data-act="ok"]').addEventListener("click", () => m.close("ok"));
    });
  }

  /* ─── Prompt ──────────────────────────────────────────────────────── */
  // palaPrompt({ title, message, value, placeholder, confirmLabel }) → Promise<string|null>
  function palaPrompt(opts) {
    const { title = "Enter value", message = "", value = "", placeholder = "", confirmLabel = "OK" } = opts || {};
    return new Promise((resolve) => {
      const m = palaModal({
        title,
        body: `
          ${message ? `<p style="margin:0 0 .65rem;color:var(--pala-muted);font-size:.86rem;">${esc(message)}</p>` : ""}
          <input class="form-control" data-input value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus>`,
        footer: `
          <button class="btn btn-outline-secondary" data-act="cancel">Cancel</button>
          <button class="btn btn-primary" data-act="ok">${esc(confirmLabel)}</button>`,
        onClose: (r) => resolve(r == null ? null : r),
      });
      const inp = m.bodyEl.querySelector("[data-input]");
      setTimeout(() => inp.focus(), 50);
      const submit = () => m.close(inp.value);
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      m.footEl.querySelector('[data-act="cancel"]').addEventListener("click", () => m.close(null));
      m.footEl.querySelector('[data-act="ok"]').addEventListener("click", submit);
    });
  }

  window.palaToast   = palaToast;
  window.palaConfirm = palaConfirm;
  window.palaModal   = palaModal;
  window.palaPrompt  = palaPrompt;
})();
