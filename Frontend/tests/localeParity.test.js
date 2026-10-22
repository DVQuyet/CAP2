import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (lang) =>
  JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), "utf8"));

function flatten(value, prefix = "", out = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else {
    out[prefix] = value;
  }
  return out;
}

const vi = flatten(load("vi"));
const en = flatten(load("en"));

test("vi and en locale files have the same key set", () => {
  const onlyVi = Object.keys(vi).filter((key) => !(key in en));
  const onlyEn = Object.keys(en).filter((key) => !(key in vi));
  assert.deepEqual({ onlyVi, onlyEn }, { onlyVi: [], onlyEn: [] });
});

test("vi and en use the same interpolation placeholders", () => {
  const placeholders = (value) =>
    [...new Set(String(JSON.stringify(value)).match(/\{\{\s*[\w.]+\s*\}\}/g) || [])].sort();
  const mismatched = Object.keys(vi)
    .filter((key) => key in en)
    .filter((key) => JSON.stringify(placeholders(vi[key])) !== JSON.stringify(placeholders(en[key])));
  assert.deepEqual(mismatched, []);
});
