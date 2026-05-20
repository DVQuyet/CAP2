const {
    createNotification,
    db,
    parseOptionalPositiveInt,
} = require('./common.service');
const {
    computeManagerEventStatusSql,
    ensureManagerEventScheduleColumns,
    normalizeManagerEventDates,
    enqueueClanAboutManagerEventNotification,
} = require('./event.service');
const {
    getManagerClanId,
} = require('./managerClan.service');
const {
    emitNotificationToAccount,
    ensureTaskTables,
    sendTaskAssignmentEmail,
} = require('./task.service');

const getManagerEvents = async(req, res) => {
    try {
        await ensureTaskTables();
        await ensureManagerEventScheduleColumns();
        let sql = `
            SELECT
                e.id,
                e.clan_id,
                e.title,
                e.event_date,
                COALESCE(e.start_date, e.event_date) AS start_date,
                COALESCE(e.end_date, e.start_date, e.event_date) AS end_date,
                ${computeManagerEventStatusSql} AS status,
                e.description,
                c.clan_name,
                COUNT(DISTINCT mt.id) AS task_count,
                COUNT(mta.id) AS assignment_count,
                SUM(CASE WHEN mta.status = 'completed' THEN 1 ELSE 0 END) AS completed_assignment_count
            FROM events e
            LEFT JOIN clans c ON c.id = e.clan_id
            LEFT JOIN manager_tasks mt ON mt.event_id = e.id
            LEFT JOIN manager_task_assignments mta ON mta.task_id = mt.id
            WHERE 1=1
        `;
        const params = [];
        if (req.user.role_id === 2) {
            const clanId = await getManagerClanId(req.user.id);
            if (clanId == null) return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
            sql += ' AND e.clan_id = ?';
            params.push(clanId);
        } else {
            const clanId = parseOptionalPositiveInt(req.query.clan_id);
            if (clanId != null) {
                sql += ' AND e.clan_id = ?';
                params.push(clanId);
            }
        }
        sql += `
            GROUP BY e.id, e.clan_id, e.title, e.event_date, e.start_date, e.end_date, e.description, c.clan_name
            ORDER BY COALESCE(e.start_date, e.event_date) DESC, e.id DESC
        `;
        const [rows] = await db.query(sql, params);
        return res.json({ success: true, events: rows });
    } catch (error) {
        console.error('getManagerEvents error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi lấy danh sách sự kiện' });
    }
};

const createManagerEvent = async(req, res) => {
    try {
        await ensureTaskTables();
        await ensureManagerEventScheduleColumns();
        const title = String(req.body.title || '').trim();
        const description = req.body.description == null ? null : String(req.body.description).trim();
        const { startDate, endDate, eventDate } = normalizeManagerEventDates(req.body);
        if (!title) return res.status(400).json({ success: false, message: 'Tên sự kiện không được để trống' });
        if (!startDate) return res.status(400).json({ success: false, message: 'Vui lòng nhập ngày bắt đầu sự kiện' });
        if (endDate && endDate < startDate) return res.status(400).json({ success: false, message: 'Ngày kết thúc không được nhỏ hơn ngày bắt đầu' });

        let clanId = null;
        if (req.user.role_id === 2) {
            clanId = await getManagerClanId(req.user.id);
            if (clanId == null) return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
        } else {
            clanId = parseOptionalPositiveInt(req.body.clan_id);
            if (clanId == null) return res.status(400).json({ success: false, message: 'Vui lòng chọn dòng họ cho sự kiện' });
        }

        const [result] = await db.query(
            `
            INSERT INTO events (clan_id, title, event_date, start_date, end_date, status, description)
            VALUES (?, ?, ?, ?, ?, 'upcoming', ?)
            `,
            [clanId, title, eventDate || startDate, startDate, endDate || startDate, description || null]
        );

        const notificationResult = enqueueClanAboutManagerEventNotification(req, {
            clanId,
            eventId: result.insertId,
            title,
            description,
            startDate,
            endDate: endDate || startDate,
        });

        return res.json({
            success: true,
            message: 'Đã tạo sự kiện. Hệ thống đang gửi thông báo và email cho thành viên dòng họ trong nền.',
            event_id: result.insertId,
            notifications: notificationResult,
        });
    } catch (error) {
        console.error('createManagerEvent error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi tạo sự kiện' });
    }
};

