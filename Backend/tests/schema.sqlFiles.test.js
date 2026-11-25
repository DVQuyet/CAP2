// S3: schema dựng lại được từ repo. Kiểm bằng DB giả, không đụng DB thật.
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { splitSqlStatements, listSchemaFiles, runSchemaFiles, runPendingMigrations, BASELINE } = require('../scripts/sqlFiles');

const SCHEMA_DIR = path.join(__dirname, '..', '..', 'database', 'schema');
const readSchema = () => fs.readdirSync(SCHEMA_DIR).filter((n) => n.endsWith('.sql')).sort()
    .map((name) => ({ name, text: fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8') }));

function fakeDb(applied = []) {
    const calls = [];
    const query = async (sql, params) => {
        calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
        if (/^SELECT filename FROM schema_migrations/.test(String(sql).trim())) return [applied.map((filename) => ({ filename }))];
        return [[]];
    };
    let released = 0;
    return {
        calls, query, released: () => released,
        getConnection: async () => ({ query, release: () => { released += 1; } }),
    };
}

test('tách câu lệnh: bỏ chú thích, giữ dấu ; trong chuỗi', () => {
    const sql = "-- chú thích; không tách\nINSERT INTO t VALUES ('a;b', \"c;d\");\n/* x; y */ SELECT `x;y` FROM t; # cuối;\n";
    assert.deepStrictEqual(splitSqlStatements(sql), ["INSERT INTO t VALUES ('a;b', \"c;d\")", 'SELECT `x;y` FROM t']);
});

test('file có DELIMITER (trigger/procedure) bị từ chối', () => {
    assert.throws(() => splitSqlStatements('DELIMITER $$\nCREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW BEGIN END$$'), /DELIMITER/);
});

test('schema trong repo đủ 48 bảng, mỗi bảng một lần, hợp TiDB', () => {
    const tables = [];
    for (const { name, text } of readSchema()) {
        const statements = splitSqlStatements(text);
        for (const statement of statements) {
            const match = statement.match(/^CREATE TABLE IF NOT EXISTS `?([a-z_]+)`?/i);
            if (match) tables.push(match[1]);
            assert.ok(!/^CREATE TABLE (?!IF NOT EXISTS)/i.test(statement), `${name}: CREATE TABLE phải có IF NOT EXISTS`);
            assert.ok(!/MODIFY\s+`?\w+`?\s+[^,]*AUTO_INCREMENT/i.test(statement), `${name}: không MODIFY thêm AUTO_INCREMENT`);
            assert.ok(!/GENERATED ALWAYS AS[^,]*STORED/i.test(statement), `${name}: không dùng cột generated STORED`);
        }
        assert.ok(text.split('\n').length <= 640, `${name} quá dài`);
    }
    assert.strictEqual(tables.length, 48);
    assert.strictEqual(new Set(tables).size, 48);
    for (const required of ['plans', 'subscriptions', 'payments', 'fund_campaigns', 'password_reset_tokens', 'roles', 'account_people']) {
        assert.ok(tables.includes(required), `thiếu bảng ${required}`);
    }
});

test('dữ liệu mẫu có ba vai trò và gói FREE, chạy lại không nhân bản', () => {
    const seed = readSchema().map((f) => f.text).join('\n');
    assert.match(seed, /INSERT IGNORE INTO roles[\s\S]*'admin'[\s\S]*'manager'[\s\S]*'member'/);
    assert.match(seed, /INSERT IGNORE INTO plans[\s\S]*'FREE'/);
});

test('runSchemaFiles chạy mọi file theo thứ tự tên, mỗi file trên một kết nối', async () => {
    const db = fakeDb();
    const results = await runSchemaFiles(db, { log: () => {} });
    assert.strictEqual(results[0].name, 'init.sql');
    assert.deepStrictEqual(results.map((r) => r.name), listSchemaFiles(SCHEMA_DIR));
    assert.strictEqual(results.length, readSchema().length);
    assert.strictEqual(db.released(), results.length);
    assert.ok(db.calls.some((c) => /^CREATE TABLE IF NOT EXISTS `plans`/.test(c.sql)));
});

test('migration: chỉ chạy file sau mốc và chưa ghi trong schema_migrations', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap2-mig-'));
    fs.writeFileSync(path.join(dir, BASELINE), 'ALTER TABLE cu ADD COLUMN x INT;');
    fs.writeFileSync(path.join(dir, '2026_12_01_a.sql'), 'ALTER TABLE a ADD COLUMN y INT;');
    fs.writeFileSync(path.join(dir, '2026_12_02_b.sql'), 'ALTER TABLE b ADD COLUMN z INT;');
    const db = fakeDb(['2026_12_01_a.sql']);
    const ran = await runPendingMigrations(db, { dir, log: () => {} });
    assert.deepStrictEqual(ran, ['2026_12_02_b.sql']);
    assert.ok(!db.calls.some((c) => /ALTER TABLE (cu|a) /.test(c.sql)));
    assert.ok(db.calls.some((c) => c.sql === 'ALTER TABLE b ADD COLUMN z INT'));
    assert.deepStrictEqual(db.calls.at(-1).params, ['2026_12_02_b.sql']);
    fs.rmSync(dir, { recursive: true, force: true });
});
