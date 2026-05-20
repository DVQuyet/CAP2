const { db } = require('./common.service');

const getTargetAccountContext = async(accountId) => {
    const sql = `
    SELECT 
      a.id AS account_id,
      a.email AS account_email,
      a.role_id,
      a.status,
      a.person_id,
      p.gender,
      p.clan_id
    FROM accounts a
    LEFT JOIN people p ON a.person_id = p.id
    WHERE a.id = ?
    LIMIT 1
  `;
    const [rows] = await db.query(sql, [accountId]);
    return rows[0] || null;
};

const getManagedMemberFullContext = async(accountId) => {
    const sql = `
    SELECT 
      a.id AS account_id,
      a.email,
      a.role_id,
      a.status,
      a.person_id,
      p.display_name,
      p.first_name,
      p.middle_name,
      p.surname,
      p.gender,
      p.birth_date,
      p.death_date,
      p.is_living,
      p.generation,
      p.branch,
      p.hometown,
      p.address,
      p.phone,
      p.email AS people_email,
      p.zalo,
      p.facebook,
      p.avatar_url,
      p.bio,
      p.note,
      p.clan_id
    FROM accounts a
    INNER JOIN people p ON a.person_id = p.id
    WHERE a.id = ?
    LIMIT 1
  `;
    const [rows] = await db.query(sql, [accountId]);
    return rows[0] || null;
};

const assertCanManageAccount = async(req, targetAccountId) => {
    const ctx = await getTargetAccountContext(targetAccountId);
    if (!ctx || !ctx.person_id) {
        return { ok: false, status: 400, message: 'Tài khoản không có hồ sơ người (person) trong hệ thống' };
    }
    if (req.user.role_id === 2) {
        const managerClanId = await getManagerClanId(req.user.id);
        if (managerClanId == null) {
            return { ok: false, status: 404, message: 'Không xác định được clan của manager' };
        }
        if (ctx.clan_id !== managerClanId) {
            return { ok: false, status: 403, message: 'Chỉ được chỉnh quan hệ thành viên cùng dòng họ' };
        }
    }
    return { ok: true, context: ctx };
};

const getManagerClanId = async(accountId) => {
    const [accountRows] = await db.query(
        `
        SELECT p.clan_id
        FROM accounts a
        LEFT JOIN people p ON a.person_id = p.id
        WHERE a.id = ?
        LIMIT 1
        `, [accountId]
    );

    if (accountRows?.[0]?.clan_id != null) {
        return accountRows[0].clan_id;
    }

    try {
        const [membershipRows] = await db.query(
            `
            SELECT clan_id
            FROM account_clans
            WHERE account_id = ?
              AND status = 'active'
            ORDER BY id ASC
            LIMIT 1
            `, [accountId]
        );

        if (membershipRows?.[0]?.clan_id != null) {
            return membershipRows[0].clan_id;
        }
    } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE') {
            throw error;
        }
    }

    return null;
};

const assertClanExists = async(clanId) => {
    const cid = Number(clanId);
    if (!Number.isFinite(cid)) return false;
    const [rows] = await db.query('SELECT id FROM clans WHERE id = ? LIMIT 1', [cid]);
    return rows.length > 0;
};

const resolveManagedClanId = async(req, source = {}) => {
    if (Number(req.user.role_id) === 2) {
        return await getManagerClanId(req.user.id);
    }

    const rawClanId = source.clan_id ?? req.params?.clanId ?? req.query?.clan_id;
    const requestedClanId = Number(rawClanId);

    if (Number.isFinite(requestedClanId)) {
        return (await assertClanExists(requestedClanId)) ? requestedClanId : null;
    }

    const [rows] = await db.query('SELECT id FROM clans ORDER BY id ASC LIMIT 1');
    return rows[0]?.id ?? null;
};

const assertCanManagePersonId = async(req, personId) => {
    const pid = Number(personId);
    if (!Number.isFinite(pid) || pid <= 0) {
        return { ok: false, status: 400, message: 'person_id khong hop le' };
    }

    const [rows] = await db.query('SELECT id, clan_id, gender FROM people WHERE id = ? LIMIT 1', [pid]);
    if (!rows.length) {
        return { ok: false, status: 404, message: 'Khong tim thay nguoi trong gia pha' };
    }

    if (Number(req.user.role_id) === 2) {
        const managerClanId = await getManagerClanId(req.user.id);
        if (managerClanId == null) {
            return { ok: false, status: 404, message: 'Khong xac dinh duoc dong ho cua manager' };
        }
        if (Number(rows[0].clan_id) !== Number(managerClanId)) {
            return { ok: false, status: 403, message: 'Chi duoc thao tac voi nguoi trong cung dong ho' };
        }
    }

    return { ok: true, person: rows[0] };
};

const loadTreeEditKeyTargets = async(req, memberAccountIds) => {
    const placeholders = memberAccountIds.map(() => '?').join(',');
    const [rows] = await db.query(
        `
        SELECT
            a.id AS account_id,
            a.role_id,
            a.status,
            p.id AS person_id,
            p.clan_id,
            p.display_name,
            p.first_name,
            p.middle_name,
            p.surname
        FROM accounts a
        INNER JOIN people p ON a.person_id = p.id
        WHERE a.id IN (${placeholders})
        `,
        memberAccountIds
    );

    const byAccountId = new Map(rows.map((row) => [Number(row.account_id), row]));
    const targets = memberAccountIds.map((id) => byAccountId.get(Number(id))).filter(Boolean);

    if (targets.length !== memberAccountIds.length) {
        return { ok: false, status: 404, message: 'Khong tim thay mot hoac nhieu member duoc cap key' };
    }
    if (targets.some((target) => Number(target.role_id) !== 3)) {
        return { ok: false, status: 400, message: 'Chi co the cap temporary edit key cho member' };
    }
    if (targets.some((target) => String(target.status) !== 'active')) {
        return { ok: false, status: 400, message: 'Mot hoac nhieu tai khoan member chua active' };
    }
    if (targets.some((target) => !Number(target.person_id) || !Number(target.clan_id))) {
        return { ok: false, status: 400, message: 'Mot hoac nhieu member chua lien ket day du voi ho so dong ho' };
    }

    if (Number(req.user.role_id) === 2) {
        const managerClanId = await getManagerClanId(req.user.id);
        if (managerClanId == null) {
            return { ok: false, status: 404, message: 'Khong xac dinh duoc dong ho cua manager' };
        }
        if (targets.some((target) => Number(managerClanId) !== Number(target.clan_id))) {
            return { ok: false, status: 403, message: 'Chi duoc cap key cho member trong cung dong ho' };
        }
    }

    return { ok: true, targets };
};

module.exports = {
    getTargetAccountContext,
    getManagedMemberFullContext,
    assertCanManageAccount,
    getManagerClanId,
    assertClanExists,
    resolveManagedClanId,
    assertCanManagePersonId,
    loadTreeEditKeyTargets,
};
