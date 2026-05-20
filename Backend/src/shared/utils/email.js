const nodemailer = require("nodemailer");

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

  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
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
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  cachedTransporterKey = transporterKey;
  return cachedTransporter;
}

async function sendMail({ to, subject, text, html }) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transporter.sendMail({ from, to, subject, text, html });
}

module.exports = {
  isSmtpConfigured,
  sendMail,
};