const updateManagerEvent = async (req, res) => {
    try {
        await ensureTaskTables();
        await ensureManagerEventScheduleColumns();
        const eventId = parseOptionalPositiveInt(req.params.id);
        const title = String(req.body.title || '').trim();
        const description = req.body.description == null ? null : String(req.body.description).trim();
        const { startDate, endDate, eventDate } = normalizeManagerEventDates(req.body);
        if (!eventId) return res.status(400).json({ success: false, message: 'ID sự kiện không hợp lệ' });
        if (!title) return res.status(400).json({ success: false, message: 'Tên sự kiện không được để trống' });
        if (!startDate) return res.status(400).json({ success: false, message: 'Vui lòng nhập ngày bắt đầu sự kiện' });
        if (endDate && endDate < startDate) return res.status(400).json({ success: false, message: 'Ngày kết thúc không được nhỏ hơn ngày bắt đầu' });

        let sql = `
            UPDATE events
            SET title = ?,
                event_date = ?,
                start_date = ?,
                end_date = ?,
                status = CASE
                    WHEN ? < CURDATE() THEN 'ended'
                    WHEN ? <= CURDATE() AND ? >= CURDATE() THEN 'ongoing'
                    ELSE 'upcoming'
                END,
                description = ?
            WHERE id = ?
        `;
        const finalEndDate = endDate || startDate;
        const params = [
            title,
            eventDate || startDate,
            startDate,
            finalEndDate,
            finalEndDate,
            startDate,
            finalEndDate,
            description || null,
            eventId,
        ];

        if (req.user.role_id === 2) {
            const clanId = await getManagerClanId(req.user.id);
            if (clanId == null) return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
            sql += ' AND clan_id = ?';
            params.push(clanId);
        } else {
            const clanId = parseOptionalPositiveInt(req.body.clan_id || req.query.clan_id);
            if (clanId != null) {
                sql += ' AND clan_id = ?';
                params.push(clanId);
            }
        }

        const [result] = await db.query(sql, params);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Không tìm thấy sự kiện trong phạm vi quản lý' });
        return res.json({ success: true, message: 'Đã cập nhật sự kiện' });
    } catch (error) {
        console.error('updateManagerEvent error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật sự kiện' });
    }
};

const deleteManagerEvent = async (req, res) => {
    const conn = await db.getConnection();
    try {
        await ensureTaskTables();
        await ensureManagerEventScheduleColumns();
        const eventId = parseOptionalPositiveInt(req.params.id);
        if (!eventId) return res.status(400).json({ success: false, message: 'ID sự kiện không hợp lệ' });

        let clanFilter = null;
        if (req.user.role_id === 2) {
            clanFilter = await getManagerClanId(req.user.id);
            if (clanFilter == null) return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
        } else {
            clanFilter = parseOptionalPositiveInt(req.query.clan_id || req.body?.clan_id);
        }

        const [events] = await conn.query(
            clanFilter != null ? 'SELECT id FROM events WHERE id = ? AND clan_id = ? LIMIT 1' : 'SELECT id FROM events WHERE id = ? LIMIT 1',
            clanFilter != null ? [eventId, clanFilter] : [eventId]
        );
        if (!events.length) return res.status(404).json({ success: false, message: 'Không tìm thấy sự kiện trong phạm vi quản lý' });

        await conn.beginTransaction();
        await conn.query('UPDATE manager_tasks SET event_id = NULL WHERE event_id = ?', [eventId]);
        await conn.query('DELETE FROM events WHERE id = ?', [eventId]);
        await conn.commit();
        return res.json({ success: true, message: 'Đã xóa sự kiện' });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        console.error('deleteManagerEvent error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi xóa sự kiện' });
    } finally {
        conn.release();
    }
};

const createTaskForEvent = async(req, res) => {
    req.body.event_id = req.params.eventId;
    return assignTask(req, res);
};

