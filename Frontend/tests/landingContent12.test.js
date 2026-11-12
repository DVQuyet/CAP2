import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LANDING_KEYS,
  buildDefaultSection,
  buildSeedPayload,
  buildVideoEmbed,
  contactHref,
  findNewsItem,
  groupFooterLinks,
  isHttpsLink,
  makeTranslator,
  newsItemHref,
  socialIconName,
  visibleSocialLinks,
} from "../src/features/public/landing/landingContent.js";

// Cho phép chạy test với bản sao locale đã gộp (kiểm chứng) qua biến môi trường LOCALES_DIR.
const localeUrl = (lang) =>
  process.env.LOCALES_DIR
    ? new URL(`file:///${process.env.LOCALES_DIR.replace(/\\/g, "/").replace(/\/?$/, "/")}${lang}.json`)
    : new URL(`../src/i18n/locales/${lang}.json`, import.meta.url);
const load = (lang) => JSON.parse(readFileSync(localeUrl(lang), "utf8"));
const locales = { vi: load("vi"), en: load("en") };

const NEW_KEYS = ["demo", "benefits", "benefits_why", "news_latest", "news_categories", "news_subscribe", "guide_videos", "faq", "footer", "footer_contact", "footer_links", "footer_social"];

// ---- isHttpsLink ----
test("isHttpsLink chỉ nhận https", () => {
  assert.equal(isHttpsLink("https://a.com/x"), true);
  assert.equal(isHttpsLink("  https://a.com  "), true);
  assert.equal(isHttpsLink("http://a.com"), false);
  assert.equal(isHttpsLink("/noi-bo"), false);
  assert.equal(isHttpsLink("javascript:alert(1)"), false);
  assert.equal(isHttpsLink("https://a.com/ x"), false);
  assert.equal(isHttpsLink(null), false);
  assert.equal(isHttpsLink(undefined), false);
  assert.equal(isHttpsLink(5), false);
});

// ---- buildVideoEmbed ----
const YT = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

test("buildVideoEmbed chấp nhận các dạng link YouTube và luôn dựng src nocookie", () => {
  const ok = [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ/",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "  https://youtu.be/dQw4w9WgXcQ  ",
    "HTTPS://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ",
  ];
  for (const input of ok) {
    assert.deepEqual(buildVideoEmbed(input), { kind: "iframe", provider: "youtube", src: YT }, input);
  }
});

test("buildVideoEmbed từ chối link không an toàn hoặc sai", () => {
  const bad = [
    "http://youtu.be/dQw4w9WgXcQ",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "https://evilyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be.evil.com/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQtoolong",
    "https://www.youtube.com/watch?v=dQw4w9WgXc\"onload=1",
    "https://www.youtube.com/watch",
    "https://youtu.be/short",
    "https://www.youtube.com/embed/short",
    "https://www.youtube.com/shorts/abc",
    "https://www.youtube.com/channel/dQw4w9WgXcQ",
    "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://user@youtu.be/dQw4w9WgXcQ",
    "https://vimeo.com/123",
    "https://vimeo.com/1234",
    "https://vimeo.com/abcdef",
    "https://evil.com/video",
    "https://evil.com/video.mp4.html",
    "ftp://a.com/v.mp4",
    "not a url",
    "",
    "   ",
  ];
  for (const input of bad) assert.equal(buildVideoEmbed(input), null, input);
  for (const input of [null, undefined, 5, {}, []]) assert.equal(buildVideoEmbed(input), null);
});

test("buildVideoEmbed: Vimeo và mp4", () => {
  const vimeo = { kind: "iframe", provider: "vimeo", src: "https://player.vimeo.com/video/123456789" };
  assert.deepEqual(buildVideoEmbed("https://vimeo.com/123456789"), vimeo);
  assert.deepEqual(buildVideoEmbed("https://www.vimeo.com/123456789/"), vimeo);
  assert.deepEqual(buildVideoEmbed("https://player.vimeo.com/video/123456789"), vimeo);
  assert.equal(buildVideoEmbed("https://vimeo.com/12345").src, "https://player.vimeo.com/video/12345");

  const mp4 = buildVideoEmbed("https://cdn.example.com/a/b.mp4");
  assert.deepEqual(mp4, { kind: "video", provider: "mp4", src: "https://cdn.example.com/a/b.mp4" });
  assert.equal(buildVideoEmbed("https://cdn.example.com/a/B.MP4?x=1").kind, "video");
  assert.equal(buildVideoEmbed("https://cdn.example.com/a/b.webm"), null);
});

test("buildVideoEmbed: src iframe không bao giờ là link người nhập", () => {
  const input = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1&x=%22%3E";
  const out = buildVideoEmbed(input);
  assert.equal(out.src, YT);
  assert.ok(!out.src.includes("autoplay"));
});

