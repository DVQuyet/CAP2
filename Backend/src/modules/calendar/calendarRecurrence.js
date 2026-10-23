// Lặp hằng năm cho sự kiện lịch gắn với một người (giỗ, sinh nhật do người dùng tạo)
// và loại trùng với ngày giỗ/sinh nhật mà lịch tự tính từ hồ sơ gia phả (buildYearlyPersonEvents).
// Hàm thuần, không đụng DB, để test được bằng dữ liệu giả.

const PERSON_EVENT_TYPES = new Set(['birthday', 'death_anniversary']);

const isoYear = (iso) => Number(String(iso || '').slice(0, 4));

// Cùng tháng/ngày dương ở năm khác; 29/02 gặp năm không nhuận thì lùi về 28/02.
function sameDayInYear(iso, year) {
    const [, month, day] = String(iso).split('-');
    const parsed = new Date(year, Number(month) - 1, Number(day));
    if (parsed.getMonth() + 1 !== Number(month)) return `${year}-02-28`;
    return `${year}-${month}-${day}`;
}

// Khóa loại trùng: người + loại + năm. Chỉ áp dụng cho sự kiện gắn người với loại giỗ/sinh nhật.
function personKey(event, year) {
    if (!event?.person_id || !PERSON_EVENT_TYPES.has(event.type)) return null;
    return `${event.person_id}|${event.type}|${year}`;
}

// userEvents: sự kiện lưu trong DB đã qua mapEventRow (có thể gồm cả sự kiện lặp có ngày gốc trước `from`).
// autoEvents: ngày giỗ/sinh nhật tự tính. Trả { userEvents, autoEvents } chỉ gồm những gì nằm trong [from, to].
//  - Sự kiện lặp hằng năm sinh thêm bản cho các năm sau ngày gốc (bản sinh ra không sửa/xóa được, trỏ về source_event_id).
//  - Bản sinh ra bị bỏ nếu lịch tự tính đã có đúng người + loại + năm đó.
//  - Ngày tự tính bị bỏ nếu người dùng đã có sự kiện của người + loại + năm đó (bản của người dùng thắng).
function applyYearlyRecurrence({ userEvents = [], autoEvents = [], from, to }) {
    const fromYear = isoYear(from);
    const toYear = isoYear(to);
    const inRange = (iso) => iso >= from && iso <= to;

    const autoKeys = new Set();
    for (const event of autoEvents) {
        const key = personKey(event, isoYear(event.event_date));
        if (key) autoKeys.add(key);
    }

    const shown = userEvents.filter((event) => inRange(event.event_date));
    const userKeys = new Set();
    for (const event of shown) {
        const key = personKey(event, isoYear(event.event_date));
        if (key) userKeys.add(key);
    }

    const generated = [];
    for (const event of userEvents) {
        if (!event.repeat_yearly || !event.event_date) continue;
        const baseYear = isoYear(event.event_date);
        for (let year = Math.max(fromYear, baseYear + 1); year <= toYear; year += 1) {
            const date = sameDayInYear(event.event_date, year);
            if (!inRange(date)) continue;
            const key = personKey(event, year);
            if (key && (autoKeys.has(key) || userKeys.has(key))) continue;
            if (key) userKeys.add(key);
            generated.push({
                ...event,
                id: `${event.id}-y${year}`,
                date,
                event_date: date,
                recurring_instance: true,
                source_event_id: event.id,
                can_edit: false,
                can_delete: false,
                reminder_sent_at: null,
                email_sent_at: null,
            });
        }
    }

    const autoShown = autoEvents.filter((event) => {
        const key = personKey(event, isoYear(event.event_date));
        return !key || !userKeys.has(key);
    });
    return { userEvents: [...shown, ...generated], autoEvents: autoShown };
}

module.exports = { applyYearlyRecurrence, sameDayInYear, PERSON_EVENT_TYPES };