const assignTask = async(req, res) => {
    const connection = await db.getConnection();

    try {
        const managerAccountId = req.user?.account_id || req.user?.id;
        const managerRole = String(req.user?.role || '').toLowerCase();

        if (!managerAccountId) {
            return res.status(401).json({
                success: false,
                message: 'Bạn cần đăng nhập để giao việc',
            });
        }

        if (!['admin', 'manager'].includes(managerRole)) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền giao việc',
            });
        }

        const {
            event_id,
            title,
            description,
            due_date,
            member_account_ids,
        } = req.body || {};

        const trimmedTitle = String(title || '').trim();
        const trimmedDescription = String(description || '').trim();

        if (!trimmedTitle) {
            return res.status(400).json({
                success: false,
                message: 'Tiêu đề công việc là bắt buộc',
            });
        }

        const rawAssigneeIds = Array.isArray(member_account_ids)
            ? member_account_ids
            : Array.isArray(req.body.member_ids)
                ? req.body.member_ids
                : Array.isArray(req.body.assigned_member_ids)
                    ? req.body.assigned_member_ids
                    : [];

        const assigneeIds = [
            ...new Set(
                rawAssigneeIds
                    .map((id) => Number(id))
                    .filter((id) => Number.isFinite(id) && id > 0)
            ),
        ];

        if (!assigneeIds.length) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng chọn ít nhất một thành viên được phân công',
            });
        }

        const normalizedEventId = event_id ? Number(event_id) : null;

        if (event_id && !Number.isFinite(normalizedEventId)) {
            return res.status(400).json({
                success: false,
                message: 'event_id không hợp lệ',
            });
        }

        await connection.beginTransaction();

        let eventRow = null;
        let clanId = req.user?.clan_id || null;

        if (normalizedEventId) {
            const [eventRows] = await connection.query(
                `
                SELECT id, title, clan_id
                FROM events
                WHERE id = ?
                LIMIT 1
                `,
                [normalizedEventId]
            );

            eventRow = eventRows[0] || null;

            if (!eventRow) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy sự kiện',
                });
            }

            clanId = eventRow.clan_id || clanId;
        }

        if (!clanId) {
            const [managerRows] = await connection.query(
                `
                SELECT p.clan_id
                FROM accounts a
                LEFT JOIN people p ON p.id = a.person_id
                WHERE a.id = ?
                LIMIT 1
                `,
                [managerAccountId]
            );

            clanId = managerRows[0]?.clan_id || null;
        }

        if (!clanId) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Không xác định được dòng họ để giao việc',
            });
        }

        const [memberRows] = await connection.query(
            `
            SELECT 
                a.id AS account_id,
                a.email,
                a.status,
                a.person_id,
                p.display_name,
                p.surname,
                p.middle_name,
                p.first_name,
                p.clan_id,
                p.is_living,
                p.death_date
            FROM accounts a
            INNER JOIN people p ON p.id = a.person_id
            WHERE a.id IN (${assigneeIds.map(() => '?').join(',')})
              AND a.status = 'active'
              AND COALESCE(p.is_living, 1) = 1
              AND p.death_date IS NULL
            `,
            assigneeIds
        );

        if (memberRows.length !== assigneeIds.length) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Một hoặc nhiều tài khoản được phân công không tồn tại, chưa active hoặc đã mất',
            });
        }

        const invalidMember = memberRows.find((member) => member.clan_id && member.clan_id !== clanId);

        if (invalidMember) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'Không thể giao việc cho thành viên ngoài dòng họ',
            });
        }

        const [taskResult] = await connection.query(
            `
            INSERT INTO manager_tasks
                (manager_account_id, clan_id, title, description, due_date, event_id)
            VALUES
                (?, ?, ?, ?, ?, ?)
            `,
            [
                managerAccountId,
                clanId,
                trimmedTitle,
                trimmedDescription || null,
                due_date || null,
                normalizedEventId,
            ]
        );

        const taskId = taskResult.insertId;

        for (const member of memberRows) {
            await connection.query(
                `
                INSERT INTO manager_task_assignments
                    (task_id, member_account_id, member_person_id)
                VALUES
                    (?, ?, ?)
                `,
                [taskId, member.account_id, member.person_id || null]
            );

            await createNotification({
                accountId: member.account_id,
                type: 'task_assigned',
                title: 'Bạn có công việc mới',
                message: `Bạn được phân công công việc: ${trimmedTitle}`,
                data: {
                    task_id: taskId,
                    event_id: normalizedEventId,
                    link_url: `/user/tasks?taskId=${taskId}`,
                },
                connection,
            });
        }

        await connection.commit();

        const io = req.app?.locals?.io;

       if (io) {
                for (const member of memberRows) {
                    const notificationPayload = {
                        id: `task-assigned-${taskId}-${member.account_id}`,
                        type: 'task_assigned',
                        title: 'Bạn có công việc mới',
                        message: `Bạn được phân công công việc: ${trimmedTitle}`,
                        link_url: `/user/tasks?taskId=${taskId}`,
                        is_read: 0,
                        created_at: new Date().toISOString(),
                        task_id: taskId,
                        event_id: normalizedEventId,
                    };

                    io.to(`account_${member.account_id}`).emit('new_notification', notificationPayload);

                    io.to(`account_${member.account_id}`).emit('task_assigned', {
                        task_id: taskId,
                        event_id: normalizedEventId,
                        title: trimmedTitle,
                        description: trimmedDescription,
                        due_date: due_date || null,
                        status: 'assigned',
                        assigned_at: new Date().toISOString(),
                    });

                    console.log(`✅ Đã emit new_notification + task_assigned tới account_${member.account_id}`);
                }
            } else {
                console.log('⚠️ Không tìm thấy req.app.locals.io trong assignTask');
            }
        const emailSummary = {
            sent: 0,
            skipped: 0,
            failed: 0,
        };

        for (const member of memberRows) {
            try {
                const mailResult = await sendTaskAssignmentEmail({
                    member,
                    title: trimmedTitle,
                    description: trimmedDescription,
                    dueDate: due_date,
                    eventTitle: eventRow?.title || null,
                    taskId,
                });

                if (mailResult.sent) {
                    emailSummary.sent += 1;
                } else if (mailResult.skipped) {
                    emailSummary.skipped += 1;
                }
            } catch (mailError) {
                emailSummary.failed += 1;
                console.error('sendTaskAssignmentEmail error:', {
                    taskId,
                    accountId: member.account_id,
                    error: mailError.message,
                });
            }
        }

        return res.status(201).json({
            success: true,
            message: 'Đã giao việc thành công',
            task_id: taskId,
            assigned_count: memberRows.length,
            email: emailSummary,
        });
    } catch (error) {
        try {
            await connection.rollback();
        } catch (_) {}

        console.error('assignTask error:', error);

        return res.status(error.status || 500).json({
            success: false,
            message: 'Không thể giao việc',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    } finally {
        connection.release();
    }
};

const bulkAssignTasks = async(req, res) => {
    const connection = await db.getConnection();

    try {
        await ensureTaskTables();

        const managerAccountId = req.user?.id || req.user?.account_id;
        const roleId = Number(req.user?.role_id);

        if (!managerAccountId) {
            return res.status(401).json({
                success: false,
                message: 'Bạn cần đăng nhập để giao việc',
            });
        }

        if (![1, 2].includes(roleId)) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền giao việc',
            });
        }

        const body = req.body || {};
        const eventId = parseOptionalPositiveInt(body.event_id ?? body.eventId);
        const tasks = Array.isArray(body.tasks) ? body.tasks : [];

        if (!tasks.length) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách công việc không được để trống',
            });
        }

        if (tasks.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Không được giao quá 50 công việc trong một lần',
            });
        }

        const normalizedTasks = tasks.map((task, index) => {
            const title = String(task?.title || '').trim();
            const description = task?.description == null ? '' : String(task.description).trim();
            const dueDate = task?.due_date || task?.dueDate || null;

            const memberAccountIds = Array.isArray(task?.member_account_ids)
                ? task.member_account_ids
                : Array.isArray(task?.member_ids)
                    ? task.member_ids
                    : [];

            const assigneeIds = [
                ...new Set(
                    memberAccountIds
                        .map((id) => Number(id))
                        .filter((id) => Number.isFinite(id) && id > 0)
                ),
            ];

            return {
                index,
                title,
                description,
                dueDate,
                assigneeIds,
            };
        });

        const invalidTitleTask = normalizedTasks.find((task) => !task.title);
        if (invalidTitleTask) {
            return res.status(400).json({
                success: false,
                message: `Công việc thứ ${invalidTitleTask.index + 1} thiếu tiêu đề`,
            });
        }

        const invalidAssigneeTask = normalizedTasks.find((task) => !task.assigneeIds.length);
        if (invalidAssigneeTask) {
            return res.status(400).json({
                success: false,
                message: `Công việc "${invalidAssigneeTask.title}" chưa chọn người được giao`,
            });
        }

        let eventRow = null;
        let clanId = null;

        if (eventId) {
            const [eventRows] = await connection.query(
                `
                SELECT id, clan_id, title, event_date, description
                FROM events
                WHERE id = ?
                LIMIT 1
                `,
                [eventId]
            );

            eventRow = eventRows[0] || null;

            if (!eventRow) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy sự kiện',
                });
            }

            clanId = eventRow.clan_id || null;
        }

        if (roleId === 2) {
            const managerClanId = await getManagerClanId(managerAccountId);

            if (managerClanId == null) {
                return res.status(404).json({
                    success: false,
                    message: 'Không xác định được dòng họ của manager',
                });
            }

            if (clanId != null && Number(clanId) !== Number(managerClanId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Manager chỉ được giao việc trong sự kiện thuộc dòng họ của mình',
                });
            }

            clanId = managerClanId;
        }

        if (!clanId) {
            const requestedClanId = parseOptionalPositiveInt(body.clan_id);

            if (requestedClanId) {
                clanId = requestedClanId;
            }
        }

        if (!clanId) {
            const [managerRows] = await connection.query(
                `
                SELECT p.clan_id
                FROM accounts a
                LEFT JOIN people p ON p.id = a.person_id
                WHERE a.id = ?
                LIMIT 1
                `,
                [managerAccountId]
            );

            clanId = managerRows[0]?.clan_id || null;
        }

        if (!clanId) {
            return res.status(400).json({
                success: false,
                message: 'Không xác định được dòng họ để giao việc',
            });
        }

        const allAssigneeIds = [
            ...new Set(
                normalizedTasks.flatMap((task) => task.assigneeIds)
            ),
        ];

        const [memberRows] = await connection.query(
            `
            SELECT
                a.id AS account_id,
                a.email,
                a.status,
                a.person_id,
                p.display_name,
                p.surname,
                p.middle_name,
                p.first_name,
                p.clan_id,
                p.is_living,
                p.death_date
            FROM accounts a
            INNER JOIN people p ON p.id = a.person_id
            WHERE a.id IN (${allAssigneeIds.map(() => '?').join(',')})
              AND a.status = 'active'
              AND COALESCE(p.is_living, 1) = 1
              AND p.death_date IS NULL
            `,
            allAssigneeIds
        );

        if (memberRows.length !== allAssigneeIds.length) {
            return res.status(400).json({
                success: false,
                message: 'Một hoặc nhiều tài khoản được phân công không tồn tại, chưa active, chưa liên kết hồ sơ hoặc đã mất',
            });
        }

        const memberByAccountId = new Map(
            memberRows.map((member) => [Number(member.account_id), member])
        );

        const invalidClanMember = memberRows.find(
            (member) => Number(member.clan_id) !== Number(clanId)
        );

        if (invalidClanMember) {
            return res.status(403).json({
                success: false,
                message: 'Không thể giao việc cho thành viên ngoài dòng họ',
            });
        }

        await connection.beginTransaction();

        const createdTasks = [];
        const notificationJobs = [];

        for (const task of normalizedTasks) {
            const [taskResult] = await connection.query(
                `
                INSERT INTO manager_tasks
                    (manager_account_id, clan_id, title, description, due_date, event_id)
                VALUES
                    (?, ?, ?, ?, ?, ?)
                `,
                [
                    managerAccountId,
                    clanId,
                    task.title,
                    task.description || null,
                    task.dueDate || null,
                    eventId || null,
                ]
            );

            const taskId = taskResult.insertId;

            createdTasks.push({
                id: taskId,
                title: task.title,
                description: task.description,
                due_date: task.dueDate || null,
                event_id: eventId || null,
                assignee_ids: task.assigneeIds,
            });

            for (const accountId of task.assigneeIds) {
                const member = memberByAccountId.get(Number(accountId));

                await connection.query(
                    `
                    INSERT INTO manager_task_assignments
                        (task_id, member_account_id, member_person_id)
                    VALUES
                        (?, ?, ?)
                    `,
                    [taskId, member.account_id, member.person_id]
                );

                await createNotification({
                    accountId: member.account_id,
                    type: 'task_assigned',
                    title: 'Bạn có công việc mới',
                    message: `Bạn được phân công công việc: ${task.title}`,
                    data: {
                        task_id: taskId,
                        event_id: eventId || null,
                        link_url: `/user/tasks?taskId=${taskId}`,
                    },
                    connection,
                });

                notificationJobs.push({
                    member,
                    taskId,
                    title: task.title,
                    description: task.description,
                    dueDate: task.dueDate || null,
                });
            }
        }

