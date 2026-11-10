import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HOME_KEYS,
  LANDING_KEYS,
  buildDefaultSection,
  buildSeedPayload,
  isSafeLink,
  isSectionVisible,
  makeTranslator,
  mergeItems,
  mergeSectionText,
  orderSections,
  paragraphsOf,
  sectionOf,
} from "../src/features/public/landing/landingContent.js";

const load = (lang) => JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), "utf8"));
const tVi = makeTranslator(load("vi"));
const tEn = makeTranslator(load("en"));

test("API trả null: mọi mục dùng mặc định, hiển thị và đúng thứ tự cũ", () => {
  assert.equal(sectionOf(null, "hero"), null);
  for (const key of LANDING_KEYS) assert.equal(isSectionVisible(null, key), true);
  assert.deepEqual(orderSections(null, HOME_KEYS), ["hero", "about", "features", "stats"]);
  assert.deepEqual(mergeItems(null, [1, 2]), [1, 2]);
  assert.equal(mergeSectionText(null, { title: "Mặc định" }).title, "Mặc định");
});

test("mergeSectionText: chữ trống trong DB lấy mặc định, chữ có nội dung thì ghi đè", () => {
  const merged = mergeSectionText({ title: "Tiêu đề mới", tag: "  ", body: "", image_url: "/a.png" }, { tag: "Nhãn cũ", title: "Cũ", body: "Nội dung cũ", quote: "Q" });
  assert.deepEqual(merged, { tag: "Nhãn cũ", title: "Tiêu đề mới", body: "Nội dung cũ", quote: "Q", image_url: "/a.png" });
});

test("mergeItems: chỉ thay danh sách khi items_custom, kể cả rỗng", () => {
  const defaults = [{ title: "mặc định" }];
  assert.deepEqual(mergeItems({ items_custom: false, items: [{ title: "x" }] }, defaults), defaults);
  assert.deepEqual(mergeItems({ items_custom: true, items: [{ title: "x" }] }, defaults), [{ title: "x" }]);
  assert.deepEqual(mergeItems({ items_custom: true, items: [] }, defaults), []);
});

test("isSectionVisible chỉ ẩn khi admin tắt; orderSections theo sort_order của admin", () => {
  const content = {
    sections: {
      hero: { visible: true, sort_order: 30 },
      stats: { visible: false, sort_order: 5 },
    },
  };
  assert.equal(isSectionVisible(content, "stats"), false);
  assert.equal(isSectionVisible(content, "about"), true);
  // stats(5) < about(20 mặc định) < features(30 mặc định, cùng hero 30 -> giữ thứ tự khai báo) ...
  assert.deepEqual(orderSections(content, HOME_KEYS), ["stats", "about", "hero", "features"]);
});

test("paragraphsOf tách theo dòng và bỏ dòng trống", () => {
  assert.deepEqual(paragraphsOf("A\n\n B \nC"), ["A", "B", "C"]);
  assert.deepEqual(paragraphsOf(""), []);
  assert.deepEqual(paragraphsOf(undefined), []);
});

test("isSafeLink chặn javascript:, data:, // và chỉ nhận http(s) hoặc /đường-dẫn", () => {
  for (const ok of ["/clan-register", "https://a.test/x", "http://a.test"]) assert.equal(isSafeLink(ok), true, ok);
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.com", "ftp://x", "", null, undefined]) assert.equal(isSafeLink(bad), false, String(bad));
});

test("makeTranslator tra khóa lồng nhau, thiếu khóa trả chuỗi rỗng", () => {
  assert.equal(tVi("public.stats.clans"), "Dòng họ tham gia");
  assert.equal(tEn("public.stats.clans"), "Clans joined");
  assert.equal(tVi("public.khong.ton.tai"), "");
});

test("buildDefaultSection: hero bỏ <br />, giữ 2 nút như giao diện hiện tại", () => {
  const hero = buildDefaultSection("hero", tVi);
  assert.equal(hero.title, "Gìn giữ cội nguồn,\nKết nối thế hệ");
  assert.equal(hero.items.length, 2);
  assert.equal(hero.items[1].link_url, "/clan-register");
});

test("buildSeedPayload: đủ vi/en cho cả 6 mục, mọi link/ảnh đều hợp lệ", () => {
  const { sections } = buildSeedPayload(tVi, tEn);
  assert.deepEqual(sections.map((s) => s.section_key), LANDING_KEYS);

  const stats = sections.find((s) => s.section_key === "stats");
  assert.equal(stats.items.length, 4);
  assert.deepEqual([stats.items[0].meta_vi, stats.items[0].title_vi, stats.items[0].title_en], ["1,200+", "Dòng họ tham gia", "Clans joined"]);

  const features = sections.find((s) => s.section_key === "features");
  assert.equal(features.items.length, 3);
  assert.equal(features.items[0].icon, "bolt");
  assert.notEqual(features.items[0].title_vi, features.items[0].title_en);

  const about = sections.find((s) => s.section_key === "about");
  assert.equal(about.items, undefined);
  assert.equal(paragraphsOf(about.body_vi).length, 2);
  assert.ok(about.quote_en);

  const news = sections.find((s) => s.section_key === "news");
  assert.equal(news.items.length, 4);
  const guide = sections.find((s) => s.section_key === "guide");
  assert.equal(guide.items.length, 6);

  for (const section of sections) {
    if (section.image_url) assert.equal(isSafeLink(section.image_url), true);
    for (const item of section.items || []) {
      if (item.image_url) assert.equal(isSafeLink(item.image_url), true);
      if (item.link_url) assert.equal(isSafeLink(item.link_url), true);
    }
  }
});

test("buildSeedPayload: chọn một số mục", () => {
  const { sections } = buildSeedPayload(tVi, tEn, ["stats"]);
  assert.equal(sections.length, 1);
});
