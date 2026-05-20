const {
    db,
    ensureCanAddAccount,
    parseOptionalPositiveInt,
} = require('./common.service');
const {
    getManagerClanId,
} = require('./managerClan.service');
const {
    ensureFamilyMemoriesSchemaForManager,
    mapManagerMemoryRow,
} = require('./memoryModeration.service');

const emitToAccount = (req, accountId, eventName, payload) => {
    if (!req?.app?.locals?.emitToAccount || !accountId) return;
    req.app.locals.emitToAccount(accountId, eventName, payload);
};

const emitToClan = (req, clanId, eventName, payload) => {
    if (!req?.app?.locals?.emitToClan || !clanId) return;
    req.app.locals.emitToClan(clanId, eventName, payload);
};

const createAndEmitNotification = async (req, accountId, payload) => {
    if (!accountId) return;

    const [result] = await db.query(
        `
        INSERT INTO notifications
          (receiver_account_id, type, title, message, link_url)
        VALUES (?, ?, ?, ?, ?)
        `,
        [
            accountId,
            payload.type || "approval_result",
            payload.title || "Thông báo mới",
            payload.message || "Bạn có cập nhật mới trong hệ thống.",
            payload.link_url || payload.linkUrl || "/member/submissions",
        ]
    );

    emitToAccount(req, accountId, "new_notification", {
        id: result.insertId,
        type: payload.type || "approval_result",
        title: payload.title || "Thông báo mới",
        message: payload.message || "Bạn có cập nhật mới trong hệ thống.",
        link_url: payload.link_url || payload.linkUrl || "/member/submissions",
        is_read: 0,
        created_at: new Date().toISOString(),
        relatedType: payload.relatedType || payload.related_type || null,
        relatedId: payload.relatedId || payload.related_id || null,
    });
};

const getPendingUsers = async(req, res) => {
    try {
        let sql = `
            SELECT a.id as account_id, a.role_id, a.status, p.first_name, p.surname, a.email, p.birth_date, p.clan_id 
            FROM accounts a
            JOIN people p ON a.person_id = p.id
            WHERE a.status = 'pending'`;

        const params = [];

        if (req.user.role_id === 2) {
            const clanId = await getManagerClanId(req.user.id);
            if (clanId === null) {
                return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
            }
            sql += ' AND p.clan_id = ?';
            params.push(clanId);
        }

        const [results] = await db.query(sql, params);
        res.json(results);
    } catch (error) {
        console.error('getPendingUsers error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách chờ' });
    }
};

const approveUser = async(req, res) => {
    const accountId = req.params.id;

    try {
        const [accountRows] = await db.query(
            `
            SELECT 
                a.id AS account_id,
                a.status,
                a.role_id,
                a.person_id,
                p.clan_id
            FROM accounts a
            JOIN people p ON a.person_id = p.id
            WHERE a.id = ?
            LIMIT 1
            `, [accountId]
        );

        if (!accountRows.length) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy tài khoản cần duyệt',
            });
        }

        const target = accountRows[0];

        if (!target.clan_id) {
            return res.status(400).json({
                success: false,
                message: 'Tài khoản chưa liên kết với dòng họ',
            });
        }

        if (String(target.status) === 'active') {
            return res.json({
                success: true,
                message: 'Tài khoản đã được kích hoạt trước đó',
            });
        }

        if (req.user.role_id === 2) {
            const managerClanId = await getManagerClanId(req.user.id);

            if (managerClanId == null) {
                return res.status(404).json({
                    success: false,
                    message: 'Không xác định được clan của manager',
                });
            }

            if (Number(target.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ được duyệt thành viên cùng dòng họ',
                });
            }
        }

        const accountLimitCheck = await ensureCanAddAccount(target.clan_id);

        if (!accountLimitCheck.ok) {
            return res.status(accountLimitCheck.status).json({
                success: false,
                code: accountLimitCheck.code,
                message: accountLimitCheck.message,
                billing: accountLimitCheck.billing,
            });
        }

        await db.query(
            "UPDATE accounts SET role_id = 3, status = 'active' WHERE id = ?",
            [accountId]
        );

        emitToClan(req, target.clan_id, "pending_approval_changed", {
            type: "user",
            action: "approved",
            id: Number(accountId),
            clanId: target.clan_id,
            at: new Date().toISOString(),
        });

        emitToAccount(req, accountId, "new_notification", {
            type: "approval_result",
            title: "Tài khoản đã được duyệt",
            message: "Tài khoản của bạn đã được trưởng họ duyệt.",
            relatedType: "user",
            relatedId: Number(accountId),
            createdAt: new Date().toISOString(),
        });

        return res.json({
            success: true,
            message: 'Phê duyệt thành công!',
        });
    } catch (error) {
        console.error('approveUser error:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: 'Lỗi phê duyệt',
        });
    }
};

