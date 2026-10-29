// Trạng thái nút 👍/👎 (lạc quan): bấm đổi ngay, lỗi thì trả về giá trị cũ.

// Id tin nhắn dùng để gửi phản hồi: messageId (câu trả lời mới) hoặc id số (lịch sử); null nếu không đánh giá được.
export function getFeedbackMessageId(message) {
  if (!message || message.role === "user" || message.retryText) return null;
  const candidates = [message.metadata?.messageId, message.messageId, message.id];
  for (const value of candidates) {
    if (value !== null && value !== undefined && /^\d+$/.test(String(value))) return Number(value);
  }
  return null;
}

// Đánh giá ban đầu từ lịch sử (feedbackRating: 1, -1 hoặc null); giá trị khác coi như chưa đánh giá.
export function getInitialFeedbackRating(message) {
  const value = Number(message?.feedbackRating);
  return value === 1 || value === -1 ? value : null;
}

// Bấm lại đúng nút đang chọn thì không làm gì (backend chỉ nhận 1 hoặc -1).
export function nextFeedbackState(current, clicked) {
  if (clicked !== 1 && clicked !== -1) return { rating: current, send: false };
  if (current === clicked) return { rating: current, send: false };
  return { rating: clicked, send: true };
}

// Đường quan hệ (id người theo thứ tự) của câu trả lời quan hệ; [] nếu không có đường từ 2 người trở lên.
export function getMessagePathIds(message) {
  const raw = message?.pathNodes || message?.metadata?.pathNodes;
  if (!Array.isArray(raw)) return [];
  const ids = raw.map((item) => Number(item?.id ?? item)).filter((id) => Number.isInteger(id) && id > 0);
  return ids.length >= 2 ? ids : [];
}

// Id người được nhắc trong câu trả lời, người trọng tâm đứng đầu.
export function getMessagePersonIds(message) {
  const raw = message?.personIds || message?.metadata?.personIds;
  if (!Array.isArray(raw)) return [];
  return raw.map(Number).filter((id) => Number.isInteger(id) && id > 0);
}
