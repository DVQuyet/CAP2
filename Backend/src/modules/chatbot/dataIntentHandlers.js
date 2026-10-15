// Các intent trả lời từ dữ liệu dòng họ (thông tin người, lịch sử, ký ức, thống kê, sự kiện,
// trò chuyện chung). Tách khỏi chatbotController để controller chỉ còn điều phối.
const relationshipEngine = require('./relationshipEngine');
const memberSearch = require('./memberSearchService');
const chatbotAI = require('./chatbotAI');
const { resolveKinshipReference } = require('./kinshipReferenceService');
const { toPositiveId, queryOptional } = require('./chatbotUtils');
const { formatDateWithPrecision, ageOf, relativesOf, describePersonBrief } = require('./chatbotFormat');

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

// "03-10" -> "10/3 âm lịch"
function lunarAnniversaryText(value) {
    const match = String(value || '').match(/^(\d{1,2})-(\d{1,2})$/);
    return match ? `${Number(match[2])}/${Number(match[1])} âm lịch` : null;
}

function livingState(person) {
    if (person.is_living === null || person.is_living === undefined) return null;
    return Number(person.is_living) === 1;
}

// "X là ai": đời, cha mẹ, vợ/chồng, con, sinh/mất, quê, tiểu sử.
function personOverview(person, graph) {
    const nameOf = relationshipEngine.personName;
    const name = nameOf(person);
    const relatives = graph ? relativesOf(graph, person.id) : null;
    const parts = [];
    if (person.generation) parts.push(`đời thứ ${person.generation}`);
    if (relatives) {
        const parents = [relatives.father, relatives.mother].filter(Boolean).map(nameOf);
        if (parents.length) parts.push(`con của ${parents.join(' và ')}`);
        if (relatives.adoptiveParents.length) parts.push(`con nuôi của ${relatives.adoptiveParents.map(nameOf).join(', ')}`);
        if (relatives.spouses.length) parts.push(`${Number(person.gender) === 2 ? 'chồng' : 'vợ'}: ${relatives.spouses.map(nameOf).join(', ')}`);
        if (relatives.children.length) parts.push(`con: ${relatives.children.map(nameOf).join(', ')}`);
    }
    const birth = formatDateWithPrecision(person.birth_date, person.birth_date_precision || 'exact');
    const death = formatDateWithPrecision(person.death_date, person.death_date_precision || 'exact');
    if (birth) parts.push(`sinh ${birth}`);
    if (livingState(person) === false) parts.push(death ? `mất ${death}` : 'đã mất');
    if (person.hometown) parts.push(`quê ${person.hometown}`);
    let text = parts.length ? `${name}: ${parts.join('; ')}.` : `${name} có trong gia phả nhưng chưa có thêm thông tin.`;
    if (person.bio) text += ` ${String(person.bio).trim()}`;
    return text;
}

// Trả đúng thông tin được hỏi thay cho một mẫu cố định.
function personFieldAnswer(person, subtype, graph) {
    const name = relationshipEngine.personName(person);
    const living = livingState(person);
    const birth = formatDateWithPrecision(person.birth_date, person.birth_date_precision || 'exact');
    const death = formatDateWithPrecision(person.death_date, person.death_date_precision || 'exact');
    const age = ageOf(person);
    const ageText = age ? `${age.approximate ? 'khoảng ' : ''}${age.age} tuổi` : null;
    const anniversary = lunarAnniversaryText(person.death_anniversary_lunar);
    switch (subtype) {
        case 'birth_info':
            return birth ? `${name} sinh ${birth}.` : `Gia phả chưa ghi ngày sinh của ${name}.`;
        case 'death_info':
            if (living === true) return `${name} hiện còn sống theo dữ liệu gia phả.`;
            if (death) return `${name} mất ${death}${ageText ? `, hưởng thọ ${ageText}` : ''}.${anniversary ? ` Ngày giỗ: ${anniversary}.` : ''}`;
            if (living === false) return `${name} đã mất nhưng gia phả chưa ghi ngày mất.${anniversary ? ` Ngày giỗ: ${anniversary}.` : ''}`;
            return `Gia phả chưa ghi ${name} còn sống hay đã mất.`;
        case 'alive_info':
            if (living === true) return `${name} còn sống${ageText ? ` (${ageText})` : ''}.`;
            if (living === false) return `${name} đã mất${death ? ` (${death})` : ''}.`;
            return `Gia phả chưa ghi ${name} còn sống hay đã mất.`;
        case 'age_info':
            if (!age) return `Gia phả chưa đủ dữ liệu ngày sinh để tính tuổi của ${name}.`;
            return living === false
                ? `${name} đã mất${death ? ` ${death}` : ''}, hưởng thọ ${ageText}.`
                : `${name} năm nay ${ageText}${birth ? ` (sinh ${birth})` : ''}.`;
        case 'hometown_info':
            return person.hometown ? `Quê quán của ${name}: ${person.hometown}.` : `Gia phả chưa ghi quê quán của ${name}.`;
        case 'address_info':
            return `Trợ lý không cung cấp địa chỉ nơi ở của ${name}; bạn có thể xem trong hồ sơ thành viên nếu có quyền.`;
        case 'bio_info':
            return person.bio ? `Tiểu sử ${name}: ${String(person.bio).trim()}` : `Gia phả chưa có tiểu sử của ${name}.`;
        default:
            return personOverview(person, graph);
    }
}

