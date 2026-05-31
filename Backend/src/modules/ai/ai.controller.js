const { callGroq } = require('../chatbot/groqClient');

const VALID_EVENT_MODES = new Set(['event_create', 'task_create']);
const VALID_GENEALOGY_INPUT_SOURCES = new Set(['text', 'voice_transcript']);

function stripJsonBlock(value) {
    return String(value || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
}

function parseJsonObject(value) {
    const clean = stripJsonBlock(value);
    if (!clean) return null;
    try {
        return JSON.parse(clean);
    } catch (_) {
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            return JSON.parse(clean.slice(start, end + 1));
        } catch (_error) {
            return null;
        }
    }
}

function normalizeText(value, maxLength = null) {
    const text = String(value || '').trim();
    if (!text) return null;
    return maxLength ? text.slice(0, maxLength) : text;
}

function validIsoDate(value) {
    const text = normalizeText(value, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text || '') ? text : null;
}

function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return isoDate;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function normalizeEventMode(value) {
    return VALID_EVENT_MODES.has(value) ? value : 'event_create';
}

function fallbackEventForm(body = {}) {
    const mode = normalizeEventMode(body.mode);
    const today = validIsoDate(body.today) || new Date().toISOString().slice(0, 10);
    const taskCount = Number.isFinite(Number(body.requested_task_count))
        ? Math.min(Math.max(Math.round(Number(body.requested_task_count)), 1), 20)
        : 5;
    const currentEvent = body.current_event && typeof body.current_event === 'object' ? body.current_event : {};
    const prompt = normalizeText(body.prompt, 180) || 'Sự kiện dòng họ';
    const eventTitle = normalizeText(currentEvent.title, 120) || prompt.replace(/\.$/, '');

    return {
        status: 'success',
        mode,
        event: mode === 'task_create'
            ? currentEvent
            : {
                title: eventTitle,
                event_date: today,
                start_date: today,
                end_date: today,
                description: prompt,
            },
        manager_tasks: Array.from({ length: taskCount }, (_, index) => ({
            title: `Chuẩn bị hạng mục ${index + 1}`,
            description: `Kiểm tra và phân công công việc ${index + 1} cho sự kiện.`,
            due_date: addDays(today, Math.max(index - taskCount, -1)),
            suggested_role: 'manager',
            status: 'assigned',
        })),
    };
}

function normalizeEventFormResult(result, body) {
    const fallback = fallbackEventForm(body);
    const data = result && typeof result === 'object' ? result : {};
    const mode = normalizeEventMode(data.mode || body.mode);
    const rawEvent = data.event && typeof data.event === 'object' ? data.event : {};
    const rawTasks = Array.isArray(data.manager_tasks) ? data.manager_tasks : [];
    const taskLimit = Number.isFinite(Number(body.requested_task_count))
        ? Math.min(Math.max(Math.round(Number(body.requested_task_count)), 1), 20)
        : 20;

    const event = {
        ...fallback.event,
        title: normalizeText(rawEvent.title, 160) || fallback.event.title,
        event_date: validIsoDate(rawEvent.event_date) || fallback.event.event_date,
        start_date: validIsoDate(rawEvent.start_date) || validIsoDate(rawEvent.event_date) || fallback.event.start_date,
        end_date: validIsoDate(rawEvent.end_date) || validIsoDate(rawEvent.start_date) || validIsoDate(rawEvent.event_date) || fallback.event.end_date,
        description: normalizeText(rawEvent.description, 1000) || fallback.event.description,
    };

    const managerTasks = rawTasks
        .filter((task) => task && typeof task === 'object')
        .map((task, index) => ({
            title: normalizeText(task.title, 160) || `Chuẩn bị hạng mục ${index + 1}`,
            description: normalizeText(task.description, 1200) || '',
            due_date: validIsoDate(task.due_date) || fallback.manager_tasks[index % fallback.manager_tasks.length]?.due_date || event.start_date,
            suggested_role: normalizeText(task.suggested_role, 80) || 'manager',
            status: normalizeText(task.status, 40) || 'assigned',
        }))
        .filter((task) => task.title)
        .slice(0, taskLimit);

    return {
        status: data.status === 'unsupported' ? 'unsupported' : 'success',
        mode,
        event,
        manager_tasks: managerTasks.length ? managerTasks : fallback.manager_tasks.slice(0, taskLimit),
    };
}

