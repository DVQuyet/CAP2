const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { getJwtSecret } = require('../../config/jwt');
const { ensureMediaAccessKeyColumn, isValidMediaAccessKey } = require('../../shared/utils/media');
const router = express.Router();

function readRequestToken(req) {
  const header = String(req.headers.authorization || '');
  if (header.startsWith('Bearer ')) return header.slice(7);
  return typeof req.query.token === 'string' ? req.query.token : null;
}

// Người xem đã đăng nhập được xem media của dòng họ mình (admin xem tất cả).
async function canViewerAccessMedia(req, file) {
  const token = readRequestToken(req);
  if (!token) return false;

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (_) {
    return false;
  }

  const accountId = Number(decoded.id || decoded.account_id);
  if (!Number.isFinite(accountId) || accountId <= 0) return false;
  if (Number(decoded.role_id) === 1) return true;
  if (Number(file.owner_account_id) === accountId) return true;
  if (file.clan_id == null) return true;

  const [rows] = await db.query(
    `SELECT 1
     FROM accounts a
     LEFT JOIN people p ON p.id = a.person_id
     LEFT JOIN account_clans ac ON ac.account_id = a.id AND ac.status = 'active'
     WHERE a.id = ? AND (p.clan_id = ? OR ac.clan_id = ?)
     LIMIT 1`,
    [accountId, file.clan_id, file.clan_id]
  );
  return rows.length > 0;
}

router.get('/:id', async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      return res.status(400).send('Invalid media id');
    }

    await ensureMediaAccessKeyColumn();
    const [rows] = await db.query(
      `SELECT original_filename, mime_type, file_size_bytes, image_data, created_at,
              access_key, owner_account_id, clan_id
       FROM media_files WHERE id = ? LIMIT 1`,
      [mediaId]
    );

    if (!rows.length) {
      return res.status(404).send('Image not found');
    }

    const file = rows[0];

    // Media cũ (chưa có access_key) giữ nguyên hành vi công khai để không vỡ URL đã lưu.
    let cacheControl = 'public, max-age=31536000, immutable';
    if (file.access_key && !isValidMediaAccessKey(file.access_key, req.query.k)) {
      if (!(await canViewerAccessMedia(req, file))) {
        // Trả 404 thay vì 403 để không xác nhận media tồn tại.
        return res.status(404).send('Image not found');
      }
      cacheControl = 'private, max-age=3600';
    }

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', file.image_data.length);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (file.original_filename) {
      res.setHeader('Content-Disposition', `inline; filename="${String(file.original_filename).replace(/"/g, '')}"`);
    }
    return res.send(file.image_data);
  } catch (error) {
    console.error('read media error:', error);
    return res.status(500).send('Cannot load image');
  }
});

module.exports = router;
