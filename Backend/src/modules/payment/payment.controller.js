const crypto = require('crypto');
const db = require('../../config/db');
const {
  ensurePaymentPurchaseColumns,
  normalizePurchaseQuantity,
  buildPurchaseSummary,
} = require('../billing/billing.service');
const PAYMENT_PREFIX = 'DH';

function buildOrderCode(clanId) {
  return `${PAYMENT_PREFIX}${clanId}${Date.now()}`;
}

function normalizeAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function cancelExpiredPendingPayments() {
  await db.query(
    `
    UPDATE payments
    SET status = 'cancelled'
    WHERE status = 'pending'
      AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `
  );
}

function isPaymentOlderThan24Hours(payment) {
  if (!payment?.created_at) {
    return false;
  }

  const createdAt = new Date(payment.created_at).getTime();

  if (Number.isNaN(createdAt)) {
    return false;
  }

  return Date.now() - createdAt > 24 * 60 * 60 * 1000;
}

function getManagerClanId(accountId) {
  return db
    .query(
      `
      SELECT p.clan_id
      FROM accounts a
      INNER JOIN people p ON p.id = a.person_id
      WHERE a.id = ?
      LIMIT 1
      `,
      [accountId]
    )
    .then(([rows]) => rows[0]?.clan_id || null);
}

function isValidWebhookSecret(configuredSecret, receivedSecret) {
  if (!configuredSecret || !receivedSecret) return false;
  const expected = Buffer.from(String(configuredSecret));
  const received = Buffer.from(String(receivedSecret));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

// Manager chỉ được thao tác với payment của dòng họ mình; admin được thao tác tất cả.
async function canAccessPaymentClan(req, paymentClanId) {
  if (Number(req.user?.role_id) === 1) return true;
  const managerClanId = await getManagerClanId(req.user?.id);
  return managerClanId != null && Number(managerClanId) === Number(paymentClanId);
}

function getSepayQrUrl({ amount, orderCode }) {
  const bankBin = process.env.SEPAY_BANK_BIN;
  const bankAccount = process.env.SEPAY_BANK_ACCOUNT;
  const accountName = process.env.SEPAY_ACCOUNT_NAME || '';
  const template = process.env.SEPAY_QR_TEMPLATE || 'compact2';

  if (!bankBin || !bankAccount) {
    return null;
  }

  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: orderCode,
    accountName,
  });

  return `https://img.vietqr.io/image/${bankBin}-${bankAccount}-${template}.png?${params.toString()}`;
}

function extractSepayContent(payload = {}) {
  return String(
    payload.content ||
      payload.description ||
      payload.transferContent ||
      payload.transaction_content ||
      payload.reference ||
      ''
  );
}

function extractSepayAmount(payload = {}) {
  return normalizeAmount(
    payload.transferAmount ||
      payload.amount ||
      payload.money ||
      payload.creditAmount ||
      payload.transaction_amount ||
      0
  );
}

