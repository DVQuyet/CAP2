// Định dạng dùng chung cho câu trả lời của trợ lý: ngày kiểu Việt theo độ chính xác, tuổi,
// và mô tả ngắn một người (đời, năm sinh, cha mẹ) để phân biệt người trùng tên.

const pad2 = (value) => String(value).padStart(2, '0');

// Trả { year, month, day } từ Date (mysql2 trả DATE là nửa đêm giờ địa phương) hoặc chuỗi 'YYYY-MM-DD...'.
function dateParts(value) {
    if (!value) return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
    }
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

// 25/10/1940
function formatDateVN(value) {
    const parts = dateParts(value);
    return parts ? `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}` : null;
}

// Theo độ chính xác ghi trong gia phả: "ngày 25/10/1940", "tháng 10/1940", "năm 1940", "khoảng năm 1940".
function formatDateWithPrecision(value, precision = 'exact') {
    const parts = dateParts(value);
    if (!parts) return null;
    if (precision === 'unknown') return null;
    if (precision === 'year') return `năm ${parts.year}`;
    if (precision === 'approximate') return `khoảng năm ${parts.year}`;
    if (precision === 'month') return `tháng ${pad2(parts.month)}/${parts.year}`;
    return `ngày ${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
}

function birthYearOf(person) {
    const parts = dateParts(person?.birth_date);
    return parts && person?.birth_date_precision !== 'unknown' ? parts.year : null;
}

// Tuổi (theo năm dương lịch, trừ 1 nếu chưa tới sinh nhật khi biết đủ ngày). Null khi không đủ dữ liệu.
function ageOf(person, now = new Date()) {
    const birth = dateParts(person?.birth_date);
    const precision = person?.birth_date_precision || 'exact';
    if (!birth || precision === 'unknown') return null;
    const end = Number(person?.is_living) === 0 || person?.death_date ? dateParts(person?.death_date) : {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
    };
    if (!end) return null;
    let age = end.year - birth.year;
    if (precision === 'exact' && (end.month < birth.month || (end.month === birth.month && end.day < birth.day))) age -= 1;
    return age >= 0 && age < 150 ? { age, approximate: precision !== 'exact' } : null;
}

// Cha, mẹ, vợ/chồng, con của một người theo đồ thị chatbot (relationshipEngine.loadClanGraph).
function relativesOf(graph, personId) {
    const id = Number(personId);
    const pick = (types) => (graph?.adjacency?.get(id) || [])
        .filter((edge) => types.includes(edge.type))
        .map((edge) => graph.people.get(Number(edge.to)))
        .filter(Boolean);
    const unique = (list) => [...new Map(list.map((person) => [Number(person.id), person])).values()];
    return {
        father: pick(['father'])[0] || null,
        mother: pick(['mother'])[0] || null,
        adoptiveParents: unique(pick(['adopted_parent'])),
        spouses: unique(pick(['spouse'])),
        children: unique(pick(['son', 'daughter', 'child', 'adopted_son', 'adopted_daughter', 'adopted_child'])),
    };
}

// "Đinh Văn Hùng (đời 3, sinh 1960, con ông Đinh Văn Hòa và bà Trần Thị Lan)"
function describePersonBrief(person, graph, nameOf) {
    if (!person) return '';
    const name = nameOf(person);
    const relatives = graph ? relativesOf(graph, person.id) : null;
    const parents = relatives ? [relatives.father, relatives.mother].filter(Boolean).map(nameOf) : [];
    const details = [
        person.generation ? `đời ${person.generation}` : null,
        birthYearOf(person) ? `sinh ${birthYearOf(person)}` : null,
        parents.length ? `con của ${parents.join(' và ')}` : null,
    ].filter(Boolean);
    return details.length ? `${name} (${details.join(', ')})` : name;
}

function capitalizeFirst(text) {
    const value = String(text || '');
    return value ? value.charAt(0).toLocaleUpperCase('vi-VN') + value.slice(1) : value;
}

module.exports = {
    dateParts,
    formatDateVN,
    formatDateWithPrecision,
    birthYearOf,
    ageOf,
    relativesOf,
    describePersonBrief,
    capitalizeFirst,
};
