// Sự kiện gắn với người trong chatbot: nhận người (xưng hô/tên/hỏi lại), tự điền ngày, sửa/xóa chỉ trên lịch của chính mình.
// DB giả, không chạm DB thật; người trong gia phả được giả lập ở tầng tra cứu.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const path = require('path');
const { createMockDb, mockRes } = require('./helpers.mockDb');

// Tra xưng hô được giả lập (controller lấy hàm này lúc nạp nên phải thay trước khi require controller).
let kinshipAnswer = null;
const kinshipPath = path.join(__dirname, '../src/modules/chatbot/kinshipReferenceService.js');
require.cache[require.resolve(kinshipPath)] = {
    id: kinshipPath,
    filename: kinshipPath,
    loaded: true,
    exports: { resolveKinshipReference: async () => kinshipAnswer },
};

const relationshipEngine = require('../src/modules/chatbot/relationshipEngine');
const memberSearch = require('../src/modules/chatbot/memberSearchService');
const controller = require('../src/modules/chatbot/chatbotController');
const { buildEventCommandPayload } = controller.__test;

const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayIso = isoOf(new Date());
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); };

const ME = 9;
const grandpa = { id: 3, display_name: 'Đinh Văn Hòa', is_living: 0, death_date: '1999-11-20', death_date_precision: 'exact', birth_date: '1930-04-02', birth_date_precision: 'exact' };
const unclePerson = { id: 5, display_name: 'Đinh Văn Bình', is_living: 1, birth_date: '1940-10-25', birth_date_precision: 'exact' };
const noDataPerson = { id: 6, display_name: 'Trần Thị Lan', is_living: 0, death_date: null, death_anniversary_lunar: null, birth_date: '1935-01-01', birth_date_precision: 'year' };

const people = new Map([grandpa, unclePerson, noDataPerson].map((p) => [p.id, p]));
relationshipEngine.getPerson = async (id) => people.get(Number(id)) || null;
let searchAnswer = { status: 'not_found', candidates: [] };
memberSearch.resolvePerson = async () => searchAnswer;
memberSearch.tableExists = async () => false;

const ctxFor = (res, extra = {}) => ({ res, clanId: 13, currentMemberId: 101, accountId: ME, ...extra });
const newRes = () => {
    const res = mockRes();
    res.locals = { chatbotTurn: { memorySessionId: 'event-person-test', message: '', forced: null } };
    return res;
};

// Lịch trong DB: cột person_id/repeat_yearly có đủ; lọc theo quyền xem như truy vấn thật.
const calendarRows = [
    { id: 11, clan_id: 13, creator_account_id: ME, title: 'Họp họ chi', event_date: inDays(3), event_time: '08:00', visibility: 'personal', type: 'family', person_id: null, repeat_yearly: 0 },
    { id: 12, clan_id: 13, creator_account_id: ME, title: 'Giỗ Đinh Văn Hòa', event_date: inDays(30), event_time: '', visibility: 'personal', type: 'death_anniversary', person_id: 3, repeat_yearly: 1 },
    { id: 13, clan_id: 13, creator_account_id: 77, title: 'Sinh nhật Đinh Văn Bình', event_date: inDays(10), event_time: '', visibility: 'global', type: 'birthday', person_id: 5, repeat_yearly: 1 },
    { id: 14, clan_id: 13, creator_account_id: 77, title: 'Họp họ tổng', event_date: inDays(5), event_time: '', visibility: 'global', type: 'family', person_id: null, repeat_yearly: 0 },
    { id: 15, clan_id: 13, creator_account_id: ME, title: 'Họp họ chi nhánh hai', event_date: inDays(6), event_time: '', visibility: 'personal', type: 'family', person_id: null, repeat_yearly: 0 },
];
const mockCalendarDb = (hasColumns = true) => createMockDb(async (sql, params) => {
    if (/^SHOW COLUMNS FROM calendar_events/.test(sql)) return [hasColumns ? [{ Field: 'person_id' }, { Field: 'repeat_yearly' }] : []];
    if (/FROM calendar_events WHERE clan_id = \?/.test(sql)) {
        const accountId = Number(params[1]);
        return [calendarRows.filter((row) => row.visibility === 'global' || row.creator_account_id === accountId)];
    }
    return [[]];
});

// Tạo bản sao module calendar để mỗi test có trạng thái nhớ cột riêng.
const freshHasPersonLink = () => {
    const modulePath = require.resolve('../src/modules/calendar/calendar.controller');
    delete require.cache[modulePath];
    return require('../src/modules/calendar/calendar.controller').hasPersonLinkColumns;
};