const io = req.app?.locals?.io;

for (const job of notificationJobs) {
    await emitNotificationToAccount(req, job.member.account_id, {
        type: 'task_assigned',
        title: 'Bạn có công việc mới',
        message: `Bạn được phân công công việc: ${job.title}`,
        link_url: `/user/tasks?taskId=${job.taskId}`,
        is_read: 0,
        created_at: new Date().toISOString(),
        task_id: job.taskId,
        event_id: eventId || null,
    });

    if (io) {
        io.to(`account_${job.member.account_id}`).emit('task_assigned', {
            task_id: job.taskId,
            event_id: eventId || null,
            title: job.title,
            description: job.description,
            due_date: job.dueDate || null,
            status: 'assigned',
            assigned_at: new Date().toISOString(),
        });

        console.log(`✅ Đã emit bulk task_assigned tới account_${job.member.account_id}`);
    }
}

        const emailSummary = {
            sent: 0,
            skipped: 0,
            failed: 0,
        };

        for (const job of notificationJobs) {
            try {
                const mailResult = await sendTaskAssignmentEmail({
                    member: job.member,
                    title: job.title,
                    description: job.description,
                    dueDate: job.dueDate,
                    eventTitle: eventRow?.title || null,
                    taskId: job.taskId,
                });

                if (mailResult.sent) {
                    emailSummary.sent += 1;
                } else if (mailResult.skipped) {
                    emailSummary.skipped += 1;
                }
            } catch (mailError) {
                emailSummary.failed += 1;
                console.error('bulkAssignTasks email error:', {
                    taskId: job.taskId,
                    accountId: job.member.account_id,
                    error: mailError.message,
                });
            }
        }

        return res.status(201).json({
            success: true,
            message: 'Đã giao danh sách công việc thành công',
            event_id: eventId || null,
            created_count: createdTasks.length,
            assignment_count: notificationJobs.length,
            tasks: createdTasks,
            email: emailSummary,
        });
    } catch (error) {
        try {
            await connection.rollback();
        } catch (_) {}

        console.error('bulkAssignTasks error:', error);

        return res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Không thể giao danh sách công việc',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    } finally {
        connection.release();
    }
};

