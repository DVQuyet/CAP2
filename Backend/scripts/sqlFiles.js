// Chạy file .sql cho `npm run migrate`:
//   1. database/schema/*.sql theo thứ tự tên (CREATE TABLE IF NOT EXISTS + dữ liệu tối thiểu): chạy mỗi lần, idempotent.
//   2. database/migrations/*.sql có tên SAU mốc BASELINE: chạy một lần, ghi tên vào bảng schema_migrations.
//      Các file từ mốc trở về trước đã gộp vào database/schema/ (25/11/2026) nên không chạy lại.
// File .sql phải hợp cả TiDB lẫn MySQL 8: không trigger/procedure (không DELIMITER), không ALTER ... MODIFY để thêm
// AUTO_INCREMENT, không thêm cột generated STORED bằng ALTER, mỗi ALTER một việc khi việc sau dùng cột vừa thêm.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'database');
const SCHEMA_DIR = path.join(ROOT, 'schema');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const BASELINE = '2026_11_15_billing_fund_missing_schema.sql';

// Tách câu lệnh theo dấu ';' nằm ngoài chuỗi và chú thích. Bỏ chú thích '--', '#', '/* */'.
function splitSqlStatements(text) {
    if (/^\s*DELIMITER\s/im.test(text)) {
        throw new Error('File .sql có DELIMITER (trigger/procedure): TiDB không hỗ trợ, hãy viết lại không dùng.');
    }
    const statements = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (quote) {
            current += ch;
            if (ch === '\\' && quote !== '`') { current += next || ''; i += 1; continue; }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '-' && next === '-' && /\s/.test(text[i + 2] || ' ')) {
            while (i < text.length && text[i] !== '\n') i += 1;
            current += '\n';
            continue;
        }
        if (ch === '#') {
            while (i < text.length && text[i] !== '\n') i += 1;
            current += '\n';
            continue;
        }
        if (ch === '/' && next === '*') {
            const end = text.indexOf('*/', i + 2);
            i = end === -1 ? text.length : end + 1;
            current += ' ';
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') quote = ch;
        if (ch === ';') {
            if (current.trim()) statements.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) statements.push(current.trim());
    return statements;
}

const listSqlFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort() : []);
// init.sql (bảng lõi) luôn chạy đầu tiên, các file đánh số 02_, 03_… theo sau.
const listSchemaFiles = (dir) => listSqlFiles(dir).sort((a, b) => (a === 'init.sql' ? -1 : b === 'init.sql' ? 1 : a.localeCompare(b)));

const defaultLog = (line) => process.stdout.write(`${line}\n`);

// Lỗi "đã có rồi": file migration lỗi giữa chừng thì lần chạy lại gặp lại các câu đầu đã xong. Coi là đã áp dụng,
// ghi một dòng rồi chạy tiếp thay vì dừng. Chỉ dùng cho migration; migration mới vẫn nên tự kiểm information_schema.
const ALREADY_APPLIED = new Set([
    'ER_DUP_FIELDNAME', // 1060 cột đã có
    'ER_DUP_KEYNAME', // 1061 chỉ mục đã có
    'ER_TABLE_EXISTS_ERROR', // 1050 bảng đã có
    'ER_CANT_DROP_FIELD_OR_KEY', // 1091 cột/chỉ mục cần xóa đã không còn
    'ER_FK_DUP_NAME', // 1826 khóa ngoại đã có
]);

// Cả file chạy trên MỘT kết nối: SET FOREIGN_KEY_CHECKS / SET NAMES chỉ có tác dụng trong kết nối đó.
async function runFile(db, file, { tolerateApplied = false, log = defaultLog } = {}) {
    const statements = splitSqlStatements(fs.readFileSync(file, 'utf8'));
    const connection = typeof db.getConnection === 'function' ? await db.getConnection() : db;
    try {
        for (const statement of statements) {
            try {
                await connection.query(statement);
            } catch (error) {
                if (tolerateApplied && ALREADY_APPLIED.has(error.code)) {
                    log(`  · ${path.basename(file)}: bỏ qua câu đã áp dụng (${error.code}): ${statement.slice(0, 80)}`);
                    continue;
                }
                error.message = `${path.basename(file)}: ${error.message}\n  câu lệnh: ${statement.slice(0, 160)}`;
                throw error;
            }
        }
    } finally {
        if (connection !== db) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
            connection.release();
        }
    }
    return statements.length;
}

async function runSchemaFiles(db, { dir = SCHEMA_DIR, log = defaultLog } = {}) {
    const results = [];
    for (const name of listSchemaFiles(dir)) {
        const count = await runFile(db, path.join(dir, name), { log });
        results.push({ name, statements: count });
        log(`✔ schema ${name} (${count} câu lệnh)`);
    }
    return results;
}

// Hai tiến trình `npm run migrate` cùng lúc (2 máy, 2 lần deploy): khóa tên theo DB, giữ trên một kết nối riêng
// từ lúc đọc schema_migrations tới lúc ghi nhận file cuối. GET_LOCK/RELEASE_LOCK có trên cả MySQL 8 và TiDB.
const LOCK_NAME = 'cap2_schema_migrations';
const LOCK_TIMEOUT_SECONDS = 120;

async function withMigrationLock(db, callback, { name = LOCK_NAME, timeout = LOCK_TIMEOUT_SECONDS } = {}) {
    const connection = typeof db.getConnection === 'function' ? await db.getConnection() : db;
    try {
        const [rows] = await connection.query('SELECT GET_LOCK(?, ?) AS got', [name, timeout]);
        if (Number(rows?.[0]?.got) !== 1) {
            throw new Error(`Tiến trình migrate khác đang giữ khóa ${name} quá ${timeout} giây; chờ nó xong rồi chạy lại.`);
        }
        try {
            return await callback();
        } finally {
            await connection.query('SELECT RELEASE_LOCK(?) AS released', [name]).catch(() => {});
        }
    } finally {
        if (connection !== db) connection.release();
    }
}

async function runPendingMigrations(db, { dir = MIGRATIONS_DIR, baseline = BASELINE, log = defaultLog, lock = {} } = {}) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (filename)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return withMigrationLock(db, async () => {
        const [rows] = await db.query('SELECT filename FROM schema_migrations');
        const applied = new Set(rows.map((row) => row.filename));
        const pending = listSqlFiles(dir).filter((name) => name > baseline && !applied.has(name));
        for (const name of pending) {
            const count = await runFile(db, path.join(dir, name), { tolerateApplied: true, log });
            await db.query('INSERT INTO schema_migrations (filename) VALUES (?)', [name]);
            log(`✔ migration ${name} (${count} câu lệnh)`);
        }
        if (!pending.length) log('✔ migration: không có file mới sau mốc ' + baseline);
        return pending;
    }, lock);
}

module.exports = {
    BASELINE, LOCK_NAME, ALREADY_APPLIED, splitSqlStatements, listSchemaFiles, runSchemaFiles, runPendingMigrations, withMigrationLock,
};