function buildEventFormPrompt() {
    return `Bạn là AI chuyên sinh JSON cho form tạo sự kiện và công việc chuẩn bị của Gia Phả Việt.
Chỉ xử lý dữ liệu do input hiện tại cung cấp.
Không tự lấy, suy đoán hoặc nhắc tới dữ liệu ngoài input.
Không giải thích. Không markdown. Không dùng code fence.

Trả về JSON đúng schema:
{
  "status": "success",
  "mode": "event_create hoặc task_create",
  "event": {
    "title": "...",
    "event_date": "YYYY-MM-DD",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "description": "..."
  },
  "manager_tasks": [
    {
      "title": "...",
      "description": "...",
      "due_date": "YYYY-MM-DD",
      "suggested_role": "manager",
      "status": "assigned"
    }
  ]
}`;
}

function emptyGenealogyExtractResult() {
    return {
        members: [],
        relationships: [],
        uncertain_items: [],
        warnings: [],
        summary: {
            total_members_detected: 0,
            total_relationships_detected: 0,
            needs_human_review: true,
        },
    };
}

function appendWarning(result, warningType, message, relatedIds = []) {
    result.warnings.push({
        warning_type: warningType,
        message,
        related_ids: relatedIds,
    });
}

function normalizeGender(value) {
    const text = String(value || '').toLowerCase().trim();
    if (['male', 'nam', 'm', '1'].includes(text)) return 'male';
    if (['female', 'nu', 'nữ', 'f', '2'].includes(text)) return 'female';
    return null;
}

function normalizeGenealogyMember(member, index) {
    const temporaryId = normalizeText(member.temporary_id, 40) || normalizeText(member.id, 40) || `p${index}`;
    return {
        temporary_id: temporaryId,
        full_name: normalizeText(member.full_name || member.name, 255),
        gender: normalizeGender(member.gender),
        birth_year: Number.isFinite(Number(member.birth_year)) ? Number(member.birth_year) : null,
        death_year: Number.isFinite(Number(member.death_year)) ? Number(member.death_year) : null,
        birth_date: validIsoDate(member.birth_date),
        death_date: validIsoDate(member.death_date),
        hometown: normalizeText(member.hometown, 255),
        note: normalizeText(member.note, 1000),
        confidence: Math.max(0, Math.min(Number(member.confidence || 0.85), 1)),
    };
}

function normalizeGenealogyExtractResult(result, inputSource) {
    const output = emptyGenealogyExtractResult();
    const rawMembers = Array.isArray(result?.members) ? result.members : [];
    const idMap = new Map();

    rawMembers.forEach((member, index) => {
        if (!member || typeof member !== 'object') return;
        const normalized = normalizeGenealogyMember(member, index + 1);
        if (!normalized.full_name) return;
        idMap.set(String(member.temporary_id || member.id || normalized.temporary_id), normalized.temporary_id);
        idMap.set(normalized.temporary_id, normalized.temporary_id);
        output.members.push(normalized);
    });

    const memberIds = new Set(output.members.map((member) => member.temporary_id));
    const rawRelationships = Array.isArray(result?.relationships) ? result.relationships : [];
    rawRelationships.forEach((relation) => {
        if (!relation || typeof relation !== 'object') return;
        const type = normalizeText(relation.type, 40);
        if (type === 'parent_child') {
            const parent = idMap.get(String(relation.parent || relation.from || ''));
            const child = idMap.get(String(relation.child || relation.to || ''));
            if (!parent || !child || !memberIds.has(parent) || !memberIds.has(child)) return;
            output.relationships.push({
                type: 'parent_child',
                parent,
                child,
                confidence: Math.max(0, Math.min(Number(relation.confidence || 0.85), 1)),
                evidence: normalizeText(relation.evidence, 1000),
            });
        } else if (type === 'spouse') {
            const from = idMap.get(String(relation.from || relation.person1 || relation.husband || ''));
            const to = idMap.get(String(relation.to || relation.person2 || relation.wife || ''));
            if (!from || !to || !memberIds.has(from) || !memberIds.has(to)) return;
            output.relationships.push({
                type: 'spouse',
                from,
                to,
                confidence: Math.max(0, Math.min(Number(relation.confidence || 0.85), 1)),
                evidence: normalizeText(relation.evidence, 1000),
            });
        }
    });

    output.uncertain_items = Array.isArray(result?.uncertain_items) ? result.uncertain_items.slice(0, 20) : [];
    output.warnings = Array.isArray(result?.warnings) ? result.warnings.slice(0, 20) : [];

    if (inputSource === 'voice_transcript') {
        appendWarning(output, 'voice_transcript_review_required', 'Dữ liệu từ transcript giọng nói cần được kiểm tra lại.', []);
    }

    output.summary = {
        total_members_detected: output.members.length,
        total_relationships_detected: output.relationships.length,
        needs_human_review: true,
    };
    return output;
}

