process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb } = require('./helpers.mockDb');

// Không gọi LLM thật và không dựng lịch người từ DB: chỉ kiểm tra cách trả lời sự kiện.
const chatbotAI = require('../src/modules/chatbot/chatbotAI');
chatbotAI.explainRelationship = async () => ({ success: false });
const calendar = require('../src/modules/calendar/calendar.controller');
let personEvents = [];
let personEventRange = null;
calendar.buildYearlyPersonEvents = async ({ from, to }) => {
    personEventRange = { from, to };
    return personEvents;
};

const parser = require('../src/modules/chatbot/intentParserService');
const { handleEventsIntent, handleGeneralChatIntent } = require('../src/modules/chatbot/dataIntentHandlers');

const run = (message, accountId = 9) => handleEventsIntent({
    clanId: 13,
    accountId,
    message,
    parsed: parser.parse(message),
    context: {},
    planner: null,
});

const setup = ({ events = [], calendarRows = [] } = {}) => {
    const mock = createMockDb(async (sql) => {
        if (/FROM events/.test(sql)) return [events];
        if (/FROM calendar_events/.test(sql)) return [calendarRows];
        return [[]];
    });
    return mock;
};

test('"hôm nay" giới hạn đúng một ngày và gồm lịch chung/cá nhân của người hỏi', async () => {
    const mock = setup({
        events: [{ title: 'Họp họ', event_date: '2026-10-15', start_date: '2026-10-15', end_date: '2026-10-15' }],
        calendarRows: [{ title: 'Đi tảo mộ', event_date: '2026-10-15', event_time: '07:00' }],
    });
    personEvents = [{ type: 'birthday', title: 'Sinh nhật Đinh Viết Lâm', date: '2026-10-15' }];
    const result = await run('Hôm nay có sự kiện gì');

    assert.match(result.answer, /hôm nay/);
    assert.match(result.answer, /Họp họ/);
    assert.match(result.answer, /Đi tảo mộ/);
    assert.match(result.answer, /Sinh nhật.*Đinh Viết Lâm/);
    assert.strictEqual(personEventRange.from, personEventRange.to, 'khoảng một ngày');

    const calendarCall = mock.find(/FROM calendar_events/)[0];
    assert.ok(calendarCall.params.includes(13) && calendarCall.params.includes(9), 'giới hạn theo dòng họ và người hỏi');
    assert.ok(/visibility = 'global' OR creator_account_id = \?/.test(calendarCall.sql), 'lịch cá nhân của người khác không lộ');
});

test('hỏi riêng ngày giỗ chỉ trả ngày giỗ, không lẫn sự kiện khác', async () => {
    const mock = setup({ events: [{ title: 'Họp họ', event_date: '2026-10-20' }] });
    personEvents = [
        { type: 'death_anniversary', title: 'Ngày giỗ Đinh Viết Hòa', date: '2026-10-25', anniversary_lunar_date: '15/09' },
        { type: 'birthday', title: 'Sinh nhật Đinh Viết Lâm', date: '2026-10-26' },
    ];
    // Hàm giả không lọc theo loại như hàm thật, nên handler phải tự lọc.
    const result = await run('Tháng này có giỗ ai không');

    assert.match(result.answer, /Đinh Viết Hòa/);
    assert.match(result.answer, /15\/09 âm lịch/);
    assert.doesNotMatch(result.answer, /\d{4}-\d{2}-\d{2}/, 'ngày hiển thị kiểu Việt, không phải ISO');
    assert.doesNotMatch(result.answer, /Họp họ/);
    assert.doesNotMatch(result.answer, /Đinh Viết Lâm/);
    assert.strictEqual(mock.find(/FROM events/).length, 0, 'không truy vấn sự kiện khi chỉ hỏi ngày giỗ');
});

test('không có dữ liệu thì trả lời rõ cần dữ liệu gì', async () => {
    setup();
    personEvents = [];
    const anniversary = await run('Tháng này có giỗ ai không');
    assert.match(anniversary.answer, /Chưa có ngày giỗ nào/);
    assert.match(anniversary.answer, /ngày mất|ngày giỗ âm lịch/);

    const birthday = await run('Sinh nhật của ai sắp tới');
    assert.match(birthday.answer, /Chưa có sinh nhật nào/);

    const general = await run('Sắp tới có sự kiện gì');
    assert.match(general.answer, /Không có sự kiện nào trong 60 ngày tới/);
});

test('không nêu mốc thì giữ hành vi cũ: mọi sự kiện chưa kết thúc', async () => {
    const mock = setup({ events: [{ title: 'Giỗ tổ', event_date: '2027-03-10', start_date: '2027-03-10', end_date: '2027-03-10' }] });
    personEvents = [];
    await run('Sắp tới có sự kiện gì');
    const call = mock.find(/FROM events/)[0];
    assert.ok(call.params.includes('9999-12-31'), 'không chặn trên');
});

test('hỏi chức năng trả danh sách việc trợ lý làm được, không gọi LLM', async () => {
    const message = 'Bạn làm được những gì';
    const result = await handleGeneralChatIntent({ message, parsed: parser.parse(message), context: {}, planner: null });
    assert.match(result.answer, /Tạo lịch/);
    assert.match(result.answer, /Thêm vào lịch/);
    assert.strictEqual(result.ai.explanationUsed, false);
});
