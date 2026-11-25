// Dựng/cập nhật schema (idempotent): `npm run migrate`. Thứ tự: database/schema/*.sql (đủ bảng, vai trò, gói FREE),
// database/migrations/*.sql mới (sau mốc BASELINE), rồi các hàm ensure*() cũ. Sau đó có thể đặt DISABLE_RUNTIME_DDL=true.
const db = require('../src/config/db');
const { runAllSchemaEnsures } = require('../src/shared/schema/registry');
const { runSchemaFiles, runPendingMigrations } = require('./sqlFiles');

(async () => {
    let failed = 0;
    try {
        await db.allowDdl(async () => { await runSchemaFiles(db); await runPendingMigrations(db); });
        const results = await db.allowDdl(() => runAllSchemaEnsures());
        failed = results.filter((item) => !item.ok).length;
        process.stdout.write(`\nHoàn tất: file .sql xong; ensure ${results.length - failed}/${results.length} bước thành công.\n`);
    } catch (error) {
        process.stderr.write(`Migrate lỗi: ${error.message}\n`);
        failed = 1;
    } finally {
        try { await db.end(); } catch (_) { /* pool có thể đã đóng */ }
    }
    process.exit(failed ? 1 : 0);
})();
