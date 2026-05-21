const db = require("../../config/db");
const bcrypt = require("bcryptjs");
const { getRoleName } = require("../../config/roles");
const {
  getTreeEditSessionForAccount,
  activateTreeEditSessionForAccount,
} = require("../../shared/utils/treeEditPermissions");
const { createNotification, ensureNotificationSchema } = require("../../shared/utils/notifications");
const { getTreeLayoutSettings } = require("../../shared/utils/treeLayoutSettings");
const { normalizeMediaId, extractMediaIdFromUrl } = require("../../shared/utils/media");
const { ensureFamilyRelationshipColumns } = require("../genealogy/familyRelation.service");
const { ensureArchivedMembersTable } = require("../manager/archive.service");
const { ensureProfileCompletedColumn } = require("../../shared/utils/profileCompletion");
const {
  ACTIVE_TREE_MEMBER_WHERE_SQL,
  ARCHIVED_MEMBER_JOIN_SQL,
  filterTreeRelationsForVisiblePeople,
} = require("../manager/common.service");

/** Ghép họ + tên đệm + tên → display_name (khoảng trắng gọn) */
const buildDisplayNameFromParts = (surname, middleName, firstName) => {
  const s = surname == null ? "" : String(surname).trim();
  const m = middleName == null ? "" : String(middleName).trim();
  const f = firstName == null ? "" : String(firstName).trim();
  return [s, m, f].filter(Boolean).join(" ").trim();
};

const fmtSqlDate = (d) => {
  if (!d) return null;
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const text = String(d).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text.length >= 10 ? text.slice(0, 10) : text || null;
};

const getAccountContext = async (accountId) => {
  const sql = `
    SELECT 
      a.id AS account_id,
      a.email AS account_email,
      a.role_id,
      a.status,
      a.profile_completed,
      COALESCE(a.person_id, ac.person_id) AS person_id,
      p.display_name,
      p.first_name,
      p.middle_name,
      p.surname,
      p.hometown,
      p.gender,
      p.birth_date,
      p.generation,
      COALESCE(p.clan_id, ac.clan_id) AS clan_id,
      p.bio,
      p.avatar_url,
      p.avatar_media_id,
      p.pending_bio,
      p.pending_avatar_url,
      p.pending_avatar_media_id,
      p.moderation_status,
      p.moderation_reason,
      c.clan_name,
      c.history AS clan_history,
      c.hall_address AS clan_hall_address
    FROM accounts a
    LEFT JOIN account_clans ac ON ac.account_id = a.id AND ac.status = 'active'
    LEFT JOIN people p ON p.id = COALESCE(a.person_id, ac.person_id)
    LEFT JOIN clans c ON c.id = COALESCE(p.clan_id, ac.clan_id)
    WHERE a.id = ?
    ORDER BY ac.id ASC
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [accountId]);
  return rows[0] || null;
};

const normalizePostStats = (post) => ({
  ...post,
  like_count: Number(post.like_count || 0),
  comment_count: Number(post.comment_count || 0),
  liked_by_me: post.liked_by_me === true || post.liked_by_me === 1 || post.liked_by_me === "1",
});

const getApprovedClanPost = async (postId, clanId) => {
  const numericPostId = Number(postId);
  if (!Number.isInteger(numericPostId) || numericPostId <= 0 || !clanId) return null;

  const [rows] = await db.query(
    "SELECT id, clan_id FROM posts WHERE id = ? AND clan_id = ? AND status = 'approved' LIMIT 1",
    [numericPostId, clanId]
  );
  return rows[0] || null;
};

const getOrCreateConversationId = async (accountId) => {
  const [existing] = await db.query(
    "SELECT id FROM conversations WHERE account_id = ? ORDER BY id ASC LIMIT 1",
    [accountId]
  );
  if (existing.length > 0) return existing[0].id;

  const [created] = await db.query(
    "INSERT INTO conversations (account_id, title) VALUES (?, ?)",
    [accountId, "Hội thoại gia phả"]
  );
  return created.insertId;
};

const saveChatMessage = async (conversationId, senderType, content) => {
  try {
    await db.query(
      "INSERT INTO messages (conversation_id, sender_type, content) VALUES (?, ?, ?)",
      [conversationId, senderType, content]
    );
  } catch (error) {
    console.error("saveChatMessage error:", error);
  }
};

const AI_CHAT_DISABLED_REPLY =
  "Trợ lý hỏi đáp gia phả đã được tắt. Hiện AI chỉ hỗ trợ lập kế hoạch sự kiện và sinh danh sách công việc.";


const parseNullableId = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const parseChildrenIds = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.map((v) => Number(v)).filter((v) => Number.isFinite(v)))];
  }
  if (typeof value === "string") {
    return [
      ...new Set(
        value
          .split(",")
          .map((v) => Number(v.trim()))
          .filter((v) => Number.isFinite(v))
      ),
    ];
  }
  return [];
};

const ensurePeopleExist = async (ids) => {
  if (!ids || ids.length === 0) return true;
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.query(`SELECT id FROM people WHERE id IN (${placeholders})`, ids);
  return rows.length === ids.length;
};

const getOwnedFamilyRelations = async (personId) => {
  if (!personId) {
    return { family_id: null, spouse_id: null, children_ids: [] };
  }

  const [familyRows] = await db.query(
    `
      SELECT id, father_id, mother_id
      FROM families
      WHERE father_id = ? OR mother_id = ?
      ORDER BY id ASC
      LIMIT 1
    `,
    [personId, personId]
  );

  const family = familyRows[0] || null;
  if (!family) {
    return { family_id: null, spouse_id: null, children_ids: [] };
  }

  const spouseId = family.father_id === personId ? family.mother_id : family.father_id;
  const [childrenRows] = await db.query(
    "SELECT person_id FROM children WHERE family_id = ? ORDER BY id ASC",
    [family.id]
  );

  return {
    family_id: family.id,
    spouse_id: spouseId || null,
    children_ids: childrenRows.map((r) => r.person_id),
  };
};

let hasEnsuredTaskTables = false;

const ensureManagerTaskEventLink = async () => {
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

const ensureTaskTables = async () => {
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
  hasEnsuredTaskTables = true;
};

const emitNotificationToAccount = async (req, receiverAccountId, payload) => {
  const io = req.app?.locals?.io;

  if (!io || !receiverAccountId) {
    return;
  }

  const realtimePayload = {
    id: payload.id || `member-${Date.now()}`,
    title: payload.title || "Thông báo mới",
    message: payload.message || "Bạn có cập nhật mới trong hệ thống.",
    link_url: payload.link_url || payload.linkUrl || "/manager/tasks",
    is_read: Number(payload.is_read ?? 0),
    created_at: payload.created_at || new Date().toISOString(),
    ...payload,
    time: new Date().toLocaleTimeString(),
  };

  io.to(`account_${receiverAccountId}`).emit("new_notification", realtimePayload);

  console.log(`✅ Đã gửi realtime notification tới account_${receiverAccountId}`);
};

const emitToClan = (req, clanId, eventName, payload) => {
  const io = req.app?.locals?.io;

  if (!io || !clanId) {
    return;
  }

  io.to(`clan_${clanId}`).emit(eventName, payload);

  console.log(`📡 Đã emit ${eventName} tới clan_${clanId}`);
};

const getClanManagerAccounts = async (clanId) => {
  if (!clanId) return [];

  const [rows] = await db.query(
    `
      SELECT DISTINCT a.id AS account_id
      FROM accounts a
      LEFT JOIN account_clans ac ON ac.account_id = a.id
      LEFT JOIN people p ON p.id = COALESCE(a.person_id, ac.person_id)
      WHERE a.role_id = 2
        AND a.status = 'active'
        AND COALESCE(p.clan_id, ac.clan_id) = ?
    `,
    [clanId]
  );

  return rows.map((row) => row.account_id).filter(Boolean);
};

const notifyManagersAboutPendingApproval = async (req, {
  clanId,
  relatedType,
  relatedId,
  title,
  message,
}) => {
  if (!clanId) return;

  const realtimePendingPayload = {
    type: relatedType,
    action: "created",
    id: Number(relatedId),
    clanId,
    at: new Date().toISOString(),
  };

  emitToClan(req, clanId, "pending_approval_changed", realtimePendingPayload);

  let managerAccountIds = [];

  try {
    managerAccountIds = await getClanManagerAccounts(clanId);
  } catch (error) {
    console.error("getClanManagerAccounts error:", error);
    return;
  }

  const io = req.app?.locals?.io;

  await Promise.all(
    managerAccountIds.map(async (managerAccountId) => {
      try {
        await ensureNotificationSchema();

        const [notificationResult] = await db.query(
          `
            INSERT INTO notifications
              (receiver_account_id, type, title, message, link_url)
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            managerAccountId,
            "pending_approval",
            title,
            message,
            "/manager/pending",
          ]
        );

        if (io) {
          io.to(`account_${managerAccountId}`).emit(
            "pending_approval_changed",
            realtimePendingPayload
          );
        }

        await emitNotificationToAccount(req, managerAccountId, {
          id: notificationResult.insertId,
          type: "pending_approval",
          title,
          message,
          link_url: "/manager/pending",
          is_read: 0,
          created_at: new Date().toISOString(),
          relatedType,
          relatedId: Number(relatedId),
        });
      } catch (error) {
        console.error("notify manager pending approval error:", error);

        if (io) {
          io.to(`account_${managerAccountId}`).emit(
            "pending_approval_changed",
            realtimePendingPayload
          );
        }
      }
    })
  );
}; 
/**
 * Cây gia phả: gốc = đời 1 (hoặc đời nhỏ nhất nếu không có đời 1).
 * Con cái: bảng children + families; ưu tiên nối con với cha (father_id), không có cha thì mẹ.
 */
