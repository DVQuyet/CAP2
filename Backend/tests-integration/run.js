// Chạy bộ test tích hợp trên DB test. Chỉ file này đặt RUN_DB_TESTS=1, nên `node --test` trần sẽ không chạm DB.
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const extra = process.argv.slice(2);
const targets = extra.length ? extra : ['tests-integration/*.test.js'];

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...targets], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, RUN_DB_TESTS: '1' },
});
process.exit(result.status === null ? 1 : result.status);