const rejectUser = async(req, res) => {
    const accountId = req.params.id;
    const { reason } = req.body || {};

    try {
        const [targetRows] = await db.query(
            `
            SELECT 
                a.id AS account_id,
                a.status,
                p.clan_id
            FROM accounts a
            JOIN people p ON a.person_id = p.id
            WHERE a.id = ?
            LIMIT 1
            `,
            [accountId]
        );

        const target = targetRows[0];

        if (!target) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy tài khoản cần từ chối',
            });
        }

        if (req.user.role_id === 2) {
            const managerClanId = await getManagerClanId(req.user.id);

            if (managerClanId == null) {
                return res.status(404).json({
                    success: false,
                    message: 'Không xác định được clan của manager',
                });
            }

            if (Number(target.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ được từ chối thành viên cùng dòng họ',
                });
            }
        }

        const sql = "UPDATE accounts SET status = 'rejected' WHERE id = ?";
        await db.query(sql, [accountId]);

        emitToClan(req, target.clan_id, "pending_approval_changed", {
            type: "user",
            action: "rejected",
            id: Number(accountId),
            clanId: target.clan_id,
            at: new Date().toISOString(),
        });

        emitToAccount(req, accountId, "new_notification", {
            type: "approval_result",
            title: "Tài khoản bị từ chối",
            message: reason || "Tài khoản của bạn đã bị trưởng họ từ chối.",
            relatedType: "user",
            relatedId: Number(accountId),
            createdAt: new Date().toISOString(),
        });

        return res.json({
            success: true,
            message: 'Đã từ chối tài khoản (chuyển trạng thái rejected)',
        });
    } catch (error) {
        console.error('rejectUser error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi từ chối',
        });
    }
};

const getPendingPosts = async(req, res) => {
    try {
        let sql = `
            SELECT p.id as post_id, p.description, p.content, p.image_url, p.image_media_id, p.created_at, author.display_name as author_name, author.email as author_email
            FROM posts p
            JOIN accounts a ON p.author_id = a.id
            JOIN people author ON a.person_id = author.id
            WHERE p.status = 'pending'
        `;
        const params = [];

        if (req.user.role_id === 2) {
            const clanId = await getManagerClanId(req.user.id);
            if (clanId === null) {
                return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
            }
            sql += ' AND p.clan_id = ?';
            params.push(clanId);
        }

        sql += ' ORDER BY p.created_at DESC';
        const [results] = await db.query(sql, params);
        res.json(results);
    } catch (error) {
        console.error('getPendingPosts error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách bài viết chờ duyệt' });
    }
};

const approvePost = async(req, res) => {
    const postId = req.params.id;

    try {
        const [postRows] = await db.query(
            `
            SELECT 
                p.id,
                p.clan_id,
                p.author_id AS author_account_id
            FROM posts p
            WHERE p.id = ?
            LIMIT 1
            `,
            [postId]
        );

        const post = postRows[0];

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bài viết',
            });
        }

        if (req.user.role_id === 2) {
            const managerClanId = await getManagerClanId(req.user.id);

            if (managerClanId == null) {
                return res.status(404).json({
                    success: false,
                    message: 'Không xác định được clan của manager',
                });
            }

            if (Number(post.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ được duyệt bài viết cùng dòng họ',
                });
            }
        }

        const sql = "UPDATE posts SET status = 'approved' WHERE id = ?";
        await db.query(sql, [postId]);

        emitToClan(req, post.clan_id, "pending_approval_changed", {
            type: "post",
            action: "approved",
            id: Number(postId),
            clanId: post.clan_id,
            at: new Date().toISOString(),
        });

        emitToClan(req, post.clan_id, "post_feed_updated", {
            action: "post_approved",
            post_id: Number(postId),
            clan_id: post.clan_id,
            actor_account_id: req.user?.id || req.user?.account_id || null,
            updated_at: new Date().toISOString(),
        });

        emitToAccount(req, post.author_account_id, "new_notification", {
            type: "approval_result",
            title: "Bài viết đã được duyệt",
            message: "Bài viết của bạn đã được trưởng họ duyệt.",
            relatedType: "post",
            relatedId: Number(postId),
            createdAt: new Date().toISOString(),
        });

        return res.json({ success: true, message: 'Đã phê duyệt bài viết!' });
    } catch (error) {
        console.error('approvePost error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi phê duyệt bài viết' });
    }
};

