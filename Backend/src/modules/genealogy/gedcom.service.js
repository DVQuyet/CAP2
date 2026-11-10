// Xuất gia phả sang GEDCOM 5.5.1 (UTF-8). Hàm thuần: nhận dữ liệu đã đọc từ DB, trả chuỗi GEDCOM.
// Chỉ xuất: không có SĐT, email, địa chỉ. Nhập GEDCOM chưa làm.
const EOL = '\r\n';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MAX_VALUE_LENGTH = 200; // GEDCOM giới hạn 255 ký tự/dòng; cắt sớm bằng CONC.

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

// '@' trong giá trị phải viết '@@'.
const escapeAt = (value) => String(value).replace(/@/g, '@@');

// Ghi 1 giá trị có thể nhiều dòng/dài: xuống dòng -> CONT, quá dài -> CONC (không cắt giữa cặp surrogate).
function pushValueLines(lines, level, tag, value) {
    const paragraphs = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
    paragraphs.forEach((paragraph, index) => {
        const chars = Array.from(escapeAt(paragraph));
        let first = true;
        let offset = 0;
        do {
            const chunk = chars.slice(offset, offset + MAX_VALUE_LENGTH).join('');
            offset += MAX_VALUE_LENGTH;
            if (index === 0 && first) lines.push(`${level} ${tag}${chunk ? ` ${chunk}` : ''}`);
            else lines.push(`${level + 1} ${first ? 'CONT' : 'CONC'}${chunk ? ` ${chunk}` : ''}`);
            first = false;
        } while (offset < chars.length);
    });
}