function getWebhookSecret(req, payload = {}) {
  const authorization = String(req.headers['authorization'] || '').trim();

  if (/^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  if (/^Apikey\s+/i.test(authorization)) {
    return authorization.replace(/^Apikey\s+/i, '').trim();
  }

  return String(
    req.headers['x-sepay-secret'] ||
      authorization ||
      payload.secret ||
      payload.apiKey ||
      ''
  ).trim();
}

function getSepayApiToken() {
  return (
    process.env.SEPAY_API_TOKEN ||
    process.env.SEPAY_USER_API_TOKEN ||
    process.env.SEPAY_BEARER_TOKEN ||
    ''
  ).trim();
}

function getPaymentPlanSnapshot(payment = {}) {
  if (payment.plan_snapshot_json && typeof payment.plan_snapshot_json === 'object') {
    return payment.plan_snapshot_json;
  }

  if (typeof payment.plan_snapshot_json === 'string') {
    try {
      return JSON.parse(payment.plan_snapshot_json);
    } catch (_) {
      // Fall through to the current plan columns.
    }
  }

  return {
    id: payment.plan_id,
    code: payment.plan_code,
    name: payment.plan_name,
    description: payment.plan_description || null,
    price_vnd: Number(payment.plan_price_vnd || payment.unit_amount_vnd || payment.amount_vnd || 0),
    billing_cycle: payment.plan_billing_cycle || payment.billing_cycle || 'monthly',
    person_limit: Number(payment.plan_person_limit || 0),
    account_limit: Number(payment.plan_account_limit || 0),
  };
}

function buildPurchaseFromPayment(payment = {}) {
  const billingCycle = payment.billing_cycle || payment.plan_billing_cycle || 'monthly';
  return {
    planSnapshot: getPaymentPlanSnapshot(payment),
    billingCycle,
    periodQuantity: Number(payment.period_quantity || 1),
    periodUnit: payment.period_unit || (billingCycle === 'yearly' ? 'year' : 'month'),
    periodMonths:
      payment.period_months === null || payment.period_months === undefined
        ? (billingCycle === 'yearly' ? 12 : 1)
        : Number(payment.period_months),
    unitAmountVnd: Number(payment.unit_amount_vnd || payment.plan_price_vnd || payment.amount_vnd || 0),
    totalAmountVnd: Number(payment.amount_vnd || 0),
  };
}

function normalizeTransactionContent(transaction = {}) {
  return String(
    transaction.transaction_content ||
      transaction.content ||
      transaction.description ||
      transaction.reference_number ||
      transaction.referenceCode ||
      transaction.code ||
      ''
  );
}

function getTransactionAmountIn(transaction = {}) {
  return normalizeAmount(
    transaction.amount_in ||
      transaction.transferAmount ||
      transaction.amount ||
      transaction.creditAmount ||
      0
  );
}

function transactionMatchesPayment(transaction = {}, payment = {}) {
  const orderCode = String(payment.order_code || '').trim();
  const content = normalizeTransactionContent(transaction);
  const reference = String(transaction.reference_number || transaction.referenceCode || '').trim();
  const code = String(transaction.code || '').trim();
  const transferType = String(transaction.transfer_type || transaction.transferType || 'in').toLowerCase();

  return (
    orderCode &&
    (content.includes(orderCode) || reference.includes(orderCode) || code.includes(orderCode)) &&
    transferType !== 'out' &&
    getTransactionAmountIn(transaction) === Number(payment.amount_vnd || 0)
  );
}

async function fetchSepayTransactionForPayment(payment = {}) {
  const apiToken = getSepayApiToken();

  if (!apiToken) {
    return {
      checked: false,
      reason: 'missing_api_token',
    };
  }

  if (typeof fetch !== 'function') {
    return {
      checked: false,
      reason: 'fetch_unavailable',
    };
  }

  const url = new URL('https://userapi.sepay.vn/v2/transactions');
  url.searchParams.set('q', payment.order_code);
  url.searchParams.set('transfer_type', 'in');
  url.searchParams.set('amount_in_min', String(payment.amount_vnd || 0));
  url.searchParams.set('amount_in_max', String(payment.amount_vnd || 0));
  url.searchParams.set('per_page', '20');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      checked: true,
      reason: 'api_error',
      status: response.status,
      data,
    };
  }

  const transactions = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.transactions)
      ? data.transactions
      : [];
  const matchedTransaction = transactions.find((transaction) => transactionMatchesPayment(transaction, payment));

  return {
    checked: true,
    transaction: matchedTransaction || null,
    transaction_count: transactions.length,
  };
}

