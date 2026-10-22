import test from "node:test";
import assert from "node:assert/strict";
import { friendlyErrorKey, friendlyErrorMessage } from "../src/shared/utils/friendlyError.js";

const t = (key) => key;

test("network and 5xx errors never leak raw messages", () => {
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal(friendlyErrorMessage(new Error("Network Error"), t), "common.states.error.network");
    assert.equal(friendlyErrorMessage(Object.assign(new Error("Request failed with status code 500"), { status: 500 }), t), "common.states.error.server");
    assert.equal(friendlyErrorMessage(Object.assign(new Error("Request failed with status code 403"), { status: 403 }), t), "common.states.error.forbidden");
  } finally {
    console.error = origError;
  }
});

test("4xx business messages from the backend are kept", () => {
  const origError = console.error;
  console.error = () => {};
  try {
    const err = Object.assign(new Error("Tên không được để trống"), { status: 400 });
    assert.equal(friendlyErrorMessage(err, t), "Tên không được để trống");
    assert.equal(friendlyErrorMessage(Object.assign(new Error("Bạn không có quyền truy cập dòng họ này"), { status: 403 }), t), "Bạn không có quyền truy cập dòng họ này");
    assert.equal(friendlyErrorMessage(Object.assign(new Error("Không tìm thấy dòng họ"), { status: 404 }), t), "Không tìm thấy dòng họ");
    assert.equal(friendlyErrorKey(Object.assign(new Error("x"), { status: 404 })), "common.states.error.notFound");
  } finally {
    console.error = origError;
  }
});
