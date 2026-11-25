process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Q-1: khi không tải được đồ thị dòng họ, thành viên thường không được nhận kết quả tìm tên
// (không xác minh được ai bị ẩn); manager vẫn tìm được.
const test = require('node:test');
const assert = require('assert');
const { createMockDb } = require('./helpers.mockDb');
const relationshipEngine = require('../src/modules/chatbot/relationshipEngine');
const memberSearch = require('../src/modules/chatbot/memberSearchService');

const people = [
    { id: 3, clan_id: 13, display_name: 'Đinh Văn Hòa', gender: 1, generation: 2, is_living: 0 },
    { id: 7, clan_id: 13, display_name: 'Lê Thị Cúc', gender: 2, generation: 2, is_living: 0 },
];

test('thành viên thường không nhận kết quả tìm tên khi đồ thị lỗi', async () => {
    const mock = createMockDb(async (sql) => {
        if (/FROM people p LEFT JOIN accounts a/.test(sql)) throw new Error('Graph unavailable');
        if (/FROM people p WHERE p\.clan_id = \? AND \( p\.display_name LIKE/.test(sql)) return [people.filter((row) => /Cúc/.test(row.display_name))];
        return [[]];
    });
    relationshipEngine.clearClanCache(13);
    const search = () => memberSearch.resolvePerson({ clanId: 13, names: ['Lê Thị Cúc'] });
    const member = await relationshipEngine.runWithViewer({ canSeeSensitive: false }, search);
    assert.deepStrictEqual(member, { status: 'not_found', candidates: [] });
    assert.strictEqual(mock.find(/FROM people p LEFT JOIN accounts a/).length, 1);
    const manager = await relationshipEngine.runWithViewer({ canSeeSensitive: true }, search);
    assert.strictEqual(manager.person.id, 7);
});
