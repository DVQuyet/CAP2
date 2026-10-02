// Các intent trả lời từ dữ liệu dòng họ (thông tin người, lịch sử, ký ức, thống kê, sự kiện,
// trò chuyện chung). Tách khỏi chatbotController để controller chỉ còn điều phối.
const relationshipEngine = require('./relationshipEngine');
const memberSearch = require('./memberSearchService');
const chatbotAI = require('./chatbotAI');
const { resolveKinshipReference } = require('./kinshipReferenceService');
const { toPositiveId, queryOptional } = require('./chatbotUtils');

function firstEntity(plan) {
    if (Array.isArray(plan?.entities)) return plan.entities.find(Boolean) || null;
    if (plan?.entities && typeof plan.entities === 'object') {
        return plan.entities.name || plan.entities.targetName || plan.entities.personName || null;
    }
    return null;
}

function formatDateOnly(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        // mysql2 trả cột DATE là nửa đêm giờ địa phương; toISOString() sẽ lùi 1 ngày ở múi giờ +7.
        const pad = (number) => String(number).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    return String(value).slice(0, 10);
}

function formatPersonSummary(person = {}) {
    const details = [
        person.generation ? `đời thứ ${person.generation}` : null,
        person.branch ? `chi/nhánh ${person.branch}` : null,
        person.birth_date ? `sinh năm ${String(person.birth_date).slice(0, 4)}` : null,
        person.death_date ? `mất năm ${String(person.death_date).slice(0, 4)}` : null,
        person.role_name ? `vai trò ${person.role_name}` : null,
    ].filter(Boolean);
    return details.length ? ` Người này thuộc ${details.join(', ')}.` : '';
}

function displayQueryName(value) {
    return String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');
}

async function loadClanPeopleForSearch(clanId) {
    return queryOptional(
        `SELECT p.id, p.clan_id, p.display_name, p.first_name, p.middle_name, p.surname,
                p.gender, p.generation, p.branch, p.birth_date, p.death_date,
                r.name AS role_name
         FROM people p
         LEFT JOIN accounts a ON a.person_id = p.id
         LEFT JOIN roles r ON r.id = a.role_id
         WHERE p.clan_id = ?
         ORDER BY p.generation ASC, p.id ASC
         LIMIT 1000`,
        [clanId]
    );
}

function needsCurrentPersonAnswer() {
    return 'Bạn muốn hỏi theo người nào trong gia phả? Vui lòng chọn hoặc nhập tên của bạn trong cây.';
}

async function explainResolvedIntent({ intent, message, resolvedData, context }) {
    const result = await chatbotAI.explainRelationship({
        intent,
        userMessage: message,
        resolvedData,
        clanContext: {
            clan_name: context.clanInfo?.clan_name,
            history: context.clanInfo?.history,
            hall_address: context.clanInfo?.hall_address,
        },
        userProfile: context.userProfile || {},
        recentMemories: context.recentMemories || [],
        history: context.history || [],
    });
    const explanation = String(result?.data?.explanation || '').trim();
    if (result.success && result.data?.success && explanation) return { explanation, aiUsed: true };
    return { explanation: null, aiUsed: false };
}

