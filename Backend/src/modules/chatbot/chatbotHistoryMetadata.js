const db = require('../../config/db');
const { CONTACT_FIELDS, canSeeAllContacts, redactContactFields } = require('../genealogy/contactPrivacy');
const { toPositiveId } = require('./chatbotUtils');

async function filterMetadataValue(value, getViewerPersonId) {
    if (Array.isArray(value)) return Promise.all(value.map((item) => filterMetadataValue(item, getViewerPersonId)));
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) return value;

    const entry = CONTACT_FIELDS.some((field) => Object.hasOwn(value, field))
        ? redactContactFields([value], { viewerPersonId: value.id ? await getViewerPersonId() : null })[0]
        : value;
    const fields = await Promise.all(Object.entries(entry).map(async ([key, nested]) => [
        key, await filterMetadataValue(nested, getViewerPersonId),
    ]));
    return Object.fromEntries(fields);
}

async function loadViewerPersonId(accountId, clanId) {
    if (!accountId || !clanId) return null;
    // Dùng liên kết hiện tại của tài khoản, vì currentMemberId chỉ là góc nhìn trong chatbot.
    const [rows] = await db.query(
        `SELECT COALESCE(p.id, ac.person_id) AS person_id
         FROM accounts a
         LEFT JOIN people p ON p.id = a.person_id AND p.clan_id = ?
         LEFT JOIN account_clans ac ON ac.account_id = a.id AND ac.clan_id = ? AND ac.status = 'active'
         WHERE a.id = ? ORDER BY ac.id ASC LIMIT 1`,
        [clanId, clanId, accountId]
    );
    return rows[0]?.person_id ?? null;
}

function createChatbotMetadataFilter(user, clanId, getViewerPersonId = viewerLookup(user, clanId)) {
    return async (metadata) => {
        if (typeof metadata === 'string') {
            try { metadata = JSON.parse(metadata || '{}'); } catch (_) { return null; }
        }
        return canSeeAllContacts(user) ? metadata : filterMetadataValue(metadata, getViewerPersonId);
    };
}

function viewerLookup(user, clanId) {
    let viewerPersonId;
    return () => {
        viewerPersonId ??= loadViewerPersonId(toPositiveId(user?.id || user?.account_id), clanId).catch(() => null);
        return viewerPersonId;
    };
}

async function loadContactPattern(clanId, viewerPersonId) {
    const [people] = await db.query('SELECT id, phone, email, address FROM people WHERE clan_id = ?', [clanId]);
    const values = new Set(people
        .filter((person) => Number(person.id) !== Number(viewerPersonId))
        .flatMap((person) => CONTACT_FIELDS.map((field) => String(person[field] ?? '').trim()))
        .filter((value) => value.length >= 4)); // giá trị quá ngắn dễ khớp nhầm chữ thường
    if (!values.size) return null;
    const alternatives = [...values].sort((a, b) => b.length - a.length)
        .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'gu');
}

function redactMetadataText(value, redact) {
    if (typeof value === 'string') return redact(value);
    if (Array.isArray(value)) return value.map((item) => redactMetadataText(item, redact));
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
        key, CONTACT_FIELDS.includes(key) ? nested : redactMetadataText(nested, redact),
    ]));
}

function createChatbotHistoryFilter(user, clanId) {
    const getViewerPersonId = viewerLookup(user, clanId);
    const filterMetadata = createChatbotMetadataFilter(user, clanId, getViewerPersonId);
    let contactPattern;
    return async (row) => {
        const next = { ...row };
        if (Object.hasOwn(row, 'metadata')) next.metadata = await filterMetadata(row.metadata);
        if (canSeeAllContacts(user)) return next;

        contactPattern ??= getViewerPersonId().then((viewerPersonId) => loadContactPattern(clanId, viewerPersonId));
        const pattern = await contactPattern;
        const redact = (text) => typeof text === 'string' && pattern
            ? text.replace(pattern, '[đã ẩn thông tin liên hệ]')
            : text;
        if (Object.hasOwn(next, 'message')) next.message = redact(next.message);
        if (Object.hasOwn(next, 'metadata')) next.metadata = redactMetadataText(next.metadata, redact);
        return next;
    };
}

// Lọc các tin cũ (lịch sử trả về client và ngữ cảnh hội thoại gửi LLM) theo quyền hiện tại của người đọc.
async function filterHistoryRows(user, clanId, rows = []) {
    const filterRow = createChatbotHistoryFilter(user, clanId);
    return Promise.all(rows.map(filterRow));
}

module.exports = { createChatbotMetadataFilter, createChatbotHistoryFilter, filterHistoryRows };
