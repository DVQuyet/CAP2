process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const { getSuggestions } = require('../src/modules/chatbot/chatbotSuggestionService');
const relationshipEngine = require('../src/modules/chatbot/relationshipEngine');
const graphVersion = require('../src/modules/chatbot/graphVersion');

const texts = (list) => list.map((item) => item.text);

// Cây giả cho đồ thị của relationshipEngine: người, gia đình, con. Gợi ý lấy tên từ đồ thị đó.
const person = (id, name, generation, extra = {}) => ({ id, clan_id: 13, display_name: name, generation, gender: 1, is_living: 1, ...extra });
function mockTree({ people = [], families = [], children = [], extra } = {}) {
    relationshipEngine.clearClanCache(13);
    graphVersion.forgetGraphVersion();
    return createMockDb(async (sql, params) => {
        if (/FROM people p LEFT JOIN accounts a .* WHERE p\.clan_id = \? AND am\.id IS NULL/.test(sql)) return [people];
        if (/^SELECT \* FROM families WHERE clan_id = \?/.test(sql)) return [families];
        if (/^SELECT \* FROM children WHERE family_id IN/.test(sql)) return [children.filter((c) => params.map(Number).includes(c.family_id))];
        if (extra) return extra(sql, params);
        return [[]];
    });
}

const HOA = person(2, 'Đinh Viết Hòa', 1);
const LAM = person(5, 'Đinh Viết Lâm', 2);
const FAMILY = { id: 10, clan_id: 13, father_id: 2, mother_id: null, visibility: 'public' };
const CHILD = { id: 100, family_id: 10, person_id: 5, child_type: 'biological' };

test('chip gợi ý dùng tên người thật trong dòng họ, không còn chuỗi giữ chỗ', async () => {
    const mock = mockTree({ people: [HOA, LAM], families: [FAMILY], children: [CHILD] });
    const list = texts(await getSuggestions({ clanId: 13, currentMemberId: 5 }));
    assert.ok(list.includes('Ai là cha của Đinh Viết Lâm?'), list.join(' | '));
    assert.ok(list.includes('Con của Đinh Viết Hòa là ai?'));
    assert.ok(list.includes('Ông nội tôi là ai?'));
    assert.ok(list.every((text) => !/\[.*\]/.test(text)), 'không có chuỗi giữ chỗ');
    // Mọi truy vấn có clan_id đều bị giới hạn theo dòng họ 13.
    assert.ok(mock.calls.filter((call) => /clan_id = \?/.test(call.sql) && call.params.length).every((call) => call.params.includes(13)));
});

test('không có dòng họ hoặc DB lỗi thì chỉ trả các câu chung', async () => {
    relationshipEngine.clearClanCache(13);
    graphVersion.forgetGraphVersion();
    createMockDb(async () => { throw new Error('db down'); });

    const noClan = texts(await getSuggestions({}));
    assert.ok(noClan.includes('Gia phả có bao nhiêu người?'));
    assert.ok(noClan.every((text) => !/\[.*\]/.test(text)));

    const onError = texts(await getSuggestions({ clanId: 13, currentMemberId: 5 }));
    assert.deepStrictEqual(onError, noClan);
});

test('không gợi ý "tôi" khi tài khoản chưa gắn với người trong cây', async () => {
    mockTree();
    const list = texts(await getSuggestions({ clanId: 13, currentMemberId: null }));
    assert.ok(!list.includes('Ông nội tôi là ai?'));
    assert.ok(list.every((text) => !/Ai là cha của|Con của/.test(text)), 'không có người thì không có chip theo tên');
    mockTree({ people: [HOA, LAM], families: [FAMILY], children: [CHILD] });
    assert.ok(!texts(await getSuggestions({ clanId: 13, currentMemberId: 999 })).includes('Ông nội tôi là ai?'), 'người không có trong cây');
});

// Astra: gợi ý từng đọc thẳng people/families nên lộ tên người chỉ quản lý được xem (quan hệ visibility = 'managers').
const AN = person(1, 'Bà Kế Ẩn', 1, { gender: 2, is_living: 0 });
const HIDDEN_TREE = {
    people: [AN, HOA, LAM],
    families: [{ id: 11, clan_id: 13, father_id: 2, mother_id: 1, visibility: 'managers' }, { ...FAMILY, id: 12 }],
    children: [{ id: 101, family_id: 11, person_id: 5, child_type: 'biological' }],
};

