// Đọc yêu cầu sửa/xóa sự kiện trong lịch bằng câu tự nhiên:
//   "đổi giờ họp họ chủ nhật sang 9h", "dời họp chi sang 25/10", "xóa nhắc giỗ ông nội".
// Chỉ phân tích câu; việc tìm sự kiện (chỉ của chính người hỏi) và bước xác nhận do chatbotController làm.

const { extractDate, extractTime, detectType, extractPersonPhrase } = require('./eventCommandService');

// "xóa lịch sử" là xóa lịch sử chat, không phải xóa sự kiện: loại ra bằng lookahead.
const DELETE_PATTERN = /^\s*(?:(?:xin|hãy|hay)\s+)?(?:xóa|xoá|xoa|hủy|huỷ|huy|bỏ|bo)\s+(?:giúp\s+(?:tôi|mình)\s+|giup\s+(?:toi|minh)\s+)?(?:cái\s+|cai\s+)?(?:(?:lịch|sự\s+kiện|lời\s+nhắc|nhắc|lich|su\s+kien|loi\s+nhac|nhac)\s+(?!sử(?:\s|$)|su(?:\s|$))|(?=(?:giỗ|gio|sinh\s+nhật|sinh\s+nhat|họp|hop)\s))(.+)$/i;
const EDIT_PATTERN = /^\s*(?:(?:xin|hãy|hay)\s+)?(?:đổi|dời|doi|chuyển|chuyen|sửa|sua|hoãn|hoan|thay\s+đổi|thay\s+doi)\s+(?:(giờ|gio|ngày|ngay|lịch|lich|lời\s+nhắc|nhắc)\s+)?(.+?)\s+(?:sang|thành|thanh|qua|tới|đến|lên)\s+(.+)$/i;

const WEEKDAY_WORDS = /(?:chủ\s+nhật|chu\s+nhat|thứ\s+(?:hai|ba|tư|năm|sáu|bảy|[2-7])|thu\s+(?:hai|ba|tu|nam|sau|bay|[2-7]))(?=\s|$|[,.;!?])/i;
// Dùng lookaround thay \b vì \b không nhận ký tự có dấu.
const FILLER = /(?<![\p{L}])(?:lịch|lich|sự\s+kiện|su\s+kien|lời\s+nhắc|loi\s+nhac|nhắc|nhac|của\s+tôi|của\s+mình|cua\s+toi|cua\s+minh|cái|cai|giúp|giup|nhé|nha)(?![\p{L}])/giu;

const tidy = (text) => String(text || '').replace(/[,.;:!?]+/g, ' ').replace(/\s+/g, ' ').trim();

function stripConsumed(text, parts) {
    let result = text;
    parts.filter(Boolean).forEach((part) => { result = result.replace(part, ' '); });
    return result;
}

// Tên sự kiện cần tìm + bộ lọc ngày (nếu câu có "chủ nhật", "ngày 25/10"...).
function parseTarget(text, now, lunarToSolar) {
    const date = extractDate(text, now, lunarToSolar);
    const time = extractTime(text.replace(/(\d{1,2})[/-](\d{1,2})([/-]\d{4})?/g, ' '));
    const keyword = tidy(stripConsumed(text, [...(date?.consumed || []), time?.consumed]).replace(FILLER, ' '));
    const type = detectType(keyword);
    return {
        keyword,
        type: type === 'death_anniversary' || type === 'birthday' ? type : null,
        personPhrase: extractPersonPhrase(keyword, type),
        filter: date ? { date: date.isoDate, weekday: WEEKDAY_WORDS.test(text) ? new Date(`${date.isoDate}T00:00:00`).getDay() : null } : null,
    };
}

// Trả null nếu không phải câu sửa/xóa sự kiện.
//   { action: 'delete', keyword, type, personPhrase, filter }
//   { action: 'update', ..., changes: { date?, time? }, hasChange }
function parseEventEditCommand(message, { now = new Date(), lunarToSolar } = {}) {
    const text = String(message || '').normalize('NFC').trim();
    if (!text) return null;
    const toSolar = lunarToSolar || (() => null);

    const del = text.match(DELETE_PATTERN);
    if (del) {
        const target = parseTarget(del[1], now, toSolar);
        if (!target.keyword) return null;
        return { action: 'delete', ...target };
    }

    const edit = text.match(EDIT_PATTERN);
    if (!edit) return null;
    const what = String(edit[1] || '').toLowerCase();
    const target = parseTarget(edit[2], now, toSolar);
    if (!target.keyword) return null;

    const newPart = edit[3];
    const newTime = extractTime(newPart.replace(/(\d{1,2})[/-](\d{1,2})([/-]\d{4})?/g, ' '));
    const newDate = extractDate(newPart, now, toSolar);
    const changes = {};
    // "đổi giờ ... sang 9h" chỉ đổi giờ; các trường hợp khác nhận cả ngày lẫn giờ có trong vế sau.
    if (newTime) changes.time = newTime.time;
    if (newDate && !/^(?:giờ|gio)$/.test(what)) changes.date = newDate.isoDate;
    return { action: 'update', ...target, changes, hasChange: Boolean(changes.time || changes.date) };
}

module.exports = { parseEventEditCommand };
