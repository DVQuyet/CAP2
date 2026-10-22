// Logic thuần cho nút "Tải thêm" (phân trang keyset: has_more + next_before_id).

// Con trỏ trang kế tiếp; null khi đã hết dữ liệu.
export function nextCursorOf(data) {
  return data?.has_more ? data.next_before_id || null : null;
}

// Nối trang cũ hơn vào cuối danh sách, bỏ bản ghi trùng id.
export function appendPage(current, incoming, getId = (item) => item.id) {
  const base = Array.isArray(current) ? current : [];
  const known = new Set(base.map((item) => String(getId(item))));
  const fresh = (Array.isArray(incoming) ? incoming : []).filter((item) => !known.has(String(getId(item))));
  return [...base, ...fresh];
}

// Làm mới trang đầu (polling/realtime) mà không làm mất các trang đã tải thêm phía dưới.
export function refreshHead(current, firstPage, getId = (item) => item.id) {
  return appendPage(Array.isArray(firstPage) ? firstPage : [], current, getId);
}