async function handlePersonInfoIntent({ clanId, currentMemberId, message, parsed, context, planner }) {
    const entity = firstEntity(parsed);
    const nameAlternatives = Array.isArray(parsed.entities) ? parsed.entities.filter(Boolean) : (entity ? [].concat(entity) : []);
    let rows = [];
    const kinship = entity
        ? await resolveKinshipReference({ clanId, currentMemberId, names: nameAlternatives })
        : null;
    if (kinship) {
        if (kinship.status === 'resolved') rows = [kinship.person];
        else if (kinship.status === 'ambiguous') rows = kinship.candidates;
    } else if (entity) {
        // Thử mọi cách viết tên ("Ông Bình" và "Bình").
        const resolved = await memberSearch.resolvePerson({ clanId, names: nameAlternatives, limit: 3 });
        if (resolved.status === 'resolved') rows = [resolved.person];
        else rows = resolved.candidates || [];
    } else {
        const person = await relationshipEngine.getPerson(currentMemberId, { clanId });
        if (person) rows = [person];
    }

    const ids = rows.map((row) => toPositiveId(row.id)).filter(Boolean).slice(0, 3);
    // SELECT * để lấy cả độ chính xác ngày/ngày giỗ âm lịch nếu DB đã có các cột này.
    const profiles = ids.length
        ? await queryOptional(
            `SELECT * FROM people WHERE clan_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
            [clanId, ...ids]
        )
        : [];
    const subtype = parsed.subtype || null;
    const resolvedData = { type: 'person_profile', data: profiles, entity: entity || null, subtype };
    const ai = await explainResolvedIntent({
        intent: parsed.intent,
        message,
        resolvedData: { ...resolvedData, data: profiles.map((person) => profileFieldsForQuestion(person, message)) },
        context,
    });

    let graph = null;
    if (profiles.length && (!subtype || subtype === 'overview' || profiles.length > 1)) {
        graph = await relationshipEngine.loadClanGraph(clanId).catch(() => null);
    }
    let fallback = 'Tôi chưa tìm thấy thông tin người này trong gia phả.';
    if (profiles.length === 1) {
        fallback = personFieldAnswer(profiles[0], subtype, graph);
    } else if (profiles.length > 1) {
        // Nhiều người khớp tên: nói rõ từng người là ai để không nhầm.
        fallback = `Có ${profiles.length} người khớp: ${profiles.map((person) => {
            const brief = describePersonBrief(graph?.people.get(Number(person.id)) || person, graph, relationshipEngine.personName);
            const detail = subtype && subtype !== 'overview' ? personFieldAnswer(person, subtype, graph) : '';
            return detail ? `${brief} — ${detail}` : brief;
        }).join(' ')}`;
    }

    return {
        success: true,
        intent: parsed.intent,
        answer: ai.explanation || fallback,
        confidence: profiles.length ? (parsed.confidence || 0.75) : 0.35,
        source: 'database',
        planner,
        resolvedData,
        people: profiles.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
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
    const top = matches.filter((person) => Number(person.score) === Number(best.score));
    let answer = `Có. ${name} có trong gia phả.${formatPersonSummary(best)}`;
    if (top.length > 1) {
        const graph = await relationshipEngine.loadClanGraph(clanId).catch(() => null);
        answer = `Có. Gia phả có ${top.length} người khớp tên "${displayQueryName(queryName)}": ${top
            .map((person) => describePersonBrief(graph?.people.get(Number(person.id)) || person, graph, relationshipEngine.personName))
            .join('; ')}.`;
    }
    return {
        success: true,
        intent: parsed.intent,
        answer,
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

const isoDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Khoảng thời gian trong câu hỏi ("hôm nay", "tuần này", "tháng sau"...). Mặc định: 60 ngày tới.
function resolveEventWindow(name, now = new Date()) {
    const day = (offset = 0, base = now) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    const today = day();
    switch (name) {
        case 'today': return { from: today, to: today, label: 'hôm nay', bounded: true };
        case 'tomorrow': return { from: day(1), to: day(1), label: 'ngày mai', bounded: true };
        case 'week': return { from: today, to: day(7), label: 'trong 7 ngày tới', bounded: true };
        case 'next_week': {
            const monday = day(7 - ((today.getDay() + 6) % 7));
            return { from: monday, to: day(6, monday), label: 'tuần sau', bounded: true };
        }
        case 'month':
            return { from: today, to: new Date(today.getFullYear(), today.getMonth() + 1, 0), label: 'trong tháng này', bounded: true };
        case 'next_month':
            return {
                from: new Date(today.getFullYear(), today.getMonth() + 1, 1),
                to: new Date(today.getFullYear(), today.getMonth() + 2, 0),
                label: 'trong tháng sau',
                bounded: true,
            };
        default:
            return { from: today, to: day(60), label: 'trong 60 ngày tới', bounded: false };
    }
}

// Ngày giỗ/sinh nhật được tính từ gia phả (ngày giỗ âm lịch hoặc ngày mất, ngày sinh chính xác), không nằm trong bảng events.
async function loadPersonEvents(clanId, { from, to, types, limit = 8 }) {
    try {
        const { buildYearlyPersonEvents } = require('../calendar/calendar.controller');
        const items = await buildYearlyPersonEvents({ clanId, from: isoDay(from), to: isoDay(to) });
        return items
            .filter((item) => types.includes(item.type))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .slice(0, limit);
    } catch (error) {
        console.error('loadPersonEvents error:', error?.message || error);
        return [];
    }
}

const EVENT_KIND_TYPES = {
    death_anniversary: ['death_anniversary'],
    birthday: ['birthday'],
};

async function handleEventsIntent({ clanId, accountId = null, message, parsed, context, planner }) {
    const entities = parsed?.entities && !Array.isArray(parsed.entities) ? parsed.entities : {};
    const asksAnniversary = /gi[oỗ]|giỗ|ky nhat|kỵ nhật/i.test(String(message || '').normalize('NFC'));
    const kind = entities.kind || (asksAnniversary ? 'death_anniversary' : null);
    const range = resolveEventWindow(entities.window);
    const fromIso = isoDay(range.from);
    const toIso = isoDay(range.to);

    // Không nêu mốc thời gian: giữ cách cũ (mọi sự kiện chưa kết thúc, tối đa 5).
    const events = kind ? [] : await queryOptional(
        `SELECT title, event_date, start_date, end_date, description
         FROM events
         WHERE clan_id = ?
           AND COALESCE(end_date, event_date, start_date) >= ?
           AND COALESCE(start_date, event_date, end_date) <= ?
         ORDER BY COALESCE(start_date, event_date) ASC
         LIMIT ${range.bounded ? 8 : 5}`,
        [clanId, fromIso, range.bounded ? toIso : '9999-12-31']
    );

    // Lịch do người dùng/quản lý thêm (kể cả qua trợ lý): lịch chung của dòng họ hoặc lịch cá nhân của chính người hỏi.
    const calendarEvents = kind || !accountId ? [] : await queryOptional(
        `SELECT title, event_date, event_time
         FROM calendar_events
         WHERE clan_id = ?
           AND event_date BETWEEN ? AND ?
           AND (visibility = 'global' OR creator_account_id = ?)
         ORDER BY event_date ASC, event_time ASC
         LIMIT 8`,
        [clanId, fromIso, toIso, accountId]
    );

    const personTypes = kind ? EVENT_KIND_TYPES[kind] || ['death_anniversary'] : ['death_anniversary', 'birthday'];
    const personEvents = await loadPersonEvents(clanId, { from: range.from, to: range.to, types: personTypes });
    const anniversaries = personEvents.filter((item) => item.type === 'death_anniversary');
    const birthdays = personEvents.filter((item) => item.type === 'birthday');

    const resolvedData = { type: 'events_upcoming', data: events, calendar: calendarEvents, anniversaries, birthdays, window: entities.window || 'default' };
    const ai = await explainResolvedIntent({ intent: parsed.intent, message, resolvedData, context });

    const clanEventText = events.length
        ? `Sự kiện ${range.label}: ${events.map((event) => `${event.title} (${formatDateOnly(event.start_date || event.event_date) || 'chưa rõ ngày'}${event.end_date && formatDateOnly(event.end_date) !== formatDateOnly(event.start_date || event.event_date) ? ` - ${formatDateOnly(event.end_date)}` : ''})`).join(', ')}.`
        : '';
    const calendarText = calendarEvents.length
        ? `Lịch ${range.label}: ${calendarEvents.map((event) => `${event.title} (${formatDateOnly(event.event_date)}${event.event_time ? ` ${event.event_time}` : ''})`).join('; ')}.`
        : '';
    const anniversaryText = anniversaries.length
        ? `Ngày giỗ ${range.label}: ${anniversaries.map((item) => `${item.title.replace(/^Ngày giỗ\s+/, '')} (${formatDateOnly(item.date)}${item.anniversary_lunar_date ? `, âm lịch ${item.anniversary_lunar_date}` : ''})`).join('; ')}.`
        : '';
    const birthdayText = birthdays.length
        ? `Sinh nhật ${range.label}: ${birthdays.map((item) => `${item.title.replace(/^Sinh nhật\s+/, '')} (${formatDateOnly(item.date)})`).join('; ')}.`
        : '';

    const parts = kind === 'death_anniversary'
        ? [anniversaryText]
        : kind === 'birthday'
            ? [birthdayText]
            : [clanEventText, calendarText, anniversaryText, birthdayText];
    const emptyText = kind === 'death_anniversary'
        ? `Chưa có ngày giỗ nào ${range.label} trong gia phả (cần có ngày mất hoặc ngày giỗ âm lịch trong hồ sơ).`
        : kind === 'birthday'
            ? `Chưa có sinh nhật nào ${range.label} (cần có ngày sinh chính xác trong hồ sơ).`
            : `Không có sự kiện nào ${range.label}.`;
    const fallback = parts.filter(Boolean).join(' ') || emptyText;
    const hasData = events.length || calendarEvents.length || personEvents.length;
    return {
        success: true,
        intent: parsed.intent,
        answer: ai.explanation || fallback,
        confidence: hasData ? (parsed.confidence || 0.75) : 0.4,
        source: 'database',
        planner,
        resolvedData,
        ai: { plannerUsed: planner?.source === 'llm_planner' && planner.accepted, explanationUsed: ai.aiUsed },
    };
}

const CAPABILITIES_REPLY = [
    'Tôi có thể giúp bạn:',
    '• Tra quan hệ: "Cha của [tên] là ai?", "Ông nội tôi là ai?", "[tên] là gì của tôi?"',
    '• Tra thông tin: "[tên] sinh năm nào?", "[tên] thuộc đời thứ mấy?", "Những người cùng đời với tôi"',
    '• Thống kê: "Gia phả có bao nhiêu người?", "Dòng họ có mấy đời?"',
    '• Lịch: "Sắp tới có giỗ ai không?", "Tháng này có sinh nhật ai?"',
    '• Tạo lịch: "Nhắc tôi giỗ ông nội ngày 15/3 âm lịch" rồi bấm "Thêm vào lịch".',
].join('\n');

async function handleGeneralChatIntent({ message, parsed, context, planner }) {
    const resolvedData = { type: 'general', data: null };
    if (parsed?.entities?.topic === 'capabilities') {
        return {
            success: true,
            intent: parsed.intent,
            answer: CAPABILITIES_REPLY,
            confidence: parsed.confidence || 0.8,
            source: 'assistant',
            planner,
            resolvedData,
            ai: { plannerUsed: false, explanationUsed: false },
        };
    }
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