const rejectPost = async(req, res) => {
    const postId = req.params.id;
    const { reason } = req.body;

    try {
        const [postRows] = await db.query(
            `
            SELECT 
                id,
                clan_id,
                author_id AS author_account_id
            FROM posts
            WHERE id = ?
            LIMIT 1
            `,
            [postId]
        );

        const post = postRows[0];

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bài viết',
            });
        }

        if (req.user.role_id === 2) {
            const managerClanId = await getManagerClanId(req.user.id);

            if (managerClanId == null) {
                return res.status(404).json({
                    success: false,
                    message: 'Không xác định được clan của manager',
                });
            }

            if (Number(post.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ được từ chối bài viết cùng dòng họ',
                });
            }
        }

        const rejectReason = reason || 'Không có lý do';

        const sql = "UPDATE posts SET status = 'rejected', rejection_reason = ? WHERE id = ?";
        await db.query(sql, [rejectReason, postId]);

        emitToClan(req, post.clan_id, "pending_approval_changed", {
            type: "post",
            action: "rejected",
            id: Number(postId),
            clanId: post.clan_id,
            at: new Date().toISOString(),
        });

        emitToAccount(req, post.author_account_id, "new_notification", {
            type: "approval_result",
            title: "Bài viết bị từ chối",
            message: rejectReason,
            relatedType: "post",
            relatedId: Number(postId),
            createdAt: new Date().toISOString(),
        });

        return res.json({
            success: true,
            message: 'Đã từ chối bài viết!',
        });
    } catch (error) {
        console.error('rejectPost error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi từ chối bài viết',
        });
    }
};

const getPendingProfileUpdates = async (req, res) => {
    try {
        let sql = `
            SELECT id as person_id, display_name, surname, first_name, pending_bio, pending_avatar_url, pending_avatar_media_id, bio as current_bio, avatar_url as current_avatar_url, avatar_media_id as current_avatar_media_id, clan_id
            FROM people
            WHERE moderation_status = 'pending'
        `;
        const params = [];

        if (req.user.role_id === 2) {
            const clanId = await getManagerClanId(req.user.id);
            if (clanId === null) {
                return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
            }
            sql += ' AND clan_id = ?';
            params.push(clanId);
        }

        const [results] = await db.query(sql, params);
        res.json(results);
    } catch (error) {
        console.error('getPendingProfileUpdates error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách profile chờ duyệt' });
    }
};

const approveProfileUpdate = async (req, res) => {
    const personId = req.params.id;

    try {
        const [personRows] = await db.query(
            `
            SELECT 
                p.id AS person_id,
                p.clan_id,
                a.id AS account_id
            FROM people p
            LEFT JOIN accounts a ON a.person_id = p.id
            WHERE p.id = ?
            LIMIT 1
            `,
            [personId]
        );

        const person = personRows[0];

        if (!person) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy hồ sơ',
            });
        }

        if (req.user.role_id === 2) {
            const managerClanId = await getManagerClanId(req.user.id);

            if (managerClanId == null) {
                return res.status(404).json({
                    success: false,
                    message: 'Không xác định được clan của manager',
                });
            }

            if (Number(person.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ được duyệt hồ sơ cùng dòng họ',
                });
            }
        }

        await db.query(`
            UPDATE people 
            SET 
                bio = COALESCE(pending_bio, bio), 
                avatar_url = COALESCE(pending_avatar_url, avatar_url),
                avatar_media_id = COALESCE(pending_avatar_media_id, avatar_media_id),
                pending_bio = NULL,
                pending_avatar_url = NULL,
                pending_avatar_media_id = NULL,
                moderation_status = 'none',
                moderation_reason = NULL
            WHERE id = ?`, 
            [personId]
        );

        emitToClan(req, person.clan_id, "pending_approval_changed", {
            type: "profile",
            action: "approved",
            id: Number(personId),
            clanId: person.clan_id,
            at: new Date().toISOString(),
        });

        await createAndEmitNotification(req, person.account_id, {
            type: "approval_result",
            title: "Cập nhật hồ sơ đã được duyệt",
            message: "Thông tin hồ sơ của bạn đã được trưởng họ duyệt.",
            link_url: "/member/dashboard",
            relatedType: "profile",
            relatedId: Number(personId),
        });

        return res.json({
            success: true,
            message: 'Đã phê duyệt cập nhật hồ sơ!',
        });
    } catch (error) {
        console.error('approveProfileUpdate error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi phê duyệt hồ sơ',
        });
    }
};