const buildFamilyTree = (peopleRows, familyRows, childRows) => {
  const peopleMap = Object.fromEntries(peopleRows.map((p) => [p.id, p]));
  const childrenByFamily = new Map();
  for (const row of childRows) {
    if (!childrenByFamily.has(row.family_id)) childrenByFamily.set(row.family_id, []);
    childrenByFamily.get(row.family_id).push(row.person_id);
  }

  const childrenByParent = new Map();
  const spouseByPrimary = new Map();
  for (const fam of familyRows) {
    const kids = childrenByFamily.get(fam.id) || [];
    const parentId = fam.father_id || fam.mother_id;
    if (!parentId) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    const list = childrenByParent.get(parentId);
    for (const cid of kids) {
      if (!list.includes(cid)) list.push(cid);
    }
    if (kids.length > 0 && fam.father_id && fam.mother_id) {
      const spouseId = parentId === fam.father_id ? fam.mother_id : fam.father_id;
      if (!spouseByPrimary.has(parentId)) spouseByPrimary.set(parentId, spouseId);
    }
  }

  const sortRoots = (arr) =>
    [...arr].sort((a, b) => {
      const ak = (childrenByParent.get(a.id) || []).length;
      const bk = (childrenByParent.get(b.id) || []).length;
      if (ak > 0 && bk === 0) return -1;
      if (ak === 0 && bk > 0) return 1;
      return a.id - b.id;
    });

  let roots = sortRoots(peopleRows.filter((p) => Number(p.generation) === 1));
  if (roots.length === 0 && peopleRows.length > 0) {
    const gens = peopleRows.map((p) => Number(p.generation)).filter((g) => Number.isFinite(g) && g > 0);
    const minGen = gens.length ? Math.min(...gens) : 1;
    roots = sortRoots(peopleRows.filter((p) => Number(p.generation) === minGen));
  }

  const placed = new Set();

  const buildNode = (personId) => {
    const person = peopleMap[personId];
    if (!person) return null;
    if (placed.has(personId)) return null;
    placed.add(personId);
    const spouseId = spouseByPrimary.get(personId);
    let spouse = null;
    if (spouseId && peopleMap[spouseId] && !placed.has(spouseId)) {
      spouse = peopleMap[spouseId];
      placed.add(spouseId);
    }
    const rawChildIds = childrenByParent.get(personId) || [];
    const children = [];
    for (const cid of rawChildIds) {
      const childNode = buildNode(cid);
      if (childNode) children.push(childNode);
    }
    return { person, spouse, children };
  };

  const rootNodes = [];
  for (const r of roots) {
    if (placed.has(r.id)) continue;
    const node = buildNode(r.id);
    if (node) rootNodes.push(node);
  }

  return { roots: rootNodes };
};
/**
 * Cây gia phả + danh sách người cho một dòng họ (Admin).
 * Mỗi người có thể có `account_id` nếu đã liên kết tài khoản.
 */
exports.loadClanTreeForAdmin = async (clanId) => {
  const cid = Number(clanId);
  if (!Number.isFinite(cid)) return { error: "bad_id" };
  const [crows] = await db.query(
    "SELECT id, clan_name, history FROM clans WHERE id = ? LIMIT 1",
    [cid]
  );
  if (!crows.length) return { error: "not_found" };
  const clan = crows[0];
  await ensureFamilyRelationshipColumns();
  await ensureArchivedMembersTable();

  const [peopleRows] = await db.query(
    `
    SELECT p.id, p.display_name, p.first_name, p.middle_name, p.surname, p.generation, p.branch,
           p.hometown, p.address, p.birth_date, p.death_date, p.is_living, p.gender,
           p.phone, p.email,
           COALESCE(p.pending_avatar_url, p.avatar_url) AS avatar_url,
           COALESCE(p.pending_avatar_media_id, p.avatar_media_id) AS avatar_media_id,
           p.pending_avatar_url,
           p.pending_avatar_media_id,
           p.bio, p.note, p.tree_x, p.tree_y, p.display_order,
           a.id AS account_id,
           a.role_id
    FROM people p
    LEFT JOIN accounts a ON a.person_id = p.id
    ${ARCHIVED_MEMBER_JOIN_SQL}
    WHERE p.clan_id = ?
      ${ACTIVE_TREE_MEMBER_WHERE_SQL}
    ORDER BY p.generation, p.display_order, p.surname, p.first_name
  `,
    [cid]
  );

  const [familyRows] = await db.query(
    `SELECT id, clan_id, father_id, mother_id, marriage_date,
            relationship_status, ended_at, relation_note
     FROM families WHERE clan_id = ? ORDER BY id ASC`,
    [cid]
  );
  const [childRows] = await db.query(
    `
    SELECT c.family_id, c.person_id, c.sort_order
    FROM families f
    STRAIGHT_JOIN children c ON c.family_id = f.id
    WHERE f.clan_id = ?
    ORDER BY c.family_id, c.sort_order, c.id
  `,
    [cid]
  );

  const visibleTree = filterTreeRelationsForVisiblePeople(familyRows, childRows, peopleRows);
  const layoutSettings = await getTreeLayoutSettings(cid);
  const familyTree = buildFamilyTree(peopleRows, visibleTree.familyRows, visibleTree.childRows);
  return { 
    clan, 
    treeMembers: peopleRows.map(p => ({
      ...p,
      birth_date: fmtSqlDate(p.birth_date),
      death_date: fmtSqlDate(p.death_date),
    })), 
    families: visibleTree.familyRows.map(f => ({
      ...f,
      marriage_date: f.marriage_date ? String(f.marriage_date).slice(0, 10) : null,
      ended_at: f.ended_at ? String(f.ended_at).slice(0, 10) : null,
    })),
    children: visibleTree.childRows,
    layoutSettings,
    familyTree 
  };
};

