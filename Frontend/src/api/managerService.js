import { apiRequest } from "../services/api";
import { getTreeEditKeyHeader } from "../services/treeEditSession";

const BASE_URL = "/api/manager";

const asArray = (value) => (Array.isArray(value) ? value : []);


const ensureCenteredNoticeStyles = () => {
  if (typeof document === "undefined" || document.getElementById("genealogy-centered-notice-style")) return;
  const style = document.createElement("style");
  style.id = "genealogy-centered-notice-style";
  style.textContent = `
    .genealogy-notice-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(15, 23, 42, 0.48);
      backdrop-filter: blur(2px);
    }
    .genealogy-notice-card {
      width: min(520px, 100%);
      background: #ffffff;
      color: #111827;
      border-radius: 18px;
      box-shadow: 0 22px 70px rgba(15, 23, 42, 0.35);
      padding: 24px;
      text-align: center;
      font-family: inherit;
      animation: genealogyNoticePop 160ms ease-out;
    }
    .genealogy-notice-icon {
      width: 46px;
      height: 46px;
      margin: 0 auto 12px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 800;
      background: #fee2e2;
      color: #dc2626;
    }
    .genealogy-notice-card.is-warning .genealogy-notice-icon {
      background: #fef3c7;
      color: #d97706;
    }
    .genealogy-notice-title {
      margin: 0 0 10px;
      font-size: 20px;
      font-weight: 800;
    }
    .genealogy-notice-message {
      margin: 0;
      font-size: 15px;
      line-height: 1.55;
      white-space: pre-line;
    }
    .genealogy-notice-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 22px;
      flex-wrap: wrap;
    }
    .genealogy-notice-btn {
      border: 0;
      border-radius: 999px;
      padding: 10px 22px;
      font-weight: 700;
      cursor: pointer;
      background: #e5e7eb;
      color: #111827;
    }
    .genealogy-notice-btn.primary {
      background: #2563eb;
      color: #ffffff;
    }
    .genealogy-notice-btn.danger {
      background: #dc2626;
      color: #ffffff;
    }
    @keyframes genealogyNoticePop {
      from { transform: translateY(8px) scale(0.98); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
};

const showCenteredGenealogyNotice = ({
  message,
  title = "Thông báo ràng buộc gia phả",
  type = "error",
  confirm = false,
}) => {
  if (typeof document === "undefined") {
    return Promise.resolve(false);
  }
  ensureCenteredNoticeStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "genealogy-notice-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) close(false);
    });

    const card = document.createElement("div");
    card.addEventListener("mousedown", (event) => event.stopPropagation());
    card.className = `genealogy-notice-card ${type === "warning" ? "is-warning" : "is-error"}`;

    const icon = document.createElement("div");
    icon.className = "genealogy-notice-icon";
    icon.textContent = type === "warning" ? "!" : "×";

    const titleEl = document.createElement("h3");
    titleEl.className = "genealogy-notice-title";
    titleEl.textContent = title;

    const messageEl = document.createElement("p");
    messageEl.className = "genealogy-notice-message";
    messageEl.textContent = message || "Có lỗi xảy ra.";

    const actions = document.createElement("div");
    actions.className = "genealogy-notice-actions";

    const close = (value) => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve(value);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") close(false);
      if (!confirm && event.key === "Enter") close(true);
    };

    if (confirm) {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "genealogy-notice-btn";
      cancelBtn.textContent = "Hủy";
      cancelBtn.onclick = () => close(false);

      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "genealogy-notice-btn primary";
      okBtn.textContent = "Vẫn lưu dữ liệu lịch sử";
      okBtn.onclick = () => close(true);

      actions.append(cancelBtn, okBtn);
      setTimeout(() => okBtn.focus(), 0);
    } else {
      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "genealogy-notice-btn danger";
      okBtn.textContent = "Đã hiểu";
      okBtn.onclick = () => close(true);
      actions.append(okBtn);
      setTimeout(() => okBtn.focus(), 0);
    }

    card.append(icon, titleEl, messageEl, actions);
    overlay.append(card);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown);
  });
};

const isHistoricalRelationWarning = (error) => {
  const data = error?.data || error?.response?.data || {};
  return Boolean(data.requiresConfirmation || error?.requiresConfirmation) && data.level === "warning";
};

const markNoticeShown = (error) => {
  if (error && typeof error === "object") {
    error.__centeredNoticeShown = true;
  }
  return error;
};

const mergeForceSaveFlag = (options = {}) => {
  let body = {};
  if (options.body) {
    try {
      body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    } catch (_) {
      body = {};
    }
  }
  return {
    ...options,
    body: JSON.stringify({
      ...(body || {}),
      forceSaveHistoricalRelation: true,
    }),
  };
};

const requestWithHistoricalConfirmation = async (endpoint, options = {}, fallbackError = "Yêu cầu API thất bại") => {
  try {
    return await request(endpoint, options, fallbackError);
  } catch (error) {
    if (!isHistoricalRelationWarning(error)) throw error;

    const message =
      error?.data?.message ||
      error?.message ||
      "Quan hệ này vi phạm ràng buộc huyết thống/hôn phối. Đây có thể là dữ liệu lịch sử. Bạn có chắc muốn tiếp tục lưu không?";

    const ok = await showCenteredGenealogyNotice({
      message,
      title: "Cảnh báo quan hệ dữ liệu lịch sử",
      type: "warning",
      confirm: true,
    });
    if (!ok) {
      const cancelError = new Error("Đã hủy lưu quan hệ sau cảnh báo vi phạm.");
      cancelError.data = error?.data || null;
      cancelError.status = error?.status || 409;
      cancelError.code = "HISTORICAL_RELATION_CONFIRMATION_CANCELLED";
      throw markNoticeShown(cancelError);
    }

    return request(endpoint, mergeForceSaveFlag(options), fallbackError);
  }
};

const request = async (endpoint, options = {}, fallbackError = "Yêu cầu API thất bại") => {
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

    if (
      normalizedError.data?.level === "error" &&
      normalizedError.data?.message &&
      typeof window !== "undefined"
    ) {
      await showCenteredGenealogyNotice({
        message: normalizedError.data.message,
        title: "Vi phạm ràng buộc gia phả",
        type: "error",
        confirm: false,
      });
      markNoticeShown(normalizedError);
    }

    throw normalizedError;
  }
};

export const getStats = () => request("/stats", {}, "Không thể lấy thống kê manager");

export const getManagerTree = (clanId) => {
  const query = clanId ? `?clan_id=${encodeURIComponent(clanId)}` : "";
  return request(`/tree${query}`, {}, "Không thể lấy cây gia phả");
};

export const getMembers = () => request("/members", {}, "Không thể lấy danh sách thành viên");

export const getManagerClanInfo = () =>
  request("/clan-info", {}, "Không thể lấy thông tin dòng họ");

export const updateManagerClanInfo = (payload) =>
  request(
    "/clan-info",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    "Không thể cập nhật thông tin dòng họ"
  );

export const getActiveTreeEditKeysAPI = (clanId) => {
  const query = clanId ? `?clan_id=${encodeURIComponent(clanId)}` : "";
  return request(`/tree-edit-keys${query}`, {}, "Không thể lấy danh sách temporary edit key");
};

export const createTreeEditKeyAPI = (memberAccountIds) => {
  const ids = Array.isArray(memberAccountIds) ? memberAccountIds : [memberAccountIds];

  const uniqueIds = [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];

  return request(
    "/tree-edit-keys",
    {
      method: "POST",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(
        uniqueIds.length === 1
          ? { member_account_id: uniqueIds[0], member_account_ids: uniqueIds }
          : { member_account_ids: uniqueIds }
      ),
    },
    "Không thể tạo temporary edit key"
  );
};

export const getFundOverviewAPI = () =>
  request("/fund/overview", {}, "Không thể lấy tổng quan quỹ");

export const getFundStatsAPI = () =>
  request("/fund/stats", {}, "Không thể lấy thống kê quỹ dòng họ");

export const getFundTransactionsAPI = () =>
  request("/fund/transactions", {}, "Không thể lấy lịch sử giao dịch quỹ");

export const addFundIncomeAPI = (payload) =>
  request(
    "/fund/income",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Không thể thêm khoản thu"
  );

export const addFundExpenseAPI = (payload) =>
  request(
    "/fund/expense",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Không thể thêm khoản chi"
  );

export const createMember = (payload) =>
  request(
    "/members",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Không thể tạo thành viên"
  );

export const getMemberRelations = (accountId) =>
  request(`/members/${accountId}/relations`, {}, "Không thể lấy quan hệ thành viên");

export const updateMemberRelations = (accountId, body) =>
  requestWithHistoricalConfirmation(
    `/members/${accountId}/relations`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    "Không thể lưu quan hệ"
  );

export const getMemberDetail = (accountId) =>
  request(`/members/${accountId}`, {}, "Không thể lấy chi tiết thành viên");

export const updateMemberByManager = (accountId, body) =>
  requestWithHistoricalConfirmation(
    `/members/${accountId}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    "Không thể cập nhật thành viên"
  );

