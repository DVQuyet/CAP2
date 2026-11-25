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

async function loadViewerPersonId(accountId) {
    if (!accountId) return null;
    // Dùng liên kết hiện tại của tài khoản, vì currentMemberId chỉ là góc nhìn trong chatbot.
    const [rows] = await db.query(
        `SELECT COALESCE(a.person_id, ac.person_id) AS person_id
         FROM accounts a
         LEFT JOIN account_clans ac ON ac.account_id = a.id AND ac.status = 'active'
         WHERE a.id = ? ORDER BY ac.id ASC LIMIT 1`,
        [accountId]
    );
    return rows[0]?.person_id ?? null;
}

function createChatbotMetadataFilter(user) {
    let viewerPersonId;
    const getViewerPersonId = () => {
        viewerPersonId ??= loadViewerPersonId(toPositiveId(user?.id || user?.account_id)).catch(() => null);
        return viewerPersonId;
    };
    return async (metadata) => {
        if (typeof metadata === 'string') {
            try { metadata = JSON.parse(metadata || '{}'); } catch (_) { return null; }
        }
        return canSeeAllContacts(user) ? metadata : filterMetadataValue(metadata, getViewerPersonId);
    };
}

module.exports = { createChatbotMetadataFilter };
