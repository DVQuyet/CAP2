// Nội dung trang chủ công khai do admin quản lý.
// Mô hình: bảng landing_sections (mỗi mục trang chủ tối đa 1 dòng) + landing_items (danh sách trong mục).
// Chưa có dòng nào => API công khai trả null và giao diện dùng nội dung i18n mặc định (trang không đổi).
// Mục đã có dòng => chữ trống trong DB vẫn lấy mặc định i18n; danh sách chỉ lấy từ DB khi items_custom = 1.
const db = require('../../config/db');

const SECTION_KEYS = [
    'hero', 'about', 'features', 'stats', 'news', 'guide',
    // Đợt 12: phần còn lại của trang công khai
    'demo', 'benefits', 'benefits_why', 'news_latest', 'news_categories', 'news_subscribe',
    'guide_videos', 'faq', 'footer', 'footer_contact', 'footer_links', 'footer_social',
];
const SECTION_TEXT_FIELDS = ['tag', 'title', 'body', 'quote'];
const ITEM_TEXT_FIELDS = ['title', 'body', 'meta', 'link_label', 'content'];
const LANGS = ['vi', 'en'];
const CACHE_TTL_MS = 60 * 1000;
const NEWS_SECTION_KEY = 'news';
const CONTENT_COLUMNS = ['content_vi', 'content_en'];
const SOCIAL_ICONS = ['facebook', 'youtube', 'tiktok', 'zalo', 'instagram', 'x', 'linkedin', 'telegram', 'other'];
const CONTACT_ICONS = ['location_on', 'call', 'mail'];

const isMissingTable = (error) => error && (error.code === 'ER_NO_SUCH_TABLE' || /doesn't exist/i.test(error.message || ''));
const sectionTextColumns = SECTION_TEXT_FIELDS.flatMap((f) => LANGS.map((l) => `${f}_${l}`));
const itemTextColumns = ITEM_TEXT_FIELDS.flatMap((f) => LANGS.map((l) => `${f}_${l}`));

// Chỉ lưu văn bản thuần: <br> -> xuống dòng, bỏ thẻ HTML và ký tự điều khiển (giữ \n, \t).
function sanitizePlainText(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[a-z!][^>]*>/gi, '')
        .replace(/\r\n?/g, '\n')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim();
}

// Đường dẫn/URL an toàn: http(s) tuyệt đối hoặc đường dẫn nội bộ bắt đầu bằng "/" (không phải "//").
const SAFE_URL_RE = /^(https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']*)$/i;
function isSafeUrl(value) {
    return typeof value === 'string' && SAFE_URL_RE.test(value.trim());
}
function sanitizeUrl(value) {
    const text = String(value ?? '').trim();
    return text && isSafeUrl(text) ? text : '';
}

// Link chỉ https tuyệt đối (mạng xã hội).
function isHttpsUrl(value) {
    return typeof value === 'string' && /^https:\/\/[^\s<>"']+$/i.test(value.trim());
}

// Video hướng dẫn: chỉ https YouTube/Vimeo (watch, youtu.be, embed) hoặc https tới tệp .mp4; không cho nhúng nguồn tùy ý.
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
function isAllowedVideoUrl(value) {
    if (typeof value !== 'string') return false;
    let url;
    try { url = new URL(value.trim()); } catch { return false; }
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (YOUTUBE_HOSTS.has(host)) {
        if (host === 'youtu.be') return /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname);
        if (url.pathname === '/watch') return /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v') || '');
        return /^\/(embed|shorts)\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname);
    }
    if (VIMEO_HOSTS.has(host)) return /^\/(video\/)?\d{5,}\/?$/.test(url.pathname);
    return /\.mp4$/i.test(url.pathname);
}

class LandingValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LandingValidationError';
        this.status = 400;
    }
}

// Quy tắc riêng từng mục (ngoài schema chung): link video, link mạng xã hội, icon liên hệ/mạng xã hội.
function assertItemRules(sectionKey, fields) {
    if (sectionKey === 'guide_videos' && fields.link_url && !isAllowedVideoUrl(fields.link_url)) {
        throw new LandingValidationError('Video chỉ nhận liên kết https của YouTube, Vimeo hoặc tệp .mp4.');
    }
    if (sectionKey === 'footer_social') {
        if (fields.link_url && !isHttpsUrl(fields.link_url)) throw new LandingValidationError('Liên kết mạng xã hội chỉ nhận địa chỉ https://.');
        if (fields.icon && !SOCIAL_ICONS.includes(fields.icon.toLowerCase())) throw new LandingValidationError('Biểu tượng mạng xã hội không hợp lệ.');
    }
    if (sectionKey === 'footer_contact' && fields.icon && !CONTACT_ICONS.includes(fields.icon)) {
        throw new LandingValidationError('Biểu tượng liên hệ chỉ nhận location_on, call hoặc mail.');
    }
    if (sectionKey !== NEWS_SECTION_KEY && (fields.content_vi || fields.content_en)) {
        throw new LandingValidationError('Nội dung chi tiết chỉ dùng cho mục Tin tức.');
    }
}

