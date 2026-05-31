const db = require('../../config/db');
const { personName } = require('./relationshipEngine');

const tableExistenceCache = new Map();

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanHumanName(value) {
    const text = String(value || '')
        .replace(/[?!.,"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return '';
    const withoutTitle = text.replace(/^(ông|bà|anh|chị|em|cô|chú|bác|cậu|dì|cháu|cụ)\s+/i, '').trim();
    return withoutTitle.split(/\s+/).length >= 2 ? withoutTitle : text;
}

async function tableExists(tableName) {
    if (tableExistenceCache.has(tableName)) return tableExistenceCache.get(tableName);
    const [rows] = await db.query(
        `
        SELECT 1
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
        LIMIT 1
        `,
        [tableName]
    );
    const exists = rows.length > 0;
    tableExistenceCache.set(tableName, exists);
    return exists;
}

function scorePerson(row, queryText, aliases = []) {
    const normalizedQuery = normalizeText(queryText);
    const displayName = personName(row);
    const normalizedName = normalizeText(displayName);
    const fullName = normalizeText([row.surname, row.middle_name, row.first_name].filter(Boolean).join(' '));
    const normalizedAliases = aliases.map(normalizeText).filter(Boolean);

    if (!normalizedQuery) return 0;
    if (normalizedName === normalizedQuery || fullName === normalizedQuery || normalizedAliases.includes(normalizedQuery)) return 1;
    if (normalizedName.includes(normalizedQuery) || fullName.includes(normalizedQuery)) return 0.88;
    if (normalizedAliases.some((alias) => alias.includes(normalizedQuery) || normalizedQuery.includes(alias))) return 0.9;

    const tokens = normalizedQuery.split(' ').filter(Boolean);
    const haystack = [normalizedName, fullName, ...normalizedAliases].join(' ');
    const matched = tokens.filter((token) => haystack.includes(token)).length;
    return tokens.length ? Math.min(0.82, matched / tokens.length) : 0;
}

function levenshtein(a, b) {
    const left = normalizeText(a);
    const right = normalizeText(b);
    if (!left) return right.length;
    if (!right) return left.length;
    const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= left.length; i += 1) {
        for (let j = 1; j <= right.length; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    return dp[left.length][right.length];
}

function fuzzyScore(row, queryText) {
    const name = personName(row);
    const distance = levenshtein(queryText, name);
    const maxLength = Math.max(normalizeText(queryText).length, normalizeText(name).length, 1);
    const similarity = 1 - distance / maxLength;
    return similarity >= 0.72 ? similarity * 0.78 : 0;
}

function mergeCandidate(map, row) {
    const id = Number(row.id);
    if (!map.has(id)) {
        map.set(id, {
            ...row,
            aliases: [],
            matched_aliases: [],
        });
    }
    const existing = map.get(id);
    if (row.alias) {
        existing.aliases.push(row.alias);
        existing.matched_aliases.push(row.alias);
    }
    return existing;
}

async function searchPeopleByName({ clanId, name, limit = 10 }) {
    const cleanedName = cleanHumanName(name);
    const normalizedName = normalizeText(cleanedName || name);
    if (!clanId || !normalizedName) return [];

    const like = `%${cleanedName || name}%`;
    const compactLike = `%${normalizedName}%`;
    const candidates = new Map();

    const [peopleRows] = await db.query(
        `
        SELECT p.id, p.clan_id, p.display_name, p.first_name, p.middle_name, p.surname,
               p.gender, p.birth_date, p.death_date, p.generation
        FROM people p
        WHERE p.clan_id = ?
          AND (
            p.display_name LIKE ?
            OR CONCAT_WS(' ', p.surname, p.middle_name, p.first_name) LIKE ?
            OR p.first_name LIKE ?
            OR p.surname LIKE ?
          )
        ORDER BY p.generation ASC, p.id ASC
        LIMIT 50
        `,
        [clanId, like, like, like, like]
    );

    for (const row of peopleRows) mergeCandidate(candidates, row);

    if (candidates.size < 3) {
        const [fallbackRows] = await db.query(
            `
            SELECT p.id, p.clan_id, p.display_name, p.first_name, p.middle_name, p.surname,
                   p.gender, p.birth_date, p.death_date, p.generation
            FROM people p
            WHERE p.clan_id = ?
            ORDER BY p.generation ASC, p.id ASC
            LIMIT 500
            `,
            [clanId]
        );
        for (const row of fallbackRows) {
            const score = fuzzyScore(row, cleanedName || name);
            if (score > 0) {
                const merged = mergeCandidate(candidates, row);
                merged.fuzzy_score = Math.max(Number(merged.fuzzy_score || 0), score);
            }
        }
    }

    if (await tableExists('person_aliases')) {
        try {
            const [aliasRows] = await db.query(
                `
                SELECT p.id, p.clan_id, p.display_name, p.first_name, p.middle_name, p.surname,
                       p.gender, p.birth_date, p.death_date, p.generation,
                       pa.alias
                FROM person_aliases pa
                INNER JOIN people p ON p.id = pa.person_id
                WHERE pa.clan_id = ?
                  AND (pa.normalized_alias LIKE ? OR pa.alias LIKE ?)
                ORDER BY pa.is_primary DESC, p.id ASC
                LIMIT 50
                `,
                [clanId, compactLike, like]
            );
            for (const row of aliasRows) mergeCandidate(candidates, row);
        } catch (error) {
            console.warn('person_aliases search skipped:', error.message);
        }
    }

    return [...candidates.values()]
        .map((row) => ({
            ...row,
            name: personName(row),
            score: scorePerson(row, cleanedName || name, row.aliases),
            fuzzy_score: Number(row.fuzzy_score || 0),
        }))
        .map((row) => ({ ...row, score: Math.max(row.score, row.fuzzy_score) }))
        .filter((row) => row.score > 0.25)
        .sort((a, b) => b.score - a.score || Number(a.display_order || a.id) - Number(b.display_order || b.id))
        .slice(0, limit);
}

async function resolvePerson({ clanId, names, limit = 5 }) {
    const rawNames = Array.isArray(names) ? names : [names];
    const uniqueNames = [...new Set(rawNames.map((item) => cleanHumanName(item)).filter(Boolean))];
    const all = [];
    const seen = new Set();

    for (const name of uniqueNames) {
        const rows = await searchPeopleByName({ clanId, name, limit });
        for (const row of rows) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            all.push(row);
        }
    }

    all.sort((a, b) => b.score - a.score);
    if (!all.length) return { status: 'not_found', candidates: [] };

    const [first, second] = all;
    if (second && first.score < 0.98 && Math.abs(first.score - second.score) < 0.08) {
        return { status: 'ambiguous', candidates: all.slice(0, limit) };
    }

    return { status: 'resolved', person: first, candidates: all.slice(0, limit) };
}

module.exports = {
    normalizeText,
    cleanHumanName,
    searchPeopleByName,
    resolvePerson,
    tableExists,
};
