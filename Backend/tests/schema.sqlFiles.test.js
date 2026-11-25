// S3: schema dựng lại được từ repo. Kiểm bằng DB giả, không đụng DB thật.
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { splitSqlStatements, listSchemaFiles, runSchemaFiles, runPendingMigrations, BASELINE, LOCK_NAME } = require('../scripts/sqlFiles');

const SCHEMA_DIR = path.join(__dirname, '..', '..', 'database', 'schema');
const readSchema = () => fs.readdirSync(SCHEMA_DIR).filter((n) => n.endsWith('.sql')).sort()
    .map((name) => ({ name, text: fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8') }));

// DB giả: mỗi kết nối có số và nhật ký riêng; nhớ cột đã thêm, bản ghi INSERT theo khóa UNIQUE, khóa GET_LOCK dùng chung
// giữa các "tiến trình" (nhiều fakeDb cùng một state) để thử migrate song song.
function sharedState() {
    return { applied: new Set(), columns: new Set(), rows: { roles: [], plans: [] }, lock: null, waiters: [], failOnce: new Set() };
}
const UNIQUE_KEYS = { roles: ['id', 'role_name'], plans: ['code'] };

function splitTuples(valuesText) {
    const tuples = [];
    let depth = 0; let quote = null; let current = ''; let fields = [];
    for (const ch of valuesText) {
        if (quote) { if (ch === quote) quote = null; else current += ch; continue; }
        if (ch === "'") { quote = ch; continue; }
        if (ch === '(') { depth += 1; if (depth === 1) { fields = []; current = ''; continue; } }
        if (ch === ')') { depth -= 1; if (depth === 0) { fields.push(current.trim()); tuples.push(fields); continue; } }
        if (ch === ',' && depth === 1) { fields.push(current.trim()); current = ''; continue; }
        if (depth >= 1) current += ch;
    }
    return tuples;
}

function insertRows(state, sql) {
    const match = sql.match(/^INSERT (IGNORE )?INTO (\w+) \(([^)]*)\) VALUES (.*)$/is);
    if (!match || !UNIQUE_KEYS[match[2]]) return;
    const [, ignore, table, colText, valuesText] = match;
    const cols = colText.split(',').map((c) => c.trim());
    for (const values of splitTuples(valuesText)) {
        const row = Object.fromEntries(cols.map((c, i) => [c, values[i]]));
        const dup = state.rows[table].some((old) => UNIQUE_KEYS[table].some((k) => row[k] !== undefined && old[k] === row[k]));
        if (dup && ignore) continue;
        if (dup) throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
        state.rows[table].push(row);
    }
}

async function getLock(state, connId, timeout) {
    if (!state.lock || state.lock === connId) { state.lock = connId; return 1; }
    if (!timeout) return 0;
    await new Promise((resolve) => state.waiters.push(resolve));
    state.lock = connId;
    return 1;
}

function releaseLock(state, connId) {
    if (state.lock !== connId) return 0;
    state.lock = null;
    const next = state.waiters.shift();
    if (next) { state.lock = 'handoff'; next(); }
    return 1;
}

let connectionSeq = 0;
function fakeDb(applied = [], state = sharedState()) {
    applied.forEach((name) => state.applied.add(name));
    const calls = [];
    let released = 0;
    const makeQuery = (connId) => async (sql, params) => {
        const text = String(sql).replace(/\s+/g, ' ').trim();
        calls.push({ conn: connId, sql: text, params });
        if (state.failOnce.delete(text)) throw Object.assign(new Error('lỗi giả giữa file'), { code: 'ER_PARSE_ERROR' });
        if (/^SELECT GET_LOCK/.test(text)) return [[{ got: await getLock(state, connId, params[1]) }]];
        if (/^SELECT RELEASE_LOCK/.test(text)) return [[{ released: releaseLock(state, connId) }]];
        if (/^SELECT filename FROM schema_migrations/.test(text)) return [[...state.applied].map((filename) => ({ filename }))];
        if (/^INSERT INTO schema_migrations/.test(text)) {
            if (state.applied.has(params[0])) throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
            state.applied.add(params[0]);
            return [{}];
        }
        const add = text.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
        if (add) {
            const key = `${add[1]}.${add[2]}`;
            if (state.columns.has(key)) throw Object.assign(new Error('Duplicate column name'), { code: 'ER_DUP_FIELDNAME' });
            state.columns.add(key);
        }
        insertRows(state, text);
        await new Promise((resolve) => setImmediate(resolve));
        return [[]];
    };
    return {
        state, calls, query: makeQuery('pool'), released: () => released,
        getConnection: async () => {
            connectionSeq += 1;
            const connId = `c${connectionSeq}`;
            return { query: makeQuery(connId), release: () => { released += 1; } };
        },
    };
}

const tmpMigrations = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap2-mig-'));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    return dir;
};
const silent = () => {};

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

test('chạy schema hai lần: vai trò và gói FREE mỗi mã đúng một bản ghi (DB giả có UNIQUE)', async () => {
    const db = fakeDb();
    await runSchemaFiles(db, { log: silent });
    await runSchemaFiles(db, { log: silent });
    const count = (table, key, value) => db.state.rows[table].filter((row) => row[key] === value).length;
    for (const name of ['admin', 'manager', 'member']) assert.strictEqual(count('roles', 'role_name', name), 1, name);
    assert.strictEqual(count('plans', 'code', 'FREE'), 1);
    assert.strictEqual(db.state.rows.roles.length, 3);
    assert.strictEqual(db.state.rows.plans.length, 1);
});

test('runSchemaFiles chạy mọi file theo thứ tự tên, mọi câu của một file trên cùng một kết nối', async () => {
    const db = fakeDb();
    const results = await runSchemaFiles(db, { log: silent });
    assert.strictEqual(results[0].name, 'init.sql');
    assert.deepStrictEqual(results.map((r) => r.name), listSchemaFiles(SCHEMA_DIR));
    assert.strictEqual(results.length, readSchema().length);
    assert.strictEqual(db.released(), results.length);
    assert.ok(db.calls.some((c) => /^CREATE TABLE IF NOT EXISTS `plans`/.test(c.sql)));

    // Nhật ký theo kết nối: mỗi file một kết nối riêng, không câu nào lọt sang kết nối khác hay pool.
    assert.ok(!db.calls.some((c) => c.conn === 'pool'), 'không câu nào chạy qua pool');
    let offset = 0;
    const connections = [];
    for (const { name, statements } of results) {
        const slice = db.calls.slice(offset, offset + statements);
        const conns = new Set(slice.map((c) => c.conn));
        assert.strictEqual(conns.size, 1, `${name}: mọi câu phải chung một kết nối`);
        const [conn] = conns;
        assert.strictEqual(db.calls[offset + statements].conn, conn, `${name}: SET FOREIGN_KEY_CHECKS = 1 trên đúng kết nối đó`);
        connections.push(conn);
        offset += statements + 1;
    }
    assert.strictEqual(new Set(connections).size, results.length);
});

test('logger mặc định ghi qua process.stdout.write, không dùng console.log', async (t) => {
    const lines = [];
    const originalWrite = process.stdout.write;
    const originalLog = console.log;
    let consoleCalls = 0;
    // Chỉ giữ dòng của migrate; dòng khác (báo cáo của node --test) vẫn đi ra stdout thật.
    process.stdout.write = (chunk, ...rest) => {
        if (/^✔ schema /.test(String(chunk))) { lines.push(String(chunk)); return true; }
        return originalWrite.call(process.stdout, chunk, ...rest);
    };
    console.log = () => { consoleCalls += 1; };
    t.after(() => { process.stdout.write = originalWrite; console.log = originalLog; });
    await runSchemaFiles(fakeDb());
    process.stdout.write = originalWrite;
    console.log = originalLog;
    assert.strictEqual(consoleCalls, 0);
    assert.ok(lines.some((line) => /^✔ schema init\.sql \(\d+ câu lệnh\)\n$/.test(line)));
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
    assert.deepStrictEqual(db.calls.find((c) => /^INSERT INTO schema_migrations/.test(c.sql)).params, ['2026_12_02_b.sql']);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('migration mới (sau mốc) đổi schema từng bước có kiểm information_schema', () => {
    const dir = path.join(__dirname, '..', '..', 'database', 'migrations');
    const files = fs.readdirSync(dir).filter((n) => n.endsWith('.sql') && n > BASELINE);
    assert.ok(files.includes('2026_11_25_fund_tables_upgrade.sql'));
    for (const name of files) {
        const statements = splitSqlStatements(fs.readFileSync(path.join(dir, name), 'utf8'));
        for (const statement of statements) {
            assert.ok(!/^(ALTER TABLE|CREATE (UNIQUE )?INDEX|DROP )/i.test(statement), `${name}: đổi schema trực tiếp, cần bọc IF(...): ${statement.slice(0, 80)}`);
            if (/^SET @ddl/i.test(statement)) assert.match(statement, /IF\(@\w+ = [01], '/, `${name}: @ddl phải theo kết quả kiểm`);
        }
    }
    const upgrade = fs.readFileSync(path.join(dir, '2026_11_25_fund_tables_upgrade.sql'), 'utf8');
    for (const table of ['event_costs', 'event_contributions']) {
        assert.match(upgrade, new RegExp(`ALTER TABLE ${table} ADD COLUMN campaign_id INT NULL AFTER event_id`));
        assert.match(upgrade, new RegExp(`ALTER TABLE ${table} MODIFY event_id INT NULL`));
    }
    assert.match(upgrade, /ALTER TABLE event_contributions MODIFY person_id INT NULL/);
    const init = fs.readFileSync(path.join(SCHEMA_DIR, 'init.sql'), 'utf8');
    for (const table of ['event_costs', 'event_contributions']) {
        const body = init.slice(init.indexOf(`CREATE TABLE IF NOT EXISTS \`${table}\``)).split(';')[0];
        assert.match(body, /`event_id` int DEFAULT NULL/, `${table}.event_id phải cho NULL`);
        if (table === 'event_contributions') assert.match(body, /`person_id` int DEFAULT NULL/);
    }
});

test('migration lỗi giữa file: lần sau chạy lại không dừng ở câu đã áp dụng, chạy nốt rồi mới ghi nhận', async () => {
    const name = '2026_12_03_nhieu_buoc.sql';
    const dir = tmpMigrations({ [name]: 'ALTER TABLE t ADD COLUMN a INT;\nSELECT 2;\nALTER TABLE t ADD COLUMN b INT;' });
    const state = sharedState();
    state.failOnce.add('SELECT 2');
    const lines = [];
    await assert.rejects(runPendingMigrations(fakeDb([], state), { dir, log: silent }), /nhieu_buoc\.sql: lỗi giả giữa file/);
    assert.ok(state.columns.has('t.a'));
    assert.ok(!state.columns.has('t.b'));
    assert.ok(!state.applied.has(name), 'lỗi thì chưa ghi nhận');
    assert.strictEqual(state.lock, null, 'lỗi vẫn nhả khóa');

    const ran = await runPendingMigrations(fakeDb([], state), { dir, log: (line) => lines.push(line) });
    assert.deepStrictEqual(ran, [name]);
    assert.ok(state.columns.has('t.b'));
    assert.ok(state.applied.has(name));
    assert.ok(lines.some((line) => /bỏ qua câu đã áp dụng \(ER_DUP_FIELDNAME\)/.test(line)));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('schema (không phải migration) không nuốt lỗi "đã có"', async () => {
    const dir = tmpMigrations({ 'init.sql': 'ALTER TABLE t ADD COLUMN a INT;\nALTER TABLE t ADD COLUMN a INT;' });
    await assert.rejects(runSchemaFiles(fakeDb(), { dir, log: silent }), /Duplicate column/);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('migration giữ GET_LOCK trên một kết nối từ lúc đọc lịch sử tới lúc ghi nhận rồi RELEASE_LOCK', async () => {
    const dir = tmpMigrations({ '2026_12_04_x.sql': 'ALTER TABLE t ADD COLUMN x INT;' });
    const db = fakeDb();
    await runPendingMigrations(db, { dir, log: silent });
    const sqls = db.calls.map((c) => c.sql);
    const lockAt = sqls.findIndex((s) => /^SELECT GET_LOCK/.test(s));
    const readAt = sqls.findIndex((s) => /^SELECT filename FROM schema_migrations/.test(s));
    const recordAt = sqls.findIndex((s) => /^INSERT INTO schema_migrations/.test(s));
    const releaseAt = sqls.findIndex((s) => /^SELECT RELEASE_LOCK/.test(s));
    assert.ok(lockAt >= 0 && lockAt < readAt && readAt < recordAt && recordAt < releaseAt, sqls.join(' | '));
    assert.strictEqual(db.calls[lockAt].conn, db.calls[releaseAt].conn);
    assert.notStrictEqual(db.calls[lockAt].conn, 'pool');
    assert.deepStrictEqual(db.calls[lockAt].params, [LOCK_NAME, 120]);
    assert.strictEqual(db.state.lock, null);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('hai tiến trình migrate song song: mỗi file chạy đúng một lần', async () => {
    const dir = tmpMigrations({
        '2026_12_05_a.sql': 'ALTER TABLE t ADD COLUMN a INT;\nALTER TABLE t ADD COLUMN a2 INT;',
        '2026_12_06_b.sql': 'ALTER TABLE t ADD COLUMN b INT;',
    });
    const state = sharedState();
    const first = fakeDb([], state);
    const second = fakeDb([], state);
    const [ranFirst, ranSecond] = await Promise.all([
        runPendingMigrations(first, { dir, log: silent }),
        runPendingMigrations(second, { dir, log: silent }),
    ]);
    assert.deepStrictEqual([...ranFirst, ...ranSecond].sort(), ['2026_12_05_a.sql', '2026_12_06_b.sql']);
    const alters = [...first.calls, ...second.calls].filter((c) => /^ALTER TABLE/.test(c.sql));
    assert.strictEqual(alters.length, 3, 'không câu ALTER nào chạy hai lần');
    assert.strictEqual(state.lock, null);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('không lấy được khóa (quá thời gian chờ) thì dừng, không chạy migration nào', async () => {
    const dir = tmpMigrations({ '2026_12_07_x.sql': 'ALTER TABLE t ADD COLUMN x INT;' });
    const state = sharedState();
    state.lock = 'tien-trinh-khac';
    const db = fakeDb([], state);
    await assert.rejects(runPendingMigrations(db, { dir, log: silent, lock: { timeout: 0 } }), /đang giữ khóa/);
    assert.ok(!db.calls.some((c) => /^ALTER TABLE|^SELECT filename/.test(c.sql)));
    assert.strictEqual(db.released() >= 1, true, 'kết nối giữ khóa vẫn được trả');
    fs.rmSync(dir, { recursive: true, force: true });
});
