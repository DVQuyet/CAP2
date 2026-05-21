const crypto = require('crypto');
const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getRoleName } = require('../../config/roles');
const { ensureProfileCompletedColumn } = require('../../shared/utils/profileCompletion');

const GENERIC_FORGOT_MSG = 'Nếu email đã đăng ký, bạn sẽ nhận mã xác nhận trong vài phút.';

function generateOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

function normalizeEmail(s) {
    return String(s ?? '').trim().toLowerCase();
}

function isSmtpConfigured() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    return Boolean(host && user && pass);
}

async function sendResetEmail(to, code) {
    const subject = 'Mã đặt lại mật khẩu — Gia Phả Việt';
    const text = `Mã xác nhận đặt lại mật khẩu của bạn: ${code}\nMã có hiệu lực trong 15 phút. Nếu bạn không yêu cầu, bỏ qua email này.`;
    const html = `
      <p>Xin chào,</p>
      <p>Mã xác nhận đặt lại mật khẩu của bạn: <strong style="font-size:18px;letter-spacing:2px;">${code}</strong></p>
      <p>Mã có hiệu lực trong <strong>15 phút</strong>.</p>
      <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
    `;

    if (!isSmtpConfigured()) {
        const err = new Error('SMTP_NOT_CONFIGURED');
        err.code = 'SMTP_NOT_CONFIGURED';
        throw err;
    }

    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user || 'noreply@localhost';

    let nodemailer;
    try {
        nodemailer = require('nodemailer');
    } catch (e) {
        const err = new Error('Chưa cài nodemailer. Mở terminal trong thư mục Backend và chạy: npm install');
        err.code = 'SMTP_NO_MODULE';
        throw err;
    }

    const transporter = nodemailer.createTransport({
        host, port, secure: port === 465, auth: { user, pass },
    });
    await transporter.sendMail({ from, to, subject, text, html });
}

const passwordResetMemory = new Map();
let hasEnsuredArchivedMembersTable = false;
async function ensureArchivedMembersTable() {
    if (hasEnsuredArchivedMembersTable) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS archived_members (
            id INT PRIMARY KEY AUTO_INCREMENT,
            account_id INT NOT NULL,
            archived_by_account_id INT NOT NULL,
            clan_id INT NULL,
            archived_reason TEXT NULL,
            account_json JSON NOT NULL,
            person_json JSON NULL,
            archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_archived_account (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    hasEnsuredArchivedMembersTable = true;
}
function setResetMemory(email, codeHash, expiresAt) {
    passwordResetMemory.set(email, { code_hash: codeHash, expires_at: expiresAt });
}
function getResetMemory(email) {
    return passwordResetMemory.get(email) || null;
}
function clearResetMemory(email) {
    passwordResetMemory.delete(email);
}
async function clearResetToken(email, accountId = null) {
    clearResetMemory(email);
    try {
        if (accountId) {
            await db.query('DELETE FROM password_reset_tokens WHERE account_id = ?', [accountId]);
        } else {
            await db.query('DELETE FROM password_reset_tokens WHERE account_id = (SELECT id FROM accounts WHERE LOWER(TRIM(email)) = ? LIMIT 1)', [email]);
        }
    } catch (dbErr) {
        if (dbErr?.code !== 'ER_NO_SUCH_TABLE') throw dbErr;
    }
}

exports.register = async (req, res) => {
    const { email, password, display_name, first_name, middle_name, surname, birth_date, gender, hometown, clan_id } = req.body;
    const emailTrim = String(email || '').trim().toLowerCase();
    const normalizedClanId = Number(clan_id);

    if (!Number.isInteger(normalizedClanId) || normalizedClanId <= 0) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập ID dòng họ hợp lệ" });
    }

    if (!emailTrim || !password) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập email và mật khẩu" });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [clanRows] = await connection.query('SELECT id FROM clans WHERE id = ? LIMIT 1', [normalizedClanId]);
        if (!clanRows.length) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "ID dòng họ không tồn tại" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const sqlPeople = `INSERT INTO people (clan_id, display_name, first_name, middle_name, surname, gender, birth_date, hometown, generation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`;
        const [personResult] = await connection.query(sqlPeople, [normalizedClanId, display_name, first_name, middle_name, surname, gender, birth_date, hometown]);
        const personId = personResult.insertId;

        const sqlAccount = `INSERT INTO accounts (email, password, person_id, role_id) VALUES (?, ?, ?, 3)`;
        await connection.query(sqlAccount, [emailTrim, hashedPassword, personId]);

        await connection.commit();
        res.json({ success: true, message: "Đăng ký thành công!" });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        console.error("❌ Lỗi Đăng ký:", error);
        res.status(400).json({ success: false, message: error.code === 'ER_DUP_ENTRY' ? "Email đã tồn tại!" : "Lỗi dữ liệu hệ thống" });
    } finally {
        connection.release();
    }
};

