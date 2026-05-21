require('dotenv').config();
require("dns").setDefaultResultOrder("ipv4first");

const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./src/config/db');

const app = express();

// 1. Cấu hình middleware toàn cục
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://cap-2-seven.vercel.app',
    'https://dinhvietquyet.website',
    'http://dinhvietquyet.website',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS không cho phép origin này: ' + origin));
    },
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. Khởi tạo HTTP server + Socket.IO
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

app.locals.io = io;
app.locals.onlineUsers = {};
app.locals.treeOnline = new Map();
app.locals.treeEditing = new Map();

app.locals.emitToAccount = (accountId, eventName, payload) => {
    if (!accountId) return;
    io.to(`account_${accountId}`).emit(eventName, payload);
};

app.locals.emitToClan = (clanId, eventName, payload) => {
    if (!clanId) return;
    io.to(`clan_${clanId}`).emit(eventName, payload);
};

// 3. Import routes/controllers sau khi app đã có middleware
const authRoutes = require('./src/modules/auth/auth.routes');
const billingRoutes = require('./src/modules/billing/billing.routes');
const managerRoutes = require('./src/modules/manager/manager.routes');
const memberRoutes = require('./src/modules/member/member.routes');
const adminRoutes = require('./src/modules/admin/admin.routes');
const aiRoutes = require('./src/modules/ai/ai.routes');
const voiceRoutes = require('../voice/backend/backendRoutes');
const mediaRoutes = require('./src/modules/media/media.routes');
const calendarRoutes = require('./src/modules/calendar/calendar.routes');
const invitationRoutes = require('./src/modules/invitations/invitation.routes');
const meRoutes = require('./src/modules/me/me.routes');
const { startCalendarReminderScheduler } = require('./src/modules/calendar/calendar.controller');

const managerController = require('./src/modules/manager/manager.controller');

const {
    MAX_IMAGE_SIZE_BYTES,
    MAX_POST_MEDIA_SIZE_BYTES,
    isAllowedImageMimeType,
    isAllowedPostMediaMimeType,
    getMediaUrl,
    createMediaFile,
    getUploadContext,
} = require('./src/shared/utils/media');

const { verifyToken, checkRole } = require('./src/middleware/authMiddleware');

// 4. Cấu hình upload media: ảnh/video bài đăng được lưu trực tiếp vào MySQL LONGBLOB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_POST_MEDIA_SIZE_BYTES || MAX_IMAGE_SIZE_BYTES },
    fileFilter: (req, file, cb) => {
        if (!isAllowedPostMediaMimeType(file.mimetype)) {
            return cb(new Error('Chỉ cho phép upload ảnh JPG, PNG, WEBP, GIF hoặc video MP4, WEBM, MOV'));
        }
        cb(null, true);
    }
});

// 4.1. Đăng ký route thanh toán VNPAY
const paymentRoutes = require('./src/modules/payment/payment.routes');
// 5. Socket.IO
const getSocketAuthToken = (socket) => {
    const authToken = socket.handshake?.auth?.token;
    const header = socket.handshake?.headers?.authorization || '';
    return authToken || (header.startsWith('Bearer ') ? header.slice(7) : null);
};

io.use(async (socket, next) => {
    try {
        const token = getSocketAuthToken(socket);
        if (!token) return next(new Error('Socket JWT is required'));
        const secret = process.env.JWT_SECRET || 'GiaPhaViet_Secret_Key_2024_Backup';
        const decoded = jwt.verify(token, secret);
        const accountId = Number(decoded.id || decoded.account_id);
        if (!Number.isFinite(accountId) || accountId <= 0) return next(new Error('Socket JWT account is invalid'));
        const [rows] = await db.query(
            `SELECT a.id AS account_id, COALESCE(p.id, ac.person_id) AS person_id, COALESCE(p.clan_id, ac.clan_id) AS clan_id
             FROM accounts a
             LEFT JOIN account_clans ac ON ac.account_id = a.id AND ac.status = 'active'
             LEFT JOIN people p ON p.id = COALESCE(a.person_id, ac.person_id)
             WHERE a.id = ? LIMIT 1`,
            [accountId]
        );
        if (!rows.length) return next(new Error('Socket account not found'));
        socket.user = { ...decoded, account_id: accountId };
        socket.accountContext = rows[0];
        next();
    } catch (error) {
        next(new Error('Socket JWT invalid or expired'));
    }
});

