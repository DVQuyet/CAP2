import { apiRequest } from "../services/api";

const BASE_URL = "/api/payments";

const request = async (endpoint, options = {}, fallbackError = "Yêu cầu thanh toán thất bại") => {
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

    throw normalizedError;
  }
};

export const createSepayPayment = (payload) => {
  return request(
    "/sepay/create",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Không thể tạo thanh toán SePay"
  );
};

export const getPaymentStatus = (orderCode) => {
  return request(
    `/status/${encodeURIComponent(orderCode)}`,
    {},
    "Không thể kiểm tra trạng thái thanh toán"
  );
};

export const cancelPendingPayment = (paymentId) => {
  return request(
    `/${paymentId}/cancel`,
    {
      method: "PATCH",
    },
    "Không thể hủy giao dịch chờ thanh toán"
  );
};