exports.getDashboard = async (req, res) => {
  try {
    await ensureProfileCompletedColumn();
    await ensureTaskTables();
    const accountId = req.user.id;
    const context = await getAccountContext(accountId);
    if (!context) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
    }

    const clanId = context.clan_id;
    let treeMembers = [];
    let reminders = [];
    let assignedTasks = [];
    let notifications = [];
    let familyTree = { roots: [] };
    let families = [];
    let children = [];
    let layoutSettings = { line_routes: {}, card_sizes: {} };

    if (clanId) {
      await ensureFamilyRelationshipColumns();
      await ensureArchivedMembersTable();
      const [peopleRows] = await db.query(
        `
          SELECT p.id, p.display_name, p.first_name, p.middle_name, p.surname, p.generation, p.branch,
                 p.hometown, p.address, p.birth_date, p.death_date, p.is_living, p.gender,
                 p.phone, p.email,
                 COALESCE(p.pending_avatar_url, p.avatar_url) AS avatar_url,
                 COALESCE(p.pending_avatar_media_id, p.avatar_media_id) AS avatar_media_id,
                 p.pending_avatar_url,
                 p.pending_avatar_media_id,
                 p.bio, p.note, p.tree_x, p.tree_y, p.display_order,
                 a.id AS account_id,
                 a.role_id
          FROM people p
          LEFT JOIN accounts a ON a.person_id = p.id
          ${ARCHIVED_MEMBER_JOIN_SQL}
          WHERE p.clan_id = ?
            ${ACTIVE_TREE_MEMBER_WHERE_SQL}
          ORDER BY p.generation, p.display_order, p.surname, p.middle_name, p.first_name, p.id
        `,
        [clanId]
      );
      treeMembers = peopleRows.map((person) => ({
        ...person,
        birth_date: fmtSqlDate(person.birth_date),
        death_date: fmtSqlDate(person.death_date),
      }));

      const [familyRows] = await db.query(
        `SELECT id, clan_id, father_id, mother_id, marriage_date,
                relationship_status, ended_at, relation_note
         FROM families WHERE clan_id = ? ORDER BY id ASC`,
        [clanId]
      );
      const [childRows] = await db.query(
        `
          SELECT c.family_id, c.person_id, c.sort_order
          FROM families f
          STRAIGHT_JOIN children c ON c.family_id = f.id
          WHERE f.clan_id = ?
          ORDER BY c.family_id, c.sort_order, c.id
        `,
        [clanId]
      );
      const visibleTree = filterTreeRelationsForVisiblePeople(familyRows, childRows, peopleRows);
      families = visibleTree.familyRows.map((family) => ({
        ...family,
        marriage_date: family.marriage_date ? String(family.marriage_date).slice(0, 10) : null,
        ended_at: family.ended_at ? String(family.ended_at).slice(0, 10) : null,
      }));
      children = visibleTree.childRows;
      layoutSettings = await getTreeLayoutSettings(clanId);
      familyTree = buildFamilyTree(peopleRows, visibleTree.familyRows, visibleTree.childRows);

      const [eventRows] = await db.query(
        `
          SELECT id, title, event_date, description
          FROM events
          WHERE clan_id = ?
          ORDER BY event_date DESC, id DESC
          LIMIT 50
        `,
        [clanId]
      );
      reminders = eventRows;

      const [taskRows] = await db.query(
        `
          SELECT
            a.id,
            a.task_id,
            t.title,
            t.description,
            t.due_date,
            t.created_at,
            t.event_id,
            e.title AS event_title,
            e.event_date,
            e.description AS event_description,
            a.status,
            a.assigned_at,
            a.completed_at,
            COALESCE(pm.display_name, am.email, 'Manager') AS manager_name
          FROM manager_task_assignments a
          INNER JOIN manager_tasks t ON t.id = a.task_id
          LEFT JOIN events e ON e.id = t.event_id
          INNER JOIN accounts am ON am.id = t.manager_account_id
          LEFT JOIN people pm ON pm.id = am.person_id
          WHERE a.member_account_id = ?
          ORDER BY
            CASE a.status
              WHEN 'assigned' THEN 0
              WHEN 'in_progress' THEN 1
              WHEN 'completed' THEN 2
              ELSE 3
            END,
            t.created_at DESC,
            a.id DESC
        `,
        [accountId]
      );
      assignedTasks = taskRows;

      const [notificationRows] = await db.query(
        `
          SELECT id, type, title, message, is_read, link_url, created_at
          FROM notifications
          WHERE receiver_account_id = ?
             OR (
                  receiver_account_id IS NULL
                  AND receiver_person_id = ?
                )
          ORDER BY created_at DESC, id DESC
          LIMIT 50
        `,
        [accountId, context.person_id || 0]
      );
      notifications = notificationRows;
    }

    const discoverItems = [
      {
        title: context.clan_name || "Chưa liên kết dòng họ",
        desc: context.clan_name
          ? `Dòng họ hiện tại có ${treeMembers.length} thành viên.`
          : "Tài khoản của bạn chưa liên kết dòng họ.",
        tag: "Dòng họ",
      },
      ...treeMembers.map((m) => ({
        title: m.display_name || [m.surname, m.middle_name, m.first_name].filter(Boolean).join(" "),
        desc: `Đời thứ ${m.generation || "—"} • ${m.hometown || "Chưa cập nhật"}`,
        tag: "Thành viên",
      })),
    ];

    const relations = await getOwnedFamilyRelations(context.person_id);

    return res.json({
      success: true,
      profile: {
        account_id: context.account_id,
        person_id: context.person_id,
        role_id: context.role_id,
        status: context.status,
        profile_completed: Number(context.profile_completed || 0),
        email: context.account_email,
        display_name: context.display_name,
        first_name: context.first_name,
        middle_name: context.middle_name,
        surname: context.surname,
        hometown: context.hometown,
        gender: context.gender,
        birth_date: context.birth_date,
        generation: context.generation,
        bio: context.bio,
        avatar_url: context.avatar_url,
        avatar_media_id: context.avatar_media_id,
        pending_bio: context.pending_bio,
        pending_avatar_url: context.pending_avatar_url,
        pending_avatar_media_id: context.pending_avatar_media_id,
        moderation_status: context.moderation_status,
        moderation_reason: context.moderation_reason,
        family_id: relations.family_id,
        spouse_id: relations.spouse_id,
        children_ids: relations.children_ids,
      },
      clan: {
        clan_id: context.clan_id,
        clan_name: context.clan_name,
        history: context.clan_history,
        hall_address: context.clan_hall_address,
      },
      treeMembers,
      families,
      children,
      layoutSettings,
      familyTree,
      discoverItems,
      reminders,
      assignedTasks,
      notifications,
    });
  } catch (error) {
    console.error("getDashboard error:", error);
    return res.status(500).json({ success: false, message: "Lỗi lấy dữ liệu trang thành viên" });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const context = await getAccountContext(req.user.id);
    const [rows] = await db.query(
      `
        SELECT id, type, title, message, is_read, link_url, created_at
        FROM notifications
        WHERE receiver_account_id = ?
           OR (
                receiver_account_id IS NULL
                AND receiver_person_id = ?
              )
        ORDER BY created_at DESC, id DESC
        LIMIT 50
      `,
      [req.user.id, context?.person_id || 0]
    );

    const unreadCount = rows.filter((row) => Number(row.is_read) === 0).length;
    return res.json({ success: true, notifications: rows, unread_count: unreadCount });
  } catch (error) {
    console.error("getNotifications error:", error);
    return res.status(500).json({ success: false, message: "Khong the tai thong bao" });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ success: false, message: "ID thong bao khong hop le" });
    }

    const context = await getAccountContext(req.user.id);

    await db.query(
      `
        UPDATE notifications
        SET is_read = 1
        WHERE id = ?
          AND (
            receiver_account_id = ?
            OR (
              receiver_account_id IS NULL
              AND receiver_person_id = ?
            )
          )
      `,
      [notificationId, req.user.id, context?.person_id || 0]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("markNotificationRead error:", error);
    return res.status(500).json({ success: false, message: "Khong the cap nhat thong bao" });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const context = await getAccountContext(req.user.id);

    const [result] = await db.query(
      `
        UPDATE notifications
        SET is_read = 1
        WHERE receiver_account_id = ?
           OR (
                receiver_account_id IS NULL
                AND receiver_person_id = ?
              )
      `,
      [req.user.id, context?.person_id || 0]
    );

    return res.json({ success: true, updated: result.affectedRows || 0 });
  } catch (error) {
    console.error("markAllNotificationsRead error:", error);
    return res.status(500).json({ success: false, message: "Khong the cap nhat thong bao" });
  }
};

