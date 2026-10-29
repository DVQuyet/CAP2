const crypto = require('crypto');
const { requireDbTests } = require('./guard');

requireDbTests();

const db = require('../../src/config/db');
const bcrypt = require('../../node_modules/bcryptjs');

// Dữ liệu tạm luôn mang dấu nhận biết để dọn đúng và chỉ dọn thứ của test.
const EMAIL_PREFIX = 'itest_';
const EMAIL_SUFFIX = '@example.test';
const NAME_PREFIX = 'ITEST_';
const ROLE_IDS = { admin: 1, manager: 2, member: 3 };

const rand = () => crypto.randomBytes(4).toString('hex');

// Nhiều thao tác (duyệt tài khoản, thêm người) bị chặn nếu dòng họ chưa có gói: cho mỗi dòng họ tạm một gói tạm giới hạn lớn.
const PLAN_CODE = `${NAME_PREFIX}PLAN`;
async function getOrCreateTempPlan() {
    const [rows] = await db.query('SELECT id FROM plans WHERE code = ? LIMIT 1', [PLAN_CODE]);
    if (rows.length) return rows[0].id;
    const [result] = await db.query(
        "INSERT INTO plans (code, name, description, price_vnd, billing_cycle, person_limit, account_limit, is_active) VALUES (?, ?, 'Gói tạm cho test tích hợp', 0, 'free', 100000, 100000, 1)",
        [PLAN_CODE, `${NAME_PREFIX}Plan`]
    );
    return result.insertId;
}

async function createTempClan(label = '', { withSubscription = true } = {}) {
    const [result] = await db.query('INSERT INTO clans (clan_name) VALUES (?)', [`${NAME_PREFIX}${Date.now()}_${rand()}${label ? `_${label}` : ''}`]);
    if (withSubscription) {
        const planId = await getOrCreateTempPlan();
        await db.query("INSERT INTO subscriptions (clan_id, plan_id, status, started_at) VALUES (?, ?, 'free', NOW())", [result.insertId, planId]);
    }
    return result.insertId;
}

// Tạo người trên cây (people) thuộc dòng họ tạm.
async function createTempPerson({ clanId, name = 'Person', gender = 1, generation = 1, birthDate = null, deathDate = null, isLiving = 1 } = {}) {
    const [result] = await db.query(
        'INSERT INTO people (clan_id, display_name, gender, generation, birth_date, death_date, is_living) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [clanId, `${NAME_PREFIX}${name}_${rand()}`, gender, generation, birthDate, deathDate, isLiving]
    );
    return result.insertId;
}

async function createTempAccount({ role = 'member', clanId = null, status = 'active', password = 'Itest#12345' } = {}) {
    const email = `${EMAIL_PREFIX}${role}_${rand()}${EMAIL_SUFFIX}`;
    const personId = clanId ? await createTempPerson({ clanId, name: role }) : null;
    const [result] = await db.query(
        'INSERT INTO accounts (email, password, person_id, role_id, status, profile_completed) VALUES (?, ?, ?, ?, ?, 1)',
        [email, await bcrypt.hash(password, 10), personId, ROLE_IDS[role], status]
    );
    if (clanId) {
        await db.query("INSERT INTO account_clans (account_id, clan_id, person_id, status) VALUES (?, ?, ?, 'active')", [result.insertId, clanId, personId]);
    }
    return { id: result.insertId, personId, clanId, email, password, role };
}