const getAssignedTasks = async (req, res) => {
    try {
        await ensureTaskTables();
        let sql = `
            SELECT
                a.id,
                a.task_id,
                t.title,
                t.description,
                t.due_date,
                t.created_at,
                t.clan_id,
                t.event_id,
                e.title AS event_title,
                e.event_date,
                e.description AS event_description,
                c.clan_name,
                a.status,
                a.assigned_at,
                a.completed_at,
                m.id AS manager_id,
                COALESCE(mp.display_name, m.email) AS manager_name,
                member.id AS member_id,
                a.member_account_id,
                member.display_name AS member_name,
                member.surname,
                member.first_name
            FROM manager_task_assignments a
            INNER JOIN manager_tasks t ON t.id = a.task_id
            LEFT JOIN events e ON e.id = t.event_id
            LEFT JOIN clans c ON c.id = t.clan_id
            INNER JOIN accounts m ON m.id = t.manager_account_id
            LEFT JOIN people mp ON mp.id = m.person_id
            INNER JOIN people member ON member.id = a.member_person_id
        `;
        const params = [];
        if (req.user.role_id === 2) {
            const clanId = await getManagerClanId(req.user.id);
            if (clanId == null) {
                return res.status(404).json({ success: false, message: "Không xác định được clan của manager" });
            }
            sql += " WHERE t.clan_id = ?";
            params.push(clanId);
        } else {
            sql += " WHERE 1=1";
            const clanId = Number(req.query.clan_id);
            if (Number.isFinite(clanId) && clanId > 0) {
                sql += " AND t.clan_id = ?";
                params.push(clanId);
            }
        }
        const eventId = Number(req.query.event_id || req.query.eventId);
        if (Number.isFinite(eventId) && eventId > 0) {
            sql += " AND t.event_id = ?";
            params.push(eventId);
        }
        sql += " ORDER BY COALESCE(e.event_date, t.created_at) DESC, t.created_at DESC, a.id DESC";
        const [results] = await db.query(sql, params);
        res.json(results);
    } catch (error) {
        console.error('getAssignedTasks error:', error);
        res.status(500).json({ success: false, message: "Lỗi lấy danh sách công việc" });
    }
};


