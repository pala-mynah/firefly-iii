/* Pala shared chrome — sidebar + navbar.
   Replaces the inline 80-line NAV block in every page.

   Usage:
     <body data-page="<key>" data-sub="<subkey>" data-crumbs="A/B/Detail" data-title="Page · Pala">
     <script src="pala-shell.js"></script>

   data-page values match NAV keys below. data-sub matches sub-item keys.
   data-crumbs is a slash-delimited path; the last segment is shown active.
   The script runs immediately and inserts <aside> + <nav> into <body>.

   Pages can override the page→sidebar mapping by setting data-sidebar="<key>"
   (used by detail pages like transaction-show to highlight the parent list). */

(function () {
  const NAV = [
    { header: "Financial Control" },
    { key: "dashboard", icon: "fa-solid fa-gauge-high",  label: "Dashboard",     href: "index.html" },
    { key: "budgets",   icon: "fa-solid fa-chart-pie",   label: "Budgets",       href: "budgets.html" },
    { key: "bills",     icon: "fa-regular fa-calendar",  label: "Subscriptions", href: "bills.html" },
    { key: "piggy",     icon: "fa-solid fa-piggy-bank",  label: "Piggy Banks",   href: "piggy.html" },
    { header: "Accounting" },
    { key: "transactions", icon: "fa-solid fa-arrow-right-arrow-left", label: "Transactions", href: "transactions.html",
      sub: [
        { key: "expenses",  icon: "fa-solid fa-arrow-left text-danger",   label: "Expenses",  href: "transactions.html?type=expenses" },
        { key: "income",    icon: "fa-solid fa-arrow-right text-success", label: "Income",    href: "transactions.html?type=income" },
        { key: "transfers", icon: "fa-solid fa-arrows-rotate text-info",  label: "Transfers", href: "transactions.html?type=transfers" },
        { key: "all",       icon: "fa-solid fa-arrows-turn-to-dots",      label: "All",       href: "transactions.html?type=all" },
        { key: "new",       icon: "fa-solid fa-plus text-mint",           label: "New",       href: "transaction-new.html" },
      ] },
    { key: "automation", icon: "fa-solid fa-microchip", label: "Automation", expanded: true,
      sub: [
        { key: "rules",     icon: "fa-solid fa-shuffle", label: "Rules",     href: "rules.html" },
        { key: "recurring", icon: "fa-solid fa-repeat",  label: "Recurring", href: "recurring.html" },
      ] },
    { header: "Others" },
    { key: "accounts", icon: "fa-regular fa-credit-card", label: "Accounts", href: "accounts.html",
      sub: [
        { key: "asset",       icon: "fa-solid fa-money-bills",         label: "Asset",       href: "accounts.html?type=asset" },
        { key: "expense",     icon: "fa-solid fa-cart-shopping",       label: "Expense",     href: "accounts.html?type=expense" },
        { key: "revenue",     icon: "fa-solid fa-money-bill-trend-up", label: "Revenue",     href: "accounts.html?type=revenue" },
        { key: "liabilities", icon: "fa-solid fa-landmark",            label: "Liabilities", href: "accounts.html?type=liabilities" },
      ] },
    { key: "classification", icon: "fa-solid fa-tags", label: "Classification", expanded: true,
      sub: [
        { key: "categories", icon: "fa-regular fa-bookmark", label: "Categories", href: "categories.html" },
        { key: "tags",       icon: "fa-solid fa-tag",        label: "Tags",       href: "tags.html" },
      ] },
    { key: "reports", icon: "fa-solid fa-chart-column",     label: "Reports", href: "reports.html" },
    { key: "search",  icon: "fa-solid fa-magnifying-glass", label: "Search",  href: "search.html" },
    { divider: true },
    { key: "profile",     icon: "fa-solid fa-user-gear", label: "Profile",     href: "profile.html" },
    { key: "preferences", icon: "fa-solid fa-sliders",   label: "Preferences", href: "preferences.html" },
  ];

  // Map *-show pages and other secondary pages to which sidebar item should be lit.
  // Pages can override by setting body.dataset.sidebar.
  const SIDEBAR_OF = {
    "transaction-show": "transactions",
    "transaction-new":  "transactions",
    "transaction-edit": "transactions",
    "account-show":     "accounts",
    "account-new":      "accounts",
    "account-edit":     "accounts",
    "budget-show":      "budgets",
    "budget-new":       "budgets",
    "budget-edit":      "budgets",
    "category-show":    "classification",
    "category-new":     "classification",
    "category-edit":    "classification",
    "tag-show":         "classification",
    "tag-new":          "classification",
    "tag-edit":         "classification",
    "bill-show":        "bills",
    "bill-new":         "bills",
    "bill-edit":        "bills",
    "rule-show":        "automation",
    "rule-new":         "automation",
    "rule-edit":        "automation",
    "recurring-show":   "automation",
    "recurring-new":    "automation",
    "recurring-edit":   "automation",
    "piggy-show":       "piggy",
    "piggy-new":        "piggy",
    "piggy-edit":       "piggy",
  };
  const SUB_OF = {
    "transaction-new":  "new",
    "transaction-edit": "new",
    "categories":       "categories",
    "category-show":    "categories",
    "category-new":     "categories",
    "category-edit":    "categories",
    "tags":             "tags",
    "tag-show":         "tags",
    "tag-new":          "tags",
    "tag-edit":         "tags",
    "rules":            "rules",
    "rule-show":        "rules",
    "rule-new":         "rules",
    "rule-edit":        "rules",
    "recurring":        "recurring",
    "recurring-show":   "recurring",
    "recurring-new":    "recurring",
    "recurring-edit":   "recurring",
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);

  function renderSidebar(activePage, activeSub) {
    const parts = ['<div class="brand"><i class="fa-solid fa-fire-flame-curved me-2"></i>Firefly III</div>'];
    for (const item of NAV) {
      if (item.header)  { parts.push(`<div class="nav-header">${esc(item.header)}</div>`); continue; }
      if (item.divider) { parts.push('<hr class="pala-divider">'); continue; }
      const isActive = item.key === activePage;
      const cls = "nav-link" + (isActive ? " active" : "");
      const chev = item.sub ? '<i class="fa-solid fa-chevron-down ms-auto fa-xs"></i>' : "";
      parts.push(`<a href="${item.href || "#"}" class="${cls}"><i class="${item.icon}"></i> ${esc(item.label)}${chev}</a>`);
      if (item.sub) {
        const showSub = isActive || item.expanded;
        if (showSub) {
          parts.push('<div class="nav-sub">');
          for (const s of item.sub) {
            const sActive = (isActive && s.key === activeSub) ? " active" : "";
            parts.push(`<a href="${s.href}" class="nav-link${sActive}"><i class="${s.icon}"></i> ${esc(s.label)}</a>`);
          }
          parts.push('</div>');
        }
      }
    }
    return `<aside class="pala-sidebar">${parts.join("")}</aside>`;
  }

  function renderNavbar(crumbs) {
    const segs = (crumbs || "").split("/").filter(Boolean);
    const last = segs.pop();
    const ol = segs.map((s) => `<li class="breadcrumb-item"><a href="#">${esc(s)}</a></li>`).join("");
    const active = last ? `<li class="breadcrumb-item active">${esc(last)}</li>` : "";
    return `<nav class="pala-navbar"><ol class="breadcrumb">${ol}${active}<span class="period-badge"><i class="fa-regular fa-calendar fa-xs"></i><span>Loading…</span><i class="fa-solid fa-chevron-down fa-xs"></i></span></ol></nav>`;
  }

  function inject() {
    const b = document.body;
    if (b.dataset.title) document.title = b.dataset.title;
    const page    = b.dataset.page || "";
    const sidebar = b.dataset.sidebar || SIDEBAR_OF[page] || page;
    const sub     = b.dataset.sub || SUB_OF[page] || "";
    b.insertAdjacentHTML("afterbegin", renderSidebar(sidebar, sub));
    const main = document.querySelector("main.pala-main");
    if (main) main.insertAdjacentHTML("beforebegin", renderNavbar(b.dataset.crumbs || ""));
    else b.insertAdjacentHTML("afterbegin", renderNavbar(b.dataset.crumbs || ""));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
  else inject();
})();
