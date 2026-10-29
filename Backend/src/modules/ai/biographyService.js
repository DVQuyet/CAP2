// Soạn bản nháp tiểu sử / lời tưởng niệm: gọi LLM, kiểm tra không bịa (answerGroundingService), lỗi thì dùng bản mẫu tất định.
// Không bao giờ ghi vào bảng people: người dùng đọc, sửa rồi tự bấm Lưu (member vẫn đi qua kiểm duyệt pending_bio).
const db = require('../../config/db');
const { callGroq } = require('../chatbot/groqClient');
const { checkGrounding } = require('../chatbot/answerGroundingService');
const { assertCanManagePersonId } = require('../manager/managerClan.service');
const { assertTreeMutationPermission } = require('../../shared/utils/treeEditPermissions');
const { buildBiographyPrompt, buildBiographyUserContent } = require('./biographyPrompt');
const { buildTemplateBiography } = require('./biographyTemplate');

const MODEL_OPTIONS = { timeout: Number(process.env.BIOGRAPHY_TIMEOUT_MS || 15000), maxRetries: 0 };
const MAX_DRAFT_CHARS = 4000;
const MAX_FACTS_USED = 12;

function parseModelJson(value) {
    const clean = String(value || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    if (!clean) return null;
    try {
        return JSON.parse(clean);
    } catch (_) {
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try { return JSON.parse(clean.slice(start, end + 1)); } catch (_error) { return null; }
    }
}

// Bản nháp không được chứa thông tin liên lạc dù dữ kiện đã loại chúng (LLM có thể tự thêm).
const CONTACT_PATTERN = /@|\d{9,}/;

async function generateBiographyDraft(facts, options = {}, { callModel = callGroq } = {}) {
    const system = buildBiographyPrompt(options);
    let rejected = false;
    let retryHint = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const raw = await callModel(system, buildBiographyUserContent(facts, { retryHint }), 900, MODEL_OPTIONS);
        if (!raw) break; // không có key / Groq lỗi: dùng bản mẫu
        const parsed = parseModelJson(raw);
        const draft = typeof parsed?.draft === 'string' ? parsed.draft.trim().slice(0, MAX_DRAFT_CHARS) : '';
        if (!draft) break;

        const grounding = checkGrounding(draft, facts);
        if (grounding.ok && !CONTACT_PATTERN.test(draft)) {
            const used = Array.isArray(parsed.facts_used)
                ? parsed.facts_used.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().slice(0, 200)).slice(0, MAX_FACTS_USED)
                : [];
            return { draft, facts_used: used, source: 'ai', warnings: rejected ? ['ai_retried'] : [] };
        }
        rejected = true;
        retryHint = [...grounding.unknownNames, ...grounding.unknownNumbers].join(', ') || 'thông tin liên lạc';
    }

    return {
        draft: buildTemplateBiography(facts, options),
        facts_used: [],
        source: 'template',
        warnings: [rejected ? 'ai_ungrounded' : 'ai_unavailable'],
    };
}

// Quyền soạn bản nháp = quyền sửa hồ sơ người đó: admin/manager (manager chỉ trong dòng họ mình), member với hồ sơ của chính mình
// hoặc khi có khóa sửa cây tạm thời còn hạn bao phủ người đó. Người ngoài dòng họ nhận 404 để không lộ sự tồn tại.
async function assertCanDraftBiography(req, personId) {
    const gate = await assertCanManagePersonId(req, personId);
    if (!gate.ok) {
        if (gate.status === 403) return { ok: false, status: 404, message: 'Không tìm thấy người trong gia phả.' };
        return gate;
    }
    const roleId = Number(req.user?.role_id);
    if (roleId === 1 || roleId === 2) return { ok: true, person: gate.person };

    const [rows] = await db.query('SELECT person_id FROM accounts WHERE id = ? LIMIT 1', [req.user.id]);
    const ownPersonId = Number(rows[0]?.person_id);
    if (ownPersonId && ownPersonId === Number(personId)) return { ok: true, person: gate.person };

    const permission = await assertTreeMutationPermission(req, { action: 'update_person', affectedPersonIds: [Number(personId)] });
    if (permission.ok) return { ok: true, person: gate.person };
    return { ok: false, status: 404, message: 'Không tìm thấy người trong gia phả.' };
}

module.exports = { generateBiographyDraft, assertCanDraftBiography };
