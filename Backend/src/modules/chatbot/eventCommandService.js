// Đọc yêu cầu tạo sự kiện/lời nhắc bằng câu tự nhiên trong chatbot:
//   "nhắc tôi giỗ ông nội ngày 15/3 âm lịch", "thêm sự kiện họp họ ngày 20/10 lúc 8h, nhắc trước 3 ngày",
//   "đặt lịch đi tảo mộ ngày mai".
// Chỉ dựng bản nháp; người dùng bấm "Thêm vào lịch" thì giao diện mới gọi API lịch để lưu.

const TRIGGER_PATTERN = /(^|\s)(nhắc\s+(tôi|mình|em|giúp)|nhac\s+(toi|minh|em|giup)|thêm\s+(sự kiện|lịch|lời nhắc|nhắc)|them\s+(su kien|lich|loi nhac|nhac)|tạo\s+(sự kiện|lịch|lời nhắc|nhắc)|tao\s+(su kien|lich|loi nhac|nhac)|đặt\s+lịch|dat\s+lich|lên\s+lịch|len\s+lich|ghi\s+nhớ\s+ngày|ghi\s+nho\s+ngay|hẹn(?=\s+(?:họp|gặp|lịch))|hen(?=\s+(?:hop|gap|lich))|nhắc(?=\s+(?:giỗ|sinh\s+nhật))|nhac(?=\s+(?:gio|sinh\s+nhat)))(\s|$)/i;

