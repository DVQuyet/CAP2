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

test('allowDdl chỉ mở DDL trong ngữ cảnh migrate, request khác vẫn bị chặn', async () => {
    const previous = process.env.DISABLE_RUNTIME_DDL;
    process.env.DISABLE_RUNTIME_DDL = 'true';
    const db = require('../src/config/db');
    try {
        // Trong allowDdl câu ALTER không bị bỏ qua nên phải đi tới pool (không có DB ở đây => lỗi kết nối).
        await assert.rejects(db.allowDdl(() => db.query('ALTER TABLE t ADD COLUMN c INT')));

        // Cùng lúc, một request bên ngoài ngữ cảnh vẫn bị bỏ qua.
        const [skipped] = await db.query('ALTER TABLE t ADD COLUMN c INT');
        assert.strictEqual(skipped.affectedRows, 0);
    } finally {
        if (previous === undefined) delete process.env.DISABLE_RUNTIME_DDL;
        else process.env.DISABLE_RUNTIME_DDL = previous;
    }
});
