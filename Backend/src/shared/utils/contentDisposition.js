// Tên file người dùng đặt có thể chứa tiếng Việt có dấu hoặc ký tự điều khiển: đưa thẳng vào header
// làm res.setHeader ném ERR_INVALID_CHAR (500). Dùng filename ASCII dự phòng + filename* (RFC 5987).
function buildContentDisposition(disposition, originalName) {
    const name = String(originalName || '').replace(/[\x00-\x1f\x7f\/"]/g, '').trim() || 'file';
    const ascii = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/[%;,]/g, '_');
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

module.exports = { buildContentDisposition };
