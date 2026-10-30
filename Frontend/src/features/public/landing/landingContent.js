// Ghép nội dung trang chủ do admin quản lý (từ API) với nội dung i18n mặc định.
// Quy tắc: API trả null/lỗi => dùng mặc định; chữ trống trong DB => dùng mặc định; danh sách chỉ lấy từ DB khi items_custom.
// Hàm thuần, không phụ thuộc React để kiểm thử được.

// Sáu mục đầu giữ nguyên thứ tự (dùng cho thứ tự mặc định trên trang chủ); các mục sau là phần còn lại của trang công khai.
export const LANDING_KEYS = [
  "hero", "about", "features", "stats", "news", "guide",
  "demo", "benefits", "benefits_why", "news_latest", "news_categories", "news_subscribe",
  "guide_videos", "faq", "footer", "footer_contact", "footer_links", "footer_social",
];
// Nhóm hiển thị ở trang admin (tab theo trang).
export const LANDING_GROUPS = [
  { id: "home", keys: ["hero", "about", "features", "demo", "stats"] },
  { id: "benefitsPage", keys: ["benefits", "benefits_why"] },
  { id: "newsPage", keys: ["news", "news_latest", "news_categories", "news_subscribe"] },
  { id: "guidePage", keys: ["guide", "guide_videos", "faq"] },
  { id: "footerGroup", keys: ["footer", "footer_contact", "footer_links", "footer_social"] },
];
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
export const DEFAULT_NEWS_LATEST = [
  ["l0", "https://images.unsplash.com/photo-1512684555490-d5f2ec538bd7?auto=format&fit=crop&w=220&q=80"],
  ["l1", "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=220&q=80"],
  ["l2", "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=220&q=80"],
];
export const DEFAULT_NEWS_CATEGORIES = [
  ["history", 28],
  ["rituals", 19],
  ["tech", 14],
  ["people", 8],
];
export const DEFAULT_BENEFIT_CARDS = [
  ["connection", "groups"],
  ["preservation", "menu_book"],
  ["education", "school"],
];
export const DEFAULT_BENEFIT_REASONS = [
  ["ai", "tips_and_updates"],
  ["security", "verified_user"],
  ["reminder", "diversity_3"],
  ["storage", "history_edu"],
];
export const DEFAULT_DEMO_BUTTONS = [
  ["viewImage", "image"],
  ["createGenerations", "account_tree"],
];
export const DEFAULT_VIDEOS = ["v1", "v2", "v3"];
// Email liên hệ hiện có trong chân trang (của chủ website, công khai).
export const DEFAULT_CONTACT_EMAIL = "dinhvietquyet984@gmail.com";
export const DEFAULT_FOOTER_LINKS = [
  ["privacy", "/privacy-policy"],
  ["terms", "/terms"],
  ["deleteData", "/delete-data"],
];
export const SOCIAL_ICONS = ["facebook", "youtube", "tiktok", "zalo", "instagram", "x", "linkedin", "telegram", "other"];
export const CONTACT_ICONS = ["location_on", "call", "mail"];

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
    case "demo":
      return {
        title: t("public.features.demo.title"),
        body: t("public.features.demo.desc"),
        quote: `${t("public.features.demo.point1")}\n${t("public.features.demo.point2")}`,
        items: DEFAULT_DEMO_BUTTONS.map(([id, icon]) => ({ ...blankItem, icon, link_label: t(`public.features.demo.${id}`) })),
      };
    case "benefits":
      return {
        title: t("public.benefits.title"),
        body: t("public.benefits.subtitle"),
        items: DEFAULT_BENEFIT_CARDS.map(([id, icon]) => ({
          ...blankItem,
          icon,
          title: t(`public.benefits.cards.${id}.title`),
          body: t(`public.benefits.cards.${id}.desc`),
        })),
      };
    case "benefits_why":
      return {
        title: t("public.benefits.why.title"),
        items: DEFAULT_BENEFIT_REASONS.map(([id, icon]) => ({
          ...blankItem,
          icon,
          title: t(`public.benefits.why.items.${id}.title`),
          body: t(`public.benefits.why.items.${id}.desc`),
        })),
      };
    case "news_latest":
      return {
        title: t("public.news.featured"),
        items: DEFAULT_NEWS_LATEST.map(([id, image]) => ({ ...blankItem, title: t(`public.news.items.${id}.title`), image_url: image })),
      };
    case "news_categories":
      return {
        title: t("public.news.categories"),
        items: DEFAULT_NEWS_CATEGORIES.map(([id, count]) => ({ ...blankItem, title: t(`public.news.categoryList.${id}`), meta: String(count) })),
      };
    case "news_subscribe":
      return {
        tag: t("public.news.subscribe.placeholder"),
        title: t("public.news.subscribe.title"),
        body: t("public.news.subscribe.desc"),
        quote: t("public.news.subscribe.submit"),
      };
    case "guide_videos":
      return {
        title: t("public.guide.videoTitle"),
        items: DEFAULT_VIDEOS.map((id) => ({ ...blankItem, title: t(`public.guide.videos.${id}.title`), body: t(`public.guide.videos.${id}.desc`) })),
      };
    case "faq": {
      const faqs = t("public.guide.faqs", { returnObjects: true });
      return {
        title: t("public.guide.faqTitle"),
        items: (Array.isArray(faqs) ? faqs : []).map((faq) => ({ ...blankItem, title: faq.q || "", body: faq.a || "" })),
      };
    }
    case "footer":
      return { title: t("layout.brand"), body: "", quote: t("layout.footer.tagline") };
    case "footer_contact":
      return { items: [{ ...blankItem, icon: "mail", title: DEFAULT_CONTACT_EMAIL }] };
    case "footer_links":
      return { items: DEFAULT_FOOTER_LINKS.map(([id, url]) => ({ ...blankItem, title: t(`layout.footer.${id}`), link_url: url })) };
    case "footer_social":
      return { items: [] };
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
  return (key, options) => {
    let current = resources;
    for (const part of String(key).split(".")) {
      if (current == null || typeof current !== "object") return options && options.returnObjects ? [] : "";
      current = current[part];
    }
    if (options && options.returnObjects) return current == null ? [] : current;
    return typeof current === "string" ? current : "";
  };
}

