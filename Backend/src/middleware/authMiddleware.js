const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/jwt');

exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Truy cập bị từ chối. Vui lòng đăng nhập!"
        });
    }

    try {
        const secret = getJwtSecret();
        const decoded = jwt.verify(token, secret);
        req.user = decoded; // Lưu id, role_id và role_name vào req
        next();
    } catch (err) {
        return res.status(403).json({
            success: false,
            message: "Token không hợp lệ hoặc đã hết hạn!"
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