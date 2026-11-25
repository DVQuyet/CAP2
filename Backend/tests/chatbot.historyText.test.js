process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Q-1/Q-2: tin cũ có thể chứa SĐT/email/địa chỉ trong chữ (message, metadata.answer); che theo quyền hiện tại,
// ở cả lịch sử trả về client và ngữ cảnh hội thoại gửi LLM. Thành viên chưa gắn hồ sơ vẫn đọc được tin của mình.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const controller = require('../src/modules/chatbot/chatbotController');
const { filterHistoryRows } = require('../src/modules/chatbot/chatbotHistoryMetadata');
const { handlePersonExistsIntent } = require('../src/modules/chatbot/dataIntentHandlers');
const relationshipEngine = require('../src/modules/chatbot/relationshipEngine');

const CLAN = 13;
const other = { id: 7, phone: '0901234567', email: 'binh@example.test', address: 'Số 7 đường Mẫu' };
const own = { id: 5, phone: '0911111111', email: 'an@example.test', address: 'Số 5 đường Mẫu' };
const member = { id: 9, role_id: 3, role_name: 'member', person_id: own.id };
const manager = { id: 8, role_id: 2, role_name: 'manager', person_id: own.id };
const COLUMNS = ['id', 'clan_id', 'account_id', 'current_member_id', 'role', 'message', 'intent', 'metadata'];
const MASK = '[đã ẩn thông tin liên hệ]';

function mockClan({ viewerPersonId = own.id, messages = [] } = {}) {
    return createMockDb(async (sql, params) => {
        if (/INFORMATION_SCHEMA\.TABLES/.test(sql)) return [params[0] === 'chatbot_messages' ? [{ 1: 1 }] : []];
        if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) return [COLUMNS.map((name) => ({ COLUMN_NAME: name }))];
        if (/^SELECT COALESCE\(p.id, ac.person_id\)/.test(sql)) return [[{ person_id: viewerPersonId }]];
        if (/^SELECT id, phone, email, address FROM people WHERE clan_id = \?/.test(sql)) return [[other, own]];
        if (/^SELECT 1 FROM account_clans/.test(sql)) return [[{ 1: 1 }]];
        if (/FROM chatbot_messages m/.test(sql)) return [messages];
        return undefined;
    });
}

const oldText = `SĐT ${other.phone}, email ${other.email}, nhà ở ${other.address}. Của bạn: ${own.phone}.`;

test('thành viên: che liên hệ người khác trong chữ của tin cũ, giữ liên hệ của chính mình', async () => {
    mockClan();
    const [row] = await filterHistoryRows(member, CLAN, [{ id: 1, message: oldText, metadata: { answer: oldText } }]);
    for (const text of [row.message, row.metadata.answer]) {
        assert.ok(!text.includes(other.phone) && !text.includes(other.email) && !text.includes(other.address), text);
        assert.ok(text.includes(own.phone));
        assert.equal(text.split(MASK).length - 1, 3);
    }
});

test('manager vẫn thấy nguyên văn', async () => {
    mockClan();
    const [row] = await filterHistoryRows(manager, CLAN, [{ id: 1, message: oldText }]);
    assert.equal(row.message, oldText);
});

test('ngữ cảnh hội thoại (không có metadata) cũng được che', async () => {
    mockClan();
    const rows = await filterHistoryRows(member, CLAN, [{ sender: 'bot', message: oldText, intent: 'person_info' }]);
    assert.ok(!rows[0].message.includes(other.phone));
    assert.equal(rows[0].sender, 'bot');
});

test('GET /history che chữ trong message của tin cũ', async () => {
    mockClan({ messages: [{ id: 3, role: 'assistant', message: oldText, metadata: null }] });
    const res = mockRes();
    await controller.history({ query: { clanId: CLAN }, user: member }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(!res.body.messages[0].message.includes(other.address));
});

test('thành viên chưa gắn hồ sơ: /history đọc tin current_member_id NULL của chính tài khoản', async () => {
    const mock = mockClan({ viewerPersonId: null, messages: [{ id: 4, role: 'user', message: 'xin chào', metadata: null }] });
    const res = mockRes();
    await controller.history({ query: { clanId: CLAN }, user: { ...member, person_id: null } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.messages.map((m) => m.id), [4]);
    const { sql, params } = mock.find(/FROM chatbot_messages m/)[0];
    assert.match(sql, /m\.current_member_id IS NULL/);
    assert.match(sql, /m\.account_id = \?/);
    assert.ok(params.includes(member.id) && params.includes(CLAN));
});

test('"có ai tên X" khi tải cây lỗi ở chế độ public: không xác nhận ai cả', async (t) => {
    createMockDb(async (sql) => (/FROM people p/.test(sql) ? [[{ id: 7, clan_id: CLAN, display_name: 'Đinh Văn Bình', generation: 2 }]] : undefined));
    t.mock.method(relationshipEngine, 'currentTier', () => 'public');
    t.mock.method(relationshipEngine, 'loadClanGraph', async () => { throw new Error('graph down'); });
    const result = await handlePersonExistsIntent({ clanId: CLAN, parsed: { intent: 'person_exists', entities: { rawName: 'Đinh Văn Bình' } } });
    assert.deepEqual(result.people, []);
    assert.match(result.answer, /^Không tìm thấy/);
});
