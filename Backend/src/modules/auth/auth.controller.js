const crypto = require('crypto');
const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../../config/jwt');
const { getRoleName } = require('../../config/roles');
const { ensureProfileCompletedColumn } = require('../../shared/utils/profileCompletion');
const {
    attachSocialProviderToAccount,
    getAuthenticatedUser,
    verifySocialRegistrationToken,
} = require('./socialAuth.service');

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
const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_MAX_FAILED_ATTEMPTS = 5;

// Mã đặt lại lưu trong DB (không lưu bộ nhớ tạm, vì server khởi động lại sẽ làm mất mã).
let resetTokensTableReady = null;
function ensurePasswordResetTokensTable() {
    if (!resetTokensTableReady) {
        resetTokensTableReady = (async () => {
            await db.query(`
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id INT NOT NULL AUTO_INCREMENT,
                    account_id INT NOT NULL,
                    code_hash VARCHAR(255) NOT NULL,
                    expires_at DATETIME NOT NULL,
                    failed_attempts INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_password_reset_account (account_id),
                    CONSTRAINT fk_password_reset_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            const [columns] = await db.query(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'password_reset_tokens' AND COLUMN_NAME = 'failed_attempts'`
            );
            if (!columns.length) {
                await db.query('ALTER TABLE password_reset_tokens ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0');
            }
        })().catch((error) => {
            resetTokensTableReady = null;
            throw error;
        });
    }
    return resetTokensTableReady;
}

async function clearResetToken(accountId) {
    await db.query('DELETE FROM password_reset_tokens WHERE account_id = ?', [accountId]);
}

