const jwt = require("jsonwebtoken");
const db = require("../../config/db");
const { getRoleName } = require("../../config/roles");
const { ensureProfileCompletedColumn } = require("../../shared/utils/profileCompletion");

function normalizeText(value) {
  return String(value ?? "").trim();
}

function splitFullName(fullName) {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { surname: "", middle_name: "", first_name: "" };
  if (parts.length === 1) return { surname: "", middle_name: "", first_name: parts[0] };
  if (parts.length === 2) return { surname: parts[0], middle_name: "", first_name: parts[1] };
  return {
    surname: parts[0],
    middle_name: parts.slice(1, -1).join(" "),
    first_name: parts[parts.length - 1],
  };
}

function normalizeGender(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "male" || raw === "1" || raw === "nam") return 1;
  if (raw === "female" || raw === "2" || raw === "nu" || raw === "nữ") return 2;
  if (raw === "other" || raw === "0" || raw === "unknown") return null;
  return undefined;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function signAuthToken(account) {
  const secret = process.env.JWT_SECRET || "GiaPhaViet_Secret_Key_2024_Backup";
  const roleName = getRoleName(account.role_id);

  return jwt.sign(
    {
      id: account.id,
      account_id: account.id,
      person_id: account.person_id,
      role_id: account.role_id,
      role_name: roleName,
      role: roleName,
      email: account.email,
      profile_completed: Number(account.profile_completed || 0),
    },
    secret,
    { expiresIn: "24h" }
  );
}

function buildUser(account) {
  const roleName = getRoleName(account.role_id);
  return {
    id: account.id,
    account_id: account.id,
    person_id: account.person_id,
    role_id: account.role_id,
    role_name: roleName,
    role: roleName,
    status: account.status,
    email: account.email,
    name: account.display_name || account.email,
    display_name: account.display_name || "",
    profile_completed: Number(account.profile_completed || 0),
  };
}

async function resolveClanId(connection, accountId, jwtClanId) {
  const [membershipRows] = await connection.query(
    `SELECT clan_id FROM account_clans
     WHERE account_id = ? AND status = 'active'
     ORDER BY id ASC
     LIMIT 1`,
    [accountId]
  ).catch((error) => {
    if (error?.code === "ER_NO_SUCH_TABLE") return [[]];
    throw error;
  });
  if (membershipRows?.[0]?.clan_id) return membershipRows[0].clan_id;

  const invitedClanId = Number(jwtClanId);
  if (Number.isFinite(invitedClanId) && invitedClanId > 0) return invitedClanId;

  const [inviteRows] = await connection.query(
    `SELECT clan_id FROM invitations
     WHERE email = (SELECT email FROM accounts WHERE id = ? LIMIT 1)
       AND status = 'accepted'
       AND clan_id IS NOT NULL
     ORDER BY accepted_at DESC, id DESC
     LIMIT 1`,
    [accountId]
  ).catch((error) => {
    if (error?.code === "ER_NO_SUCH_TABLE") return [[]];
    throw error;
  });

  return inviteRows?.[0]?.clan_id || null;
}

async function resolveInviteGeneration(connection, accountId, jwtGeneration) {
  const tokenGeneration = Number(jwtGeneration);
  if (Number.isInteger(tokenGeneration) && tokenGeneration > 0) return tokenGeneration;

  const [inviteRows] = await connection.query(
    `SELECT generation FROM invitations
     WHERE email = (SELECT email FROM accounts WHERE id = ? LIMIT 1)
       AND status = 'accepted'
       AND generation IS NOT NULL
     ORDER BY accepted_at DESC, id DESC
     LIMIT 1`,
    [accountId]
  ).catch((error) => {
    if (error?.code === "ER_NO_SUCH_TABLE" || error?.code === "ER_BAD_FIELD_ERROR") return [[]];
    throw error;
  });

  const generation = Number(inviteRows?.[0]?.generation);
  return Number.isInteger(generation) && generation > 0 ? generation : null;
}

