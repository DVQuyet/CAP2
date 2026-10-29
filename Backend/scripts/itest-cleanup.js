// Dọn mọi dữ liệu tạm của test tích hợp/QA (email itest_*@example.test, dòng họ và người ITEST_*).
// Dùng khi test chết giữa chừng:  node scripts/itest-cleanup.js
process.env.RUN_DB_TESTS = '1';
require('../src/config/loadEnv');
const { cleanupAll } = require('../tests-integration/helpers/fixtures');

cleanupAll()
    .then((deleted) => {
        const rows = Object.entries(deleted).filter(([, count]) => count > 0);
        console.log(rows.length ? rows.map(([table, count]) => `${table}: ${count}`).join('\n') : 'Không có dữ liệu tạm.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Dọn thất bại:', error.message);
        process.exit(1);
    });
