// Cấu hình trang quản lý nội dung trang chủ: trường của từng mục, giới hạn độ dài, bản nháp và kiểm tra phía client.
// kind: text | area (xuống dòng được) | image | link (http(s) hoặc "/...") | https (chỉ https) | video | icon | select.
import { isSafeLink, isHttpsLink, buildVideoEmbed, SOCIAL_ICONS, CONTACT_ICONS } from "../../public/landing/landingContent";

const text = (name, extra) => ({ name, kind: "text", ...extra });
const area = (name, rows, extra) => ({ name, kind: "area", rows, ...extra });
const image = { name: "image_url", kind: "image" };
const link = { name: "link_url", kind: "link" };
const icon = { name: "icon", kind: "icon" };

// Trường chữ cấp mục cho từng mục.
export const SECTION_FIELDS = {
  hero: [area("title", 3), area("body", 3), image],
  about: [text("tag"), text("title"), area("body", 7), area("quote", 2), image],
  features: [text("tag"), text("title"), image],
  stats: [],
  news: [],
  guide: [],
  demo: [text("title"), area("body", 3), area("quote", 3, { labelKey: "demoPoints", hintKey: "demoPoints" })],
  benefits: [text("title"), area("body", 3)],
  benefits_why: [text("title")],
  news_latest: [text("title")],
  news_categories: [text("title")],
  news_subscribe: [
    text("tag", { labelKey: "placeholder" }),
    text("title"),
    area("body", 3),
    text("quote", { labelKey: "buttonLabel" }),
  ],
  guide_videos: [text("title")],
  faq: [text("title")],
  footer: [text("title"), text("quote", { labelKey: "tagline" }), area("body", 3)],
  footer_contact: [],
  footer_links: [],
  footer_social: [],
};

// Trường của mục con. Mục không có khóa ở đây thì không có danh sách.
export const ITEM_FIELDS = {
  hero: [text("link_label"), link],
  features: [icon, text("title"), area("body", 3)],
  stats: [text("meta", { labelKey: "metaStats" }), text("title", { labelKey: "statLabel" })],
  news: [
    text("meta", { labelKey: "metaNews" }),
    text("title"),
    area("body", 4),
    image,
    { ...link, hintKey: "newsLink" },
    text("link_label"),
    area("content", 14, { labelKey: "content", hintKey: "content" }),
  ],
  guide: [icon, text("title"), area("body", 3)],
  demo: [icon, text("link_label"), link],
  benefits: [icon, text("title"), area("body", 3)],
  benefits_why: [icon, text("title"), area("body", 3)],
  news_latest: [text("title"), image, link],
  news_categories: [text("title"), text("meta", { labelKey: "articleCount" }), link],
  guide_videos: [
    text("title"),
    area("body", 3),
    { name: "link_url", kind: "video", labelKey: "videoUrl", hintKey: "videoUrl" },
  ],
  faq: [text("title", { labelKey: "question" }), area("body", 4, { labelKey: "answer" })],
  footer_contact: [
    { name: "icon", kind: "select", options: CONTACT_ICONS, labelKey: "contactIcon", hintKey: "contactIcon" },
    text("title", { labelKey: "contactValue" }),
  ],
  footer_links: [
    text("title", { labelKey: "linkLabel" }),
    link,
    text("meta", { labelKey: "columnName", hintKey: "columnName" }),
  ],
  footer_social: [
    { name: "icon", kind: "select", options: SOCIAL_ICONS, labelKey: "socialIcon" },
    text("title", { labelKey: "networkName" }),
    { name: "link_url", kind: "https", hintKey: "httpsLink" },
  ],
};

// Giới hạn độ dài khớp schema backend.
export const MAX = { tag: 255, title: 500, body: 3000, quote: 1000, meta: 255, link_label: 255, content: 20000 };
export const SECTION_BODY_MAX = 5000;

export const maxLengthOf = (field, isSection) =>
  field.name === "body" && isSection ? SECTION_BODY_MAX : MAX[field.name];

export const emptyItem = (sectionKey) => {
  const draft = { is_visible: true, icon: "", image_url: "", link_url: "" };
  const fields = sectionKey === "news" ? ["title", "body", "meta", "link_label", "content"] : ["title", "body", "meta", "link_label"];
  for (const field of fields) {
    draft[`${field}_vi`] = "";
    draft[`${field}_en`] = "";
  }
  return draft;
};

export const itemDraftOf = (item, sectionKey) => ({ ...emptyItem(sectionKey), ...item });

export const sectionDraftOf = (section) => {
  const draft = { image_url: section?.image_url || "" };
  for (const field of ["tag", "title", "body", "quote"]) {
    draft[`${field}_vi`] = section?.[`${field}_vi`] || "";
    draft[`${field}_en`] = section?.[`${field}_en`] || "";
  }
  return draft;
};

// Kiểm tra một trường link/video; trả mã lỗi (khóa i18n dưới admin.landing.errors) hoặc null.
export function fieldError(field, value) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return null;
  if (field.kind === "link" || field.kind === "image") return isSafeLink(v) ? null : "link";
  if (field.kind === "https") return isHttpsLink(v) ? null : "https";
  if (field.kind === "video") return buildVideoEmbed(v) ? null : "video";
  return null;
}

// Mã lỗi đầu tiên của một danh sách trường (hoặc null).
export function firstFieldError(fields, draft) {
  for (const field of fields) {
    const code = fieldError(field, draft[field.name]);
    if (code) return code;
  }
  return null;
}

export function itemSummary(item, key) {
  const title = item.title_vi || item.title_en || item.link_label_vi || item.link_label_en || "";
  const meta = item.meta_vi || item.meta_en || "";
  if (key === "stats") return [meta, title].filter(Boolean).join(" — ");
  return title || meta;
}
