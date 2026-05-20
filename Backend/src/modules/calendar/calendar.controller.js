const db = require('../../config/db');
const { createNotification } = require('../../shared/utils/notifications');
const { sendMail, isSmtpConfigured } = require('../../shared/utils/email');

let schemaReady = false;
let schedulerStarted = false;

const EVENT_TYPES = new Set(['family', 'study', 'holiday', 'personal', 'lunar', 'birthday', 'death_anniversary', 'manager_event']);
const EVENT_VISIBILITIES = new Set(['personal', 'global']);

const pad2 = (value) => String(value).padStart(2, '0');

const toIsoDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split('/');
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
};

const toDisplayDate = (dateValue) => {
  const iso = toIsoDate(dateValue);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};


const jdFromDate = (dd, mm, yy) => {
  const a = Math.floor((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  if (jd < 2299161) {
    jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  }
  return jd;
};

const jdToDate = (jd) => {
  let a;
  let b;
  let c;
  if (jd > 2299160) {
    a = jd + 32044;
    b = Math.floor((4 * a + 3) / 146097);
    c = a - Math.floor((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = b * 100 + d - 4800 + Math.floor(m / 10);
  return [day, month, year];
};

const newMoon = (k) => {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const dr = Math.PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * dr);
  const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
  const mpr = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
  const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
  let c1 = (0.1734 - 0.000393 * t) * Math.sin(m * dr) + 0.0021 * Math.sin(2 * dr * m);
  c1 -= 0.4068 * Math.sin(mpr * dr) + 0.0161 * Math.sin(2 * dr * mpr);
  c1 -= 0.0004 * Math.sin(3 * dr * mpr);
  c1 += 0.0104 * Math.sin(2 * dr * f) - 0.0051 * Math.sin((m + mpr) * dr);
  c1 -= 0.0074 * Math.sin((m - mpr) * dr) + 0.0004 * Math.sin((2 * f + m) * dr);
  c1 -= 0.0004 * Math.sin((2 * f - m) * dr) - 0.0006 * Math.sin((2 * f + mpr) * dr);
  c1 += 0.001 * Math.sin((2 * f - mpr) * dr) + 0.0005 * Math.sin((2 * mpr + m) * dr);
  const deltaT = t < -11
    ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
    : -0.000278 + 0.000265 * t + 0.000262 * t2;
  return jd1 + c1 - deltaT;
};

const sunLongitude = (jdn) => {
  const t = (jdn - 2451545.0) / 36525;
  const t2 = t * t;
  const dr = Math.PI / 180;
  const m = 357.5291 + 35999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
  const l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
  let dl = (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(dr * m);
  dl += (0.019993 - 0.000101 * t) * Math.sin(2 * dr * m) + 0.00029 * Math.sin(3 * dr * m);
  let l = (l0 + dl) * dr;
  l -= Math.PI * 2 * Math.floor(l / (Math.PI * 2));
  return l;
};

const getNewMoonDay = (k, timeZone = 7) => Math.floor(newMoon(k) + 0.5 + timeZone / 24);
const getSunLongitude = (dayNumber, timeZone = 7) => Math.floor((sunLongitude(dayNumber - 0.5 - timeZone / 24) / Math.PI) * 6);

const getLunarMonth11 = (yy, timeZone = 7) => {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = Math.floor(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  const sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) nm = getNewMoonDay(k - 1, timeZone);
  return nm;
};

const getLeapMonthOffset = (a11, timeZone = 7) => {
  const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i += 1;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
};

const convertSolar2Lunar = (dd, mm, yy, timeZone = 7) => {
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k, timeZone);
  let a11 = getLunarMonth11(yy, timeZone);
  let b11 = a11;
  let lunarYear;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = getLunarMonth11(yy - 1, timeZone);
  } else {
    lunarYear = yy + 1;
    b11 = getLunarMonth11(yy + 1, timeZone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11) / 29);
  let lunarLeap = 0;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) lunarLeap = 1;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
};

const convertLunar2SolarDate = (lunarDay, lunarMonth, lunarYear, lunarLeap = 0, timeZone = 7) => {
  let a11;
  let b11;
  if (lunarMonth < 11) {
    a11 = getLunarMonth11(lunarYear - 1, timeZone);
    b11 = getLunarMonth11(lunarYear, timeZone);
  } else {
    a11 = getLunarMonth11(lunarYear, timeZone);
    b11 = getLunarMonth11(lunarYear + 1, timeZone);
  }
  const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11, timeZone);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (lunarLeap !== 0 && lunarMonth !== leapMonth) return null;
    if (lunarLeap !== 0 || off >= leapOff) off += 1;
  }
  const monthStart = getNewMoonDay(k + off, timeZone);
  const [day, month, year] = jdToDate(monthStart + lunarDay - 1);
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const solarIsoToLunar = (isoDate) => {
  const iso = toIsoDate(isoDate);
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return convertSolar2Lunar(day, month, year, 7);
};

const formatLunarDisplay = (lunar) => {
  if (!lunar) return '';
  return `${pad2(lunar.day)}/${pad2(lunar.month)}/${lunar.year}${lunar.leap ? ' nhuận' : ''}`;
};

const normalizeText = (value, max = 255) => String(value || '').trim().slice(0, max);

const normalizeEventType = (value) => {
  const type = String(value || 'personal').trim().toLowerCase();
  return EVENT_TYPES.has(type) ? type : 'personal';
};

const normalizeVisibility = (value) => {
  const visibility = String(value || 'personal').trim().toLowerCase();
  return EVENT_VISIBILITIES.has(visibility) ? visibility : 'personal';
};

const normalizeReminderDays = (value) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.min(365, Math.max(0, Math.round(number)));
};
const emitCalendarUpdated = (req, event, action = 'calendar_updated') => {
  const io = req.app?.locals?.io;

  if (!io || !event) {
    console.log('⚠️ Không thể emit calendar_updated: thiếu io hoặc event');
    return;
  }

  const payload = {
    action,
    event_id: event.id || event.event_id || null,
    clan_id: event.clan_id || null,
    visibility: event.visibility || 'personal',
    actor_account_id: req.user?.id || req.user?.account_id || null,
    updated_at: new Date().toISOString(),
  };

  if (payload.visibility === 'global' && payload.clan_id) {
    io.to(`clan_${payload.clan_id}`).emit('calendar_updated', payload);
    console.log(`📅 Đã emit calendar_updated ${action} tới clan_${payload.clan_id}`);
    return;
  }

  const accountId = event.creator_account_id || req.user?.id || req.user?.account_id;

  if (accountId) {
    io.to(`account_${accountId}`).emit('calendar_updated', payload);
    console.log(`📅 Đã emit calendar_updated ${action} tới account_${accountId}`);
  }
};


