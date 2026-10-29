const test = require('node:test');
const assert = require('assert');
const { sanitizeSpreadsheetCell, sanitizeSpreadsheetRows } = require('../src/shared/utils/spreadsheet');

test('chuỗi bắt đầu bằng ký tự công thức được thêm dấu nháy', () => {
    for (const bad of ['=HYPERLINK("http://x")', '+cmd|calc', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) {
        assert.strictEqual(sanitizeSpreadsheetCell(bad), `'${bad}`);
    }
});

test('văn bản thường, số và chuỗi số thuần giữ nguyên', () => {
    for (const ok of ['Nguyễn Văn A', '', '500000.00', '-500.00', '+12', 'a=b']) {
        assert.strictEqual(sanitizeSpreadsheetCell(ok), ok);
    }
    const date = new Date();
    assert.strictEqual(sanitizeSpreadsheetCell(5), 5);
    assert.strictEqual(sanitizeSpreadsheetCell(null), null);
    assert.strictEqual(sanitizeSpreadsheetCell(date), date);
});

test('sanitizeSpreadsheetRows xử lý từng ô của từng dòng', () => {
    assert.deepStrictEqual(
        sanitizeSpreadsheetRows([{ name: '=1+1', amount: '100.00', n: 3 }]),
        [{ name: "'=1+1", amount: '100.00', n: 3 }]
    );
});
