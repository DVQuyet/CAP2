// Đọc/ghi file .xlsx bằng exceljs (thay thư viện xlsx có lỗ hổng chưa vá).
const ExcelJS = require('exceljs');

// Tạo file .xlsx từ nhiều sheet; cột lấy theo thứ tự khóa xuất hiện trong các dòng.
async function rowsToWorkbookBuffer(sheets) {
    const workbook = new ExcelJS.Workbook();
    for (const { name, rows = [] } of sheets) {
        const sheet = workbook.addWorksheet(name);
        const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
        if (!keys.length) continue;
        sheet.addRow(keys);
        rows.forEach((row) => sheet.addRow(keys.map((key) => (row[key] === undefined ? null : row[key]))));
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Giá trị ô của exceljs có thể là object (công thức, chữ có định dạng, liên kết): lấy phần hiển thị.
function plainCellValue(value) {
    if (value === null || value === undefined || value instanceof Date || typeof value !== 'object') return value;
    if ('result' in value) return plainCellValue(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if ('text' in value) return plainCellValue(value.text);
    if ('error' in value) return null;
    return null;
}

// Đọc sheet đầu tiên thành mảng object, khóa là dòng tiêu đề; bỏ ô trống và dòng trống.
async function readFirstSheetRows(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headers = [];
    sheet.getRow(1).eachCell((cell, column) => {
        const header = plainCellValue(cell.value);
        if (header !== null && header !== undefined && String(header).trim()) headers[column] = String(header).trim();
    });

    const rows = [];
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const item = {};
        row.eachCell((cell, column) => {
            const value = plainCellValue(cell.value);
            if (headers[column] && value !== null && value !== undefined && value !== '') item[headers[column]] = value;
        });
        if (Object.keys(item).length) rows.push(item);
    });
    return rows;
}

module.exports = { rowsToWorkbookBuffer, readFirstSheetRows };