async function markPaymentAsPaid(payment = {}, rawPayload = {}, source = 'sepay_webhook_paid') {
  const purchase = buildPurchaseFromPayment(payment);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
      UPDATE payments
      SET status = 'paid',
          paid_at = NOW(),
          period_started_at = NOW(),
          period_expires_at = CASE
            WHEN ? IS NULL THEN NULL
            ELSE DATE_ADD(NOW(), INTERVAL ? MONTH)
          END,
          raw_response = ?
      WHERE id = ?
      `,
      [
        purchase.periodMonths,
        purchase.periodMonths,
        JSON.stringify({
          type: source,
          sepay_payload: rawPayload,
          purchase,
        }),
        payment.id,
      ]
    );

    await connection.query(
      `
      INSERT INTO subscriptions (clan_id, plan_id, status, started_at, expires_at)
      VALUES (
        ?,
        ?,
        'active',
        NOW(),
        CASE
          WHEN ? IS NULL THEN NULL
          ELSE DATE_ADD(NOW(), INTERVAL ? MONTH)
        END
      )
      ON DUPLICATE KEY UPDATE
        plan_id = VALUES(plan_id),
        status = VALUES(status),
        started_at = VALUES(started_at),
        expires_at = VALUES(expires_at),
        cancelled_at = NULL
      `,
      [payment.clan_id, payment.plan_id, purchase.periodMonths, purchase.periodMonths]
    );

    await connection.commit();
    return purchase;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createSepayPayment(req, res) {
  try {
    await ensurePaymentPurchaseColumns();
    await cancelExpiredPendingPayments();
    const body = req.body || {};
    const planCode = String(body.plan_code || body.planCode || '').trim().toUpperCase();

    if (!planCode || planCode === 'FREE') {
      return res.status(400).json({
        success: false,
        message: 'Gói thanh toán không hợp lệ.',
      });
    }

    let clanId = Number(body.clan_id);

    if (Number(req.user.role_id) === 2) {
      clanId = await getManagerClanId(req.user.id);
    }

    if (!Number.isFinite(clanId) || clanId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Không xác định được dòng họ cần nâng cấp.',
      });
    }
    
    const [pendingPayments] = await db.query(
  `
  SELECT id, order_code, status, created_at
  FROM payments
  WHERE clan_id = ?
    AND status = 'pending'
    AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
  ORDER BY created_at DESC
  LIMIT 1
  `,
  [clanId]
);

if (pendingPayments.length) {
  return res.status(400).json({
    success: false,
    message:
      'Bạn đang có giao dịch chờ thanh toán. Vui lòng thanh toán hoặc hủy giao dịch đó trước khi tạo giao dịch mới.',
    payment: pendingPayments[0],
  });
}

    const [plans] = await db.query(
      `
      SELECT *
      FROM plans
      WHERE code = ?
        AND is_active = 1
        AND price_vnd > 0
      LIMIT 1
      `,
      [planCode]
    );

    if (!plans.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy gói thanh toán.',
      });
    }

    const plan = plans[0];
    const purchase = buildPurchaseSummary(plan, normalizePurchaseQuantity(body, plan));
    const orderCode = buildOrderCode(clanId);

    await db.query(
      `
      INSERT INTO payments
      (
        clan_id,
        plan_id,
        payer_account_id,
        provider,
        order_code,
        amount_vnd,
        unit_amount_vnd,
        period_quantity,
        period_unit,
        period_months,
        billing_cycle,
        plan_snapshot_json,
        status,
        raw_response
      )
      VALUES (?, ?, ?, 'sepay', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `,
      [
        clanId,
        plan.id,
        req.user.id,
        orderCode,
        purchase.totalAmountVnd,
        purchase.unitAmountVnd,
        purchase.periodQuantity,
        purchase.periodUnit,
        purchase.periodMonths,
        purchase.billingCycle,
        JSON.stringify(purchase.planSnapshot),
        JSON.stringify({
          type: 'sepay_create',
          plan_code: plan.code,
          purchase,
        }),
      ]
    );

    const qrUrl = getSepayQrUrl({
      amount: purchase.totalAmountVnd,
      orderCode,
    });

    return res.json({
      success: true,
      provider: 'sepay',
      order_code: orderCode,
      amount_vnd: purchase.totalAmountVnd,
      unit_amount_vnd: purchase.unitAmountVnd,
      period_quantity: purchase.periodQuantity,
      period_unit: purchase.periodUnit,
      period_months: purchase.periodMonths,
      billing_cycle: purchase.billingCycle,
      plan_snapshot: purchase.planSnapshot,
      transfer_content: orderCode,
      qr_url: qrUrl,
      bank_bin: process.env.SEPAY_BANK_BIN || null,
      bank_account: process.env.SEPAY_BANK_ACCOUNT || null,
      account_name: process.env.SEPAY_ACCOUNT_NAME || null,
      message: 'Tạo thanh toán SePay thành công.',
    });
  } catch (error) {
    console.error('createSepayPayment error:', error);

    return res.status(500).json({
      success: false,
      message: 'Không tạo được thanh toán SePay.',
      error: error.message,
    });
  }
}

async function handleSepayWebhook(req, res) {
  const payload = req.body || {};

  try {
    await ensurePaymentPurchaseColumns();
    await cancelExpiredPendingPayments();
    const configuredSecret = process.env.SEPAY_WEBHOOK_SECRET;
    const receivedSecret = getWebhookSecret(req, payload);

    // Bắt buộc có secret: thiếu cấu hình hoặc request không gửi secret đều bị từ chối.
    if (!isValidWebhookSecret(configuredSecret, receivedSecret)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook secret',
      });
    }

    const content = extractSepayContent(payload);
    const amount = extractSepayAmount(payload);

    if (!content || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Webhook thiếu nội dung hoặc số tiền.',
      });
    }

    const [payments] = await db.query(
      `
      SELECT
        pay.*,
        pl.code AS plan_code,
        pl.name AS plan_name,
        pl.description AS plan_description,
        pl.price_vnd AS plan_price_vnd,
        pl.billing_cycle AS plan_billing_cycle,
        pl.person_limit AS plan_person_limit,
        pl.account_limit AS plan_account_limit
      FROM payments pay
      INNER JOIN plans pl ON pl.id = pay.plan_id
      WHERE ? LIKE CONCAT('%', pay.order_code, '%')
        AND pay.provider = 'sepay'
      ORDER BY pay.id DESC
      LIMIT 1
      `,
      [content]
    );

    if (!payments.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy payment khớp nội dung chuyển khoản.',
      });
    }

    const payment = payments[0];
    const purchase = buildPurchaseFromPayment(payment);

if (payment.status === 'paid') {
  return res.json({
    success: true,
    message: 'Payment đã được xác nhận trước đó.',
  });
}

if (payment.status === 'cancelled') {
  return res.status(400).json({
    success: false,
    message: 'Giao dịch đã bị hủy hoặc quá hạn, không thể xác nhận thanh toán.',
  });
}

if (isPaymentOlderThan24Hours(payment)) {
  await db.query(
    `
    UPDATE payments
    SET status = 'cancelled',
        raw_response = ?
    WHERE id = ?
    `,
    [
      JSON.stringify({
        type: 'auto_cancel_after_24h',
        webhook_payload: payload,
      }),
      payment.id,
    ]
  );

  return res.status(400).json({
    success: false,
    message: 'Giao dịch đã quá 24 giờ, hệ thống đã tự động hủy giao dịch.',
  });
}
    if (Number(payment.amount_vnd) !== Number(amount)) {
      await db.query(
        `
        UPDATE payments
        SET raw_response = ?
        WHERE id = ?
        `,
        [JSON.stringify(payload), payment.id]
      );

      return res.status(400).json({
        success: false,
        message: 'Số tiền chuyển khoản không khớp payment.',
      });
    }

    await markPaymentAsPaid(payment, payload, 'sepay_webhook_paid');

    return res.json({
      success: true,
      message: 'XÃ¡c nháº­n thanh toÃ¡n SePay thÃ nh cÃ´ng.',
      purchase: {
        plan: purchase.planSnapshot,
        period_quantity: purchase.periodQuantity,
        period_unit: purchase.periodUnit,
        period_months: purchase.periodMonths,
        amount_vnd: purchase.totalAmountVnd,
      },
    });

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        `
        UPDATE payments
        SET status = 'paid',
            paid_at = NOW(),
            period_started_at = NOW(),
            period_expires_at = CASE
              WHEN ? IS NULL THEN NULL
              ELSE DATE_ADD(NOW(), INTERVAL ? MONTH)
            END,
            raw_response = ?
        WHERE id = ?
        `,
        [
          purchase.periodMonths,
          purchase.periodMonths,
          JSON.stringify({
            type: 'sepay_webhook_paid',
            webhook_payload: payload,
            purchase,
          }),
          payment.id,
        ]
      );

      await connection.query(
        `
        INSERT INTO subscriptions (clan_id, plan_id, status, started_at, expires_at)
        VALUES (
          ?,
          ?,
          'active',
          NOW(),
          CASE
            WHEN ? IS NULL THEN NULL
            ELSE DATE_ADD(NOW(), INTERVAL ? MONTH)
          END
        )
        ON DUPLICATE KEY UPDATE
          plan_id = VALUES(plan_id),
          status = VALUES(status),
          started_at = VALUES(started_at),
          expires_at = VALUES(expires_at),
          cancelled_at = NULL
        `,
        [payment.clan_id, payment.plan_id, purchase.periodMonths, purchase.periodMonths]
      );

      await connection.commit();

      return res.json({
        success: true,
        message: 'Xác nhận thanh toán SePay thành công.',
        purchase: {
          plan: purchase.planSnapshot,
          period_quantity: purchase.periodQuantity,
          period_unit: purchase.periodUnit,
          period_months: purchase.periodMonths,
          amount_vnd: purchase.totalAmountVnd,
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('handleSepayWebhook error:', error);

    return res.status(500).json({
      success: false,
      message: 'Lỗi xử lý webhook SePay.',
      error: error.message,
    });
  }
}

async function getPaymentStatus(req, res) {
  try {
     await ensurePaymentPurchaseColumns();
     await cancelExpiredPendingPayments();
    const orderCode = String(req.params.orderCode || '').trim();

    if (!orderCode) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu orderCode.',
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        pay.id,
        pay.clan_id,
        pay.plan_id,
        pl.code AS plan_code,
        pl.name AS plan_name,
        pl.description AS plan_description,
        pl.price_vnd AS plan_price_vnd,
        pl.billing_cycle AS plan_billing_cycle,
        pl.person_limit AS plan_person_limit,
        pl.account_limit AS plan_account_limit,
        pay.provider,
        pay.order_code,
        pay.amount_vnd,
        pay.unit_amount_vnd,
        pay.period_quantity,
        pay.period_unit,
        pay.period_months,
        pay.billing_cycle,
        pay.period_started_at,
        pay.period_expires_at,
        pay.plan_snapshot_json,
        pay.status,
        pay.paid_at,
        pay.created_at
      FROM payments pay
      LEFT JOIN plans pl ON pl.id = pay.plan_id
      WHERE pay.order_code = ?
      LIMIT 1
      `,
      [orderCode]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy payment.',
      });
    }

    const payment = rows[0];

    if (!(await canAccessPaymentClan(req, payment.clan_id))) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền với giao dịch này.',
      });
    }

    if (payment.status === 'pending' && isPaymentOlderThan24Hours(payment)) {
      await db.query(
        `
        UPDATE payments
        SET status = 'cancelled'
        WHERE id = ?
        `,
        [payment.id]
      );

      payment.status = 'cancelled';
    }

    if (payment.status === 'pending' && String(payment.provider || '').toLowerCase() === 'sepay') {
      const reconciliation = await fetchSepayTransactionForPayment(payment);

      if (reconciliation.transaction) {
        await markPaymentAsPaid(payment, reconciliation.transaction, 'sepay_reconciliation_paid');

        payment.status = 'paid';
        payment.paid_at = new Date();
        payment.reconciliation = {
          checked: true,
          matched: true,
          transaction_id: reconciliation.transaction.id || null,
        };
      } else {
        payment.reconciliation = {
          checked: reconciliation.checked,
          matched: false,
          reason: reconciliation.reason || null,
          status: reconciliation.status || null,
          transaction_count: reconciliation.transaction_count || 0,
        };
      }
    }

    return res.json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error('getPaymentStatus error:', error);

    return res.status(500).json({
      success: false,
      message: 'Không lấy được trạng thái thanh toán.',
      error: error.message,
    });
  }
}