const updateAssignedTask = async (req, res) => {
    const conn = await db.getConnection();
    try {
        await ensureTaskTables();
        const taskId = parseOptionalPositiveInt(req.params.id);
        if (!taskId) return res.status(400).json({ success: false, message: 'ID công việc không hợp lệ' });

        const title = String(req.body.title || '').trim();
        const description = req.body.description == null ? '' : String(req.body.description).trim();
        const dueDate = req.body.due_date == null || String(req.body.due_date).trim() === '' ? null : String(req.body.due_date).slice(0, 10);
        const clanIdFromBody = parseOptionalPositiveInt(req.body.clan_id || req.query.clan_id);

        if (!title) return res.status(400).json({ success: false, message: 'Tên công việc không được để trống' });

        let sql = `
            SELECT
                t.id,
                t.manager_account_id,
                t.clan_id,
                t.event_id,
                t.title AS old_title,
                e.title AS event_title
            FROM manager_tasks t
            LEFT JOIN events e ON e.id = t.event_id
            WHERE t.id = ?
        `;
        const params = [taskId];
        if (Number(req.user.role_id) === 2) {
            const managerClanId = await getManagerClanId(req.user.id);
            if (managerClanId == null) return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
            sql += ' AND t.clan_id = ?';
            params.push(managerClanId);
        } else if (clanIdFromBody != null) {
            sql += ' AND t.clan_id = ?';
            params.push(clanIdFromBody);
        }

        const [tasks] = await conn.query(sql, params);
        const task = tasks[0];
        if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc trong phạm vi quản lý' });

        const [assignees] = await conn.query(
            `
            SELECT a.member_account_id, a.member_person_id
            FROM manager_task_assignments a
            WHERE a.task_id = ?
            `,
            [taskId]
        );

        await conn.beginTransaction();
        await conn.query(
            `UPDATE manager_tasks SET title = ?, description = ?, due_date = ? WHERE id = ?`,
            [title, description || null, dueDate, taskId]
        );

        for (const assignee of assignees) {
            await createNotification({
                accountId: assignee.member_account_id,
                type: 'task_updated',
                title: 'Công việc được cập nhật',
                message: `Công việc "${title}" đã được chỉnh sửa.`,
                data: {
                    task_id: taskId,
                    event_id: task.event_id,
                    link_url: `/user/tasks?taskId=${taskId}`,
                },
                connection: conn,
            });
        }

        await conn.commit();

        const io = req.app?.locals?.io;
        if (io) {
            for (const assignee of assignees) {
                const payload = {
                    id: `task-updated-${taskId}-${assignee.member_account_id}-${Date.now()}`,
                    type: 'task_updated',
                    title: 'Công việc được cập nhật',
                    message: `Công việc "${title}" đã được chỉnh sửa.`,
                    link_url: `/user/tasks?taskId=${taskId}`,
                    is_read: 0,
                    created_at: new Date().toISOString(),
                    task_id: taskId,
                    event_id: task.event_id,
                };
                io.to(`account_${assignee.member_account_id}`).emit('new_notification', payload);
                io.to(`account_${assignee.member_account_id}`).emit('task_assigned', {
                    task_id: taskId,
                    event_id: task.event_id,
                    title,
                    description,
                    due_date: dueDate,
                    status: 'assigned',
                    action: 'updated',
                });
            }
        }

        return res.json({ success: true, message: 'Đã cập nhật công việc', notified_count: assignees.length });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        console.error('updateAssignedTask error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật công việc' });
    } finally {
        conn.release();
    }
};