// 🌟 ĐÃ SỬA LỖI 500 Ở HÀM LOGIN NÀY 🌟
exports.login = async (req, res) => {
    const { email, password } = req.body;
    
    // Kiểm tra rỗng để chống sập server
    if(!email || !password) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập email và mật khẩu!" });
    }

    const emailTrim = String(email).trim().toLowerCase();

    try {
        await ensureProfileCompletedColumn();
        await ensureArchivedMembersTable();
        const sql = `SELECT a.*, p.display_name FROM accounts a 
                     LEFT JOIN people p ON a.person_id = p.id 
                     WHERE LOWER(TRIM(a.email)) = ?`;
        const [results] = await db.query(sql, [emailTrim]);

        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "Email hoặc mật khẩu không chính xác!" });
        }

        const user = results[0];
        const [archivedRows] = await db.query('SELECT id FROM archived_members WHERE account_id = ? LIMIT 1', [user.id]);
        if (archivedRows.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'Tài khoản của bạn đã bị khóa, vui lòng liên hệ với manager.',
            });
        }
        let match = false;
        try {
            match = await bcrypt.compare(String(password), user.password);
        } catch (err) {
            match = false;
        }

        if (match) {
            if (user.status === 'rejected') {
                return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị từ chối đăng nhập. Vui lòng liên hệ quản trị viên.' });
            }
            if (user.status === 'pending') {
                return res.status(403).json({ success: false, message: 'Tài khoản của bạn đang chờ quản trị viên phê duyệt.' });
            }

            // Dùng khóa dự phòng nếu mất file .env -> Không bao giờ bị lỗi 500 nữa!
            const secret = process.env.JWT_SECRET || 'GiaPhaViet_Secret_Key_2024_Backup';
            const role_name = getRoleName(user.role_id);
            
            const token = jwt.sign(
                {
                    id: user.id,
                    account_id: user.id,
                    person_id: user.person_id,
                    role_id: user.role_id,
                    role_name,
                    role: role_name,
                    email: user.email,
                    profile_completed: Number(user.profile_completed || 0)
                },
                secret, 
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                message: "Đăng nhập thành công!",
                token: token,
                user: {
                    id: user.id,
                    account_id: user.id,
                    person_id: user.person_id,
                    role_id: user.role_id,
                    role_name,
                    role: role_name,
                    status: user.status,
                    name: user.display_name,
                    email: user.email,
                    profile_completed: Number(user.profile_completed || 0)
                }
            });
        } else {
            res.status(401).json({ success: false, message: "Email hoặc mật khẩu không chính xác!" });
        }
    } catch (error) {
        console.error("❌ Lỗi Đăng nhập:", error);
        res.status(500).json({ success: false, message: "Lỗi kết nối server" });
    }
};

exports.requestPasswordReset = async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Email không hợp lệ.' });
    }
    if (!isSmtpConfigured()) {
        return res.status(503).json({ success: false, message: 'Chức năng quên mật khẩu cần cấu hình SMTP trong file .env.' });
    }

    try {
        const [rows] = await db.query('SELECT id FROM accounts WHERE LOWER(TRIM(email)) = ? LIMIT 1', [email]);
        if (rows.length === 0) return res.json({ success: true, message: GENERIC_FORGOT_MSG });

        const code = generateOtp();
        try {
            await sendResetEmail(email, code);
        } catch (mailErr) {
            console.error('❌ sendResetEmail:', mailErr);
            return res.status(500).json({ success: false, message: 'Không gửi được email. Kiểm tra SMTP và thử lại.' });
        }

        const codeHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        setResetMemory(email, codeHash, expiresAt);

        try {
            await db.query(
                `INSERT INTO password_reset_tokens (account_id, code_hash, expires_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), created_at = CURRENT_TIMESTAMP`,
                [rows[0].id, codeHash, expiresAt]
            );
        } catch (dbErr) {
            if (dbErr?.code !== 'ER_NO_SUCH_TABLE') throw dbErr;
        }

        return res.json({ success: true, message: GENERIC_FORGOT_MSG });
    } catch (error) {
        console.error('❌ requestPasswordReset:', error);
        return res.status(500).json({ success: false, message: 'Không thể gửi mã. Thử lại sau.' });
    }
};

exports.resetPasswordWithCode = async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code ?? '').trim();
    const newPassword = String(req.body?.new_password ?? '').trim();

    if (!email || !code || !newPassword) return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ thông tin.' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu mới tối thiểu 6 ký tự.' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'Mã gồm 6 chữ số.' });

    let code_hash = null; let expires_at = null;

    try {
        try {
            const [tokRows] = await db.query(
                `SELECT prt.code_hash, prt.expires_at FROM password_reset_tokens prt
                 JOIN accounts a ON prt.account_id = a.id
                 WHERE LOWER(TRIM(a.email)) = ? LIMIT 1`,
                [email]
            );
            if (tokRows.length) ({ code_hash, expires_at } = tokRows[0]);
        } catch (dbErr) {
            if (dbErr?.code !== 'ER_NO_SUCH_TABLE') throw dbErr;
        }

        if (!code_hash || !expires_at) {
            const mem = getResetMemory(email);
            if (!mem) return res.status(400).json({ success: false, message: 'Mã không hợp lệ hoặc đã hết hạn.' });
            ({ code_hash, expires_at } = mem);
        }

        if (new Date(expires_at) < new Date()) {
            await clearResetToken(email);
            return res.status(400).json({ success: false, message: 'Mã đã hết hạn. Yêu cầu gửi mã mới.' });
        }

        const ok = await bcrypt.compare(code, code_hash);
        if (!ok) return res.status(400).json({ success: false, message: 'Mã xác nhận không đúng.' });

        const hashed = await bcrypt.hash(newPassword, 10);
        const [accRows] = await db.query('SELECT id FROM accounts WHERE LOWER(TRIM(email)) = ? LIMIT 1', [email]);
        
        if (accRows.length === 0) {
            await clearResetToken(email);
            return res.status(400).json({ success: false, message: 'Tài khoản không tồn tại.' });
        }

        await db.query('UPDATE accounts SET password = ? WHERE id = ?', [hashed, accRows[0].id]);
        await clearResetToken(email, accRows[0].id);

        return res.json({ success: true, message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập.' });
    } catch (error) {
        console.error('❌ resetPasswordWithCode:', error);
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống. Thử lại sau.' });
    }
};
