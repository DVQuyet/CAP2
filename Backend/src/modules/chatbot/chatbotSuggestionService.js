// Gợi ý câu hỏi cho trợ lý. Ưu tiên tên người thật trong dòng họ của người dùng để bấm là hỏi được ngay;
// không có dữ liệu thì chỉ trả các câu chung, không bao giờ trả chuỗi giữ chỗ kiểu "[Tên người]".
// Tên lấy từ đồ thị của relationshipEngine (đã bỏ hồ sơ lưu trữ và ẩn quan hệ nhạy cảm theo vai trò trong runWithViewer),
// nên thành viên thường không thấy tên người chỉ quản lý được xem.
const relationshipEngine = require('./relationshipEngine');

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

// Người trong đồ thị người xem được thấy, tên không trống, đời nhỏ nhất trước (đời trống xếp cuối), rồi theo id.
const visiblePeople = (graph) => [...graph.people.values()]
    .filter((person) => String(person.display_name || '').trim())
    .sort((a, b) => (a.generation == null) - (b.generation == null) || (a.generation || 0) - (b.generation || 0) || a.id - b.id);

function loadPersonalizedSuggestions(graph, currentMemberId) {
    const suggestions = [];
    const people = visiblePeople(graph);
    const edgesOf = (id) => graph.adjacency.get(Number(id)) || [];
    // Cạnh 'father'/'mother' đi từ con tới cha/mẹ: ai có cạnh 'father' là có cha, ai là đích của cạnh đó là có con.
    const parentIds = new Set();
    people.forEach((person) => edgesOf(person.id)
        .filter((edge) => edge.type === 'father' || edge.type === 'mother')
        .forEach((edge) => parentIds.add(Number(edge.to))));

    const withFather = people.find((person) => edgesOf(person.id).some((edge) => edge.type === 'father' && graph.people.has(edge.to)));
    if (withFather) suggestions.push({ text: `Ai là cha của ${withFather.display_name}?`, intent_hint: 'find_parents' });
    const withChildren = people.find((person) => parentIds.has(Number(person.id)));
    if (withChildren) suggestions.push({ text: `Con của ${withChildren.display_name} là ai?`, intent_hint: 'list_children' });
    // "tôi" chỉ có nghĩa khi tài khoản đã gắn với một người trong cây.
    if (currentMemberId && graph.people.has(currentMemberId)) suggestions.push({ text: 'Ông nội tôi là ai?', intent_hint: 'find_relationship' });
    return suggestions;
}

const PROACTIVE_WINDOW_DAYS = 14;
const pad2 = (value) => String(value).padStart(2, '0');
const isoOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

// Gợi ý chủ động: giỗ/sinh nhật gần nhất trong 14 ngày tới. Dùng lại buildYearlyPersonEvents của lịch (không tự tính âm lịch).
// Câu gợi ý là một lệnh nhắc lịch; khi gửi đi sẽ đi qua eventCommandService, chỉ tạo bản nháp, không tự lưu.
async function loadUpcomingEventSuggestion(clanId, graph, now = new Date()) {
    const { buildYearlyPersonEvents } = require('../calendar/calendar.controller');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + PROACTIVE_WINDOW_DAYS);
    const items = await buildYearlyPersonEvents({ clanId, from: isoOf(today), to: isoOf(end) });
    const next = (items || [])
        .filter((item) => item && (item.type === 'death_anniversary' || item.type === 'birthday') && item.date)
        .filter((item) => graph.people.has(Number(item.person_id)))
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
// tier ('all' | 'public') mặc định theo runWithViewer của yêu cầu (controller bọc withViewer).
async function getSuggestions({ clanId, currentMemberId, now, tier } = {}) {
    const normalizedClanId = toPositiveId(clanId);
    let personalized = [];
    let graph = null;
    if (normalizedClanId) {
        try {
            graph = await relationshipEngine.loadClanGraph(normalizedClanId, tier ? { tier } : {});
        } catch (error) {
            console.error('chatbot suggestions graph error:', error.message);
        }
    }
    if (graph) {
        try {
            const upcoming = await loadUpcomingEventSuggestion(normalizedClanId, graph, now);
            if (upcoming) personalized.push(upcoming);
        } catch (error) {
            console.error('chatbot upcoming suggestion error:', error.message);
        }
        personalized = personalized.concat(loadPersonalizedSuggestions(graph, toPositiveId(currentMemberId)));
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
