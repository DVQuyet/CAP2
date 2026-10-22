process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb } = require('./helpers.mockDb');
const { getSuggestions } = require('../src/modules/chatbot/chatbotSuggestionService');

const texts = (list) => list.map((item) => item.text);

test('chip gợi ý dùng tên người thật trong dòng họ, không còn chuỗi giữ chỗ', async () => {
    const mock = createMockDb(async (sql, params) => {
        if (/JOIN children c ON c\.person_id = p\.id/.test(sql)) return [[{ id: 5, display_name: 'Đinh Viết Lâm' }]];
        if (/f\.father_id = p\.id OR f\.mother_id = p\.id/.test(sql)) return [[{ id: 2, display_name: 'Đinh Viết Hòa' }]];
        if (/SELECT 1 FROM people WHERE id = \? AND clan_id = \?/.test(sql)) return [[{ 1: 1 }]];
        return [[]];
    });

    const list = texts(await getSuggestions({ clanId: 13, currentMemberId: 5 }));
    assert.ok(list.includes('Ai là cha của Đinh Viết Lâm?'));
    assert.ok(list.includes('Con của Đinh Viết Hòa là ai?'));
    assert.ok(list.includes('Ông nội tôi là ai?'));
    assert.ok(list.every((text) => !/\[.*\]/.test(text)), 'không có chuỗi giữ chỗ');
    // Mọi truy vấn đều bị giới hạn theo dòng họ 13.
    assert.ok(mock.calls.filter((call) => /clan_id/.test(call.sql) && call.params.length).every((call) => call.params.includes(13)));
});

test('không có dòng họ hoặc DB lỗi thì chỉ trả các câu chung', async () => {
    createMockDb(async () => { throw new Error('db down'); });

    const noClan = texts(await getSuggestions({}));
    assert.ok(noClan.includes('Gia phả có bao nhiêu người?'));
    assert.ok(noClan.every((text) => !/\[.*\]/.test(text)));

    const onError = texts(await getSuggestions({ clanId: 13, currentMemberId: 5 }));
    assert.deepStrictEqual(onError, noClan);
});

test('không gợi ý "tôi" khi tài khoản chưa gắn với người trong cây', async () => {
    createMockDb(async () => [[]]);
    const list = texts(await getSuggestions({ clanId: 13, currentMemberId: null }));
    assert.ok(!list.includes('Ông nội tôi là ai?'));
    assert.ok(list.every((text) => !/Ai là cha của|Con của/.test(text)), 'không có người thì không có chip theo tên');
});

test('gợi ý chủ động: giỗ trong 14 ngày tới được đặt đầu và là lệnh nhắc lịch đi qua luồng bản nháp', async () => {
    const { parseEventCommand } = require('../src/modules/chatbot/eventCommandService');
    const { convertLunar2SolarDate } = require('../src/modules/calendar/calendar.controller');
    const now = new Date(2026, 9, 22);
    // Chọn ngày giỗ âm lịch rơi vào 5 ngày tới (tính bằng chính hàm của lịch để không phụ thuộc bảng âm lịch cứng).
    const { solarIsoToLunar } = require('../src/modules/calendar/calendar.controller');
    const target = solarIsoToLunar('2026-10-27');
    assert.ok(convertLunar2SolarDate(target.day, target.month, target.year, target.leap || 0, 7));
    createMockDb(async (sql) => {
        if (/FROM people WHERE clan_id = \? AND \(/.test(sql)) {
            return [[{ id: 9, display_name: 'Đinh Văn A', is_living: 0, death_date: null, death_date_precision: null,
                death_anniversary_lunar: String(target.month).padStart(2, '0') + '-' + String(target.day).padStart(2, '0') }]];
        }
        return [[]];
    });
    const list = await getSuggestions({ clanId: 13, currentMemberId: null, now });
    assert.strictEqual(list[0].text, 'Nhắc tôi giỗ Đinh Văn A ngày ' + target.day + '/' + target.month + ' âm lịch, nhắc trước 3 ngày');
    assert.strictEqual(list[0].intent_hint, 'create_event_draft');
    assert.strictEqual(list[0].hint, 'còn 5 ngày');
    const parsed = parseEventCommand(list[0].text, { now, lunarToSolar: convertLunar2SolarDate });
    assert.ok(parsed, 'parse được thành lệnh nhắc lịch');
});

test('gợi ý chủ động: không có giỗ/sinh nhật sắp tới thì danh sách không đổi', async () => {
    createMockDb(async () => [[]]);
    const list = texts(await getSuggestions({ clanId: 13, currentMemberId: null, now: new Date(2026, 9, 22) }));
    assert.ok(list.every((text) => !/^Nhắc tôi (giỗ|sinh nhật)/.test(text) || text === 'Nhắc tôi họp họ ngày mai lúc 8h'));
});
