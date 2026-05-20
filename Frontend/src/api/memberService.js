import { buildApiUrl } from "../services/api";

const BASE_URL = "/api/member";

const getAuthHeaders = () => {
  const token = localStorage.getItem("auth_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseResponse = async (res, fallbackMessage) => {
  const text = await res.text();
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = {};
  }

  if (!res.ok) {
    const serverMessage = typeof result.message === "string" ? result.message : "";
    const hasBrokenEncoding = /Ã|Ä|Æ|áº|á»|â€|â€œ|â€|â€¦/.test(serverMessage);
    const error = new Error(!hasBrokenEncoding && serverMessage ? serverMessage : fallbackMessage);
    error.status = res.status;
    error.data = result;
    throw error;
  }

  return result;
};

const requestJson = async (path, options, fallbackMessage) => {
  try {
    const res = await fetch(buildApiUrl(`${BASE_URL}${path}`), options);
    return parseResponse(res, fallbackMessage);
  } catch (error) {
    if (error.status) throw error;
    throw new Error(error?.message || fallbackMessage);
  }
};

export const getMemberDashboard = async () =>
  requestJson(
    "/dashboard",
    {
      headers: getAuthHeaders(),
    },
    "Không thể tải dữ liệu thành viên",
  );

export const verifyTreeEditSession = async (key, options = {}) =>
  requestJson(
    "/tree-edit-session",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ key, activate: options.activate !== false }),
    },
    "Không thể xác thực temporary edit key",
  );

export const updateMemberProfile = async (payload) =>
  requestJson(
    "/profile",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Không thể cập nhật thông tin",
  );

export const changeMemberPassword = async (payload) =>
  requestJson(
    "/password",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Không thể đổi mật khẩu",
  );

export const getMemberChat = async () =>
  requestJson(
    "/chat",
    {
      headers: getAuthHeaders(),
    },
    "Không thể tải lịch sử chat",
  );

export const sendMemberChat = async (message) =>
  requestJson(
    "/chat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ message }),
    },
    "Không thể gửi tin nhắn",
  );

export const createMemberReminder = async (payload) =>
  requestJson(
    "/reminders",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Không thể tạo nhắc việc",
  );

export const getMemberTasks = async () =>
  requestJson(
    "/tasks",
    {
      headers: getAuthHeaders(),
    },
    "Không thể tải công việc được giao",
  );

export const getMemberEvents = async () =>
  requestJson(
    "/events",
    {
      headers: getAuthHeaders(),
    },
    "Không thể tải danh sách sự kiện",
  );

export const updateMemberTaskStatus = async (taskId, status) =>
  requestJson(
    `/tasks/${taskId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ status }),
    },
    "Không thể cập nhật trạng thái công việc",
  );

export const proposeProfileUpdate = async (payload) =>
  requestJson(
    "/content/profile",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Không thể gửi yêu cầu cập nhật hồ sơ",
  );

export const submitMaterial = async (payload) =>
  requestJson(
    "/content/post",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Không thể gửi tư liệu đóng góp",
  );

export const getGeneralPosts = async () =>
  requestJson(
    "/posts/general",
    {
      headers: getAuthHeaders(),
    },
    "Không thể tải bài viết",
  );

export const getPostComments = async (postId) =>
  requestJson(
    `/posts/${postId}/comments`,
    {
      headers: getAuthHeaders(),
    },
    "Không thể tải bình luận bài viết",
  );

export const addPostComment = async (postId, payload) =>
  requestJson(
    `/posts/${postId}/comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Không thể thêm bình luận",
  );

export const togglePostLike = async (postId) =>
  requestJson(
    `/posts/${postId}/like`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
    },
    "Không thể cập nhật lượt thích",
  );

export const getMySubmissions = async () =>
  requestJson(
    "/submissions",
    {
      headers: getAuthHeaders(),
    },
    "Không thể tải danh sách đóng góp",
  );

export const uploadImage = async (file, options = {}) => {
  const formData = new FormData();
  formData.append("image", file);
  if (options.usageType || options.usage_type) {
    formData.append("usage_type", options.usageType || options.usage_type);
  }

  const res = await fetch(buildApiUrl("/api/upload"), {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  const result = await parseResponse(res, "Không thể tải ảnh lên");

  const mediaId = result.mediaId || result.media_id || null;
  const imageUrl = result.url || result.imageUrl || (mediaId ? `/api/media/${mediaId}` : "");
  return {
    ...result,
    mediaId,
    media_id: mediaId,
    imageUrl,
    url: imageUrl,
  };
};

export const getFundOverview = async () =>
  requestJson(
    "/fund/overview",
    {
      headers: getAuthHeaders(),
    },
    "Không thể tải tổng quan quỹ",
  );

export const getFundTransactions = async () =>
  requestJson(
    "/fund/transactions",
    {
      headers: getAuthHeaders(),
    },
    "Không thể tải lịch sử giao dịch quỹ",
  );

export const submitFundContribution = async (payload) =>
  requestJson(
    "/fund/contribute",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Không thể gửi thông báo đóng góp",
  );
