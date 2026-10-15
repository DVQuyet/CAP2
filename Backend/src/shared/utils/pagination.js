// Phân trang theo con trỏ (keyset) cho các danh sách dài: ?limit=&before_id=
// Không truyền gì thì vẫn trả tối đa `defaultLimit` bản ghi mới nhất để không tải cả bảng.
const toPositiveInt = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
};

function parsePageParams(query = {}, { defaultLimit = 200, maxLimit = 200 } = {}) {
    const requested = toPositiveInt(query.limit);
    const limit = Math.min(requested || defaultLimit, maxLimit);
    const beforeId = toPositiveInt(query.before_id ?? query.beforeId);
    return { limit, beforeId };
}

// Truy vấn lấy limit + 1 dòng để biết còn trang sau hay không.
function finishPage(rows, limit, getId = (row) => row.id) {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
        items,
        has_more: hasMore,
        next_before_id: hasMore && last ? getId(last) : null,
    };
}

module.exports = { parsePageParams, finishPage };
