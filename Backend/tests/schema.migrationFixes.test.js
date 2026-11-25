// Astra (đợt cuối): chạy migration quỹ / families thật qua runPendingMigrations trên DB giả biết information_schema,
// và kiểm migrate chạy được khi pool chỉ có một kết nối (DB_CONNECTION_LIMIT=1). Không đụng DB thật.
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runPendingMigrations } = require('../scripts/sqlFiles');

const MIGRATIONS = path.join(__dirname, '..', '..', 'database', 'migrations');
const FUND = '2026_11_25_fund_tables_upgrade.sql';
const FUND_BACKFILL = '2026_11_26_fund_clan_id_backfill.sql';
const FAMILIES = '2026_11_26_families_spouse_pair_upgrade.sql';
const silent = () => {};
const sqlError = (code, message) => Object.assign(new Error(message), { code });

// Chép đúng các file cần chạy sang thư mục tạm (không có file nào khác sau mốc).
function migrationDir(names) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap2-fix-'));
    for (const name of names) fs.copyFileSync(path.join(MIGRATIONS, name), path.join(dir, name));
    return dir;
}

// ---- DB giả: bảng = { cols: { tên: { nullable } }, rows: [], indexes: { tên: [cột] } } ----
const col = (nullable = true) => ({ nullable });
const table = (cols, rows = []) => ({ cols, rows, indexes: {} });
const quoted = (text) => text.replace(/''/g, "'");

function evalCondition(cond, vars) {
    return cond.split(/\s+AND\s+/i).every((part) => {
        const [, name, op, value] = part.trim().match(/^@(\w+)\s*(=|>|<)\s*(-?\d+)$/);
        const left = Number(vars[name]);
        return op === '=' ? left === Number(value) : op === '>' ? left > Number(value) : left < Number(value);
    });
}

function evalIf(expr, vars) {
    const m = expr.match(/^IF\((.+?),\s*('(?:[^']|'')*'|-?\d+),\s*('(?:[^']|'')*'|-?\d+)\)$/is);
    const pick = evalCondition(m[1], vars) ? m[2] : m[3];
    return pick.startsWith("'") ? quoted(pick.slice(1, -1)) : Number(pick);
}

const spousePair = (row) => [Math.min(row.father_id || 0, row.mother_id || 0), Math.max(row.father_id || 0, row.mother_id || 0)];

function countSelect(db, sub) {
    let m = sub.match(/INFORMATION_SCHEMA\.COLUMNS .*TABLE_NAME = '(\w+)' AND COLUMN_NAME = '(\w+)'(?: AND IS_NULLABLE = '(YES|NO)')?/i);
    if (m) {
        const c = db.tables[m[1]]?.cols[m[2]];
        if (!c) return 0;
        return !m[3] || (m[3] === 'YES') === c.nullable ? 1 : 0;
    }
    m = sub.match(/INFORMATION_SCHEMA\.STATISTICS .*TABLE_NAME = '(\w+)' AND INDEX_NAME = '(\w+)'/i);
    if (m) return db.tables[m[1]]?.indexes[m[2]] ? 1 : 0;
    m = sub.match(/^SELECT COUNT\(\*\) FROM (\w+) WHERE (\w+) IS NULL$/i);
    if (m) return db.tables[m[1]].rows.filter((r) => r[m[2]] == null).length;
    if (/GROUP BY clan_id, spouse_a_id, spouse_b_id HAVING COUNT\(\*\) > 1/i.test(sub)) {
        const seen = new Map();
        for (const row of db.tables.families.rows) {
            const key = [row.clan_id, ...spousePair(row)].join('-');
            seen.set(key, (seen.get(key) || 0) + 1);
        }
        return [...seen.values()].filter((n) => n > 1).length;
    }
    throw new Error(`DB giả không hiểu: ${sub}`);
}