test('giỗ ông nội: nhận người theo xưng hô, tự điền ngày giỗ từ hồ sơ, gắn person_id và lặp hằng năm', async () => {
    mockCalendarDb();
    kinshipAnswer = { status: 'resolved', person: grandpa };
    const res = newRes();
    const payload = await buildEventCommandPayload('Nhắc tôi giỗ ông nội', ctxFor(res));
    assert.strictEqual(payload.intent, 'create_event_draft');
    assert.strictEqual(payload.eventDraft.person_id, 3);
    assert.strictEqual(payload.eventDraft.repeat_yearly, 1);
    assert.strictEqual(payload.eventDraft.type, 'death_anniversary');
    assert.strictEqual(payload.eventDraft.title, 'Giỗ Đinh Văn Hòa');
    assert.match(payload.eventDraft.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(payload.eventDraft.date >= todayIso, 'ngày giỗ sắp tới, không phải ngày đã qua');
    assert.deepStrictEqual(payload.people, [{ id: 3, name: 'Đinh Văn Hòa' }]);
    // Chỉ là bản nháp: có nút "Thêm vào lịch", chưa ghi gì.
    assert.strictEqual(payload.actions[0].type, 'create_calendar_event');
    assert.strictEqual(payload.actions[0].payload.person_id, 3);
});

test('ngày nêu trong câu thắng ngày trong hồ sơ; người không tìm thấy thì tạo lịch thường không gắn person_id', async () => {
    mockCalendarDb();
    kinshipAnswer = { status: 'resolved', person: grandpa };
    const typed = await buildEventCommandPayload('Nhắc tôi giỗ ông nội ngày 20/11/2030', ctxFor(newRes()));
    assert.strictEqual(typed.eventDraft.date, '2030-11-20');
    assert.strictEqual(typed.eventDraft.person_id, 3);

    kinshipAnswer = null;
    searchAnswer = { status: 'not_found', candidates: [] };
    const plain = await buildEventCommandPayload('Nhắc tôi giỗ tổ ngày 20/11/2030', ctxFor(newRes()));
    assert.strictEqual(plain.eventDraft.person_id, undefined);
    assert.strictEqual(plain.eventDraft.repeat_yearly, undefined);
});

test('sinh nhật lấy từ ngày sinh chính xác; hồ sơ không đủ dữ liệu thì hỏi ngày', async () => {
    mockCalendarDb();
    kinshipAnswer = null;
    searchAnswer = { status: 'resolved', person: unclePerson, candidates: [unclePerson] };
    const birthday = await buildEventCommandPayload('Nhắc sinh nhật bác Bình trước 2 ngày', ctxFor(newRes()));
    assert.strictEqual(birthday.eventDraft.type, 'birthday');
    assert.match(birthday.eventDraft.date, /-10-25$/);
    assert.ok(birthday.eventDraft.date >= todayIso);
    assert.strictEqual(birthday.eventDraft.reminder_days, 2);
    assert.strictEqual(birthday.eventDraft.person_id, 5);

    searchAnswer = { status: 'resolved', person: noDataPerson, candidates: [noDataPerson] };
    const ask = await buildEventCommandPayload('Nhắc tôi giỗ Trần Thị Lan', ctxFor(newRes()));
    assert.strictEqual(ask.needsClarification, true);
    assert.match(ask.answer, /chưa ghi ngày mất hoặc ngày giỗ của Trần Thị Lan/);
    assert.strictEqual(ask.actions, undefined, 'chưa đủ ngày thì chưa có nút thêm');
});

test('trùng người: hỏi lại bằng danh sách ứng viên (không đoán), chọn xong dùng đúng người đã chọn', async () => {
    mockCalendarDb();
    kinshipAnswer = null;
    searchAnswer = { status: 'ambiguous', candidates: [{ id: 5, display_name: 'Đinh Văn Bình', score: 1 }, { id: 3, display_name: 'Đinh Văn Hòa', score: 1 }] };
    const res = newRes();
    res.locals.chatbotTurn.message = 'Nhắc sinh nhật bác Bình';
    const payload = await buildEventCommandPayload('Nhắc sinh nhật bác Bình', ctxFor(res));
    assert.deepStrictEqual(payload, { responded: true });
    assert.strictEqual(res.body.code, 'AMBIGUOUS_PERSON');
    assert.strictEqual(res.body.needsClarification, true);
    assert.strictEqual(res.locals.chatbotTurn.pending.message, 'Nhắc sinh nhật bác Bình', 'câu gốc được giữ để hỏi lại sau khi chọn');

    const second = newRes();
    second.locals.chatbotTurn.forced = { personId: 5, subject: 'bác Bình' };
    const chosen = await buildEventCommandPayload('Nhắc sinh nhật bác Bình', ctxFor(second));
    assert.strictEqual(chosen.eventDraft.person_id, 5);
    assert.strictEqual(second.locals.chatbotTurn.forced, null, 'lựa chọn chỉ dùng một lần');
});

test('sửa lịch của chính mình: chỉ trả thẻ xác nhận, không ghi DB', async () => {
    const mock = mockCalendarDb();
    kinshipAnswer = null;
    const payload = await buildEventCommandPayload('Đổi giờ họp họ chi nhánh hai sang 9h', ctxFor(newRes()));
    assert.strictEqual(payload.intent, 'edit_event_draft');
    assert.deepStrictEqual(payload.actions.map((a) => a.type), ['update_calendar_event', 'cancel_calendar_action']);
    assert.deepStrictEqual(payload.actions[0].payload, { id: 15, changes: { time: '09:00' } });
    assert.match(payload.answer, /Họp họ chi nhánh hai/);
    assert.strictEqual(mock.find(/^(UPDATE|DELETE|INSERT)/i).length, 0, 'AI không tự áp dụng thay đổi');
    // Truy vấn tìm lịch luôn gắn tài khoản của người hỏi.
    assert.deepStrictEqual(mock.find(/^SELECT \* FROM calendar_events WHERE/)[0].params.slice(0, 2), [13, ME]);
});

test('xóa nhắc giỗ ông nội: nhận người rồi tìm đúng lịch gắn person_id, chờ xác nhận', async () => {
    const mock = mockCalendarDb();
    kinshipAnswer = { status: 'resolved', person: grandpa };
    const payload = await buildEventCommandPayload('Xóa nhắc giỗ ông nội', ctxFor(newRes()));
    assert.strictEqual(payload.eventEdit.action, 'delete');
    assert.strictEqual(payload.eventEdit.id, 12);
    assert.deepStrictEqual(payload.actions.map((a) => a.type), ['delete_calendar_event', 'cancel_calendar_action']);
    assert.strictEqual(mock.find(/^(UPDATE|DELETE|INSERT)/i).length, 0);
});

test('lịch do tài khoản khác tạo: từ chối sửa/xóa, không có nút xác nhận', async () => {
    mockCalendarDb();
    kinshipAnswer = { status: 'resolved', person: unclePerson };
    const edit = await buildEventCommandPayload('Đổi giờ họp họ tổng sang 9h', ctxFor(newRes()));
    assert.strictEqual(edit.code, 'EVENT_NOT_OWNED');
    assert.strictEqual(edit.actions, undefined);

    const del = await buildEventCommandPayload('Xóa nhắc sinh nhật bác Bình', ctxFor(newRes()));
    assert.strictEqual(del.code, 'EVENT_NOT_OWNED', 'cả sự kiện chung gắn người của người khác');
    assert.strictEqual(del.actions, undefined);
});

test('nhiều lịch cùng khớp thì hỏi lại; thiếu giờ/ngày mới thì hỏi; "xóa lịch sử" không bị hiểu là xóa sự kiện', async () => {
    mockCalendarDb();
    kinshipAnswer = null;
    const many = await buildEventCommandPayload('Xóa lịch họp họ chi', ctxFor(newRes()));
    assert.strictEqual(many.actions, undefined);
    assert.match(many.answer, /Có 2 lịch của bạn khớp/);

    const missing = await buildEventCommandPayload('Đổi giờ họp họ chi nhánh hai sang', ctxFor(newRes()));
    assert.strictEqual(missing, null, 'câu cụt không phải lệnh sửa; rơi về luồng thường');

    const noChange = await buildEventCommandPayload('Dời họp họ chi nhánh hai sang đúng', ctxFor(newRes()));
    assert.match(noChange.answer, /sang giờ hoặc ngày nào/);

    assert.strictEqual(await buildEventCommandPayload('Xóa lịch sử trò chuyện', ctxFor(newRes())), null);
});

test('hasPersonLinkColumns: production chưa migrate (thiếu cột) thì báo false', async () => {
    mockCalendarDb(false);
    assert.strictEqual(await freshHasPersonLink()(), false);
    mockCalendarDb(true);
    assert.strictEqual(await freshHasPersonLink()(), true);
});