exports.verifyTreeEditSession = async (req, res) => {
  try {
    const rawKey = String(req.body?.key || req.headers?.["x-tree-edit-key"] || "").trim();

    if (!rawKey) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập temporary edit key." });
    }

    const shouldActivate = req.body?.activate !== false;
    const session = shouldActivate
      ? await activateTreeEditSessionForAccount(req.user.id, rawKey)
      : await getTreeEditSessionForAccount(req.user.id, rawKey);
    if (!session) {
      return res.status(403).json({ success: false, message: "Temporary edit key không hợp lệ hoặc đã hết hạn." });
    }

    return res.json({
      success: true,
      can_edit: true,
      edit_scope: "limited",
      allowed_node_ids: session.allowedNodeIds,
      member_generation: session.memberGeneration,
      allowed_generations: session.allowedGenerations,
      expires_at: session.expiresAt,
      expires_in_ms: session.expiresInMs,
      message: "Temporary edit key hợp lệ.",
    });
  } catch (error) {
    console.error("verifyTreeEditSession error:", error);
    return res.status(500).json({ success: false, message: "Lỗi xác thực temporary edit key." });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    await ensureProfileCompletedColumn();
    const accountId = req.user.id;
    const { surname, middle_name, first_name, email, hometown, generation, family_id, spouse_id, children_ids } =
      req.body;
    const hasFamilyField = Object.prototype.hasOwnProperty.call(req.body, "family_id");
    const hasSpouseField = Object.prototype.hasOwnProperty.call(req.body, "spouse_id");
    const hasChildrenField = Object.prototype.hasOwnProperty.call(req.body, "children_ids");
    const context = await getAccountContext(accountId);
    if (!context) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
    }
    if (!context.person_id) {
      return res.status(400).json({ success: false, message: "Tài khoản chưa liên kết person" });
    }

    if ((hasFamilyField || hasSpouseField || hasChildrenField) && String(req.user?.role_name || "") === "member") {
      return res.status(403).json({
        success: false,
        message: "Quan hệ gia đình không được chỉnh sửa từ hồ sơ thành viên. Hãy dùng temporary edit key tại trang cây gia phả hoặc liên hệ manager.",
      });
    }

    const familyIdInput = parseNullableId(family_id);
    const spouseId = parseNullableId(spouse_id);
    const childrenIds = parseChildrenIds(children_ids);
    const generationNumber =
      generation === undefined || generation === null || String(generation).trim() === ""
        ? null
        : Number(generation);

    const relationIdsToValidate = [spouseId, ...childrenIds].filter((v) => v !== null);
    const allRelationsOk = await ensurePeopleExist(relationIdsToValidate);
    if (!allRelationsOk) {
      return res.status(400).json({ success: false, message: "Một hoặc nhiều ID quan hệ không tồn tại trong bảng people" });
    }

    if (email && String(email).trim() !== String(context.account_email || "").trim()) {
      const [dupEmail] = await db.query("SELECT id FROM accounts WHERE email = ? AND id <> ?", [
        String(email).trim(),
        accountId,
      ]);
      if (dupEmail.length > 0) {
        return res.status(400).json({ success: false, message: "Email đã được tài khoản khác sử dụng" });
      }
      await db.query("UPDATE accounts SET email = ? WHERE id = ?", [String(email).trim(), accountId]);
    }

    const nextSurname = surname !== undefined && surname !== null ? String(surname).trim() : (context.surname || "") || "";
    const nextMiddle =
      middle_name !== undefined && middle_name !== null ? String(middle_name).trim() : (context.middle_name || "") || "";
    const nextFirst =
      first_name !== undefined && first_name !== null ? String(first_name).trim() : (context.first_name || "") || "";
    const nextDisplay =
      buildDisplayNameFromParts(nextSurname, nextMiddle, nextFirst) || (context.display_name || "").trim() || "";

    await db.query(
      "UPDATE people SET surname = ?, middle_name = ?, first_name = ?, display_name = ?, hometown = ?, generation = ? WHERE id = ?",
      [
        nextSurname,
        nextMiddle,
        nextFirst,
        nextDisplay,
        hometown !== undefined && hometown !== null ? String(hometown).trim() : context.hometown || "",
        Number.isFinite(generationNumber) ? generationNumber : context.generation || 1,
        context.person_id,
      ]
    );
        const [selfFamilyRows] = await db.query(
      "SELECT id FROM families WHERE father_id = ? OR mother_id = ? ORDER BY id ASC LIMIT 1",
      [context.person_id, context.person_id]
    );
    let selfFamilyId = selfFamilyRows[0]?.id || null;
    const isMale = Number(context.gender) === 1;

    if (hasFamilyField && familyIdInput !== null) {
      const [existingFamily] = await db.query(
        "SELECT id, father_id, mother_id, clan_id FROM families WHERE id = ? LIMIT 1",
        [familyIdInput]
      );
      if (existingFamily.length === 0) {
        if (!context.clan_id) {
          return res.status(400).json({
            success: false,
            message: "Tài khoản chưa liên kết dòng họ nên không thể tạo families mới",
          });
        }
        await db.query(
          "INSERT INTO families (id, clan_id, father_id, mother_id) VALUES (?, ?, ?, ?)",
          [familyIdInput, context.clan_id, isMale ? context.person_id : spouseId, isMale ? spouseId : context.person_id]
        );
        selfFamilyId = familyIdInput;
      } else {
        const fam = existingFamily[0];
        if (fam.father_id !== context.person_id && fam.mother_id !== context.person_id) {
          return res.status(403).json({
            success: false,
            message: "Family ID đã tồn tại nhưng tài khoản hiện tại không phải bố/mẹ của family này",
          });
        }
        selfFamilyId = fam.id;
      }
    }

    const needsNewOrUpdateFamilyRow =
      hasSpouseField || (hasChildrenField && childrenIds.length > 0);
    if (needsNewOrUpdateFamilyRow) {
      if (!selfFamilyId) {
        if (!context.clan_id) {
          return res.status(400).json({
            success: false,
            message: "Tài khoản chưa liên kết dòng họ nên chưa thể khai báo quan hệ vợ/chồng/con",
          });
        }
        const [createdFamily] = await db.query(
          "INSERT INTO families (clan_id, father_id, mother_id) VALUES (?, ?, ?)",
          [context.clan_id, isMale ? context.person_id : spouseId, isMale ? spouseId : context.person_id]
        );
        selfFamilyId = createdFamily.insertId;
      } else {
        await db.query("UPDATE families SET father_id = ?, mother_id = ? WHERE id = ?", [
          isMale ? context.person_id : spouseId,
          isMale ? spouseId : context.person_id,
          selfFamilyId,
        ]);
      }
    }

    if (selfFamilyId && hasChildrenField) {
      await db.query("DELETE FROM children WHERE family_id = ?", [selfFamilyId]);
      for (const childId of childrenIds) {
        await db.query("INSERT INTO children (family_id, person_id, sort_order) VALUES (?, ?, 0)", [
          selfFamilyId,
          childId,
        ]);
      }
    }

    const fresh = await getAccountContext(accountId);
    const relations = await getOwnedFamilyRelations(fresh.person_id);
    return res.json({
      success: true,
      message: "Cập nhật thông tin thành công",
      profile: {
        account_id: fresh.account_id,
        person_id: fresh.person_id,
        role_id: fresh.role_id,
        status: fresh.status,
        profile_completed: Number(fresh.profile_completed || 0),
        email: fresh.account_email,
        display_name: fresh.display_name,
        surname: fresh.surname,
        middle_name: fresh.middle_name,
        first_name: fresh.first_name,
        hometown: fresh.hometown,
        generation: fresh.generation,
        family_id: relations.family_id,
        spouse_id: relations.spouse_id,
        children_ids: relations.children_ids,
      },
    });
  } catch (error) {
    console.error("updateProfile error:", error);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật thông tin" });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const accountId = req.user.id;
    const { current_password, new_password } = req.body;
    const cur = String(current_password ?? "");
    const next = String(new_password ?? "").trim();

    if (!next || next.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới phải có ít nhất 6 ký tự",
      });
    }
    if (cur === "") {
      return res.status(400).json({ success: false, message: "Vui lòng nhập mật khẩu hiện tại" });
    }

    const [rows] = await db.query("SELECT password FROM accounts WHERE id = ? LIMIT 1", [accountId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
    }

    const stored = rows[0].password;
    let match = false;
    try {
      match = await bcrypt.compare(cur, stored);
    } catch {
      match = false;
    }
    if (!match && stored === cur) {
      match = true;
    }

    if (!match) {
      return res.status(401).json({ success: false, message: "Mật khẩu hiện tại không đúng" });
    }

    const hashed = await bcrypt.hash(next, 10);
    await db.query("UPDATE accounts SET password = ? WHERE id = ?", [hashed, accountId]);

    return res.json({ success: true, message: "Đã đổi mật khẩu thành công" });
  } catch (error) {
    console.error("changePassword error:", error);
    return res.status(500).json({ success: false, message: "Lỗi đổi mật khẩu" });
  }
};

exports.getChatMessages = async (req, res) => {
  try {
    const accountId = req.user.id;
    const conversationId = await getOrCreateConversationId(accountId);
    const [rows] = await db.query(
      `
      SELECT id, sender_type, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY id ASC
      `,
      [conversationId]
    );
    return res.json({ success: true, conversation_id: conversationId, messages: rows });
  } catch (error) {
    console.error("getChatMessages error:", error);
    return res.status(500).json({ success: false, message: "Lỗi lấy lịch sử chat" });
  }
};

exports.sendChatMessage = async (req, res) => {
  try {
    const accountId = req.user.id;
    const { message } = req.body;
    const text = String(message || "").trim();
    if (!text) {
      return res.status(400).json({ success: false, message: "Tin nhắn không được để trống" });
    }

    const ctx = await getAccountContext(accountId);
    if (!ctx) {
      return res.status(401).json({ success: false, message: "Phien dang nhap khong hop le. Vui long dang nhap lai." });
    }

    const conversationId = await getOrCreateConversationId(accountId);
    await saveChatMessage(conversationId, "user", text);
    if (!ctx.clan_id) {
      const aiReply = "Tài khoản của bạn chưa được gắn vào dòng họ (clan). Vui lòng liên hệ quản lý để được cấp quyền truy cập cây gia phả.";
      await saveChatMessage(conversationId, "ai", aiReply);
      return res.json({
        success: true,
        conversation_id: conversationId,
        user_message: text,
        ai_message: aiReply,
        answer: aiReply,
        intent: "NO_CLAN",
        confidence: 1,
        user: {
          account_id: ctx.account_id,
          person_id: ctx.person_id,
          clan_id: null,
          display_name: ctx.display_name,
          role: req.user?.role_name || getRoleName(ctx.role_id),
        },
        data: null,
      });
    }

    const aiReply = AI_CHAT_DISABLED_REPLY;
    await saveChatMessage(conversationId, "ai", aiReply);

    return res.json({
      success: true,
      conversation_id: conversationId,
      user_message: text,
      ai_message: aiReply,
      answer: aiReply,
      intent: "AI_EVENT_ONLY",
      confidence: 1,
      user: {
        account_id: ctx.account_id,
        person_id: ctx.person_id,
        clan_id: ctx.clan_id,
        display_name: ctx.display_name,
        role: req.user?.role_name || getRoleName(ctx.role_id),
      },
      data: null,
    });
  } catch (error) {
    console.error("sendChatMessage error:", error);
    return res.status(500).json({ success: false, message: "Lỗi gửi tin nhắn" });
  }
};

