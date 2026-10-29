// Ghép nội dung trang chủ do admin quản lý (từ API) với nội dung i18n mặc định.
// Quy tắc: API trả null/lỗi => dùng mặc định; chữ trống trong DB => dùng mặc định; danh sách chỉ lấy từ DB khi items_custom.
// Hàm thuần, không phụ thuộc React để kiểm thử được.

export const LANDING_KEYS = ["hero", "about", "features", "stats", "news", "guide"];
export const HOME_KEYS = ["hero", "about", "features", "stats"];
const DEFAULT_STEP = 10;

export function sectionOf(content, key) {
  return content && content.sections && content.sections[key] ? content.sections[key] : null;
}

// Chỉ ẩn khi admin đã tắt hiển thị; chưa có dữ liệu thì luôn hiện.
export function isSectionVisible(content, key) {
  const section = sectionOf(content, key);
  return !section || section.visible !== false;
}

// Thứ tự hiển thị: mục đã có dòng dùng sort_order của admin, mục chưa có dùng thứ tự mặc định (10, 20, ...).
export function orderSections(content, keys) {
  const weight = (key) => {
    const section = sectionOf(content, key);
    if (section && Number.isFinite(Number(section.sort_order))) return Number(section.sort_order);
    return (LANDING_KEYS.indexOf(key) + 1) * DEFAULT_STEP;
  };
  return keys
    .map((key, index) => ({ key, index, weight: weight(key) }))
    .sort((a, b) => a.weight - b.weight || a.index - b.index)
    .map((entry) => entry.key);
}

export function pickText(dbValue, fallback) {
  return typeof dbValue === "string" && dbValue.trim() !== "" ? dbValue : fallback;
}

// Gộp chữ cấp mục: trường nào DB trống thì lấy mặc định.
export function mergeSectionText(section, defaults = {}) {
  return {
    tag: pickText(section?.tag, defaults.tag ?? ""),
    title: pickText(section?.title, defaults.title ?? ""),
    body: pickText(section?.body, defaults.body ?? ""),
    quote: pickText(section?.quote, defaults.quote ?? ""),
    image_url: pickText(section?.image_url, defaults.image_url ?? ""),
  };
}

// Danh sách: DB chỉ thay thế khi admin đã tùy chỉnh (items_custom), kể cả danh sách rỗng.
export function mergeItems(section, defaultItems = []) {
  if (section && section.items_custom && Array.isArray(section.items)) return section.items;
  return defaultItems;
}