async function cancelPendingPayment(req, res) {
  try {
    await ensurePaymentPurchaseColumns();
    await cancelExpiredPendingPayments();
    const { paymentId } = req.params;

    const [rows] = await db.query(
      `
      SELECT id, clan_id, status, created_at
      FROM payments
      WHERE id = ?
      LIMIT 1
      `,
      [paymentId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy giao dịch.',
      });
    }

    const payment = rows[0];

    if (!(await canAccessPaymentClan(req, payment.clan_id))) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền với giao dịch này.',
      });
    }
    if (payment.status === 'pending' && isPaymentOlderThan24Hours(payment)) {
  await db.query(
    `
    UPDATE payments
    SET status = 'cancelled'
    WHERE id = ?
    `,
    [payment.id]
  );

  payment.status = 'cancelled';
}

    if (String(payment.status || '').toLowerCase() !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể hủy giao dịch đang chờ thanh toán.',
      });
    }

    await db.query(
      `
      UPDATE payments
      SET status = 'cancelled'
      WHERE id = ?
      `,
      [paymentId]
    );

    return res.json({
      success: true,
      message: 'Đã hủy giao dịch chờ thanh toán.',
    });
  } catch (error) {
    console.error('cancelPendingPayment error:', error);

    return res.status(500).json({
      success: false,
      message: 'Không thể hủy giao dịch.',
      error: error.message,
    });
  }
}

module.exports = {
  createSepayPayment,
  handleSepayWebhook,
  getPaymentStatus,
  cancelPendingPayment,
};
