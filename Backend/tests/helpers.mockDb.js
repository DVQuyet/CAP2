// Giả lập pool MySQL dùng chung cho các test không cần database thật.
const db = require('../src/config/db');

function createMockDb(handler) {
    const calls = [];
    const run = async (sql, params = []) => {
        const text = String(sql).replace(/\s+/g, ' ').trim();
        calls.push({ sql: text, params });
        const result = await handler(text, params);
        return result === undefined ? [[]] : result;
    };

    db.query = run;
    db.getConnection = async () => ({
        query: run,
        beginTransaction: async () => calls.push({ sql: 'BEGIN', params: [] }),
        commit: async () => calls.push({ sql: 'COMMIT', params: [] }),
        rollback: async () => calls.push({ sql: 'ROLLBACK', params: [] }),
        release: () => {},
    });
    return { calls, find: (re) => calls.filter((c) => re.test(c.sql)) };
}

function mockRes() {
    const res = { statusCode: 200, body: null, headers: {} };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    res.set = (headers) => { Object.assign(res.headers, headers); return res; };
    return res;
}

module.exports = { createMockDb, mockRes };