// Chỉ gửi cho LLM những trường cá nhân mà câu hỏi thực sự cần (địa chỉ, ghi chú, tiểu sử
// là dữ liệu nhạy cảm và được gửi sang dịch vụ bên ngoài).
function profileFieldsForQuestion(person, message) {
    const text = String(message || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase();
    const wants = (pattern) => pattern.test(text);
    const asksOverview = wants(/thong tin|gioi thieu|ke ve|la ai/);
    return {
        id: person.id,
        display_name: person.display_name,
        gender: person.gender,
        generation: person.generation,
        branch: person.branch,
        birth_date: formatDateOnly(person.birth_date),
        death_date: formatDateOnly(person.death_date),
        is_living: person.is_living,
        hometown: person.hometown,
        ...(wants(/dia chi|o dau|song o|cho o|nha o/) ? { address: person.address } : {}),
        ...(asksOverview || wants(/tieu su|cuoc doi/) ? { bio: person.bio } : {}),
        ...(wants(/ghi chu/) ? { note: person.note } : {}),
    };
}

async function handlePersonInfoIntent({ clanId, currentMemberId, message, parsed, context, planner }) {
    const entity = firstEntity(parsed);
    let rows = [];
    const kinship = entity
        ? await resolveKinshipReference({
            clanId,
            currentMemberId,
            names: [].concat(Array.isArray(parsed.entities) ? parsed.entities : entity),
        })
        : null;
    if (kinship) {
        if (kinship.status === 'resolved') rows = [kinship.person];
        else if (kinship.status === 'ambiguous') rows = kinship.candidates;
    } else if (entity) {
        const resolved = await memberSearch.resolvePerson({ clanId, names: [entity], limit: 3 });
        if (resolved.status === 'resolved') rows = [resolved.person];
        else rows = resolved.candidates || [];
    } else {
        const person = await relationshipEngine.getPerson(currentMemberId, { clanId });
        if (person) rows = [person];
    }

    const ids = rows.map((row) => toPositiveId(row.id)).filter(Boolean).slice(0, 3);
    const profiles = ids.length
        ? await queryOptional(
            `SELECT id, display_name, gender, generation, branch,
                    birth_date, death_date, is_living, address, hometown, bio, note
             FROM people
             WHERE clan_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
            [clanId, ...ids]
        )
        : [];
    const resolvedData = { type: 'person_profile', data: profiles, entity: entity || null, subtype: parsed.subtype || null };
    const ai = await explainResolvedIntent({
        intent: parsed.intent,
        message,
        resolvedData: { ...resolvedData, data: profiles.map((person) => profileFieldsForQuestion(person, message)) },
        context,
    });
    const fallback = profiles.length
        ? profiles.map((person) => {
            const details = [
                person.generation ? `đời thứ ${person.generation}` : null,
                person.branch ? `chi ${person.branch}` : null,
                person.birth_date ? `sinh ngày ${formatDateOnly(person.birth_date)}` : null,
                person.hometown ? `quê quán ${person.hometown}` : null,
            ].filter(Boolean).join(', ');
            return `${person.display_name || 'Thành viên'}${details ? `: ${details}` : ''}.`;
        }).join(' ')
        : 'Tôi chưa tìm thấy thông tin người này trong gia phả.';
    return {
        success: true,
        intent: parsed.intent,
        answer: ai.explanation || fallback,
        confidence: profiles.length ? (parsed.confidence || 0.75) : 0.35,
        source: 'database',
        planner,
        resolvedData,
        people: profiles.map((person) => ({ id: person.id, name: person.display_name })),
        ai: { plannerUsed: planner?.source === 'llm_planner' && planner.accepted, explanationUsed: ai.aiUsed },
    };
}

async function handlePersonExistsIntent({ clanId, parsed, planner }) {
    const rawName = parsed?.entities?.rawName || firstEntity(parsed);
    const queryName = Array.isArray(rawName) ? rawName[0] : rawName;
    const people = await loadClanPeopleForSearch(clanId);
    const matches = memberSearch.findPersonByName(queryName, people);
    const best = matches[0] || null;

    if (!best) {
        return {
            success: true,
            intent: parsed.intent,
            answer: `Không tìm thấy người tên ${displayQueryName(queryName)} trong gia phả hiện tại.`,
            confidence: 0.45,
            source: 'database',
            planner,
            people: [],
        };
    }

    const name = relationshipEngine.personName(best);
    return {
        success: true,
        intent: parsed.intent,
        answer: `Có. ${name} có trong gia phả.${formatPersonSummary(best)}`,
        confidence: Math.min(0.95, Number(best.score || parsed.confidence || 0.8)),
        source: 'database',
        planner,
        person: {
            id: best.id,
            name,
            generation: best.generation || null,
            branch: best.branch || null,
        },
        people: matches.slice(0, 5).map((person) => ({
            id: person.id,
            name: relationshipEngine.personName(person),
            generation: person.generation || null,
            branch: person.branch || null,
            confidence: person.score || null,
        })),
    };
}

async function handleClanHistoryIntent({ message, parsed, context, planner }) {
    const clanName = context.clanInfo?.clan_name || 'dòng họ';
    const history = String(context.clanInfo?.history || '').trim();
    return {
        success: true,
        intent: parsed.intent,
        answer: history ? `${clanName}: ${history}` : 'Hiện chưa có thông tin lịch sử dòng họ trong gia phả này.',
        confidence: history ? (parsed.confidence || 0.8) : 0.45,
        source: 'database',
        planner,
        resolvedData: { type: 'clan_info', data: context.clanInfo || {} },
        ai: { plannerUsed: planner?.source === 'llm_planner' && planner.accepted, explanationUsed: false },
    };
}

async function handleMemoriesIntent({ message, parsed, context, planner }) {
    const resolvedData = { type: 'memories', data: context.recentMemories || [] };
    const ai = await explainResolvedIntent({ intent: parsed.intent, message, resolvedData, context });
    const fallback = context.recentMemories?.length
        ? context.recentMemories.map((item) => `${item.title}: ${String(item.content || '').slice(0, 180)}`).join('\n')
        : 'Hiện chưa có kỷ niệm gia đình phù hợp được ghi nhận.';
    return {
        success: true,
        intent: parsed.intent,
        answer: ai.explanation || fallback,
        confidence: context.recentMemories?.length ? (parsed.confidence || 0.78) : 0.42,
        source: 'database',
        planner,
        resolvedData,
        ai: { plannerUsed: planner?.source === 'llm_planner' && planner.accepted, explanationUsed: ai.aiUsed },
    };
}

async function handleStatsIntent({ clanId, message, parsed, context, planner }) {
    const stats = await queryOptional(
        `SELECT generation, COUNT(*) AS count,
                SUM(gender = 1) AS male_count,
                SUM(gender = 2) AS female_count,
                SUM(is_living = 1) AS living_count
         FROM people
         WHERE clan_id = ?
         GROUP BY generation
         ORDER BY generation`,
        [clanId]
    );
    const resolvedData = { type: 'statistics', data: stats };
    const total = stats.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const metric = parsed?.entities?.metric || 'member_count';
    const requestedGeneration = Number(parsed?.entities?.generation);
    const generationRow = Number.isFinite(requestedGeneration) && requestedGeneration > 0
        ? stats.find((row) => Number(row.generation) === requestedGeneration)
        : null;
    let answer = Number.isFinite(requestedGeneration) && requestedGeneration > 0
        ? `Đời thứ ${requestedGeneration} hiện có ${Number(generationRow?.count || 0)} thành viên trong gia phả.`
        : `Gia phả hiện có ${total} thành viên trong các đời đã ghi nhận.`;

    if (metric === 'generation_count' && !(Number.isFinite(requestedGeneration) && requestedGeneration > 0)) {
        const generationCount = stats.filter((row) => row.generation !== null && row.generation !== undefined).length;
        answer = generationCount
            ? `Gia phả hiện có ${generationCount} đời đã ghi nhận.`
            : 'Gia phả hiện chưa có dữ liệu đời/thế hệ.';
    } else if (metric === 'branch_count') {
        const [branchRow] = await queryOptional(
            `SELECT COUNT(DISTINCT NULLIF(TRIM(branch), '')) AS count
             FROM people
             WHERE clan_id = ?`,
            [clanId]
        );
        const branchCount = Number(branchRow?.count || 0);
        answer = branchCount
            ? `Gia phả hiện có ${branchCount} chi/nhánh đã ghi nhận.`
            : 'Gia phả hiện chưa có dữ liệu chi/nhánh.';
        resolvedData.branches = branchCount;
    } else if (metric === 'gender_count') {
        const male = stats.reduce((sum, row) => sum + Number(row.male_count || 0), 0);
        const female = stats.reduce((sum, row) => sum + Number(row.female_count || 0), 0);
        const unknown = total - male - female;
        answer = `Gia phả hiện có ${male} nam và ${female} nữ${unknown > 0 ? `, ${unknown} người chưa ghi giới tính` : ''}.`;
    } else if (metric === 'living_count' || metric === 'deceased_count') {
        const living = stats.reduce((sum, row) => sum + Number(row.living_count || 0), 0);
        answer = metric === 'living_count'
            ? `Gia phả hiện ghi nhận ${living} thành viên còn sống.`
            : `Gia phả hiện ghi nhận ${total - living} thành viên đã mất.`;
    } else if (metric === 'oldest_living' || metric === 'youngest_living') {
        const order = metric === 'oldest_living' ? 'ASC' : 'DESC';
        const [person] = await queryOptional(
            `SELECT id, display_name, birth_date, generation
             FROM people
             WHERE clan_id = ? AND is_living = 1 AND birth_date IS NOT NULL
             ORDER BY birth_date ${order}, id ASC
             LIMIT 1`,
            [clanId]
        );
        const label = metric === 'oldest_living' ? 'lớn tuổi nhất' : 'nhỏ tuổi nhất';
        answer = person
            ? `Thành viên còn sống ${label} có ghi ngày sinh là ${person.display_name} (sinh ${formatDateOnly(person.birth_date)}${person.generation ? `, đời thứ ${person.generation}` : ''}).`
            : 'Gia phả chưa có đủ dữ liệu ngày sinh để xác định.';
        resolvedData.person = person || null;
    }

    return {
        success: true,
        intent: parsed.intent,
        answer,
        confidence: stats.length ? (parsed.confidence || 0.8) : 0.4,
        source: 'database',
        planner,
        resolvedData,
        ai: { plannerUsed: planner?.source === 'llm_planner' && planner.accepted, explanationUsed: false },
    };
}

async function handleEventsIntent({ clanId, message, parsed, context, planner }) {
    const events = await queryOptional(
        `SELECT title, event_date, start_date, end_date, description
         FROM events
         WHERE clan_id = ?
           AND (event_date >= CURDATE() OR start_date >= CURDATE())
         ORDER BY COALESCE(event_date, start_date) ASC
         LIMIT 5`,
        [clanId]
    );
    const resolvedData = { type: 'events_upcoming', data: events };
    const ai = await explainResolvedIntent({ intent: parsed.intent, message, resolvedData, context });
    const fallback = events.length
        ? events.map((event) => `${event.title} (${formatDateOnly(event.event_date || event.start_date) || 'chưa rõ ngày'})`).join(', ')
        : 'Hiện chưa có sự kiện sắp tới được ghi nhận.';
    return {
        success: true,
        intent: parsed.intent,
        answer: ai.explanation || fallback,
        confidence: events.length ? (parsed.confidence || 0.75) : 0.4,
        source: 'database',
        planner,
        resolvedData,
        ai: { plannerUsed: planner?.source === 'llm_planner' && planner.accepted, explanationUsed: ai.aiUsed },
    };
}

async function handleGeneralChatIntent({ message, parsed, context, planner }) {
    const resolvedData = { type: 'general', data: null };
    const ai = await explainResolvedIntent({ intent: parsed.intent, message, resolvedData, context });
    return {
        success: true,
        intent: parsed.intent,
        answer: ai.explanation || 'Chào bạn, tôi có thể giúp tra quan hệ, thông tin thành viên, kỷ niệm và lịch sử dòng họ.',
        confidence: parsed.confidence || 0.6,
        source: 'assistant',
        planner,
        resolvedData,
        ai: { plannerUsed: planner?.source === 'llm_planner' && planner.accepted, explanationUsed: ai.aiUsed },
    };
}

module.exports = {
    needsCurrentPersonAnswer,
    handlePersonInfoIntent,
    handlePersonExistsIntent,
    handleClanHistoryIntent,
    handleMemoriesIntent,
    handleStatsIntent,
    handleEventsIntent,
    handleGeneralChatIntent,
};
