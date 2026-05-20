const {
    ensureArchivedMembersTable,
} = require('./archive.service');
const {
    db,
    fmtSqlDate,
    ACTIVE_TREE_MEMBER_WHERE_SQL,
    ARCHIVED_MEMBER_JOIN_SQL,
    filterTreeRelationsForVisiblePeople,
    getTreeLayoutSettings,
} = require('./common.service');
const {
    ensureFamilyRelationshipColumns,
    ensurePeopleTreeLayoutColumns,
} = require('../genealogy/familyRelation.service');
const {
    getManagerClanId,
    resolveManagedClanId,
} = require('./managerClan.service');

const getClanInfo = async(req, res) => {
    try {
        const clanId = await resolveManagedClanId(req);
        if (clanId == null) {
            return res.status(404).json({ success: false, message: 'Không xác định được dòng họ cần quản lý' });
        }

        const [rows] = await db.query(
            'SELECT id, clan_name, history, hall_address, created_at FROM clans WHERE id = ? LIMIT 1', [clanId]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Dòng họ không tồn tại' });
        }

        return res.json({ success: true, clan: rows[0] });
    } catch (error) {
        console.error('getClanInfo error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi lấy thông tin dòng họ' });
    }
};

const updateClanInfo = async(req, res) => {
    try {
        const clanId = await resolveManagedClanId(req);
        if (clanId == null) {
            return res.status(404).json({ success: false, message: 'Không xác định được dòng họ cần quản lý' });
        }

        const clanName = String(req.body.clan_name || '').trim();
        const history = req.body.history == null ? '' : String(req.body.history).trim();
        const hallAddress = req.body.hall_address == null ? '' : String(req.body.hall_address).trim();

        if (!clanName) {
            return res.status(400).json({ success: false, message: 'Tên dòng họ không được để trống' });
        }

        const [exists] = await db.query('SELECT id FROM clans WHERE id = ? LIMIT 1', [clanId]);
        if (!exists.length) {
            return res.status(404).json({ success: false, message: 'Dòng họ không tồn tại' });
        }

        const [duplicate] = await db.query(
            'SELECT id FROM clans WHERE LOWER(clan_name) = LOWER(?) AND id <> ? LIMIT 1', [clanName, clanId]
        );
        if (duplicate.length) {
            return res.status(409).json({ success: false, message: 'Tên dòng họ này đã tồn tại' });
        }

        await db.query(
            'UPDATE clans SET clan_name = ?, history = ?, hall_address = ? WHERE id = ?', [clanName, history || null, hallAddress || null, clanId]
        );

        const [rows] = await db.query(
            'SELECT id, clan_name, history, hall_address, created_at FROM clans WHERE id = ? LIMIT 1', [clanId]
        );

        return res.json({ success: true, message: 'Đã cập nhật thông tin dòng họ', clan: rows[0] });
    } catch (error) {
        console.error('updateClanInfo error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật thông tin dòng họ' });
    }
};