const rejectProfileUpdate = async (req, res) => {
    const personId = req.params.id;
    const { reason } = req.body;

    try {
        const [personRows] = await db.query(
            `
            SELECT 
                p.id AS person_id,
                p.clan_id,
                a.id AS account_id
            FROM people p
            LEFT JOIN accounts a ON a.person_id = p.id
            WHERE p.id = ?
            LIMIT 1
            `,
            [personId]
        );

        const person = personRows[0];

        if (!person) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy hồ sơ',
            });
        }

        if (req.user.role_id === 2) {
            const managerClanId = await getManagerClanId(req.user.id);

            if (managerClanId == null) {
                return res.status(404).json({
                    success: false,
                    message: 'Không xác định được clan của manager',
                });
            }

            if (Number(person.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ được từ chối hồ sơ cùng dòng họ',
                });
            }
        }

        const rejectReason = reason || 'Không có lý do';

        await db.query(`
            UPDATE people 
            SET 
                moderation_status = 'rejected',
                moderation_reason = ?
            WHERE id = ?`, 
            [rejectReason, personId]
        );

        emitToClan(req, person.clan_id, "pending_approval_changed", {
            type: "profile",
            action: "rejected",
            id: Number(personId),
            clanId: person.clan_id,
            at: new Date().toISOString(),
        });

        await createAndEmitNotification(req, person.account_id, {
            type: "approval_result",
            title: "Cập nhật hồ sơ bị từ chối",
            message: rejectReason,
            link_url: "/member/dashboard",
            relatedType: "profile",
            relatedId: Number(personId),
        });

        return res.json({
            success: true,
            message: 'Đã từ chối cập nhật hồ sơ!',
        });
    } catch (error) {
        console.error('rejectProfileUpdate error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi từ chối hồ sơ',
        });
    }
};

const getPendingMemories = async (req, res) => {
    try {
        await ensureFamilyMemoriesSchemaForManager();
        let clanId = null;
        if (Number(req.user.role_id) === 2) {
            clanId = await getManagerClanId(req.user.id);
            if (!clanId) return res.status(404).json({ success: false, message: 'Không xác định được dòng họ của manager' });
        } else {
            clanId = parseOptionalPositiveInt(req.query.clan_id || req.body?.clan_id);
        }

        const values = [];
        let where = "fm.status = 'pending'";
        if (clanId) {
            where += ' AND fm.clan_id = ?';
            values.push(clanId);
        }

        const [rows] = await db.query(
            `SELECT fm.*, COALESCE(p.display_name, a.email) AS author_name, a.email AS author_email
             FROM family_memories fm
             LEFT JOIN accounts a ON a.id = fm.author_account_id
             LEFT JOIN people p ON p.id = fm.author_person_id
             WHERE ${where}
             ORDER BY fm.created_at DESC`,
            values
        );
        return res.json({ success: true, memories: rows.map(mapManagerMemoryRow) });
    } catch (error) {
        console.error('getPendingMemories error:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải kỉ niệm chờ duyệt' });
    }
};