function runDdl(db, sql) {
    let m;
    if (/^SELECT 1$/i.test(sql)) return;
    if ((m = sql.match(/^SELECT (\w+) FROM (\w+) LIMIT 1$/i))) throw sqlError('ER_BAD_FIELD_ERROR', `Unknown column '${m[1]}'`);
    if ((m = sql.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+) (.+)$/i))) {
        const t = db.tables[m[1]];
        if (t.cols[m[2]]) throw sqlError('ER_DUP_FIELDNAME', 'Duplicate column');
        const generated = /GENERATED ALWAYS/i.test(m[3]);
        const notNull = /\bNOT NULL\b/i.test(m[3]) && !generated;
        const fill = /DEFAULT\s+(-?\d+)/i.exec(m[3]);
        t.cols[m[2]] = col(!notNull);
        // MySQL thêm cột NOT NULL không DEFAULT: bản ghi cũ nhận giá trị ngầm định 0.
        if (!generated) for (const row of t.rows) row[m[2]] = fill ? Number(fill[1]) : notNull ? 0 : null;
        return;
    }
    if ((m = sql.match(/^ALTER TABLE (\w+) MODIFY (\w+) INT (NOT )?NULL$/i))) {
        const t = db.tables[m[1]];
        if (m[3] && t.rows.some((r) => r[m[2]] == null)) throw sqlError('ER_INVALID_USE_OF_NULL', 'Invalid use of NULL value');
        t.cols[m[2]].nullable = !m[3];
        return;
    }
    if ((m = sql.match(/^CREATE (UNIQUE )?INDEX (\w+) ON (\w+) \(([^)]+)\)$/i))) {
        const t = db.tables[m[3]];
        const cols = m[4].split(',').map((c) => c.trim());
        if (m[1]) {
            const keys = t.rows.map((row) => cols.map((c) => (c === 'spouse_a_id' ? spousePair(row)[0] : c === 'spouse_b_id' ? spousePair(row)[1] : row[c])).join('-'));
            if (new Set(keys).size !== keys.length) throw sqlError('ER_DUP_ENTRY', 'Duplicate entry');
        }
        t.indexes[m[2]] = cols;
        return;
    }
    throw new Error(`DB giả không hiểu DDL: ${sql}`);
}

function runUpdateJoin(db, sql) {
    const m = sql.match(/^UPDATE (\w+) x JOIN events e ON e\.id = x\.event_id SET x\.clan_id = e\.clan_id WHERE x\.clan_id IS NULL OR x\.clan_id = 0$/i);
    if (!m) throw new Error(`DB giả không hiểu UPDATE: ${sql}`);
    for (const row of db.tables[m[1]].rows) {
        const event = db.tables.events.rows.find((e) => e.id === row.event_id);
        if (event && (row.clan_id == null || row.clan_id === 0)) row.clan_id = event.clan_id;
    }
}

// Một "máy chủ" giả; pool có limit kết nối: hết thì ném lỗi (pool thật sẽ chờ mãi, tức treo migrate).
function fakeServer(tables, { limit = 10 } = {}) {
    const db = { tables, vars: {}, prepared: null, applied: new Set(), calls: [] };
    let out = 0;
    const exec = async (who, sql, params) => {
        const text = String(sql).replace(/\s+/g, ' ').trim();
        db.calls.push({ who, sql: text });
        let m;
        if (/^SELECT GET_LOCK/i.test(text)) return [[{ got: 1 }]];
        if (/^SELECT RELEASE_LOCK/i.test(text)) return [[{ released: 1 }]];
        if (/^CREATE TABLE IF NOT EXISTS schema_migrations/i.test(text)) return [{}];
        if (/^SELECT filename FROM schema_migrations/i.test(text)) return [[...db.applied].map((filename) => ({ filename }))];
        if (/^INSERT INTO schema_migrations/i.test(text)) { db.applied.add(params[0]); return [{}]; }
        if (/^SET FOREIGN_KEY_CHECKS/i.test(text)) return [{}];
        if ((m = text.match(/^SET @(\w+) := \(SELECT COUNT\(\*\) (.+)\)$/i))) { db.vars[m[1]] = countSelect(db, `SELECT COUNT(*) ${m[2]}`); return [{}]; }
        if ((m = text.match(/^SET @(\w+) := (IF\(.+\))$/i))) { db.vars[m[1]] = evalIf(m[2], db.vars); return [{}]; }
        if (/^PREPARE stmt FROM @ddl$/i.test(text)) { db.prepared = db.vars.ddl; return [{}]; }
        if (/^EXECUTE stmt$/i.test(text)) { runDdl(db, db.prepared); return [{}]; }
        if (/^DEALLOCATE PREPARE stmt$/i.test(text)) return [{}];
        if (/^UPDATE /i.test(text)) { runUpdateJoin(db, text); return [{}]; }
        throw new Error(`DB giả không hiểu: ${text}`);
    };
    const exhausted = () => sqlError('POOL_EXHAUSTED', `pool hết kết nối (limit ${limit}): migrate sẽ treo`);
    db.pool = {
        query: async (sql, params) => { if (out >= limit) throw exhausted(); return exec('pool', sql, params); },
        getConnection: async () => {
            if (out >= limit) throw exhausted();
            out += 1;
            const id = `c${out}`;
            return { query: (sql, params) => exec(id, sql, params), release: () => { out -= 1; } };
        },
    };
    return db;
}

