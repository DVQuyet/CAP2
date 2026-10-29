// Chọn các sự kiện sắp tới (từ lịch dòng họ) để gợi ý "Soạn thông báo cho sự kiện này".
// Bỏ sinh nhật (ít khi cần thông báo cả họ); giữ giỗ, họp họ, sự kiện quản lý, lịch chung.
export function pickUpcomingEvents(events, todayIso, limit = 10) {
  const seen = new Set();
  return (Array.isArray(events) ? events : [])
    .filter((event) => event && event.id !== undefined && event.id !== null)
    .filter((event) => String(event.type || "") !== "birthday")
    .filter((event) => String(event.event_date || event.date || "") >= todayIso)
    .filter((event) => {
      const key = String(event.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(a.event_date || a.date).localeCompare(String(b.event_date || b.date)))
    .slice(0, limit)
    .map((event) => ({
      id: String(event.id),
      title: String(event.title || ""),
      date: String(event.event_date || event.date),
      type: String(event.type || ""),
    }));
}

export function toIsoLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "2026-11-15" -> "15/11/2026"
export function formatIsoShort(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
}