// ---- findNewsItem ----
test("findNewsItem: chỉ trả khi mục hiện, items_custom và có id khớp", () => {
  const items = [{ id: 7, title: "A" }, { id: "9", title: "B" }, null, { title: "no id" }];
  const mk = (extra) => ({ sections: { news: { items_custom: true, items, ...extra } } });
  assert.deepEqual(findNewsItem(mk({}), 7), { id: 7, title: "A" });
  assert.deepEqual(findNewsItem(mk({}), "7"), { id: 7, title: "A" });
  assert.deepEqual(findNewsItem(mk({}), 9), { id: "9", title: "B" });
  assert.equal(findNewsItem(mk({}), 8), null);
  assert.equal(findNewsItem(mk({}), undefined), null);
  assert.equal(findNewsItem(mk({ visible: false }), 7), null);
  assert.equal(findNewsItem(mk({ items_custom: false }), 7), null);
  assert.equal(findNewsItem(mk({ items: null }), 7), null);
  assert.equal(findNewsItem(null, 7), null);
  assert.equal(findNewsItem({ sections: {} }, 7), null);
});

// ---- newsItemHref ----
test("newsItemHref: link an toàn ưu tiên, javascript bị bỏ, has_content -> trang bài", () => {
  assert.equal(newsItemHref(null), "");
  assert.equal(newsItemHref({}), "");
  assert.equal(newsItemHref({ id: 1, link_url: " https://a.com/x ", has_content: true }), "https://a.com/x");
  assert.equal(newsItemHref({ id: 1, link_url: "/tin-khac" }), "/tin-khac");
  assert.equal(newsItemHref({ id: 5, link_url: "javascript:alert(1)", has_content: true }), "/tin-tuc/5");
  assert.equal(newsItemHref({ id: 5, link_url: "javascript:alert(1)" }), "");
  assert.equal(newsItemHref({ id: 5, link_url: "//evil.com", has_content: false }), "");
  assert.equal(newsItemHref({ id: 5, has_content: true }), "/tin-tuc/5");
  assert.equal(newsItemHref({ id: "a/b c?d", has_content: true }), "/tin-tuc/a%2Fb%20c%3Fd");
  assert.equal(newsItemHref({ has_content: true }), "");
  assert.equal(newsItemHref({ id: 0, has_content: true }), "/tin-tuc/0");
});

// ---- groupFooterLinks ----
test("groupFooterLinks: gom theo cột, giữ thứ tự, bỏ link không an toàn", () => {
  const items = [
    { title: "A", link_url: "/a", meta: "Cột 1" },
    { title: "B", link_url: "javascript:alert(1)", meta: "Cột 1" },
    { title: "C", link_url: "https://c.com", meta: "" },
    { title: "D", link_url: "/d", meta: " Cột 1 " },
    { title: "", link_url: "/e", meta: "Cột 1" },
    { title: "F", link_url: "/f" },
    null,
    { title: "G", link_url: "/g", meta: "Cột 2" },
  ];
  const groups = groupFooterLinks(items);
  assert.deepEqual(
    groups.map((g) => [g.heading, g.links.map((l) => l.title)]),
    [["Cột 1", ["A", "D"]], ["", ["C", "F"]], ["Cột 2", ["G"]]],
  );
  assert.deepEqual(groupFooterLinks(null), []);
  assert.deepEqual(groupFooterLinks(undefined), []);
  assert.deepEqual(groupFooterLinks([{ title: "x", link_url: "data:text/html,x" }]), []);
});

// ---- contactHref ----
test("contactHref: mail/tel hợp lệ và không hợp lệ", () => {
  assert.equal(contactHref({ icon: "mail", title: "a@b.vn" }), "mailto:a@b.vn");
  assert.equal(contactHref({ icon: "mail", title: "  a@b.vn " }), "mailto:a@b.vn");
  assert.equal(contactHref({ icon: "mail", title: "khong-phai-mail" }), "");
  assert.equal(contactHref({ icon: "mail", title: "a b@c.vn" }), "");
  assert.equal(contactHref({ icon: "mail", title: "a@b" }), "");
  assert.equal(contactHref({ icon: "mail", title: "<a>@b.vn" }), "");
  assert.equal(contactHref({ icon: "mail", title: 'a"@b.vn' }), "");
  assert.equal(contactHref({ icon: "call", title: "0901 234 567" }), "tel:0901234567");
  assert.equal(contactHref({ icon: "call", title: "+84 (90) 123-4567" }), "tel:+84901234567");
  assert.equal(contactHref({ icon: "call", title: "12345" }), "");
  assert.equal(contactHref({ icon: "call", title: "1234567890123456" }), "");
  assert.equal(contactHref({ icon: "call", title: "abc" }), "");
  assert.equal(contactHref({ icon: "location_on", title: "1 Phố Huế" }), "");
  assert.equal(contactHref({ icon: "location_on", title: "a@b.vn" }), "");
  assert.equal(contactHref({ title: "a@b.vn" }), "");
  assert.equal(contactHref(null), "");
  assert.equal(contactHref({ icon: "mail" }), "");
});

