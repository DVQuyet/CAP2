// Báo cáo chất lượng dữ liệu (CHỈ ĐỌC: toàn bộ truy vấn là SELECT, không sửa gì). Bỏ qua dữ liệu tạm của test (ITEST_/itest_).
//   node scripts/data-quality-report.js
require('../src/config/loadEnv');
const db = require('../src/config/db');

const SAMPLE = 10;
// Điều kiện loại dữ liệu tạm của test tích hợp/QA, và người do scripts/load-test-family-tree.js sinh ra ("Load Test N":
// dữ liệu giả để đo tải, làm nhiễu kết quả).
const NOT_TEMP_PERSON = "p.display_name NOT LIKE 'ITEST\\_%' AND p.display_name NOT LIKE 'Load Test %' AND p.clan_id NOT IN (SELECT id FROM clans WHERE clan_name LIKE 'ITEST\\_%')";
const NOT_TEMP_ACCOUNT = "a.email NOT LIKE 'itest\\_%@example.test'";

const CHECKS = [
    {
        key: 'display_name_is_email',
        title: 'Tài khoản có tên hiển thị là email',
        sql: `SELECT a.id AS account_id, p.id AS person_id, p.display_name
              FROM accounts a JOIN people p ON p.id = a.person_id
              WHERE p.display_name LIKE '%@%' AND ${NOT_TEMP_ACCOUNT} AND ${NOT_TEMP_PERSON}`,
    },
    {
        key: 'active_account_without_person',
        title: 'Tài khoản đang hoạt động nhưng chưa gắn với người nào trên cây',
        sql: `SELECT a.id AS account_id, a.email
              FROM accounts a
              WHERE a.status = 'active' AND a.role_id <> 1 AND a.person_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM account_clans ac WHERE ac.account_id = a.id AND ac.person_id IS NOT NULL)
                AND ${NOT_TEMP_ACCOUNT}`,
    },
    {
        key: 'exact_precision_but_first_of_year',
        title: "Ngày sinh/mất có độ chính xác 'exact' nhưng rơi vào 01/01 (dấu hiệu chỉ biết năm)",
        sql: `SELECT p.id AS person_id, p.display_name,
                     DATE_FORMAT(p.birth_date, '%Y-%m-%d') AS birth_date, DATE_FORMAT(p.death_date, '%Y-%m-%d') AS death_date
              FROM people p
              WHERE ((p.birth_date IS NOT NULL AND p.birth_date_precision = 'exact' AND MONTH(p.birth_date) = 1 AND DAY(p.birth_date) = 1)
                  OR (p.death_date IS NOT NULL AND p.death_date_precision = 'exact' AND MONTH(p.death_date) = 1 AND DAY(p.death_date) = 1))
                AND ${NOT_TEMP_PERSON}`,
    },
    {
        key: 'orphan_people',
        title: 'Người không thuộc gia đình nào và không có quan hệ nào (node mồ côi)',
        sql: `SELECT p.id AS person_id, p.display_name, p.clan_id
              FROM people p
              WHERE NOT EXISTS (SELECT 1 FROM families f WHERE f.father_id = p.id OR f.mother_id = p.id)
                AND NOT EXISTS (SELECT 1 FROM children c WHERE c.person_id = p.id)
                AND ${NOT_TEMP_PERSON}`,
    },
    {
        key: 'child_born_before_parent',
        title: 'Con có năm sinh trước năm sinh của cha hoặc mẹ',
        sql: `SELECT c.person_id AS child_id, ch.display_name AS child_name, DATE_FORMAT(ch.birth_date, '%Y-%m-%d') AS child_birth,
                     par.id AS parent_id, par.display_name AS parent_name, DATE_FORMAT(par.birth_date, '%Y-%m-%d') AS parent_birth
              FROM children c
              JOIN families f ON f.id = c.family_id
              JOIN people ch ON ch.id = c.person_id
              JOIN people par ON par.id IN (f.father_id, f.mother_id)
              WHERE ch.birth_date IS NOT NULL AND par.birth_date IS NOT NULL AND YEAR(ch.birth_date) < YEAR(par.birth_date)
                AND ${NOT_TEMP_PERSON.replace(/\bp\./g, 'ch.')}`,
    },
    {
        key: 'child_in_several_families',
        title: 'Một người là con trong nhiều hơn một gia đình (có thể là con nuôi hợp lệ hoặc nhập trùng)',
        sql: `SELECT c.person_id, p.display_name, COUNT(DISTINCT c.family_id) AS family_count
              FROM children c JOIN people p ON p.id = c.person_id
              WHERE ${NOT_TEMP_PERSON}
              GROUP BY c.person_id, p.display_name
              HAVING COUNT(DISTINCT c.family_id) > 1`,
    },
];

(async () => {
    const lines = [];
    for (const check of CHECKS) {
        try {
            const [rows] = await db.query(check.sql);
            lines.push(`## ${check.title}: ${rows.length}`);
            rows.slice(0, SAMPLE).forEach((row) => lines.push(`   - ${JSON.stringify(row)}`));
            if (rows.length > SAMPLE) lines.push(`   … và ${rows.length - SAMPLE} dòng nữa`);
        } catch (error) {
            lines.push(`## ${check.title}: LỖI TRUY VẤN (${error.code || error.message})`);
        }
    }
    const [[people]] = await db.query("SELECT COUNT(*) AS n FROM people p WHERE " + NOT_TEMP_PERSON);
    const [[accounts]] = await db.query("SELECT COUNT(*) AS n FROM accounts a WHERE " + NOT_TEMP_ACCOUNT);
    const [[loadTest]] = await db.query("SELECT COUNT(*) AS n FROM people WHERE display_name LIKE 'Load Test %'");
    console.log(`Báo cáo chất lượng dữ liệu (chỉ đọc). Tổng: ${people.n} người, ${accounts.n} tài khoản (không tính dữ liệu tạm; đã loại ${loadTest.n} người "Load Test").\n`);
    console.log(lines.join('\n'));
    process.exit(0);
})().catch((error) => {
    console.error('Lỗi:', error.message);
    process.exit(1);
});
