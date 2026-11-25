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

// Cả file chạy trên MỘT kết nối: SET FOREIGN_KEY_CHECKS / SET NAMES chỉ có tác dụng trong kết nối đó.
async function runFile(db, file) {
    const statements = splitSqlStatements(fs.readFileSync(file, 'utf8'));
    const connection = typeof db.getConnection === 'function' ? await db.getConnection() : db;
    try {
        for (const statement of statements) {
            try {
                await connection.query(statement);
            } catch (error) {
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

async function runSchemaFiles(db, { dir = SCHEMA_DIR, log = console.log } = {}) {
    const results = [];
    for (const name of listSchemaFiles(dir)) {
        const count = await runFile(db, path.join(dir, name));
        results.push({ name, statements: count });
        log(`✔ schema ${name} (${count} câu lệnh)`);
    }
    return results;
}

async function runPendingMigrations(db, { dir = MIGRATIONS_DIR, baseline = BASELINE, log = console.log } = {}) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (filename)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [rows] = await db.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.filename));
    const pending = listSqlFiles(dir).filter((name) => name > baseline && !applied.has(name));
    for (const name of pending) {
        const count = await runFile(db, path.join(dir, name));
        await db.query('INSERT INTO schema_migrations (filename) VALUES (?)', [name]);
        log(`✔ migration ${name} (${count} câu lệnh)`);
    }
    if (!pending.length) log('✔ migration: không có file mới sau mốc ' + baseline);
    return pending;
}

module.exports = { BASELINE, splitSqlStatements, listSchemaFiles, runSchemaFiles, runPendingMigrations };