let managerEventSchemaReady = false;

const ensureManagerEventsForCalendarSchema = async () => {
  if (managerEventSchemaReady) return;

  const [columns] = await db.query('SHOW COLUMNS FROM events');
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

  managerEventSchemaReady = true;
};

const addDaysIso = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const buildManagerEventsForCalendar = async ({ clanId, from, to }) => {
  if (!clanId || !from || !to) return [];
  await ensureManagerEventsForCalendarSchema();

  const [rows] = await db.query(
    `
    SELECT
      e.id,
      e.clan_id,
      e.title,
      e.description,
      COALESCE(e.start_date, e.event_date) AS start_date,
      COALESCE(e.end_date, e.start_date, e.event_date) AS end_date,
      CASE
        WHEN COALESCE(e.end_date, e.start_date, e.event_date) < CURDATE() THEN 'ended'
        WHEN COALESCE(e.start_date, e.event_date) <= CURDATE()
          AND COALESCE(e.end_date, e.start_date, e.event_date) >= CURDATE() THEN 'ongoing'
        ELSE 'upcoming'
      END AS status
    FROM events e
    WHERE e.clan_id = ?
      AND COALESCE(e.start_date, e.event_date) IS NOT NULL
      AND COALESCE(e.end_date, e.start_date, e.event_date) >= ?
      AND COALESCE(e.start_date, e.event_date) <= ?
    ORDER BY COALESCE(e.start_date, e.event_date) ASC, e.id ASC
    `,
    [clanId, from, to]
  );

  const events = [];

  for (const row of rows) {
    let current = toIsoDate(row.start_date);
    const end = toIsoDate(row.end_date) || current;
    if (!current || !end) continue;

    while (current <= end) {
      if (current >= from && current <= to) {
        events.push({
          id: `manager-event-${row.id}-${current}`,
          manager_event_id: row.id,
          clan_id: row.clan_id,
          creator_account_id: null,
          creator_name: 'Dòng họ',
          title: row.title,
          date: current,
          event_date: current,
          start_date: toIsoDate(row.start_date),
          end_date: toIsoDate(row.end_date),
          time: '',
          event_time: '',
          type: 'manager_event',
          note: row.description || '',
          description: row.description || '',
          visibility: 'global',
          scope: 'global',
          is_global: true,
          source: 'manager_event',
          status: row.status || 'upcoming',
          can_edit: false,
          can_delete: false,
          reminder_days: null,
          reminder_sent_at: null,
          email_sent_at: null,
          created_at: null,
          updated_at: null,
        });
      }
      current = addDaysIso(current, 1);
      if (events.length > 2000) break;
    }
  }

  return events;
};

