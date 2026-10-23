// Lịch: sự kiện gắn người lặp hằng năm + không trùng ngày giỗ/sinh nhật tự tính; createEvent ghi person_id an toàn.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const { applyYearlyRecurrence, sameDayInYear } = require('../src/modules/calendar/calendarRecurrence');

const userEvent = (extra) => ({
    id: 1, title: 'Giỗ ông', type: 'death_anniversary', person_id: 3, repeat_yearly: true,
    event_date: '2025-11-21', date: '2025-11-21', can_edit: true, can_delete: true, ...extra,
});
const autoEvent = (personId, type, date) => ({
    id: `${type}-${personId}-${date.slice(0, 4)}`, type, person_id: personId, event_date: date, date, source: 'person_anniversary',
});

test('sinh bản lặp cho các năm sau ngày gốc, không sinh năm trước ngày gốc', () => {
    const { userEvents } = applyYearlyRecurrence({
        userEvents: [userEvent({ person_id: null, type: 'family' })], autoEvents: [], from: '2024-01-01', to: '2027-12-31',
    });
    assert.deepStrictEqual(userEvents.map((e) => e.event_date), ['2025-11-21', '2026-11-21', '2027-11-21']);
    const copy = userEvents[1];
    assert.strictEqual(copy.id, '1-y2026');
    assert.strictEqual(copy.source_event_id, 1);
    assert.strictEqual(copy.can_edit, false, 'bản sinh ra không sửa/xóa trực tiếp');
});

test('ngày gốc nằm trước khoảng xem vẫn sinh bản trong khoảng; ngày gốc ngoài khoảng không hiện', () => {
    const { userEvents } = applyYearlyRecurrence({
        userEvents: [userEvent({ person_id: null, type: 'family' })], autoEvents: [], from: '2027-01-01', to: '2027-12-31',
    });
    assert.deepStrictEqual(userEvents.map((e) => e.event_date), ['2027-11-21']);
});

test('không trùng: lịch tự tính đã có đúng người + loại + năm thì không sinh bản lặp', () => {
    const { userEvents, autoEvents } = applyYearlyRecurrence({
        userEvents: [userEvent()],
        autoEvents: [autoEvent(3, 'death_anniversary', '2026-11-21'), autoEvent(3, 'death_anniversary', '2027-11-10')],
        from: '2026-01-01', to: '2027-12-31',
    });
    assert.deepStrictEqual(userEvents.map((e) => e.event_date), [], 'ngày gốc 2025 ngoài khoảng, các năm sau do lịch tự tính đảm nhiệm');
    assert.strictEqual(autoEvents.length, 2, 'ngày giỗ tự tính được giữ nguyên');
});

test('không trùng: sự kiện của người dùng thay thế ngày tự tính cùng người + loại + năm, loại khác/người khác không bị ảnh hưởng', () => {
    const { userEvents, autoEvents } = applyYearlyRecurrence({
        userEvents: [userEvent({ event_date: '2026-11-20', date: '2026-11-20', repeat_yearly: false })],
        autoEvents: [
            autoEvent(3, 'death_anniversary', '2026-11-21'),
            autoEvent(3, 'birthday', '2026-04-02'),
            autoEvent(4, 'death_anniversary', '2026-11-21'),
        ],
        from: '2026-01-01', to: '2026-12-31',
    });
    assert.deepStrictEqual(userEvents.map((e) => e.event_date), ['2026-11-20']);
    assert.deepStrictEqual(autoEvents.map((e) => e.id).sort(), ['birthday-3-2026', 'death_anniversary-4-2026']);
});

test('người chưa có dữ liệu giỗ tự tính: bản lặp theo ngày dương vẫn hiện, mỗi năm đúng một lần', () => {
    const { userEvents, autoEvents } = applyYearlyRecurrence({
        userEvents: [userEvent()], autoEvents: [], from: '2026-01-01', to: '2028-12-31',
    });
    assert.deepStrictEqual(userEvents.map((e) => e.event_date), ['2026-11-21', '2027-11-21', '2028-11-21']);
    assert.strictEqual(autoEvents.length, 0);
});

test('29/02 gặp năm không nhuận lùi về 28/02', () => {
    assert.strictEqual(sameDayInYear('2024-02-29', 2025), '2025-02-28');
    assert.strictEqual(sameDayInYear('2024-02-29', 2028), '2028-02-29');
});

// ---- createEvent: ghi person_id/repeat_yearly chỉ khi DB có cột, người phải thuộc đúng dòng họ ----
const loadFreshCalendar = () => {
    const modulePath = require.resolve('../src/modules/calendar/calendar.controller');
    delete require.cache[modulePath];
    return require('../src/modules/calendar/calendar.controller');
};
const reqFor = (body) => ({ user: { id: 9, role_name: 'member' }, body, query: {}, app: { locals: {} } });
const mockCreateDb = ({ hasColumns, personInClan = true }) => createMockDb(async (sql) => {
    if (/^SHOW COLUMNS FROM calendar_events LIKE/.test(sql)) return [hasColumns ? [{ Field: 'x' }] : []];
    if (/^SHOW COLUMNS FROM calendar_events WHERE/.test(sql)) return [hasColumns ? [{ Field: 'person_id' }, { Field: 'repeat_yearly' }] : []];
    if (/FROM accounts a/.test(sql)) return [[{ account_id: 9, clan_id: 13 }]];
    if (/^SELECT id FROM people WHERE id = \? AND clan_id = \?/.test(sql)) return [personInClan ? [{ id: 3 }] : []];
    if (/^INSERT INTO calendar_events/.test(sql)) return [{ insertId: 50 }];
    if (/^SELECT \* FROM calendar_events WHERE id/.test(sql)) {
        return [[{ id: 50, clan_id: 13, creator_account_id: 9, title: 'Giỗ', event_date: '2099-11-21', visibility: 'personal', reminder_days: 1, type: 'death_anniversary' }]];
    }
    return [[]];
});
const body = { title: 'Giỗ Đinh Văn Hòa', date: '2099-11-21', type: 'death_anniversary', reminder_days: 1, person_id: 3, repeat_yearly: 1 };

test('createEvent: lưu person_id và repeat_yearly khi DB đã có cột', async () => {
    const mock = mockCreateDb({ hasColumns: true });
    const res = mockRes();
    await loadFreshCalendar().createEvent(reqFor(body), res);
    assert.strictEqual(res.statusCode, 201);
    const insert = mock.find(/^INSERT INTO calendar_events/)[0];
    assert.match(insert.sql, /person_id, repeat_yearly\)/);
    assert.deepStrictEqual(insert.params.slice(-2), [3, 1]);
});

test('createEvent: production chưa migrate (thiếu cột) vẫn tạo được lịch, bỏ qua person_id', async () => {
    const mock = mockCreateDb({ hasColumns: false });
    const res = mockRes();
    await loadFreshCalendar().createEvent(reqFor(body), res);
    assert.strictEqual(res.statusCode, 201);
    assert.doesNotMatch(mock.find(/^INSERT INTO calendar_events/)[0].sql, /person_id/);
});

test('createEvent: người không thuộc dòng họ bị từ chối, không ghi gì', async () => {
    const mock = mockCreateDb({ hasColumns: true, personInClan: false });
    const res = mockRes();
    await loadFreshCalendar().createEvent(reqFor(body), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(mock.find(/^INSERT/).length, 0);
});
