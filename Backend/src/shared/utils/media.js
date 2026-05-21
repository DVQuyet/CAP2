const fs = require('fs');
const path = require('path');
const db = require('../../config/db');

const API_MEDIA_PREFIX = '/api/media/';
const MAX_IMAGE_SIZE_BYTES = Number(process.env.MAX_IMAGE_UPLOAD_BYTES || 5 * 1024 * 1024);
const MAX_POST_MEDIA_SIZE_BYTES = Number(process.env.MAX_POST_MEDIA_UPLOAD_BYTES || 50 * 1024 * 1024);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const ALLOWED_POST_MEDIA_MIME_TYPES = new Set([
  ...ALLOWED_IMAGE_MIME_TYPES,
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);

function isAllowedImageMimeType(mimeType) {
  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  return ALLOWED_IMAGE_MIME_TYPES.has(mime);
}

function isAllowedPostMediaMimeType(mimeType) {
  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  return ALLOWED_POST_MEDIA_MIME_TYPES.has(mime) || mime.startsWith('video/') || mime.startsWith('audio/');
}

function getMediaUrl(req, mediaId) {
  if (!mediaId) return null;
  const baseUrl = process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return `${String(baseUrl).replace(/\/$/, '')}${API_MEDIA_PREFIX}${mediaId}`;
}

function normalizeMediaId(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function looksLikeMediaUrl(value) {
  return typeof value === 'string' && value.includes(API_MEDIA_PREFIX);
}

function extractMediaIdFromUrl(value) {
  if (!looksLikeMediaUrl(value)) return null;
  const match = String(value).match(/\/api\/media\/(\d+)/);
  return match ? normalizeMediaId(match[1]) : null;
}

async function createMediaFile({
  ownerAccountId = null,
  ownerPersonId = null,
  clanId = null,
  usageType = 'other',
  originalFilename = null,
  mimeType,
  fileSizeBytes,
  imageBuffer,
}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('INVALID_IMAGE_BUFFER');
  }

  const safeUsageType = [
    'avatar',
    'pending_avatar',
    'post_image',
    'photo_restore_original',
    'photo_restore_result',
    'other',
  ].includes(usageType) ? usageType : 'other';

  const [result] = await db.query(
    `INSERT INTO media_files (
       owner_account_id,
       owner_person_id,
       clan_id,
       usage_type,
       original_filename,
       mime_type,
       file_size_bytes,
       image_data
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerAccountId,
      ownerPersonId,
      clanId,
      safeUsageType,
      originalFilename,
      mimeType,
      fileSizeBytes,
      imageBuffer,
    ]
  );

  return result.insertId;
}

async function getUploadContext(accountId) {
  if (!accountId) return { ownerPersonId: null, clanId: null };
  const [rows] = await db.query(
    `SELECT a.person_id AS owner_person_id,
            COALESCE(p.clan_id, ac.clan_id) AS clan_id
     FROM accounts a
     LEFT JOIN people p ON p.id = a.person_id
     LEFT JOIN account_clans ac ON ac.account_id = a.id AND ac.status = 'active'
     WHERE a.id = ?
     ORDER BY ac.id ASC
     LIMIT 1`,
    [accountId]
  );
  return rows[0] || { ownerPersonId: null, clanId: null };
}

function resolveLocalUploadPath(rawUrlOrPath, backendRoot = path.resolve(__dirname, '..', '..')) {
  if (!rawUrlOrPath) return null;
  let text = String(rawUrlOrPath).trim();
  if (!text || looksLikeMediaUrl(text) || /^data:/i.test(text)) return null;

  try {
    if (/^https?:\/\//i.test(text)) {
      const parsed = new URL(text);
      text = parsed.pathname;
    }
  } catch (_) {}

  text = text.replace(/\\/g, '/');
  const uploadsIndex = text.toLowerCase().lastIndexOf('/uploads/');
  if (uploadsIndex >= 0) {
    text = text.slice(uploadsIndex + '/uploads/'.length);
  } else if (text.toLowerCase().startsWith('uploads/')) {
    text = text.slice('uploads/'.length);
  }

  text = decodeURIComponent(text).replace(/^\/+/, '');
  if (!text || text.includes('..')) return null;

  return path.join(backendRoot, 'uploads', text);
}

function detectMimeTypeFromFile(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

async function createMediaFromLocalFile({ rawUrlOrPath, usageType, ownerAccountId = null, ownerPersonId = null, clanId = null, backendRoot }) {
  const filePath = resolveLocalUploadPath(rawUrlOrPath, backendRoot);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) return null;
  const mimeType = detectMimeTypeFromFile(filePath);
  if (!isAllowedImageMimeType(mimeType)) return null;
  const buffer = fs.readFileSync(filePath);
  return createMediaFile({
    ownerAccountId,
    ownerPersonId,
    clanId,
    usageType,
    originalFilename: path.basename(filePath),
    mimeType,
    fileSizeBytes: buffer.length,
    imageBuffer: buffer,
  });
}

module.exports = {
  API_MEDIA_PREFIX,
  MAX_IMAGE_SIZE_BYTES,
  MAX_POST_MEDIA_SIZE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_POST_MEDIA_MIME_TYPES,
  isAllowedImageMimeType,
  isAllowedPostMediaMimeType,
  getMediaUrl,
  normalizeMediaId,
  extractMediaIdFromUrl,
  looksLikeMediaUrl,
  createMediaFile,
  getUploadContext,
  resolveLocalUploadPath,
  detectMimeTypeFromFile,
  createMediaFromLocalFile,
};