// ---- Bộ nhớ đệm ngắn cho GET công khai, xóa mỗi khi admin ghi ----
const cache = new Map();
function invalidateLandingCache() {
    cache.clear();
}

async function ensureLandingSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS landing_sections (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            section_key VARCHAR(30) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_visible TINYINT(1) NOT NULL DEFAULT 1,
            items_custom TINYINT(1) NOT NULL DEFAULT 0,
            tag_vi VARCHAR(255) NULL, tag_en VARCHAR(255) NULL,
            title_vi VARCHAR(500) NULL, title_en VARCHAR(500) NULL,
            body_vi TEXT NULL, body_en TEXT NULL,
            quote_vi VARCHAR(1000) NULL, quote_en VARCHAR(1000) NULL,
            image_url VARCHAR(1000) NULL,
            updated_by INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_landing_section_key (section_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS landing_items (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            section_id INT NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_visible TINYINT(1) NOT NULL DEFAULT 1,
            title_vi VARCHAR(500) NULL, title_en VARCHAR(500) NULL,
            body_vi TEXT NULL, body_en TEXT NULL,
            meta_vi VARCHAR(255) NULL, meta_en VARCHAR(255) NULL,
            link_label_vi VARCHAR(255) NULL, link_label_en VARCHAR(255) NULL,
            content_vi MEDIUMTEXT NULL, content_en MEDIUMTEXT NULL,
            image_url VARCHAR(1000) NULL,
            link_url VARCHAR(1000) NULL,
            icon VARCHAR(60) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_landing_items_section (section_id, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Bảng đã có từ đợt 11: thêm cột nội dung bài tin (bỏ qua nếu đã có).
    for (const column of CONTENT_COLUMNS) {
        try {
            await db.query(`ALTER TABLE landing_items ADD COLUMN ${column} MEDIUMTEXT NULL AFTER link_label_en`);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }
    }
}

const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';

function mapItemAdmin(row) {
    const out = {
        id: row.id,
        section_id: row.section_id,
        sort_order: row.sort_order,
        is_visible: bool(row.is_visible),
        image_url: row.image_url || '',
        link_url: row.link_url || '',
        icon: row.icon || '',
    };
    itemTextColumns.forEach((c) => { out[c] = row[c] || ''; });
    return out;
}

function mapSectionAdmin(row, items) {
    const out = {
        id: row.id,
        section_key: row.section_key,
        sort_order: row.sort_order,
        is_visible: bool(row.is_visible),
        items_custom: bool(row.items_custom),
        image_url: row.image_url || '',
        updated_by: row.updated_by ?? null,
        updated_at: row.updated_at || null,
        items: items.map(mapItemAdmin),
    };
    sectionTextColumns.forEach((c) => { out[c] = row[c] || ''; });
    return out;
}

// Chữ theo ngôn ngữ: mục -> thiếu bản dịch thì dùng tiếng Việt; chữ cấp mục -> để trống cho giao diện lấy i18n mặc định.
function mapItemPublic(row, lang) {
    const pick = (f) => row[`${f}_${lang}`] || row[`${f}_vi`] || '';
    return {
        id: row.id,
        title: pick('title'),
        body: pick('body'),
        meta: pick('meta'),
        link_label: pick('link_label'),
        image_url: row.image_url || '',
        link_url: row.link_url || '',
        icon: row.icon || '',
        // Bài tin có nội dung chi tiết (nội dung dài chỉ trả ở endpoint chi tiết).
        has_content: Boolean(row.content_vi || row.content_en),
    };
}

function mapSectionPublic(row, items, lang) {
    if (!bool(row.is_visible)) {
        return { section_key: row.section_key, sort_order: row.sort_order, visible: false };
    }
    const out = {
        section_key: row.section_key,
        sort_order: row.sort_order,
        visible: true,
        image_url: row.image_url || '',
        items_custom: bool(row.items_custom),
        items: bool(row.items_custom) ? items.filter((i) => bool(i.is_visible)).map((i) => mapItemPublic(i, lang)) : [],
    };
    SECTION_TEXT_FIELDS.forEach((f) => { out[f] = row[`${f}_${lang}`] || ''; });
    return out;
}

function groupBySection(items) {
    const map = new Map();
    for (const item of items) {
        if (!map.has(item.section_id)) map.set(item.section_id, []);
        map.get(item.section_id).push(item);
    }
    return map;
}

async function loadAll() {
    const [sections] = await db.query('SELECT * FROM landing_sections ORDER BY sort_order ASC, id ASC');
    const [items] = await db.query('SELECT * FROM landing_items ORDER BY section_id ASC, sort_order ASC, id ASC');
    return { sections, grouped: groupBySection(items) };
}

// Trả null khi chưa có gì (hoặc chưa migrate): giao diện dùng mặc định.
async function getPublicLanding(lang = 'vi') {
    const language = lang === 'en' ? 'en' : 'vi';
    const hit = cache.get(language);
    if (hit && hit.expires > Date.now()) return hit.value;

    let value = null;
    try {
        const { sections, grouped } = await loadAll();
        if (sections.length) {
            value = { sections: {}, order: [] };
            for (const row of sections) {
                value.sections[row.section_key] = mapSectionPublic(row, grouped.get(row.id) || [], language);
                value.order.push(row.section_key);
            }
        }
    } catch (error) {
        if (!isMissingTable(error)) throw error;
        value = null;
    }
    cache.set(language, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
}

// Chi tiết một bài tin: chỉ khi mục Tin tức đang hiện, đã tùy chỉnh danh sách (items_custom) và bài đang hiện. Không thì null (404).
async function getPublicNewsItem(id, lang = 'vi') {
    const language = lang === 'en' ? 'en' : 'vi';
    let item;
    let section;
    try {
        const [items] = await db.query('SELECT * FROM landing_items WHERE id = ? LIMIT 1', [id]);
        item = items[0];
        if (!item || !bool(item.is_visible)) return null;
        const [sections] = await db.query('SELECT section_key, is_visible, items_custom FROM landing_sections WHERE id = ? LIMIT 1', [item.section_id]);
        section = sections[0];
    } catch (error) {
        if (isMissingTable(error)) return null;
        throw error;
    }
    if (!section || section.section_key !== NEWS_SECTION_KEY || !bool(section.is_visible) || !bool(section.items_custom)) return null;
    const base = mapItemPublic(item, language);
    return { ...base, content: item[`content_${language}`] || item.content_vi || '' };
}

async function getAdminLanding() {
    try {
        const { sections, grouped } = await loadAll();
        return { tableMissing: false, sections: sections.map((s) => mapSectionAdmin(s, grouped.get(s.id) || [])) };
    } catch (error) {
        if (isMissingTable(error)) return { tableMissing: true, sections: [] };
        throw error;
    }
}

// Giữ chỉ các cột chữ/URL hợp lệ, đã làm sạch.
function pickSectionFields(input = {}) {
    const out = {};
    for (const c of sectionTextColumns) if (input[c] !== undefined) out[c] = sanitizePlainText(input[c]);
    if (input.image_url !== undefined) out.image_url = sanitizeUrl(input.image_url);
    if (input.is_visible !== undefined) out.is_visible = bool(input.is_visible) ? 1 : 0;
    if (input.sort_order !== undefined && Number.isFinite(Number(input.sort_order))) out.sort_order = Number(input.sort_order);
    return out;
}

function pickItemFields(input = {}) {
    const out = {};
    for (const c of itemTextColumns) if (input[c] !== undefined) out[c] = sanitizePlainText(input[c]);
    if (input.image_url !== undefined) out.image_url = sanitizeUrl(input.image_url);
    if (input.link_url !== undefined) out.link_url = sanitizeUrl(input.link_url);
    if (input.icon !== undefined) out.icon = String(input.icon || '').replace(/[^a-z0-9_]/gi, '').slice(0, 60);
    if (input.is_visible !== undefined) out.is_visible = bool(input.is_visible) ? 1 : 0;
    if (input.sort_order !== undefined && Number.isFinite(Number(input.sort_order))) out.sort_order = Number(input.sort_order);
    return out;
}

const isMissingColumn = (error) => error && (error.code === 'ER_BAD_FIELD_ERROR' || /unknown column/i.test(error.message || ''));
const MISSING_COLUMN_MESSAGE = 'Chưa có cột nội dung bài tin. Hãy chạy migration 2026_10_30_site_content_more.sql.';

// Chưa migrate cột content_*: nếu giá trị đang ghi đều rỗng thì ghi lại không có cột đó, còn không thì báo lỗi rõ ràng.
async function withContentFallback(fields, run) {
    try {
        return await run(fields);
    } catch (error) {
        if (!isMissingColumn(error) || !CONTENT_COLUMNS.some((c) => c in fields)) throw error;
        if (CONTENT_COLUMNS.some((c) => fields[c])) {
            const wrapped = new Error(MISSING_COLUMN_MESSAGE);
            wrapped.code = 'ER_BAD_FIELD_ERROR';
            wrapped.migrationMissing = true;
            throw wrapped;
        }
        const rest = { ...fields };
        CONTENT_COLUMNS.forEach((c) => delete rest[c]);
        return run(rest);
    }
}

const defaultSortOrder = (key) => (SECTION_KEYS.indexOf(key) + 1) * 10;

// Tạo dòng mục nếu chưa có (giữ nguyên nếu đã có) rồi trả id.
async function ensureSectionRow(executor, key, accountId) {
    await executor.query(
        'INSERT IGNORE INTO landing_sections (section_key, sort_order, updated_by) VALUES (?, ?, ?)',
        [key, defaultSortOrder(key), accountId || null]
    );
    const [rows] = await executor.query('SELECT id FROM landing_sections WHERE section_key = ? LIMIT 1', [key]);
    return rows[0] ? rows[0].id : null;
}

async function updateSection(key, input, accountId) {
    const fields = pickSectionFields(input);
    const sectionId = await ensureSectionRow(db, key, accountId);
    const columns = Object.keys(fields);
    const sets = [...columns.map((c) => `${c} = ?`), 'updated_by = ?'];
    await db.query(`UPDATE landing_sections SET ${sets.join(', ')} WHERE id = ?`, [...columns.map((c) => fields[c]), accountId || null, sectionId]);
    invalidateLandingCache();
    return sectionId;
}

async function reorderSections(keys, accountId) {
    for (let i = 0; i < keys.length; i += 1) {
        const sectionId = await ensureSectionRow(db, keys[i], accountId);
        await db.query('UPDATE landing_sections SET sort_order = ?, updated_by = ? WHERE id = ?', [(i + 1) * 10, accountId || null, sectionId]);
    }
    invalidateLandingCache();
}

// "Khôi phục mặc định": xóa toàn bộ ghi đè của mục; giao diện quay lại i18n.
async function resetSection(key) {
    const [rows] = await db.query('SELECT id FROM landing_sections WHERE section_key = ? LIMIT 1', [key]);
    if (!rows.length) return false;
    await db.query('DELETE FROM landing_items WHERE section_id = ?', [rows[0].id]);
    await db.query('DELETE FROM landing_sections WHERE id = ?', [rows[0].id]);
    invalidateLandingCache();
    return true;
}

async function insertItem(executor, sectionId, fields, sortOrder) {
    const columns = ['section_id', 'sort_order', ...Object.keys(fields).filter((c) => c !== 'sort_order')];
    const values = [sectionId, sortOrder, ...columns.slice(2).map((c) => fields[c])];
    const [result] = await executor.query(
        `INSERT INTO landing_items (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        values
    );
    return result.insertId;
}

async function createItem(key, input, accountId) {
    const fields = pickItemFields(input);
    assertItemRules(key, fields);
    const sectionId = await ensureSectionRow(db, key, accountId);
    let sortOrder = fields.sort_order;
    if (sortOrder === undefined) {
        const [rows] = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM landing_items WHERE section_id = ?', [sectionId]);
        sortOrder = Number(rows[0]?.max_order || 0) + 10;
    }
    const id = await withContentFallback(fields, (f) => insertItem(db, sectionId, f, sortOrder));
    await db.query('UPDATE landing_sections SET items_custom = 1, updated_by = ? WHERE id = ?', [accountId || null, sectionId]);
    invalidateLandingCache();
    return id;
}

async function updateItem(itemId, input, accountId) {
    const fields = pickItemFields(input);
    const [rows] = await db.query('SELECT id, section_id FROM landing_items WHERE id = ? LIMIT 1', [itemId]);
    if (!rows.length) return false;
    const [owner] = await db.query('SELECT section_key FROM landing_sections WHERE id = ? LIMIT 1', [rows[0].section_id]);
    assertItemRules(owner[0] && owner[0].section_key, fields);
    if (Object.keys(fields).length) {
        await withContentFallback(fields, (f) => {
            const columns = Object.keys(f);
            return db.query(`UPDATE landing_items SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...columns.map((c) => f[c]), itemId]);
        });
    }
    await db.query('UPDATE landing_sections SET items_custom = 1, updated_by = ? WHERE id = ?', [accountId || null, rows[0].section_id]);
    invalidateLandingCache();
    return true;
}