const approveMemory = async (req, res) => {
    try {
        await ensureFamilyMemoriesSchemaForManager();
        const memoryId = Number(req.params.id);
        if (!Number.isInteger(memoryId) || memoryId <= 0) return res.status(400).json({ success: false, message: 'ID kỉ niệm không hợp lệ' });

        const values = [memoryId];
        let where = 'id = ?';
        if (Number(req.user.role_id) === 2) {
            const clanId = await getManagerClanId(req.user.id);
            if (!clanId) return res.status(404).json({ success: false, message: 'Không xác định được dòng họ của manager' });
            where += ' AND clan_id = ?';
            values.push(clanId);
        }

        const [memoryRows] = await db.query(
            `
            SELECT 
                id,
                clan_id,
                author_account_id
            FROM family_memories
            WHERE ${where}
            LIMIT 1
            `,
            values
        );

        const memory = memoryRows[0];

        if (!memory) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy kỉ niệm chờ duyệt',
            });
        }

        const [result] = await db.query(
            `UPDATE family_memories SET status = 'approved', rejection_reason = NULL, approved_by_account_id = ?, approved_at = CURRENT_TIMESTAMP WHERE ${where}`,
            [req.user.id, ...values]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy kỉ niệm chờ duyệt',
            });
        }

        emitToClan(req, memory.clan_id, "pending_approval_changed", {
            type: "memory",
            action: "approved",
            id: Number(memoryId),
            clanId: memory.clan_id,
            at: new Date().toISOString(),
        });

        emitToAccount(req, memory.author_account_id, "new_notification", {
            type: "approval_result",
            title: "Kỷ niệm đã được duyệt",
            message: "Kỷ niệm của bạn đã được trưởng họ duyệt.",
            relatedType: "memory",
            relatedId: Number(memoryId),
            createdAt: new Date().toISOString(),
        });

        return res.json({
            success: true,
            message: 'Đã duyệt kỉ niệm dòng họ',
        });
    } catch (error) {
        console.error('approveMemory error:', error);
        return res.status(500).json({ success: false, message: 'Không thể duyệt kỉ niệm' });
    }
};

const rejectMemory = async (req, res) => {
    try {
        await ensureFamilyMemoriesSchemaForManager();
        const memoryId = Number(req.params.id);
        if (!Number.isInteger(memoryId) || memoryId <= 0) return res.status(400).json({ success: false, message: 'ID kỉ niệm không hợp lệ' });
        const reason = String(req.body?.reason || '').trim() || 'Nội dung chưa phù hợp';

        const values = [memoryId];
        let where = 'id = ?';
        if (Number(req.user.role_id) === 2) {
            const clanId = await getManagerClanId(req.user.id);
            if (!clanId) return res.status(404).json({ success: false, message: 'Không xác định được dòng họ của manager' });
            where += ' AND clan_id = ?';
            values.push(clanId);
        }

        const [memoryRows] = await db.query(
            `
            SELECT 
                id,
                clan_id,
                author_account_id
            FROM family_memories
            WHERE ${where}
            LIMIT 1
            `,
            values
        );

        const memory = memoryRows[0];

        if (!memory) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy kỉ niệm chờ duyệt',
            });
        }

        const [result] = await db.query(
            `UPDATE family_memories SET status = 'rejected', rejection_reason = ? WHERE ${where}`,
            [reason, ...values]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy kỉ niệm chờ duyệt',
            });
        }

        emitToClan(req, memory.clan_id, "pending_approval_changed", {
            type: "memory",
            action: "rejected",
            id: Number(memoryId),
            clanId: memory.clan_id,
            at: new Date().toISOString(),
        });

        emitToAccount(req, memory.author_account_id, "new_notification", {
            type: "approval_result",
            title: "Kỷ niệm bị từ chối",
            message: reason,
            relatedType: "memory",
            relatedId: Number(memoryId),
            createdAt: new Date().toISOString(),
        });

        return res.json({
            success: true,
            message: 'Đã từ chối kỉ niệm dòng họ',
        });
    } catch (error) {
        console.error('rejectMemory error:', error);
        return res.status(500).json({ success: false, message: 'Không thể từ chối kỉ niệm' });
    }
};

module.exports = {
    getPendingUsers,
    approveUser,
    rejectUser,
    getPendingPosts,
    approvePost,
    rejectPost,
    getPendingProfileUpdates,
    approveProfileUpdate,
    rejectProfileUpdate,
    getPendingMemories,
    approveMemory,
    rejectMemory,
};
