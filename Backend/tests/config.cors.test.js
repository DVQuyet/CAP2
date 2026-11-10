const test = require('node:test');
const assert = require('node:assert');
const { buildAllowedOrigins } = require('../src/config/cors');

test('CORS: mặc định có tên miền production và localhost khi không phải production', () => {
    const origins = buildAllowedOrigins({});
    assert.ok(origins.includes('https://cap-2-seven.vercel.app'));
    assert.ok(origins.includes('https://dinhvietquyet.website'));
    assert.ok(origins.includes('http://localhost:5173'));
    assert.ok(!origins.some((origin) => origin.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(origin)));
});

test('CORS: production không tự thêm localhost', () => {
    const origins = buildAllowedOrigins({ NODE_ENV: 'production' });
    assert.deepStrictEqual(origins, ['https://cap-2-seven.vercel.app', 'https://dinhvietquyet.website']);
});

test('CORS: CORS_ORIGINS thay danh sách mặc định, bỏ origin http không phải localhost và giá trị rác', () => {
    const origins = buildAllowedOrigins({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://app.example.com/login',
        CORS_ORIGINS: ' https://a.example.com , http://b.example.com, khong-phai-url, http://localhost:3000 ',
    });
    assert.deepStrictEqual(origins, ['https://app.example.com', 'https://a.example.com', 'http://localhost:3000']);
});
