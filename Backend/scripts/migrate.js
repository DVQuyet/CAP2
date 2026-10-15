// Chạy toàn bộ bước chỉnh schema (idempotent) một lần: `npm run migrate`.
// Sau khi chạy xong có thể đặt DISABLE_RUNTIME_DDL=true để server không tự ALTER/CREATE lúc request.
process.env.DISABLE_RUNTIME_DDL = 'false';

const db = require('../src/config/db');
const { runAllSchemaEnsures } = require('../src/shared/schema/registry');

(async () => {
    let failed = 0;
    try {
        const results = await runAllSchemaEnsures();
        failed = results.filter((item) => !item.ok).length;
        console.log(`\nHoàn tất: ${results.length - failed}/${results.length} bước thành công.`);
    } catch (error) {
        console.error('Migrate lỗi:', error);
        failed = 1;
    } finally {
        try { await db.end(); } catch (_) { /* pool có thể đã đóng */ }
    }
    process.exit(failed ? 1 : 0);
})();
