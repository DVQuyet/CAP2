const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { getJwtSecret } = require('../config/jwt');
const { getRoleName } = require('../config/roles');

// JWT sống tới 24h, nên mỗi request phải đối chiếu lại trạng thái/role hiện tại trong DB.
// Kết quả được cache ngắn để không thêm một truy vấn cho mọi request.
const ACCOUNT_CACHE_TTL_MS = Number(process.env.AUTH_ACCOUNT_CACHE_TTL_MS || 30 * 1000);
const ACCOUNT_CACHE_MAX = 5000;
const accountCache = new Map();

async function loadAccountState(accountId) {
    const cached = accountCache.get(accountId);
    if (cached && cached.expiresAt > Date.now()) return cached.state;

    const [rows] = await db.query(
        'SELECT id, role_id, status FROM accounts WHERE id = ? LIMIT 1',
        [accountId]
    );

    let state = null;
    if (rows.length) {
        let archived = false;
        try {
            const [archivedRows] = await db.query(
                'SELECT id FROM archived_members WHERE account_id = ? LIMIT 1',
                [accountId]
            );
            archived = archivedRows.length > 0;
        } catch (error) {
            // Bảng archived_members được tạo khi dùng lần đầu; chưa có bảng nghĩa là chưa ai bị lưu trữ.
            if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        }
        state = { roleId: Number(rows[0].role_id), status: rows[0].status, archived };
    }

    if (accountCache.size >= ACCOUNT_CACHE_MAX) accountCache.clear();
    accountCache.set(accountId, { state, expiresAt: Date.now() + ACCOUNT_CACHE_TTL_MS });
    return state;
}

// Gọi khi đổi role/khóa tài khoản để có hiệu lực ngay trên instance hiện tại.
exports.invalidateAccountCache = (accountId) => {
    if (accountId === undefined) accountCache.clear();
    else accountCache.delete(Number(accountId));
};

exports.verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Truy cập bị từ chối. Vui lòng đăng nhập!"
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, getJwtSecret());
    } catch (err) {
        return res.status(403).json({
            success: false,
            message: "Token không hợp lệ hoặc đã hết hạn!"
        });
    }

    const accountId = Number(decoded.id || decoded.account_id);
    if (!Number.isInteger(accountId) || accountId <= 0) {
        // Token không gắn với tài khoản (vd. token đăng ký social) — để checkRole quyết định.
        req.user = decoded;
        return next();
    }

    try {
        const state = await loadAccountState(accountId);
        if (!state) {
            return res.status(401).json({
                success: false,
                message: "Tài khoản không còn tồn tại. Vui lòng đăng nhập lại!"
            });
        }
        if (state.archived || state.status === 'rejected') {
            return res.status(403).json({
                success: false,
                code: 'ACCOUNT_DISABLED',
                message: "Tài khoản của bạn đã bị khóa, vui lòng liên hệ với manager."
            });
        }

        // Quyền lấy từ DB, không tin role đã ký trong token cũ.
        const roleName = getRoleName(state.roleId);
        req.user = { ...decoded, role_id: state.roleId, role_name: roleName, role: roleName };
        return next();
    } catch (error) {
        console.error('verifyToken account lookup error:', error.message);
        return res.status(503).json({
            success: false,
            message: "Không thể xác thực lúc này. Vui lòng thử lại."
        });
    }
};

/**
 * checkRole middleware
 * @param {string[]} allowedRoles Array of role names (e.g., ['admin', 'manager'])
 */
exports.checkRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role_name)) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền thực hiện hành động này!"
            });
        }
        next();
    };
};
