import test from "node:test";
import assert from "node:assert/strict";

import { getFeedbackMessageId, getMessagePersonIds, nextFeedbackState } from "../src/features/ai-chat/utils/feedbackState.js";

test("nextFeedbackState chuyển đổi 👍/👎 và bỏ qua bấm lặp", () => {
  assert.deepEqual(nextFeedbackState(null, 1), { rating: 1, send: true });
  assert.deepEqual(nextFeedbackState(1, -1), { rating: -1, send: true });
  assert.deepEqual(nextFeedbackState(-1, -1), { rating: -1, send: false });
  assert.deepEqual(nextFeedbackState(null, 0), { rating: null, send: false });
});

test("getFeedbackMessageId chỉ cho tin trợ lý có id hợp lệ", () => {
  assert.equal(getFeedbackMessageId({ role: "assistant", id: "assistant-123-abc", metadata: { messageId: 42 } }), 42);
  assert.equal(getFeedbackMessageId({ role: "assistant", id: 17 }), 17);
  assert.equal(getFeedbackMessageId({ role: "assistant", id: "assistant-123-abc", metadata: { messageId: null } }), null);
  assert.equal(getFeedbackMessageId({ role: "assistant", id: 5, retryText: "x" }), null);
  assert.equal(getFeedbackMessageId({ role: "user", id: 5 }), null);
});

test("getMessagePersonIds lọc id hợp lệ", () => {
  assert.deepEqual(getMessagePersonIds({ metadata: { personIds: [3, "4", "x", 0] } }), [3, 4]);
  assert.deepEqual(getMessagePersonIds({ metadata: {} }), []);
});

import { getInitialFeedbackRating } from "../src/features/ai-chat/utils/feedbackState.js";

test("getInitialFeedbackRating lấy 1/-1 từ lịch sử, còn lại là null", () => {
  assert.equal(getInitialFeedbackRating({ feedbackRating: 1 }), 1);
  assert.equal(getInitialFeedbackRating({ feedbackRating: -1 }), -1);
  assert.equal(getInitialFeedbackRating({ feedbackRating: null }), null);
  assert.equal(getInitialFeedbackRating({ feedbackRating: 5 }), null);
  assert.equal(getInitialFeedbackRating({}), null);
});