exports.createReminder = async (req, res) => {
  try {
    const accountId = req.user.id;
    const { title, date, note } = req.body;
    if (!title || !date) {
      return res.status(400).json({ success: false, message: "Thiếu tiêu đề hoặc ngày sự kiện" });
    }

    const context = await getAccountContext(accountId);
    if (!context || !context.clan_id) {
      return res
        .status(400)
        .json({ success: false, message: "Tài khoản chưa liên kết dòng họ, không thể tạo reminder" });
    }

    const [created] = await db.query(
      "INSERT INTO events (clan_id, title, event_date, description) VALUES (?, ?, ?, ?)",
      [context.clan_id, String(title).trim(), date, note || ""]
    );

    return res.json({
      success: true,
      message: "Tạo nhắc nhở thành công",
      reminder: {
        id: created.insertId,
        title: String(title).trim(),
        event_date: date,
        description: note || "",
      },
    });
  } catch (error) {
    console.error("createReminder error:", error);
    return res.status(500).json({ success: false, message: "Lỗi tạo reminder" });
  }
};

exports.proposeProfileUpdate = async (req, res) => {
  try {
    const accountId = req.user.id;
    const { bio, avatar_url, avatar_media_id } = req.body;

    const context = await getAccountContext(accountId);
    if (!context || !context.person_id) {
      return res.status(400).json({
        success: false,
        message: "Tài khoản chưa liên kết hồ sơ",
      });
    }

    const pendingBio = bio !== undefined && bio !== null ? String(bio).trim() : null;
    const pendingAvatarUrl =
      avatar_url !== undefined && avatar_url !== null ? String(avatar_url).trim() : null;
    const pendingAvatarMediaId =
      normalizeMediaId(avatar_media_id) || extractMediaIdFromUrl(pendingAvatarUrl);

    if (pendingBio === null && pendingAvatarUrl === null && pendingAvatarMediaId === null) {
      return res.status(400).json({
        success: false,
        message: "Không có dữ liệu cập nhật",
      });
    }

    const roleId = Number(req.user?.role_id || context.role_id);

    if (roleId === 1 || roleId === 2) {
      await db.query(
        `UPDATE people
         SET bio = COALESCE(?, bio),
             avatar_url = COALESCE(?, avatar_url),
             avatar_media_id = COALESCE(?, avatar_media_id),
             pending_bio = NULL,
             pending_avatar_url = NULL,
             pending_avatar_media_id = NULL,
             moderation_status = 'none',
             moderation_reason = NULL
         WHERE id = ?`,
        [pendingBio, pendingAvatarUrl, pendingAvatarMediaId, context.person_id]
      );

      return res.json({
        success: true,
        message: "Đã cập nhật hồ sơ thành công.",
      });
    }

    await db.query(
      `UPDATE people
       SET pending_bio = ?,
           pending_avatar_url = ?,
           pending_avatar_media_id = ?,
           moderation_status = 'pending',
           moderation_reason = NULL
       WHERE id = ?`,
      [pendingBio, pendingAvatarUrl, pendingAvatarMediaId, context.person_id]
    );

    await notifyManagersAboutPendingApproval(req, {
      clanId: context.clan_id,
      relatedType: "profile",
      relatedId: context.person_id,
      title: "Có hồ sơ chờ duyệt",
      message: `${context.display_name || "Một thành viên"} vừa gửi yêu cầu cập nhật hồ sơ.`,
    });

    return res.json({
      success: true,
      message: "Đã gửi yêu cầu cập nhật, vui lòng đợi quản lý phê duyệt.",
    });
  } catch (error) {
    console.error("proposeProfileUpdate error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi gửi yêu cầu cập nhật hồ sơ",
    });
  }
};

exports.submitMaterial = async (req, res) => {
  try {
    const accountId = req.user.id;
    const { description, content, image_url, image_media_id } = req.body;

    const context = await getAccountContext(accountId);
    if (!context || !context.clan_id) {
       return res.status(400).json({ success: false, message: "Tài khoản chưa đủ điều kiện đóng góp tư liệu" });
    }

    const postDescription = description !== undefined && description !== null ? String(description).trim() : "";
    const textContent = content !== undefined && content !== null ? String(content).trim() : "";
    const imgUrl = image_url !== undefined && image_url !== null ? String(image_url).trim() : null;
    const imgMediaId = normalizeMediaId(image_media_id) || extractMediaIdFromUrl(imgUrl);

    if (!postDescription && !textContent && !imgUrl && !imgMediaId) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập mô tả, nội dung hoặc URL ảnh" });
    }

    const roleId = Number(req.user?.role_id || context.role_id);
    const postStatus = roleId === 1 || roleId === 2 ? "approved" : "pending";

    const [created] = await db.query(
      "INSERT INTO posts (clan_id, author_id, description, content, image_url, image_media_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [context.clan_id, accountId, postDescription, textContent, imgUrl, imgMediaId, postStatus]
    );
    
    if (postStatus === "approved") {
      const io = req.app?.locals?.io;

      if (io) {
        io.to(`clan_${context.clan_id}`).emit("post_feed_updated", {
          action: "post_created",
          post_id: created.insertId,
          clan_id: context.clan_id,
          actor_account_id: accountId,
          updated_at: new Date().toISOString(),
        });

        console.log(`📰 Đã emit post_feed_updated post_created tới clan_${context.clan_id}`);
      }
    } else {
      await notifyManagersAboutPendingApproval(req, {
        clanId: context.clan_id,
        relatedType: "post",
        relatedId: created.insertId,
        title: "Có bài viết chờ duyệt",
        message: `${context.display_name || "Một thành viên"} vừa gửi bài viết mới cần duyệt.`,
      });
}

    return res.json({
      success: true,
      post_id: created.insertId,
      status: postStatus,
      message:
        postStatus === "approved"
          ? "Đã đăng bài viết thành công."
          : "Đã gửi tư liệu, vui lòng đợi quản lý phê duyệt.",
    });
  } catch(error) {
    console.error("submitMaterial error:", error);
    return res.status(500).json({ success: false, message: "Lỗi gửi tư liệu" });
  }
};
exports.getGeneralPosts = async (req, res) => {
  try {
    const accountId = req.user.id;
    const context = await getAccountContext(accountId);
    if (!context || !context.clan_id) {
      return res.status(400).json({ success: false, message: "Tài khoản chưa thuộc dòng họ nào." });
    }

    const [rows] = await db.query(
      `SELECT p.id, p.description, p.content, p.image_url, p.image_media_id, p.created_at, 
              COALESCE(author.display_name, a.email, 'Thành viên') as author_name,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
              (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
              EXISTS(
                SELECT 1
                FROM post_likes mine
                WHERE mine.post_id = p.id AND mine.person_id = ?
              ) AS liked_by_me
       FROM posts p
       JOIN accounts a ON p.author_id = a.id
       LEFT JOIN people author ON a.person_id = author.id
       WHERE p.clan_id = ? AND p.status = 'approved'
       ORDER BY p.created_at DESC`,
      [context.person_id || 0, context.clan_id]
    );
    return res.json({ success: true, posts: rows.map(normalizePostStats) });
  } catch (error) {
    console.error("getGeneralPosts error:", error);
    return res.status(500).json({ success: false, message: "Lỗi lấy danh sách bài viết." });
  }
};

exports.getPostComments = async (req, res) => {
  try {
    const accountId = req.user.id;
    const context = await getAccountContext(accountId);
    if (!context || !context.clan_id) {
      return res.status(400).json({ success: false, message: "Tài khoản chưa thuộc dòng họ nào." });
    }

    const post = await getApprovedClanPost(req.params.id, context.clan_id);
    if (!post) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài viết." });
    }

    const [comments] = await db.query(
      `SELECT pc.id, pc.post_id, pc.person_id, pc.parent_id, pc.content, pc.created_at,
              COALESCE(author.display_name, 'Thành viên') AS author_name
       FROM post_comments pc
       JOIN people author ON pc.person_id = author.id
       WHERE pc.post_id = ?
       ORDER BY COALESCE(pc.parent_id, pc.id), pc.created_at ASC`,
      [post.id]
    );

    return res.json({ success: true, comments });
  } catch (error) {
    console.error("getPostComments error:", error);
    return res.status(500).json({ success: false, message: "Lỗi lấy bình luận bài viết." });
  }
};

exports.addPostComment = async (req, res) => {
  try {
    const accountId = req.user.id;
    const context = await getAccountContext(accountId);
    if (!context || !context.clan_id || !context.person_id) {
      return res.status(400).json({ success: false, message: "Tài khoản chưa liên kết hồ sơ thành viên." });
    }

    const post = await getApprovedClanPost(req.params.id, context.clan_id);
    if (!post) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài viết." });
    }

    const commentContent = req.body?.content !== undefined && req.body?.content !== null ? String(req.body.content).trim() : "";
    const parentId = req.body?.parent_id ? Number(req.body.parent_id) : null;
    if (!commentContent) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập bình luận." });
    }

    if (parentId) {
      const [parentRows] = await db.query("SELECT id FROM post_comments WHERE id = ? AND post_id = ? LIMIT 1", [parentId, post.id]);
      if (!parentRows.length) {
        return res.status(400).json({ success: false, message: "Bình luận gốc không hợp lệ." });
      }
    }

    const [created] = await db.query(
      "INSERT INTO post_comments (post_id, person_id, parent_id, content) VALUES (?, ?, ?, ?)",
      [post.id, context.person_id, parentId || null, commentContent]
    );

    const [rows] = await db.query(
      `SELECT pc.id, pc.post_id, pc.person_id, pc.parent_id, pc.content, pc.created_at,
              COALESCE(author.display_name, 'Thành viên') AS author_name
       FROM post_comments pc
       JOIN people author ON pc.person_id = author.id
       WHERE pc.id = ?`,
      [created.insertId]
    );

    const io = req.app?.locals?.io;

