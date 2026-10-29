// Dựng "dữ kiện" để AI soạn tiểu sử / lời tưởng niệm từ chính dữ liệu trên cây gia phả.
// Nguyên tắc: chỉ lấy thứ công khai trong dòng họ; KHÔNG lấy số điện thoại, email, địa chỉ, zalo, facebook, ghi chú nội bộ;
// quan hệ đặt chế độ "chỉ quản lý xem" (families.visibility = 'managers') bị ẩn với người xem không phải admin/manager.
const db = require('../../config/db');
const { canSeeSensitiveRelations } = require('../genealogy/treeVisibility');

const MAX_BIO_CHARS = 600;
const MAX_MEMORIES = 5;
const MAX_EVENTS = 5;
const MAX_CHILDREN = 20;

const pad2 = (value) => String(value).padStart(2, '0');

// Ngày dạng dd/mm/yyyy (hoặc mm/yyyy, yyyy) tùy độ chính xác đã ghi trong hồ sơ: không in ngày tháng mà hồ sơ chỉ biết năm.
function formatDateByPrecision(iso, precision) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!match) return null;
    const [, year, month, day] = match;
    const level = String(precision || 'exact');
    if (level === 'unknown') return null;
    if (level === 'year' || level === 'approximate') return year;
    if (level === 'month') return `${month}/${year}`;
    return `${day}/${month}/${year}`;
}

const yearOf = (iso) => (/^(\d{4})/.exec(String(iso || '')) || [])[1] || null;

function cleanText(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, max) : null;
}

async function loadNames(ids) {
    const unique = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (!unique.length) return new Map();
    const [rows] = await db.query(
        `SELECT id, display_name FROM people WHERE id IN (${unique.map(() => '?').join(',')})`,
        unique
    );
    return new Map(rows.map((row) => [Number(row.id), String(row.display_name || '').trim()]));
}

// viewer: req.user (cần role_id để quyết định có thấy quan hệ nhạy cảm không).
async function buildBiographyFacts(personId, viewer) {
    const [personRows] = await db.query(
        `SELECT p.id, p.clan_id, p.display_name, p.gender, p.generation, p.branch, p.hometown, p.bio, p.is_living,
                DATE_FORMAT(p.birth_date, '%Y-%m-%d') AS birth_iso, p.birth_date_precision,
                DATE_FORMAT(p.death_date, '%Y-%m-%d') AS death_iso, p.death_date_precision,
                p.death_anniversary_lunar, c.clan_name
         FROM people p
         LEFT JOIN clans c ON c.id = p.clan_id
         WHERE p.id = ? LIMIT 1`,
        [personId]
    );
    const person = personRows[0];
    if (!person) return null;

    const [parentRows] = await db.query(
        `SELECT f.father_id, f.mother_id, f.visibility
         FROM children ch JOIN families f ON f.id = ch.family_id
         WHERE ch.person_id = ? AND f.clan_id = ?`,
        [personId, person.clan_id]
    );
    const [unionRows] = await db.query(
        `SELECT f.id, f.father_id, f.mother_id, f.visibility
         FROM families f
         WHERE f.clan_id = ? AND (f.father_id = ? OR f.mother_id = ?)
         ORDER BY f.id ASC`,
        [person.clan_id, personId, personId]
    );

    const seeAll = canSeeSensitiveRelations(viewer);
    const visibleUnions = unionRows.filter((family) => seeAll || String(family.visibility || 'public') !== 'managers');
    const visibleUnionIds = visibleUnions.map((family) => Number(family.id));

    let childRows = [];
    if (visibleUnionIds.length) {
        [childRows] = await db.query(
            `SELECT ch.person_id, DATE_FORMAT(p.birth_date, '%Y-%m-%d') AS birth_iso
             FROM children ch JOIN people p ON p.id = ch.person_id
             WHERE ch.family_id IN (${visibleUnionIds.map(() => '?').join(',')})
             ORDER BY ch.sort_order ASC, p.birth_date ASC, ch.id ASC
             LIMIT ${MAX_CHILDREN}`,
            visibleUnionIds
        );
    }

    const names = await loadNames([
        ...parentRows.flatMap((row) => [row.father_id, row.mother_id]),
        ...visibleUnions.flatMap((row) => [row.father_id, row.mother_id]),
        ...childRows.map((row) => row.person_id),
    ]);

    const parents = [];
    for (const row of parentRows) {
        if (!seeAll && String(row.visibility || 'public') === 'managers') continue;
        if (row.father_id && names.get(Number(row.father_id))) parents.push({ relation: 'father', name: names.get(Number(row.father_id)) });
        if (row.mother_id && names.get(Number(row.mother_id))) parents.push({ relation: 'mother', name: names.get(Number(row.mother_id)) });
    }

    const spouses = [];
    for (const family of visibleUnions) {
        const otherId = Number(family.father_id) === Number(personId) ? family.mother_id : family.father_id;
        const name = otherId ? names.get(Number(otherId)) : null;
        if (name && !spouses.some((item) => item.name === name)) spouses.push({ name });
    }

    const children = childRows
        .map((row) => ({ name: names.get(Number(row.person_id)), birth_year: yearOf(row.birth_iso) }))
        .filter((child) => child.name);

    // Chỉ kỷ niệm đã duyệt, công khai cả dòng họ, do chính người này viết.
    const [memoryRows] = await db.query(
        `SELECT title, content FROM family_memories
         WHERE clan_id = ? AND author_person_id = ? AND status = 'approved' AND visibility = 'clan'
         ORDER BY approved_at DESC, id DESC LIMIT ${MAX_MEMORIES}`,
        [person.clan_id, personId]
    ).catch(() => [[]]);
    const [eventRows] = await db.query(
        `SELECT title, DATE_FORMAT(event_date, '%d/%m/%Y') AS date_text FROM calendar_events
         WHERE clan_id = ? AND person_id = ? AND visibility = 'global'
         ORDER BY event_date DESC LIMIT ${MAX_EVENTS}`,
        [person.clan_id, personId]
    ).catch(() => [[]]);

    const anniversary = /^\d{1,2}\/\d{1,2}$/.test(String(person.death_anniversary_lunar || '').trim())
        ? String(person.death_anniversary_lunar).trim()
        : null;

    return {
        person: {
            name: String(person.display_name || '').trim(),
            gender: Number(person.gender) === 2 ? 'female' : Number(person.gender) === 1 ? 'male' : 'unknown',
            generation: Number(person.generation) || null,
            branch: person.branch ? String(person.branch) : null,
            clan: cleanText(person.clan_name, 120),
            is_living: Number(person.is_living) !== 0 && !person.death_iso,
            birth: formatDateByPrecision(person.birth_iso, person.birth_date_precision),
            death: formatDateByPrecision(person.death_iso, person.death_date_precision),
            death_anniversary_lunar: anniversary,
            hometown: cleanText(person.hometown, 150),
            existing_bio: cleanText(person.bio, MAX_BIO_CHARS),
        },
        parents,
        spouses,
        children,
        memories: memoryRows.map((row) => ({ title: cleanText(row.title, 120), snippet: cleanText(row.content, 200) })).filter((row) => row.title || row.snippet),
        events: eventRows.map((row) => ({ title: cleanText(row.title, 120), date: row.date_text })).filter((row) => row.title),
    };
}

module.exports = { buildBiographyFacts, formatDateByPrecision };
