// Nạp biến môi trường cho backend.
// Backend/.env.local (chỉ có ở máy cá nhân, đã gitignore) được nạp TRƯỚC .env nên giá trị trong đó thắng:
// dùng để chạy local với DB/URL riêng thay vì dùng chung dữ liệu với bản thật trên Render/Vercel.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const backendRoot = path.join(__dirname, '..', '..');

// Trả danh sách file đã nạp (theo thứ tự ưu tiên).
function loadEnvFrom(directory) {
    const loaded = [];
    for (const name of ['.env.local', '.env']) {
        const file = path.join(directory, name);
        if (!fs.existsSync(file)) continue;
        // dotenv không ghi đè biến đã có, nên file nạp trước (.env.local) được ưu tiên.
        dotenv.config({ path: file, quiet: true });
        loaded.push(name);
    }
    return loaded;
}

const loadedFiles = loadEnvFrom(backendRoot);

module.exports = {
    backendRoot,
    loadEnvFrom,
    loadedFiles,
};