exports.updateMyProfile = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await ensureProfileCompletedColumn();

    const accountId = Number(req.user?.id || req.user?.account_id);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      return res.status(401).json({ success: false, message: "Chua dang nhap." });
    }

    const fullName = normalizeText(req.body?.full_name || req.body?.display_name);
    const gender = normalizeGender(req.body?.gender);
    if (!fullName) {
      return res.status(400).json({ success: false, message: "Vui long nhap ho va ten." });
    }
    if (gender === undefined) {
      return res.status(400).json({ success: false, message: "Vui long chon gioi tinh." });
    }

    await connection.beginTransaction();

    const [accountRows] = await connection.query(
      "SELECT id, email, person_id, role_id, status FROM accounts WHERE id = ? LIMIT 1 FOR UPDATE",
      [accountId]
    );
    const account = accountRows[0];
    if (!account) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Khong tim thay tai khoan." });
    }

    const clanId = await resolveClanId(connection, accountId, req.user?.invite_clan_id);
    if (!clanId) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Khong xac dinh duoc dong ho cua loi moi." });
    }

    const nameParts = splitFullName(fullName);
    const inviteGeneration = await resolveInviteGeneration(connection, accountId, req.user?.invite_generation);
    const birthDate = normalizeDate(req.body?.birth_date);
    const phone = normalizeText(req.body?.phone) || null;
    const address = normalizeText(req.body?.address) || null;
    const hometown = normalizeText(req.body?.hometown) || null;
    const bio = normalizeText(req.body?.bio) || null;
    const avatarUrl = normalizeText(req.body?.avatar_url) || null;

    let personId = account.person_id || null;
    if (personId) {
      await connection.query(
        `UPDATE people
         SET clan_id = ?, display_name = ?, surname = ?, middle_name = ?, first_name = ?,
             gender = ?, birth_date = COALESCE(?, birth_date), phone = ?, address = ?,
             hometown = ?, bio = ?, avatar_url = COALESCE(?, avatar_url), email = COALESCE(email, ?),
             generation = COALESCE(?, generation)
         WHERE id = ?`,
        [
          clanId,
          fullName,
          nameParts.surname,
          nameParts.middle_name,
          nameParts.first_name,
          gender,
          birthDate,
          phone,
          address,
          hometown,
          bio,
          avatarUrl,
          account.email,
          inviteGeneration,
          personId,
        ]
      );
    } else {
      const [created] = await connection.query(
        `INSERT INTO people
          (clan_id, display_name, surname, middle_name, first_name, gender, birth_date,
           phone, address, hometown, bio, avatar_url, email, generation, is_living)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          clanId,
          fullName,
          nameParts.surname,
          nameParts.middle_name,
          nameParts.first_name,
          gender,
          birthDate,
          phone,
          address,
          hometown,
          bio,
          avatarUrl,
          account.email,
          inviteGeneration || 1,
        ]
      );
      personId = created.insertId;
      await connection.query("UPDATE accounts SET person_id = ? WHERE id = ?", [personId, accountId]);
    }

    await connection.query("UPDATE accounts SET profile_completed = 1 WHERE id = ?", [accountId]);

    try {
      await connection.query(
        `INSERT INTO account_clans (account_id, clan_id, person_id, status)
         VALUES (?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE clan_id = VALUES(clan_id), person_id = VALUES(person_id), status = 'active'`,
        [accountId, clanId, personId]
      );
    } catch (membershipError) {
      if (membershipError?.code !== "ER_NO_SUCH_TABLE") throw membershipError;
    }

    const [freshRows] = await connection.query(
      `SELECT a.id, a.email, a.person_id, a.role_id, a.status, a.profile_completed, p.display_name
       FROM accounts a
       LEFT JOIN people p ON p.id = a.person_id
       WHERE a.id = ?
       LIMIT 1`,
      [accountId]
    );
    const fresh = freshRows[0];

    await connection.commit();

    return res.json({
      success: true,
      message: "Da hoan thien ho so.",
      token: signAuthToken(fresh),
      user: buildUser(fresh),
      profile: {
        account_id: fresh.id,
        person_id: fresh.person_id,
        email: fresh.email,
        display_name: fresh.display_name,
        full_name: fresh.display_name,
        gender,
        generation: inviteGeneration || null,
        clan_id: clanId,
        profile_completed: 1,
      },
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error("updateMyProfile error:", error);
    return res.status(500).json({ success: false, message: "Khong the luu ho so." });
  } finally {
    connection.release();
  }
};
