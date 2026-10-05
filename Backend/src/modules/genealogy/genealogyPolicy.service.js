// Chính sách gia phả theo từng dòng họ (lưu ở clans.genealogy_policy).
const { db } = require('../manager/common.service');
const { normalizePolicy, DEFAULT_POLICY } = require('./core');
const { ensureGenealogySchema } = require('./genealogySchema.service');

const parsePolicyJson = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return {};
    }
};

const getClanGenealogyPolicy = async (clanId, connection = db) => {
    await ensureGenealogySchema();
    const [rows] = await connection.query('SELECT genealogy_policy FROM clans WHERE id = ? LIMIT 1', [clanId]);
    return normalizePolicy(parsePolicyJson(rows[0]?.genealogy_policy));
};

const saveClanGenealogyPolicy = async (clanId, patch = {}, connection = db) => {
    const current = await getClanGenealogyPolicy(clanId, connection);
    const next = normalizePolicy({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) });
    await connection.query('UPDATE clans SET genealogy_policy = ? WHERE id = ?', [JSON.stringify(next), clanId]);
    return next;
};

module.exports = {
    DEFAULT_POLICY,
    getClanGenealogyPolicy,
    saveClanGenealogyPolicy,
};