const ensureCalendarSchema = async () => {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INT PRIMARY KEY AUTO_INCREMENT,
      clan_id INT NULL,
      creator_account_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      event_date DATE NOT NULL,
      event_time VARCHAR(10) NULL,
      type VARCHAR(30) NOT NULL DEFAULT 'personal',
      note TEXT NULL,
      visibility ENUM('personal','global') NOT NULL DEFAULT 'global',
      reminder_days INT NOT NULL DEFAULT 0,
      reminder_sent_at DATETIME NULL,
      email_sent_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_calendar_events_clan_date (clan_id, event_date),
      KEY idx_calendar_events_visibility (clan_id, visibility, event_date),
      KEY idx_calendar_events_reminder (reminder_sent_at, event_date),
      KEY idx_calendar_events_creator (creator_account_id),
      CONSTRAINT fk_calendar_events_creator FOREIGN KEY (creator_account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [columns] = await db.query(
    "SHOW COLUMNS FROM calendar_events LIKE 'visibility'"
  );

  if (!columns.length) {
    await db.query(
      "ALTER TABLE calendar_events ADD COLUMN visibility ENUM('personal','global') NOT NULL DEFAULT 'global' AFTER note"
    );
  }

  try {
    await db.query(
      'CREATE INDEX idx_calendar_events_visibility ON calendar_events (clan_id, visibility, event_date)'
    );
  } catch (error) {
    if (error?.code !== 'ER_DUP_KEYNAME') throw error;
  }

  schemaReady = true;
};

const getUserContext = async (accountId) => {
  const [rows] = await db.query(
    `
    SELECT
      a.id AS account_id,
      a.email AS account_email,
      a.role_id,
      a.status,
      a.person_id,
      p.display_name,
      p.first_name,
      p.middle_name,
      p.surname,
      p.clan_id
    FROM accounts a
    LEFT JOIN people p ON p.id = a.person_id
    WHERE a.id = ?
    LIMIT 1
    `,
    [accountId]
  );

  return rows[0] || null;
};

const resolveClanId = async (req) => {
  const context = await getUserContext(req.user.id);
  const role = String(req.user.role_name || '').toLowerCase();

  if (role === 'admin') {
    const requested = Number(req.query?.clan_id || req.body?.clan_id);
    if (Number.isFinite(requested) && requested > 0) return requested;
    if (context?.clan_id) return context.clan_id;

    const [firstClan] = await db.query('SELECT id FROM clans ORDER BY id ASC LIMIT 1');
    return firstClan[0]?.id || null;
  }

  if (context?.clan_id) return context.clan_id;

  try {
    const [memberships] = await db.query(
      `
      SELECT clan_id
      FROM account_clans
      WHERE account_id = ? AND status = 'active'
      ORDER BY id ASC
      LIMIT 1
      `,
      [req.user.id]
    );
    if (memberships[0]?.clan_id) return memberships[0].clan_id;
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
  }

  return null;
};

const isManagerOrAdmin = (req) => ['admin', 'manager'].includes(String(req.user?.role_name || '').toLowerCase());

const canManageCalendarEvent = (req, row) => {
  if (!row || !req?.user?.id) return false;
  if (isManagerOrAdmin(req)) return true;
  return Number(row.creator_account_id) === Number(req.user.id);
};

const mapEventRow = (row, req = null) => {
  const visibility = row.visibility || 'personal';
  const manageable = req ? canManageCalendarEvent(req, row) : false;

  return {
    id: row.id,
    clan_id: row.clan_id,
    creator_account_id: row.creator_account_id,
    creator_name: row.creator_name || row.creator_email || 'Thành viên',
    title: row.title,
    date: toIsoDate(row.event_date),
    event_date: toIsoDate(row.event_date),
    time: row.event_time || '',
    event_time: row.event_time || '',
    type: row.type || 'personal',
    note: row.note || '',
    visibility,
    scope: visibility,
    is_global: visibility === 'global',
    can_edit: manageable,
    can_delete: manageable,
    reminder_days: Number(row.reminder_days || 0),
    reminder_sent_at: row.reminder_sent_at || null,
    email_sent_at: row.email_sent_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const getPersonDisplayName = (person) => {
  const text = [person.surname, person.middle_name, person.first_name].filter(Boolean).join(' ').trim();
  return person.display_name || text || `Thành viên #${person.id}`;
};

const buildYearlyPersonEvents = async ({ clanId, from, to }) => {
  if (!clanId || !from || !to) return [];

  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return [];

  const fromYear = fromDate.getFullYear();
  const toYear = toDate.getFullYear();

  const [people] = await db.query(
    `
    SELECT id, display_name, surname, middle_name, first_name, birth_date, death_date, is_living
    FROM people
    WHERE clan_id = ?
      AND (
        (is_living = 1 AND birth_date IS NOT NULL)
        OR (is_living = 0 AND death_date IS NOT NULL)
      )
    ORDER BY display_name ASC, id ASC
    `,
    [clanId]
  );

  const events = [];
  const seen = new Set();

  const pushPersonEvent = ({ person, eventDate, yearKey, isLiving, name, note, lunarDate = "", originalLunarDate = "", anniversaryLunarDate = "" }) => {
    if (!eventDate || eventDate < from || eventDate > to) return;
    const key = `${isLiving ? 'birthday' : 'death'}-${person.id}-${eventDate}`;
    if (seen.has(key)) return;
    seen.add(key);

    events.push({
      id: `${isLiving ? 'birthday' : 'death'}-${person.id}-${yearKey}`,
      clan_id: clanId,
      creator_account_id: null,
      creator_name: 'Hệ thống',
      title: isLiving ? `Sinh nhật ${name}` : `Ngày giỗ ${name}`,
      date: eventDate,
      event_date: eventDate,
      time: '',
      event_time: '',
      type: isLiving ? 'birthday' : 'death_anniversary',
      note,
      visibility: 'global',
      scope: 'global',
      is_global: true,
      source: 'person_anniversary',
      person_id: person.id,
      lunar_date: lunarDate,
      original_lunar_date: originalLunarDate,
      anniversary_lunar_date: anniversaryLunarDate,
      can_edit: false,
      can_delete: false,
      reminder_days: null,
      reminder_sent_at: null,
      email_sent_at: null,
      created_at: null,
      updated_at: null,
    });
  };

  for (const person of people) {
    const isLiving = Number(person.is_living) === 1;
    const name = getPersonDisplayName(person);

    if (isLiving) {
      // Sinh nhật luôn lặp theo ngày dương đã nhập trong hồ sơ.
      const birthDate = toIsoDate(person.birth_date);
      if (!birthDate) continue;
      const [, month, day] = birthDate.split('-');

      for (let year = fromYear; year <= toYear; year += 1) {
        let eventDate = `${year}-${month}-${day}`;
        const parsed = new Date(`${eventDate}T00:00:00`);

        // Nếu sinh 29/02, năm không nhuận sẽ hiển thị 28/02.
        if (Number.isNaN(parsed.getTime()) || parsed.getMonth() + 1 !== Number(month)) {
          if (month === '02' && day === '29') eventDate = `${year}-02-28`;
          else continue;
        }

        const birthdayLunar = solarIsoToLunar(eventDate);
        pushPersonEvent({
          person,
          eventDate,
          yearKey: year,
          isLiving: true,
          name,
          lunarDate: formatLunarDisplay(birthdayLunar),
          note: `Tự động từ ngày sinh dương lịch của ${name}. Ngày sinh âm lịch năm này: ${formatLunarDisplay(birthdayLunar)}.`,
        });
      }

      continue;
    }

    // Ngày mất / ngày giỗ phải lặp theo ngày âm.
    // Hệ thống lấy ngày dương đã nhập trong hồ sơ, quy đổi ra ngày âm gốc,
    // rồi mỗi năm âm lịch sẽ quy đổi ngược lại sang ngày dương tương ứng để hiện trên lịch.
    const deathDate = toIsoDate(person.death_date);
    const deathLunar = solarIsoToLunar(deathDate);
    if (!deathLunar) continue;

    for (let lunarYear = fromYear - 1; lunarYear <= toYear + 1; lunarYear += 1) {
      const eventDate = convertLunar2SolarDate(deathLunar.day, deathLunar.month, lunarYear, deathLunar.leap || 0, 7);
      if (!eventDate) continue;

      const anniversaryLunar = solarIsoToLunar(eventDate);
      const originalDeathLunarText = formatLunarDisplay(deathLunar);
      const anniversaryLunarText = formatLunarDisplay(anniversaryLunar);

      pushPersonEvent({
        person,
        eventDate,
        yearKey: lunarYear,
        isLiving: false,
        name,
        lunarDate: anniversaryLunarText,
        originalLunarDate: originalDeathLunarText,
        anniversaryLunarDate: anniversaryLunarText,
        note: `Tự động từ ngày mất của ${name}. Ngày mất dương lịch: ${toDisplayDate(deathDate)}. Ngày mất âm lịch gốc: ${originalDeathLunarText}. Ngày giỗ âm lịch năm này: ${anniversaryLunarText}.`,
      });
    }
  }

  return events;
};

const getClanRecipients = async (clanId) => {
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

const getCreatorRecipient = async (accountId) => {
  const [rows] = await db.query(
    `
    SELECT
      a.id AS account_id,
      a.email,
      p.id AS person_id,
      COALESCE(NULLIF(p.display_name, ''), CONCAT_WS(' ', p.surname, p.middle_name, p.first_name), a.email) AS display_name
    FROM accounts a
    LEFT JOIN people p ON p.id = a.person_id
    WHERE a.id = ? AND a.status = 'active'
    LIMIT 1
    `,
    [accountId]
  );

  return rows;
};

const getEventRecipients = async (event) => {
  if ((event.visibility || 'personal') === 'global') {
    return getClanRecipients(event.clan_id);
  }

  return getCreatorRecipient(event.creator_account_id);
};

const sendReminderEmail = async ({ recipient, event }) => {
  if (!recipient?.email || !isSmtpConfigured()) return { sent: false, skipped: true };

  const eventDate = toDisplayDate(event.event_date || event.date);
  const subject = `[Gia Phả Việt] Nhắc lịch: ${event.title}`;
  const text = [
    `Xin chào ${recipient.display_name || ''},`,
    '',
    `Bạn có lịch quan trọng: ${event.title}`,
    `Ngày: ${eventDate}${event.event_time ? ` lúc ${event.event_time}` : ''}`,
    event.note ? `Ghi chú: ${event.note}` : '',
    '',
    'Vui lòng đăng nhập Gia Phả Việt để xem chi tiết lịch.',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#4b2618">
      <h2 style="color:#8c281f;margin:0 0 12px">Nhắc lịch Gia Phả Việt</h2>
      <p>Xin chào <strong>${recipient.display_name || ''}</strong>,</p>
      <p>Bạn có lịch quan trọng:</p>
      <div style="padding:14px 16px;border:1px solid #d8b36a;border-radius:12px;background:#fff8ea">
        <h3 style="margin:0 0 8px;color:#6b2a1d">${event.title}</h3>
        <p style="margin:0"><strong>Ngày:</strong> ${eventDate}${event.event_time ? ` lúc ${event.event_time}` : ''}</p>
        ${event.note ? `<p style="margin:8px 0 0"><strong>Ghi chú:</strong> ${event.note}</p>` : ''}
      </div>
      <p style="margin-top:16px">Vui lòng đăng nhập Gia Phả Việt để xem chi tiết lịch.</p>
    </div>
  `;

  await sendMail({ to: recipient.email, subject, text, html });
  return { sent: true, skipped: false };
};

const notifyEventRecipients = async (eventRow) => {
  await ensureCalendarSchema();
  const event = mapEventRow(eventRow);
  const recipients = await getEventRecipients(event);
  const eventDate = toDisplayDate(event.event_date);
  const linkUrl = '/user/calendar';
  let notificationCount = 0;
  let emailSent = 0;
  let emailSkipped = 0;
  let emailFailed = 0;

  for (const recipient of recipients) {
    try {
      await createNotification({
        receiverAccountId: recipient.account_id,
        receiverPersonId: recipient.person_id,
        type: 'calendar_reminder',
        title: `Nhắc lịch: ${event.title}`,
        message: `${event.title} vào ngày ${eventDate}${event.time ? ` lúc ${event.time}` : ''}.`,
        linkUrl,
      });
      notificationCount += 1;
    } catch (error) {
      console.error('calendar notification error:', error);
    }

    try {
      const emailResult = await sendReminderEmail({ recipient, event });
      if (emailResult.sent) emailSent += 1;
      else emailSkipped += 1;
    } catch (error) {
      emailFailed += 1;
      console.error('calendar email error:', { account_id: recipient.account_id, error: error.message });
    }
  }

  return { notificationCount, emailSent, emailSkipped, emailFailed };
};

const processDueReminders = async () => {
  await ensureCalendarSchema();

  const [events] = await db.query(
    `
    SELECT *
    FROM calendar_events
    WHERE reminder_sent_at IS NULL
      AND DATE_SUB(event_date, INTERVAL reminder_days DAY) <= CURDATE()
      AND event_date >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
    ORDER BY event_date ASC, id ASC
    LIMIT 50
    `
  );

  const summary = [];

  for (const event of events) {
    const result = await notifyEventRecipients(event);
    await db.query(
      'UPDATE calendar_events SET reminder_sent_at = NOW(), email_sent_at = CASE WHEN ? > 0 THEN NOW() ELSE email_sent_at END WHERE id = ?',
      [result.emailSent, event.id]
    );
    summary.push({ event_id: event.id, ...result });
  }

  return summary;
};

exports.listEvents = async (req, res) => {
  try {
    await ensureCalendarSchema();
    await ensureManagerEventsForCalendarSchema();
    await processDueReminders().catch((error) => console.error('calendar reminder background error:', error));

    const clanId = await resolveClanId(req);
    if (!clanId) {
      return res.status(404).json({ success: false, message: 'Không xác định được dòng họ để xem lịch.' });
    }

    const from = toIsoDate(req.query.from || req.query.date_from) || `${new Date().getFullYear()}-01-01`;
    const to = toIsoDate(req.query.to || req.query.date_to) || `${new Date().getFullYear()}-12-31`;

    const [rows] = await db.query(
      `
      SELECT
        e.*,
        a.email AS creator_email,
        COALESCE(NULLIF(p.display_name, ''), CONCAT_WS(' ', p.surname, p.middle_name, p.first_name), a.email) AS creator_name
      FROM calendar_events e
      LEFT JOIN accounts a ON a.id = e.creator_account_id
      LEFT JOIN people p ON p.id = a.person_id
      WHERE e.clan_id = ?
        AND e.event_date BETWEEN ? AND ?
        AND (COALESCE(e.visibility, 'global') = 'global' OR e.creator_account_id = ?)
      ORDER BY e.event_date ASC, e.event_time ASC, e.id ASC
      `,
      [clanId, from, to, req.user.id]
    );

    const dbEvents = rows.map((row) => mapEventRow(row, req));
    const personEvents = await buildYearlyPersonEvents({ clanId, from, to });
    const managerEvents = await buildManagerEventsForCalendar({ clanId, from, to });
    const events = [...dbEvents, ...personEvents, ...managerEvents].sort((a, b) => {
      const dateCompare = String(a.event_date || a.date).localeCompare(String(b.event_date || b.date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
    });

    return res.json({ success: true, events, clan_id: clanId });
  } catch (error) {
    console.error('calendar listEvents error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi lấy lịch.' });
  }
};

exports.createEvent = async (req, res) => {
  try {
    await ensureCalendarSchema();

    const clanId = await resolveClanId(req);
    if (!clanId) {
      return res.status(404).json({ success: false, message: 'Không xác định được dòng họ để tạo lịch.' });
    }

    const title = normalizeText(req.body.title);
    const eventDate = toIsoDate(req.body.date || req.body.event_date);
    const eventTime = normalizeText(req.body.time || req.body.event_time, 10) || null;
    const type = normalizeEventType(req.body.type);
    const note = normalizeText(req.body.note, 2000) || null;
    let visibility = normalizeVisibility(req.body.visibility || req.body.scope);
    if (!isManagerOrAdmin(req)) visibility = 'personal';
    const reminderDays = normalizeReminderDays(req.body.reminder_days ?? req.body.reminderDays);

    if (!title) {
      return res.status(400).json({ success: false, message: 'Tên lịch không được để trống.' });
    }

    if (!eventDate) {
      return res.status(400).json({ success: false, message: 'Ngày lịch không hợp lệ.' });
    }

    const [result] = await db.query(
      `
      INSERT INTO calendar_events
        (clan_id, creator_account_id, title, event_date, event_time, type, note, visibility, reminder_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [clanId, req.user.id, title, eventDate, eventTime, type, note, visibility, reminderDays]
    );

    const [rows] = await db.query('SELECT * FROM calendar_events WHERE id = ? LIMIT 1', [result.insertId]);
    const created = rows[0];

    const reminderDate = new Date(eventDate);
    reminderDate.setDate(reminderDate.getDate() - reminderDays);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (reminderDate <= today) {
      const notifyResult = await notifyEventRecipients(created);
      await db.query(
        'UPDATE calendar_events SET reminder_sent_at = NOW(), email_sent_at = CASE WHEN ? > 0 THEN NOW() ELSE email_sent_at END WHERE id = ?',
        [notifyResult.emailSent, created.id]
      );
      created.reminder_sent_at = new Date();
    }

    emitCalendarUpdated(req, created, 'calendar_event_created');

return res.status(201).json({
  success: true,
  message: 'Đã tạo lịch quan trọng.',
  event: mapEventRow(created, req),
});
  } catch (error) {
    console.error('calendar createEvent error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi tạo lịch.' });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    await ensureCalendarSchema();

    const eventId = Number(req.params.id);
    if (!Number.isFinite(eventId)) {
      return res.status(400).json({ success: false, message: 'ID lịch không hợp lệ.' });
    }

    const clanId = await resolveClanId(req);
    const [existingRows] = await db.query('SELECT * FROM calendar_events WHERE id = ? AND clan_id = ? LIMIT 1', [eventId, clanId]);
    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch.' });
    }

    if (!isManagerOrAdmin(req) && Number(existing.creator_account_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ được sửa lịch do mình tạo.' });
    }

    const title = normalizeText(req.body.title || existing.title);
    const eventDate = toIsoDate(req.body.date || req.body.event_date || existing.event_date);
    const eventTime = normalizeText(req.body.time ?? req.body.event_time ?? existing.event_time, 10) || null;
    const type = normalizeEventType(req.body.type || existing.type);
    const note = normalizeText(req.body.note ?? existing.note, 2000) || null;
    let visibility = normalizeVisibility(req.body.visibility || req.body.scope || existing.visibility);
    if (!isManagerOrAdmin(req)) visibility = 'personal';
    const reminderDays = normalizeReminderDays(req.body.reminder_days ?? req.body.reminderDays ?? existing.reminder_days);
    const shouldResetReminder = eventDate !== toIsoDate(existing.event_date) || reminderDays !== Number(existing.reminder_days || 0);

    await db.query(
      `
      UPDATE calendar_events
      SET title = ?, event_date = ?, event_time = ?, type = ?, note = ?, visibility = ?, reminder_days = ?,
          reminder_sent_at = CASE WHEN ? THEN NULL ELSE reminder_sent_at END,
          email_sent_at = CASE WHEN ? THEN NULL ELSE email_sent_at END
      WHERE id = ?
      `,
      [title, eventDate, eventTime, type, note, visibility, reminderDays, shouldResetReminder, shouldResetReminder, eventId]
    );

    const [rows] = await db.query('SELECT * FROM calendar_events WHERE id = ? LIMIT 1', [eventId]);
    const updated = rows[0];

    emitCalendarUpdated(req, updated, 'calendar_event_updated');

    return res.json({
      success: true,
      message: 'Đã cập nhật lịch.',
      event: mapEventRow(updated, req),
    });
  } catch (error) {
    console.error('calendar updateEvent error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật lịch.' });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    await ensureCalendarSchema();

    const eventId = Number(req.params.id);
    if (!Number.isFinite(eventId)) {
      return res.status(400).json({ success: false, message: 'ID lịch không hợp lệ.' });
    }

    const clanId = await resolveClanId(req);
    const [existingRows] = await db.query('SELECT * FROM calendar_events WHERE id = ? AND clan_id = ? LIMIT 1', [eventId, clanId]);
    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch.' });
    }

    if (!isManagerOrAdmin(req) && Number(existing.creator_account_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ được xóa lịch do mình tạo.' });
    }

    await db.query('DELETE FROM calendar_events WHERE id = ?', [eventId]);

    emitCalendarUpdated(req, existing, 'calendar_event_deleted');

    return res.json({ success: true, message: 'Đã xóa lịch.' });
  } catch (error) {
    console.error('calendar deleteEvent error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi xóa lịch.' });
  }
};

exports.runDueReminders = async (req, res) => {
  try {
    const summary = await processDueReminders();
    return res.json({ success: true, processed: summary.length, summary, smtp_configured: isSmtpConfigured() });
  } catch (error) {
    console.error('calendar runDueReminders error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi chạy nhắc lịch.' });
  }
};

exports.startCalendarReminderScheduler = (app) => {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const run = async () => {
    try {
      await processDueReminders();
    } catch (error) {
      console.error('calendar reminder scheduler error:', error.message);
    }
  };

  setTimeout(run, 10000);
  setInterval(run, 5 * 60 * 1000);
};

exports.ensureCalendarSchema = ensureCalendarSchema;
exports.processDueReminders = processDueReminders;
