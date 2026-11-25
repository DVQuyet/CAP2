// Dữ liệu cho bộ thử trình duyệt (e2e/): ba tài khoản admin/manager/member và một dòng họ nhỏ 5 người.
// Chạy lại được: xoá dữ liệu e2e cũ (email e2e_*@example.test, dòng họ "E2E Họ Thử") rồi tạo lại.
// CHỈ chạy trên DB thử: dừng nếu DB_NAME trống, là defaultdb, không nằm trong danh sách DB thử, hoặc DB đang nối không trùng DB_NAME.
//   node scripts/e2e-seed.js        (Playwright tự gọi trong e2e/global-setup.js)
require('../src/config/loadEnv');
const path = require('path');
const bcrypt = require('bcryptjs');

const accounts = require(path.join(__dirname, '..', '..', 'e2e', 'accounts.json'));
const FORBIDDEN_DATABASES = new Set(['defaultdb']);
// Chỉ nhận DB thử được nêu rõ (cap2_test trên TiDB, cap2_ci trong CI); thêm DB khác qua E2E_ALLOWED_DATABASES.
const ALLOWED_DATABASES = new Set(['cap2_test', 'cap2_ci',
    ...String(process.env.E2E_ALLOWED_DATABASES || '').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean)]);
const ROLE_IDS = { admin: 1, manager: 2, member: 3 };

function assertTestDatabaseName(name) {
    const value = String(name || '').trim();
    if (!value) throw new Error('DB_NAME trống: không biết đang trỏ DB nào, dừng.');
    if (FORBIDDEN_DATABASES.has(value.toLowerCase())) throw new Error(`DB_NAME=${value} là DB thật, dừng. Dùng cap2_test hoặc MySQL thử.`);
    if (!ALLOWED_DATABASES.has(value.toLowerCase())) throw new Error(`DB_NAME=${value} không nằm trong danh sách DB thử (${[...ALLOWED_DATABASES].join(', ')}), dừng.`);
    if (process.env.NODE_ENV === 'production') throw new Error('NODE_ENV=production, dừng.');
    return value;
}

async function resetE2eData(connection) {
    const emails = ['admin', 'manager', 'member'].map((role) => accounts[role].email);
    const [clans] = await connection.query('SELECT id FROM clans WHERE clan_name = ?', [accounts.clanName]);
    await connection.query('DELETE FROM accounts WHERE email IN (?)', [emails]);
    for (const { id } of clans) {
        for (const table of ['account_clans', 'account_people', 'subscriptions', 'events', 'manager_tasks', 'calendar_events']) {
            await connection.query(`DELETE FROM ${table} WHERE clan_id = ?`, [id]).catch((error) => {
                if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) throw error;
            });
        }
        await connection.query('DELETE c FROM children c JOIN families f ON f.id = c.family_id WHERE f.clan_id = ?', [id]);
        await connection.query('DELETE FROM families WHERE clan_id = ?', [id]);
        await connection.query('DELETE FROM people WHERE clan_id = ?', [id]);
        await connection.query('DELETE FROM clans WHERE id = ?', [id]);
    }
}

async function freePlanId(connection) {
    const [rows] = await connection.query("SELECT id FROM plans WHERE UPPER(code) = 'FREE' LIMIT 1");
    if (rows.length) return rows[0].id;
    throw new Error("Chưa có gói FREE: chạy `npm run migrate` trước (database/schema/04_seed.sql).");
}

async function seed(connection) {
    const [clan] = await connection.query('INSERT INTO clans (clan_name, history) VALUES (?, ?)', [accounts.clanName, 'Dòng họ giả cho bộ thử trình duyệt.']);
    const clanId = clan.insertId;
    await connection.query("INSERT INTO subscriptions (clan_id, plan_id, status, started_at) VALUES (?, ?, 'free', NOW())", [clanId, await freePlanId(connection)]);

    const person = async (name, gender, generation, extra = {}) => {
        const [result] = await connection.query(
            'INSERT INTO people (clan_id, display_name, gender, generation, birth_date, death_date, is_living) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [clanId, name, gender, generation, extra.birth || null, extra.death || null, extra.death ? 0 : 1]
        );
        return result.insertId;
    };
    const grandfather = await person('Trần Văn Tổ', 1, 1, { birth: '1930-02-10', death: '2005-08-20' });
    const grandmother = await person('Nguyễn Thị Hiền', 2, 1, { birth: '1934-05-01' });
    const manager = await person(accounts.manager.name, 1, 2, { birth: '1962-03-15' });
    const member = await person(accounts.member.name, 2, 2, { birth: '1966-11-02' });
    const grandson = await person('Trần Văn Nam', 1, 3, { birth: '1990-07-07' });

    const [family] = await connection.query('INSERT INTO families (clan_id, father_id, mother_id) VALUES (?, ?, ?)', [clanId, grandfather, grandmother]);
    await connection.query('INSERT INTO children (family_id, person_id, sort_order) VALUES (?, ?, 1), (?, ?, 2)', [family.insertId, manager, family.insertId, member]);
    const [family2] = await connection.query('INSERT INTO families (clan_id, father_id, mother_id) VALUES (?, ?, NULL)', [clanId, manager]);
    await connection.query('INSERT INTO children (family_id, person_id, sort_order) VALUES (?, ?, 1)', [family2.insertId, grandson]);

    const hash = await bcrypt.hash(accounts.password, 10);
    const account = async (role, personId) => {
        const [result] = await connection.query(
            "INSERT INTO accounts (email, password, person_id, role_id, status, profile_completed) VALUES (?, ?, ?, ?, 'active', 1)",
            [accounts[role].email, hash, personId, ROLE_IDS[role]]
        );
        if (personId) {
            await connection.query("INSERT INTO account_clans (account_id, clan_id, person_id, status) VALUES (?, ?, ?, 'active')", [result.insertId, clanId, personId]);
        }
        return result.insertId;
    };
    await account('admin', null);
    await account('manager', manager);
    await account('member', member);
    return { clanId, people: 5 };
}

async function main() {
    const expected = assertTestDatabaseName(process.env.DB_NAME);
    const db = require('../src/config/db');
    const connection = await db.getConnection();
    try {
        const [[{ name }]] = await connection.query('SELECT DATABASE() AS name');
        if (name !== expected || !ALLOWED_DATABASES.has(String(name).toLowerCase())) {
            throw new Error(`Đang nối DB "${name}", không phải DB thử "${expected}", dừng.`);
        }
        await connection.beginTransaction();
        await resetE2eData(connection);
        const result = await seed(connection);
        await connection.commit();
        process.stdout.write(`[e2e-seed] ${name}: dòng họ #${result.clanId}, ${result.people} người, 3 tài khoản.
`);
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
        await db.end();
    }
}

if (require.main === module) {
    main().catch((error) => { console.error(`[e2e-seed] ${error.message}`); process.exit(1); });
}

module.exports = { assertTestDatabaseName };
