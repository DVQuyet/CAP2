import { apiRequest } from "../services/api";

export const generateEventFormAI = async (payload) => {
  return apiRequest("/api/ai/event-form/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const extractGenealogyAI = async (payload) => {
  return apiRequest("/api/ai/genealogy/extract", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

// Soạn BẢN NHÁP tiểu sử / lời tưởng niệm cho một người trên cây. Không ghi gì vào hồ sơ: người dùng tự bấm Lưu.
export const generateBiographyDraftAPI = async (personId, options = {}) => {
  return apiRequest(`/api/ai/person/${encodeURIComponent(personId)}/biography-draft`, {
    method: "POST",
    body: JSON.stringify(options),
  });
};

export default {
  generateEventFormAI,
  extractGenealogyAI,
  generateBiographyDraftAPI,
};