// "A\n\nB" -> ["A", "B"] (mỗi dòng không rỗng là một đoạn).
export function paragraphsOf(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function linesOf(text) {
  return String(text || "").split("\n");
}

// Phòng thủ phía giao diện (server đã chặn): chỉ http(s) hoặc đường dẫn nội bộ "/...".
export function isSafeLink(url) {
  return typeof url === "string" && /^(https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']*)$/i.test(url.trim());
}

export function isExternalLink(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

export const DEFAULT_ABOUT_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDjOO8FqGtyciLc_RM3yjBdnFgPaDBtd8F1gqaozi4SwM4G2w-QvhSnWwixZcPdS8NKiAhWZOFwrqY47U0lPpby__qL1W4NzdvNVDQUR_XEdqRLMh8M_97Qbps5y-9DTcqikY3n4NXF4aSkatMZloTl9-ATAlMQsdYCkdjdcxBcWNtshvYvrb5Ix4qbApN9y1mKbD93z1Y1E2CynGl0qJ1mlAOIvUExbF4rh_jb2abE4zBAAqIHi2km4lGf3RSKC_vSkTW7AA310wYh";
export const DEFAULT_FEATURES_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAd6zBRvZR3R4FNjtUr2lLEx9nhgeCvjODU75n1JNSZXsYbZbBF_gkjblSR6pitSFdONbGyENkDH6yqIi4uS-Ykb6p6ILCjP0nXnqvGTlFy9hTWmvVSDjpMIx7HWlHJsTVzyp8Eupx2Tm3Xyjng359b4cGX8X6_EDIt4xaLllWGrajQxWqaRni5VzHCLHVKEAERaVpCv2KL8n9_4GnV-fPjGCzGNfAwYlnkE_xJidn-Rg1rLL1S3goPoSirM6dhlbwjipscoiT16iOH";

export const DEFAULT_FEATURE_ICONS = [
  ["auto", "bolt"],
  ["events", "notifications_active"],
  ["security", "security"],
];
export const DEFAULT_STATS = [
  ["clans", "1,200+"],
  ["members", "500k+"],
  ["documents", "250k+"],
  ["provinces", "63"],
];
export const DEFAULT_NEWS = [
  ["f0", "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=900&q=80"],
  ["f1", "https://images.unsplash.com/photo-1505798577917-a65157d3320a?auto=format&fit=crop&w=900&q=80"],
  ["f2", "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=900&q=80"],
  ["f3", "https://images.unsplash.com/photo-1525920980995-f8a1b3cbbf0f?auto=format&fit=crop&w=900&q=80"],
];
export const DEFAULT_GUIDE_STEPS = [
  ["step1", "group_add"],
  ["step2", "person_add"],
  ["step3", "schema"],
  ["step4", "cloud_upload"],
  ["step5", "mail_outline"],
  ["step6", "calendar_today"],
];

const blankItem = { title: "", body: "", meta: "", link_label: "", link_url: "", image_url: "", icon: "" };

// Nội dung mặc định (i18n) của từng mục theo một ngôn ngữ, cùng dạng với dữ liệu API công khai.
// t(key) trả chuỗi theo ngôn ngữ đang xét.
export function buildDefaultSection(key, t) {
  switch (key) {
    case "hero":
      return {
        title: String(t("public.hero.title")).replace(/<br\s*\/?>/gi, "\n"),
        body: t("public.hero.subtitle"),
        items: [
          { ...blankItem, link_label: t("public.hero.explore") },
          { ...blankItem, link_label: t("public.hero.createClan"), link_url: "/clan-register" },
        ],
      };
    case "about":
      return {
        tag: t("public.about.tag"),
        title: t("public.about.title"),
        body: `${t("public.about.p1")}\n\n${t("public.about.p2")}`,
        quote: t("public.about.quote"),
        image_url: DEFAULT_ABOUT_IMAGE,
        items: null,
      };
    case "features":
      return {
        tag: t("public.features.advanced.tag"),
        title: t("public.features.advanced.title"),
        image_url: DEFAULT_FEATURES_IMAGE,
        items: DEFAULT_FEATURE_ICONS.map(([id, icon]) => ({
          ...blankItem,
          title: t(`public.features.advanced.items.${id}.title`),
          body: t(`public.features.advanced.items.${id}.desc`),
          icon,
        })),
      };
    case "stats":
      return {
        items: DEFAULT_STATS.map(([id, value]) => ({ ...blankItem, title: t(`public.stats.${id}`), meta: value })),
      };
    case "news":
      return {
        items: DEFAULT_NEWS.map(([id, image]) => ({
          ...blankItem,
          title: t(`public.news.items.${id}.title`),
          body: t(`public.news.items.${id}.desc`),
          meta: t(`public.news.items.${id}.date`),
          image_url: image,
        })),
      };
    case "guide":
      return {
        items: DEFAULT_GUIDE_STEPS.map(([id, icon]) => ({
          ...blankItem,
          title: t(`public.guide.steps.${id}.title`),
          body: t(`public.guide.steps.${id}.desc`),
          icon,
        })),
      };
    default:
      return {};
  }
}

// Dựng body cho POST /api/admin/landing/seed từ nội dung mặc định vi + en.
// tVi/tEn: (key) => chuỗi. keys: các mục cần lấy (mặc định tất cả).
export function buildSeedPayload(tVi, tEn, keys = LANDING_KEYS) {
  const sections = keys.map((key) => {
    const vi = buildDefaultSection(key, tVi);
    const en = buildDefaultSection(key, tEn);
    const section = { section_key: key };
    for (const field of ["tag", "title", "body", "quote"]) {
      if (vi[field] !== undefined) {
        section[`${field}_vi`] = vi[field] || "";
        section[`${field}_en`] = en[field] || "";
      }
    }
    if (vi.image_url) section.image_url = vi.image_url;
    if (Array.isArray(vi.items)) {
      section.items = vi.items.map((item, index) => {
        const other = (en.items && en.items[index]) || {};
        const out = {};
        for (const field of ["title", "body", "meta", "link_label"]) {
          out[`${field}_vi`] = item[field] || "";
          out[`${field}_en`] = other[field] || "";
        }
        if (item.icon) out.icon = item.icon;
        if (item.image_url) out.image_url = item.image_url;
        if (item.link_url) out.link_url = item.link_url;
        return out;
      });
    }
    return section;
  });
  return { sections };
}

// Tra chuỗi trong một bản dịch JSON lồng nhau theo khóa dạng "public.hero.title"; thiếu thì trả "".
export function makeTranslator(resources) {
  return (key) => {
    let current = resources;
    for (const part of String(key).split(".")) {
      if (current == null || typeof current !== "object") return "";
      current = current[part];
    }
    return typeof current === "string" ? current : "";
  };
}

export function itemKey(item, index) {
  return item && item.id != null ? `db-${item.id}` : `d-${index}`;
}