// Bảng quỹ của init.sql cũ: chưa có clan_id/campaign_id..., event_id NOT NULL.
const oldFundTables = () => ({
    events: table({ id: col(false), clan_id: col(false) }, [{ id: 10, clan_id: 5 }, { id: 11, clan_id: 6 }]),
    event_costs: table({ id: col(false), event_id: col(false), note: col() }, [{ id: 1, event_id: 10 }, { id: 2, event_id: 11 }]),
    event_contributions: table({ id: col(false), event_id: col(false), person_id: col(false) }, [{ id: 1, event_id: 11, person_id: 3 }]),
});

test('quỹ (init.sql cũ): clan_id điền từ events theo event_id rồi mới NOT NULL, không còn dòng clan_id = 0', async () => {
    const db = fakeServer(oldFundTables());
    const dir = migrationDir([FUND]);
    assert.deepStrictEqual(await runPendingMigrations(db.pool, { dir, log: silent }), [FUND]);
    assert.deepStrictEqual(db.tables.event_costs.rows.map((r) => r.clan_id), [5, 6]);
    assert.deepStrictEqual(db.tables.event_contributions.rows.map((r) => r.clan_id), [6]);
    assert.strictEqual(db.tables.event_costs.cols.clan_id.nullable, false);
    assert.strictEqual(db.tables.event_contributions.cols.clan_id.nullable, false);
    assert.strictEqual(db.tables.event_costs.cols.event_id.nullable, true);
    assert.strictEqual(db.tables.event_contributions.cols.person_id.nullable, true);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('quỹ: chạy lại lần hai không đổi gì và không lỗi', async () => {
    const db = fakeServer(oldFundTables());
    const dir = migrationDir([FUND]);
    await runPendingMigrations(db.pool, { dir, log: silent });
    db.applied.clear();
    const before = JSON.stringify(db.tables);
    await runPendingMigrations(db.pool, { dir, log: silent });
    assert.strictEqual(JSON.stringify(db.tables), before);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('quỹ: DB đã chạy bản cũ (clan_id = 0) được migration 26/11 điền lại theo event_id', async () => {
    const tables = oldFundTables();
    tables.event_costs.cols.clan_id = col(false);
    tables.event_costs.rows.forEach((r) => { r.clan_id = 0; });
    tables.event_costs.rows.push({ id: 3, event_id: null, clan_id: 0 }); // không có sự kiện: giữ nguyên
    tables.event_contributions.cols.clan_id = col(false);
    tables.event_contributions.rows.forEach((r) => { r.clan_id = 0; });
    const db = fakeServer(tables);
    const dir = migrationDir([FUND_BACKFILL]);
    await runPendingMigrations(db.pool, { dir, log: silent });
    assert.deepStrictEqual(db.tables.event_costs.rows.map((r) => r.clan_id), [5, 6, 0]);
    assert.deepStrictEqual(db.tables.event_contributions.rows.map((r) => r.clan_id), [6]);
    fs.rmSync(dir, { recursive: true, force: true });
});

const oldFamilies = (rows) => ({
    families: table({ id: col(false), clan_id: col(false), father_id: col(), mother_id: col() }, rows),
});

test('families (init.sql cũ): thêm cột cặp vợ chồng và khóa duy nhất; chạy lại an toàn', async () => {
    const db = fakeServer(oldFamilies([{ id: 1, clan_id: 5, father_id: 1, mother_id: 2 }, { id: 2, clan_id: 5, father_id: 3, mother_id: null }]));
    const dir = migrationDir([FAMILIES]);
    assert.deepStrictEqual(await runPendingMigrations(db.pool, { dir, log: silent }), [FAMILIES]);
    assert.ok(db.tables.families.cols.spouse_a_id && db.tables.families.cols.spouse_b_id);
    assert.deepStrictEqual(db.tables.families.indexes.uk_families_clan_spouse_pair, ['clan_id', 'spouse_a_id', 'spouse_b_id']);
    db.applied.clear();
    await runPendingMigrations(db.pool, { dir, log: silent });
    fs.rmSync(dir, { recursive: true, force: true });
});

test('families có cặp trùng (A-B và B-A): dừng với lỗi nói rõ, không tạo khóa, không ghi nhận file', async () => {
    const db = fakeServer(oldFamilies([{ id: 1, clan_id: 5, father_id: 1, mother_id: 2 }, { id: 2, clan_id: 5, father_id: 2, mother_id: 1 }]));
    const dir = migrationDir([FAMILIES]);
    await assert.rejects(runPendingMigrations(db.pool, { dir, log: silent }), /families_trung_cap_vo_chong_xem_dau_file_nay/);
    assert.strictEqual(db.tables.families.indexes.uk_families_clan_spouse_pair, undefined);
    assert.ok(!db.applied.has(FAMILIES));

    db.tables.families.rows.pop(); // người quản trị gộp xong
    assert.deepStrictEqual(await runPendingMigrations(db.pool, { dir, log: silent }), [FAMILIES]);
    assert.ok(db.tables.families.indexes.uk_families_clan_spouse_pair);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('DB_CONNECTION_LIMIT=1: migrate chạy hết trên kết nối giữ khóa, không mượn thêm từ pool', async () => {
    const db = fakeServer({ ...oldFundTables(), ...oldFamilies([]) }, { limit: 1 });
    const dir = migrationDir([FUND, FAMILIES, FUND_BACKFILL]);
    const ran = await runPendingMigrations(db.pool, { dir, log: silent });
    assert.deepStrictEqual(ran, [FUND, FAMILIES, FUND_BACKFILL]);
    const lockAt = db.calls.findIndex((c) => /^SELECT GET_LOCK/.test(c.sql));
    const releaseAt = db.calls.findIndex((c) => /^SELECT RELEASE_LOCK/.test(c.sql));
    const inside = db.calls.slice(lockAt, releaseAt + 1);
    assert.deepStrictEqual([...new Set(inside.map((c) => c.who))], [db.calls[lockAt].who], 'mọi câu trong khóa trên một kết nối');
    assert.ok(inside.some((c) => /^SET FOREIGN_KEY_CHECKS = 1/.test(c.sql)), 'trả FOREIGN_KEY_CHECKS sau mỗi file');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('schema và migration không dùng cú pháp chỉ TiDB có (CI e2e chạy MySQL 8)', () => {
    const TIDB_ONLY = /WITH PARSER|AUTO_RANDOM|SHARD_ROW_ID_BITS|PRE_SPLIT_REGIONS|PLACEMENT POLICY|\/\*T!/i;
    for (const dir of ['schema', 'migrations']) {
        const full = path.join(__dirname, '..', '..', 'database', dir);
        for (const name of fs.readdirSync(full).filter((n) => n.endsWith('.sql'))) {
            assert.doesNotMatch(fs.readFileSync(path.join(full, name), 'utf8'), TIDB_ONLY, `${dir}/${name}`);
        }
    }
});
