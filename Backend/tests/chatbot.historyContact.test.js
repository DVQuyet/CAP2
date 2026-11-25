process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const controller = require('../src/modules/chatbot/chatbotController');

const contacts = { phone: '+9990007', email: 'q1@example.test', address: 'Số 7 đường Mẫu' };
const hidden = { phone: null, email: null, address: null };
const target = { id: 7, clan_id: 13, display_name: 'Đinh Văn Bình', ...contacts };
const ownProfile = { id: 5, display_name: 'Đinh Văn An', ...contacts };
const member = { id: 9, role_id: 3, role_name: 'member', person_id: 7 };
const COLUMNS = ['id', 'clan_id', 'account_id', 'current_member_id', 'role', 'message', 'intent', 'metadata'];

function mockHistory(handler) {
    return createMockDb(async (sql, params) => {
        if (/INFORMATION_SCHEMA\.TABLES/.test(sql)) return [params[0] === 'chatbot_messages' ? [{ 1: 1 }] : []];
        if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) return [COLUMNS.map((name) => ({ COLUMN_NAME: name }))];
        if (/^SELECT COALESCE\(a.person_id, ac.person_id\)/.test(sql)) return [[{ person_id: ownProfile.id }]];
        if (/^SELECT 1 FROM account_clans/.test(sql)) return [[{ 1: 1 }]];
        return handler(sql, params);
    });
}

test('GET history lọc liên hệ đã lưu cũ theo quyền hiện tại', async () => {
    const metadata = {
        intent: 'person_info',
        resolvedData: { type: 'person_profile', data: [target, ownProfile] },
        turn: { pending: { candidates: [{ name: 'Thiếu ID', ...contacts }] } },
    };
    const mock = mockHistory((sql) => {
        if (/FROM chatbot_messages m/.test(sql)) {
            return [[
                { id: 2, role: 'assistant', metadata },
                { id: 1, role: 'assistant', metadata: JSON.stringify(metadata) },
            ]];
        }
    });
    const read = async (user) => {
        const res = mockRes();
        await controller.history({ query: { clanId: 13, currentMemberId: target.id }, user }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body.messages.map((message) => message.id), [1, 2]);
        return res.body.messages.map((message) => message.metadata);
    };
    const expected = {
        ...metadata,
        resolvedData: { ...metadata.resolvedData, data: [{ ...target, ...hidden }, ownProfile] },
        turn: { pending: { candidates: [{ name: 'Thiếu ID', ...hidden }] } },
    };
    assert.deepEqual(await read(member), [expected, expected]);
    assert.deepEqual(await read({ ...member, role_id: 2, role_name: 'manager' }), [metadata, metadata]);
    assert.deepEqual(mock.find(/^SELECT COALESCE/).map(({ params }) => params), [[member.id]]);
});

test('/ask lọc liên hệ người khác trước khi ghi metadata', async () => {
    const mock = mockHistory((sql) => {
        if (/FROM people p LEFT JOIN accounts a|FROM people p WHERE p.clan_id|FROM people WHERE clan_id = \? AND id IN/.test(sql)) {
            return [[target]];
        }
        if (/^INSERT INTO chatbot_messages/.test(sql)) return [{ insertId: 42 }];
    });
    const res = mockRes();
    await controller.ask({
        body: { message: 'Đinh Văn Bình sinh năm nào?', clanId: 13, currentMemberId: target.id },
        user: member,
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.intent, 'person_info');
    assert.equal(res.body.messageId, 42);
    const { sql, params } = mock.find(/^INSERT INTO chatbot_messages/).at(-1);
    const columns = /\(([^)]+)\)/.exec(sql)[1].split(', ');
    assert.equal(params[columns.indexOf('role')], 'assistant');
    const metadata = JSON.parse(params[columns.indexOf('metadata')]);
    assert.deepEqual(metadata.resolvedData.data, [{ ...target, ...hidden }]);
});