function buildGenealogyPrompt() {
    return `Bạn là AI Genealogy Data Assistant cho hệ thống quản lý gia phả.
Nhiệm vụ: trích xuất dữ liệu có cấu trúc từ mô tả gia đình.
Không ghi database. Không tự bịa người hoặc quan hệ không có trong input.

Chỉ trả JSON đúng schema:
{
  "members": [
    {
      "temporary_id": "p1",
      "full_name": "Nguyễn Văn A",
      "gender": "male hoặc female hoặc null",
      "birth_year": null,
      "death_year": null,
      "birth_date": null,
      "death_date": null,
      "hometown": null,
      "note": null,
      "confidence": 0.9
    }
  ],
  "relationships": [
    {"type": "parent_child", "parent": "p1", "child": "p2", "confidence": 0.9, "evidence": "..."},
    {"type": "spouse", "from": "p1", "to": "p3", "confidence": 0.9, "evidence": "..."}
  ],
  "uncertain_items": [],
  "warnings": []
}

Quan hệ hợp lệ chỉ gồm parent_child và spouse.
Nếu không chắc, đưa vào uncertain_items hoặc warnings.`;
}

exports.generateEventFormAI = async (req, res) => {
    try {
        const accountId = req.user?.account_id || req.user?.id || null;
        if (!accountId) {
            return res.status(401).json({
                success: false,
                message: 'Bạn cần đăng nhập để sử dụng AI lập kế hoạch sự kiện',
            });
        }

        const body = req.body || {};
        const normalizedPrompt = normalizeText(body.prompt);
        if (!normalizedPrompt) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập vấn đề hoặc yêu cầu cần AI lập kế hoạch',
            });
        }

        const aiPayload = {
            ...body,
            mode: normalizeEventMode(body.mode),
            prompt: normalizedPrompt,
            today: validIsoDate(body.today) || new Date().toISOString().slice(0, 10),
            account_id: accountId,
            user: {
                account_id: accountId,
                role: req.user?.role || null,
                role_id: req.user?.role_id || null,
                person_id: req.user?.person_id || null,
                clan_id: body.clan_id || req.user?.clan_id || null,
            },
        };
        const fallback = fallbackEventForm(aiPayload);
        const raw = await callGroq(buildEventFormPrompt(), JSON.stringify(aiPayload, null, 2), 1800);
        const parsed = raw ? parseJsonObject(raw) : null;
        const normalized = normalizeEventFormResult(parsed || fallback, aiPayload);
        return res.json({ success: true, ...normalized });
    } catch (error) {
        console.error('generateEventFormAI error:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể xử lý yêu cầu AI lập kế hoạch',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

exports.extractGenealogyAI = async (req, res) => {
    try {
        const accountId = req.user?.account_id || req.user?.id || null;
        if (!accountId) {
            return res.status(401).json({
                success: false,
                message: 'Bạn cần đăng nhập để sử dụng AI gia phả',
            });
        }

        const body = req.body || {};
        const prompt = normalizeText(body.prompt);
        const inputSource = VALID_GENEALOGY_INPUT_SOURCES.has(body.input_source) ? body.input_source : 'text';
        if (!prompt) {
            const result = emptyGenealogyExtractResult();
            appendWarning(result, 'empty_prompt', 'Prompt không được để trống.', []);
            return res.status(400).json(result);
        }

        const aiPayload = {
            input_source: inputSource,
            prompt,
            clan_id: body.clan_id || req.user?.clan_id || null,
            context: body.context || {},
            account_id: accountId,
            user: {
                account_id: accountId,
                role: req.user?.role || null,
                role_id: req.user?.role_id || null,
                person_id: req.user?.person_id || null,
                clan_id: body.clan_id || req.user?.clan_id || null,
            },
        };

        const raw = await callGroq(buildGenealogyPrompt(), JSON.stringify(aiPayload, null, 2), 2400);
        const parsed = raw ? parseJsonObject(raw) : null;
        const result = normalizeGenealogyExtractResult(parsed || {}, inputSource);
        if (!raw) {
            appendWarning(result, 'ai_model_unavailable', 'Chưa cấu hình GROQ_API_KEY hoặc AI tạm thời không phản hồi.', []);
        }
        return res.json(result);
    } catch (error) {
        console.error('extractGenealogyAI error:', error);
        const result = emptyGenealogyExtractResult();
        appendWarning(result, 'ai_generation_failed', 'AI không thể trích xuất dữ liệu gia phả lúc này.', []);
        return res.json(result);
    }
};
