const db = require('../../config/db');

function toPositiveId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
}

// Truy vấn bảng/cột có thể chưa tồn tại ở môi trường cũ: trả mảng rỗng thay vì lỗi.
async function queryOptional(sql, params = []) {
    try {
        const [rows] = await db.query(sql, params);
        return rows;
    } catch (error) {
        if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_FT_MATCHING_KEY_NOT_FOUND'].includes(error.code)) return [];
        throw error;
    }
}

module.exports = {
    toPositiveId,
    queryOptional,
};
