const express = require('express');
const db = require('../../config/db');

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      return res.status(400).send('Invalid media id');
    }

    const [rows] = await db.query(
      'SELECT original_filename, mime_type, file_size_bytes, image_data, created_at FROM media_files WHERE id = ? LIMIT 1',
      [mediaId]
    );

    if (!rows.length) {
      return res.status(404).send('Image not found');
    }

    const file = rows[0];
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', file.image_data.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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
