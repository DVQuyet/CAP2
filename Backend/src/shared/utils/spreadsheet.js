// Ô bắt đầu bằng = + - @ (hoặc tab/CR) bị Excel/LibreOffice chạy như công thức (CSV/formula injection).
// Dữ liệu do thành viên nhập (tên, ghi chú...) nên thêm dấu ' phía trước để hiển thị như văn bản.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
// DECIMAL của mysql2 trả về chuỗi như "-500.00": số thuần thì giữ nguyên.
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

function sanitizeSpreadsheetCell(value) {
    if (typeof value !== 'string') return value;
    if (!FORMULA_PREFIX.test(value) || PLAIN_NUMBER.test(value)) return value;
    return `'${value}`;
}

function sanitizeSpreadsheetRows(rows) {
    return rows.map((row) => {
        const safe = {};
        for (const [key, value] of Object.entries(row)) safe[key] = sanitizeSpreadsheetCell(value);
        return safe;
    });
}

module.exports = { sanitizeSpreadsheetCell, sanitizeSpreadsheetRows };
