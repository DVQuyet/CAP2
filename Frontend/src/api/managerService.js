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
    .genealogy-notice-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .genealogy-notice-reason {
      display: grid;
      gap: 8px;
      margin-top: 16px;
      text-align: left;
      font-size: 13px;
      font-weight: 700;
    }
    .genealogy-notice-reason textarea,
    .genealogy-notice-reason select {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      padding: 8px 10px;
      font: inherit;
      font-weight: 400;
    }
    @keyframes genealogyNoticePop {
      from { transform: translateY(8px) scale(0.98); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
};

// withReason: bắt buộc nhập lý do/nguồn trước khi xác nhận (quan hệ trái quy định nhưng là dữ liệu lịch sử).
// Khi withReason, kết quả là { ok, reason, sourceType, sourceNote } thay vì true/false.
const showCenteredGenealogyNotice = ({
  message,
  title = "Thông báo ràng buộc gia phả",
  type = "error",
  confirm = false,
  withReason = false,
  confirmLabel = "Vẫn lưu dữ liệu lịch sử",
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

    let reasonInput = null;
    let sourceSelect = null;
    let sourceNoteInput = null;
    const close = (value) => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      if (!withReason) {
        resolve(value);
        return;
      }
      resolve({
        ok: Boolean(value),
        reason: reasonInput?.value?.trim() || "",
        sourceType: sourceSelect?.value || "",
        sourceNote: sourceNoteInput?.value?.trim() || "",
      });
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
      okBtn.textContent = confirmLabel;
      okBtn.onclick = () => close(true);

      if (withReason) {
        const reasonBox = document.createElement("div");
        reasonBox.className = "genealogy-notice-reason";
        const sourceLabel = document.createElement("label");
        sourceLabel.textContent = "Nguồn dữ liệu";
        sourceSelect = document.createElement("select");
        [
          ["paper_genealogy", "Gia phả giấy / bản chép tay"],
          ["document", "Giấy tờ, văn bản"],
          ["oral", "Lời kể của người trong họ"],
          ["direct", "Gia đình xác nhận trực tiếp"],
          ["unknown", "Không rõ"],
        ].forEach(([value, label]) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          sourceSelect.append(option);
        });
        sourceLabel.append(sourceSelect);
        const noteLabel = document.createElement("label");
        noteLabel.textContent = "Ghi chú nguồn (ví dụ: trang 12, bản chữ Hán năm 1938)";
        sourceNoteInput = document.createElement("input");
        sourceNoteInput.type = "text";
        sourceNoteInput.style.cssText = "width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:10px;padding:8px 10px;font:inherit;font-weight:400";
        noteLabel.append(sourceNoteInput);
        const reasonLabel = document.createElement("label");
        reasonLabel.textContent = "Lý do lưu (bắt buộc)";
        reasonInput = document.createElement("textarea");
        reasonInput.rows = 3;
        reasonInput.placeholder = "Ví dụ: Ghi theo gia phả giấy của dòng họ, cụ có vợ lẽ trước năm 1945.";
        reasonLabel.append(reasonInput);
        reasonBox.append(sourceLabel, noteLabel, reasonLabel);
        card.append(reasonBox);
        okBtn.disabled = true;
        reasonInput.addEventListener("input", () => {
          okBtn.disabled = !reasonInput.value.trim();
        });
        setTimeout(() => reasonInput.focus(), 0);
      } else {
        setTimeout(() => okBtn.focus(), 0);
      }

      actions.append(cancelBtn, okBtn);
    } else {
      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "genealogy-notice-btn danger";
      okBtn.textContent = "Đã hiểu";
      okBtn.onclick = () => close(true);
      actions.append(okBtn);
      setTimeout(() => okBtn.focus(), 0);
    }

    card.prepend(icon, titleEl, messageEl);
    card.append(actions);
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

const mergeForceSaveFlag = (options = {}, confirmation = null) => {
  let body = {};
  if (options.body) {
    try {
      body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    } catch (_) {
      body = {};
    }
  }
  const extra = confirmation && typeof confirmation === "object"
    ? {
      historicalOverrideReason: confirmation.reason || "",
      override_source_type: confirmation.sourceType || "",
      override_source_note: confirmation.sourceNote || "",
    }
    : {};
  return {
    ...options,
    body: JSON.stringify({
      ...(body || {}),
      ...extra,
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

    const reasonRequired = Boolean(error?.data?.reasonRequired);
    const confirmation = await showCenteredGenealogyNotice({
      message,
      title: reasonRequired ? "Quan hệ trái quy định hiện hành" : "Cảnh báo dữ liệu bất thường",
      type: "warning",
      confirm: true,
      withReason: reasonRequired,
      confirmLabel: reasonRequired ? "Lưu kèm lý do và nguồn" : "Vẫn lưu",
    });
    const ok = typeof confirmation === "object" ? confirmation.ok && Boolean(confirmation.reason) : confirmation;
    if (!ok) {
      const cancelError = new Error("Đã hủy lưu quan hệ sau cảnh báo vi phạm.");
      cancelError.data = error?.data || null;
      cancelError.status = error?.status || 409;
      cancelError.code = "HISTORICAL_RELATION_CONFIRMATION_CANCELLED";
      throw markNoticeShown(cancelError);
    }

    return request(endpoint, mergeForceSaveFlag(options, typeof confirmation === "object" ? confirmation : null), fallbackError);
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

// Xem trước thay đổi quan hệ: lỗi, cảnh báo, thông báo và các thay đổi đời (không ghi gì).
export const previewRelationsAPI = (data) =>
  request(
    "/people/link/preview",
    {
      method: "POST",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Không thể kiểm tra trước quan hệ"
  );

const clanQuery = (clanId) => (clanId ? `?clan_id=${encodeURIComponent(clanId)}` : "");

export const auditFamilyTreeAPI = (clanId) =>
  request(`/tree/audit${clanQuery(clanId)}`, { method: "GET" }, "Không thể kiểm tra gia phả");

export const recomputeGenerationsAPI = (clanId) =>
  request(
    `/tree/recompute-generations${clanQuery(clanId)}`,
    { method: "POST", body: JSON.stringify({ clan_id: clanId }) },
    "Không thể cập nhật đời"
  );

export const getGenealogyPolicyAPI = (clanId) =>
  request(`/tree/genealogy-policy${clanQuery(clanId)}`, { method: "GET" }, "Không thể đọc cài đặt gia phả");

export const updateGenealogyPolicyAPI = (clanId, policy) =>
  request(
    `/tree/genealogy-policy${clanQuery(clanId)}`,
    { method: "PUT", body: JSON.stringify({ clan_id: clanId, policy }) },
    "Không thể lưu cài đặt gia phả"
  );

export const listRelationOverridesAPI = (clanId) =>
  request(`/tree/relation-overrides${clanQuery(clanId)}`, { method: "GET" }, "Không thể đọc lịch sử xác nhận");

export const describeKinshipAPI = (clanId, sourcePersonId, targetPersonId) =>
  request(
    `/tree/kinship?source_person_id=${encodeURIComponent(sourcePersonId)}&target_person_id=${encodeURIComponent(targetPersonId)}${clanId ? `&clan_id=${encodeURIComponent(clanId)}` : ""}`,
    { method: "GET" },
    "Không thể tra cứu xưng hô"
  );

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
        tree_style: options.treeStyle || options.tree_style,
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


