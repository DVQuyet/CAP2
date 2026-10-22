// Gợi ý câu hỏi cho trợ lý. Ưu tiên tên người thật trong dòng họ của người dùng để bấm là hỏi được ngay;
// không có dữ liệu thì chỉ trả các câu chung, không bao giờ trả chuỗi giữ chỗ kiểu "[Tên người]".
const db = require('../../config/db');
const { ARCHIVED_MEMBER_JOIN_SQL } = require('../manager/common.service');

const toPositiveId = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
};

const GENERIC_SUGGESTIONS = [
    { text: 'Gia phả có bao nhiêu người?', intent_hint: 'stats_count' },
    { text: 'Dòng họ này có mấy đời?', intent_hint: 'stats_count' },
    { text: 'Sắp tới có sự kiện hoặc ngày giỗ nào?', intent_hint: 'events_upcoming' },
    { text: 'Giới thiệu về dòng họ', intent_hint: 'clan_history' },
    { text: 'Nhắc tôi họp họ ngày mai lúc 8h', intent_hint: 'create_event_draft' },
];

// Người đầu tiên (đời nhỏ nhất) thỏa điều kiện, bỏ qua hồ sơ đã lưu trữ và tên trống.
async function pickPerson(clanId, joinSql, whereSql) {
    const [rows] = await db.query(
        `
        SELECT p.id, p.display_name
        FROM people p
        LEFT JOIN accounts a ON a.person_id = p.id
        ${ARCHIVED_MEMBER_JOIN_SQL}
        ${joinSql}
        WHERE p.clan_id = ?
          AND am.id IS NULL
          AND TRIM(COALESCE(p.display_name, '')) <> ''
          ${whereSql}
        ORDER BY (p.generation IS NULL), p.generation ASC, p.id ASC
        LIMIT 1
        `,
        [clanId]
    );
    return rows[0] || null;
}

async function loadPersonalizedSuggestions(clanId, currentMemberId) {
    const suggestions = [];

    const withFather = await pickPerson(
        clanId,
        'JOIN children c ON c.person_id = p.id JOIN families f ON f.id = c.family_id AND f.father_id IS NOT NULL',
        ''
    );
    if (withFather) {
        suggestions.push({ text: `Ai là cha của ${withFather.display_name}?`, intent_hint: 'find_parents' });
    }

    const withChildren = await pickPerson(
        clanId,
        'JOIN families f ON (f.father_id = p.id OR f.mother_id = p.id) JOIN children c ON c.family_id = f.id',
        ''
    );
    if (withChildren) {
        suggestions.push({ text: `Con của ${withChildren.display_name} là ai?`, intent_hint: 'list_children' });
    }

    // "tôi" chỉ có nghĩa khi tài khoản đã gắn với một người trong cây.
    if (currentMemberId) {
        const [rows] = await db.query('SELECT 1 FROM people WHERE id = ? AND clan_id = ? LIMIT 1', [currentMemberId, clanId]);
        if (rows.length) suggestions.push({ text: 'Ông nội tôi là ai?', intent_hint: 'find_relationship' });
    }

    return suggestions;
}

const PROACTIVE_WINDOW_DAYS = 14;
const pad2 = (value) => String(value).padStart(2, '0');
const isoOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

// Gợi ý chủ động: giỗ/sinh nhật gần nhất trong 14 ngày tới. Dùng lại buildYearlyPersonEvents của lịch (không tự tính âm lịch).
// Câu gợi ý là một lệnh nhắc lịch; khi gửi đi sẽ đi qua eventCommandService, chỉ tạo bản nháp, không tự lưu.
async function loadUpcomingEventSuggestion(clanId, now = new Date()) {
    const { buildYearlyPersonEvents } = require('../calendar/calendar.controller');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + PROACTIVE_WINDOW_DAYS);
    const items = await buildYearlyPersonEvents({ clanId, from: isoOf(today), to: isoOf(end) });
    const next = (items || [])
        .filter((item) => item && (item.type === 'death_anniversary' || item.type === 'birthday') && item.date)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
    if (!next) return null;

    const name = String(next.title || '').replace(/^(Ngày giỗ|Sinh nhật)\s+/i, '').trim();
    if (!name) return null;
    const [y, m, d] = String(next.date).split('-').map(Number);
    const daysLeft = Math.round((new Date(y, m - 1, d) - today) / 86400000);
    const hint = `còn ${daysLeft} ngày`;
    if (next.type === 'death_anniversary') {
        const lunar = String(next.anniversary_lunar_date || '').match(/^(\d{1,2})\/(\d{1,2})\//);
        const when = lunar ? `${Number(lunar[1])}/${Number(lunar[2])} âm lịch` : `${d}/${m}`;
        return { text: `Nhắc tôi giỗ ${name} ngày ${when}, nhắc trước 3 ngày`, intent_hint: 'create_event_draft', hint };
    }
    return { text: `Nhắc tôi sinh nhật ${name} ngày ${d}/${m}, nhắc trước 3 ngày`, intent_hint: 'create_event_draft', hint };
}

// clanId đã được kiểm tra quyền ở controller; không có clanId thì chỉ trả các câu chung.
async function getSuggestions({ clanId, currentMemberId, now } = {}) {
    const normalizedClanId = toPositiveId(clanId);
    let personalized = [];
    if (normalizedClanId) {
        try {
            const upcoming = await loadUpcomingEventSuggestion(normalizedClanId, now);
            if (upcoming) personalized.push(upcoming);
        } catch (error) {
            console.error('chatbot upcoming suggestion error:', error.message);
        }
        try {
            personalized = personalized.concat(await loadPersonalizedSuggestions(normalizedClanId, toPositiveId(currentMemberId)));
        } catch (error) {
            console.error('chatbot personalized suggestions error:', error.message);
        }
    }

    return [...personalized, ...GENERIC_SUGGESTIONS].map((item, index) => ({
        id: index + 1,
        text: item.text,
        intent_hint: item.intent_hint,
        ...(item.hint ? { hint: item.hint } : {}),
    }));
}

module.exports = {
    getSuggestions,
    GENERIC_SUGGESTIONS,
};
