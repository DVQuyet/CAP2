const {
    db,
    sendMail,
    isSmtpConfigured,
    escapeHtml,
    formatTaskEmailDate,
    parseOptionalPositiveInt,
} = require('./common.service');
const { getManagerClanId } = require('./managerClan.service');
const { ensureManagerEventScheduleColumns } = require('./event.service');

let hasEnsuredTaskTables = false;

const ensureManagerTaskEventLink = async() => {
    const [cols] = await db.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'manager_tasks'
          AND COLUMN_NAME = 'event_id'
    `);
    if (!cols.length) {
        await db.query(`ALTER TABLE manager_tasks ADD COLUMN event_id INT NULL AFTER due_date`);
    }

    const [idx] = await db.query(`
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'manager_tasks'
          AND INDEX_NAME = 'idx_manager_tasks_event'
    `);
    if (!idx.length) {
        await db.query(`ALTER TABLE manager_tasks ADD INDEX idx_manager_tasks_event (event_id)`);
    }

    const [fk] = await db.query(`
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'manager_tasks'
          AND CONSTRAINT_NAME = 'fk_manager_tasks_event'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `);
    if (!fk.length) {
        await db.query(`
            ALTER TABLE manager_tasks
            ADD CONSTRAINT fk_manager_tasks_event
            FOREIGN KEY (event_id) REFERENCES events(id)
            ON DELETE SET NULL
        `);
    }
};

const ensureTaskTables = async() => {
    if (hasEnsuredTaskTables) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS manager_tasks (
            id INT PRIMARY KEY AUTO_INCREMENT,
            manager_account_id INT NOT NULL,
            clan_id INT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT NULL,
            due_date DATE NULL,
            event_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_manager_tasks_manager (manager_account_id),
            KEY idx_manager_tasks_clan (clan_id),
            KEY idx_manager_tasks_event (event_id),
            CONSTRAINT fk_manager_tasks_account FOREIGN KEY (manager_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
            CONSTRAINT fk_manager_tasks_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS manager_task_assignments (
            id INT PRIMARY KEY AUTO_INCREMENT,
            task_id INT NOT NULL,
            member_account_id INT NOT NULL,
            member_person_id INT NOT NULL,
            status ENUM('assigned', 'in_progress', 'completed') DEFAULT 'assigned',
            assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            completed_at TIMESTAMP NULL DEFAULT NULL,
            UNIQUE KEY uk_task_member (task_id, member_account_id),
            KEY idx_task_assignments_member (member_account_id),
            KEY idx_task_assignments_person (member_person_id),
            CONSTRAINT fk_task_assignments_task FOREIGN KEY (task_id) REFERENCES manager_tasks(id) ON DELETE CASCADE,
            CONSTRAINT fk_task_assignments_account FOREIGN KEY (member_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
            CONSTRAINT fk_task_assignments_person FOREIGN KEY (member_person_id) REFERENCES people(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureManagerTaskEventLink();
    await ensureManagerEventScheduleColumns();
    hasEnsuredTaskTables = true;
};

const sendTaskAssignmentEmail = async({ member, title, description, dueDate, eventTitle, taskId }) => {
    if (!member?.email || !isSmtpConfigured()) {
        return { sent: false, skipped: true };
    }

    const subject = `Công việc mới: ${title}`;

    const recipientName =
        member.display_name ||
        [member.surname, member.first_name].filter(Boolean).join(' ').trim() ||
        member.email;

    const taskLink = `/member/tasks/${taskId}`;

    const text = [
        `Xin chào ${recipientName},`,
        '',
        `Bạn vừa được phân công công việc: ${title}`,
        eventTitle ? `Sự kiện: ${eventTitle}` : null,
        `Hạn chót: ${formatTaskEmailDate(dueDate)}`,
        description ? `Mô tả: ${description}` : null,
        '',
        `Vui lòng đăng nhập Gia Phả Việt để xem chi tiết và cập nhật trạng thái: ${taskLink}`,
    ].filter(Boolean).join('\n');

    const html = `
        <p>Xin chào <strong>${escapeHtml(recipientName)}</strong>,</p>
        <p>Bạn vừa được phân công công việc mới trên Gia Phả Việt.</p>
        <ul>
            <li><strong>Công việc:</strong> ${escapeHtml(title)}</li>
            ${eventTitle ? `<li><strong>Sự kiện:</strong> ${escapeHtml(eventTitle)}</li>` : ''}
            <li><strong>Hạn chót:</strong> ${escapeHtml(formatTaskEmailDate(dueDate))}</li>
            ${description ? `<li><strong>Mô tả:</strong> ${escapeHtml(description)}</li>` : ''}
        </ul>
        <p>Vui lòng đăng nhập hệ thống để xem chi tiết và cập nhật trạng thái.</p>
    `;

    await sendMail({
        to: member.email,
        subject,
        text,
        html,
    });

    return { sent: true, skipped: false };
};

const normalizeTaskMemberIds = (body) => {
    const raw = Array.isArray(body.member_ids) ? body.member_ids : [body.member_id];
    return [...new Set(raw.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0))];
};

const emitNotificationToAccount = async(req, receiverAccountId, payload) => {
    const onlineUsers = req.app?.locals?.onlineUsers || {};
    const io = req.app?.locals?.io;
    const socketId = onlineUsers[receiverAccountId];

    if (io && socketId) {
        io.to(socketId).emit('new_notification', {
            ...payload,
            time: new Date().toLocaleTimeString(),
        });
    }
};

const resolveTaskClanAndEvent = async(req, memberRows = []) => {
    let managerClanId = null;

    if (Number(req.user.role_id) === 2) {
        managerClanId = await getManagerClanId(req.user.id);

        if (managerClanId == null) {
            const err = new Error('Không xác định được clan của manager');
            err.status = 404;
            throw err;
        }
    }

    const requestedClanId = parseOptionalPositiveInt(req.body.clan_id);
    const requestedEventId = parseOptionalPositiveInt(req.body.event_id ?? req.body.eventId);
    let eventRow = null;

    if (requestedEventId != null) {
        const [events] = await db.query(
            `
            SELECT id, clan_id, title, event_date, description
            FROM events
            WHERE id = ?
            LIMIT 1
            `, [requestedEventId]
        );

        eventRow = events[0] || null;

        if (!eventRow) {
            const err = new Error('Không tìm thấy sự kiện được chọn');
            err.status = 404;
            throw err;
        }

        if (managerClanId != null && Number(eventRow.clan_id) !== Number(managerClanId)) {
            const err = new Error('Manager chỉ được tạo công việc trong sự kiện thuộc dòng họ của mình');
            err.status = 403;
            throw err;
        }

        if (requestedClanId != null && Number(eventRow.clan_id) !== Number(requestedClanId)) {
            const err = new Error('Sự kiện không thuộc dòng họ đã chọn');
            err.status = 400;
            throw err;
        }
    }

    if (managerClanId != null && memberRows.some((member) => Number(member.clan_id) !== Number(managerClanId))) {
        const err = new Error('Manager chỉ được giao việc cho thành viên cùng dòng họ');
        err.status = 403;
        throw err;
    }

    const taskClanId =
        managerClanId ??
        requestedClanId ??
        eventRow?.clan_id ??
        memberRows[0]?.clan_id ??
        null;

    if (taskClanId != null && memberRows.some((member) => Number(member.clan_id) !== Number(taskClanId))) {
        const err = new Error('Chỉ được giao việc cho thành viên trong cùng dòng họ với sự kiện');
        err.status = 403;
        throw err;
    }

    if (eventRow && taskClanId != null && Number(eventRow.clan_id) !== Number(taskClanId)) {
        const err = new Error('Công việc và sự kiện phải cùng dòng họ');
        err.status = 400;
        throw err;
    }

    return {
        taskClanId,
        eventId: eventRow ? eventRow.id : requestedEventId,
        eventRow,
    };
};















// ==============================================================
// --- QUẢN LÝ CẬP NHẬT HỒ SƠ TỪ NHÁNH MAIN ---
// ==============================================================

module.exports = {
    hasEnsuredTaskTables,
    ensureManagerTaskEventLink,
    ensureTaskTables,
    sendTaskAssignmentEmail,
    normalizeTaskMemberIds,
    emitNotificationToAccount,
    resolveTaskClanAndEvent,
};
