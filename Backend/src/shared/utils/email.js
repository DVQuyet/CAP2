const nodemailer = require("nodemailer");
const https = require("https");

// ─── Resend (HTTP API, không bị chặn port trên Render) ───────────────────────

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function sendViaResend({ to, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const from =
      process.env.RESEND_FROM ||
      process.env.SMTP_FROM ||
      "noreply@cap2.app";

    const body = JSON.stringify({ from, to, subject, text, html });

    const req = https.request(
      {
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Resend API error ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("Resend request timeout"));
    });
    req.write(body);
    req.end();
  });
}

// ─── SMTP (nodemailer) ────────────────────────────────────────────────────────

let cachedTransporter = null;
let cachedTransporterKey = null;

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    const err = new Error("SMTP_NOT_CONFIGURED");
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transporterKey = [
    process.env.SMTP_HOST,
    port,
    process.env.SMTP_USER,
    process.env.SMTP_PASS,
  ].join("|");

  if (cachedTransporter && cachedTransporterKey === transporterKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  cachedTransporterKey = transporterKey;
  return cachedTransporter;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Trả true nếu có ít nhất một phương thức gửi mail được cấu hình.
 */
function isEmailConfigured() {
  return isResendConfigured() || isSmtpConfigured();
}

async function sendMail({ to, subject, text, html }) {
  // Ưu tiên Resend vì không bị chặn port trên Render/cloud
  if (isResendConfigured()) {
    return sendViaResend({ to, subject, text, html });
  }

  // Fallback: SMTP
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  return transporter.sendMail({ from, to, subject, text, html });
}

module.exports = {
  isSmtpConfigured: isEmailConfigured, // giữ tên cũ để không break code khác
  sendMail,
};