export const archiveMemberAPI = (accountId, reason) =>
  request(
    `/members/${accountId}/archive`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    "Không thể lưu trữ thành viên"
  );

export const getArchivedMembersAPI = () =>
  request("/members-archive", {}, "Không thể lấy kho lưu trữ thành viên");

export const deleteArchivedMemberAPI = (archiveId) =>
  request(
    `/members-archive/${archiveId}`,
    {
      method: "DELETE",
    },
    "Không thể xóa vĩnh viễn bản ghi lưu trữ"
  );


export const deleteAllArchivedMembersAPI = () =>
  request(
    `/members-archive`,
    {
      method: "DELETE",
    },
    "Không thể xóa tất cả bản ghi lưu trữ"
  );

export const restoreArchivedMemberAPI = (archiveId) =>
  request(
    `/members-archive/${archiveId}/restore`,
    {
      method: "POST",
    },
    "Không thể phục hồi thành viên"
  );

export const getPendingUsers = () =>
  request("/pending", {}, "Không thể lấy người dùng chờ duyệt");

export const approveUserAPI = (id) =>
  request(
    `/approve/${id}`,
    {
      method: "POST",
    },
    "Duyệt người dùng thất bại"
  );

export const rejectUserAPI = (id) =>
  request(
    `/reject/${id}`,
    {
      method: "POST",
    },
    "Từ chối người dùng thất bại"
  );

