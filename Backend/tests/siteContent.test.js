process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_ACCOUNT_CACHE_TTL_MS = '0';

const test = require('node:test');
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createMockDb } = require('./helpers.mockDb');
const { invalidateAccountCache } = require('../src/middleware/authMiddleware');
const { publicRouter, adminRouter } = require('../src/modules/site-content/siteContent.routes');
const service = require('../src/modules/site-content/siteContent.service');

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
const ROLES = { 1: 1, 2: 2, 3: 3 }; // account id -> role_id

// DB giả có trạng thái, đủ cho các câu SQL mà module trang chủ dùng.
function createLandingDb({ missingTable = false } = {}) {
    const state = { sections: [], items: [], sectionSeq: 0, itemSeq: 0 };
    const missing = () => Object.assign(new Error("Table 'landing_sections' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
    const mock = createMockDb(async (sql, params) => {
        if (/FROM accounts/.test(sql)) return [[{ id: params[0], role_id: ROLES[params[0]], status: 'active' }]];
        if (/FROM archived_members/.test(sql)) return [[]];
        if (/landing_/.test(sql) && missingTable) throw missing();
        let m;
        if (/^SELECT \* FROM landing_sections/.test(sql)) return [[...state.sections].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)];
        if (/^SELECT \* FROM landing_items/.test(sql)) return [[...state.items].sort((a, b) => a.section_id - b.section_id || a.sort_order - b.sort_order || a.id - b.id)];
        if (/^INSERT IGNORE INTO landing_sections/.test(sql)) {
            if (!state.sections.some((s) => s.section_key === params[0])) {
                state.sections.push({ id: ++state.sectionSeq, section_key: params[0], sort_order: params[1], is_visible: 1, items_custom: 0, updated_by: params[2] });
            }
            return [{}];
        }
        if (/^SELECT id FROM landing_sections WHERE section_key/.test(sql)) return [state.sections.filter((s) => s.section_key === params[0]).map((s) => ({ id: s.id }))];
        if (/^INSERT INTO landing_sections/.test(sql)) {
            const cols = /\(([^)]*)\) VALUES/.exec(sql)[1].split(',').map((c) => c.trim());
            const row = { id: ++state.sectionSeq, is_visible: 1 };
            cols.forEach((c, i) => { row[c] = params[i]; });
            state.sections.push(row);
            return [{ insertId: row.id }];
        }
        if ((m = /^UPDATE landing_sections SET (.*) WHERE id = \?$/.exec(sql))) {
            const row = state.sections.find((s) => s.id === params[params.length - 1]);
            const sets = m[1].split(',').map((x) => x.trim());
            let p = 0;
            for (const set of sets) {
                if (/= \?$/.test(set)) row[set.split(' ')[0]] = params[p++];
                else if (/items_custom = 1/.test(set)) row.items_custom = 1;
            }
            return [{}];
        }
        if (/^DELETE FROM landing_sections WHERE id/.test(sql)) { state.sections = state.sections.filter((s) => s.id !== params[0]); return [{}]; }
        if (/^DELETE FROM landing_items WHERE section_id/.test(sql)) { state.items = state.items.filter((i) => i.section_id !== params[0]); return [{}]; }
        if (/^DELETE FROM landing_items WHERE id/.test(sql)) { state.items = state.items.filter((i) => i.id !== params[0]); return [{}]; }
        if (/^SELECT COALESCE\(MAX\(sort_order\)/.test(sql)) return [[{ max_order: Math.max(0, ...state.items.filter((i) => i.section_id === params[0]).map((i) => i.sort_order)) }]];
        if (/^SELECT id, section_id FROM landing_items WHERE id/.test(sql)) return [state.items.filter((i) => i.id === Number(params[0])).map((i) => ({ id: i.id, section_id: i.section_id }))];
        if (/^SELECT id FROM landing_items WHERE section_id/.test(sql)) return [state.items.filter((i) => i.section_id === params[0]).map((i) => ({ id: i.id }))];
        if (/^INSERT INTO landing_items/.test(sql)) {
            const cols = /\(([^)]*)\) VALUES/.exec(sql)[1].split(',').map((c) => c.trim());
            const row = { id: ++state.itemSeq, is_visible: 1 };
            cols.forEach((c, i) => { row[c] = params[i]; });
            state.items.push(row);
            return [{ insertId: row.id }];
        }
        if (/^UPDATE landing_items SET sort_order = \? WHERE id = \? AND section_id/.test(sql)) {
            state.items.find((i) => i.id === params[1]).sort_order = params[0];
            return [{}];
        }
        if ((m = /^UPDATE landing_items SET (.*) WHERE id = \?$/.exec(sql))) {
            const row = state.items.find((i) => i.id === Number(params[params.length - 1]));
            m[1].split(',').map((x) => x.trim().split(' ')[0]).forEach((c, i) => { row[c] = params[i]; });
            return [{}];
        }
        throw new Error(`SQL chưa được giả lập: ${sql}`);
    });
    return { state, mock };
}