const pad2 = (value) => String(value).padStart(2, '0');
const isoOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const isValidSolar = (year, month, day) => {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

function detectType(text) {
    const lower = text.toLowerCase();
    if (/gi[ỗo]\b|giỗ|ky nhat|kỵ nhật/.test(lower)) return 'death_anniversary';
    if (/sinh nh[ậa]t|sinh nhat/.test(lower)) return 'birthday';
    if (/h[ọo]p h[ọo]|họp|tảo mộ|tao mo|lễ|le hoi|cúng|cung/.test(lower)) return 'family';
    return 'personal';
}

// Thứ trong tuần: [mẫu, số thứ theo getDay() (0 = chủ nhật)]. Dùng lookahead vì \b không nhận ký tự có dấu.
const WEEKDAY_PATTERNS = [
    [/(?:chủ\s+nhật|chu\s+nhat)(?=\s|$|[,.;!?])/i, 0],
    [/(?:thứ\s+hai|thu\s+hai|thứ\s+2|thu\s+2)(?=\s|$|[,.;!?])/i, 1],
    [/(?:thứ\s+ba|thu\s+ba|thứ\s+3|thu\s+3)(?=\s|$|[,.;!?])/i, 2],
    [/(?:thứ\s+tư|thu\s+tu|thứ\s+4|thu\s+4)(?=\s|$|[,.;!?])/i, 3],
    [/(?:thứ\s+năm|thu\s+nam|thứ\s+5|thu\s+5)(?=\s|$|[,.;!?])/i, 4],
    [/(?:thứ\s+sáu|thu\s+sau|thứ\s+6|thu\s+6)(?=\s|$|[,.;!?])/i, 5],
    [/(?:thứ\s+bảy|thu\s+bay|thứ\s+7|thu\s+7)(?=\s|$|[,.;!?])/i, 6],
];
const NEXT_WEEK_PATTERN = /(?:tuần\s+sau|tuần\s+tới|tuan\s+sau|tuan\s+toi)(?=\s|$|[,.;!?])/i;

function extractWeekday(text, now) {
    for (const [pattern, weekday] of WEEKDAY_PATTERNS) {
        const match = text.match(pattern);
        if (!match) continue;
        const consumed = [match[0]];
        const nextWeek = text.match(NEXT_WEEK_PATTERN);
        let target;
        if (nextWeek) {
            // Tuần sau tính từ thứ hai của tuần kế tiếp (thứ hai = 0 ... chủ nhật = 6).
            consumed.push(nextWeek[0]);
            const sinceMonday = (now.getDay() + 6) % 7;
            target = addDays(now, 7 - sinceMonday + ((weekday + 6) % 7));
        } else {
            // Lần sắp tới của thứ đó, không tính hôm nay.
            target = addDays(now, ((weekday - now.getDay() + 7) % 7) || 7);
        }
        return { isoDate: isoOf(target), lunar: false, consumed };
    }
    return null;
}

// Trả về { isoDate, lunar, lunarText, consumed: [chuỗi đã dùng] } hoặc null.
function extractDate(text, now, lunarToSolar) {
    const consumed = [];
    const lunar = /(âm\s*lịch|am\s*lich|\bâm\b|\bam\b|ÂL\b)/i.test(text);
    if (lunar) consumed.push(text.match(/(âm\s*lịch|am\s*lich|\bâm\b|\bam\b|ÂL\b)/i)[0]);

    const weekday = extractWeekday(text, now);
    if (weekday) return weekday;

    // Câu giỗ/sinh nhật có thể chứa tên người ("giỗ Đinh Thị Mai"): chỉ nhận "ngày mai", không nhận "mai" đứng một mình.
    const bareMai = /giỗ|sinh nhật|sinh nhat/i.test(text) ? '' : '|\\bmai\\b';
    const relative = [
        [/\bhôm nay\b|\bhom nay\b/i, 0],
        [new RegExp(`\\bngày mai\\b|\\bngay mai\\b${bareMai}`, 'i'), 1],
        [/\bngày kia\b|\bngay kia\b|\bngày mốt\b|\bmốt\b/i, 2],
        [/\btuần sau\b|\btuan sau\b/i, 7],
    ];
    for (const [pattern, days] of relative) {
        const match = text.match(pattern);
        if (match) {
            consumed.push(match[0]);
            return { isoDate: isoOf(addDays(now, days)), lunar: false, consumed };
        }
    }

    let day;
    let month;
    let year = null;
    let match = text.match(/(?:ngày\s+|ngay\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/i);
    if (match) {
        [day, month] = [Number(match[1]), Number(match[2])];
        if (match[3]) year = Number(match[3]);
        consumed.push(match[0]);
    } else {
        match = text.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?|ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})(?:\s+nam\s+(\d{4}))?/i);
        if (!match) return null;
        day = Number(match[1] || match[4]);
        month = Number(match[2] || match[5]);
        const yearText = match[3] || match[6];
        if (yearText) year = Number(yearText);
        consumed.push(match[0]);
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const today = isoOf(now);
    if (lunar) {
        if (day > 30) return null;
        // Năm chưa ghi: lấy lần gần nhất sắp tới (năm âm hiện tại hoặc năm sau).
        const years = year ? [year] : [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
        for (const lunarYear of years) {
            const iso = lunarToSolar(day, month, lunarYear);
            if (iso && (year || iso >= today)) {
                return { isoDate: iso, lunar: true, lunarText: `${pad2(day)}/${pad2(month)}${year ? `/${year}` : ''} âm lịch`, consumed };
            }
        }
        return null;
    }
    const candidateYear = year || now.getFullYear();
    if (!isValidSolar(candidateYear, month, day)) return null;
    let iso = `${candidateYear}-${pad2(month)}-${pad2(day)}`;
    if (!year && iso < today && isValidSolar(candidateYear + 1, month, day)) iso = `${candidateYear + 1}-${pad2(month)}-${pad2(day)}`;
    return { isoDate: iso, lunar: false, consumed };
}

function extractTime(text) {
    const match = text.match(/(?:lúc|luc|vào lúc|vao luc)?\s*(\d{1,2})\s*(?:h|giờ|gio|:)\s*(\d{1,2})?\s*(?:phút|phut)?\s*(sáng|chiều|tối|sang|chieu|toi)?/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const period = String(match[3] || '').toLowerCase();
    if (/chiều|chieu|tối|toi/.test(period) && hour < 12) hour += 12;
    if (hour > 23 || minute > 59) return null;
    return { time: `${pad2(hour)}:${pad2(minute)}`, consumed: match[0] };
}

function extractReminder(text) {
    // "nhắc trước 3 ngày" hoặc chỉ "trước 2 ngày" ("nhắc sinh nhật chú út trước 2 ngày").
    const match = text.match(/(?:nhắc\s+)?trước\s+(\d{1,2})\s+ngày|(?:nhac\s+)?truoc\s+(\d{1,2})\s+ngay/i);
    if (!match) return null;
    return { days: Math.min(30, Number(match[1] || match[2])), consumed: match[0] };
}

function cleanTitle(text, consumedParts) {
    let title = text;
    consumedParts.filter(Boolean).forEach((part) => { title = title.replace(part, ' '); });
    title = title
        .replace(TRIGGER_PATTERN, ' ')
        .replace(/\b(cho\s+(tôi|mình)|giúp\s+(tôi|mình)|giup\s+(toi|minh)|vào\s+lịch|vao\s+lich|trên\s+lịch|tren\s+lich|ngày|ngay|lúc|luc|vào|vao|là|la)\b/gi, ' ')
        .replace(/[,.;:!?]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!title) return '';
    return title.charAt(0).toLocaleUpperCase('vi-VN') + title.slice(1);
}

// Cụm chỉ người trong tiêu đề giỗ/sinh nhật: "Giỗ ông nội" -> "ông nội", "Sinh nhật chú út" -> "chú út".
// Chỉ lấy với loại giỗ/sinh nhật; việc tìm người trong gia phả do chatbot làm (cần dữ liệu).
function extractPersonPhrase(title, type) {
    if (type !== 'death_anniversary' && type !== 'birthday') return null;
    const match = String(title || '').match(/^(?:giỗ|gio|kỵ nhật|ky nhat|sinh nhật|sinh nhat)\s+(?:của\s+|cua\s+)?(.+)$/i);
    if (!match) return null;
    const phrase = match[1].replace(/\s+(nhé|nha|nhá|giúp|giùm|với)$/i, '').trim();
    return phrase && /[\p{L}]/u.test(phrase) ? phrase : null;
}

// lunarToSolar(day, month, year) -> 'YYYY-MM-DD' (dương lịch) hoặc null.
function parseEventCommand(message, { now = new Date(), lunarToSolar } = {}) {
    const text = String(message || '').normalize('NFC').trim();
    if (!text || !TRIGGER_PATTERN.test(text)) return null;
    const date = extractDate(text, now, lunarToSolar || (() => null));
    const time = extractTime(text.replace(/(\d{1,2})[/-](\d{1,2})([/-]\d{4})?/g, ' '));
    const reminder = extractReminder(text);
    const title = cleanTitle(text, [...(date?.consumed || []), time?.consumed, reminder?.consumed]);
    const type = detectType(text);
    return {
        title: title || 'Sự kiện gia đình',
        personPhrase: extractPersonPhrase(title, type),
        date: date?.isoDate || null,
        lunar: Boolean(date?.lunar),
        lunarText: date?.lunarText || null,
        time: time?.time || null,
        reminderDays: reminder?.days ?? 1,
        type,
        needsDate: !date,
    };
}

module.exports = {
    parseEventCommand,
    extractDate,
    extractTime,
    detectType,
    extractPersonPhrase,
    pad2,
    isoOf,
};