if (io) {
  io.to(`clan_${context.clan_id}`).emit("post_feed_updated", {
    action: "comment_added",
    post_id: post.id,
    comment_id: created.insertId,
    clan_id: context.clan_id,
    actor_account_id: accountId,
    updated_at: new Date().toISOString(),
  });

  console.log(`💬 Đã emit post_feed_updated comment_added tới clan_${context.clan_id}`);
}

    return res.status(201).json({ success: true, comment: rows[0] });
  } catch (error) {
    console.error("addPostComment error:", error);
    return res.status(500).json({ success: false, message: "Lỗi thêm bình luận." });
  }
};

exports.togglePostLike = async (req, res) => {
  try {
    const accountId = req.user.id;
    const context = await getAccountContext(accountId);
    if (!context || !context.clan_id || !context.person_id) {
      return res.status(400).json({ success: false, message: "Tài khoản chưa liên kết hồ sơ thành viên." });
    }

    const post = await getApprovedClanPost(req.params.id, context.clan_id);
    if (!post) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài viết." });
    }

    const [existing] = await db.query(
      "SELECT id FROM post_likes WHERE post_id = ? AND person_id = ? LIMIT 1",
      [post.id, context.person_id]
    );

    let liked = false;
    if (existing.length) {
      await db.query("DELETE FROM post_likes WHERE id = ?", [existing[0].id]);
    } else {
      await db.query("INSERT INTO post_likes (post_id, person_id) VALUES (?, ?)", [post.id, context.person_id]);
      liked = true;
    }

    const [countRows] = await db.query("SELECT COUNT(*) AS like_count FROM post_likes WHERE post_id = ?", [post.id]);
    const likeCount = Number(countRows[0]?.like_count || 0);

const io = req.app?.locals?.io;

if (io) {
  io.to(`clan_${context.clan_id}`).emit("post_feed_updated", {
    action: "like_updated",
    post_id: post.id,
    clan_id: context.clan_id,
    actor_account_id: accountId,
    liked,
    like_count: likeCount,
    updated_at: new Date().toISOString(),
  });

  console.log(`❤️ Đã emit post_feed_updated like_updated tới clan_${context.clan_id}`);
}
return res.json({ success: true, liked, like_count: likeCount });
  } catch (error) {
    console.error("togglePostLike error:", error);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật lượt thích." });
  }
};

exports.getMySubmissions = async (req, res) => {
  try {
    const accountId = req.user.id;
    const context = await getAccountContext(accountId);
    
    const [posts] = await db.query(
      "SELECT description, content, image_url, image_media_id, status, rejection_reason, created_at FROM posts WHERE author_id = ? ORDER BY created_at DESC",
      [accountId]
    );

    const profileStatus = {
      moderation_status: context.moderation_status,
      moderation_reason: context.moderation_reason,
      pending_bio: context.pending_bio,
      pending_avatar_url: context.pending_avatar_url,
      pending_avatar_media_id: context.pending_avatar_media_id
    };

    return res.json({ success: true, posts, profile: profileStatus });
  } catch (error) {
    console.error("getMySubmissions error:", error);
    return res.status(500).json({ success: false, message: "Lỗi lấy trạng thái đóng góp." });
  }
};

exports.getAssignedTasks = async (req, res) => {
  try {
    await ensureTaskTables();
    const accountId = req.user.id;
    const [rows] = await db.query(
      `
        SELECT
          a.id,
          a.task_id,
          t.title,
          t.description,
          t.due_date,
          t.created_at,
          t.event_id,
          e.title AS event_title,
          e.event_date,
          e.description AS event_description,
          a.status,
          a.assigned_at,
          a.completed_at,
          COALESCE(pm.display_name, am.email, 'Manager') AS manager_name
        FROM manager_task_assignments a
        INNER JOIN manager_tasks t ON t.id = a.task_id
        LEFT JOIN events e ON e.id = t.event_id
        INNER JOIN accounts am ON am.id = t.manager_account_id
        LEFT JOIN people pm ON pm.id = am.person_id
        WHERE a.member_account_id = ?
        ORDER BY
          CASE a.status
            WHEN 'assigned' THEN 0
            WHEN 'in_progress' THEN 1
            WHEN 'completed' THEN 2
            ELSE 3
          END,
          t.created_at DESC,
          a.id DESC
      `,
      [accountId]
    );
    return res.json({ success: true, tasks: rows });
  } catch (error) {
    console.error("getAssignedTasks(member) error:", error);
    return res.status(500).json({ success: false, message: "Lỗi lấy công việc được giao" });
  }
};

exports.getAssignedEvents = async (req, res) => {
  try {
    const accountId = req.user.id;
    const context = await getAccountContext(accountId);
    if (!context || !context.clan_id) {
      return res.json({ success: true, events: [] });
    }

    const sql = `
      SELECT
        e.id,
        e.clan_id,
        e.title,
        e.event_date,
        COALESCE(e.start_date, e.event_date) AS start_date,
        COALESCE(e.end_date, e.start_date, e.event_date) AS end_date,
        CASE
            WHEN COALESCE(e.end_date, e.start_date, e.event_date) < CURDATE() THEN 'ended'
            WHEN COALESCE(e.start_date, e.event_date) <= CURDATE()
              AND COALESCE(e.end_date, e.start_date, e.event_date) >= CURDATE() THEN 'ongoing'
            ELSE 'upcoming'
        END AS status,
        e.description,
        (
          SELECT COUNT(*)
          FROM manager_tasks mt
          INNER JOIN manager_task_assignments mta ON mta.task_id = mt.id
          WHERE mt.event_id = e.id AND mta.member_account_id = ?
        ) AS my_task_count,
        (
          SELECT COUNT(*)
          FROM manager_tasks mt
          INNER JOIN manager_task_assignments mta ON mta.task_id = mt.id
          WHERE mt.event_id = e.id AND mta.member_account_id = ? AND mta.status = 'completed'
        ) AS my_completed_task_count
      FROM events e
      WHERE e.clan_id = ?
      HAVING status IN ('ongoing', 'upcoming')
      ORDER BY COALESCE(e.start_date, e.event_date) ASC, e.id ASC
    `;

    const [rows] = await db.query(sql, [accountId, accountId, context.clan_id]);
    return res.json({ success: true, events: rows });
  } catch (error) {
    console.error("getAssignedEvents error:", error);
    return res.status(500).json({ success: false, message: "Lỗi lấy danh sách sự kiện" });
  }
};