const deleteAssignedTask = async (req, res) => {
    const conn = await db.getConnection();
    try {
        await ensureTaskTables();
        const taskId = parseOptionalPositiveInt(req.params.id);
        if (!taskId) return res.status(400).json({ success: false, message: 'ID công việc không hợp lệ' });

        const clanIdFromBody = parseOptionalPositiveInt(req.body?.clan_id || req.query.clan_id);
        let sql = `
            SELECT
                t.id,
                t.clan_id,
                t.event_id,
                t.title,
                e.title AS event_title
            FROM manager_tasks t
            LEFT JOIN events e ON e.id = t.event_id
            WHERE t.id = ?
        `;
        const params = [taskId];
        if (Number(req.user.role_id) === 2) {
            const managerClanId = await getManagerClanId(req.user.id);
            if (managerClanId == null) return res.status(404).json({ success: false, message: 'Không xác định được clan của manager' });
            sql += ' AND t.clan_id = ?';
            params.push(managerClanId);
        } else if (clanIdFromBody != null) {
            sql += ' AND t.clan_id = ?';
            params.push(clanIdFromBody);
        }

        const [tasks] = await conn.query(sql, params);
        const task = tasks[0];
        if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc trong phạm vi quản lý' });

        const [assignees] = await conn.query(
            `SELECT member_account_id, member_person_id FROM manager_task_assignments WHERE task_id = ?`,
            [taskId]
        );

        await conn.beginTransaction();
        for (const assignee of assignees) {
            await createNotification({
                accountId: assignee.member_account_id,
                type: 'task_deleted',
                title: 'Công việc đã bị xóa',
                message: `Công việc "${task.title}" đã được xóa khỏi danh sách được giao.`,
                data: {
                    task_id: taskId,
                    event_id: task.event_id,
                    link_url: '/user/tasks',
                },
                connection: conn,
            });
        }
        await conn.query('DELETE FROM manager_tasks WHERE id = ?', [taskId]);
        await conn.commit();

        const io = req.app?.locals?.io;
        if (io) {
            for (const assignee of assignees) {
                const payload = {
                    id: `task-deleted-${taskId}-${assignee.member_account_id}-${Date.now()}`,
                    type: 'task_deleted',
                    title: 'Công việc đã bị xóa',
                    message: `Công việc "${task.title}" đã được xóa khỏi danh sách được giao.`,
                    link_url: '/user/tasks',
                    is_read: 0,
                    created_at: new Date().toISOString(),
                    task_id: taskId,
                    event_id: task.event_id,
                };
                io.to(`account_${assignee.member_account_id}`).emit('new_notification', payload);
                io.to(`account_${assignee.member_account_id}`).emit('task_assigned', {
                    task_id: taskId,
                    event_id: task.event_id,
                    title: task.title,
                    action: 'deleted',
                });
            }
        }

        return res.json({ success: true, message: 'Đã xóa công việc', notified_count: assignees.length });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        console.error('deleteAssignedTask error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi xóa công việc' });
    } finally {
        conn.release();
    }
};