async function withServer(fn) {
    const app = express();
    app.use(express.json());
    app.use('/api/public', publicRouter);
    app.use('/api/admin/landing', adminRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, path, { token, body } = {}) => {
        const res = await fetch(base + path, {
            method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    try { await fn(call); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test.beforeEach(() => { invalidateAccountCache(); service.invalidateLandingCache(); });

test('công khai: chưa có dữ liệu trả content null (dùng i18n mặc định)', async () => {
    createLandingDb();
    await withServer(async (call) => {
        const res = await call('GET', '/api/public/landing?lang=vi');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.content, null);
    });
});

test('công khai: thiếu bảng (chưa migrate) vẫn trả null, không lỗi', async () => {
    createLandingDb({ missingTable: true });
    await withServer(async (call) => {
        const res = await call('GET', '/api/public/landing');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.content, null);
    });
});

test('admin: thiếu bảng -> GET báo tableMissing, ghi trả 503', async () => {
    createLandingDb({ missingTable: true });
    await withServer(async (call) => {
        const list = await call('GET', '/api/admin/landing', { token: sign(1) });
        assert.strictEqual(list.status, 200);
        assert.strictEqual(list.body.tableMissing, true);
        const write = await call('PUT', '/api/admin/landing/sections/hero', { token: sign(1), body: { title_vi: 'x' } });
        assert.strictEqual(write.status, 503);
    });
});

test('chỉ admin: không token 401, manager/member 403', async () => {
    createLandingDb();
    await withServer(async (call) => {
        assert.strictEqual((await call('GET', '/api/admin/landing')).status, 401);
        for (const id of [2, 3]) {
            assert.strictEqual((await call('GET', '/api/admin/landing', { token: sign(id) })).status, 403);
            assert.strictEqual((await call('PUT', '/api/admin/landing/sections/hero', { token: sign(id), body: {} })).status, 403);
            assert.strictEqual((await call('POST', '/api/admin/landing/sections/stats/items', { token: sign(id), body: {} })).status, 403);
            assert.strictEqual((await call('DELETE', '/api/admin/landing/items/1', { token: sign(id) })).status, 403);
            assert.strictEqual((await call('POST', '/api/admin/landing/seed', { token: sign(id), body: {} })).status, 403);
        }
        assert.strictEqual((await call('GET', '/api/admin/landing', { token: sign(1) })).status, 200);
    });
});

test('validation: javascript:, độ dài, key lạ, id sai', async () => {
    createLandingDb();
    await withServer(async (call) => {
        const token = sign(1);
        const bad = async (method, path, body) => assert.strictEqual((await call(method, path, { token, body })).status, 400, `${method} ${path} ${JSON.stringify(body).slice(0, 60)}`);
        await bad('POST', '/api/admin/landing/sections/stats/items', { link_url: 'javascript:alert(1)' });
        await bad('POST', '/api/admin/landing/sections/stats/items', { link_url: '//evil.com/x' });
        await bad('POST', '/api/admin/landing/sections/stats/items', { image_url: 'data:text/html;base64,AAAA' });
        await bad('POST', '/api/admin/landing/sections/stats/items', { title_vi: 'a'.repeat(501) });
        await bad('POST', '/api/admin/landing/sections/stats/items', { icon: 'bad icon!' });
        await bad('PUT', '/api/admin/landing/sections/unknown', { title_vi: 'x' });
        await bad('PUT', '/api/admin/landing/sections/hero', { image_url: 'JavaScript:alert(1)' });
        await bad('PUT', '/api/admin/landing/items/abc', { title_vi: 'x' });
        await bad('PUT', '/api/admin/landing/sections/order', { keys: ['hero', 'nope'] });
        await bad('POST', '/api/admin/landing/seed', { sections: [] });
        const ok = await call('POST', '/api/admin/landing/sections/stats/items', { token, body: { link_url: '/clan-register', image_url: 'https://x.test/a.png', title_vi: 'ok' } });
        assert.strictEqual(ok.status, 201);
    });
});

test('CRUD + thứ tự + ẩn/hiện: công khai chỉ thấy mục hiển thị theo đúng thứ tự', async () => {
    const { state } = createLandingDb();
    await withServer(async (call) => {
        const token = sign(1);
        const a = (await call('POST', '/api/admin/landing/sections/stats/items', { token, body: { title_vi: 'Dòng họ', title_en: 'Clans', meta_vi: '1,200+', meta_en: '1,200+' } })).body.id;
        const b = (await call('POST', '/api/admin/landing/sections/stats/items', { token, body: { title_vi: 'Thành viên <b>x</b>', meta_vi: '500k+' } })).body.id;
        const c = (await call('POST', '/api/admin/landing/sections/stats/items', { token, body: { title_vi: 'Ẩn', is_visible: false } })).body.id;
        assert.ok(a && b && c);
        // Làm sạch HTML khi lưu.
        assert.strictEqual(state.items.find((i) => i.id === b).title_vi, 'Thành viên x');

        let pub = (await call('GET', '/api/public/landing?lang=vi')).body.content;
        assert.deepStrictEqual(pub.sections.stats.items.map((i) => i.title), ['Dòng họ', 'Thành viên x']);
        // Thiếu bản tiếng Anh -> lấy tiếng Việt.
        pub = (await call('GET', '/api/public/landing?lang=en')).body.content;
        assert.deepStrictEqual(pub.sections.stats.items.map((i) => i.title), ['Clans', 'Thành viên x']);

        // Đổi thứ tự: cache phải bị xóa.
        assert.strictEqual((await call('PUT', '/api/admin/landing/sections/stats/items/order', { token, body: { ids: [b, a, c, 999] } })).status, 200);
        pub = (await call('GET', '/api/public/landing?lang=vi')).body.content;
        assert.deepStrictEqual(pub.sections.stats.items.map((i) => i.id), [b, a]);

        // Hiện mục ẩn, sửa, xóa.
        assert.strictEqual((await call('PUT', `/api/admin/landing/items/${c}`, { token, body: { is_visible: true, title_vi: 'Hiện' } })).status, 200);
        pub = (await call('GET', '/api/public/landing?lang=vi')).body.content;
        assert.deepStrictEqual(pub.sections.stats.items.map((i) => i.title), ['Thành viên x', 'Dòng họ', 'Hiện']);
        assert.strictEqual((await call('DELETE', `/api/admin/landing/items/${a}`, { token })).status, 200);
        assert.strictEqual((await call('DELETE', `/api/admin/landing/items/${a}`, { token })).status, 404);
        pub = (await call('GET', '/api/public/landing?lang=vi')).body.content;
        assert.strictEqual(pub.sections.stats.items.length, 2);

        // Admin thấy cả mục ẩn.
        await call('PUT', `/api/admin/landing/items/${c}`, { token, body: { is_visible: false } });
        const adminList = (await call('GET', '/api/admin/landing', { token })).body;
        assert.strictEqual(adminList.sections[0].items.length, 2);
        assert.strictEqual(adminList.sections[0].items.some((i) => i.is_visible === false), true);
    });
});

test('mục ẩn không lộ nội dung; sắp xếp mục; khôi phục mặc định', async () => {
    const { state } = createLandingDb();
    await withServer(async (call) => {
        const token = sign(1);
        await call('PUT', '/api/admin/landing/sections/about', { token, body: { title_vi: 'Tiêu đề', quote_vi: 'Trích dẫn', image_url: '/uploads/a.png' } });
        await call('PUT', '/api/admin/landing/sections/hero', { token, body: { title_vi: 'Hero\nDòng 2', is_visible: false } });
        let pub = (await call('GET', '/api/public/landing')).body.content;
        assert.strictEqual(pub.sections.hero.visible, false);
        assert.strictEqual(pub.sections.hero.title, undefined);
        assert.strictEqual(pub.sections.about.title, 'Tiêu đề');
        assert.strictEqual(pub.sections.about.tag, '');
        assert.strictEqual(pub.sections.about.items_custom, false);

        assert.strictEqual((await call('PUT', '/api/admin/landing/sections/order', { token, body: { keys: ['about', 'hero'] } })).status, 200);
        pub = (await call('GET', '/api/public/landing')).body.content;
        assert.deepStrictEqual(pub.order, ['about', 'hero']);

        // Khôi phục mặc định xóa dòng mục + các mục con; hết dòng nào thì trả null.
        await call('POST', '/api/admin/landing/sections/about/items', { token, body: { title_vi: 'x' } });
        assert.strictEqual((await call('DELETE', '/api/admin/landing/sections/about', { token })).status, 200);
        assert.strictEqual(state.items.length, 0);
        assert.strictEqual((await call('DELETE', '/api/admin/landing/sections/hero', { token })).status, 200);
        assert.strictEqual((await call('GET', '/api/public/landing')).body.content, null);
    });
});

test('cache công khai: đọc lần hai không chạm DB, ghi của admin xóa cache', async () => {
    const { mock } = createLandingDb();
    await withServer(async (call) => {
        await call('GET', '/api/public/landing');
        const reads = () => mock.find(/^SELECT \* FROM landing_sections/).length;
        const before = reads();
        await call('GET', '/api/public/landing');
        assert.strictEqual(reads(), before);
        await call('PUT', '/api/admin/landing/sections/hero', { token: sign(1), body: { title_vi: 'Mới' } });
        const pub = (await call('GET', '/api/public/landing')).body.content;
        assert.strictEqual(pub.sections.hero.title, 'Mới');
        assert.strictEqual(reads(), before + 1);
    });
});

test('seed: tạo mục chưa có, bỏ qua mục đã có, overwrite thay thế', async () => {
    const { state } = createLandingDb();
    await withServer(async (call) => {
        const token = sign(1);
        const payload = (title) => ({
            sections: [
                { section_key: 'features', title_vi: title, title_en: 'T', items: [{ title_vi: 'A', icon: 'bolt' }, { title_vi: 'B' }] },
                { section_key: 'about', title_vi: 'Giới thiệu' },
            ],
        });
        let res = await call('POST', '/api/admin/landing/seed', { token, body: payload('Một') });
        assert.deepStrictEqual(res.body.seeded, ['features', 'about']);
        assert.strictEqual(state.items.length, 2);
        assert.strictEqual(state.sections.find((s) => s.section_key === 'features').items_custom, 1);
        assert.strictEqual(state.sections.find((s) => s.section_key === 'about').items_custom, 0);

        res = await call('POST', '/api/admin/landing/seed', { token, body: payload('Hai') });
        assert.deepStrictEqual(res.body.skipped, ['features', 'about']);
        assert.strictEqual(state.sections.find((s) => s.section_key === 'features').title_vi, 'Một');

        res = await call('POST', '/api/admin/landing/seed', { token, body: { ...payload('Ba'), overwrite: true } });
        assert.deepStrictEqual(res.body.seeded, ['features', 'about']);
        assert.strictEqual(state.sections.find((s) => s.section_key === 'features').title_vi, 'Ba');
        assert.strictEqual(state.items.length, 2);

        // Seed có link nguy hiểm bị từ chối.
        res = await call('POST', '/api/admin/landing/seed', { token, body: { sections: [{ section_key: 'hero', items: [{ link_url: 'javascript:1' }] }] } });
        assert.strictEqual(res.status, 400);
    });
});

test('sanitizePlainText / isSafeUrl', () => {
    assert.strictEqual(service.sanitizePlainText('Gìn giữ<br />cội nguồn'), 'Gìn giữ\ncội nguồn');
    assert.strictEqual(service.sanitizePlainText('<script>alert(1)</script>Xin chào'), 'alert(1)Xin chào');
    assert.strictEqual(service.sanitizePlainText('a < b và c > d'), 'a < b và c > d');
    assert.strictEqual(service.isSafeUrl('/tin-tuc'), true);
    assert.strictEqual(service.isSafeUrl('https://a.test/x?y=1'), true);
    for (const bad of ['javascript:alert(1)', '//evil.com', 'ftp://x', 'data:text/html,x', ' vbscript:x']) assert.strictEqual(service.isSafeUrl(bad), false, bad);
});
