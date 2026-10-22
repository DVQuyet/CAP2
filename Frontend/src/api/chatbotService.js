import { apiRequest } from "../services/api";

const BASE_URL = "/api/chatbot";

export function askChatbot(payload) {
  return apiRequest(`${BASE_URL}/ask`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function askVoiceChatbot(payload) {
  return apiRequest(`${BASE_URL}/voice`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getChatbotHistory(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`${BASE_URL}/history${suffix}`);
}

export function getChatbotSuggestions(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`${BASE_URL}/suggestions${suffix}`);
}

export function getRelationshipById(personId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`${BASE_URL}/relationship/${encodeURIComponent(personId)}${suffix}`);
}

export function getRelationshipPath(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  return apiRequest(`${BASE_URL}/path?${query.toString()}`);
}

export function getMeContext() {
  return apiRequest("/api/me/context");
}

export function getMeContextPeople(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/me/context/people${suffix}`);
}

// Đánh giá câu trả lời của trợ lý: rating 1 (hữu ích) hoặc -1 (chưa đúng), comment tùy chọn.
export function sendChatbotFeedback(messageId, rating, comment) {
  const body = { rating };
  if (comment) body.comment = comment;
  return apiRequest(`${BASE_URL}/messages/${encodeURIComponent(messageId)}/feedback`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function setCurrentPerson(payload) {
  return apiRequest("/api/me/context/person", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
