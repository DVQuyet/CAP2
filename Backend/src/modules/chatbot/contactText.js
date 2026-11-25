// Che SĐT, email, địa chỉ nằm lẫn trong văn bản tự do (ghi chú, tiểu sử, tin nhắn cũ) cho người không có quyền xem.
// Hai lớp: mẫu chung cho email/SĐT (kể cả giá trị đã đổi hoặc không nằm trong cột liên hệ) và đúng giá trị
// liên hệ hiện có của người trong họ (bắt được địa chỉ, vốn không có mẫu chung).
const db = require('../../config/db');
const { CONTACT_FIELDS, canSeeAllContacts } = require('../genealogy/contactPrivacy');

const HIDDEN = '[đã ẩn thông tin liên hệ]';
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// Số điện thoại: 9–13 chữ số, cho phép +, khoảng trắng, dấu chấm, gạch nối, ngoặc giữa các nhóm số.
const PHONE = /(?<![\p{L}\p{N}])\+?\(?\d(?:[\s.()-]?\d){8,12}(?![\p{L}\p{N}])/gu;

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Trả { pattern, keep }: pattern khớp liên hệ của người khác trong họ, keep là liên hệ của chính người xem
// (không che dù khớp mẫu chung email/SĐT).
async function loadClanContactPattern(clanId, exceptPersonId = null) {
    if (!clanId) return null;
    const [people] = await db.query('SELECT id, phone, email, address FROM people WHERE clan_id = ?', [clanId]);
    const valuesOf = (rows) => rows.flatMap((person) => CONTACT_FIELDS.map((field) => String(person[field] ?? '').trim()));
    const own = people.filter((person) => Number(person.id) === Number(exceptPersonId));
    const keep = new Set(valuesOf(own).filter(Boolean));
    const values = new Set(valuesOf(people.filter((person) => !own.includes(person)))
        .filter((value) => value.length >= 3 && !keep.has(value))); // "Q.1" vẫn là địa chỉ; 1–2 ký tự dễ khớp nhầm
    const alternatives = [...values].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
    const pattern = values.size ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'gu') : null;
    return { pattern, keep };
}

function redactContactText(text, rules = null) {
    if (typeof text !== 'string' || !text) return text;
    const keep = rules?.keep || new Set();
    const hide = (match) => (keep.has(match.trim()) ? match : HIDDEN);
    const next = rules?.pattern ? text.replace(rules.pattern, HIDDEN) : text;
    return next.replace(EMAIL, hide).replace(PHONE, hide);
}

// Che trước khi lưu tin của người không có quyền xem liên hệ, để lịch sử cũ không giữ giá trị thật
// (lọc lúc đọc chỉ so được với giá trị hiện tại).
async function redactForStorage(text, { user, clanId, viewerPersonId }) {
    if (canSeeAllContacts(user)) return text;
    const pattern = await loadClanContactPattern(clanId, viewerPersonId).catch(() => null);
    return redactContactText(text, pattern);
}

module.exports = { HIDDEN, loadClanContactPattern, redactContactText, redactForStorage };
