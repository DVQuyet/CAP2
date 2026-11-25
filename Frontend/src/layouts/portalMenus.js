// Menu của ba layout, nhóm theo việc người dùng làm (không theo cấu trúc mã).
// Chỉ là nhãn, biểu tượng và thứ tự: đường dẫn và quyền vẫn do app/routes.jsx quyết định.
// end: true = chỉ sáng khi đúng đường dẫn (mục Tổng quan có đường dẫn là tiền tố của các mục khác).

export const ADMIN_MENU = [
  { items: [{ icon: "dashboard", labelKey: "layout.nav.overview", path: "/dashboard", end: true }] },
  {
    labelKey: "layout.nav.groups.clans",
    items: [
      { icon: "account_tree", labelKey: "layout.nav.genealogy", path: "/dashboard/genealogy" },
      { icon: "assignment", labelKey: "layout.nav.events", path: "/dashboard/tasks" },
      { icon: "calendar_month", labelKey: "layout.nav.calendar", path: "/dashboard/calendar" },
    ],
  },
  {
    labelKey: "layout.nav.groups.users",
    items: [
      { icon: "group", labelKey: "layout.nav.accounts", path: "/dashboard/members" },
      { icon: "outgoing_mail", labelKey: "layout.nav.invitations", path: "/dashboard/invitations" },
      { icon: "workspace_premium", labelKey: "layout.nav.billing", path: "/dashboard/billing" },
    ],
  },
  {
    labelKey: "layout.nav.groups.website",
    items: [
      { icon: "article", labelKey: "layout.nav.posts", path: "/dashboard/posts" },
      { icon: "web", labelKey: "layout.nav.landing", path: "/dashboard/landing" },
    ],
  },
];

export const MANAGER_MENU = [
  { items: [{ icon: "dashboard", labelKey: "layout.nav.overview", path: "/manager/dashboard", end: true }] },
  {
    labelKey: "layout.nav.groups.family",
    items: [
      { icon: "account_tree", labelKey: "layout.nav.familyTree", path: "/manager/genealogy" },
      { icon: "assignment", labelKey: "layout.nav.events", path: "/manager/tasks" },
      { icon: "calendar_month", labelKey: "layout.nav.calendar", path: "/manager/calendar" },
    ],
  },
  {
    labelKey: "layout.nav.groups.people",
    items: [
      { icon: "group", labelKey: "layout.nav.accounts", path: "/manager/account" },
      { icon: "outgoing_mail", labelKey: "layout.nav.invitations", path: "/manager/invitations" },
      { icon: "pending_actions", labelKey: "layout.nav.pending", path: "/manager/pending" },
    ],
  },
  {
    labelKey: "layout.nav.groups.community",
    items: [
      { icon: "post_add", labelKey: "layout.nav.news", path: "/manager/posts" },
      { icon: "collections_bookmark", labelKey: "layout.nav.memories", path: "/manager/time-capsule" },
    ],
  },
  {
    labelKey: "layout.nav.groups.money",
    items: [
      { icon: "account_balance_wallet", labelKey: "layout.nav.fund", path: "/manager/fund" },
      { icon: "payments", labelKey: "layout.nav.billing", path: "/manager/billing" },
    ],
  },
];

export const MEMBER_MENU = [
  {
    labelKey: "layout.nav.groups.family",
    items: [
      { icon: "account_tree", labelKey: "layout.nav.familyTree", path: "/user/family-tree" },
      { icon: "assignment", labelKey: "layout.nav.events", path: "/user/tasks" },
      { icon: "calendar_month", labelKey: "layout.nav.calendar", path: "/user/calendar" },
    ],
  },
  {
    labelKey: "layout.nav.groups.community",
    items: [
      { icon: "history_edu", labelKey: "layout.nav.news", path: "/user/posts" },
      { icon: "collections_bookmark", labelKey: "layout.nav.memories", path: "/user/time-capsule" },
      { icon: "account_balance_wallet", labelKey: "layout.nav.fund", path: "/user/fund" },
    ],
  },
];
