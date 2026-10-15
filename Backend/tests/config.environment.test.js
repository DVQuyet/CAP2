const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadEnvFrom } = require('../src/config/loadEnv');
const { collectProductionConfigWarnings } = require('../src/config/environmentCheck');

test('.env.local thắng .env, biến không có trong .env.local vẫn lấy từ .env', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap2-env-'));
    fs.writeFileSync(path.join(dir, '.env'), 'CAP2_TEST_DB_HOST=prod.example.com\nCAP2_TEST_ONLY_IN_ENV=giu-nguyen\n');
    fs.writeFileSync(path.join(dir, '.env.local'), 'CAP2_TEST_DB_HOST=127.0.0.1\n');
    delete process.env.CAP2_TEST_DB_HOST;
    delete process.env.CAP2_TEST_ONLY_IN_ENV;
    const loaded = loadEnvFrom(dir);
    assert.deepStrictEqual(loaded, ['.env.local', '.env']);
    assert.strictEqual(process.env.CAP2_TEST_DB_HOST, '127.0.0.1');
    assert.strictEqual(process.env.CAP2_TEST_ONLY_IN_ENV, 'giu-nguyen');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('cảnh báo khi chạy ở máy cá nhân với DB/URL của bản thật', () => {
    const production = {
        DB_HOST: 'mysql-abc.aivencloud.com',
        FRONTEND_URL: 'https://cap-2-seven.vercel.app',
        GOOGLE_CALLBACK_URL: 'https://cap2-backend.onrender.com/api/auth/google/callback',
    };
    const warnings = collectProductionConfigWarnings(production);
    assert.ok(warnings.some((item) => item.includes('DB_HOST')));
    assert.ok(warnings.some((item) => item.includes('FRONTEND_URL')));
    assert.ok(warnings.some((item) => item.includes('nhắc lịch')), 'nhắc tắt tác vụ nền');
    assert.ok(warnings.every((item) => !item.includes('PASSWORD')), 'không in bí mật');
});

test('không cảnh báo trên Render, khi cấu hình local, hoặc khi chủ động cho phép', () => {
    assert.deepStrictEqual(collectProductionConfigWarnings({ RENDER: 'true', DB_HOST: 'mysql-abc.aivencloud.com' }), []);
    assert.deepStrictEqual(collectProductionConfigWarnings({ DB_HOST: '127.0.0.1', FRONTEND_URL: 'http://localhost:5173', DISABLE_BACKGROUND_JOBS: 'true' }), []);
    assert.deepStrictEqual(collectProductionConfigWarnings({ ALLOW_SHARED_PRODUCTION_ENV: 'true', DB_HOST: 'mysql-abc.aivencloud.com' }), []);
});
