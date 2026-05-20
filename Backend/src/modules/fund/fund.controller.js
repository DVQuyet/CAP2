const db = require('../../config/db');
const XLSX = require('xlsx');

const ensureEventCostRecipientColumns = async () => {
    const [columns] = await db.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'event_costs'
          AND COLUMN_NAME IN ('recipient_person_id', 'recipient_note', 'paid_to_manager', 'status', 'method', 'evidence_media_id')
    `);

    const existing = new Set(columns.map(c => c.COLUMN_NAME));

    if (!existing.has('recipient_person_id')) {
        await db.query('ALTER TABLE event_costs ADD COLUMN recipient_person_id INT NULL AFTER campaign_id');
    }

    if (!existing.has('recipient_note')) {
        await db.query('ALTER TABLE event_costs ADD COLUMN recipient_note TEXT NULL AFTER note');
    }

    if (!existing.has('paid_to_manager')) {
        await db.query('ALTER TABLE event_costs ADD COLUMN paid_to_manager TINYINT(1) NOT NULL DEFAULT 0 AFTER recipient_note');
    }

    if (!existing.has('status')) {
        await db.query("ALTER TABLE event_costs ADD COLUMN status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved' AFTER category");
    }

    if (!existing.has('evidence_media_id')) {
        await db.query('ALTER TABLE event_costs ADD COLUMN evidence_media_id INT NULL AFTER category');
    }

    if (!existing.has('method')) {
        await db.query("ALTER TABLE event_costs ADD COLUMN method VARCHAR(50) NOT NULL DEFAULT 'Tiền mặt' AFTER status");
    }

    // Check fund_campaigns for target_goal
    const [fcCols] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fund_campaigns' AND COLUMN_NAME = 'target_goal'
    `);
    if (fcCols.length === 0) {
        await db.query('ALTER TABLE fund_campaigns ADD COLUMN target_goal DECIMAL(15,2) DEFAULT 0 AFTER description');
    }
};

const getUserClanId = async (accountId) => {
    const [rows] = await db.query(
        'SELECT clan_id FROM people WHERE id = (SELECT person_id FROM accounts WHERE id = ?)',
        [accountId]
    );
    return rows.length ? rows[0].clan_id : null;
};

// --- CAMPAIGN MANAGEMENT ---

