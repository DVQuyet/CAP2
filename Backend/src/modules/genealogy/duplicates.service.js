// Phát hiện người trùng lặp trong một dòng họ (chỉ đọc, không tự gộp).
// Chấm điểm theo tên chuẩn hóa (bỏ dấu), năm sinh theo độ chính xác, giới tính, cha mẹ, đời.
// Tránh O(n^2) toàn dòng họ: chỉ so các cặp trong cùng "xô" (tên gọi cuối / họ + chữ cái đầu tên gọi).
const db = require('../../config/db');
const { dateParts, formatDateWithPrecision } = require('../chatbot/chatbotFormat');

const MIN_SCORE = 50;
const MAX_BUCKET_SIZE = 400;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function personName(p) {
    return clean(p?.display_name) || clean([p?.surname, p?.middle_name, p?.first_name].filter(Boolean).join(' '));
}

// "Đinh  Văn Ân" -> "dinh van an"
function normalizeName(name) {
    return clean(name)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function levenshteinAtMost1(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Năm sinh/mất theo độ chính xác: 'unknown' hoặc thiếu ngày -> null.
function yearOf(date, precision) {
    if (!date || precision === 'unknown') return null;
    const parts = dateParts(date);
    return parts ? parts.year : null;
}

function isExactDate(date, precision) {
    return Boolean(date) && (!precision || precision === 'exact');
}

function sameDay(a, b) {
    return String(a).slice(0, 10) === String(b).slice(0, 10);
}

// ctx: { normName(id), parentsOf(id) -> {father, mother}, isDirectKin(a,b) }
function scorePair(a, b, ctx) {
    const reasons = [];
    const add = (code, points) => reasons.push({ code, points });

    const ga = Number(a.gender) || 0;
    const gb = Number(b.gender) || 0;
    if (ga && gb && ga !== gb) return null;
    if (ctx.isDirectKin(a.id, b.id)) return null;

    const na = ctx.normName(a.id);
    const nb = ctx.normName(b.id);
    if (!na || !nb) return null;
    const ta = na.split(' ');
    const tb = nb.split(' ');
    if (na === nb) add('name_exact', 50);
    else if (levenshteinAtMost1(na, nb)) add('name_typo', 35);
    else if (ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1]) add('name_similar', 25);
    else return null;

    if (ga && gb) add('same_gender', 5);

    const ya = yearOf(a.birth_date, a.birth_date_precision);
    const yb = yearOf(b.birth_date, b.birth_date_precision);
    if (ya && yb) {
        const diff = Math.abs(ya - yb);
        if (diff === 0) add('birth_year_same', 20);
        else if (diff <= 2) add('birth_year_close', 8);
        else if (diff > 10) return null;
        else if (diff > 5) add('birth_year_far', -25);
        if (diff === 0 && isExactDate(a.birth_date, a.birth_date_precision) && isExactDate(b.birth_date, b.birth_date_precision) && sameDay(a.birth_date, b.birth_date)) {
            add('birth_date_same', 10);
        }
    }
    const da = yearOf(a.death_date, a.death_date_precision);
    const db2 = yearOf(b.death_date, b.death_date_precision);
    if (da && db2 && Math.abs(da - db2) > 2) add('death_year_far', -15);

    const pa = ctx.parentsOf(a.id);
    const pb = ctx.parentsOf(b.id);
    const sharedFather = pa.father && pa.father === pb.father;
    const sharedMother = pa.mother && pa.mother === pb.mother;
    if (sharedFather && sharedMother) add('same_parents', 25);
    else if (sharedFather || sharedMother) add('shared_parent', 15);
    else {
        const similarParent = (x, y) => x && y && x !== y && ctx.normName(x) && ctx.normName(x) === ctx.normName(y);
        if (similarParent(pa.father, pb.father) || similarParent(pa.mother, pb.mother)) add('similar_parents', 15);
    }

    const gena = Number(a.generation) || 0;
    const genb = Number(b.generation) || 0;
    if (gena && genb) {
        if (gena === genb) add('same_generation', 8);
        else if (Math.abs(gena - genb) >= 2) add('generation_far', -20);
    }

    const score = Math.max(0, Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0)));
    return { score, reasons };
}

function confidenceOf(score) {
    if (score >= 85) return 'high';
    if (score >= 65) return 'medium';
    return 'low';
}

function buildContext({ people, families, children }) {
    const byId = new Map(people.map((p) => [Number(p.id), p]));
    const normCache = new Map();
    const normName = (id) => {
        const key = Number(id);
        if (!normCache.has(key)) normCache.set(key, byId.has(key) ? normalizeName(personName(byId.get(key))) : '');
        return normCache.get(key);
    };
    const familyById = new Map(families.map((f) => [Number(f.id), f]));
    const parents = new Map();
    const kin = new Set();
    const pairKey = (x, y) => `${Math.min(x, y)}-${Math.max(x, y)}`;
    children.forEach((row) => {
        const family = familyById.get(Number(row.family_id));
        if (!family) return;
        const childId = Number(row.person_id);
        const father = family.father_id ? Number(family.father_id) : null;
        const mother = family.mother_id ? Number(family.mother_id) : null;
        const cur = parents.get(childId) || { father: null, mother: null };
        parents.set(childId, { father: cur.father || father, mother: cur.mother || mother });
        if (father) kin.add(pairKey(father, childId));
        if (mother) kin.add(pairKey(mother, childId));
    });
    families.forEach((f) => {
        if (f.father_id && f.mother_id) kin.add(pairKey(Number(f.father_id), Number(f.mother_id)));
    });
    return {
        normName,
        parentsOf: (id) => parents.get(Number(id)) || { father: null, mother: null },
        isDirectKin: (x, y) => kin.has(pairKey(Number(x), Number(y))),
    };
}