const treeSocketKey = (clanId, personId, socketId) => `${Number(clanId)}:${Number(personId)}:${socketId}`;
const emitTreePresence = (clanId) => {
    if (!clanId) return;
    const onlineMap = new Map();
    for (const item of app.locals.treeOnline.values()) {
        if (Number(item.clan_id) === Number(clanId)) {
            onlineMap.set(Number(item.person_id), { clan_id: Number(item.clan_id), person_id: Number(item.person_id), account_id: Number(item.account_id) });
        }
    }
    const editingMap = new Map();
    for (const item of app.locals.treeEditing.values()) {
        if (Number(item.clan_id) === Number(clanId)) {
            editingMap.set(`${Number(item.person_id)}:${Number(item.account_id)}`, { clan_id: Number(item.clan_id), person_id: Number(item.person_id), account_id: Number(item.account_id) });
        }
    }
    io.to(`clan_${clanId}`).emit('family_tree_online_users', { clan_id: Number(clanId), users: [...onlineMap.values()] });
    io.to(`clan_${clanId}`).emit('family_tree_editing_users', { clan_id: Number(clanId), users: [...editingMap.values()] });
};

io.on('connection', (socket) => {
    const context = socket.accountContext || {};
    const accountId = Number(context.account_id || socket.user?.account_id);
    const clanId = Number(context.clan_id);
    const personId = Number(context.person_id);

    console.log(`Socket connected: ${socket.id}`);
    if (accountId) {
        app.locals.onlineUsers[accountId] = socket.id;
        socket.join(`account_${accountId}`);
    }

    if (Number.isFinite(clanId) && clanId > 0) {
        socket.join(`clan_${clanId}`);
        if (Number.isFinite(personId) && personId > 0) {
            app.locals.treeOnline.set(treeSocketKey(clanId, personId, socket.id), {
                clan_id: clanId,
                person_id: personId,
                account_id: accountId,
                socket_id: socket.id,
            });
        }
        emitTreePresence(clanId);
    }

    socket.on('register_user', () => {
        if (accountId) socket.join(`account_${accountId}`);
        if (Number.isFinite(clanId) && clanId > 0) socket.join(`clan_${clanId}`);
    });

    socket.on('family_tree_join', () => {
        if (!Number.isFinite(clanId) || clanId <= 0) return;
        socket.join(`clan_${clanId}`);
        emitTreePresence(clanId);
    });

    socket.on('family_tree_leave', () => {
        if (!Number.isFinite(clanId) || clanId <= 0) return;
        socket.leave(`clan_${clanId}`);
    });

    socket.on('person_editing_start', async (data = {}) => {
        if (!Number.isFinite(clanId) || clanId <= 0) return;
        const targetPersonId = Number(data.person_id || data.personId);
        if (!Number.isFinite(targetPersonId) || targetPersonId <= 0) return;
        const [targetRows] = await db.query('SELECT id FROM people WHERE id = ? AND clan_id = ? LIMIT 1', [targetPersonId, clanId]);
        if (!targetRows.length) return;
        app.locals.treeEditing.set(treeSocketKey(clanId, targetPersonId, socket.id), {
            clan_id: clanId,
            person_id: targetPersonId,
            account_id: accountId,
            socket_id: socket.id,
        });
        emitTreePresence(clanId);
    });

    socket.on('person_editing_stop', (data = {}) => {
        if (!Number.isFinite(clanId) || clanId <= 0) return;
        const targetPersonId = Number(data.person_id || data.personId);
        if (!Number.isFinite(targetPersonId) || targetPersonId <= 0) return;
        app.locals.treeEditing.delete(treeSocketKey(clanId, targetPersonId, socket.id));
        emitTreePresence(clanId);
    });
    socket.on('send_task', (data) => {
        const { receiverId, title, senderName, dueDate } = data;
        const receiverSocketId = app.locals.onlineUsers[receiverId];

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('new_notification', {
                message: `Bạn có việc mới: "${title}" từ ${senderName}`,
                dueDate,
                time: new Date().toLocaleTimeString()
            });

            console.log(`✅ Đã bắn thông báo tới User ${receiverId}`);
        }
    });

    socket.on('disconnect', () => {
        for (const id in app.locals.onlineUsers) {
            if (app.locals.onlineUsers[id] === socket.id) {
                delete app.locals.onlineUsers[id];
                break;
            }
        }

        if (Number.isFinite(clanId) && clanId > 0) {
            for (const key of [...app.locals.treeOnline.keys()]) {
                if (key.endsWith(`:${socket.id}`)) app.locals.treeOnline.delete(key);
            }
            for (const key of [...app.locals.treeEditing.keys()]) {
                if (key.endsWith(`:${socket.id}`)) app.locals.treeEditing.delete(key);
            }
            emitTreePresence(clanId);
        }
    });
});

// 6. Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Backend is running'
    });
});

