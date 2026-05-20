import { apiRequest } from "../services/api";

const BASE_URL = "/api/billing";

const request = async (endpoint, options = {}, fallbackError = "Yêu cầu billing thất bại") => {
  try {
    return await apiRequest(`${BASE_URL}${endpoint}`, options);
  } catch (error) {
    const normalizedError = new Error(error?.message || fallbackError);

    normalizedError.code =
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      null;

    normalizedError.data =
      error?.data ||
      error?.response?.data ||
      null;

    normalizedError.status =
      error?.status ||
      error?.response?.status ||
      null;

    normalizedError.billing =
      error?.billing ||
      error?.data?.billing ||
      error?.response?.data?.billing ||
      null;

    throw normalizedError;
  }
};

export const getBillingPlans = () => {
  return request("/plans", {}, "Không thể lấy danh sách gói");
};

export const getClanBilling = (clanId) => {
  return request(
    `/clans/${clanId}`,
    {},
    "Không thể lấy thông tin gói của dòng họ"
  );
};

export const getClanPayments = (clanId) => {
  return request(
    `/clans/${clanId}/payments`,
    {},
    "Không thể lấy lịch sử thanh toán"
  );
};

export const manualUpgradeClan = (clanId, payload) => {
  return request(
    `/admin/clans/${clanId}/manual-upgrade`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    "Không thể nâng cấp thử nghiệm"
  );
};

export const createBillingPlan = (payload) => {
  return request(
    `/admin/plans`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Không thể thêm gói sử dụng"
  );
};

export const updateBillingPlan = (planId, payload) => {
  return request(
    `/admin/plans/${planId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    "Không thể cập nhật gói sử dụng"
  );
};