async function api(baseUrl, method, path, { token, body, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
    return { status: response.status, data, headers: response.headers };
}

async function login(baseUrl, email, password) {
    const result = await api(baseUrl, 'POST', '/api/auth/login', { body: { email, password } });
    if (result.status !== 200 || !result.data.token) {
        throw new Error(`Đăng nhập ${email} thất bại: ${result.status} ${result.data.message || ''}`);
    }
    return result.data.token;
}

const ids = (rows) => rows.map((row) => Number(row.id)).filter(Number.isInteger);
const inList = (list) => list.map((n) => Number(n)).join(',');
const orWhere = (parts) => parts.filter(Boolean).join(' OR ');

// Xóa mọi dữ liệu mang dấu tạm. Chỉ dựa trên id lấy từ dấu nhận biết (email itest_*, clan ITEST_*, người ITEST_*).
// Không biết hết quan hệ khóa ngoại nên thử lại các câu vướng khóa ngoại (ER_ROW_IS_REFERENCED_2) tối đa vài vòng.
async function cleanupAll() {
    const [accRows] = await db.query("SELECT id FROM accounts WHERE email LIKE 'itest\\_%@example.test'");
    const [clanRows] = await db.query("SELECT id FROM clans WHERE clan_name LIKE 'ITEST\\_%'");
    const accountIds = ids(accRows);
    const clanIds = ids(clanRows);
    const byClan = (column) => (clanIds.length ? `${column} IN (${inList(clanIds)})` : '');
    const byAccount = (column) => (accountIds.length ? `${column} IN (${inList(accountIds)})` : '');
    const select = async (table, parts) => {
        const where = orWhere(parts);
        if (!where) return [];
        const [rows] = await db.query(`SELECT id FROM ${table} WHERE ${where}`);
        return ids(rows);
    };

    const personIds = await select('people', ["display_name LIKE 'ITEST\\_%'", byClan('clan_id')]);
    const postIds = await select('posts', [byClan('clan_id')]);
    const familyIds = await select('families', [byClan('clan_id')]);
    const taskIds = await select('manager_tasks', [byAccount('manager_account_id'), byClan('clan_id')]);
    const convIds = await select('conversations', [byAccount('account_id')]);
    const msgIds = await select('chatbot_messages', [byAccount('account_id'), byClan('clan_id')]);
    const memIds = await select('family_memories', [byClan('clan_id')]);
    const [planRows] = await db.query("SELECT id FROM plans WHERE code LIKE 'ITEST\\_%'");
    const planIds = ids(planRows);

    // [bảng, [[cột, danh sách id]]]: điều kiện OR giữa các cặp có danh sách không rỗng.
    const plan = [
        ['chatbot_feedback', [['message_id', msgIds], ['account_id', accountIds], ['clan_id', clanIds]]],
        ['chatbot_messages', [['id', msgIds]]],
        ['conversations', [['id', convIds]]],
        ['post_comments', [['post_id', postIds], ['person_id', personIds]]],
        ['post_likes', [['post_id', postIds], ['person_id', personIds]]],
        ['posts', [['id', postIds]]],
        ['family_memory_readers', [['memory_id', memIds], ['reader_account_id', accountIds], ['reader_person_id', personIds]]],
        ['family_memories', [['id', memIds]]],
        ['children', [['family_id', familyIds], ['person_id', personIds]]],
        ['genealogy_relation_overrides', [['clan_id', clanIds], ['account_id', accountIds]]],
        ['families', [['id', familyIds]]],
        ['event_contributions', [['clan_id', clanIds], ['person_id', personIds]]],
        ['event_costs', [['clan_id', clanIds]]],
        ['fund_campaigns', [['clan_id', clanIds]]],
        ['manager_task_assignments', [['task_id', taskIds], ['member_account_id', accountIds], ['member_person_id', personIds]]],
        ['manager_tasks', [['id', taskIds]]],
        ['events', [['clan_id', clanIds]]],
        ['calendar_events', [['creator_account_id', accountIds], ['clan_id', clanIds]]],
        ['notifications', [['receiver_person_id', personIds], ['receiver_account_id', accountIds]]],
        ['media_files', [['owner_account_id', accountIds], ['owner_person_id', personIds], ['clan_id', clanIds]]],
        ['member_tree_edit_keys', [['member_account_id', accountIds], ['member_person_id', personIds]]],
        ['voice_recording_recipients', [['sender_account_id', accountIds], ['receiver_account_id', accountIds], ['sender_person_id', personIds], ['receiver_person_id', personIds]]],
        ['recordings', [['account_id', accountIds], ['clan_id', clanIds]]],
        ['payments', [['clan_id', clanIds], ['payer_account_id', accountIds]]],
        ['subscriptions', [['clan_id', clanIds]]],
        ['tree_layout_settings', [['clan_id', clanIds]]],
        ['invitations', [['clan_id', clanIds], ['invited_by_account_id', accountIds]]],
        ['archived_members', [['account_id', accountIds], ['clan_id', clanIds]]],
        ['password_reset_tokens', [['account_id', accountIds]]],
        ['user_auth_providers', [['user_id', accountIds]]],
        ['account_people', [['account_id', accountIds], ['person_id', personIds], ['clan_id', clanIds]]],
        ['account_clans', [['account_id', accountIds], ['clan_id', clanIds], ['person_id', personIds]]],
        ['accounts', [['id', accountIds]]],
        ['people', [['id', personIds]]],
        ['clans', [['id', clanIds]]],
        ['plans', [['id', planIds]]],
    ];

    const deleted = {};
    let pending = plan.filter(([, conds]) => conds.some(([, list]) => list.length));
    for (let round = 0; round < 6 && pending.length; round += 1) {
        const failed = [];
        for (const entry of pending) {
            const [table, conds] = entry;
            const where = conds.filter(([, list]) => list.length).map(([column, list]) => `\`${column}\` IN (${inList(list)})`).join(' OR ');
            try {
                const [result] = await db.query(`DELETE FROM \`${table}\` WHERE ${where}`);
                deleted[table] = (deleted[table] || 0) + (result.affectedRows || 0);
            } catch (error) {
                if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') continue; // môi trường chưa có bảng/cột này
                if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) { failed.push(entry); continue; }
                throw error;
            }
        }
        pending = failed;
    }
    if (pending.length) throw new Error(`Không dọn được bảng: ${pending.map(([table]) => table).join(', ')} (vướng khóa ngoại).`);
    return deleted;
}

module.exports = { db, EMAIL_PREFIX, NAME_PREFIX, createTempClan, createTempPerson, createTempAccount, api, login, cleanupAll };
