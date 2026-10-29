import { apiRequest } from "../services/api";
import { getTreeEditKeyHeader } from "../services/treeEditSession";

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

// Chỉ trả bản nháp tiểu sử; server tự đọc dữ kiện theo personId, không lưu gì.
export const generatePersonBiographyAI = async (payload) => {
  return apiRequest("/api/ai/person-biography/generate", {
    method: "POST",
    headers: getTreeEditKeyHeader(),
    body: JSON.stringify(payload),
  });
};

export default {
  generateEventFormAI,
  extractGenealogyAI,
  generatePersonBiographyAI,
};
