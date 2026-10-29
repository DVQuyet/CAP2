const test = require('node:test');
const assert = require('assert');
const http = require('http');
const { buildContentDisposition } = require('../src/shared/utils/contentDisposition');

test('tên file tiếng Việt có dấu tạo header hợp lệ cho Node', async () => {
    const header = buildContentDisposition('inline', 'Ảnh giỗ cụ Đình.jpg');
    assert.match(header, /^inline; filename="Anh gio cu Dinh\.jpg"; filename\*=UTF-8''/);
    assert.ok(header.includes(encodeURIComponent('Ảnh giỗ cụ Đình.jpg')));

    const server = http.createServer((req, res) => {
        res.setHeader('Content-Disposition', header);
        res.end('ok');
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(response.status, 200);
    server.close();
});

test('bỏ dấu nháy, ký tự điều khiển và gạch chéo; tên rỗng dùng "file"', () => {
    const header = buildContentDisposition('inline', 'a"b\r\nc\d/e.png');
    assert.ok(!/[\r\n]/.test(header));
    assert.match(header, /filename="abcde\.png"/);
    assert.match(buildContentDisposition('inline', ''), /filename="file"/);
});
