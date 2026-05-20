const db = require('../../config/db');

async function getClanUsage(clanId) {
  const [peopleRows] = await db.query(
    `
    SELECT COUNT(*) AS current_people
    FROM people
    WHERE clan_id = ?
    `,
    [clanId]
  );

    const [accountRows] = await db.query(
    `
    SELECT COUNT(DISTINCT a.id) AS current_accounts
    FROM accounts a
    INNER JOIN people p ON p.id = a.person_id
    WHERE p.clan_id = ?
      AND a.status = 'active'
    `,
    [clanId]
  );

  return {
    current_people: Number(peopleRows[0]?.current_people || 0),
    current_accounts: Number(accountRows[0]?.current_accounts || 0),
  };
}

async function getClanBillingStatus(clanId) {
  const [rows] = await db.query(
    `
    SELECT 
      s.id AS subscription_id,
      s.clan_id,
      s.status,
      s.started_at,
      s.expires_at,
      p.id AS plan_id,
      p.code AS plan_code,
      p.name AS plan_name,
      p.price_vnd,
      p.billing_cycle,
      p.person_limit,
      p.account_limit
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.clan_id = ?
    LIMIT 1
    `,
    [clanId]
  );

  if (!rows.length) {
    return null;
  }

  const usage = await getClanUsage(clanId);
  const billing = rows[0];

  return {
    ...billing,
    ...usage,
    is_person_limit_reached: usage.current_people >= Number(billing.person_limit),
    is_account_limit_reached: usage.current_accounts >= Number(billing.account_limit),
  };
}

async function ensureFreeSubscriptionForClan(clanId, connection = db) {
  const normalizedClanId = Number(clanId);
  if (!Number.isFinite(normalizedClanId) || normalizedClanId <= 0) {
    const error = new Error('clan_id khong hop le');
    error.status = 400;
    throw error;
  }

  const [plans] = await connection.query(
    `
    SELECT id
    FROM plans
    WHERE UPPER(code) = 'FREE'
      AND is_active = 1
    LIMIT 1
    `
  );

  if (!plans.length) {
    const error = new Error('Khong tim thay goi Free dang hoat dong');
    error.status = 500;
    throw error;
  }

  await connection.query(
    `
    INSERT IGNORE INTO subscriptions (clan_id, plan_id, status, started_at, expires_at, cancelled_at)
    VALUES (?, ?, 'free', NOW(), NULL, NULL)
    `,
    [normalizedClanId, plans[0].id]
  );

  return { clan_id: normalizedClanId, plan_id: plans[0].id, status: 'free' };
}

async function ensureCanAddPerson(clanId) {
  const billing = await getClanBillingStatus(clanId);

  if (!billing) {
    return {
      ok: false,
      status: 403,
      code: 'NO_SUBSCRIPTION',
      message: 'Clan chưa có gói sử dụng.',
    };
  }

  const isExpired =
    billing.expires_at &&
    new Date(billing.expires_at).getTime() <= Date.now() &&
    billing.status !== 'free';

  if (isExpired) {
    return {
      ok: false,
      status: 403,
      code: 'SUBSCRIPTION_EXPIRED',
      message: 'Gói sử dụng đã hết hạn.',
      billing,
    };
  }

  if (Number(billing.current_people) >= Number(billing.person_limit)) {
    return {
      ok: false,
      status: 403,
      code: 'PERSON_LIMIT_REACHED',
      message: `Gói ${billing.plan_name} chỉ cho phép tối đa ${billing.person_limit} người trong cây gia phả.`,
      billing,
    };
  }

  return {
    ok: true,
    billing,
  };
}

async function ensureCanAddAccount(clanId) {
  const billing = await getClanBillingStatus(clanId);

  if (!billing) {
    return {
      ok: false,
      status: 403,
      code: 'NO_SUBSCRIPTION',
      message: 'Clan chưa có gói sử dụng.',
    };
  }

  const isExpired =
    billing.expires_at &&
    new Date(billing.expires_at).getTime() <= Date.now() &&
    billing.status !== 'free';

  if (isExpired) {
    return {
      ok: false,
      status: 403,
      code: 'SUBSCRIPTION_EXPIRED',
      message: 'Gói sử dụng đã hết hạn.',
      billing,
    };
  }

  if (Number(billing.current_accounts) >= Number(billing.account_limit)) {
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_LIMIT_REACHED',
      message: `Gói ${billing.plan_name} chỉ cho phép tối đa ${billing.account_limit} tài khoản đăng nhập trong dòng họ.`,
      billing,
    };
  }

  return {
    ok: true,
    billing,
  };
}

module.exports = {
  getClanUsage,
  getClanBillingStatus,
  ensureFreeSubscriptionForClan,
  ensureCanAddPerson,
  ensureCanAddAccount,
};