async function deleteItem(itemId, accountId) {
    const [rows] = await db.query('SELECT id, section_id FROM landing_items WHERE id = ? LIMIT 1', [itemId]);
    if (!rows.length) return false;
    await db.query('DELETE FROM landing_items WHERE id = ?', [itemId]);
    // Xóa hết mục vẫn là chủ ý của admin: giữ items_custom = 1 để danh sách rỗng, không quay về mặc định.
    await db.query('UPDATE landing_sections SET items_custom = 1, updated_by = ? WHERE id = ?', [accountId || null, rows[0].section_id]);
    invalidateLandingCache();
    return true;
}

// ids: thứ tự mới của các mục trong cùng một section; id lạ/không thuộc section bị bỏ qua.
async function reorderItems(key, ids, accountId) {
    const [sections] = await db.query('SELECT id FROM landing_sections WHERE section_key = ? LIMIT 1', [key]);
    if (!sections.length) return false;
    const sectionId = sections[0].id;
    const [existing] = await db.query('SELECT id FROM landing_items WHERE section_id = ?', [sectionId]);
    const valid = new Set(existing.map((r) => Number(r.id)));
    const ordered = [...new Set(ids.map(Number))].filter((id) => valid.has(id));
    for (let i = 0; i < ordered.length; i += 1) {
        await db.query('UPDATE landing_items SET sort_order = ? WHERE id = ? AND section_id = ?', [(i + 1) * 10, ordered[i], sectionId]);
    }
    await db.query('UPDATE landing_sections SET items_custom = 1, updated_by = ? WHERE id = ?', [accountId || null, sectionId]);
    invalidateLandingCache();
    return true;
}

