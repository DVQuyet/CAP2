const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { rowsToWorkbookBuffer, readFirstSheetRows } = require('../src/shared/utils/workbook');

test('workbook: ghi rồi đọc lại giữ đúng dữ liệu, tiếng Việt và kiểu số', async () => {
    const buffer = await rowsToWorkbookBuffer([
        { name: 'Thu Quỹ', rows: [
            { amount: 500000, note: 'Đóng góp giỗ tổ', type: 'income' },
            { amount: 20000, note: "'=SUM(A1)", type: 'income', category: 'Khác' },
        ] },
        { name: 'Chi Quỹ', rows: [] },
    ]);
    assert.ok(Buffer.isBuffer(buffer));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    assert.deepStrictEqual(workbook.worksheets.map((sheet) => sheet.name), ['Thu Quỹ', 'Chi Quỹ']);

    const rows = await readFirstSheetRows(buffer);
    assert.deepStrictEqual(rows, [
        { amount: 500000, note: 'Đóng góp giỗ tổ', type: 'income' },
        { amount: 20000, note: "'=SUM(A1)", type: 'income', category: 'Khác' },
    ]);
});

test('workbook: ô công thức lấy kết quả, ô chữ có định dạng lấy phần chữ, bỏ dòng trống', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Nhập');
    sheet.addRow(['amount', 'note', 'type']);
    sheet.addRow([{ formula: '1+1', result: 2 }, { richText: [{ text: 'Chi ' }, { text: 'hương hoa' }] }, 'expense']);
    sheet.addRow([]);
    sheet.addRow([100, null, 'income']);
    const rows = await readFirstSheetRows(Buffer.from(await workbook.xlsx.writeBuffer()));
    assert.deepStrictEqual(rows, [
        { amount: 2, note: 'Chi hương hoa', type: 'expense' },
        { amount: 100, type: 'income' },
    ]);
});

test('workbook: file không phải .xlsx thì báo lỗi để controller trả 400', async () => {
    await assert.rejects(() => readFirstSheetRows(Buffer.from('amount,note\n1,a')));
});
