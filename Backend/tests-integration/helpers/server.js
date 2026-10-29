const { spawn } = require('child_process');
const path = require('path');
const { requireDbTests } = require('./guard');

requireDbTests();

const backendRoot = path.join(__dirname, '..', '..');

async function waitForHealth(baseUrl, child, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Server thoát sớm (mã ${child.exitCode}).`);
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) return;
        } catch (_) { /* chưa lên */ }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error('Server không trả /api/health trong thời gian chờ.');
}

// Chạy server thật thành tiến trình con trên cổng ngẫu nhiên. Tắt tác vụ nền và cấu hình gửi mail để test không gửi gì ra ngoài.
async function startServer({ env = {} } = {}) {
    const port = 31000 + Math.floor(Math.random() * 8000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const output = [];
    const child = spawn(process.execPath, ['server.js'], {
        cwd: backendRoot,
        env: {
            ...process.env,
            PORT: String(port),
            DISABLE_BACKGROUND_JOBS: 'true',
            RESEND_API_KEY: '',
            SMTP_HOST: '',
            SMTP_USER: '',
            SMTP_PASS: '',
            ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => output.push(String(chunk)));
    child.stderr.on('data', (chunk) => output.push(String(chunk)));

    try {
        await waitForHealth(baseUrl, child, 30000);
    } catch (error) {
        child.kill();
        throw new Error(`${error.message}\n${output.join('').slice(-1500)}`);
    }

    return {
        baseUrl,
        port,
        output: () => output.join(''),
        stop: () => new Promise((resolve) => {
            if (child.exitCode !== null) return resolve();
            child.once('exit', () => resolve());
            child.kill();
        }),
    };
}

module.exports = { startServer };
