import test from "node:test";
import assert from "node:assert/strict";
import { appendMediaToken } from "../src/shared/utils/mediaToken.js";

const URL_NO_KEY = "https://api.example.test/api/media/42";

test("gắn token media vào URL media chưa có khóa", () => {
  assert.equal(appendMediaToken(URL_NO_KEY, "abc.def"), `${URL_NO_KEY}?token=abc.def`);
  assert.equal(appendMediaToken(`${URL_NO_KEY}?v=1`, "abc.def"), `${URL_NO_KEY}?v=1&token=abc.def`);
});

test("mã hóa ký tự đặc biệt của token", () => {
  assert.equal(appendMediaToken(URL_NO_KEY, "a b&c"), `${URL_NO_KEY}?token=a%20b%26c`);
});

test("không có token media thì giữ nguyên URL (không bao giờ tự lấy JWT đăng nhập)", () => {
  assert.equal(appendMediaToken(URL_NO_KEY, null), URL_NO_KEY);
  assert.equal(appendMediaToken(URL_NO_KEY, ""), URL_NO_KEY);
  assert.equal(appendMediaToken(URL_NO_KEY, undefined), URL_NO_KEY);
});

test("URL đã có khóa ?k= hoặc token thì giữ nguyên", () => {
  assert.equal(appendMediaToken(`${URL_NO_KEY}?k=abc`, "tok"), `${URL_NO_KEY}?k=abc`);
  assert.equal(appendMediaToken(`${URL_NO_KEY}?x=1&k=abc`, "tok"), `${URL_NO_KEY}?x=1&k=abc`);
  assert.equal(appendMediaToken(`${URL_NO_KEY}?token=old`, "tok"), `${URL_NO_KEY}?token=old`);
});

test("URL không phải media hoặc không phải chuỗi thì giữ nguyên", () => {
  assert.equal(appendMediaToken("https://cdn.example.test/a.png", "tok"), "https://cdn.example.test/a.png");
  assert.equal(appendMediaToken(null, "tok"), null);
  assert.equal(appendMediaToken(undefined, "tok"), undefined);
});

test("requirePath rỗng cho phép gắn vào URL tùy ý (ghi âm)", () => {
  assert.equal(
    appendMediaToken("https://api.example.test/api/voice/recordings/1/audio", "tok", { requirePath: "" }),
    "https://api.example.test/api/voice/recordings/1/audio?token=tok"
  );
});
