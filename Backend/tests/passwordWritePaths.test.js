// S6: mỗi đường ghi mật khẩu gọi handler thật với DB giả. Mật khẩu yếu thì phải trả 400 WEAK_PASSWORD
// và không lưu gì: không INSERT/UPDATE/DELETE ngoài giao dịch, không commit trong giao dịch.
// DB giả thay db.query và db.getConnection; không có kết nối thật (setup.env.js trỏ DB vào cổng chết).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const db = require('../src/config/db');

const WRITE_RE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;
const WEAK = 'abcdefgh'; // đủ dài nhưng không có số -> needs_letter_and_digit

// responder(sql, params) trả mảng dòng cho câu đọc; trả undefined thì coi như không có dòng nào.
function installFakeDb(responder = () => undefined) {
    const log = { writes: [], commits: 0, rollbacks: 0, reads: [] };
    const run = async (sql, params) => {
        const text = typeof sql === 'string' ? sql : sql?.sql || '';
        if (WRITE_RE.test(text)) {
            log.writes.push(text.trim().split('\n')[0]);
            return [{ insertId: 99, affectedRows: 1 }];
        }
        log.reads.push(text.trim().replace(/\s+/g, ' ').slice(0, 120));
        return [responder(text, params) || [], []];
    };
    const connection = {
        query: run,
        execute: run,
        beginTransaction: async () => {},
        commit: async () => { log.commits += 1; },
        rollback: async () => { log.rollbacks += 1; },
        release: () => {},
    };
    const original = { query: db.query, execute: db.execute, getConnection: db.getConnection };
    db.query = run;
    db.execute = run;
    db.getConnection = async () => connection;
    log.restore = () => Object.assign(db, original);
    return log;
}

function fakeRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        cookie() { return this; },
        setHeader() {},
    };
}

const fakeIo = { in: () => ({ fetchSockets: async () => [], disconnectSockets: () => {} }), to: () => ({ emit: () => {} }) };
const fakeReq = (props) => ({ app: { get: () => fakeIo }, headers: {}, ip: '127.0.0.1', get: () => '', ...props });

// opts: responder (dòng trả cho câu đọc), reason (mặc định needs_letter_and_digit),
// ignore (regex lệnh ghi dọn dẹp chạy trước mọi kiểm tra, không phải dữ liệu người dùng gửi).
async function expectRejected(name, handler, req, { responder, reason = 'needs_letter_and_digit', ignore } = {}) {
    const log = installFakeDb(responder);
    const origError = console.error;
    console.error = () => {};
    try {
        const res = fakeRes();
        await handler(fakeReq(req), res);
        const detail = `${name}: ${res.statusCode} ${JSON.stringify(res.body)} | đọc: ${log.reads.join(' || ')}`;
        assert.strictEqual(res.statusCode, 400, detail);
        assert.strictEqual(res.body?.code, 'WEAK_PASSWORD', detail);
        assert.strictEqual(res.body?.reason, reason, detail);
        assert.strictEqual(log.commits, 0, `${name}: không được commit`);
        const writes = log.writes.filter((sql) => !(ignore && ignore.test(sql)));
        // Ghi trong giao dịch rồi hoàn tác thì không lưu gì; ghi mà không hoàn tác là lỗi.
        if (writes.length) assert.ok(log.rollbacks > 0, `${name}: có lệnh ghi mà không hoàn tác: ${writes.join(' | ')}`);
        return writes;
    } finally {
        console.error = origError;
        log.restore();
    }
}

const admin = require('../src/modules/admin/admin.controller');
const auth = require('../src/modules/auth/auth.controller');
const clan = require('../src/modules/clan/clan.controller');
const invitation = require('../src/modules/invitations/invitation.controller');
const managerMember = require('../src/modules/manager/member.controller');
const member = require('../src/modules/member/member.controller');
const tree = require('../src/modules/genealogy/tree.controller');

const adminUser = { id: 1, role_id: 1 };
const managerUser = { id: 2, role_id: 2, clan_id: 5 };
const rowsWhen = (pattern, rows) => (sql) => (pattern.test(sql) ? rows : undefined);

test('auth.register', () => expectRejected('register', auth.register,
    { body: { email: 'moi@example.com', password: WEAK, clan_id: 1 } }));

test('auth.resetPasswordWithCode', () => expectRejected('reset', auth.resetPasswordWithCode,
    { body: { email: 'a@example.com', code: '123456', new_password: WEAK } }));