export function itemKey(item, index) {
  return item && item.id != null ? `db-${item.id}` : `d-${index}`;
}

// ---- Đợt 12: video, bài tin, chân trang ----

export function isHttpsLink(url) {
  return typeof url === "string" && /^https:\/\/[^\s<>"']+$/i.test(url.trim());
}

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"];
const VIMEO_HOSTS = ["vimeo.com", "www.vimeo.com", "player.vimeo.com"];
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// Dựng nguồn nhúng an toàn từ link video do admin nhập. Chỉ https; chỉ YouTube/Vimeo (iframe với địa chỉ ta tự dựng)
// hoặc tệp .mp4 (thẻ video). Không bao giờ dùng nguyên link người nhập làm src của iframe. Không hợp lệ -> null.
export function buildVideoEmbed(input) {
  if (typeof input !== "string") return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();

  let youtubeId = null;
  if (host === "youtu.be") {
    const m = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
    youtubeId = m ? m[1] : null;
  } else if (YOUTUBE_HOSTS.includes(host)) {
    if (url.pathname === "/watch") {
      youtubeId = url.searchParams.get("v");
    } else {
      const m = /^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
      youtubeId = m ? m[1] : null;
    }
  }
  if (youtubeId !== null || host === "youtu.be" || YOUTUBE_HOSTS.includes(host)) {
    return youtubeId && YOUTUBE_ID.test(youtubeId)
      ? { kind: "iframe", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${youtubeId}` }
      : null;
  }

  if (VIMEO_HOSTS.includes(host)) {
    const m = /^\/(?:video\/)?(\d{5,})\/?$/.exec(url.pathname);
    return m ? { kind: "iframe", provider: "vimeo", src: `https://player.vimeo.com/video/${m[1]}` } : null;
  }

  if (/\.mp4$/i.test(url.pathname)) return { kind: "video", provider: "mp4", src: url.toString() };
  return null;
}

// Mục tin tức đang hiển thị trong danh sách công khai theo id (null nếu mục ẩn/chưa tùy chỉnh/không có).
export function findNewsItem(content, id) {
  const section = sectionOf(content, "news");
  if (!section || section.visible === false || !section.items_custom || !Array.isArray(section.items)) return null;
  return section.items.find((item) => item && item.id != null && String(item.id) === String(id)) || null;
}

// Đích của nút "Đọc thêm": link do admin nhập (an toàn) ưu tiên; không có mà bài có nội dung chi tiết thì tới trang bài; còn lại rỗng.
export function newsItemHref(item) {
  if (!item) return "";
  if (isSafeLink(item.link_url)) return item.link_url.trim();
  if (item.has_content && item.id != null) return `/tin-tuc/${encodeURIComponent(item.id)}`;
  return "";
}

// Chân trang: gom link theo cột (meta = tên cột; trống = không tiêu đề), giữ thứ tự xuất hiện; bỏ mục thiếu tên/link không an toàn.
export function groupFooterLinks(items) {
  const groups = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !item.title || !isSafeLink(item.link_url)) continue;
    const heading = (item.meta || "").trim();
    let group = groups.find((g) => g.heading === heading);
    if (!group) {
      group = { heading, links: [] };
      groups.push(group);
    }
    group.links.push(item);
  }
  return groups;
}

// Liên hệ: mail -> mailto:, call -> tel:, địa chỉ không có link. Giá trị không hợp lệ -> "".
export function contactHref(item) {
  const value = String((item && item.title) || "").trim();
  if (item && item.icon === "mail" && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(value)) return `mailto:${value}`;
  if (item && item.icon === "call") {
    const digits = value.replace(/[^0-9+]/g, "");
    if (/^\+?[0-9]{6,15}$/.test(digits)) return `tel:${digits}`;
  }
  return "";
}

const SOCIAL_MATERIAL_ICON = {
  facebook: "thumb_up",
  youtube: "smart_display",
  tiktok: "music_note",
  zalo: "chat",
  instagram: "photo_camera",
  x: "alternate_email",
  linkedin: "work",
  telegram: "send",
};
export function socialIconName(icon) {
  return SOCIAL_MATERIAL_ICON[String(icon || "").toLowerCase()] || "public";
}

// Mạng xã hội hiển thị được: có tên (hoặc biểu tượng) và link https.
export function visibleSocialLinks(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item && isHttpsLink(item.link_url));
}
