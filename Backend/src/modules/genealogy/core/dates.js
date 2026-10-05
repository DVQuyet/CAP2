// Ngày tháng trong gia phả thường không đầy đủ: chỉ biết năm, tháng, hoặc chỉ ước lượng.
// Mỗi ngày được quy về một khoảng [start, end] (đơn vị: ngày kể từ 1970-01-01, UTC) để so sánh
// "chắc chắn trước/sau" mà không coi ngày giả định 01-01 là ngày thật.

const DATE_PRECISIONS = ['exact', 'month', 'year', 'approximate', 'unknown'];
const APPROXIMATE_YEAR_SPAN = 5;
const DAY_MS = 86400000;

const normalizePrecision = (value) => {
    const text = String(value || '').trim().toLowerCase();
    return DATE_PRECISIONS.includes(text) ? text : 'exact';
};

const dayNumber = (year, month, day) => Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);

const lastDayOfMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const splitDateValue = (value) => {
    if (value === undefined || value === null || value === '') return null;
    if (value instanceof Date) {
        // mysql2 trả cột DATE thành nửa đêm theo giờ địa phương: đọc theo giờ địa phương để không lệch ngày.
        if (Number.isNaN(value.getTime())) return null;
        return {
            year: value.getFullYear(),
            month: value.getMonth() + 1,
            day: value.getDate(),
        };
    }
    const text = String(value).trim();
    const match = text.match(/^(\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = match[2] ? Number(match[2]) : null;
    const day = match[3] ? Number(match[3]) : null;
    if (!Number.isFinite(year) || year <= 0) return null;
    if (month !== null && (month < 1 || month > 12)) return null;
    if (day !== null && (day < 1 || day > 31)) return null;
    return { year, month, day };
};

// Trả về null nếu không có ngày hoặc độ chính xác là "unknown".
const parseHistoricalDate = (value, precision = 'exact') => {
    const parts = splitDateValue(value);
    if (!parts) return null;
    let level = normalizePrecision(precision);
    if (level === 'unknown') return null;
    if (level === 'exact' && (parts.month === null || parts.day === null)) {
        level = parts.month === null ? 'year' : 'month';
    }
    if (level === 'month' && parts.month === null) level = 'year';

    const { year } = parts;
    const month = parts.month || 1;
    const day = parts.day || 1;
    let start;
    let end;
    if (level === 'exact') {
        start = dayNumber(year, month, day);
        end = start;
    } else if (level === 'month') {
        start = dayNumber(year, month, 1);
        end = dayNumber(year, month, lastDayOfMonth(year, month));
    } else if (level === 'year') {
        start = dayNumber(year, 1, 1);
        end = dayNumber(year, 12, 31);
    } else {
        start = dayNumber(year - APPROXIMATE_YEAR_SPAN, 1, 1);
        end = dayNumber(year + APPROXIMATE_YEAR_SPAN, 12, 31);
    }
    return {
        year,
        month: parts.month,
        day: parts.day,
        precision: level,
        uncertain: level === 'approximate',
        start,
        end,
    };
};

const todayDayNumber = (now = new Date()) =>
    dayNumber(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());

const isDefinitelyBefore = (a, b, toleranceDays = 0) => Boolean(a && b && a.end + toleranceDays < b.start);

const isDefinitelyAfter = (a, b, toleranceDays = 0) => Boolean(a && b && a.start > b.end + toleranceDays);

const sameExactDay = (a, b) => Boolean(
    a && b && a.precision === 'exact' && b.precision === 'exact' && a.start === b.start
);

// Khoảng tuổi (năm) của người sinh ngày `birth` tại thời điểm `at`.
const ageRangeAt = (birth, at) => {
    if (!birth || !at) return null;
    return {
        min: (at.start - birth.end) / 365.2425,
        max: (at.end - birth.start) / 365.2425,
    };
};

// So sánh hai ngày sinh: -1 nếu a chắc chắn trước b, 1 nếu chắc chắn sau, null nếu không phân định được.
const compareBirth = (a, b) => {
    if (isDefinitelyBefore(a, b)) return -1;
    if (isDefinitelyAfter(a, b)) return 1;
    return null;
};

const personBirth = (person) => parseHistoricalDate(person?.birth_date, person?.birth_date_precision);
const personDeath = (person) => parseHistoricalDate(person?.death_date, person?.death_date_precision);

const LIVING_AGE_LIMIT_YEARS = 120;

// 'living' | 'deceased' | 'unknown'. is_living = NULL nghĩa là chưa rõ.
// Người được đánh dấu còn sống nhưng sinh quá 120 năm trước được coi là đã mất (dữ liệu nhập thiếu).
const lifeStatus = (person, now = new Date()) => {
    if (!person) return 'unknown';
    if (person.death_date) return 'deceased';
    const raw = person.is_living;
    if (raw === null || raw === undefined || raw === '') {
        return 'unknown';
    }
    if (Number(raw) === 0) return 'deceased';
    const birth = personBirth(person);
    if (birth) {
        const age = ageRangeAt(birth, { start: todayDayNumber(now), end: todayDayNumber(now) });
        if (age && age.min > LIVING_AGE_LIMIT_YEARS) return 'deceased';
    }
    return 'living';
};

const formatDateForMessage = (parsed) => {
    if (!parsed) return 'không rõ';
    if (parsed.precision === 'year') return `năm ${parsed.year}`;
    if (parsed.precision === 'approximate') return `khoảng năm ${parsed.year}`;
    if (parsed.precision === 'month') return `tháng ${parsed.month}/${parsed.year}`;
    return `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}/${parsed.year}`;
};

module.exports = {
    DATE_PRECISIONS,
    normalizePrecision,
    parseHistoricalDate,
    todayDayNumber,
    isDefinitelyBefore,
    isDefinitelyAfter,
    sameExactDay,
    ageRangeAt,
    compareBirth,
    personBirth,
    personDeath,
    lifeStatus,
    formatDateForMessage,
    LIVING_AGE_LIMIT_YEARS,
};