const getFamilyTree = async(req, res) => {
    try {
        await ensureArchivedMembersTable();
        await ensurePeopleTreeLayoutColumns();
        await ensureFamilyRelationshipColumns();
        const clanId = await resolveManagedClanId(req);
        if (clanId == null) {
            return res.status(404).json({ success: false, message: 'Không xác định được dòng họ cần quản lý' });
        }

        const [clanRows] = await db.query(
            'SELECT id, clan_name, history, hall_address, created_at FROM clans WHERE id = ? LIMIT 1', [clanId]
        );
        if (!clanRows.length) {
            return res.status(404).json({ success: false, message: 'Dòng họ không tồn tại' });
        }

        const [peopleRows] = await db.query(
            `
            SELECT
                p.id,
                p.clan_id,
                p.display_name,
                p.first_name,
                p.middle_name,
                p.surname,
                p.gender,
                p.generation,
                p.branch,
                p.birth_date,
                p.death_date,
                p.is_living,
                p.phone,
                p.email,
                p.address,
                p.hometown,
                COALESCE(p.pending_avatar_url, p.avatar_url) AS avatar_url,
                COALESCE(p.pending_avatar_media_id, p.avatar_media_id) AS avatar_media_id,
                p.pending_avatar_url,
                p.pending_avatar_media_id,
                p.bio,
                p.note,
                p.tree_x,
                p.tree_y,
                p.display_order,
                a.id AS account_id,
                a.email AS account_email,
                a.role_id,
                a.status AS account_status
            FROM people p
            LEFT JOIN accounts a ON a.person_id = p.id
            ${ARCHIVED_MEMBER_JOIN_SQL}
            WHERE p.clan_id = ?
              ${ACTIVE_TREE_MEMBER_WHERE_SQL}
            ORDER BY p.generation, p.display_order, p.surname, p.middle_name, p.first_name, p.id
            `, [clanId]

        );

        const [familyRows] = await db.query(
            `SELECT id, clan_id, father_id, mother_id, marriage_date,
                    relationship_status, ended_at, relation_note
             FROM families
             WHERE clan_id = ?
             ORDER BY id ASC`,
            [clanId]
        );
        const [childRows] = await db.query(
            `
            SELECT c.family_id, c.person_id, c.sort_order
            FROM families f
            STRAIGHT_JOIN children c ON c.family_id = f.id
            WHERE f.clan_id = ?
            ORDER BY c.family_id, c.sort_order, c.id
            `, [clanId]
        );
        const visibleTree = filterTreeRelationsForVisiblePeople(familyRows, childRows, peopleRows);
        const layoutSettings = await getTreeLayoutSettings(clanId);

        return res.json({
            success: true,
            clan: clanRows[0],
            treeMembers: peopleRows.map((p) => ({
                ...p,
                birth_date: fmtSqlDate(p.birth_date),
                death_date: fmtSqlDate(p.death_date),
            })),
            families: visibleTree.familyRows.map((f) => ({
                ...f,
                marriage_date: fmtSqlDate(f.marriage_date),
                ended_at: fmtSqlDate(f.ended_at),
            })),
            children: visibleTree.childRows,
            layoutSettings,
        });
    } catch (error) {
        console.error('getFamilyTree error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy cây gia phả' });
    }
};

