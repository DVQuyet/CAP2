// Lõi quan hệ gia phả: dùng chung cho kiểm tra, ghi dữ liệu, tính đời, xưng hô (chatbot) và kiểm tra toàn cây.
const dates = require('./dates');
const graph = require('./kinshipGraph');
const lineage = require('./lineage');
const rules = require('./relationRules');
const naming = require('./kinshipNaming');

module.exports = {
    ...dates,
    ...graph,
    ...lineage,
    ...rules,
    ...naming,
};
