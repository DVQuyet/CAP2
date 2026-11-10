const service = require('./siteContent.service');

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const accountIdOf = (req) => req.user?.id || req.user?.account_id || null;

const TABLE_MISSING_MESSAGE = 'Chưa tạo bảng nội dung trang chủ. Hãy chạy migration 2026_10_30_site_content.sql.';

function handleError(res, error, label) {
    if (error && error.status === 400 && error.name === 'LandingValidationError') return fail(res, 400, error.message);
    if (error && error.migrationMissing) return fail(res, 503, service.MISSING_COLUMN_MESSAGE);
    if (service.isMissingTable(error)) return fail(res, 503, TABLE_MISSING_MESSAGE);
    console.error(`${label}:`, error);
    return fail(res, 500, 'Không thể xử lý nội dung trang chủ');
}

// ---- Công khai ----
// content = null khi admin chưa chỉnh gì (hoặc chưa migrate) -> giao diện dùng nội dung i18n mặc định.
async function getPublicLanding(req, res) {
    try {
        const lang = String(req.query.lang || 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi';
        const content = await service.getPublicLanding(lang);
        res.set({ 'Cache-Control': 'public, max-age=30' });
        return res.json({ success: true, lang, content });
    } catch (error) {
        console.error('getPublicLanding error:', error);
        // Lỗi DB không được làm vỡ trang chủ: trả null để dùng mặc định.
        return res.json({ success: true, lang: 'vi', content: null });
    }
}

// Chi tiết một bài tin (đã có nội dung chi tiết hoặc chỉ mục hiển thị); ẩn/không tồn tại -> 404.
async function getPublicNewsItem(req, res) {
    try {
        const lang = String(req.query.lang || 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi';
        const item = await service.getPublicNewsItem(req.params.id, lang);
        if (!item) return fail(res, 404, 'Không tìm thấy bài viết');
        res.set({ 'Cache-Control': 'public, max-age=30' });
        return res.json({ success: true, lang, item });
    } catch (error) {
        console.error('getPublicNewsItem error:', error);
        return fail(res, 500, 'Không thể tải bài viết');
    }
}

// ---- Admin ----
async function getAdminLanding(req, res) {
    try {
        const data = await service.getAdminLanding();
        return res.json({ success: true, ...data });
    } catch (error) {
        return handleError(res, error, 'getAdminLanding');
    }
}

async function updateSection(req, res) {
    try {
        await service.updateSection(req.params.key, req.body || {}, accountIdOf(req));
        return res.json({ success: true });
    } catch (error) {
        return handleError(res, error, 'updateSection');
    }
}

async function reorderSections(req, res) {
    try {
        await service.reorderSections(req.body.keys, accountIdOf(req));
        return res.json({ success: true });
    } catch (error) {
        return handleError(res, error, 'reorderSections');
    }
}

async function resetSection(req, res) {
    try {
        const removed = await service.resetSection(req.params.key);
        return res.json({ success: true, removed });
    } catch (error) {
        return handleError(res, error, 'resetSection');
    }
}

async function createItem(req, res) {
    try {
        const id = await service.createItem(req.params.key, req.body || {}, accountIdOf(req));
        return res.status(201).json({ success: true, id });
    } catch (error) {
        return handleError(res, error, 'createItem');
    }
}

async function updateItem(req, res) {
    try {
        const ok = await service.updateItem(req.params.id, req.body || {}, accountIdOf(req));
        if (!ok) return fail(res, 404, 'Không tìm thấy mục');
        return res.json({ success: true });
    } catch (error) {
        return handleError(res, error, 'updateItem');
    }
}

async function deleteItem(req, res) {
    try {
        const ok = await service.deleteItem(req.params.id, accountIdOf(req));
        if (!ok) return fail(res, 404, 'Không tìm thấy mục');
        return res.json({ success: true });
    } catch (error) {
        return handleError(res, error, 'deleteItem');
    }
}

async function reorderItems(req, res) {
    try {
        const ok = await service.reorderItems(req.params.key, req.body.ids, accountIdOf(req));
        if (!ok) return fail(res, 404, 'Mục chưa có nội dung tùy chỉnh');
        return res.json({ success: true });
    } catch (error) {
        return handleError(res, error, 'reorderItems');
    }
}

async function seed(req, res) {
    try {
        const result = await service.seedSections(req.body.sections, {
            overwrite: req.body.overwrite === true,
            accountId: accountIdOf(req),
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return handleError(res, error, 'seedLanding');
    }
}

module.exports = {
    getPublicLanding, getPublicNewsItem, getAdminLanding, updateSection, reorderSections, resetSection,
    createItem, updateItem, deleteItem, reorderItems, seed,
};
