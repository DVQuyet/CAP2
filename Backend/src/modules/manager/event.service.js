const {
    db,
    createNotification,
    sendMail,
    isSmtpConfigured,
    escapeHtml,
    formatTaskEmailDate,
} = require('./common.service');

let hasEnsuredManagerEventScheduleColumns = false;

const ensureManagerEventScheduleColumns = async() => {
    if (hasEnsuredManagerEventScheduleColumns) return;

    const [columns] = await db.query("SHOW COLUMNS FROM events");
    const names = new Set(columns.map((column) => column.Field));

    if (!names.has('start_date')) {
        await db.query('ALTER TABLE events ADD COLUMN start_date DATE NULL AFTER title');
    }

    if (!names.has('end_date')) {
        await db.query('ALTER TABLE events ADD COLUMN end_date DATE NULL AFTER start_date');
    }

    if (!names.has('status')) {
        await db.query("ALTER TABLE events ADD COLUMN status ENUM('upcoming','ongoing','ended') NOT NULL DEFAULT 'upcoming' AFTER end_date");
    }

    await db.query(`
        UPDATE events
        SET
            start_date = COALESCE(start_date, event_date),
            end_date = COALESCE(end_date, start_date, event_date)
        WHERE event_date IS NOT NULL
          AND (start_date IS NULL OR end_date IS NULL)
    `);

    try {
        await db.query('CREATE INDEX idx_events_clan_range ON events (clan_id, start_date, end_date)');
    } catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME') throw error;
    }

    hasEnsuredManagerEventScheduleColumns = true;
};

const computeManagerEventStatusSql = `
    CASE
        WHEN COALESCE(e.end_date, e.start_date, e.event_date) < CURDATE() THEN 'ended'
        WHEN COALESCE(e.start_date, e.event_date) <= CURDATE()
          AND COALESCE(e.end_date, e.start_date, e.event_date) >= CURDATE() THEN 'ongoing'
        ELSE 'upcoming'
    END
`;

const normalizeManagerEventDates = (body = {}) => {
    const startDate = body.start_date || body.startDate || body.event_start_date || body.event_date || body.eventDate || null;
    const endDate = body.end_date || body.endDate || body.event_end_date || startDate || null;
    return {
        startDate: startDate || null,
        endDate: endDate || startDate || null,
        eventDate: startDate || body.event_date || body.eventDate || null,
    };
};

const getClanActiveAccountsForEvent = async(clanId) => {
    if (!clanId) return [];
    const [rows] = await db.query(
        `
        SELECT
            a.id AS account_id,
            a.email,
            p.id AS person_id,
            COALESCE(NULLIF(p.display_name, ''), CONCAT_WS(' ', p.surname, p.middle_name, p.first_name), a.email) AS display_name
        FROM accounts a
        INNER JOIN people p ON p.id = a.person_id
        WHERE p.clan_id = ?
          AND a.status = 'active'
          AND a.role_id IN (1, 2, 3)
        ORDER BY a.role_id ASC, p.display_name ASC, a.id ASC
        `,
        [clanId]
    );
    return rows;
};

const formatManagerEventDateRange = (startDate, endDate) => {
    const startText = formatTaskEmailDate(startDate);
    const endText = formatTaskEmailDate(endDate);
    if (!startDate && !endDate) return 'Chưa có thời gian';
    if (!endDate || startDate === endDate) return startText;
    return `${startText} - ${endText}`;
};

const sendManagerEventEmail = async({ member, title, description, startDate, endDate }) => {
    if (!member?.email || !isSmtpConfigured()) {
        return { sent: false, skipped: true };
    }

    const recipientName = member.display_name || member.email;
    const dateText = formatManagerEventDateRange(startDate, endDate);
    const subject = `Sự kiện dòng họ mới: ${title}`;
    const text = [
        `Xin chào ${recipientName},`,
        '',
        `Dòng họ vừa tạo sự kiện mới: ${title}`,
        `Thời gian: ${dateText}`,
        description ? `Mô tả: ${description}` : null,
        '',
        'Vui lòng đăng nhập Gia Phả Việt để xem chi tiết trong mục Lịch Việt Nam hoặc Sự kiện.',
    ].filter(Boolean).join('\n');

    const html = `
        <p>Xin chào <strong>${escapeHtml(recipientName)}</strong>,</p>
        <p>Dòng họ vừa tạo một sự kiện mới trên Gia Phả Việt.</p>
        <ul>
            <li><strong>Sự kiện:</strong> ${escapeHtml(title)}</li>
            <li><strong>Thời gian:</strong> ${escapeHtml(dateText)}</li>
            ${description ? `<li><strong>Mô tả:</strong> ${escapeHtml(description)}</li>` : ''}
        </ul>
        <p>Vui lòng đăng nhập hệ thống để xem chi tiết trong mục Lịch Việt Nam hoặc Sự kiện.</p>
    `;

    await sendMail({ to: member.email, subject, text, html });
    return { sent: true, skipped: false };
};

const notifyClanAboutManagerEvent = async(req, { clanId, eventId, title, description, startDate, endDate }) => {
    const recipients = await getClanActiveAccountsForEvent(clanId);
    const linkUrl = '/user/calendar';
    const message = `Sự kiện "${title}" diễn ra ${formatManagerEventDateRange(startDate, endDate)}.`;

    let notificationCount = 0;
    const emailSummary = { sent: 0, skipped: 0, failed: 0 };

    for (const member of recipients) {
        try {
            await createNotification({
                receiverAccountId: member.account_id,
                receiverPersonId: member.person_id,
                type: 'manager_event_created',
                title: `Sự kiện mới: ${title}`,
                message,
                linkUrl,
            });
            notificationCount += 1;
        } catch (error) {
            console.error('manager event notification error:', error);
        }

        try {
            const mailResult = await sendManagerEventEmail({ member, title, description, startDate, endDate });
            if (mailResult.sent) emailSummary.sent += 1;
            else if (mailResult.skipped) emailSummary.skipped += 1;
        } catch (error) {
            emailSummary.failed += 1;
            console.error('manager event email error:', { account_id: member.account_id, error: error.message });
        }
    }

    const io = req.app?.get?.('io') || req.app?.locals?.io;
    if (io) {
        for (const member of recipients) {
            io.to(`account_${member.account_id}`).emit('notification', {
                type: 'manager_event_created',
                title: `Sự kiện mới: ${title}`,
                message,
                event_id: eventId,
            });
        }
    }

    return { notificationCount, email: emailSummary };
};


const enqueueClanAboutManagerEventNotification = (req, payload) => {
    const app = req?.app || null;
    const jobPayload = { ...payload };

    setImmediate(() => {
        notifyClanAboutManagerEvent({ app }, jobPayload)
            .then((summary) => {
                console.log('manager event notification job completed:', {
                    event_id: jobPayload.eventId,
                    notifications: summary?.notificationCount || 0,
                    email: summary?.email || null,
                });
            })
            .catch((error) => {
                console.error('manager event notification job failed:', {
                    event_id: jobPayload.eventId,
                    error: error?.message || error,
                });
            });
    });

    return { queued: true };
};

module.exports = {
    hasEnsuredManagerEventScheduleColumns,
    ensureManagerEventScheduleColumns,
    computeManagerEventStatusSql,
    normalizeManagerEventDates,
    getClanActiveAccountsForEvent,
    formatManagerEventDateRange,
    sendManagerEventEmail,
    notifyClanAboutManagerEvent,
    enqueueClanAboutManagerEventNotification,
};