export const getPendingPosts = () =>
  request("/pending-posts", {}, "Không thể lấy bài viết chờ duyệt");

export const approvePostAPI = (id) =>
  request(
    `/approve-post/${id}`,
    {
      method: "POST",
    },
    "Phê duyệt bài viết thất bại"
  );

export const rejectPostAPI = (id, reason) =>
  request(
    `/reject-post/${id}`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    "Từ chối bài viết thất bại"
  );

export const getMediaAPI = () =>
  request("/media", {}, "Không thể lấy dữ liệu thư viện");

export const getPendingReviewData = async () => {
  const [users, posts, profiles, memories] = await Promise.all([
    getPendingUsers(),
    getPendingPosts(),
    getPendingProfileUpdates(),
    getPendingMemories().catch(() => ({ memories: [] })),
  ]);

  const pendingUsers = asArray(users);
  const pendingPosts = asArray(posts);
  const pendingProfiles = asArray(profiles);
  const pendingMemories = asArray(memories?.memories || memories);

  return {
    pendingUsers,
    pendingPosts,
    pendingProfiles,
    pendingMemories,
    totalPending: pendingUsers.length + pendingPosts.length + pendingProfiles.length + pendingMemories.length,
  };
};

export const refreshPendingApprovalsAPI = () => getPendingReviewData();

export const getDashboardData = async () => {
  const [stats, pending, tasks] = await Promise.all([
    getStats(),
    getPendingReviewData(),
    getTasksAPI().catch(() => []),
  ]);

  return {
    stats: stats || {},
    ...pending,
    tasks: asArray(tasks),
  };
};

export const getMediaLibraryData = async () => asArray(await getMediaAPI());