// ---- social ----
test("socialIconName và visibleSocialLinks", () => {
  assert.equal(socialIconName("facebook"), "thumb_up");
  assert.equal(socialIconName("YouTube"), "smart_display");
  assert.equal(socialIconName("other"), "public");
  assert.equal(socialIconName("khong-co"), "public");
  assert.equal(socialIconName(null), "public");
  assert.equal(socialIconName(undefined), "public");

  const items = [
    { title: "FB", link_url: "https://fb.com/x" },
    { title: "HTTP", link_url: "http://fb.com/x" },
    { title: "JS", link_url: "javascript:alert(1)" },
    { title: "Nội bộ", link_url: "/x" },
    null,
    { title: "Không link" },
    { title: "YT", link_url: "https://youtube.com/x" },
  ];
  assert.deepEqual(visibleSocialLinks(items).map((i) => i.title), ["FB", "YT"]);
  assert.deepEqual(visibleSocialLinks(null), []);
  assert.deepEqual(visibleSocialLinks(undefined), []);
});

// ---- buildDefaultSection / seed cho 12 mục mới ----
test("LANDING_KEYS chứa 12 mục đợt 12", () => {
  for (const key of NEW_KEYS) assert.ok(LANDING_KEYS.includes(key), key);
});

// Bọc translator để thu mọi key đã dùng.
function recordingTranslator(resources) {
  const base = makeTranslator(resources);
  const used = [];
  const t = (key, options) => {
    used.push({ key, returnObjects: !!(options && options.returnObjects) });
    return base(key, options);
  };
  return { t, used };
}

for (const lang of ["vi", "en"]) {
  test(`i18n ${lang}: mọi key buildDefaultSection dùng cho tất cả LANDING_KEYS đều có chuỗi`, () => {
    const missing = [];
    for (const section of LANDING_KEYS) {
      const base = makeTranslator(locales[lang]);
      const { t, used } = recordingTranslator(locales[lang]);
      buildDefaultSection(section, t);
      for (const { key, returnObjects } of used) {
        const value = base(key, returnObjects ? { returnObjects: true } : undefined);
        const okValue = returnObjects ? Array.isArray(value) && value.length > 0 : typeof value === "string" && value.trim() !== "";
        if (!okValue) missing.push(`${section}: ${key}`);
      }
    }
    assert.deepEqual([...new Set(missing)], [], `Thiếu key ${lang}`);
  });
}

test("faq mặc định: mảng không rỗng, mỗi mục có câu hỏi và trả lời, cả vi và en", () => {
  for (const lang of ["vi", "en"]) {
    const section = buildDefaultSection("faq", makeTranslator(locales[lang]));
    assert.ok(section.items.length > 0, lang);
    for (const item of section.items) {
      assert.ok(item.title.trim() && item.body.trim(), `${lang} faq`);
    }
  }
});

test("buildDefaultSection: footer_contact/footer_social/mục lạ", () => {
  const t = makeTranslator(locales.vi);
  assert.deepEqual(buildDefaultSection("footer_social", t), { items: [] });
  const contact = buildDefaultSection("footer_contact", t);
  assert.equal(contact.items[0].icon, "mail");
  assert.notEqual(contactHref(contact.items[0]), "");
  assert.deepEqual(buildDefaultSection("khong-co", t), {});
  for (const link of buildDefaultSection("footer_links", t).items) {
    assert.ok(link.link_url.startsWith("/"));
  }
});

test("buildSeedPayload cho 12 mục mới: mỗi mục có chữ vi và en, không rỗng", () => {
  const payload = buildSeedPayload(makeTranslator(locales.vi), makeTranslator(locales.en), NEW_KEYS);
  assert.deepEqual(payload.sections.map((s) => s.section_key), NEW_KEYS);
  for (const section of payload.sections) {
    const k = section.section_key;
    for (const field of ["tag", "title", "body", "quote"]) {
      if (`${field}_vi` in section && k !== "footer") {
        if (k === "benefits_why" || k === "benefits") {
          // body có thể thiếu ở vài mục; chỉ kiểm khi vi có chữ
        }
        assert.equal(Boolean(section[`${field}_vi`]), Boolean(section[`${field}_en`]), `${k}.${field}`);
      }
    }
    for (const item of section.items || []) {
      for (const field of ["title", "body", "meta", "link_label"]) {
        assert.equal(Boolean(item[`${field}_vi`]), Boolean(item[`${field}_en`]), `${k} item ${field}`);
      }
    }
  }
  const by = Object.fromEntries(payload.sections.map((s) => [s.section_key, s]));
  assert.equal(by.demo.items.length, 2);
  assert.equal(by.benefits.items.length, 3);
  assert.equal(by.benefits_why.items.length, 4);
  assert.equal(by.news_latest.items.length, 3);
  assert.equal(by.news_categories.items.length, 4);
  assert.equal(by.news_categories.items[0].meta_vi, "28");
  assert.equal(by.guide_videos.items.length, 3);
  assert.ok(by.faq.items.length > 0);
  assert.deepEqual(by.footer_social.items, []);
  assert.equal(by.footer_links.items[0].link_url, "/privacy-policy");
  assert.ok(by.news_latest.items[0].image_url);
  assert.ok(by.footer.title_vi);
});