// 7. Upload API
app.post('/api/upload', verifyToken, (req, res) => {
    upload.single('image')(req, res, async (uploadError) => {
        if (uploadError) {
            const isMulterLimit = uploadError?.code === 'LIMIT_FILE_SIZE';

            return res.status(isMulterLimit ? 413 : 400).json({
                success: false,
                message: isMulterLimit
                    ? 'Tệp vượt quá dung lượng cho phép'
                    : uploadError.message || 'File media không hợp lệ'
            });
        }

        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'Không có file được chọn!'
                });
            }

            const accountId = req.user?.id || req.user?.account_id || null;
            const context = await getUploadContext(accountId);
            const usageType = req.body?.usage_type || req.body?.usageType || 'other';

            const mediaId = await createMediaFile({
                ownerAccountId: accountId,
                ownerPersonId: context.owner_person_id || context.ownerPersonId || req.user?.person_id || null,
                clanId: context.clan_id || context.clanId || null,
                usageType,
                originalFilename: req.file.originalname,
                mimeType: req.file.mimetype,
                fileSizeBytes: req.file.size,
                imageBuffer: req.file.buffer,
            });

            const imageUrl = getMediaUrl(req, mediaId);

            return res.json({
                success: true,
                mediaId,
                media_id: mediaId,
                imageUrl,
                url: imageUrl,
                mimeType: req.file.mimetype,
                mime_type: req.file.mimetype
            });
        } catch (error) {
            console.error('Upload media to database error:', error);

            return res.status(500).json({
                success: false,
                message: 'Không thể lưu media vào database'
            });
        }
    });
});



// 7.1 Upload API for family memories: image, video, audio are stored in MySQL media_files
const memoryMediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Number(process.env.MAX_MEMORY_MEDIA_UPLOAD_BYTES || 50 * 1024 * 1024) },
    fileFilter: (req, file, cb) => {
        const mime = String(file.mimetype || '').toLowerCase();
        if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) {
            return cb(null, true);
        }
        return cb(new Error('Chỉ cho phép tải ảnh, video hoặc ghi âm'));
    }
});

app.post('/api/upload-memory-media', verifyToken, (req, res) => {
    memoryMediaUpload.single('file')(req, res, async (uploadError) => {
        if (uploadError) {
            const isMulterLimit = uploadError?.code === 'LIMIT_FILE_SIZE';
            return res.status(isMulterLimit ? 413 : 400).json({
                success: false,
                message: isMulterLimit ? 'Tệp vượt quá dung lượng cho phép' : uploadError.message || 'Tệp không hợp lệ'
            });
        }

        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'Không có tệp được chọn' });
            }

            const accountId = req.user?.id || req.user?.account_id || null;
            const context = await getUploadContext(accountId);
            const mediaId = await createMediaFile({
                ownerAccountId: accountId,
                ownerPersonId: context.owner_person_id || context.ownerPersonId || req.user?.person_id || null,
                clanId: context.clan_id || context.clanId || null,
                usageType: 'other',
                originalFilename: req.file.originalname,
                mimeType: req.file.mimetype,
                fileSizeBytes: req.file.size,
                imageBuffer: req.file.buffer,
            });
            const url = getMediaUrl(req, mediaId);
            return res.json({
                success: true,
                mediaId,
                media_id: mediaId,
                url,
                mediaUrl: url,
                mimeType: req.file.mimetype,
                originalFilename: req.file.originalname,
            });
        } catch (error) {
            console.error('Upload memory media error:', error);
            return res.status(500).json({ success: false, message: 'Không thể lưu tệp vào database' });
        }
    });
});

// 8. Main API routes
app.use('/api/media', mediaRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/me', meRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/payments', paymentRoutes);

app.get(
    '/api/clans/:clanId/family-tree',
    verifyToken,
    checkRole(['admin', 'manager']),
    managerController.getFamilyTree
);

app.patch(
    '/api/clans/:clanId/family-tree/layout',
    verifyToken,
    checkRole(['admin', 'manager']),
    managerController.saveTreeLayout
);

app.post(
    '/api/people',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    managerController.createPerson
);

app.patch(
    '/api/people/layout',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    managerController.saveTreeLayout
);

app.post(
    '/api/manager/tree/layout/batch',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    managerController.saveTreeLayoutBatch
);

app.patch(
    '/api/people/link',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    managerController.linkRelations
);

app.patch(
    '/api/people/:id/position',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    managerController.updatePersonPosition
);

app.patch(
    '/api/people/:id',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    managerController.updateTreePerson
);

app.delete(
    '/api/people/:id',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    managerController.deleteTreePerson
);

app.post(
    '/api/families',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    managerController.createFamily
);

app.post(
    '/api/families/:familyId/children',
    verifyToken,
    checkRole(['admin', 'manager', 'member']),
    managerController.addFamilyChild
);

app.use('/api/manager', managerRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/voice', voiceRoutes);

// 9. 404 handler phải luôn nằm cuối routes
app.use((req, res) => {
    res.status(404).json({
        message: 'Đường dẫn không tồn tại!'
    });
});

// 10. Start server
const PORT = process.env.PORT || 3000;

startCalendarReminderScheduler(app);

server.listen(PORT, () => {
    console.log(`
    🚀 SERVER IS RUNNING (REAL-TIME READY)!
    📡 Port: ${PORT}
    🔗 URL: http://localhost:${PORT}
    ✨ Socket.io: Enabled
    `);
});
