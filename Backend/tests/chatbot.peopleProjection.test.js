const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockDb } = require('./helpers.mockDb');
const { queryPeopleWithHistory } = require('../src/modules/chatbot/peopleHistoryQuery');
const { projectPeople } = require('../scripts/chatbot-e2e/projectPeople');

const unknownColumn = (column) => Object.assign(
    new Error(`Unknown column '${column}' in 'field list'`),
    { code: 'ER_BAD_FIELD_ERROR' }
);

test('truy vấn hồ sơ giữ lại các cột lịch sử có sẵn', async () => {
    const person = { id: 7, birth_date_precision: 'year', death_anniversary_lunar: '03-10' };
    const mock = createMockDb((sql) => {
        if (sql.includes('death_date_precision')) throw unknownColumn('death_date_precision');
        return [[person]];
    });
    const [rows] = await queryPeopleWithHistory((extra) => `SELECT id${extra} FROM people WHERE clan_id = ?`, [13]);
    assert.deepEqual(rows, [person]);
    assert.deepEqual(mock.calls[1], {
        sql: 'SELECT id, birth_date_precision, death_anniversary_lunar FROM people WHERE clan_id = ?',
        params: [13],
    });
});

test('truy vấn đồ thị chỉ thử lại với cột lịch sử thiếu, rồi báo lỗi cột bắt buộc', async () => {
    const missingRequired = unknownColumn('p.id');
    const mock = createMockDb((sql) => {
        if (sql.includes('p.birth_date_precision')) throw unknownColumn('p.birth_date_precision');
        if (sql.includes('p.death_date_precision')) throw unknownColumn('p.death_date_precision');
        throw missingRequired;
    });
    await assert.rejects(
        queryPeopleWithHistory((extra) => `SELECT p.id${extra} FROM people p`, [], 'p.'),
        (error) => error === missingRequired
    );
    assert.deepEqual(mock.calls.map(({ sql }) => sql), [
        'SELECT p.id, p.birth_date_precision, p.death_date_precision, p.death_anniversary_lunar FROM people p',
        'SELECT p.id, p.death_date_precision, p.death_anniversary_lunar FROM people p',
        'SELECT p.id, p.death_anniversary_lunar FROM people p',
    ]);
});

test('DB giả chiếu đúng bí danh và báo lỗi phép chiếu không hỗ trợ', () => {
    const rows = [{ id: 7, display_name: 'Đinh Văn Bình', phone: '+9990007' }];
    assert.deepEqual(projectPeople('SELECT p.id AS target_id, display_name as name FROM people p', rows), [
        { target_id: 7, name: 'Đinh Văn Bình' },
    ]);
    assert.deepEqual(projectPeople('SELECT * FROM people', rows), rows);
    assert.throws(() => projectPeople('SELECT UPPER(p.display_name) AS name FROM people p', []), /Unsupported people projection/);
});
