// Astra: dataIntentHandlers đọc r.name nhưng bảng roles có cột role_name (database/schema/init.sql).
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('bảng roles có cột role_name, không có cột name', () => {
    const init = read('database', 'schema', 'init.sql');
    const roles = init.slice(init.indexOf('CREATE TABLE IF NOT EXISTS `roles`')).split(';')[0];
    assert.match(roles, /`role_name`/);
    assert.doesNotMatch(roles, /^\s*`name`/m);
});

test('mã trợ lý và DB giả của bộ chấm đọc r.role_name, không đọc r.name', () => {
    const dir = path.join(ROOT, 'Backend', 'src', 'modules', 'chatbot');
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
        const text = fs.readFileSync(path.join(dir, name), 'utf8');
        if (/JOIN roles r\b/.test(text)) assert.doesNotMatch(text, /\br\.name\b/, `${name} đọc r.name`);
    }
    assert.match(read('Backend', 'src', 'modules', 'chatbot', 'dataIntentHandlers.js'), /r\.role_name AS role_name/);
    const fake = read('Backend', 'scripts', 'chatbot-e2e-check.js');
    assert.match(fake, /r\\\.role_name AS role_name/);
    assert.doesNotMatch(fake, /r\\\.name AS role_name/);
});