test('admin.createClan kèm Manager: dòng họ ghi trong giao dịch rồi hoàn tác', () => expectRejected('createClan', admin.createClan,
    { user: adminUser, body: { clan_name: 'Họ Thử', manager_email: 'm@example.com', manager_password: WEAK, manager_first_name: 'An' } },
    { responder: rowsWhen(/FROM plans/, [{ id: 1 }]) }));

test('admin.createManagerAccount', () => expectRejected('createManagerAccount', admin.createManagerAccount,
    { user: adminUser, body: { email: 'm@example.com', password: WEAK, clan_id: 5, first_name: 'An' } }));

test('admin.createAccount', () => expectRejected('createAccount', admin.createAccount,
    { user: adminUser, body: { email: 'm@example.com', password: WEAK, role_id: 3, clan_id: 5, first_name: 'An' } }));

test('admin.updateAccountAccess đặt mật khẩu hộ', () => expectRejected('updateAccountAccess', admin.updateAccountAccess,
    { user: adminUser, params: { id: '7' }, body: { email: 'moi@example.com', password: WEAK } },
    { responder: rowsWhen(/FROM accounts WHERE id/, [{ id: 7, person_id: 3, role_id: 3, email: 'cu@example.com' }]) }));

test('clan.registerClanWithManager', () => expectRejected('registerClanWithManager', clan.registerClanWithManager,
    { body: { clan_name: 'Họ Thử', email: 'm@example.com', password: WEAK, first_name: 'An', surname: 'Nguyễn' } }));

// markExpiredInvitations đánh dấu lời mời quá hạn trước mọi kiểm tra; không phải dữ liệu người dùng gửi.
const EXPIRE_SWEEP = /^UPDATE invitations SET status = 'expired' WHERE status = 'pending'/;

test('invitation.acceptInvitation', () => expectRejected('acceptInvitation', invitation.acceptInvitation,
    { body: { token: 'x'.repeat(40), password: WEAK, confirm_password: WEAK } },
    { ignore: EXPIRE_SWEEP }));

test('invitation.acceptInvitation: mật khẩu trùng email lời mời thì hoàn tác', () => expectRejected('acceptInvitation-email', invitation.acceptInvitation,
    { body: { token: 'x'.repeat(40), password: 'moi12345', confirm_password: 'moi12345' } },
    {
        ignore: EXPIRE_SWEEP,
        reason: 'same_as_identity',
        responder: rowsWhen(/FROM invitations/, [{
            id: 1, email: 'moi12345@example.com', status: 'pending', role: 'member', clan_id: 5,
            expires_at: new Date(Date.now() + 3600e3),
        }]),
    }));

test('manager.createMember kèm tài khoản', () => expectRejected('createMember', managerMember.createMember,
    { user: managerUser, body: { email: 'moi@example.com', password: WEAK, first_name: 'An', create_account: true } }));

test('manager.updateMemberByManager: nâng quyền kèm mật khẩu yếu thì không ghi gì', async () => {
    const writes = await expectRejected('updateMemberByManager', managerMember.updateMemberByManager,
        { user: managerUser, params: { id: '7' }, body: { role_id: 2, status: 'active', email: 'moi@example.com', new_password: WEAK } },
        { responder: (sql) => (/AND id <>/.test(sql) ? [] : [{ id: 7, account_id: 7, role_id: 3, status: 'active', clan_id: 5, email: 'cu@example.com', person_id: 3 }]) });
    assert.deepStrictEqual(writes, []);
});

test('member.changePassword', () => expectRejected('changePassword', member.changePassword,
    { user: { id: 7, role_id: 3 }, body: { current_password: 'cu12345678', new_password: WEAK } }));

// Cây: mọi câu đọc trả một người của dòng họ 5; riêng tài khoản theo person_id/email thì rỗng để đi nhánh tạo tài khoản.
const treeRows = (sql) => {
    if (/FROM accounts\s+WHERE (person_id|email)/i.test(sql)) return [];
    return [{ id: 3, clan_id: 5, first_name: 'An', surname: 'Nguyễn', gender: 1, generation: 1, is_living: 1, role_id: 2, status: 'active', person_id: 3, account_id: 2 }];
};

test('tree.createPerson kèm tài khoản', () => expectRejected('createPerson', tree.createPerson,
    { user: managerUser, body: { first_name: 'An', gender: 1, generation: 1, account_email: 'moi@example.com', account_password: WEAK } },
    { responder: treeRows }));

test('tree.updateTreePerson thêm tài khoản', () => expectRejected('updateTreePerson', tree.updateTreePerson,
    { user: managerUser, params: { id: '3' }, body: { role_id: 3, account_email: 'moi@example.com', account_password: WEAK } },
    { responder: treeRows }));