// Gom người vào xô để chỉ so sánh trong xô; xô quá lớn được chia nhỏ theo họ.
function buildBuckets(people, ctx) {
    const buckets = new Map();
    const push = (key, id) => {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(id);
    };
    people.forEach((p) => {
        const tokens = ctx.normName(p.id).split(' ').filter(Boolean);
        if (tokens.length < 2) return;
        const first = tokens[0];
        const last = tokens[tokens.length - 1];
        push(`g:${last}`, Number(p.id));
        push(`s:${first}:${last[0]}`, Number(p.id));
    });
    const result = [];
    buckets.forEach((ids, key) => {
        if (ids.length < 2) return;
        if (ids.length <= MAX_BUCKET_SIZE) { result.push(ids); return; }
        const sub = new Map();
        ids.forEach((id) => {
            const k = ctx.normName(id).split(' ')[0];
            if (!sub.has(k)) sub.set(k, []);
            sub.get(k).push(id);
        });
        sub.forEach((list) => { if (list.length >= 2 && list.length <= MAX_BUCKET_SIZE) result.push(list); });
        void key;
    });
    return result;
}

// rows: { people, families, children }; dismissed: Set("a-b") với a<b.
function findDuplicateCandidates(rows, { dismissed = new Set(), minScore = MIN_SCORE } = {}) {
    const people = rows.people || [];
    const ctx = buildContext({ people, families: rows.families || [], children: rows.children || [] });
    const byId = new Map(people.map((p) => [Number(p.id), p]));
    const seen = new Set();
    const pairs = [];
    buildBuckets(people, ctx).forEach((ids) => {
        for (let i = 0; i < ids.length; i += 1) {
            for (let j = i + 1; j < ids.length; j += 1) {
                const lo = Math.min(ids[i], ids[j]);
                const hi = Math.max(ids[i], ids[j]);
                const key = `${lo}-${hi}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (dismissed.has(key)) continue;
                const result = scorePair(byId.get(lo), byId.get(hi), ctx);
                if (result && result.score >= minScore) {
                    pairs.push({ key, a_id: lo, b_id: hi, score: result.score, confidence: confidenceOf(result.score), reasons: result.reasons });
                }
            }
        }
    });
    pairs.sort((x, y) => y.score - x.score || x.a_id - y.a_id || x.b_id - y.b_id);
    return { pairs, ctx, byId };
}

function summarizePerson(p, ctx) {
    const parents = ctx.parentsOf(p.id);
    const parentName = (id) => (id ? personName(ctx.byId?.get(id)) || null : null);
    return {
        id: Number(p.id),
        name: personName(p),
        gender: Number(p.gender) || null,
        generation: p.generation ? Number(p.generation) : null,
        birth: formatDateWithPrecision(p.birth_date, p.birth_date_precision || 'exact'),
        death: formatDateWithPrecision(p.death_date, p.death_date_precision || 'exact'),
        is_living: p.is_living === null || p.is_living === undefined ? null : Number(p.is_living),
        father: parentName(parents.father),
        mother: parentName(parents.mother),
    };
}

function paginate(found, { limit = DEFAULT_LIMIT, offset = 0 } = {}) {
    const lim = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
    const off = Math.max(0, Number(offset) || 0);
    const ctx = { ...found.ctx, byId: found.byId };
    const page = found.pairs.slice(off, off + lim).map((pair) => ({
        key: pair.key,
        score: pair.score,
        confidence: pair.confidence,
        reasons: pair.reasons,
        a: summarizePerson(found.byId.get(pair.a_id), ctx),
        b: summarizePerson(found.byId.get(pair.b_id), ctx),
    }));
    return { total: found.pairs.length, limit: lim, offset: off, pairs: page };
}

const isMissingTable = (error) => error && (error.code === 'ER_NO_SUCH_TABLE' || /doesn't exist/i.test(error.message || ''));

async function ensureDuplicateDismissalsTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS genealogy_duplicate_dismissals (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            clan_id INT NOT NULL,
            person_a_id INT NOT NULL,
            person_b_id INT NOT NULL,
            account_id INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_gdd_pair (clan_id, person_a_id, person_b_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

// Thiếu bảng (chưa migrate) -> coi như chưa bỏ qua cặp nào.
async function loadDismissed(clanId) {
    try {
        const [rows] = await db.query(
            'SELECT person_a_id, person_b_id FROM genealogy_duplicate_dismissals WHERE clan_id = ?',
            [clanId]
        );
        return new Set(rows.map((r) => `${Math.min(r.person_a_id, r.person_b_id)}-${Math.max(r.person_a_id, r.person_b_id)}`));
    } catch (error) {
        if (isMissingTable(error)) return new Set();
        throw error;
    }
}

module.exports = {
    MIN_SCORE,
    normalizeName,
    scorePair,
    confidenceOf,
    buildContext,
    findDuplicateCandidates,
    paginate,
    ensureDuplicateDismissalsTable,
    loadDismissed,
    isMissingTable,
};