// "Lấy nội dung hiện tại": nhận nội dung mặc định (do giao diện dựng từ i18n vi/en) và ghi vào DB cho các mục chưa có.
// overwrite=true thay thế mục đã có. Trả danh sách mục đã tạo/bỏ qua.
async function seedSections(sections, { overwrite = false, accountId = null } = {}) {
    for (const input of sections) {
        for (const item of Array.isArray(input.items) ? input.items : []) assertItemRules(input.section_key, pickItemFields(item));
    }
    const conn = await db.getConnection();
    const seeded = [];
    const skipped = [];
    try {
        await conn.beginTransaction();
        for (const input of sections) {
            const key = input.section_key;
            const [existing] = await conn.query('SELECT id FROM landing_sections WHERE section_key = ? LIMIT 1', [key]);
            if (existing.length) {
                if (!overwrite) { skipped.push(key); continue; }
                await conn.query('DELETE FROM landing_items WHERE section_id = ?', [existing[0].id]);
                await conn.query('DELETE FROM landing_sections WHERE id = ?', [existing[0].id]);
            }
            const fields = pickSectionFields(input);
            const items = Array.isArray(input.items) ? input.items : [];
            const columns = ['section_key', 'sort_order', 'items_custom', 'updated_by', ...Object.keys(fields).filter((c) => c !== 'sort_order')];
            const values = [key, fields.sort_order ?? defaultSortOrder(key), items.length ? 1 : 0, accountId, ...columns.slice(4).map((c) => fields[c])];
            const [result] = await conn.query(
                `INSERT INTO landing_sections (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
                values
            );
            for (let i = 0; i < items.length; i += 1) {
                await withContentFallback(pickItemFields(items[i]), (f) => insertItem(conn, result.insertId, f, (i + 1) * 10));
            }
            seeded.push(key);
        }
        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
    invalidateLandingCache();
    return { seeded, skipped };
}

module.exports = {
    SECTION_KEYS,
    SECTION_TEXT_FIELDS,
    ITEM_TEXT_FIELDS,
    CACHE_TTL_MS,
    isMissingTable,
    isSafeUrl,
    isHttpsUrl,
    isAllowedVideoUrl,
    isMissingColumn,
    MISSING_COLUMN_MESSAGE,
    LandingValidationError,
    SOCIAL_ICONS,
    getPublicNewsItem,
    sanitizePlainText,
    sanitizeUrl,
    invalidateLandingCache,
    ensureLandingSchema,
    getPublicLanding,
    getAdminLanding,
    updateSection,
    reorderSections,
    resetSection,
    createItem,
    updateItem,
    deleteItem,
    reorderItems,
    seedSections,
};