const completeTask = async (req, res) => {
    const assignmentId = parseInt(req.params.id);
    try {
        await ensureTaskTables();
        if (!Number.isFinite(assignmentId)) {
            return res.status(400).json({ success: false, message: "ID công việc không hợp lệ" });
        }
        let sql = `
            SELECT a.id
            FROM manager_task_assignments a
            INNER JOIN manager_tasks t ON t.id = a.task_id
            WHERE a.id = ?
        `;
        const params = [assignmentId];
        if (req.user.role_id === 2) {
            sql += " AND t.manager_account_id = ?";
            params.push(req.user.id);
        }
        const [rows] = await db.query(sql, params);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Không tìm thấy công việc" });
        }
        await db.query(
            "UPDATE manager_task_assignments SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
            [assignmentId]
        );
        res.json({ success: true, message: "Đã xác nhận hoàn thành công việc!" });
    } catch (error) {
        console.error('completeTask error:', error);
        res.status(500).json({ success: false, message: "Lỗi cập nhật công việc" });
    }
};

module.exports = {
    getManagerEvents,
    createManagerEvent,
    updateManagerEvent,
    deleteManagerEvent,
    createTaskForEvent,
    assignTask,
    bulkAssignTasks,
    getAssignedTasks,
    updateAssignedTask,
    deleteAssignedTask,
    completeTask,
};
