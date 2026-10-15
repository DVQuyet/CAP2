process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const path = require('path');
const { STEPS } = require('../src/shared/schema/registry');

test('mọi bước schema đều trỏ tới hàm được export', () => {
    for (const [label, modulePath, functionNames] of STEPS) {
        const mod = require(path.join(__dirname, '..', 'src', 'shared', 'schema', modulePath));
        for (const functionName of functionNames) {
            assert.strictEqual(typeof mod[functionName], 'function', `${label}: thiếu ${functionName}`);
        }
    }
});

test('DISABLE_RUNTIME_DDL bỏ qua DDL nhưng không chạm truy vấn thường', async () => {
    const previous = process.env.DISABLE_RUNTIME_DDL;
    process.env.DISABLE_RUNTIME_DDL = 'true';
    const db = require('../src/config/db');
    try {
        for (const sql of [
            'ALTER TABLE t ADD COLUMN c INT',
            '  create table if not exists t2 (id int)',
            'CREATE INDEX idx ON t (c)',
        ]) {
            const [result] = await db.query(sql);
            assert.strictEqual(result.affectedRows, 0);
        }
        const [viaExecute] = await db.execute('ALTER TABLE t ADD COLUMN d INT');
        assert.strictEqual(viaExecute.affectedRows, 0);
    } finally {
        if (previous === undefined) delete process.env.DISABLE_RUNTIME_DDL;
        else process.env.DISABLE_RUNTIME_DDL = previous;
    }
});
