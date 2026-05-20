const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const { ensureCanAddPerson, ensureCanAddAccount } = require('../billing/billing.service');
const {
    createTemporaryTreeEditKey: createTemporaryTreeEditKeyRecord,
    ensureMemberTreeEditKeysTable,
    assertTreeMutationPermission,
} = require('../../shared/utils/treeEditPermissions');
const { createNotification } = require('../../shared/utils/notifications');
const { sendMail, isSmtpConfigured } = require('../../shared/utils/email');
const { deletePersonCompletely } = require('../../shared/utils/personDeletion');
const { getTreeLayoutSettings, saveTreeLayoutSettings } = require('../../shared/utils/treeLayoutSettings');
const { normalizeMediaId, extractMediaIdFromUrl, getMediaUrl } = require('../../shared/utils/media');

const parseNullableId = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const parseChildrenIds = (value) => {
    if (Array.isArray(value)) {
        return [...new Set(value.map((v) => Number(v)).filter((v) => Number.isFinite(v)))];
    }
    if (typeof value === 'string') {
        return [
            ...new Set(
                value
                .split(',')
                .map((v) => Number(v.trim()))
                .filter((v) => Number.isFinite(v))
            ),
        ];
    }
    return [];
};

const parseTreeInt = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : fallback;
};

const buildPersonLabelFromRow = (row) => {
    if (!row) return null;
    const d = row.display_name != null ? String(row.display_name).trim() : '';
    if (d) return d;
    const s = row.surname == null ? '' : String(row.surname).trim();
    const m = row.middle_name == null ? '' : String(row.middle_name).trim();
    const f = row.first_name == null ? '' : String(row.first_name).trim();
    const name = [s, m, f].filter(Boolean).join(' ').trim();
    return name || (row.id != null ? `Hồ sơ #${row.id}` : null);
};

const fetchPeopleLabelsMap = async(ids) => {
    const unique = [...new Set((ids || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!unique.length) return new Map();
    const [rows] = await db.query(
        `SELECT id, display_name, surname, middle_name, first_name FROM people WHERE id IN (${unique.map(() => '?').join(',')})`,
        unique
    );
    const m = new Map();
    for (const r of rows) {
        m.set(r.id, buildPersonLabelFromRow(r));
    }
    return m;
};

const fmtSqlDate = (d) => {
    if (!d) return null;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    const s = String(d);
    return s.length >= 10 ? s.slice(0, 10) : s || null;
};

const toPositiveId = (value) => {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
};

const uniquePositiveIds = (values) =>
    [...new Set((values || []).map(toPositiveId).filter((id) => id !== null))];

const dateOnlyTime = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    }
    const text = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const time = Date.parse(`${text}T00:00:00Z`);
    return Number.isFinite(time) ? time : null;
};

const hasDuplicateIds = (value) => {
    const raw = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',')
            : [];
    const ids = raw.map(toPositiveId).filter((id) => id !== null);
    return ids.length !== new Set(ids).size;
};

const ARCHIVED_MEMBER_JOIN_SQL = `
    LEFT JOIN archived_members am ON
         (a.id IS NOT NULL AND am.account_id = a.id)
         OR (CAST(JSON_UNQUOTE(JSON_EXTRACT(am.person_json, '$.id')) AS UNSIGNED) = p.id)
`;

const ACTIVE_TREE_MEMBER_WHERE_SQL = `
      AND am.id IS NULL
      AND (a.id IS NULL OR a.status = 'active')
`;

const filterTreeRelationsForVisiblePeople = (familyRows = [], childRows = [], peopleRows = []) => {
    const visiblePersonIds = new Set(
        (peopleRows || [])
            .map((person) => Number(person.id))
            .filter((id) => Number.isFinite(id) && id > 0)
    );

    const visibleFamilies = (familyRows || []).filter((family) => {
        const fatherId = toPositiveId(family.father_id);
        const motherId = toPositiveId(family.mother_id);
        return (!fatherId || visiblePersonIds.has(fatherId)) && (!motherId || visiblePersonIds.has(motherId));
    });
    const visibleFamilyIds = new Set(
        visibleFamilies
            .map((family) => Number(family.id))
            .filter((id) => Number.isFinite(id) && id > 0)
    );

    const visibleChildren = (childRows || []).filter((child) => {
        const familyId = Number(child.family_id);
        const personId = Number(child.person_id);
        return visibleFamilyIds.has(familyId) && visiblePersonIds.has(personId);
    });

    return {
        familyRows: visibleFamilies,
        childRows: visibleChildren,
    };
};

const loadPeopleByIds = async(connection, ids) => {
    const cleanIds = uniquePositiveIds(ids);
    if (!cleanIds.length) return new Map();
    const [rows] = await connection.query(
        `SELECT id, clan_id, gender, generation, birth_date, death_date, is_living FROM people WHERE id IN (${cleanIds.map(() => '?').join(',')})`,
        cleanIds
    );
    return new Map(rows.map((row) => [Number(row.id), row]));
};

const normalizeTreeEditKeyMemberIds = (body = {}) => {
    const raw = Array.isArray(body.member_account_ids) ?
        body.member_account_ids :
        Array.isArray(body.member_ids) ?
        body.member_ids : [body.member_account_id];
    return [...new Set(raw.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
};

const buildTreeEditMemberName = (row) =>
    row?.display_name || [row?.surname, row?.middle_name, row?.first_name].filter(Boolean).join(' ').trim() ||
    `Member #${row?.account_id}`;

const buildDisplayNameFromPartsMgr = (surname, middleName, firstName) => {
    const s = surname == null ? '' : String(surname).trim();
    const m = middleName == null ? '' : String(middleName).trim();
    const f = firstName == null ? '' : String(firstName).trim();
    return [s, m, f].filter(Boolean).join(' ').trim();
};

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const formatTaskEmailDate = (value) => {
    if (!value) return 'Chưa có hạn chót';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('vi-VN');
};

const parseOptionalPositiveInt = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
};

module.exports = {
    db,
    bcrypt,
    ensureCanAddPerson,
    ensureCanAddAccount,
    createTemporaryTreeEditKeyRecord,
    ensureMemberTreeEditKeysTable,
    assertTreeMutationPermission,
    createNotification,
    sendMail,
    isSmtpConfigured,
    deletePersonCompletely,
    getTreeLayoutSettings,
    saveTreeLayoutSettings,
    normalizeMediaId,
    extractMediaIdFromUrl,
    getMediaUrl,
    parseNullableId,
    parseChildrenIds,
    parseTreeInt,
    buildPersonLabelFromRow,
    fetchPeopleLabelsMap,
    fmtSqlDate,
    toPositiveId,
    uniquePositiveIds,
    dateOnlyTime,
    hasDuplicateIds,
    ARCHIVED_MEMBER_JOIN_SQL,
    ACTIVE_TREE_MEMBER_WHERE_SQL,
    filterTreeRelationsForVisiblePeople,
    loadPeopleByIds,
    normalizeTreeEditKeyMemberIds,
    buildTreeEditMemberName,
    buildDisplayNameFromPartsMgr,
    escapeHtml,
    formatTaskEmailDate,
    parseOptionalPositiveInt,
};