test('thành viên thường không thấy tên người trong quan hệ nhạy cảm; quản lý thì thấy', async () => {
    mockTree(HIDDEN_TREE);
    const asMember = texts(await relationshipEngine.runWithViewer({ canSeeSensitive: false }, () => getSuggestions({ clanId: 13 })));
    assert.ok(asMember.every((text) => !text.includes('Bà Kế Ẩn')), asMember.join(' | '));
    assert.ok(asMember.includes('Con của Đinh Viết Hòa là ai?'), 'con vẫn hiện là con của người còn lại');

    mockTree(HIDDEN_TREE);
    const asManager = texts(await relationshipEngine.runWithViewer({ canSeeSensitive: true }, () => getSuggestions({ clanId: 13 })));
    assert.ok(asManager.includes('Con của Bà Kế Ẩn là ai?'), asManager.join(' | '));

    mockTree(HIDDEN_TREE);
    assert.ok(texts(await getSuggestions({ clanId: 13, tier: 'public' })).every((text) => !text.includes('Bà Kế Ẩn')), 'tham số tier');
});

test('controller bọc withViewer: thành viên (role 3) không nhận tên ẩn', async () => {
    const controller = require('../src/modules/chatbot/chatbotController');
    mockTree({ ...HIDDEN_TREE, extra: () => [[{ 1: 1, clan_id: 13, role_id: 3, person_id: null }]] });
    const res = mockRes();
    await controller.suggestions({ query: { clanId: '13' }, user: { id: 7, role_id: 3, clan_id: 13 } }, res);
    assert.strictEqual(res.statusCode, 200);
    const list = res.body.suggestions.map((item) => item.text);
    assert.ok(list.every((text) => !text.includes('Bà Kế Ẩn')), list.join(' | '));
    assert.ok(list.includes('Con của Đinh Viết Hòa là ai?'), 'đã qua kiểm quyền và dùng tên thật: ' + list.join(' | '));
});

test('gợi ý chủ động: giỗ trong 14 ngày tới được đặt đầu và là lệnh nhắc lịch đi qua luồng bản nháp', async () => {
    const { parseEventCommand } = require('../src/modules/chatbot/eventCommandService');
    const { convertLunar2SolarDate, solarIsoToLunar } = require('../src/modules/calendar/calendar.controller');
    const now = new Date(2026, 9, 22);
    // Chọn ngày giỗ âm lịch rơi vào 5 ngày tới (tính bằng chính hàm của lịch để không phụ thuộc bảng âm lịch cứng).
    const target = solarIsoToLunar('2026-10-27');
    assert.ok(convertLunar2SolarDate(target.day, target.month, target.year, target.leap || 0, 7));
    const lunar = String(target.month).padStart(2, '0') + '-' + String(target.day).padStart(2, '0');
    const dead = person(9, 'Đinh Văn A', 1, { is_living: 0, death_date: null, death_date_precision: null, death_anniversary_lunar: lunar });
    const calendarRows = (sql) => (/FROM people WHERE clan_id = \? AND \(/.test(sql) ? [[dead]] : [[]]);
    mockTree({ people: [dead], extra: calendarRows });
    const list = await getSuggestions({ clanId: 13, currentMemberId: null, now });
    assert.strictEqual(list[0].text, 'Nhắc tôi giỗ Đinh Văn A ngày ' + target.day + '/' + target.month + ' âm lịch, nhắc trước 3 ngày');
    assert.strictEqual(list[0].intent_hint, 'create_event_draft');
    assert.strictEqual(list[0].hint, 'còn 5 ngày');
    const parsed = parseEventCommand(list[0].text, { now, lunarToSolar: convertLunar2SolarDate });
    assert.ok(parsed, 'parse được thành lệnh nhắc lịch');

    // Người không có trong đồ thị người xem được thấy (vd vợ trong quan hệ ẩn) thì không gợi ý giỗ của họ.
    mockTree({ people: [], extra: calendarRows });
    const hidden = texts(await getSuggestions({ clanId: 13, currentMemberId: null, now }));
    assert.ok(hidden.every((text) => !text.includes('Đinh Văn A')), hidden.join(' | '));
});

test('gợi ý chủ động: không có giỗ/sinh nhật sắp tới thì danh sách không đổi', async () => {
    mockTree();
    const list = texts(await getSuggestions({ clanId: 13, currentMemberId: null, now: new Date(2026, 9, 22) }));
    assert.ok(list.every((text) => !/^Nhắc tôi (giỗ|sinh nhật)/.test(text) || text === 'Nhắc tôi họp họ ngày mai lúc 8h'));
});