export const createPersonAPI = (data) =>
  requestWithHistoricalConfirmation(
    "/people",
    {
      method: "POST",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Tạo người trong gia phả thất bại"
  );

export const linkRelationsAPI = (data) =>
  requestWithHistoricalConfirmation(
    "/people/link",
    {
      method: "PATCH",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Liên kết quan hệ thất bại"
  );

export const updatePersonAPI = (personId, data) =>
  requestWithHistoricalConfirmation(
    `/people/${personId}`,
    {
      method: "PATCH",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Không thể cập nhật người trong gia phả"
  );

export const updatePersonPositionAPI = (personId, data) =>
  request(
    `/people/${personId}/position`,
    {
      method: "PATCH",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Không thể lưu vị trí"
  );

export const saveTreeLayoutAPI = (people = [], clanId, options = {}) =>
  request(
    clanId ? `/clans/${clanId}/family-tree/layout` : "/people/layout",
    {
      method: "PATCH",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify({
        people,
        positions: people,
        clan_id: clanId,
        client_layout_id: options.clientLayoutId || options.client_layout_id,
        line_routes: options.lineRoutes || options.line_routes,
        card_sizes: options.cardSizes || options.card_sizes,
      }),
    },
    "Không thể lưu bố cục cây"
  );

export const saveTreeLayoutBatchAPI = (data = {}) =>
  request(
    "/tree/layout/batch",
    {
      method: "POST",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Khong the luu bo cuc cay"
  );

export const deletePersonAPI = (personId) =>
  request(
    `/people/${personId}`,
    {
      method: "DELETE",
      headers: getTreeEditKeyHeader(),
    },
    "Không thể xóa người khỏi gia phả"
  );

export const createFamilyAPI = (data) =>
  requestWithHistoricalConfirmation(
    "/families",
    {
      method: "POST",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Không thể tạo family"
  );

export const updateFamilyAPI = (familyId, data) =>
  requestWithHistoricalConfirmation(
    `/families/${familyId}`,
    {
      method: "PATCH",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Khong the cap nhat family"
  );

export const addFamilyChildAPI = (familyId, data) =>
  request(
    `/families/${familyId}/children`,
    {
      method: "POST",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Không thể thêm con vào family"
  );

export const assignTaskAPI = (data) =>
  request(
    "/assign-task",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    "Giao việc thất bại"
  );
  
export const bulkAssignTasksAPI = (data) =>
  request(
    "/tasks/bulk-assign",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    "Giao nhiều công việc thất bại"
  );

export const getTasksAPI = (params = {}) => {
  const query = new URLSearchParams();

  if (params.event_id) query.set("event_id", params.event_id);
  if (params.clan_id) query.set("clan_id", params.clan_id);

  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request(`/tasks${suffix}`, {}, "Lấy danh sách việc thất bại");
};

export const completeTaskAPI = (assignmentId) =>
  request(
    `/tasks/${assignmentId}/complete`,
    {
      method: "PATCH",
    },
    "Cập nhật trạng thái công việc thất bại"
  );

export const updateAssignedTaskAPI = (taskId, data) =>
  request(
    `/tasks/${taskId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
    "Cập nhật công việc thất bại"
  );

export const deleteAssignedTaskAPI = (taskId, data = {}) =>
  request(
    `/tasks/${taskId}`,
    {
      method: "DELETE",
      body: JSON.stringify(data),
    },
    "Xóa công việc thất bại"
  );

export const getPendingProfileUpdates = () =>
  request("/pending-profiles", {}, "Không thể lấy danh sách cập nhật hồ sơ");

export const approveProfileUpdateAPI = (id) =>
  request(
    `/approve-profile/${id}`,
    {
      method: "POST",
    },
    "Phê duyệt hồ sơ thất bại"
  );

export const rejectProfileUpdateAPI = (id, reason) =>
  request(
    `/reject-profile/${id}`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    "Từ chối hồ sơ thất bại"
  );

export const getManagerEventsAPI = (params = {}) => {
  const query = new URLSearchParams();

  if (params.clan_id) query.set("clan_id", params.clan_id);

  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request(`/events${suffix}`, {}, "Lấy danh sách sự kiện thất bại");
};

export const createManagerEventAPI = (data) =>
  request(
    "/events",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    "Tạo sự kiện thất bại"
  );

export const createEventTaskAPI = (eventId, data) =>
  request(
    `/events/${eventId}/tasks`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    "Tạo công việc trong sự kiện thất bại"
  );

export const updateManagerEventAPI = (eventId, data) =>
  request(
    `/events/${eventId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
    "Cập nhật sự kiện thất bại"
  );

export const deleteManagerEventAPI = (eventId, params = {}) => {
  const query = new URLSearchParams();

  if (params.clan_id) query.set("clan_id", params.clan_id);

  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request(
    `/events/${eventId}${suffix}`,
    {
      method: "DELETE",
    },
    "Xóa sự kiện thất bại"
  );
};
export const getPendingMemories = () =>
  request("/pending-memories", {}, "Không thể lấy kỉ niệm chờ duyệt");

export const approveMemoryAPI = (id) =>
  request(
    `/approve-memory/${id}`,
    { method: "POST" },
    "Phê duyệt kỉ niệm thất bại"
  );

export const rejectMemoryAPI = (id, reason) =>
  request(
    `/reject-memory/${id}`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    "Từ chối kỉ niệm thất bại"
  );


