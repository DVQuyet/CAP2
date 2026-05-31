const db = require('../../config/db');

const NO_TABLE_OR_COLUMN = new Set(['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_DUP_FIELDNAME']);

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
    `,
    [tableName, columnName]
  );

  return rows.length > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
  if (await columnExists(connection, tableName, columnName)) return;

  try {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  } catch (error) {
    if (!NO_TABLE_OR_COLUMN.has(error.code)) throw error;
  }
}

async function ensurePaymentPurchaseColumns(connection = db) {
  await addColumnIfMissing(connection, 'payments', 'unit_amount_vnd', 'INT NULL AFTER amount_vnd');
  await addColumnIfMissing(connection, 'payments', 'period_quantity', 'INT NOT NULL DEFAULT 1 AFTER unit_amount_vnd');
  await addColumnIfMissing(connection, 'payments', 'period_unit', "ENUM('month','year','lifetime') NOT NULL DEFAULT 'month' AFTER period_quantity");
  await addColumnIfMissing(connection, 'payments', 'period_months', 'INT NULL AFTER period_unit');
  await addColumnIfMissing(connection, 'payments', 'billing_cycle', "VARCHAR(20) NULL AFTER period_months");
  await addColumnIfMissing(connection, 'payments', 'period_started_at', 'DATETIME NULL AFTER paid_at');
  await addColumnIfMissing(connection, 'payments', 'period_expires_at', 'DATETIME NULL AFTER period_started_at');
  await addColumnIfMissing(connection, 'payments', 'plan_snapshot_json', 'JSON NULL AFTER period_expires_at');
}

function normalizePurchaseQuantity(body = {}, plan = {}) {
  const billingCycle = String(plan.billing_cycle || '').toLowerCase();
  const raw =
    body.period_quantity ??
    body.periodQuantity ??
    body.quantity ??
    body.qty ??
    (billingCycle === 'yearly' ? body.years : body.months) ??
    1;

  const quantity = Number(raw);
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  return Math.min(safeQuantity, 120);
}

function getPurchasePeriod(plan = {}, quantity = 1) {
  const billingCycle = String(plan.billing_cycle || 'monthly').toLowerCase();
  const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));

  if (billingCycle === 'yearly') {
    return {
      quantity: safeQuantity,
      unit: 'year',
      months: safeQuantity * 12,
    };
  }

  if (billingCycle === 'lifetime') {
    return {
      quantity: 1,
      unit: 'lifetime',
      months: null,
    };
  }

  return {
    quantity: safeQuantity,
    unit: 'month',
    months: safeQuantity,
  };
}

function buildPlanSnapshot(plan = {}) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description || null,
    price_vnd: Number(plan.price_vnd || 0),
    billing_cycle: plan.billing_cycle,
    person_limit: Number(plan.person_limit || 0),
    account_limit: Number(plan.account_limit || 0),
  };
}

function buildPurchaseSummary(plan = {}, quantity = 1) {
  const period = getPurchasePeriod(plan, quantity);
  const unitAmount = Number(plan.price_vnd || 0);
  return {
    planSnapshot: buildPlanSnapshot(plan),
    billingCycle: String(plan.billing_cycle || 'monthly').toLowerCase(),
    periodQuantity: period.quantity,
    periodUnit: period.unit,
    periodMonths: period.months,
    unitAmountVnd: unitAmount,
    totalAmountVnd: unitAmount * period.quantity,
  };
}

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
  ensurePaymentPurchaseColumns,
  normalizePurchaseQuantity,
  buildPurchaseSummary,
};
