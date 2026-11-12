// API của cây gia phả (người, quan hệ, bố cục, khóa sửa tạm, kho lưu trữ, kiểm tra, GEDCOM).
// Chuyển nguyên văn từ api/managerService.js (E7.3); dùng chung hàm request của managerService.
import { buildApiUrl } from "../../services/api";
import { getTreeEditKeyHeader } from "../../services/treeEditSession";
import { MANAGER_BASE_URL, managerRequest, managerRequestWithConfirmation } from "../../api/managerService";

export { getManagerTree, updateManagerClanInfo } from "../../api/managerService";

export const getActiveTreeEditKeysAPI = (clanId) => {
  const query = clanId ? `?clan_id=${encodeURIComponent(clanId)}` : "";
  return managerRequest(`/tree-edit-keys${query}`, {}, "Không thể lấy danh sách temporary edit key");
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

  return managerRequest(
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

export const archiveMemberAPI = (accountId, reason) =>
  managerRequest(
    `/members/${accountId}/archive`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
    "Không thể lưu trữ thành viên"
  );

export const getArchivedMembersAPI = () =>
  managerRequest("/members-archive", {}, "Không thể lấy kho lưu trữ thành viên");

export const deleteArchivedMemberAPI = (archiveId) =>
  managerRequest(
    `/members-archive/${archiveId}`,
    {
      method: "DELETE",
    },
    "Không thể xóa vĩnh viễn bản ghi lưu trữ"
  );

export const deleteAllArchivedMembersAPI = () =>
  managerRequest(
    `/members-archive`,
    {
      method: "DELETE",
    },
    "Không thể xóa tất cả bản ghi lưu trữ"
  );

export const restoreArchivedMemberAPI = (archiveId) =>
  managerRequest(
    `/members-archive/${archiveId}/restore`,
    {
      method: "POST",
    },
    "Không thể phục hồi thành viên"
  );

// Xem trước thay đổi quan hệ: lỗi, cảnh báo, thông báo và các thay đổi đời (không ghi gì).
export const previewRelationsAPI = (data) =>
  managerRequest(
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
  managerRequest(`/tree/audit${clanQuery(clanId)}`, { method: "GET" }, "Không thể kiểm tra gia phả");

export const recomputeGenerationsAPI = (clanId) =>
  managerRequest(
    `/tree/recompute-generations${clanQuery(clanId)}`,
    { method: "POST", body: JSON.stringify({ clan_id: clanId }) },
    "Không thể cập nhật đời"
  );

export const getGenealogyPolicyAPI = (clanId) =>
  managerRequest(`/tree/genealogy-policy${clanQuery(clanId)}`, { method: "GET" }, "Không thể đọc cài đặt gia phả");

export const updateGenealogyPolicyAPI = (clanId, policy) =>
  managerRequest(
    `/tree/genealogy-policy${clanQuery(clanId)}`,
    { method: "PUT", body: JSON.stringify({ clan_id: clanId, policy }) },
    "Không thể lưu cài đặt gia phả"
  );

export const listRelationOverridesAPI = (clanId) =>
  managerRequest(`/tree/relation-overrides${clanQuery(clanId)}`, { method: "GET" }, "Không thể đọc lịch sử xác nhận");

export const createPersonAPI = (data) =>
  managerRequestWithConfirmation(
    "/people",
    {
      method: "POST",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Tạo người trong gia phả thất bại"
  );

export const linkRelationsAPI = (data) =>
  managerRequestWithConfirmation(
    "/people/link",
    {
      method: "PATCH",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Liên kết quan hệ thất bại"
  );

export const updatePersonAPI = (personId, data) =>
  managerRequestWithConfirmation(
    `/people/${personId}`,
    {
      method: "PATCH",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Không thể cập nhật người trong gia phả"
  );

export const saveTreeLayoutAPI = (people = [], clanId, options = {}) =>
  managerRequest(
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
  managerRequest(
    "/tree/layout/batch",
    {
      method: "POST",
      headers: getTreeEditKeyHeader(),
      body: JSON.stringify(data),
    },
    "Khong the luu bo cuc cay"
  );

export const deletePersonAPI = (personId) =>
  managerRequest(
    `/people/${personId}`,
    {
      method: "DELETE",
      headers: getTreeEditKeyHeader(),
    },
    "Không thể xóa người khỏi gia phả"
  );

// Tải file GEDCOM 5.5.1 của dòng họ (chỉ xuất). Trả { blob, filename } để trang tự lưu.
export const downloadTreeGedcom = async () => {
  const token = localStorage.getItem("auth_token");
  const response = await fetch(buildApiUrl(`${MANAGER_BASE_URL}/tree/export.gedcom`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error(data.message || "Không thể xuất file GEDCOM"), { status: response.status });
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  let filename = "gia-pha.ged";
  try {
    if (encoded) filename = decodeURIComponent(encoded[1]);
  } catch {
    // giữ tên mặc định
  }
  return { blob: await response.blob(), filename };
};