const checkTableExists = async(tableName) => {
    const [rows] = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
        `,
        [tableName]
    );
    return Number(rows[0]?.total || 0) > 0;
};

const getManagerBillingUsage = async(clanId, totalMembers, totalAccounts) => {
    const [hasPlans, hasSubscriptions] = await Promise.all([
        checkTableExists('plans'),
        checkTableExists('subscriptions'),
    ]);

    if (!hasPlans || !hasSubscriptions) {
        return null;
    }

    const [rows] = await db.query(
        `
        SELECT
            s.id AS subscription_id,
            s.status,
            s.started_at,
            s.expires_at,
            p.id AS plan_id,
            p.code AS plan_code,
            p.name AS plan_name,
            p.person_limit,
            p.account_limit
        FROM subscriptions s
        INNER JOIN plans p ON p.id = s.plan_id
        WHERE s.clan_id = ?
        ORDER BY
            CASE WHEN s.status IN ('active', 'free') THEN 0 ELSE 1 END,
            s.id DESC
        LIMIT 1
        `,
        [clanId]
    );

    if (!rows.length) {
        return null;
    }

    const billing = rows[0];
    const personLimit = Number(billing.person_limit || 0);
    const accountLimit = Number(billing.account_limit || 0);
    const peopleUsagePercent = personLimit > 0 ? Math.round((Number(totalMembers || 0) / personLimit) * 100) : 0;
    const accountUsagePercent = accountLimit > 0 ? Math.round((Number(totalAccounts || 0) / accountLimit) * 100) : 0;

    return {
        subscription_id: billing.subscription_id,
        status: billing.status,
        started_at: billing.started_at,
        expires_at: billing.expires_at,
        plan_id: billing.plan_id,
        plan_code: billing.plan_code,
        plan_name: billing.plan_name,
        person_limit: personLimit,
        account_limit: accountLimit,
        current_people: Number(totalMembers || 0),
        current_accounts: Number(totalAccounts || 0),
        people_usage_percent: peopleUsagePercent,
        account_usage_percent: accountUsagePercent,
        is_people_near_limit: personLimit > 0 && peopleUsagePercent >= 80,
        is_account_near_limit: accountLimit > 0 && accountUsagePercent >= 80,
    };
};

const getStats = async(req, res) => {
    try {
        if (req.user.role_id === 2) {
            const clanId = await getManagerClanId(req.user.id);
            if (clanId === null) {
                return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
            }

            const [[membersCount]] = await db.query(
                'SELECT COUNT(*) AS cnt FROM people WHERE clan_id = ?',
                [clanId]
            );
            const [[accountCount]] = await db.query(
                `
                SELECT COUNT(DISTINCT a.id) AS cnt
                FROM accounts a
                INNER JOIN people p ON p.id = a.person_id
                WHERE p.clan_id = ?
                  AND a.status = 'active'
                `,
                [clanId]
            );
            const [[managerCount]] = await db.query(
                `
                SELECT COUNT(DISTINCT a.id) AS cnt
                FROM accounts a
                INNER JOIN people p ON p.id = a.person_id
                WHERE p.clan_id = ?
                  AND a.role_id = 2
                  AND a.status = 'active'
                `,
                [clanId]
            );
            const [[pendingCount]] = await db.query(
                `
                SELECT COUNT(DISTINCT a.id) AS cnt
                FROM accounts a
                INNER JOIN people p ON p.id = a.person_id
                WHERE p.clan_id = ?
                  AND a.status = 'pending'
                `,
                [clanId]
            );

            const totalMembers = Number(membersCount?.cnt || 0);
            const totalAccounts = Number(accountCount?.cnt || 0);
            const billing_usage = await getManagerBillingUsage(clanId, totalMembers, totalAccounts).catch((error) => {
                console.warn('getManagerBillingUsage warning:', error?.message || error);
                return null;
            });

            return res.json({
                total_members: totalMembers,
                total_accounts: totalAccounts,
                total_managers: Number(managerCount?.cnt || 0),
                total_pending: Number(pendingCount?.cnt || 0),
                billing_usage,
            });
        }

        const [[membersCount]] = await db.query('SELECT COUNT(*) AS cnt FROM people');
        const [[accountCount]] = await db.query("SELECT COUNT(*) AS cnt FROM accounts WHERE status = 'active'");
        const [[managerCount]] = await db.query("SELECT COUNT(*) AS cnt FROM accounts WHERE role_id = 2 AND status = 'active'");
        const [[pendingCount]] = await db.query("SELECT COUNT(*) AS cnt FROM accounts WHERE status = 'pending'");

        return res.json({
            total_members: Number(membersCount?.cnt || 0),
            total_accounts: Number(accountCount?.cnt || 0),
            total_managers: Number(managerCount?.cnt || 0),
            total_pending: Number(pendingCount?.cnt || 0),
            billing_usage: null,
        });
    } catch (error) {
        console.error('getStats error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy thống kê' });
    }
};

const getMedia = async(req, res) => {
    try {
        let sql = `
            SELECT p.id as post_id, p.description, p.content, p.image_url, p.image_media_id, p.created_at, author.display_name as author_name
            FROM posts p
            JOIN accounts a ON p.author_id = a.id
            JOIN people author ON a.person_id = author.id
            WHERE ((p.image_url IS NOT NULL AND p.image_url != '') OR p.image_media_id IS NOT NULL) AND p.status != 'rejected'
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
        console.error('getMedia error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách dữ liệu truyền thông (Media)' });
    }
};

module.exports = {
    getClanInfo,
    updateClanInfo,
    getFamilyTree,
    getStats,
    getMedia,
};