exports.getCampaigns = async (req, res) => {
    try {
        let clanId = req.query.clan_id;
        if (!clanId && req.user) clanId = await getUserClanId(req.user.id);
        if (!clanId) return res.status(400).json({ success: false, message: 'Clan ID is required' });

        const [campaigns] = await db.query(
            'SELECT * FROM fund_campaigns WHERE clan_id = ? ORDER BY year DESC, created_at DESC',
            [clanId]
        );

        for (let c of campaigns) {
            const [rows] = await db.query(
                "SELECT SUM(amount) as total FROM event_contributions WHERE campaign_id = ? AND status = 'approved'",
                [c.id]
            );

            const [expenseRows] = await db.query(
                "SELECT SUM(amount) as total FROM event_costs WHERE campaign_id = ? AND status = 'approved'",
                [c.id]
            );

            c.collected_amount = rows[0].total || 0;
            c.spent_amount = expenseRows[0].total || 0;
            c.balance = c.collected_amount - c.spent_amount;

            const contributionUnitCount = await exports.internalCalculateContributionUnit(
                c.clan_id,
                c.contribution_unit_definition
            );

            // Use manual goal if set, otherwise use calculated target
            c.final_target = (c.target_goal && c.target_goal > 0) ? c.target_goal : (contributionUnitCount * c.amount_per_member);
            c.target_amount = c.final_target;
        }

        res.json({ success: true, campaigns });
    } catch (error) {
        console.error('getCampaigns error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

exports.getFundOverview = async (req, res) => {
    try {
        let clanId = req.query.clan_id;
        if (!clanId && req.user) clanId = await getUserClanId(req.user.id);
        if (!clanId) return res.status(400).json({ success: false, message: 'Clan ID is required' });

        const [incomeResult] = await db.query(
            "SELECT SUM(amount) as total_income FROM event_contributions WHERE clan_id = ? AND status = 'approved'",
            [clanId]
        );

        const [expenseResult] = await db.query(
            "SELECT SUM(amount) as total_expense FROM event_costs WHERE clan_id = ? AND status = 'approved'",
            [clanId]
        );

        const totalIncome = Number(incomeResult[0].total_income) || 0;
        const totalExpense = Number(expenseResult[0].total_expense) || 0;

        res.json({
            success: true,
            overview: {
                total_income: totalIncome,
                total_expense: totalExpense,
                balance: totalIncome - totalExpense
            }
        });
    } catch (error) {
        console.error('getFundOverview error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

exports.getTransactions = async (req, res) => {
    try {
        let clanId = req.query.clan_id;
        if (!clanId && req.user) clanId = await getUserClanId(req.user.id);
        if (!clanId) return res.status(400).json({ success: false, message: 'Clan ID is required' });

        const [userRows] = await db.query('SELECT person_id FROM accounts WHERE id = ?', [req.user.id]);
        const currentUserPersonId = userRows[0]?.person_id;
        const isManager = ['admin', 'manager'].includes(req.user.role_name);
        const { show_all } = req.query;

        let incomeQuery = `
            SELECT 
                ec.id, ec.amount, ec.contribution_date as date, ec.note, ec.method,
                'income' as type, ec.status, p.display_name as person_name, fc.name as campaign_name
            FROM event_contributions ec
            LEFT JOIN people p ON ec.person_id = p.id
            LEFT JOIN fund_campaigns fc ON ec.campaign_id = fc.id
            WHERE ec.clan_id = ?
        `;
        let incomeParams = [clanId];

        if (!isManager) {
            incomeQuery += " AND (ec.status = 'approved' OR ec.person_id = ?)";
            incomeParams.push(currentUserPersonId);
        }

        const [income] = await db.query(incomeQuery, incomeParams);

        await ensureEventCostRecipientColumns();

        let expenseQuery = `
            SELECT 
                ex.id, ex.amount, ex.created_at as date, ex.item_name as note, ex.method,
                'expense' as type, ex.status, rp.display_name as person_name, fc.name as campaign_name,
                ex.recipient_note, ex.paid_to_manager
            FROM event_costs ex
            LEFT JOIN fund_campaigns fc ON ex.campaign_id = fc.id
            LEFT JOIN people rp ON ex.recipient_person_id = rp.id
            WHERE ex.clan_id = ?
        `;
        let expenseParams = [clanId];

        if (!isManager) {
            expenseQuery += " AND ex.status = 'approved'";
        }

        const [expenses] = await db.query(expenseQuery, expenseParams);

        const transactions = [...income, ...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ success: true, transactions });
    } catch (error) {
        console.error('getTransactions error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

exports.addIncome = async (req, res) => {
    try {
        const {
            amount,
            date,
            note,
            method,
            person_id,
            event_id,
            campaign_id
        } = req.body;

        const clanId = await getUserClanId(req.user.id);

        if (!clanId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        let finalPersonId = person_id;
        if (!finalPersonId && req.user) {
            const [userRows] = await db.query('SELECT person_id FROM accounts WHERE id = ?', [req.user.id]);
            finalPersonId = userRows[0]?.person_id;
        }

        // Nếu là member nộp, để status là pending
        let finalStatus = 'approved';
        if (req.user && req.user.role_id === 3) {
            finalStatus = 'pending';
        }

        const [result] = await db.query(
            `INSERT INTO event_contributions 
                (clan_id, event_id, campaign_id, person_id, amount, contribution_date, method, note, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                clanId,
                event_id || null,
                campaign_id || null,
                finalPersonId || null,
                amount,
                date || new Date(),
                method || 'Tiền mặt',
                note,
                finalStatus
            ]
        );

        res.json({
            success: true,
            message: 'Đã thêm khoản thu',
            id: result.insertId
        });
    } catch (error) {
        console.error('addIncome error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

exports.addExpense = async (req, res) => {
    try {
        const {
            amount,
            note,
            event_id,
            campaign_id,
            category,
            recipient_person_id,
            recipient_note,
            paid_to_manager,
            date
        } = req.body;

        const clanId = await getUserClanId(req.user.id);

        if (!clanId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        await ensureEventCostRecipientColumns();

        const [result] = await db.query(
            `INSERT INTO event_costs 
                (
                    clan_id,
                    event_id,
                    campaign_id,
                    recipient_person_id,
                    item_name,
                    amount,
                    note,
                    recipient_note,
                    paid_to_manager,
                    created_at,
                    category,
                    status,
                    method
                ) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                clanId,
                event_id || null,
                campaign_id || null,
                recipient_person_id || null,
                note,
                amount,
                note,
                recipient_note || null,
                paid_to_manager ? 1 : 0,
                date || new Date(),
                category || 'Khác',
                req.body.status || 'approved',
                req.body.method || 'Tiền mặt'
            ]
        );

        res.json({
            success: true,
            message: 'Đã thêm khoản chi',
            id: result.insertId
        });
    } catch (error) {
        console.error('addExpense error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

exports.createCampaign = async (req, res) => {
    try {
        const {
            name,
            description,
            target_goal,
            year,
            amount_per_member,
            deadline,
            contribution_unit_definition,
            bank_name,
            bank_account,
            bank_owner,
            qr_code_media_id
        } = req.body;

        const clanId = await getUserClanId(req.user.id);

        if (!clanId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        const [result] = await db.query(
            `INSERT INTO fund_campaigns 
                (
                    clan_id,
                    name,
                    description,
                    target_goal,
                    year,
                    amount_per_member,
                    deadline,
                    contribution_unit_definition,
                    bank_name,
                    bank_account,
                    bank_owner,
                    qr_code_media_id,
                    status
                ) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
            [
                clanId,
                name,
                description,
                target_goal || 0,
                year,
                amount_per_member,
                deadline,
                contribution_unit_definition,
                bank_name,
                bank_account,
                bank_owner,
                qr_code_media_id || null
            ]
        );

        const [members] = await db.query(
            "SELECT a.id FROM accounts a JOIN people p ON a.person_id = p.id WHERE p.clan_id = ?",
            [clanId]
        );

        const io = req.app.locals.io;
        const onlineUsers = req.app.locals.onlineUsers;

        for (const m of members) {
            const title = 'Đợt thu mới';
            const message = `Mở đợt thu: ${name}`;

            const [notificationResult] = await db.query(
                "INSERT INTO notifications (receiver_account_id, type, title, message, link_url) VALUES (?, ?, ?, ?, ?)",
                [
                    m.id,
                    'new_campaign',
                    title,
                    message,
                    '/manager/fund'
                ]
            );

            if (io) {
                io.to(`account_${m.id}`).emit('new_notification', {
                    id: notificationResult.insertId,
                    type: 'new_campaign',
                    title,
                    message,
                    link_url: '/manager/fund',
                    is_read: 0,
                    created_at: new Date().toISOString(),
                });

                console.log(`✅ Đã gửi realtime campaign notification tới account_${m.id}`);
            }
        }
        res.json({
            success: true,
            campaignId: result.insertId
        });
    } catch (error) {
        console.error('createCampaign error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

exports.updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            status,
            amount_per_member,
            name,
            deadline
        } = req.body;

        const clanId = await getUserClanId(req.user.id);

        if (!clanId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        await db.query(
            `UPDATE fund_campaigns 
             SET status = COALESCE(?, status), 
                 amount_per_member = COALESCE(?, amount_per_member),
                 name = COALESCE(?, name),
                 deadline = COALESCE(?, deadline)
             WHERE id = ? AND clan_id = ?`,
            [
                status,
                amount_per_member,
                name,
                deadline,
                id,
                clanId
            ]
        );

        res.json({
            success: true,
            message: 'Đã cập nhật đợt thu'
        });
    } catch (error) {
        console.error('updateCampaign error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

exports.getCampaignDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const [campaignRows] = await db.query(
            'SELECT * FROM fund_campaigns WHERE id = ?',
            [id]
        );

        if (!campaignRows.length) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        const campaign = campaignRows[0];

        const [transactions] = await db.query(`
            SELECT 
                ec.*,
                p.display_name as person_name,
                m.id as media_id
            FROM event_contributions ec
            JOIN people p ON ec.person_id = p.id
            LEFT JOIN media_files m ON ec.evidence_media_id = m.id
            WHERE ec.campaign_id = ?
            ORDER BY ec.created_at DESC
        `, [id]);

        const contributionUnitCount = await exports.internalCalculateContributionUnit(
            campaign.clan_id,
            campaign.contribution_unit_definition
        );

        const [collectedRows] = await db.query(
            "SELECT SUM(amount) as total, COUNT(DISTINCT person_id) as paid_count FROM event_contributions WHERE campaign_id = ? AND status = 'approved'",
            [id]
        );

        const targetAmount = contributionUnitCount * campaign.amount_per_member;
        const collectedAmount = collectedRows[0].total || 0;
        const paidCount = collectedRows[0].paid_count || 0;

        res.json({
            success: true,
            campaign,
            transactions,
            stats: {
                contribution_unit_count: contributionUnitCount,
                paid_count: paidCount,
                target_amount: targetAmount,
                collected_amount: collectedAmount,
                completion_rate: targetAmount > 0 ? (collectedAmount / targetAmount) * 100 : 0,
                participation_rate: contributionUnitCount > 0 ? (paidCount / contributionUnitCount) * 100 : 0
            }
        });
    } catch (error) {
        console.error('getCampaignDetails error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// --- PAYMENT REPORTING (MEMBER) ---

exports.reportPayment = async (req, res) => {
    try {
        const {
            campaign_id,
            amount,
            note,
            method,
            evidence_media_id
        } = req.body;

        const [userRows] = await db.query(
            'SELECT person_id FROM accounts WHERE id = ?',
            [req.user.id]
        );

        const personId = userRows[0]?.person_id;

        if (!personId) {
            return res.status(400).json({
                success: false,
                message: 'User not linked to person'
            });
        }

        const [personRows] = await db.query(
            'SELECT clan_id, display_name FROM people WHERE id = ?',
            [personId]
        );

        const { clan_id, display_name } = personRows[0];

        await db.query(
            `INSERT INTO event_contributions 
                (
                    clan_id,
                    campaign_id,
                    person_id,
                    amount,
                    contribution_date,
                    method,
                    note,
                    status,
                    evidence_media_id
                ) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [
                clan_id,
                campaign_id,
                personId,
                amount,
                new Date(),
                method || 'Chuyển khoản',
                note,
                evidence_media_id || null
            ]
        );

        const [managers] = await db.query(
            "SELECT a.id FROM accounts a JOIN people p ON a.person_id = p.id WHERE p.clan_id = ? AND a.role_id = 2",
            [clan_id]
        );

        const io = req.app.locals.io;

        for (const m of managers) {
            const title = 'Báo cáo nộp quỹ';
            const message = `${display_name} vừa nộp quỹ.`;

            const [notificationResult] = await db.query(
                "INSERT INTO notifications (receiver_account_id, type, title, message) VALUES (?, ?, ?, ?)",
                [
                    m.id,
                    'payment_report',
                    title,
                    message
                ]
            );

            if (io) {
                io.to(`account_${m.id}`).emit('new_notification', {
                    id: notificationResult.insertId,
                    type: 'payment_report',
                    title,
                    message,
                    link_url: '/manager/fund',
                    is_read: 0,
                    created_at: new Date().toISOString(),
                });

                console.log(`✅ Đã gửi realtime payment report notification tới account_${m.id}`);
            }
        }

        res.json({
            success: true,
            message: 'Đã gửi báo cáo thanh toán.'
        });
    } catch (error) {
        console.error('reportPayment error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

exports.approvePayment = async (req, res) => {
    try {
        const {
            transaction_id,
            status,
            manager_note
        } = req.body;

        const clanId = await getUserClanId(req.user.id);

        if (!clanId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        await db.query(
            'UPDATE event_contributions SET status = ?, manager_note = ? WHERE id = ? AND clan_id = ?',
            [
                status,
                manager_note,
                transaction_id,
                clanId
            ]
        );

        res.json({
            success: true
        });
    } catch (error) {
        console.error('approvePayment error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// --- ADVANCED ANALYTICS ---

exports.getFundStats = async (req, res) => {
    try {
        let clanId = req.query.clan_id;

        if (!clanId && req.user) {
            clanId = await getUserClanId(req.user.id);
        }

        if (!clanId) {
            return res.status(400).json({
                success: false,
                message: 'Clan ID is required'
            });
        }

        const [incomeByYear] = await db.query(
            "SELECT YEAR(contribution_date) as year, SUM(amount) as total FROM event_contributions WHERE clan_id = ? AND status = 'approved' GROUP BY year ORDER BY year ASC",
            [clanId]
        );

        const [expenseByYear] = await db.query(
            "SELECT YEAR(created_at) as year, SUM(amount) as total FROM event_costs WHERE clan_id = ? AND status = 'approved' GROUP BY year ORDER BY year ASC",
            [clanId]
        );

        const curYear = new Date().getFullYear();
        const prevYear = curYear - 1;

        const [categoryStats] = await db.query(`
            SELECT 
                category,
                YEAR(created_at) as year,
                SUM(amount) as total
            FROM event_costs
            WHERE clan_id = ? AND status = 'approved' AND YEAR(created_at) IN (?, ?)
            GROUP BY category, year
        `, [clanId, curYear, prevYear]);

        const [campaignStats] = await db.query(`
            SELECT 
                id,
                name,
                year,
                amount_per_member,
                contribution_unit_definition
            FROM fund_campaigns
            WHERE clan_id = ? AND year = ?
        `, [clanId, curYear]);

        for (let c of campaignStats) {
            const contributionUnitCount = await exports.internalCalculateContributionUnit(
                clanId,
                c.contribution_unit_definition
            );

            const [rows] = await db.query(
                "SELECT SUM(amount) as total FROM event_contributions WHERE campaign_id = ? AND status = 'approved'",
                [c.id]
            );

            c.contribution_unit_count = contributionUnitCount;
            c.collected = rows[0].total || 0;
            c.target = contributionUnitCount * c.amount_per_member;
            c.completion = c.target > 0 ? (c.collected / c.target) * 100 : 0;
        }

        res.json({
            success: true,
            yearly: {
                income: incomeByYear,
                expense: expenseByYear
            },
            categories: categoryStats,
            campaigns: campaignStats
        });
    } catch (error) {
        console.error('getFundStats error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// --- EXCEL EXPORT/IMPORT ---

exports.exportFundExcel = async (req, res) => {
    try {
        const { campaign_id, year } = req.query;
        const clanId = await getUserClanId(req.user.id);

        await ensureEventCostRecipientColumns();

        let incomeQuery = `
            SELECT 
                ec.contribution_date,
                p.display_name,
                ec.amount,
                ec.method,
                ec.note,
                fc.name as campaign
            FROM event_contributions ec
            LEFT JOIN people p ON ec.person_id = p.id
            LEFT JOIN fund_campaigns fc ON ec.campaign_id = fc.id
            WHERE ec.clan_id = ?
        `;

        let expenseQuery = `
            SELECT 
                ex.created_at,
                ex.item_name,
                ex.amount,
                ex.category,
                ex.note,
                ex.recipient_note,
                rp.display_name as recipient_name,
                ex.paid_to_manager
            FROM event_costs ex
            LEFT JOIN people rp ON ex.recipient_person_id = rp.id
            WHERE ex.clan_id = ? AND ex.status = 'approved'
        `;

        let params = [clanId];

        if (campaign_id) {
            incomeQuery += " AND ec.campaign_id = ?";
            expenseQuery += " AND ex.campaign_id = ?";
            params.push(campaign_id);
        } else if (year) {
            incomeQuery += " AND YEAR(ec.contribution_date) = ?";
            expenseQuery += " AND YEAR(ex.created_at) = ?";
            params.push(year);
        }

        const [income] = await db.query(incomeQuery, params);
        const [expense] = await db.query(expenseQuery, params);

        const wb = XLSX.utils.book_new();

        const wsIncome = XLSX.utils.json_to_sheet(income);
        const wsExpense = XLSX.utils.json_to_sheet(expense);

        XLSX.utils.book_append_sheet(wb, wsIncome, "Thu Quỹ");
        XLSX.utils.book_append_sheet(wb, wsExpense, "Chi Quỹ");

        const buf = XLSX.write(wb, {
            type: 'buffer',
            bookType: 'xlsx'
        });

        const filename = campaign_id
            ? `Bao_Cao_Chien_Dich_${campaign_id}.xlsx`
            : `Bao_Cao_Nam_${year || 'Tat_Ca'}.xlsx`;

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (error) {
        console.error('Excel export error:', error);
        res.status(500).json({
            success: false,
            message: 'Excel export failed'
        });
    }
};

exports.importFundExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const clanId = await getUserClanId(req.user.id);

        const workbook = XLSX.read(req.file.buffer, {
            type: 'buffer'
        });

        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        for (let row of data) {
            const {
                amount,
                note,
                type,
                date,
                category
            } = row;

            if (type === 'income') {
                await db.query(
                    "INSERT INTO event_contributions (clan_id, amount, contribution_date, note, status, method) VALUES (?, ?, ?, ?, 'approved', 'Excel')",
                    [
                        clanId,
                        amount,
                        date || new Date(),
                        note
                    ]
                );
            } else if (type === 'expense') {
                await db.query(
                    "INSERT INTO event_costs (clan_id, amount, created_at, item_name, category) VALUES (?, ?, ?, ?, ?)",
                    [
                        clanId,
                        amount,
                        date || new Date(),
                        note,
                        category || 'Khác'
                    ]
                );
            }
        }

        res.json({
            success: true,
            message: `Đã nhập thành công ${data.length} dòng dữ liệu`
        });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({
            success: false,
            message: 'Import failed'
        });
    }
};

exports.internalCalculateContributionUnit = async (clanId, definition) => {
    let q = '';

    if (definition === 'males_only') {
        q = "SELECT COUNT(*) as count FROM people WHERE clan_id = ? AND gender = 'male' AND is_living = 1";
    } else if (definition === 'adults_all') {
        q = "SELECT COUNT(*) as count FROM people WHERE clan_id = ? AND TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) >= 18 AND is_living = 1";
    } else if (definition === 'per_family') {
        q = "SELECT COUNT(*) as count FROM families WHERE clan_id = ?";
    } else {
        return 0;
    }

    const [rows] = await db.query(q, [clanId]);

    return rows[0].count;
};