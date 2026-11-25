// S4: script dữ liệu thử của bộ thử trình duyệt không được chạy trên DB thật.
const test = require('node:test');
const assert = require('assert');
const { assertTestDatabaseName } = require('../scripts/e2e-seed');

test('e2e-seed từ chối DB_NAME trống hoặc defaultdb', () => {
    assert.throws(() => assertTestDatabaseName(''), /trống/);
    assert.throws(() => assertTestDatabaseName(undefined), /trống/);
    assert.throws(() => assertTestDatabaseName('defaultdb'), /DB thật/);
    assert.throws(() => assertTestDatabaseName(' DefaultDB '), /DB thật/);
});

test('e2e-seed nhận DB thử', () => {
    assert.strictEqual(assertTestDatabaseName('cap2_test'), 'cap2_test');
    assert.strictEqual(assertTestDatabaseName('cap2_ci'), 'cap2_ci');
});

test('e2e-seed từ chối DB không nằm trong danh sách DB thử (vd. cap2_prod)', () => {
    assert.throws(() => assertTestDatabaseName('cap2_prod'), /danh sách DB thử/);
    assert.throws(() => assertTestDatabaseName('cap2'), /danh sách DB thử/);
});