exports.register = async (req, res) => {
    const { email, password, display_name, first_name, middle_name, surname, birth_date, gender, hometown, clan_id } = req.body;
    let emailTrim = String(email || '').trim().toLowerCase();
    const normalizedClanId = Number(clan_id);
    let socialRegistration = null;

    if (req.body?.social_registration_token) {
        try {
            socialRegistration = verifySocialRegistrationToken(req.body.social_registration_token);
            if (emailTrim && emailTrim !== socialRegistration.email) {
                return res.status(400).json({ success: false, message: "Email khong khop voi tai khoan mang xa hoi da xac thuc" });
            }
            emailTrim = socialRegistration.email;
        } catch (error) {
            return res.status(400).json({ success: false, message: "Phien dang ky bang mang xa hoi khong hop le hoac da het han" });
        }
    }

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
        const [accountResult] = await connection.query(sqlAccount, [emailTrim, hashedPassword, personId]);

        if (socialRegistration) {
            await attachSocialProviderToAccount(connection, {
                accountId: accountResult.insertId,
                token: req.body.social_registration_token,
            });
        }

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

            const secret = getJwtSecret();
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

exports.getSocialRegistrationProfile = async (req, res) => {
    try {
        const social = verifySocialRegistrationToken(req.query?.token);
        const nameParts = String(social.fullName || '').trim().split(/\s+/).filter(Boolean);
        const firstName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : (nameParts[0] || '');
        const surname = nameParts.length > 1 ? nameParts[0] : '';
        const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';

        return res.json({
            success: true,
            profile: {
                provider: social.provider,
                email: social.email,
                full_name: social.fullName,
                display_name: social.fullName,
                surname,
                middle_name: middleName,
                first_name: firstName,
                avatar_url: social.avatarUrl,
                invite: social.invite || null,
                clan_id: social.invite?.clan_id || null,
            },
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: 'Phien dang ky bang mang xa hoi khong hop le hoac da het han.',
        });
    }
};

exports.me = async (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Chua dang nhap.',
        });
    }

    try {
        const secret = getJwtSecret();
        const decoded = jwt.verify(token, secret);
        const accountId = Number(decoded.id || decoded.account_id || decoded.userId);
        if (!Number.isFinite(accountId) || accountId <= 0) {
            return res.status(401).json({ success: false, message: 'Token khong hop le.' });
        }

        const user = await getAuthenticatedUser(accountId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Khong tim thay tai khoan.' });
        }

        return res.json({ success: true, user });
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: 'Token khong hop le hoac da het han.',
        });
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
        await ensurePasswordResetTokensTable();
        const [rows] = await db.query('SELECT id FROM accounts WHERE LOWER(TRIM(email)) = ? LIMIT 1', [email]);
        if (rows.length === 0) return res.json({ success: true, message: GENERIC_FORGOT_MSG });
        const accountId = rows[0].id;

        // Chống spam email: mỗi tài khoản chỉ nhận một mã mới mỗi phút.
        // Tính tuổi mã bằng đồng hồ của DB để không lệch múi giờ giữa DB và server.
        const [existing] = await db.query(
            'SELECT TIMESTAMPDIFF(SECOND, created_at, CURRENT_TIMESTAMP) AS age_seconds FROM password_reset_tokens WHERE account_id = ? LIMIT 1',
            [accountId]
        );
        const ageSeconds = existing.length ? Number(existing[0].age_seconds) : null;
        if (ageSeconds !== null && ageSeconds * 1000 < RESET_RESEND_COOLDOWN_MS) {
            return res.json({ success: true, message: GENERIC_FORGOT_MSG });
        }

        const code = generateOtp();
        const codeHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
        await db.query(
            `INSERT INTO password_reset_tokens (account_id, code_hash, expires_at, failed_attempts) VALUES (?, ?, ?, 0)
             ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at),
                                     failed_attempts = 0, created_at = CURRENT_TIMESTAMP`,
            [accountId, codeHash, expiresAt]
        );

        try {
            await sendResetEmail(email, code);
        } catch (mailErr) {
            console.error('❌ sendResetEmail:', mailErr);
            await clearResetToken(accountId);
            return res.status(500).json({ success: false, message: 'Không gửi được email. Kiểm tra SMTP và thử lại.' });
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
    // Không trim mật khẩu: đăng ký và đăng nhập so sánh nguyên văn.
    const newPassword = String(req.body?.new_password ?? '');

    if (!email || !code || !newPassword.trim()) return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ thông tin.' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu mới tối thiểu 6 ký tự.' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'Mã gồm 6 chữ số.' });

    try {
        await ensurePasswordResetTokensTable();
        const [tokRows] = await db.query(
            `SELECT prt.account_id, prt.code_hash, prt.expires_at, prt.failed_attempts
             FROM password_reset_tokens prt
             JOIN accounts a ON prt.account_id = a.id
             WHERE LOWER(TRIM(a.email)) = ? LIMIT 1`,
            [email]
        );
        const token = tokRows[0];
        if (!token) return res.status(400).json({ success: false, message: 'Mã không hợp lệ hoặc đã hết hạn.' });

        if (new Date(token.expires_at) < new Date()) {
            await clearResetToken(token.account_id);
            return res.status(400).json({ success: false, message: 'Mã đã hết hạn. Yêu cầu gửi mã mới.' });
        }

        const ok = await bcrypt.compare(code, token.code_hash);
        if (!ok) {
            // Mã 6 số chỉ có 1 triệu khả năng: hủy mã sau vài lần nhập sai để chặn dò mã.
            const attempts = Number(token.failed_attempts || 0) + 1;
            if (attempts >= RESET_MAX_FAILED_ATTEMPTS) {
                await clearResetToken(token.account_id);
                return res.status(400).json({ success: false, message: 'Nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.' });
            }
            await db.query('UPDATE password_reset_tokens SET failed_attempts = ? WHERE account_id = ?', [attempts, token.account_id]);
            return res.status(400).json({
                success: false,
                message: `Mã xác nhận không đúng. Bạn còn ${RESET_MAX_FAILED_ATTEMPTS - attempts} lần thử.`,
            });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE accounts SET password = ? WHERE id = ?', [hashed, token.account_id]);
        await clearResetToken(token.account_id);

        return res.json({ success: true, message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập.' });
    } catch (error) {
        console.error('❌ resetPasswordWithCode:', error);
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống. Thử lại sau.' });
    }
};