exports.updateTaskStatus = async (req, res) => {
  try {
    await ensureTaskTables();
    const assignmentId = Number(req.params.id);
    const nextStatus = String(req.body.status || "").trim();
    if (!Number.isFinite(assignmentId)) {
      return res.status(400).json({ success: false, message: "ID công việc không hợp lệ" });
    }
    if (!["in_progress", "completed"].includes(nextStatus)) {
      return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
    }

    const [rows] = await db.query(
      `
        SELECT
          a.id,
          a.status,
          a.member_account_id,
          a.member_person_id,
          t.id AS task_id,
          t.title,
          t.manager_account_id
        FROM manager_task_assignments a
        INNER JOIN manager_tasks t ON t.id = a.task_id
        WHERE a.id = ? AND a.member_account_id = ?
        LIMIT 1
      `,
      [assignmentId, req.user.id]
    );
    const task = rows[0];
    if (!task) {
      return res.status(404).json({ success: false, message: "Không tìm thấy công việc được giao" });
    }
    if (task.status === "completed") {
      return res.json({ success: true, message: "Công việc này đã hoàn thành trước đó" });
    }

    await db.query(
      `
        UPDATE manager_task_assignments
        SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE id = ?
      `,
      [nextStatus, nextStatus, assignmentId]
    );

    const memberContext = await getAccountContext(req.user.id);
const memberName =
  memberContext?.display_name ||
  [memberContext?.surname, memberContext?.middle_name, memberContext?.first_name].filter(Boolean).join(" ") ||
  `Thanh vien #${task.member_account_id}`;

const io = req.app?.locals?.io;

if (io) {
  io.to(`account_${task.manager_account_id}`).emit("task_status_updated", {
    task_id: task.task_id,
    assignment_id: assignmentId,
    status: nextStatus,
    completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
    member_account_id: task.member_account_id,
    member_name: memberName,
  });

  console.log(`✅ Đã emit task_status_updated "${nextStatus}" tới account_${task.manager_account_id}`);
}

if (nextStatus === "completed") {
  const managerContext = await getAccountContext(task.manager_account_id);

  if (managerContext?.account_id) {
    const notificationTitle = "Công việc đã hoàn thành";
    const notificationMessage = `${memberName} đã hoàn thành công việc: "${task.title}"`;
    const notificationLink = `/manager/tasks/${task.task_id}`;

    const [notificationResult] = await db.query(
      "INSERT INTO notifications (receiver_account_id, type, title, message, link_url) VALUES (?, ?, ?, ?, ?)",
      [
        task.manager_account_id,
        "task_completed",
        notificationTitle,
        notificationMessage,
        notificationLink,
      ]
    );

    await emitNotificationToAccount(req, task.manager_account_id, {
      id: notificationResult.insertId,
      type: "task_completed",
      title: notificationTitle,
      message: notificationMessage,
      link_url: notificationLink,
      is_read: 0,
      created_at: new Date().toISOString(),
      taskId: task.task_id,
    });
  }
}


    if (nextStatus === "completed") {
      const managerContext = await getAccountContext(task.manager_account_id);
      const memberContext = await getAccountContext(req.user.id);
      if (managerContext?.account_id) {
        const memberName =
          memberContext?.display_name ||
          [memberContext?.surname, memberContext?.middle_name, memberContext?.first_name].filter(Boolean).join(" ") ||
          `Thanh vien #${task.member_account_id}`;

        const notificationTitle = "Công việc đã hoàn thành";
        const notificationMessage = `${memberName} đã hoàn thành công việc: "${task.title}"`;
        const notificationLink = `/manager/tasks/${task.task_id}`;

        const [notificationResult] = await db.query(
          "INSERT INTO notifications (receiver_account_id, type, title, message, link_url) VALUES (?, ?, ?, ?, ?)",
          [
            task.manager_account_id,
            "task_completed",
            notificationTitle,
            notificationMessage,
            notificationLink,
          ]
        );

        await emitNotificationToAccount(req, task.manager_account_id, {
          id: notificationResult.insertId,
          type: "task_completed",
          title: notificationTitle,
          message: notificationMessage,
          link_url: notificationLink,
          is_read: 0,
          created_at: new Date().toISOString(),
          taskId: task.task_id,
        }); 
        const io = req.app?.locals?.io;

        if (io) {
          io.to(`account_${task.manager_account_id}`).emit("task_status_updated", {
            task_id: task.task_id,
            assignment_id: assignmentId,
            status: "completed",
            completed_at: new Date().toISOString(),
            member_account_id: task.member_account_id,
            member_name: memberName,
          });

          console.log(`✅ Đã emit task_status_updated tới account_${task.manager_account_id}`);
        }

      }
    }

    return res.json({ success: true, message: "Đã cập nhật trạng thái công việc" });
  } catch (error) {
    console.error("updateTaskStatus error:", error);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật trạng thái công việc" });
  }
};
const ensureFamilyMemoriesSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS family_memories (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      clan_id BIGINT UNSIGNED NOT NULL,
      author_account_id BIGINT UNSIGNED NULL,
      author_person_id BIGINT UNSIGNED NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NULL,
      media_id BIGINT UNSIGNED NULL,
      media_url TEXT NULL,
      media_type VARCHAR(30) NOT NULL DEFAULT 'text',
      mime_type VARCHAR(120) NULL,
      original_filename VARCHAR(255) NULL,
      visibility ENUM('clan','selected','private') NOT NULL DEFAULT 'clan',
      scheduled_publish_at DATETIME NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      rejection_reason TEXT NULL,
      approved_by_account_id BIGINT UNSIGNED NULL,
      approved_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_family_memories_clan_status (clan_id, status),
      KEY idx_family_memories_visibility (clan_id, visibility),
      KEY idx_family_memories_scheduled (clan_id, scheduled_publish_at),
      KEY idx_family_memories_author (author_account_id),
      KEY idx_family_memories_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [columns] = await db.query("SHOW COLUMNS FROM family_memories");
  const columnNames = new Set(columns.map((column) => column.Field));

  if (!columnNames.has("visibility")) {
    await db.query("ALTER TABLE family_memories ADD COLUMN visibility ENUM('clan','selected','private') NOT NULL DEFAULT 'clan' AFTER original_filename");
  }

  if (!columnNames.has("scheduled_publish_at")) {
    await db.query("ALTER TABLE family_memories ADD COLUMN scheduled_publish_at DATETIME NULL AFTER visibility");
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS family_memory_readers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      memory_id BIGINT UNSIGNED NOT NULL,
      clan_id BIGINT UNSIGNED NOT NULL,
      reader_account_id BIGINT UNSIGNED NULL,
      reader_person_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_family_memory_reader_account (memory_id, reader_account_id),
      UNIQUE KEY uk_family_memory_reader_person (memory_id, reader_person_id),
      KEY idx_family_memory_readers_account (reader_account_id),
      KEY idx_family_memory_readers_person (reader_person_id),
      CONSTRAINT fk_family_memory_readers_memory FOREIGN KEY (memory_id) REFERENCES family_memories(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const inferMemoryMediaType = (mimeType) => {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'text';
};

const mapMemoryRow = (row) => ({
  ...row,
  media_id: row.media_id || null,
  media_url: row.media_id ? `/api/media/${row.media_id}` : row.media_url || null,
  author_name: row.author_name || row.author_email || 'Thành viên dòng họ',
  visibility: row.visibility || 'clan',
  scheduled_publish_at: row.scheduled_publish_at || null,
  reader_count: Number(row.reader_count || 0),
});

const normalizeMemoryVisibility = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['clan', 'selected', 'private'].includes(normalized) ? normalized : 'clan';
};

const parseMemorySchedule = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.replace('T', ' ').slice(0, 19);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] || '00'}`;
};

const normalizeMemoryReaders = (value) => {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  return rows
    .map((item) => ({
      account_id: Number(item?.account_id || 0) || null,
      person_id: Number(item?.person_id || 0) || null,
    }))
    .filter((item) => item.account_id || item.person_id)
    .filter((item) => {
      const key = `${item.account_id || 'a0'}:${item.person_id || 'p0'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 100);
};

exports.getFamilyMemories = async (req, res) => {
  try {
    await ensureFamilyMemoriesSchema();
    const context = await getAccountContext(req.user.id);
    if (!context?.clan_id) return res.status(400).json({ success: false, message: 'Tài khoản chưa liên kết dòng họ' });

    const roleId = Number(req.user?.role_id || context.role_id);
    const isManagerOrAdmin = roleId === 1 || roleId === 2;
    const includeOwnPending = req.query?.includeOwnPending === '1';
    const approvedVisibility = isManagerOrAdmin
      ? '1 = 1'
      : `(
          COALESCE(fm.visibility, 'clan') = 'clan'
          OR fm.author_account_id = ?
          OR EXISTS (
            SELECT 1
            FROM family_memory_readers fmr
            WHERE fmr.memory_id = fm.id
              AND (
                fmr.reader_account_id = ?
                OR (fmr.reader_person_id IS NOT NULL AND fmr.reader_person_id = ?)
              )
          )
        )`;
    const values = [context.clan_id];
    const visibilityValues = isManagerOrAdmin ? [] : [req.user.id, req.user.id, context.person_id || 0];
    let where = `
      fm.clan_id = ?
      AND (
        (
          fm.status = 'approved'
          AND (fm.scheduled_publish_at IS NULL OR fm.scheduled_publish_at <= NOW() OR fm.author_account_id = ?)
          AND ${approvedVisibility}
        )
    `;
    values.push(req.user.id, ...visibilityValues);

    if (includeOwnPending || isManagerOrAdmin) {
      where += " OR fm.author_account_id = ?";
      values.push(req.user.id);
    }

    where += ")";

    const [rows] = await db.query(
      `SELECT fm.*, COALESCE(p.display_name, a.email) AS author_name, a.email AS author_email,
              (
                SELECT COUNT(*)
                FROM family_memory_readers fmr_count
                WHERE fmr_count.memory_id = fm.id
              ) AS reader_count
       FROM family_memories fm
       LEFT JOIN accounts a ON a.id = fm.author_account_id
       LEFT JOIN people p ON p.id = fm.author_person_id
       WHERE ${where}
       ORDER BY fm.created_at DESC`,
      values
    );

    return res.json({ success: true, memories: rows.map(mapMemoryRow) });
  } catch (error) {
    console.error('getFamilyMemories error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải kỉ niệm dòng họ' });
  }
};

exports.getMemoryReaderOptions = async (req, res) => {
  try {
    await ensureFamilyMemoriesSchema();
    const context = await getAccountContext(req.user.id);
    if (!context?.clan_id) return res.status(400).json({ success: false, message: 'Tài khoản chưa liên kết dòng họ' });

    const [rows] = await db.query(
      `
        SELECT
          p.id AS person_id,
          p.display_name,
          p.clan_id,
          COALESCE(a.id, ac.account_id) AS account_id,
          COALESCE(a.email, aa.email) AS email
        FROM people p
        LEFT JOIN accounts a ON a.person_id = p.id
        LEFT JOIN account_clans ac ON ac.person_id = p.id AND ac.status = 'active'
        LEFT JOIN accounts aa ON aa.id = ac.account_id
        WHERE p.clan_id = ?
          AND COALESCE(CAST(p.is_living AS CHAR), '1') <> '0'
        GROUP BY p.id, p.display_name, p.clan_id, account_id, email
        ORDER BY p.display_name ASC, p.id ASC
        LIMIT 500
      `,
      [context.clan_id]
    );

    return res.json({ success: true, readers: rows });
  } catch (error) {
    console.error('getMemoryReaderOptions error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách người được đọc' });
  }
};

