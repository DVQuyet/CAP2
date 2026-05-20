const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8001';

const AI_EVENT_FORM_TIMEOUT_MS = Number(process.env.AI_EVENT_FORM_TIMEOUT_MS || 15000);
const AI_GENEALOGY_EXTRACT_TIMEOUT_MS = Number(process.env.AI_GENEALOGY_EXTRACT_TIMEOUT_MS || 20000);

async function postJsonWithTimeout(url, payload, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        const text = await response.text();

        let data = null;

        try {
            data = text ? JSON.parse(text) : null;
        } catch (_) {
            data = {
                success: false,
                message: text || 'AI server returned non-JSON response',
            };
        }

        return {
            ok: response.ok,
            status: response.status,
            data,
        };
    } finally {
        clearTimeout(timeout);
    }
}

exports.generateEventFormAI = async (req, res) => {
    try {
        const accountId = req.user?.account_id || req.user?.id || null;
        const role = req.user?.role || null;
        const roleId = req.user?.role_id || null;

        if (!accountId) {
            return res.status(401).json({
                success: false,
                message: 'Bạn cần đăng nhập để sử dụng AI lập kế hoạch sự kiện',
            });
        }

        const {
            prompt,
            mode,
            today,
            clan_id,
            current_event,
            existing_tasks,
            context,
            requested_task_count,
        } = req.body || {};

        const normalizedPrompt = String(prompt || '').trim();

        if (!normalizedPrompt) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập vấn đề hoặc yêu cầu cần AI lập kế hoạch',
            });
        }

        const normalizedTaskCount = Number.isFinite(Number(requested_task_count))
            ? Math.min(Math.max(Math.round(Number(requested_task_count)), 1), 20)
            : undefined;

        const aiPayload = {
            mode: mode || 'event_create',
            prompt: normalizedPrompt,
            today: today || new Date().toISOString().slice(0, 10),
            clan_id: clan_id || req.user?.clan_id || null,
            current_event: current_event || null,
            existing_tasks: Array.isArray(existing_tasks) ? existing_tasks : [],
            requested_task_count: normalizedTaskCount,
            context: context || {},
            account_id: accountId,
            role,
            role_id: roleId,
            user: {
                account_id: accountId,
                role,
                role_id: roleId,
                person_id: req.user?.person_id || null,
                clan_id: clan_id || req.user?.clan_id || null,
            },
        };

        let aiResult;

        try {
            aiResult = await postJsonWithTimeout(
                `${AI_SERVER_URL}/event-form/generate`,
                aiPayload,
                AI_EVENT_FORM_TIMEOUT_MS
            );
        } catch (error) {
            const isAbort = error.name === 'AbortError';

            return res.status(504).json({
                success: false,
                message: isAbort
                    ? 'AI lập kế hoạch phản hồi quá lâu, vui lòng thử lại'
                    : 'Không thể kết nối AI lập kế hoạch',
                code: isAbort ? 'AI_EVENT_FORM_TIMEOUT' : 'AI_EVENT_FORM_UNAVAILABLE',
            });
        }

        if (!aiResult.ok) {
            return res.status(aiResult.status || 502).json({
                success: false,
                message: aiResult.data?.message || 'AI không thể lập kế hoạch lúc này',
                code: aiResult.data?.code || 'AI_EVENT_FORM_ERROR',
                detail: process.env.NODE_ENV === 'development' ? aiResult.data : undefined,
            });
        }

        return res.json(aiResult.data);
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
        const role = req.user?.role || null;
        const roleId = req.user?.role_id || null;

        if (!accountId) {
            return res.status(401).json({
                success: false,
                message: 'Bạn cần đăng nhập để sử dụng AI gia phả',
            });
        }

        const { input_source, prompt, clan_id, context } = req.body || {};
        const normalizedPrompt = String(prompt || '').trim();
        const normalizedInputSource = input_source === 'voice_transcript' ? 'voice_transcript' : 'text';

        if (!normalizedPrompt) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập mô tả gia đình hoặc transcript cần AI trích xuất',
            });
        }

        const aiPayload = {
            input_source: normalizedInputSource,
            prompt: normalizedPrompt,
            clan_id: clan_id || req.user?.clan_id || null,
            context: context || {},
            account_id: accountId,
            role,
            role_id: roleId,
            user: {
                account_id: accountId,
                role,
                role_id: roleId,
                person_id: req.user?.person_id || null,
                clan_id: clan_id || req.user?.clan_id || null,
            },
        };

        let aiResult;

        try {
            aiResult = await postJsonWithTimeout(
                `${AI_SERVER_URL}/genealogy/extract`,
                aiPayload,
                AI_GENEALOGY_EXTRACT_TIMEOUT_MS
            );
        } catch (error) {
            const isAbort = error.name === 'AbortError';

            return res.status(504).json({
                success: false,
                message: isAbort
                    ? 'AI gia phả phản hồi quá lâu, vui lòng thử lại'
                    : 'Không thể kết nối AI gia phả',
                code: isAbort ? 'AI_GENEALOGY_TIMEOUT' : 'AI_GENEALOGY_UNAVAILABLE',
            });
        }

        if (!aiResult.ok) {
            return res.status(aiResult.status || 502).json({
                success: false,
                message: aiResult.data?.message || 'AI gia phả không thể trích xuất dữ liệu lúc này',
                code: aiResult.data?.code || 'AI_GENEALOGY_ERROR',
                detail: process.env.NODE_ENV === 'development' ? aiResult.data : undefined,
            });
        }

        return res.json(aiResult.data);
    } catch (error) {
        console.error('extractGenealogyAI error:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể xử lý yêu cầu AI gia phả',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};