const toParts = (value) => {
    if (value === undefined || value === null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
    }
    const match = String(value).trim().match(/^(\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = match[2] ? Number(match[2]) : null;
    const day = match[3] ? Number(match[3]) : null;
    if (!year || (month !== null && (month < 1 || month > 12)) || (day !== null && (day < 1 || day > 31))) return null;
    return { year, month, day };
};

// Ngày theo độ chính xác: exact -> "15 NOV 1940", month -> "NOV 1940", year -> "1940", approximate -> "ABT 1940".
// unknown hoặc không có ngày -> null.
function formatGedcomDate(value, precision) {
    const parts = toParts(value);
    if (!parts) return null;
    let level = String(precision || 'exact').trim().toLowerCase();
    if (level === 'unknown') return null;
    if (level === 'exact' && (parts.month === null || parts.day === null)) level = parts.month === null ? 'year' : 'month';
    if (level === 'month' && parts.month === null) level = 'year';
    const year = String(parts.year);
    if (level === 'exact') return `${parts.day} ${MONTHS[parts.month - 1]} ${year}`;
    if (level === 'month') return `${MONTHS[parts.month - 1]} ${year}`;
    if (level === 'approximate') return `ABT ${year}`;
    return year;
}

// Tên Việt: họ đứng đầu. Ưu tiên cột surname/middle_name/first_name; thiếu thì tách display_name (từ đầu là họ).
function splitVietnameseName(person) {
    const surname = clean(person.surname);
    const given = clean([person.middle_name, person.first_name].filter(Boolean).join(' '));
    if (surname || given) return { surname, given };
    const tokens = clean(person.display_name).split(' ').filter(Boolean);
    if (!tokens.length) return { surname: '', given: '' };
    if (tokens.length === 1) return { surname: '', given: tokens[0] };
    return { surname: tokens[0], given: tokens.slice(1).join(' ') };
}

const noSlash = (text) => escapeAt(String(text).replace(/\//g, ' ').replace(/\s+/g, ' ').trim());

function buildIndividual(person, ids, famsOf, famcOf) {
    const lines = [`0 @${ids.person(person.id)}@ INDI`];
    const { surname, given } = splitVietnameseName(person);
    if (surname || given) {
        lines.push(`1 NAME ${[noSlash(given), `/${noSlash(surname)}/`].filter(Boolean).join(' ')}`);
        if (given) lines.push(`2 GIVN ${noSlash(given)}`);
        if (surname) lines.push(`2 SURN ${noSlash(surname)}`);
    }
    if (Number(person.gender) === 1) lines.push('1 SEX M');
    else if (Number(person.gender) === 2) lines.push('1 SEX F');

    const birth = formatGedcomDate(person.birth_date, person.birth_date_precision);
    const hometown = clean(person.hometown);
    if (birth || hometown) {
        lines.push('1 BIRT');
        if (birth) lines.push(`2 DATE ${birth}`);
        if (hometown) pushValueLines(lines, 2, 'PLAC', hometown);
    }
    const death = formatGedcomDate(person.death_date, person.death_date_precision);
    if (death) {
        lines.push('1 DEAT', `2 DATE ${death}`);
    } else if (person.death_date || (person.is_living !== null && person.is_living !== undefined && Number(person.is_living) === 0)) {
        lines.push('1 DEAT Y');
    }
    (famcOf.get(person.id) || []).forEach((famId) => lines.push(`1 FAMC @${ids.family(famId)}@`));
    (famsOf.get(person.id) || []).forEach((famId) => lines.push(`1 FAMS @${ids.family(famId)}@`));
    const bio = String(person.bio ?? '').trim();
    if (bio) pushValueLines(lines, 1, 'NOTE', bio);
    return lines;
}

function buildGedcom({ clanName = '', people = [], families = [], children = [], now = new Date(), appName = 'Gia Pha Viet' } = {}) {
    const ids = {
        person: (id) => `I${id}`,
        family: (id) => `F${id}`,
    };
    const personById = new Map(people.map((person) => [Number(person.id), { ...person, id: Number(person.id) }]));

    // Chỉ giữ gia đình có ít nhất một người thuộc dòng họ; quan hệ tới người ngoài tập (đã lưu trữ) bị bỏ.
    const famList = [];
    const famsOf = new Map();
    const famcOf = new Map();
    const push = (map, key, value) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(value);
    };
    families.forEach((family) => {
        const fatherId = personById.has(Number(family.father_id)) ? Number(family.father_id) : null;
        const motherId = personById.has(Number(family.mother_id)) ? Number(family.mother_id) : null;
        const kids = children
            .filter((link) => Number(link.family_id) === Number(family.id) && personById.has(Number(link.person_id)))
            .map((link) => Number(link.person_id));
        if (!fatherId && !motherId && !kids.length) return;
        famList.push({ family, fatherId, motherId, kids: [...new Set(kids)] });
        if (fatherId) push(famsOf, fatherId, family.id);
        if (motherId) push(famsOf, motherId, family.id);
        famList[famList.length - 1].kids.forEach((kidId) => push(famcOf, kidId, family.id));
    });

    const date = `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
    const lines = [
        '0 HEAD',
        '1 SOUR GIAPHAVIET',
        `2 NAME ${appName}`,
        '1 GEDC',
        '2 VERS 5.5.1',
        '2 FORM LINEAGE-LINKED',
        '1 CHAR UTF-8',
        '1 LANG Vietnamese',
        `1 DATE ${date}`,
        '1 SUBM @SUBM1@',
    ];
    if (clean(clanName)) pushValueLines(lines, 1, 'FILE', `${clean(clanName)}.ged`);
    lines.push('0 @SUBM1@ SUBM', `1 NAME ${noSlash(appName)}`);

    [...personById.values()]
        .sort((a, b) => a.id - b.id)
        .forEach((person) => lines.push(...buildIndividual(person, ids, famsOf, famcOf)));

    famList.forEach(({ family, fatherId, motherId, kids }) => {
        lines.push(`0 @${ids.family(family.id)}@ FAM`);
        if (fatherId) lines.push(`1 HUSB @${ids.person(fatherId)}@`);
        if (motherId) lines.push(`1 WIFE @${ids.person(motherId)}@`);
        kids.forEach((kidId) => lines.push(`1 CHIL @${ids.person(kidId)}@`));
        const marriage = formatGedcomDate(family.marriage_date, family.marriage_date_precision);
        if (marriage) lines.push('1 MARR', `2 DATE ${marriage}`);
    });

    lines.push('0 TRLR');
    return lines.join(EOL) + EOL;
}

module.exports = { buildGedcom, formatGedcomDate, splitVietnameseName };