exports.createFamilyMemory = async (req, res) => {
  try {
    await ensureFamilyMemoriesSchema();
    const context = await getAccountContext(req.user.id);
    if (!context?.clan_id) return res.status(400).json({ success: false, message: 'Tài khoản chưa liên kết dòng họ' });

    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const mediaId = normalizeMediaId(req.body?.media_id);
    const mimeType = req.body?.mime_type ? String(req.body.mime_type).trim() : null;
    const originalFilename = req.body?.original_filename ? String(req.body.original_filename).trim() : null;
    const mediaUrl = req.body?.media_url ? String(req.body.media_url).trim() : null;
    const mediaType = inferMemoryMediaType(mimeType || req.body?.media_type);
    const visibility = normalizeMemoryVisibility(req.body?.visibility);
    const scheduledPublishAt = parseMemorySchedule(req.body?.scheduled_publish_at);
    const readers = visibility === 'selected' ? normalizeMemoryReaders(req.body?.readers) : [];

    if (!title && !content && !mediaId && !mediaUrl) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung hoặc tải tệp kỉ niệm' });
    }
    if (visibility === 'selected' && readers.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một người được đọc kỉ niệm' });
    }

    const roleId = Number(req.user?.role_id || context.role_id);
    const status = roleId === 1 || roleId === 2 ? 'approved' : 'pending';
    const [created] = await db.query(
      `INSERT INTO family_memories
       (clan_id, author_account_id, author_person_id, title, content, media_id, media_url, media_type, mime_type, original_filename, visibility, scheduled_publish_at, status, approved_by_account_id, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'approved' ? 'CURRENT_TIMESTAMP' : 'NULL'})`,
      [
        context.clan_id,
        req.user.id,
        context.person_id || null,
        title || 'Kỉ niệm dòng họ',
        content || null,
        mediaId,
        mediaUrl || null,
        mediaType,
        mimeType,
        originalFilename,
        visibility,
        scheduledPublishAt,
        status,
        status === 'approved' ? req.user.id : null,
      ]
    );

    if (readers.length > 0) {
      await db.query(
        `
          INSERT IGNORE INTO family_memory_readers
            (memory_id, clan_id, reader_account_id, reader_person_id)
          VALUES ${readers.map(() => '(?, ?, ?, ?)').join(', ')}
        `,
        readers.flatMap((reader) => [
          created.insertId,
          context.clan_id,
          reader.account_id,
          reader.person_id,
        ])
      );
    }

    if (status === "pending") {
      await notifyManagersAboutPendingApproval(req, {
        clanId: context.clan_id,
        relatedType: "memory",
        relatedId: created.insertId,
        title: "Có kỷ niệm chờ duyệt",
        message: `${context.display_name || "Một thành viên"} vừa gửi kỷ niệm dòng họ cần duyệt.`,
  });
}

    return res.json({
      success: true,
      memory_id: created.insertId,
      status,
      message: status === 'approved' ? 'Đã đăng kỉ niệm dòng họ.' : 'Đã gửi kỉ niệm, vui lòng chờ trưởng họ duyệt.',
    });
  } catch (error) {
    console.error('createFamilyMemory error:', error);
    return res.status(500).json({ success: false, message: 'Không thể gửi kỉ niệm dòng họ' });
  }
};

// ─── XÓA / SỬA KỶ NIỆM ──────────────────────────────────────────────────────

exports.deleteFamilyMemory = async (req, res) => {
  try {
    await ensureFamilyMemoriesSchema();
    const memoryId = Number(req.params.id);
    if (!Number.isFinite(memoryId) || memoryId <= 0) {
      return res.status(400).json({ success: false, message: 'ID kỷ niệm không hợp lệ.' });
    }

    const [rows] = await db.query('SELECT id, author_account_id, clan_id FROM family_memories WHERE id = ? LIMIT 1', [memoryId]);
    const memory = rows[0];
    if (!memory) return res.status(404).json({ success: false, message: 'Không tìm thấy kỷ niệm.' });

    const roleId = Number(req.user?.role_id);
    const isOwner = Number(memory.author_account_id) === Number(req.user.id);
    const isManagerOrAdmin = roleId === 1 || roleId === 2;

    if (!isOwner && !isManagerOrAdmin) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa kỷ niệm này.' });
    }

    await db.query('DELETE FROM family_memories WHERE id = ?', [memoryId]);
    return res.json({ success: true, message: 'Đã xóa kỷ niệm.' });
  } catch (error) {
    console.error('deleteFamilyMemory error:', error);
    return res.status(500).json({ success: false, message: 'Không thể xóa kỷ niệm.' });
  }
};

exports.updateFamilyMemory = async (req, res) => {
  try {
    await ensureFamilyMemoriesSchema();
    const memoryId = Number(req.params.id);
    if (!Number.isFinite(memoryId) || memoryId <= 0) {
      return res.status(400).json({ success: false, message: 'ID kỷ niệm không hợp lệ.' });
    }

    const [rows] = await db.query('SELECT id, author_account_id, clan_id FROM family_memories WHERE id = ? LIMIT 1', [memoryId]);
    const memory = rows[0];
    if (!memory) return res.status(404).json({ success: false, message: 'Không tìm thấy kỷ niệm.' });

    const roleId = Number(req.user?.role_id);
    const isOwner = Number(memory.author_account_id) === Number(req.user.id);
    const isManagerOrAdmin = roleId === 1 || roleId === 2;

    if (!isOwner && !isManagerOrAdmin) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa kỷ niệm này.' });
    }

    const title = req.body?.title !== undefined ? String(req.body.title || '').trim() : undefined;
    const content = req.body?.content !== undefined ? String(req.body.content || '').trim() : undefined;
    const visibility = req.body?.visibility !== undefined ? normalizeMemoryVisibility(req.body.visibility) : undefined;

    const sets = [];
    const values = [];
    if (title !== undefined) { sets.push('title = ?'); values.push(title || 'Kỷ niệm dòng họ'); }
    if (content !== undefined) { sets.push('content = ?'); values.push(content || null); }
    if (visibility !== undefined) { sets.push('visibility = ?'); values.push(visibility); }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu cập nhật.' });
    }

    values.push(memoryId);
    await db.query(`UPDATE family_memories SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
    return res.json({ success: true, message: 'Đã cập nhật kỷ niệm.' });
  } catch (error) {
    console.error('updateFamilyMemory error:', error);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật kỷ niệm.' });
  }
};

// ─── XÓA / SỬA BÀI ĐĂNG ─────────────────────────────────────────────────────

exports.deletePost = async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
    }

    const [rows] = await db.query('SELECT id, author_id, clan_id FROM posts WHERE id = ? LIMIT 1', [postId]);
    const post = rows[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng.' });

    const roleId = Number(req.user?.role_id);
    const isOwner = Number(post.author_id) === Number(req.user.id);
    const isManagerOrAdmin = roleId === 1 || roleId === 2;

    if (!isOwner && !isManagerOrAdmin) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa bài đăng này.' });
    }

    await db.query('DELETE FROM posts WHERE id = ?', [postId]);

    const io = req.app?.locals?.io;
    if (io) {
      io.to(`clan_${post.clan_id}`).emit('post_feed_updated', {
        action: 'post_deleted',
        post_id: postId,
        clan_id: post.clan_id,
      });
    }

    return res.json({ success: true, message: 'Đã xóa bài đăng.' });
  } catch (error) {
    console.error('deletePost error:', error);
    return res.status(500).json({ success: false, message: 'Không thể xóa bài đăng.' });
  }
};

exports.updatePost = async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
    }

    const [rows] = await db.query('SELECT id, author_id, clan_id FROM posts WHERE id = ? LIMIT 1', [postId]);
    const post = rows[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng.' });

    const roleId = Number(req.user?.role_id);
    const isOwner = Number(post.author_id) === Number(req.user.id);
    const isManagerOrAdmin = roleId === 1 || roleId === 2;

    if (!isOwner && !isManagerOrAdmin) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa bài đăng này.' });
    }

    const description = req.body?.description !== undefined ? String(req.body.description || '').trim() : undefined;
    const content = req.body?.content !== undefined ? String(req.body.content || '').trim() : undefined;

    const sets = [];
    const values = [];
    if (description !== undefined) { sets.push('description = ?'); values.push(description); }
    if (content !== undefined) { sets.push('content = ?'); values.push(content || null); }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu cập nhật.' });
    }

    values.push(postId);
    await db.query(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, values);

    const io = req.app?.locals?.io;
    if (io) {
      io.to(`clan_${post.clan_id}`).emit('post_feed_updated', {
        action: 'post_updated',
        post_id: postId,
        clan_id: post.clan_id,
      });
    }

    return res.json({ success: true, message: 'Đã cập nhật bài đăng.' });
  } catch (error) {
    console.error('updatePost error:', error);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật bài đăng.' });
  }
};
