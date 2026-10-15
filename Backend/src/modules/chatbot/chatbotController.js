const db = require('../../config/db');
const relationshipEngine = require('./relationshipEngine');
const memberSearch = require('./memberSearchService');
const explanationService = require('./relationshipExplanationService');
const suggestionService = require('./chatbotSuggestionService');
const queryPlanner = require('./queryPlannerService');
const confidenceService = require('./relationshipConfidenceService');
const relationshipExplanationAI = require('./relationshipExplanationAI');
const relationshipSuggestionService = require('./relationshipSuggestionService');
const chatbotAI = require('./chatbotAI');
const { sanitizeMessage, looksLikePromptInjection } = require('./chatbotSecurity');
const { parseRelationshipExpression, parseNamedRelationshipExpression } = require('./relationshipQueryParser');
const { resolveKinshipReference } = require('./kinshipReferenceService');
const { parseEventCommand } = require('./eventCommandService');
const { resolveRelationshipExpression } = require('./relationshipExpressionResolver');
const { toPositiveId, queryOptional } = require('./chatbotUtils');
const { ARCHIVED_MEMBER_JOIN_SQL } = require('../manager/common.service');
const { canSeeSensitiveRelations } = require('../genealogy/treeVisibility');
const { describePersonBrief, capitalizeFirst, formatDateVN, dateParts } = require('./chatbotFormat');
const { plainTermToKey, hasVietnameseDiacritics } = require('./kinshipTermService');
const { findPronoun, rewritePronoun, rewriteEllipsis, selectCandidate, findFocusText } = require('./conversationFlowService');

const normalizeName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

// Lưu câu trả lời gửi thẳng qua res (hỏi lại, không tìm thấy) để lịch sử và trí nhớ không bị đứt.
function storeTurnAnswer(res, body) {
    const turn = res?.locals?.chatbotTurn;
    if (!turn) return;
    storeChatbotMessage({
        conversationId: turn.conversationId,
        clanId: turn.clanId,
        accountId: turn.accountId,
        currentMemberId: turn.currentMemberId,
        role: 'assistant',
        message: body.answer,
        intent: body.intent || null,
        confidence: body.confidence ?? null,
        metadata: { ...body, turn: { question: turn.message, pending: turn.pending || null } },
    }).catch(() => {});
}

// Gợi ý câu hỏi tiếp theo về người vừa được hỏi tới.
function followUpSuggestions(subject, graph, askedMessage) {
    const person = graph?.people.get(Number(subject?.id)) || subject;
    const name = relationshipEngine.personName(person) || subject?.name;
    if (!name) return [];
    const spouseWord = Number(person?.gender) === 2 ? 'Chồng' : 'Vợ';
    const items = [
        `${spouseWord} của ${name} là ai?`,
        `Con của ${name} là ai?`,
        Number(person?.is_living) === 0 ? `Ngày giỗ của ${name} là ngày nào?` : `${name} sinh năm nào?`,
        `${name} là gì của tôi?`,
    ];
    const asked = normalizeName(askedMessage).replace(/[?.!]/g, '');
    return items
        .filter((text) => normalizeName(text).replace(/[?.!]/g, '') !== asked)
        .map((text) => ({ type: 'quick_question', text }));
}

// Trí nhớ hội thoại nằm trong RAM; khi server khởi động lại thì dựng lại từ lượt trả lời gần nhất trong DB.
async function restoreMemoryFromHistory(conversationId, memorySessionId) {
    if (!conversationId || !(await memberSearch.tableExists('chatbot_messages'))) return null;
    const columns = await getTableColumns('chatbot_messages');
    if (!columns.has('metadata')) return null;
    const rows = await queryOptional(
        'SELECT metadata FROM chatbot_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 4',
        [conversationId]
    );
    for (const row of rows) {
        let meta = row.metadata;
        if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch (_) { meta = null; }
        }
        if (!meta?.turn) continue;
        return updateConversationMemory(memorySessionId, {
            lastQuestion: meta.turn.question || null,
            lastFocusText: meta.turn.focusText || null,
            lastSubject: meta.turn.subject || null,
            lastAnswerPeople: meta.turn.answerPeople || [],
            pendingClarification: meta.turn.pending || null,
        });
    }
    return null;
}

// Từ không dấu (thứ tự trong câu) -> key có dấu theo thứ tự đi từ người gốc ra; null nếu có từ không đổi được.
function chainKeysFromTerms(terms) {
    if (!Array.isArray(terms) || !terms.length) return null;
    const keys = terms.slice().reverse().map(plainTermToKey);
    return keys.every(Boolean) ? keys : null;
}

// Trả lời biểu thức quan hệ tính từ chính người hỏi ("em trai của bố tôi").
async function answerViewerKinshipChain({ clanId, currentMemberId, keys, intent, planner }) {
    const chain = await relationshipEngine.resolveKinshipChain(currentMemberId, keys, { clanId });
    if (!chain.ok) return null;
    const phrase = keys.slice().reverse().join(' của ');
    const people = chain.last;
    if (people.length === 1) {
        const relation = await relationshipEngine.findRelationship(currentMemberId, people[0].id, { clanId });
        const label = relation.found ? relation.relationshipLabel : null;
        const explanation = relation.found ? explanationService.explainRelationship(relation) : null;
        return {
            success: true,
            intent,
            answer: `Theo dữ liệu gia phả hiện tại, ${phrase} bạn là ${people[0].name}.${explanation ? ` ${explanation}` : (label ? ` Đó là ${label} của bạn.` : '')}`,
            confidence: 0.88,
            planner,
            relationshipPath: relation.found ? relation.relationshipPath : [],
            pathNodes: relation.found ? relation.pathNodes : [],
            relationshipLabel: label,
            pathVisualizer: relation.found ? explanationService.buildPathVisualizer(relation) : null,
            targetPerson: { id: people[0].id, name: people[0].name },
            people: [{ id: people[0].id, name: people[0].name }],
        };
    }
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const described = await Promise.all(people.map(async (item) => {
        const relation = await relationshipEngine.findRelationship(currentMemberId, item.id, { clanId });
        return relation.found ? `${item.name} (${relation.relationshipLabel} của bạn)` : item.name;
    }));
    return {
        success: true,
        intent,
        answer: `Theo dữ liệu gia phả hiện tại, ${phrase} bạn gồm: ${described.join(', ')}.`,
        confidence: 0.86,
        planner,
        people: people.map((item) => ({ id: item.id, name: item.name, generation: graph.people.get(Number(item.id))?.generation || null })),
    };
}
const {
    needsCurrentPersonAnswer,
    handlePersonInfoIntent,
    handlePersonExistsIntent,
    handleClanHistoryIntent,
    handleMemoriesIntent,
    handleStatsIntent,
    handleEventsIntent,
    handleGeneralChatIntent,
    handleClanInfoIntent,
} = require('./dataIntentHandlers');
const {
    buildConversationSessionId,
    getConversationMemory,
    updateConversationMemory,
} = require('./conversationMemoryService');
const { resolveCoreference } = require('./coreferenceResolver');
const { buildClarificationResponse } = require('./clarificationService');
const {
    canAccessRelationship,
    filterEvidenceByPermission,
    restrictedAnswer,
} = require('./permissionAwareResponseService');

// LLM planner có thể trả entities là mảng tên; đổi về dạng handler mới dùng.
function withNamedEntities(parsed) {
    if (!Array.isArray(parsed.entities)) return parsed;
    return { ...parsed, entities: { source: 'named_person', targetName: parsed.entities.filter(Boolean) } };
}

function withKeywordEntity(parsed) {
    if (!Array.isArray(parsed.entities)) return parsed;
    return { ...parsed, entities: { keyword: String(parsed.entities.find(Boolean) || '') } };
}

function formatPeopleList(people) {
    return people.map((person) => relationshipEngine.personName(person)).filter(Boolean).join(', ');
}

function isSelfReferenceName(value) {
    const text = Array.isArray(value) ? String(value[0] || '') : String(value || '');
    return /^(tôi|toi|mình|minh|con|em|cháu|chau|tui|tao)$/i.test(text.trim());
}

async function canAccessClan(req, clanId, currentMemberId) {
    const roleName = req.user?.role_name || req.user?.role;
    const accountId = toPositiveId(req.user?.id || req.user?.account_id);
    if (roleName === 'admin') return true;
    if (!accountId) return false;

    const [rows] = await db.query(
        `
        SELECT 1
        FROM account_clans ac
        WHERE ac.account_id = ?
          AND ac.clan_id = ?
          AND ac.status = 'active'
        LIMIT 1
        `,
        [accountId, clanId]
    );
    if (rows.length) return true;

    const [personRows] = await db.query(
        'SELECT id FROM people WHERE id = ? AND clan_id = ? LIMIT 1',
        [currentMemberId, clanId]
    );
    return personRows.length > 0 && toPositiveId(req.user?.person_id) === currentMemberId;
}

async function storeChatbotMessage(payload) {
    if (!(await memberSearch.tableExists('chatbot_messages'))) return;
    const columns = await getTableColumns('chatbot_messages');
    const insertColumns = [];
    const values = [];

    const add = (column, value) => {
        if (!columns.has(column)) return;
        insertColumns.push(column);
        values.push(value);
    };

    let conversationId = payload.conversationId || null;
    if (columns.has('conversation_id') && !conversationId && payload.accountId) {
        conversationId = await getOrCreateChatbotConversation(payload.accountId).catch(() => null);
    }

    add('conversation_id', conversationId);
    add('clan_id', payload.clanId || null);
    add('account_id', payload.accountId || null);
    add('current_member_id', payload.currentMemberId || null);
    if (columns.has('role')) add('role', payload.role);
    if (columns.has('sender')) add('sender', payload.role === 'assistant' ? 'bot' : payload.role);
    add('message', payload.message);
    add('intent', payload.intent || null);
    add('confidence', payload.confidence ?? null);
    add('metadata', payload.metadata ? JSON.stringify(payload.metadata) : null);

    if (!insertColumns.includes('message')) return;
    if (columns.has('conversation_id') && !conversationId) return;
    if (columns.has('account_id') && !payload.accountId) return;

    await db.query(
        `INSERT INTO chatbot_messages (${insertColumns.join(', ')})
         VALUES (${insertColumns.map(() => '?').join(', ')})`,
        values
    );
}

const tableColumnsCache = new Map();

async function getTableColumns(tableName) {
    if (tableColumnsCache.has(tableName)) return tableColumnsCache.get(tableName);
    const [rows] = await db.query(
        `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
        `,
        [tableName]
    );
    const columns = new Set(rows.map((row) => row.COLUMN_NAME));
    tableColumnsCache.set(tableName, columns);
    return columns;
}

async function getOrCreateChatbotConversation(accountId) {
    if (!(await memberSearch.tableExists('conversations'))) return null;
    const [existing] = await db.query(
        'SELECT id FROM conversations WHERE account_id = ? ORDER BY id DESC LIMIT 1',
        [accountId]
    );
    if (existing.length) return existing[0].id;
    const [created] = await db.query(
        'INSERT INTO conversations (account_id, title) VALUES (?, ?)',
        [accountId, 'AI Family Assistant']
    );
    return created.insertId;
}

// Chỉ dùng conversationId client gửi lên khi hội thoại đó thuộc tài khoản đang hỏi;
// nếu không, quay về hội thoại của chính tài khoản.
async function resolveOwnedConversationId(accountId, requestedConversationId) {
    if (!accountId) return null;
    const requestedId = toPositiveId(requestedConversationId);
    if (requestedId && await memberSearch.tableExists('conversations')) {
        const [rows] = await db.query(
            'SELECT id FROM conversations WHERE id = ? AND account_id = ? LIMIT 1',
            [requestedId, accountId]
        );
        if (rows.length) return rows[0].id;
    }
    return getOrCreateChatbotConversation(accountId).catch(() => null);
}

async function loadChatbotContext({ clanId, currentMemberId, conversationId, message }) {
    const [clanInfo] = await queryOptional(
        'SELECT id, clan_name, history, hall_address FROM clans WHERE id = ? LIMIT 1',
        [clanId]
    );
    const [userProfile] = await queryOptional(
        `SELECT id, display_name, gender, generation, branch,
                birth_date, death_date, is_living, address, hometown, bio
         FROM people WHERE id = ? LIMIT 1`,
        [currentMemberId]
    );
    const recentMemories = await queryOptional(
        `SELECT title, content, created_at
         FROM family_memories
         WHERE clan_id = ? AND status = 'approved'
           AND visibility = 'clan'
         ORDER BY created_at DESC LIMIT 5`,
        [clanId]
    );
    let history = [];
    if (conversationId && await memberSearch.tableExists('chatbot_messages')) {
        const columns = await getTableColumns('chatbot_messages');
        const senderSelect = columns.has('role')
            ? "CASE WHEN role = 'assistant' THEN 'bot' ELSE role END AS sender"
            : columns.has('sender')
                ? 'sender'
                : "'user' AS sender";
        history = (await queryOptional(
            `SELECT ${senderSelect}, message, intent
             FROM chatbot_messages
             WHERE conversation_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 10`,
            [conversationId]
        )).reverse();
    }

    return {
        clanInfo: clanInfo || {},
        userProfile: userProfile || {},
        recentMemories,
        history,
    };
}

function normalizeShortcutMessage(message) {
    return String(message || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[!?.~,;:]+/g, '')
        .replace(/\s+/g, ' ');
}

function isCommonChatShortcut(message) {
    const text = normalizeShortcutMessage(message);
    if (!text) return false;
    return /^(hi|hello|hey|alo|ok|okay|thanks|thank you|cam on|chao|xin chao|u|uh|um|vang|da|duoc|roi)(\s+(ban|anh|chi|em|toi|nhe|nha|a))?$/.test(text);
}

function buildSuggestedQuestions(userProfile = {}, clanInfo = {}) {
    const displayName = String(userProfile.display_name || '').trim();
    return [
        'Gia phả có bao nhiêu người?',
        'Dòng họ này có mấy đời?',
        'Giới thiệu về dòng họ',
        displayName ? `Trong gia phả có ${displayName} không?` : 'Sắp tới có sự kiện hoặc ngày giỗ nào?',
    ];
}

// Câu không nhận ra: nếu không dính gì tới gia phả thì nói rõ ngoài phạm vi, kèm ví dụ hỏi được.
function buildUnknownAnswer(message) {
    const text = normalizeShortcutMessage(message);
    const inScope = /\b(gia pha|dong ho|ho toc|doi|gio|to tien|thuy to|con|chau|ong|ba|cha|bo|me|vo|chong|anh|chi|em|chu|bac|co|di|cau|cu|nha tho|su kien|lich|ky niem|sinh|mat)\b/.test(text);
    return inScope
        ? 'Tôi chưa nắm được ý câu hỏi. Bạn thử hỏi theo dạng: "Ông nội tôi là ai?", "Con của Nguyễn Văn A là ai?", "Ngày giỗ của Nguyễn Văn A là ngày nào?".'
        : 'Câu này nằm ngoài phạm vi gia phả nên tôi chưa trả lời được. Tôi có thể giúp tra quan hệ họ hàng, thông tin thành viên, ngày giỗ, sự kiện và lịch sử dòng họ — ví dụ: "Gia phả có bao nhiêu người?", "Sắp tới có giỗ ai không?".';
}

// "Cảm ơn" -> không có gì; "ok/vâng" -> mời hỏi tiếp; còn lại là lời chào.
function buildShortcutReply(message, userProfile = {}, clanInfo = {}) {
    const text = normalizeShortcutMessage(message);
    if (/^(cam on|thanks|thank you|thank)/.test(text)) return 'Không có gì ạ! Bạn cần tra thêm gì về gia phả cứ hỏi tôi nhé.';
    if (/^(ok|okay|vang|da|duoc|roi|u|uh|um)\b/.test(text)) return 'Vâng. Bạn muốn hỏi gì tiếp về gia phả?';
    return buildGreetingReply(userProfile, clanInfo);
}

function buildGreetingReply(userProfile = {}, clanInfo = {}) {
    const displayName = String(userProfile.display_name || '').trim();
    const clanName = String(clanInfo.clan_name || '').trim();
    const hello = displayName ? `Chào ${displayName}.` : 'Chào bạn.';
    const scope = clanName ? ` trong dòng họ ${clanName}` : '';
    return `${hello} Tôi có thể giúp bạn tra quan hệ, tìm thông tin thành viên, xem lịch sử, kỷ niệm và thống kê gia phả${scope}.`;
}

async function maybeGenerateConversationTitle(conversationId) {
    if (!conversationId || !(await memberSearch.tableExists('chatbot_messages'))) return;
    const [conversationRows] = await queryOptional('SELECT title FROM conversations WHERE id = ? LIMIT 1', [conversationId]);
    const currentTitle = String(conversationRows?.title || '').trim();
    if (currentTitle && currentTitle !== 'AI Family Assistant') return;

    const columns = await getTableColumns('chatbot_messages');
    const [countRow] = await queryOptional('SELECT COUNT(*) AS total FROM chatbot_messages WHERE conversation_id = ?', [conversationId]);
    const total = Number(countRow?.total || 0);
    if (total < 2 || total > 4) return;

    const senderSelect = columns.has('role')
        ? "CASE WHEN role = 'assistant' THEN 'bot' ELSE role END AS sender"
        : columns.has('sender')
            ? 'sender'
            : "'user' AS sender";
    const rows = await queryOptional(
        `SELECT ${senderSelect}, message
         FROM chatbot_messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC, id ASC
         LIMIT 2`,
        [conversationId]
    );
    const messages = rows.map((row) => row.message).filter(Boolean);
    if (messages.length < 2) return;
    const result = await chatbotAI.generateConversationTitle({ messages });
    const title = String(result?.data?.title || '').trim().slice(0, 255);
    if (!result.success || !title) return;
    await queryOptional('UPDATE conversations SET title = ? WHERE id = ?', [title, conversationId]);
}

function publicRelationPayload(payload) {
    if (!payload) return payload;
    const visualizer = payload.relationshipPath
        ? explanationService.buildPathVisualizer({
            relationshipPath: payload.relationshipPath,
            relationshipLabel: payload.relationshipLabel || payload.relationshipKey || null,
        })
        : null;
    return visualizer ? { ...payload, pathVisualizer: visualizer } : payload;
}

async function ambiguityResponse(res, intent, candidates, subject = null, clanId = null) {
    const clarification = buildClarificationResponse({
        candidates,
        reason: 'ambiguous_person',
        context: { intent, ...(subject ? { subject } : {}) },
    });
    // Mô tả từng người (đời, năm sinh, cha mẹ) để phân biệt người trùng tên.
    const graph = clanId ? await relationshipEngine.loadClanGraph(clanId).catch(() => null) : null;
    const described = clarification.candidates.map((candidate) => ({
        ...candidate,
        description: graph ? describePersonBrief(graph.people.get(Number(candidate.id)) || candidate, graph, relationshipEngine.personName) : null,
    }));
    if (graph) {
        clarification.answer = `Có ${described.length} người khớp với "${subject || 'người này'}": ${described.map((item, index) => `${index + 1}. ${item.description || item.name}`).join('; ')}. Bạn muốn hỏi người nào? (bấm chọn hoặc trả lời số thứ tự)`;
    }
    const turn = res?.locals?.chatbotTurn;
    if (turn?.memorySessionId) {
        turn.pending = {
            intent,
            subject,
            message: turn.message,
            candidates: described.map(({ id, name, generation, birthYear, description }) => ({ id, name, generation, birthYear, description })),
        };
        updateConversationMemory(turn.memorySessionId, { pendingClarification: turn.pending });
    }
    const body = {
        success: false,
        code: 'AMBIGUOUS_PERSON',
        intent,
        answer: clarification.answer,
        needsClarification: true,
        reason: clarification.reason,
        candidates: described.map((candidate) => ({
            ...candidate,
            confidence: Number(candidates.find((person) => Number(person.id) === Number(candidate.id))?.score || 0),
        })),
        pendingClarification: clarification.pendingClarification,
    };
    storeTurnAnswer(res, body);
    return res.status(200).json(body);
}

function notFoundResponse(res, intent, name) {
    const body = {
        success: false,
        code: 'PERSON_NOT_FOUND',
        intent,
        answer: `Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy thành viên khớp với "${Array.isArray(name) ? name[0] : name}".`,
        confidence: 0,
    };
    storeTurnAnswer(res, body);
    return res.status(200).json(body);
}

async function resolveNamedPerson(res, clanId, intent, names, currentMemberId = null) {
    // Người dùng vừa chọn một ứng viên khi được hỏi lại: dùng đúng người đó (một lần, đúng tên đang hỏi).
    const forced = res?.locals?.chatbotTurn?.forced;
    if (forced?.personId) {
        const asked = [].concat(names || []).map(normalizeName);
        if (!forced.subject || asked.includes(normalizeName(forced.subject))) {
            res.locals.chatbotTurn.forced = null;
            const person = await relationshipEngine.getPerson(forced.personId, { clanId });
            if (person) return person;
        }
    }
    const kinship = await resolveKinshipReference({ clanId, currentMemberId, names });
    if (kinship?.status === 'resolved') return kinship.person;
    if (kinship?.status === 'ambiguous') {
        await ambiguityResponse(res, intent, kinship.candidates, Array.isArray(names) ? names[0] : names, clanId);
        return null;
    }
    if (kinship?.status === 'not_found') {
        const body = {
            success: false,
            code: 'PERSON_NOT_FOUND',
            intent,
            answer: `Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy ${kinship.label} của bạn.`,
            confidence: 0,
        };
        storeTurnAnswer(res, body);
        res.status(200).json(body);
        return null;
    }

    const result = await memberSearch.resolvePerson({ clanId, names });
    if (result.status === 'not_found') {
        notFoundResponse(res, intent, names);
        return null;
    }
    if (result.status === 'ambiguous') {
        await ambiguityResponse(res, intent, result.candidates, Array.isArray(names) ? names[0] : names, clanId);
        return null;
    }
    return result.person;
}

async function handleFindRelationship({ res, clanId, currentMemberId, parsed }) {
    if (!currentMemberId) {
        return {
            success: true,
            intent: parsed.intent,
            answer: needsCurrentPersonAnswer(),
            confidence: 0.2,
            needsPersonSelection: true,
        };
    }
    let target = null;
    if (parsed.entities.source === 'selected_person' && parsed.entities.targetPersonId) {
        target = await relationshipEngine.getPerson(parsed.entities.targetPersonId, { clanId });
    } else if (Array.isArray(parsed.entities.targetName) && parsed.entities.targetName.length) {
        target = await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.targetName, currentMemberId);
    }
    if (!target && parsed.entities.source === 'selected_person') {
        return {
            success: false,
            intent: parsed.intent,
            answer: 'Vui lòng chọn một thành viên cụ thể để tôi xác định cách xưng hô.',
            confidence: 0.2,
        };
    }
    if (!target) return null;

    const relation = await relationshipEngine.findRelationship(currentMemberId, target.id, { clanId });
    if (!relation.found) {
        return {
            success: true,
            intent: parsed.intent,
            answer: `Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy đường quan hệ giữa bạn và ${relationshipEngine.personName(target)}.`,
            confidence: 0.35,
            relationshipPath: [],
        };
    }

    return {
        success: true,
        intent: parsed.intent,
        answer: explanationService.explainRelationship(relation) || `Theo dữ liệu gia phả hiện tại, ${relation.targetName} là ${relation.relationshipLabel} của bạn.`,
        confidence: Math.min(relation.confidence, parsed.confidence),
        relationshipPath: relation.relationshipPath,
        pathNodes: relation.pathNodes,
        relationshipKey: relation.relationshipKey,
        relationshipLabel: relation.relationshipLabel,
        explanation: explanationService.explainRelationship(relation),
        evidence: relation.evidence,
        pathVisualizer: explanationService.buildPathVisualizer(relation),
        sourcePerson: { id: relation.sourcePerson.id, name: relation.sourceName },
        targetPerson: { id: relation.targetPerson.id, name: relation.targetName },
    };
}

async function handleCompareRelationship({ res, clanId, currentMemberId, parsed }) {
    const entities = parsed.entities || {};
    if ((entities.personASelf || entities.personBSelf) && !currentMemberId) {
        return { success: true, intent: parsed.intent, answer: needsCurrentPersonAnswer(), confidence: 0.2, needsPersonSelection: true };
    }
    const personA = entities.personASelf
        ? await relationshipEngine.getPerson(currentMemberId, { clanId })
        : await resolveNamedPerson(res, clanId, parsed.intent, entities.personAName, currentMemberId);
    if (!personA) return null;
    const personB = entities.personBSelf
        ? await relationshipEngine.getPerson(currentMemberId, { clanId })
        : await resolveNamedPerson(res, clanId, parsed.intent, entities.personBName, currentMemberId);
    if (!personB) return null;
    // Một bên là chính người hỏi: trả lời theo góc nhìn "bạn", nêu cả hai chiều.
    if (entities.personASelf || entities.personBSelf) {
        const other = entities.personASelf ? personB : personA;
        const forward = await relationshipEngine.findRelationship(currentMemberId, other.id, { clanId });
        const backward = await relationshipEngine.findRelationship(other.id, currentMemberId, { clanId });
        if (!forward.found) {
            return { success: true, intent: parsed.intent, answer: `Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy đường quan hệ giữa bạn và ${relationshipEngine.personName(other)}.`, confidence: 0.35, relationshipPath: [] };
        }
        const otherName = relationshipEngine.personName(other);
        const reverse = backward.found ? ` Ngược lại, bạn là ${backward.relationshipLabel} của ${otherName}.` : '';
        return {
            success: true,
            intent: parsed.intent,
            answer: `${explanationService.explainRelationship(forward)}${reverse}`,
            confidence: Math.min(forward.confidence, parsed.confidence),
            relationshipPath: forward.relationshipPath,
            pathNodes: forward.pathNodes,
            relationshipLabel: forward.relationshipLabel,
            pathVisualizer: explanationService.buildPathVisualizer(forward),
            sourcePerson: { id: forward.sourcePerson.id, name: forward.sourceName },
            targetPerson: { id: forward.targetPerson.id, name: forward.targetName },
        };
    }

    const relation = await relationshipEngine.findRelationship(personA.id, personB.id, { clanId });
    if (!relation.found) {
        return {
            success: true,
            intent: parsed.intent,
            answer: `Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy đường quan hệ giữa ${relationshipEngine.personName(personA)} và ${relationshipEngine.personName(personB)}.`,
            confidence: 0.35,
            relationshipPath: [],
        };
    }

    return {
        success: true,
        intent: parsed.intent,
        answer: await (async () => {
            const base = explanationService.explainRelationship(relation, { viewerIsSource: false }) || `Theo dữ liệu gia phả hiện tại, ${relation.targetName} là ${relation.relationshipLabel} của ${relation.sourceName}.`;
            const backward = await relationshipEngine.findRelationship(personB.id, personA.id, { clanId });
            return backward.found ? `${base} Ngược lại, ${relation.sourceName} là ${backward.relationshipLabel} của ${relation.targetName}.` : base;
        })(),
        confidence: Math.min(relation.confidence, parsed.confidence),
        relationshipPath: relation.relationshipPath,
        pathNodes: relation.pathNodes,
        relationshipKey: relation.relationshipKey,
        relationshipLabel: relation.relationshipLabel,
        explanation: explanationService.explainRelationship(relation, { viewerIsSource: false }),
        evidence: relation.evidence,
        pathVisualizer: explanationService.buildPathVisualizer(relation),
        sourcePerson: { id: relation.sourcePerson.id, name: relation.sourceName },
        targetPerson: { id: relation.targetPerson.id, name: relation.targetName },
    };
}

const CHILD_TYPE_NOTES = { adopted: 'con nuôi', heir: 'con thừa tự', step: 'con riêng', foster: 'con nuôi dưỡng' };

// Con của một người, sắp theo thứ tự trong gia phả (sort_order) rồi năm sinh, kèm loại con.
function orderedChildrenOf(graph, personId) {
    const id = Number(personId);
    const rows = [];
    const seen = new Set();
    for (const family of graph.families.values()) {
        if (Number(family.father_id) !== id && Number(family.mother_id) !== id) continue;
        for (const row of graph.childrenByFamily.get(Number(family.id)) || []) {
            const person = graph.people.get(Number(row.person_id));
            if (!person || seen.has(Number(person.id))) continue;
            seen.add(Number(person.id));
            rows.push({ person, row, childType: String(row.child_type || 'biological') });
        }
    }
    const order = (item) => (Number(item.row.sort_order) > 0 ? Number(item.row.sort_order) : 999);
    return rows.sort((a, b) => order(a) - order(b)
        || String(a.person.birth_date || '9999').localeCompare(String(b.person.birth_date || '9999'))
        || Number(a.person.id) - Number(b.person.id));
}

function matchesChildFilter(item, filter) {
    if (!filter) return true;
    if (filter === 'adopted') return ['adopted', 'heir', 'foster'].includes(item.childType);
    if (filter === 'step') return item.childType === 'step';
    if (filter === 'biological') return ['biological', 'unknown', ''].includes(item.childType);
    if (filter === 'son') return Number(item.person.gender) === 1;
    if (filter === 'daughter') return Number(item.person.gender) === 2;
    return true;
}

async function handleListChildren({ res, clanId, currentMemberId, parsed }) {
    const target = await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.targetName, currentMemberId);
    if (!target) return null;
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const targetName = relationshipEngine.personName(target);
    const filter = parsed.entities.childFilter || null;
    const all = orderedChildrenOf(graph, target.id);
    const children = all.filter((item) => matchesChildFilter(item, filter));
    const word = { adopted: 'con nuôi', step: 'con riêng', biological: 'con ruột', son: 'con trai', daughter: 'con gái' }[filter] || 'con';
    const nameWithNote = (item) => (CHILD_TYPE_NOTES[item.childType] && !filter
        ? `${relationshipEngine.personName(item.person)} (${CHILD_TYPE_NOTES[item.childType]})`
        : relationshipEngine.personName(item.person));
    const people = (items) => items.map((item) => ({ id: item.person.id, name: relationshipEngine.personName(item.person) }));

    if (parsed.entities.order) {
        const order = parsed.entities.order;
        const picked = order === 'first' ? children[0] : order === 'last' ? children[children.length - 1] : children[Number(order) - 1];
        if (!picked) {
            return { success: true, intent: parsed.intent, answer: `Theo dữ liệu gia phả hiện tại, chưa đủ dữ liệu con của ${targetName} để xác định.`, confidence: 0.5, people: [] };
        }
        const orderWord = order === 'first' ? 'con cả' : order === 'last' ? 'con út' : `con thứ ${order}`;
        // Có con trùng tên thì kèm năm sinh để biết là ai.
        const label = (item) => {
            const name = relationshipEngine.personName(item.person);
            const twins = all.filter((other) => relationshipEngine.personName(other.person) === name).length > 1;
            const year = dateParts(item.person.birth_date)?.year;
            return twins && year ? `${name} (sinh ${year})` : name;
        };
        let answer = `Theo dữ liệu gia phả hiện tại, ${orderWord} của ${targetName} là ${label(picked)}`;
        // "Con trưởng" theo nếp gia phả thường hiểu là con trai trưởng: nêu thêm nếu con cả là con gái.
        if (order === 'first' && Number(picked.person.gender) !== 1) {
            const eldestSon = children.find((item) => Number(item.person.gender) === 1);
            if (eldestSon) answer += `; con trai trưởng là ${label(eldestSon)}`;
        }
        answer += '. Thứ tự dựa theo thứ tự con và năm sinh ghi trong gia phả.';
        return { success: true, intent: parsed.intent, answer, confidence: parsed.confidence, subjectPerson: { id: target.id, name: targetName }, people: people([picked]) };
    }

    let answer;
    if (!children.length) {
        answer = `Theo dữ liệu gia phả hiện tại, tôi chưa thấy dữ liệu ${word} của ${targetName}.`;
    } else if (parsed.entities.count) {
        answer = `Theo dữ liệu gia phả hiện tại, ${targetName} có ${children.length} ${word}: ${children.map(nameWithNote).join(', ')}.`;
    } else {
        answer = `Theo dữ liệu gia phả hiện tại, ${word} của ${targetName} ${children.length > 1 ? 'gồm' : 'là'}: ${children.map(nameWithNote).join(', ')}.`;
    }
    return { success: true, intent: parsed.intent, answer, confidence: parsed.confidence, subjectPerson: { id: target.id, name: targetName }, people: people(children) };
}

// "X là con ruột hay con nuôi?"
async function handleChildStatus({ res, clanId, currentMemberId, parsed }) {
    const person = await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.targetName, currentMemberId);
    if (!person) return null;
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const name = relationshipEngine.personName(person);
    const parts = [];
    for (const [familyId, rows] of graph.childrenByFamily) {
        const row = rows.find((item) => Number(item.person_id) === Number(person.id));
        if (!row) continue;
        const family = graph.families.get(Number(familyId));
        const parents = [family?.father_id, family?.mother_id]
            .map((id) => graph.people.get(Number(id)))
            .filter(Boolean)
            .map(relationshipEngine.personName);
        const kind = CHILD_TYPE_NOTES[String(row.child_type || '')] || 'con ruột';
        parts.push(`${kind}${parents.length ? ` của ${parents.join(' và ')}` : ''}`);
    }
    return {
        success: true,
        intent: parsed.intent,
        answer: parts.length
            ? `Theo dữ liệu gia phả hiện tại, ${name} là ${parts.join('; đồng thời là ')}.`
            : `Gia phả chưa ghi cha mẹ của ${name}.`,
        confidence: parts.length ? parsed.confidence : 0.5,
        person: { id: person.id, name },
    };
}

const ENDED_STATUSES = new Set(['divorced', 'separated', 'annulled']);

// Mô tả một cuộc hôn nhân từ dòng families: "vợ cả", "vợ lẽ", "đã ly hôn".
function describeUnion(family, spouseWord) {
    if (!family) return null;
    const notes = [];
    if (String(family.union_type || '') === 'concubine') notes.push(spouseWord === 'vợ' ? 'vợ lẽ' : 'quan hệ thiếp');
    else if (Number(family.wife_rank) === 1 && spouseWord === 'vợ') notes.push('vợ cả');
    else if (Number(family.wife_rank) > 1 && spouseWord === 'vợ') notes.push(`vợ thứ ${family.wife_rank}`);
    if (ENDED_STATUSES.has(String(family.relationship_status || ''))) notes.push('đã ly hôn');
    return notes.length ? notes.join(', ') : null;
}

async function handleFindSpouse({ res, clanId, currentMemberId, parsed }) {
    const target = await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.targetName, currentMemberId);
    if (!target) return null;
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const targetName = relationshipEngine.personName(target);
    const spouseWord = Number(target.gender) === 2 ? 'chồng' : (Number(target.gender) === 1 ? 'vợ' : 'vợ/chồng');
    const seen = new Set();
    let unions = (graph.adjacency.get(Number(target.id)) || [])
        .filter((edge) => edge.type === 'spouse' && graph.people.has(Number(edge.to)))
        .filter((edge) => (seen.has(Number(edge.to)) ? false : seen.add(Number(edge.to))))
        .map((edge) => {
            const family = graph.families.get(Number(edge.familyId)) || null;
            return { person: graph.people.get(Number(edge.to)), family, note: describeUnion(family, spouseWord) };
        });
    if (parsed.entities.rank === 'secondary') {
        unions = unions.filter((item) => String(item.family?.union_type || '') === 'concubine' || Number(item.family?.wife_rank) > 1);
    } else if (parsed.entities.rank === 'first') {
        unions = unions.filter((item) => Number(item.family?.wife_rank) === 1 || (unions.length === 1));
    }
    const label = parsed.entities.rank === 'secondary' ? 'vợ lẽ' : parsed.entities.rank === 'first' ? 'vợ cả' : spouseWord;
    const list = unions.map((item) => (item.note && item.note !== label
        ? `${relationshipEngine.personName(item.person)} (${item.note})`
        : relationshipEngine.personName(item.person))).join(', ');

    let answer;
    if (!unions.length) {
        answer = `Theo dữ liệu gia phả hiện tại, tôi chưa thấy dữ liệu ${label} của ${targetName}.`;
    } else if (parsed.entities.count) {
        answer = `Theo dữ liệu gia phả hiện tại, ${targetName} có ${unions.length} ${label}: ${list}.`;
    } else {
        answer = `Theo dữ liệu gia phả hiện tại, ${label} của ${targetName} ${unions.length > 1 ? 'gồm' : 'là'}: ${list}.`;
    }
    return {
        success: true,
        intent: parsed.intent,
        answer,
        confidence: parsed.confidence,
        subjectPerson: { id: target.id, name: targetName },
        people: unions.map((item) => ({ id: item.person.id, name: relationshipEngine.personName(item.person), note: item.note })),
    };
}

async function handleFindParents({ res, clanId, currentMemberId, parsed }) {
    if (isSelfReferenceName(parsed.entities.targetName) && !currentMemberId) {
        return {
            success: true,
            intent: parsed.intent,
            answer: needsCurrentPersonAnswer(),
            confidence: 0.2,
            needsPersonSelection: true,
        };
    }
    const target = isSelfReferenceName(parsed.entities.targetName)
        ? await relationshipEngine.getPerson(currentMemberId, { clanId })
        : await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.targetName, currentMemberId);
    if (!target && isSelfReferenceName(parsed.entities.targetName)) {
        return {
            success: false,
            intent: parsed.intent,
            answer: 'Tôi chưa xác định được bạn là thành viên nào trong gia phả.',
            confidence: 0,
        };
    }
    if (!target) return null;
    const parentResult = await relationshipEngine.getParentWithSpouseFallback(target.id, parsed.entities.parentType, { clanId });
    const parents = parentResult.parents;
    const people = [];
    if (parsed.entities.parentType !== 'mother' && parents.father) people.push(parents.father);
    if (parsed.entities.parentType !== 'father' && parents.mother) people.push(parents.mother);
    const targetName = relationshipEngine.personName(target);

    return {
        success: true,
        intent: parsed.intent,
        answer: people.length
            ? `Theo dữ liệu gia phả hiện tại, ${parsed.entities.parentType === 'both' ? 'cha mẹ' : parsed.entities.parentType === 'mother' ? 'mẹ' : 'bố/cha'} của ${isSelfReferenceName(parsed.entities.targetName) ? 'bạn' : targetName} là: ${formatPeopleList(people)}.${parentResult.inferred ? ' Quan hệ này được suy ra từ dữ liệu vợ/chồng của cha hoặc mẹ trong gia phả.' : ''}`
            : `Theo dữ liệu gia phả hiện tại, tôi chưa thấy dữ liệu ${parsed.entities.parentType === 'mother' ? 'mẹ' : parsed.entities.parentType === 'father' ? 'bố/cha' : 'cha mẹ'} của ${isSelfReferenceName(parsed.entities.targetName) ? 'bạn' : targetName}.`,
        confidence: parentResult.inferred ? Math.min(parsed.confidence, 0.72) : parsed.confidence,
        subjectPerson: { id: target.id, name: targetName },
        people: people.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
        inferred: parentResult.inferred || false,
        inferredFrom: parentResult.inferredFrom || null,
    };
}

async function handleFindByKinship({ clanId, currentMemberId, parsed }) {
    if (!currentMemberId) {
        return {
            success: true,
            intent: parsed.intent,
            answer: needsCurrentPersonAnswer(),
            confidence: 0.2,
            needsPersonSelection: true,
        };
    }
    const entities = parsed.entities || {};
    const term = entities.kinshipTerm;
    if (Array.isArray(entities.ambiguousTerms) && entities.ambiguousTerms.length > 1) {
        const options = entities.ambiguousTerms;
        return {
            success: true,
            intent: parsed.intent,
            answer: `Bạn muốn hỏi ${options.map((item) => `"${item}"`).join(' hay ')} của bạn? Gõ có dấu giúp tôi hiểu chính xác hơn.`,
            confidence: 0.5,
            needsClarification: true,
            suggestions: options.map((item) => ({ type: 'quick_question', text: `${capitalizeFirst(item)} của tôi là ai?` })),
        };
    }

    const found = await relationshipEngine.findPeopleByKinshipTerm(currentMemberId, term, { clanId });
    // "chú ruột": chỉ giữ nhãn đúng bằng từ hỏi (bỏ "chú họ").
    const matches = entities.strict
        ? found.filter((item) => String(item.label).replace(/\s*\(.*?\)\s*/g, ' ').trim() === term)
        : found;
    if (!matches.length) {
        return {
            success: true,
            intent: parsed.intent,
            answer: entities.count
                ? `Theo dữ liệu gia phả hiện tại, chưa ghi nhận ${term} nào của bạn.`
                : `Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy ${term} của bạn.`,
            confidence: 0.5,
            people: [],
        };
    }

    // Nhóm theo nhãn để không lẫn ruột với họ ("chú: …; chú họ: …").
    const groups = new Map();
    for (const match of matches) {
        const label = String(match.label).replace(/\s*\(.*?\)\s*/g, ' ').trim();
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(match);
    }
    const names = (items) => items.map((item) => item.name).join(', ');
    const grouped = () => [...groups].map(([label, items]) => `${label}: ${names(items)}`).join('; ');
    let answer;
    if (entities.count) {
        answer = `Theo dữ liệu gia phả hiện tại, bạn có ${matches.length} ${term}: ${groups.size === 1 ? names(matches) : grouped()}.`;
    } else if (groups.size === 1) {
        const [label, items] = [...groups][0];
        answer = label === term
            ? `Theo dữ liệu gia phả hiện tại, ${term} của bạn là: ${names(items)}.`
            : `Theo dữ liệu gia phả hiện tại, ${term} của bạn (${label}) là: ${names(items)}.`;
    } else {
        answer = `Theo dữ liệu gia phả hiện tại, ${term} của bạn gồm — ${grouped()}.`;
    }
    const uncertain = matches.filter((item) => item.uncertain);
    if (uncertain.length) {
        answer += ` Với ${names(uncertain)}, gia phả chưa đủ thông tin thứ bậc nên cách xưng hô có thể khác.`;
    }

    return {
        success: true,
        intent: parsed.intent,
        answer,
        confidence: parsed.confidence || 0.88,
        people: matches.map((item) => ({ id: item.id, name: item.name, relationshipLabel: item.label })),
    };
}

async function handleFindGeneration({ res, clanId, currentMemberId, parsed }) {
    let person;
    if (parsed.entities.source === 'current_member') {
        if (!currentMemberId) {
            return {
                success: true,
                intent: parsed.intent,
                answer: needsCurrentPersonAnswer(),
                confidence: 0.2,
                needsPersonSelection: true,
            };
        }
        person = await relationshipEngine.getPerson(currentMemberId, { clanId });
    } else {
        const search = await memberSearch.resolvePerson({ clanId, names: parsed.entities.targetName });
        const generations = [...new Set((search.candidates || []).map((item) => item.generation).filter(Boolean))];
        if (search.status === 'ambiguous' && generations.length === 1 && search.candidates.every((item) => item.generation)) {
            const name = relationshipEngine.personName(search.candidates[0]);
            return {
                success: true,
                intent: parsed.intent,
                answer: `Theo dữ liệu gia phả hiện tại, có ${search.candidates.length} người tên ${name} và đều thuộc đời thứ ${generations[0]}.`,
                confidence: parsed.confidence,
                people: search.candidates.map((item) => ({ id: item.id, name: relationshipEngine.personName(item), generation: item.generation })),
            };
        }
        person = await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.targetName, currentMemberId);
        if (!person) return null;
    }

    if (!person) {
        return {
            success: false,
            intent: parsed.intent,
            answer: 'Tôi chưa xác định được thành viên cần tra đời thứ mấy.',
            confidence: 0,
        };
    }

    const generation = person.generation || person.generation_level || null;
    return {
        success: true,
        intent: parsed.intent,
        answer: generation
            ? `Theo dữ liệu gia phả hiện tại, ${relationshipEngine.personName(person)} thuộc đời thứ ${generation}.`
            : `Theo dữ liệu gia phả hiện tại, ${relationshipEngine.personName(person)} chưa có dữ liệu đời/thế hệ.`,
        confidence: generation ? parsed.confidence : 0.5,
        person: { id: person.id, name: relationshipEngine.personName(person), generation },
    };
}

// Người được hỏi: chính người dùng ("tôi") hoặc người gọi tên. person rỗng nghĩa là đã có phản hồi (lỗi/đa nghĩa).
async function resolveSubjectPerson({ res, clanId, currentMemberId, parsed }) {
    const names = parsed.entities?.targetName;
    if (parsed.entities?.source === 'current_member' || !Array.isArray(names) || !names.length) {
        if (!currentMemberId) {
            return { response: { success: true, intent: parsed.intent, answer: needsCurrentPersonAnswer(), confidence: 0.2, needsPersonSelection: true } };
        }
        const person = await relationshipEngine.getPerson(currentMemberId, { clanId });
        return person
            ? { person }
            : { response: { success: false, intent: parsed.intent, answer: 'Tôi chưa xác định được thành viên bạn đang hỏi.', confidence: 0 } };
    }
    const person = await resolveNamedPerson(res, clanId, parsed.intent, names, currentMemberId);
    return person ? { person } : { response: null };
}

const ANCESTOR_LEVEL_LABELS = ['Cha mẹ', 'Ông bà', 'Cụ', 'Kỵ', 'Cao tổ'];
const ANCESTOR_EDGE_TYPES = new Set(['father', 'mother', 'adopted_parent']);

// Tổ tiên theo dòng sinh/nhận làm con (không tính cha mẹ kế), nhóm theo đời phía trên.
// Thủy tổ: người đời đầu không có cha mẹ trong cây, ưu tiên người có con cháu; nam đứng trước.
function computeClanFounders(graph) {
    const people = [...graph.people.values()];
    const hasParent = (id) => (graph.adjacency.get(Number(id)) || []).some((edge) => ANCESTOR_EDGE_TYPES.has(edge.type));
    const hasChild = (id) => (graph.adjacency.get(Number(id)) || []).some((edge) => ['son', 'daughter', 'child', 'adopted_son', 'adopted_daughter', 'adopted_child'].includes(edge.type));
    const generations = people.map((person) => Number(person.generation)).filter((value) => Number.isFinite(value) && value > 0);
    const firstGeneration = generations.length ? Math.min(...generations) : null;
    const roots = people.filter((person) => !hasParent(person.id) && (firstGeneration === null || Number(person.generation) === firstGeneration));
    const withDescendants = roots.filter((person) => hasChild(person.id));
    const founders = (withDescendants.length ? withDescendants : roots)
        .sort((a, b) => (Number(a.gender) === 1 ? 0 : 1) - (Number(b.gender) === 1 ? 0 : 1) || Number(a.id) - Number(b.id));
    return { founders, firstGeneration };
}

async function handleClanFounders({ clanId, parsed }) {
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const { founders, firstGeneration } = computeClanFounders(graph);
    if (!founders.length) {
        return { success: true, intent: parsed.intent, answer: 'Gia phả hiện chưa ghi nhận thủy tổ của dòng họ.', confidence: 0.5, people: [] };
    }
    const main = founders[0];
    const spouseIds = new Set((graph.adjacency.get(Number(main.id)) || []).filter((edge) => edge.type === 'spouse').map((edge) => Number(edge.to)));
    const others = founders.slice(1).filter((person) => !spouseIds.has(Number(person.id)));
    const spouses = founders.slice(1).filter((person) => spouseIds.has(Number(person.id)));
    const generationText = firstGeneration ? ` (đời ${firstGeneration})` : '';
    let answer = `Theo dữ liệu gia phả hiện tại, thủy tổ được ghi nhận${generationText} là ${relationshipEngine.personName(main)}`;
    if (spouses.length) answer += `, ${Number(main.gender) === 2 ? 'chồng' : 'vợ'} là ${formatPeopleList(spouses)}`;
    if (others.length) answer += `; cùng đời đầu còn có ${formatPeopleList(others)}`;
    answer += '.';
    return {
        success: true,
        intent: parsed.intent,
        answer,
        confidence: parsed.confidence || 0.85,
        person: { id: main.id, name: relationshipEngine.personName(main) },
        people: founders.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
    };
}

// "03-10" -> { month: 3, day: 10 }
function parseLunarMonthDay(value) {
    const match = String(value || '').match(/^(\d{1,2})-(\d{1,2})$/);
    return match ? { month: Number(match[1]), day: Number(match[2]) } : null;
}

// Ngày giỗ (âm lịch) của một người: ngày giỗ ghi sẵn, hoặc đổi từ ngày mất dương lịch chính xác.
function anniversaryOf(person) {
    const calendar = require('../calendar/calendar.controller');
    const stored = parseLunarMonthDay(person.death_anniversary_lunar);
    if (stored) return { ...stored, source: 'recorded' };
    const parts = dateParts(person.death_date);
    if (!parts || (person.death_date_precision && person.death_date_precision !== 'exact')) return null;
    const lunar = calendar.solarIsoToLunar(`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`);
    return lunar ? { month: lunar.month, day: lunar.day, source: 'death_date' } : null;
}

// Lần giỗ sắp tới (dương lịch) tính từ hôm nay.
function nextAnniversarySolar({ month, day }, now = new Date()) {
    const calendar = require('../calendar/calendar.controller');
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const year of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
        const iso = calendar.convertLunar2SolarDate(day, month, year);
        if (iso && iso >= today) return iso;
    }
    return null;
}

function anniversaryAnswerFor(person) {
    const name = relationshipEngine.personName(person);
    if (Number(person.is_living) === 1) return `${name} còn sống nên chưa có ngày giỗ.`;
    const anniversary = anniversaryOf(person);
    if (!anniversary) return `Gia phả chưa ghi ngày mất hoặc ngày giỗ của ${name}.`;
    const next = nextAnniversarySolar(anniversary);
    return `Ngày giỗ của ${name} là ngày ${anniversary.day}/${anniversary.month} âm lịch${next ? `; lần tới rơi vào ${formatDateVN(next)} dương lịch` : ''}.`;
}

async function findEventsByKeyword({ clanId, accountId, keyword }) {
    const like = `%${keyword}%`;
    const clanEvents = await queryOptional(
        `SELECT id, title, event_date, start_date, end_date FROM events WHERE clan_id = ? AND title LIKE ? ORDER BY COALESCE(start_date, event_date) ASC LIMIT 20`,
        [clanId, like]
    );
    const calendarEvents = accountId ? await queryOptional(
        `SELECT id, title, event_date, event_time FROM calendar_events WHERE clan_id = ? AND title LIKE ? AND (visibility = 'global' OR creator_account_id = ?) ORDER BY event_date ASC LIMIT 20`,
        [clanId, like, accountId]
    ) : [];
    const iso = (value) => {
        const parts = dateParts(value);
        return parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : null;
    };
    return [
        ...clanEvents.map((row) => ({ title: row.title, start: iso(row.start_date || row.event_date), end: iso(row.end_date || row.start_date || row.event_date), time: '' })),
        ...calendarEvents.map((row) => ({ title: row.title, start: iso(row.event_date), end: iso(row.event_date), time: row.event_time || '' })),
    ].filter((item) => item.start);
}

function describeEventMatch(events, keyword, now = new Date()) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const upcoming = events.filter((item) => item.end >= today).sort((a, b) => a.start.localeCompare(b.start));
    const range = (item) => (item.end && item.end !== item.start ? `${formatDateVN(item.start)} - ${formatDateVN(item.end)}` : formatDateVN(item.start));
    if (upcoming.length) {
        const first = upcoming[0];
        const days = Math.round((new Date(`${first.start}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
        const when = days > 0 ? ` (còn ${days} ngày)` : days === 0 ? ' (hôm nay)' : ' (đang diễn ra)';
        const more = upcoming.length > 1 ? ` Sau đó: ${upcoming.slice(1, 3).map((item) => `${item.title} (${range(item)})`).join('; ')}.` : '';
        return `Theo lịch của dòng họ, ${first.title}: ${range(first)}${first.time ? ` lúc ${first.time}` : ''}${when}.${more}`;
    }
    const past = events.sort((a, b) => b.start.localeCompare(a.start))[0];
    if (past) return `Chưa có lịch sắp tới cho "${keyword}". Lần gần nhất: ${past.title} (${range(past)}).`;
    return null;
}

async function handlePersonAnniversary({ res, clanId, currentMemberId, accountId, parsed }) {
    const entities = parsed.entities || {};
    if (entities.preferEvent) {
        const events = await findEventsByKeyword({ clanId, accountId, keyword: entities.preferEvent });
        const text = describeEventMatch(events, entities.preferEvent);
        if (text) return { success: true, intent: parsed.intent, answer: text, confidence: 0.82 };
    }
    let people = [];
    if (entities.source === 'clan') {
        const graph = await relationshipEngine.loadClanGraph(clanId);
        const { founders } = computeClanFounders(graph);
        people = founders.slice(0, 1);
    } else if (entities.source === 'kinship') {
        if (!currentMemberId) return { success: true, intent: parsed.intent, answer: needsCurrentPersonAnswer(), confidence: 0.2, needsPersonSelection: true };
        people = (await relationshipEngine.findPeopleByKinshipTerm(currentMemberId, entities.kinshipTerm, { clanId })).map((item) => item.person);
    } else {
        const person = await resolveNamedPerson(res, clanId, parsed.intent, entities.targetName, currentMemberId);
        if (!person) return null;
        people = [person];
    }
    if (!people.length) {
        return { success: true, intent: parsed.intent, answer: 'Theo dữ liệu gia phả hiện tại, tôi chưa xác định được người bạn hỏi ngày giỗ.', confidence: 0.4 };
    }
    return {
        success: true,
        intent: parsed.intent,
        answer: people.map(anniversaryAnswerFor).join(' '),
        confidence: parsed.confidence || 0.84,
        people: people.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
    };
}

async function handleEventLookup({ clanId, accountId, parsed }) {
    const keyword = String(parsed.entities?.keyword || '').trim();
    const events = keyword ? await findEventsByKeyword({ clanId, accountId, keyword }) : [];
    return {
        success: true,
        intent: parsed.intent,
        answer: describeEventMatch(events, keyword) || `Chưa tìm thấy sự kiện "${keyword}" trong lịch của dòng họ.`,
        confidence: events.length ? 0.84 : 0.5,
    };
}

async function handleListAncestors({ res, clanId, currentMemberId, parsed }) {
    if (parsed.entities?.source === 'clan') return handleClanFounders({ clanId, parsed });
    const subject = await resolveSubjectPerson({ res, clanId, currentMemberId, parsed });
    if (!subject.person) return subject.response;
    const person = subject.person;
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const name = relationshipEngine.personName(graph.people.get(Number(person.id)) || person);

    const seen = new Set([Number(person.id)]);
    const levels = [];
    let frontier = [Number(person.id)];
    for (let depth = 0; depth < 12 && frontier.length; depth += 1) {
        const next = [];
        for (const id of frontier) {
            for (const edge of graph.adjacency.get(id) || []) {
                const target = Number(edge.to);
                if (!ANCESTOR_EDGE_TYPES.has(edge.type) || seen.has(target) || !graph.people.has(target)) continue;
                seen.add(target);
                next.push(target);
            }
        }
        if (next.length) levels.push(next);
        frontier = next;
    }

    if (!levels.length) {
        return {
            success: true,
            intent: parsed.intent,
            answer: `Theo dữ liệu gia phả hiện tại, chưa có thông tin tổ tiên của ${name}.`,
            confidence: 0.6,
            person: { id: person.id, name },
            people: [],
        };
    }

    const label = (index) => ANCESTOR_LEVEL_LABELS[index] || `Đời trên thứ ${index + 1}`;
    const lines = levels.map((ids, index) => `${label(index)}: ${formatPeopleList(ids.map((id) => graph.people.get(id)).filter(Boolean))}`);
    const founders = levels[levels.length - 1].map((id) => graph.people.get(id)).filter(Boolean);
    const people = levels.flat().map((id) => graph.people.get(id)).filter(Boolean);
    return {
        success: true,
        intent: parsed.intent,
        answer: `Theo dữ liệu gia phả hiện tại, tổ tiên của ${name} gồm — ${lines.join('; ')}. Người xa nhất được ghi nhận: ${formatPeopleList(founders)}.`,
        confidence: parsed.confidence,
        person: { id: person.id, name },
        people: people.slice(0, 20).map((item) => ({ id: item.id, name: relationshipEngine.personName(item) })),
    };
}

// Những người cùng đời (cùng số đời trong gia phả) với một người.
async function handleSameGeneration({ res, clanId, currentMemberId, parsed }) {
    const subject = await resolveSubjectPerson({ res, clanId, currentMemberId, parsed });
    if (!subject.person) return subject.response;
    const person = subject.person;
    const name = relationshipEngine.personName(person);
    const generation = person.generation || person.generation_level || null;
    if (!generation) {
        return {
            success: true,
            intent: parsed.intent,
            answer: `Theo dữ liệu gia phả hiện tại, ${name} chưa có dữ liệu đời/thế hệ nên chưa tìm được người cùng đời.`,
            confidence: 0.5,
            person: { id: person.id, name },
        };
    }

    const rows = await queryOptional(
        `SELECT p.id, p.display_name, p.surname, p.middle_name, p.first_name, p.gender
         FROM people p
         LEFT JOIN accounts a ON a.person_id = p.id
         ${ARCHIVED_MEMBER_JOIN_SQL}
         WHERE p.clan_id = ? AND p.generation = ? AND p.id <> ? AND am.id IS NULL
         ORDER BY p.display_name ASC, p.id ASC
         LIMIT 31`,
        [clanId, generation, person.id]
    );
    const shown = rows.slice(0, 30);
    return {
        success: true,
        intent: parsed.intent,
        answer: shown.length
            ? `Theo dữ liệu gia phả hiện tại, ${name} thuộc đời thứ ${generation}; những người cùng đời${rows.length > 30 ? ' (30 người đầu)' : ''}: ${formatPeopleList(shown)}.`
            : `Theo dữ liệu gia phả hiện tại, ${name} thuộc đời thứ ${generation} và chưa ghi nhận người nào khác cùng đời.`,
        confidence: parsed.confidence,
        person: { id: person.id, name, generation },
        people: shown.map((item) => ({ id: item.id, name: relationshipEngine.personName(item) })),
    };
}

async function handleSelfIdentity({ clanId, currentMemberId, parsed }) {
    const person = await relationshipEngine.getPerson(currentMemberId, { clanId });
    if (!person) {
        return {
            success: false,
            intent: parsed.intent,
            answer: 'Tôi chưa xác định được bạn là thành viên nào trong gia phả.',
            confidence: 0,
        };
    }

    const name = relationshipEngine.personName(person);
    return {
        success: true,
        intent: parsed.intent,
        answer: `Theo ngữ cảnh đăng nhập hiện tại, bạn đang được liên kết với ${name}${person.generation ? `, đời thứ ${person.generation}` : ''}.`,
        confidence: parsed.confidence,
        person: {
            id: person.id,
            name,
            generation: person.generation || null,
            clanId: person.clan_id || clanId,
        },
    };
}

const formatIsoVN = (iso) => {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(iso || '');
};

// Bản nháp sự kiện từ câu tự nhiên. AI không tự ghi vào lịch: trả nút "Thêm vào lịch" để người dùng xác nhận.
function buildEventDraftPayload(message) {
    const { convertLunar2SolarDate } = require('../calendar/calendar.controller');
    const draft = parseEventCommand(message, {
        lunarToSolar: (day, month, year) => convertLunar2SolarDate(day, month, year, 0, 7),
    });
    if (!draft) return null;
    if (draft.needsDate) {
        return {
            success: true,
            intent: 'create_event_draft',
            answer: `Bạn muốn đặt "${draft.title}" vào ngày nào? Ví dụ: "${draft.title} ngày 20/10 lúc 8h" hoặc "ngày 15/3 âm lịch".`,
            confidence: 0.6,
            needsClarification: true,
            eventDraft: draft,
        };
    }
    const event = {
        title: draft.title,
        date: draft.date,
        time: draft.time,
        type: draft.type,
        reminder_days: draft.reminderDays,
        visibility: 'personal',
        note: draft.lunar ? `Ngày âm lịch: ${draft.lunarText}. Tạo từ trợ lý AI.` : 'Tạo từ trợ lý AI.',
    };
    return {
        success: true,
        intent: 'create_event_draft',
        answer: `Tôi đã chuẩn bị lịch "${draft.title}" vào ngày ${formatIsoVN(draft.date)}${draft.lunar ? ` (${draft.lunarText})` : ''}${draft.time ? ` lúc ${draft.time}` : ''}, nhắc trước ${draft.reminderDays} ngày. Bấm "Thêm vào lịch" để lưu, hoặc sửa lại câu nếu chưa đúng.`,
        confidence: 0.85,
        eventDraft: event,
        actions: [{ type: 'create_calendar_event', label: 'Thêm vào lịch', payload: event }],
    };
}

// "<quan hệ> của <tên người>": tìm người theo tên rồi đi theo chuỗi quan hệ từ người đó.
// Trả null để luồng cũ xử lý khi câu không có dạng này hoặc không tìm thấy tên.
async function handleNamedRelationshipExpression({ clanId, message, forced = null }) {
    const ast = parseNamedRelationshipExpression(message);
    if (!ast) return null;
    let search;
    if (forced?.personId && (!forced.subject || normalizeName(forced.subject) === normalizeName(ast.personName))) {
        const chosen = await relationshipEngine.getPerson(forced.personId, { clanId });
        search = chosen ? { status: 'resolved', person: chosen, candidates: [chosen] } : await memberSearch.resolvePerson({ clanId, names: [ast.personName] });
    } else {
        search = await memberSearch.resolvePerson({ clanId, names: [ast.personName] });
    }
    if (search.status === 'not_found') return null;
    // Câu gõ không dấu ("bo cua …"): hiện từ xưng hô có dấu ("cha của …").
    const accentedKeys = chainKeysFromTerms(ast.terms);
    const label = (accentedKeys && !hasVietnameseDiacritics(ast.originalTerms)
        ? accentedKeys.slice().reverse().join(' của ')
        : String(ast.originalTerms || ast.terms.join(' của '))).toLocaleLowerCase('vi-VN');
    if (search.status === 'ambiguous') {
        const candidateGraph = await relationshipEngine.loadClanGraph(clanId);
        const described = search.candidates.map((person) => describePersonBrief(candidateGraph.people.get(Number(person.id)) || person, candidateGraph, relationshipEngine.personName));
        return {
            success: true,
            intent: 'relationship_expression',
            answer: `Có ${search.candidates.length} người tên "${ast.personName}" trong gia phả: ${described.map((item, index) => `${index + 1}. ${item}`).join('; ')}. Bạn muốn hỏi ${label} của người nào? (bấm chọn hoặc trả lời số thứ tự)`,
            subject: ast.personName,
            candidates: search.candidates.map((person, index) => ({ id: person.id, name: relationshipEngine.personName(person), generation: person.generation || null, description: described[index] })),
            confidence: 0.5,
            needsClarification: true,
            people: search.candidates.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
        };
    }
    const base = search.person;
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const structuralKeys = chainKeysFromTerms(ast.terms);
    const structural = structuralKeys
        ? await relationshipEngine.resolveKinshipChain(base.id, structuralKeys, { clanId })
        : null;
    const resolved = structural?.ok
        ? { ok: true, candidatePersonIds: structural.ids }
        : resolveRelationshipExpression({ ...ast, base: 'me' }, { sourcePersonId: base.id, graph });
    const baseName = relationshipEngine.personName(graph.people.get(Number(base.id)) || base);
    const people = (resolved.candidatePersonIds || [])
        .map((id) => graph.people.get(Number(id)))
        .filter(Boolean);
    if (!resolved.ok || !people.length) {
        return {
            success: true,
            intent: 'relationship_expression',
            answer: `Theo dữ liệu gia phả hiện tại, chưa có thông tin ${label} của ${baseName}.`,
            confidence: 0.6,
            sourcePerson: { id: base.id, name: baseName },
            people: [],
        };
    }
    return {
        success: true,
        intent: 'relationship_expression',
        answer: `Theo dữ liệu gia phả hiện tại, ${label} của ${baseName} ${people.length > 1 ? 'gồm' : 'là'}: ${formatPeopleList(people)}.`,
        confidence: ast.confidence,
        sourcePerson: { id: base.id, name: baseName },
        people: people.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
        relationshipExpression: ast,
    };
}

async function handleRelationshipExpression({ clanId, currentMemberId, message }) {
    const ast = parseRelationshipExpression(message);
    if (ast.needsClarification) return null;
    const structuralKeys = currentMemberId ? chainKeysFromTerms(ast.terms) : null;
    if (structuralKeys) {
        const structural = await answerViewerKinshipChain({ clanId, currentMemberId, keys: structuralKeys, intent: 'relationship_expression' });
        if (structural) return structural;
    }

    const graph = await relationshipEngine.loadClanGraph(clanId);
    const resolved = resolveRelationshipExpression(ast, {
        sourcePersonId: currentMemberId,
        graph,
        peopleById: graph.people,
    });

    if (!resolved.ok) {
        return {
            success: true,
            intent: 'relationship_expression',
            answer: 'Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy người khớp với quan hệ bạn hỏi.',
            confidence: 0.45,
            needsClarification: true,
            relationshipExpression: ast,
            resolution: resolved,
        };
    }

    const people = resolved.candidatePersonIds
        .map((id) => graph.people.get(Number(id)))
        .filter(Boolean);

    if (resolved.needsClarification) {
        return {
            success: true,
            intent: 'relationship_expression',
            answer: `Tôi tìm thấy nhiều người khớp với quan hệ này: ${formatPeopleList(people)}. Vui lòng chọn một người cụ thể để tôi trả lời chính xác hơn.`,
            confidence: Math.min(ast.confidence, 0.72),
            needsClarification: true,
            relationshipExpression: ast,
            resolution: resolved,
            people: people.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
        };
    }

    const target = people[0];
    if (!target) return null;

    const relation = await relationshipEngine.findRelationship(currentMemberId, target.id, { clanId });
    const expressionLabel = ast.terms.join(' của ');

    return {
        success: true,
        intent: 'relationship_expression',
        answer: `Theo dữ liệu gia phả hiện tại, ${expressionLabel} của bạn là ${relationshipEngine.personName(target)}.`,
        confidence: relation.found ? Math.min(relation.confidence, ast.confidence) : ast.confidence,
        relationshipExpression: ast,
        resolution: resolved,
        people: [{ id: target.id, name: relationshipEngine.personName(target) }],
        ...(relation.found ? {
            relationshipPath: relation.relationshipPath,
            pathNodes: relation.pathNodes,
            relationshipKey: relation.relationshipKey,
            relationshipLabel: relation.relationshipLabel,
            explanation: explanationService.explainRelationship(relation),
            evidence: relation.evidence,
            pathVisualizer: explanationService.buildPathVisualizer(relation),
            sourcePerson: { id: relation.sourcePerson.id, name: relation.sourceName },
            targetPerson: { id: relation.targetPerson.id, name: relation.targetName },
        } : {}),
    };
}

async function handlePlannedRelationshipExpression({ clanId, currentMemberId, message, parsed, memory, planner }) {
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const responseIntent = parsed.intent || 'relationship_query';
    const base = parsed?.ast?.base || 'me';
    const structuralKeys = base === 'me' && currentMemberId ? chainKeysFromTerms(parsed.terms) : null;
    if (structuralKeys) {
        const structural = await answerViewerKinshipChain({ clanId, currentMemberId, keys: structuralKeys, intent: responseIntent, planner });
        if (structural) return structural;
    }
    const focusId = toPositiveId(memory?.currentFocusMember?.id || memory?.lastMentionedPersonId);
    const sourcePersonId = base === 'current_focus' ? focusId : currentMemberId;

    if (!sourcePersonId) {
        return {
            success: false,
            code: 'RELATIONSHIP_BASE_NOT_FOUND',
            intent: responseIntent,
            answer: 'Tôi chưa biết bạn đang nhắc tới người nào. Vui lòng nêu tên người đó.',
            confidence: 0,
            planner,
        };
    }

    const ast = {
        type: 'relationship_expression',
        base: 'me',
        chain: parsed.ast.steps,
        terms: parsed.ast.steps,
        needsClarification: false,
        confidence: parsed.confidence ?? 0.65,
    };
    const resolved = resolveRelationshipExpression(ast, {
        sourcePersonId,
        graph,
        peopleById: graph.people,
    });

    if (!resolved.ok) {
        return {
            success: false,
            error: 'RELATIONSHIP_NOT_FOUND',
            intent: responseIntent,
            answer: 'Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy người khớp với quan hệ bạn hỏi.',
            confidence: 0,
            planner,
            relationshipExpression: ast,
            resolution: resolved,
        };
    }

    const people = resolved.candidatePersonIds
        .map((id) => graph.people.get(Number(id)))
        .filter(Boolean);

    if (resolved.needsClarification) {
        return {
            success: true,
            intent: responseIntent,
            answer: `Tôi tìm thấy nhiều người khớp với quan hệ này: ${formatPeopleList(people)}. Vui lòng chọn một người cụ thể.`,
            confidence: Math.min(parsed.confidence || 0.65, 0.7),
            needsClarification: true,
            planner,
            relationshipExpression: ast,
            resolution: resolved,
            people: people.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
        };
    }

    const target = people[0];
    if (!target) return null;

    const relation = await relationshipEngine.findRelationship(sourcePersonId, target.id, { clanId });
    if (!relation.found) {
        return {
            success: false,
            error: 'RELATIONSHIP_NOT_FOUND',
            intent: responseIntent,
            answer: 'Theo dữ liệu gia phả hiện tại, tôi chưa xác minh được đường quan hệ này trong gia phả.',
            confidence: 0,
            planner,
            relationshipExpression: ast,
            resolution: resolved,
        };
    }

    const confidence = confidenceService.scoreRelationship({
        relation,
        path: relation.relationshipPath,
        evidence: relation.evidence,
        candidateCount: relation.candidateCount || resolved.candidatePersonIds.length,
    });
    const aiExplanation = await relationshipExplanationAI.buildExplanation({
        relation,
        path: relation.relationshipPath,
        evidence: relation.evidence,
    });
    // Gợi ý câu hỏi tiếp dựng bằng luật từ quan hệ vừa tìm được, không tốn thêm lần gọi LLM.
    const suggestions = relationshipSuggestionService.ruleBasedSuggestions({ relation });
    const explanation = aiExplanation.explanation || explanationService.explainRelationship(relation);
    const sourceName = relation.sourceName || relationshipEngine.personName(graph.people.get(Number(sourcePersonId))) || 'bạn';

    return {
        success: true,
        intent: responseIntent,
        answer: explanation || `Theo dữ liệu gia phả hiện tại, ${relation.targetName} là ${relation.relationshipLabel} của ${sourceName}.`,
        relation: relation.relationshipLabel,
        confidence,
        source: 'rule_engine',
        planner,
        relationshipExpression: ast,
        resolution: resolved,
        relationshipPath: relation.relationshipPath,
        pathNodes: relation.pathNodes,
        relationshipKey: relation.relationshipKey,
        relationshipLabel: relation.relationshipLabel,
        explanation,
        evidence: relation.evidence,
        pathVisualizer: explanationService.buildPathVisualizer(relation),
        sourcePerson: { id: relation.sourcePerson.id, name: relation.sourceName },
        targetPerson: { id: relation.targetPerson.id, name: relation.targetName },
        people: [{ id: target.id, name: relationshipEngine.personName(target) }],
        suggestions,
        ai: {
            plannerUsed: planner?.source === 'llm_planner' && planner.accepted,
            explanationUsed: Boolean(aiExplanation.aiUsed),
        },
    };
}

async function handleCoreferenceFollowUp({ clanId, currentMemberId, message, memory }) {
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const coreference = resolveCoreference(message, memory, {
        peopleById: graph.people,
        clanId,
        sourcePersonId: currentMemberId,
    });

    if (!coreference.resolved) {
        if (!coreference.needsClarification) return null;
        return {
            success: true,
            intent: 'follow_up_relationship_query',
            answer: 'Tôi chưa biết bạn đang nhắc tới người nào. Bạn hãy nêu tên người đó một lần nữa nhé.',
            confidence: 0.35,
            needsClarification: true,
            coreference,
        };
    }

    if (!Array.isArray(coreference.chain) || !coreference.chain.length) return null;

    const resolved = resolveRelationshipExpression({
        type: 'relationship_expression',
        base: 'me',
        chain: coreference.chain,
        needsClarification: false,
    }, {
        sourcePersonId: coreference.basePersonId,
        graph,
        peopleById: graph.people,
    });

    if (!resolved.ok) {
        return {
            success: true,
            intent: 'follow_up_relationship_query',
            answer: 'Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy người khớp với câu hỏi tiếp theo của bạn.',
            confidence: 0.45,
            needsClarification: true,
            coreference,
            resolution: resolved,
        };
    }

    const people = resolved.candidatePersonIds
        .map((id) => graph.people.get(Number(id)))
        .filter(Boolean);

    if (resolved.needsClarification) {
        return {
            success: true,
            intent: 'follow_up_relationship_query',
            answer: `Tôi tìm thấy nhiều người khớp với câu hỏi này: ${formatPeopleList(people)}. Vui lòng chọn một người cụ thể.`,
            confidence: 0.65,
            needsClarification: true,
            coreference,
            resolution: resolved,
            people: people.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
        };
    }

    const target = people[0];
    if (!target) return null;

    const relation = await relationshipEngine.findRelationship(coreference.basePersonId, target.id, { clanId });
    const basePerson = graph.people.get(Number(coreference.basePersonId));
    const relationshipText = coreference.relationshipTerms.join(' của ');

    return {
        success: true,
        intent: 'follow_up_relationship_query',
        answer: `Theo dữ liệu gia phả hiện tại, ${relationshipText} ${coreference.referencedPersonName || relationshipEngine.personName(basePerson)} là ${relationshipEngine.personName(target)}.`,
        confidence: relation.found ? Math.min(relation.confidence, 0.78) : 0.72,
        coreference,
        resolution: resolved,
        people: [{ id: target.id, name: relationshipEngine.personName(target) }],
        ...(relation.found ? {
            relationshipPath: relation.relationshipPath,
            pathNodes: relation.pathNodes,
            relationshipKey: relation.relationshipKey,
            relationshipLabel: relation.relationshipLabel,
            explanation: explanationService.explainRelationship(relation),
            evidence: relation.evidence,
            pathVisualizer: explanationService.buildPathVisualizer(relation),
            sourcePerson: { id: relation.sourcePerson.id, name: relation.sourceName },
            targetPerson: { id: relation.targetPerson.id, name: relation.targetName },
        } : {}),
    };
}

function memoryPatchFromResponse(responsePayload) {
    if (!responsePayload?.success) return null;

    let person = responsePayload.targetPerson || null;
    if (!person && Array.isArray(responsePayload.people) && responsePayload.people.length === 1) {
        person = responsePayload.people[0];
    }
    if (!person?.id) return null;

    return {
        lastMentionedPersonId: person.id,
        lastMentionedPersonName: person.name || null,
        lastRelationshipLabel: responsePayload.relationshipLabel || null,
        lastRelationshipPath: responsePayload.relationshipPath || null,
        lastPathNodes: responsePayload.pathNodes || null,
        lastEvidence: responsePayload.evidence || null,
        currentFocusMember: person,
        mentionedMembers: [person],
        recentEntities: [person],
        lastRelationQuery: {
            intent: responsePayload.intent,
            relationshipLabel: responsePayload.relationshipLabel || null,
            relationshipPath: responsePayload.relationshipPath || null,
            pathNodes: responsePayload.pathNodes || null,
            evidence: responsePayload.evidence || null,
        },
    };
}

async function applyPermissionFilterToResponse(responsePayload, { clanId, viewer }) {
    if (!responsePayload?.success || (!responsePayload.evidence && !responsePayload.sourcePerson && !responsePayload.targetPerson)) {
        return responsePayload;
    }

    const graph = await relationshipEngine.loadClanGraph(clanId).catch(() => null);
    if (!graph) return responsePayload;

    const sourcePerson = graph.people.get(Number(responsePayload.sourcePerson?.id));
    const targetPerson = graph.people.get(Number(responsePayload.targetPerson?.id));
    if (sourcePerson && targetPerson) {
        const access = canAccessRelationship({ sourcePerson, targetPerson, viewer });
        if (!access.allowed) {
            return {
                ...restrictedAnswer(access.reason),
                intent: responsePayload.intent,
                confidence: 0,
            };
        }
    }

    const filterEvidence = (evidence) => filterEvidenceByPermission({ evidence, viewer, graph });
    const nextPayload = responsePayload.evidence
        ? { ...responsePayload, evidence: filterEvidence(responsePayload.evidence) }
        : responsePayload;

    if (Array.isArray(nextPayload.people)) {
        return {
            ...nextPayload,
            people: nextPayload.people.map((item) => item.evidence
                ? { ...item, evidence: filterEvidence(item.evidence) }
                : item),
        };
    }

    return nextPayload;
}

// Mọi tra cứu trong một yêu cầu dùng đồ thị theo quyền của người hỏi (quan hệ nhạy cảm chỉ quản lý thấy).
const withViewer = (handler) => (req, res) => relationshipEngine.runWithViewer(
    { canSeeSensitive: canSeeSensitiveRelations(req.user) },
    () => handler(req, res)
);

exports.ask = withViewer(async (req, res) => {
    let responsePayload = null;
    const startedAt = Date.now();
    const timings = {};

    try {
        const body = req.body || {};
        const rawMessage = sanitizeMessage(body.message || '');
        // Câu dùng để trả lời; có thể được viết lại (đại từ, câu lược, chọn người khi hỏi lại).
        let message = rawMessage;
        const clanId = toPositiveId(body.clanId || body.clan_id || req.user?.clan_id);
        const currentMemberId = toPositiveId(body.currentMemberId || body.current_member_id || req.user?.person_id);
        const accountId = toPositiveId(req.user?.id || req.user?.account_id);

        if (!message) {
            return res.status(400).json({ success: false, message: 'message là bắt buộc' });
        }
        if (looksLikePromptInjection(message)) {
            return res.status(400).json({
                success: false,
                code: 'CHATBOT_UNSAFE_PROMPT',
                message: 'Câu hỏi có nội dung yêu cầu bỏ qua dữ liệu hoặc hướng dẫn hệ thống nên đã bị từ chối.',
            });
        }
        if (!clanId) {
            return res.status(400).json({ success: false, message: 'clanId là bắt buộc' });
        }
        if (!(await canAccessClan(req, clanId, currentMemberId))) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập dòng họ này' });
        }

        const memorySessionId = buildConversationSessionId({
            sessionId: body.sessionId || body.session_id || body.conversationId || body.conversation_id,
            userId: accountId || currentMemberId,
            clanId,
        });
        const conversationMemory = getConversationMemory(memorySessionId);
        const conversationId = await resolveOwnedConversationId(accountId, body.conversationId || body.conversation_id);
        const chatbotContext = await loadChatbotContext({
            clanId,
            currentMemberId,
            conversationId,
            message,
        });
        if (!res.locals) res.locals = {};
        res.locals.chatbotTurn = { memorySessionId, conversationId, clanId, accountId, currentMemberId, message, forced: null, pending: null };
        let memory = conversationMemory || await restoreMemoryFromHistory(conversationId, memorySessionId).catch(() => null);

        // Đang hỏi lại vì trùng tên: nhận lựa chọn (nút bấm hoặc "1", "người thứ hai", "sinh 1965").
        const pending = memory?.pendingClarification || null;
        const pickedId = pending
            ? (toPositiveId(body.clarificationChoice || body.clarification_choice) || selectCandidate(message, pending.candidates))
            : null;
        const chosen = pickedId && pending.candidates.some((item) => Number(item.id) === Number(pickedId)) ? Number(pickedId) : null;
        if (pending) memory = updateConversationMemory(memorySessionId, { pendingClarification: null });
        if (chosen) {
            message = pending.message || message;
            res.locals.chatbotTurn.forced = { personId: chosen, subject: pending.subject || null };
        } else if (memory) {
            // "Thế còn X?", "Còn con của ông ấy?" rồi "ông ấy/bà ấy" -> tên người vừa nhắc.
            const ellipsis = rewriteEllipsis(message, memory);
            if (ellipsis) message = ellipsis.message;
            if (findPronoun(message)) {
                const pronounGraph = await relationshipEngine.loadClanGraph(clanId).catch(() => null);
                const rewritten = rewritePronoun(message, memory, (id) => pronounGraph?.people.get(Number(id)) || null);
                if (rewritten) message = rewritten.message;
            }
        }
        res.locals.chatbotTurn.message = message;

        if (isCommonChatShortcut(message)) {
            const suggestedQuestions = buildSuggestedQuestions(chatbotContext.userProfile, chatbotContext.clanInfo);
            responsePayload = {
                success: true,
                intent: 'general_chat',
                answer: buildShortcutReply(message, chatbotContext.userProfile, chatbotContext.clanInfo),
                reply: buildShortcutReply(message, chatbotContext.userProfile, chatbotContext.clanInfo),
                suggestedQuestions,
                suggestions: suggestedQuestions.map((text) => ({ type: 'quick_question', text })),
                confidence: 1,
                source: 'rule_shortcut',
                planner: {
                    source: 'rule_shortcut',
                    accepted: true,
                    aiServerSkipped: true,
                },
                ai: {
                    plannerUsed: false,
                    explanationUsed: false,
                },
            };

            await storeChatbotMessage({
                conversationId,
                clanId,
                accountId,
                currentMemberId,
                role: 'user',
                message: rawMessage,
                intent: responsePayload.intent,
                confidence: responsePayload.confidence,
                metadata: { planner: responsePayload.planner },
            });
            await storeChatbotMessage({
                conversationId,
                clanId,
                accountId,
                currentMemberId,
                role: 'assistant',
                message: responsePayload.answer,
                intent: responsePayload.intent,
                confidence: responsePayload.confidence,
                metadata: responsePayload,
            });
            if (conversationId) {
                maybeGenerateConversationTitle(conversationId).catch(() => {});
            }
            if (req.app?.locals?.emitToAccount && accountId) {
                req.app.locals.emitToAccount(accountId, 'chatbot_answered', {
                    clanId,
                    currentMemberId,
                    intent: responsePayload.intent,
                    confidence: responsePayload.confidence,
                });
            }
            return res.json(responsePayload);
        }

        // Quan hệ của một người có tên ("cha của Đinh Viết Lâm", "vợ của X", "mẹ của vợ của X"):
        // trả lời thẳng từ đồ thị gia phả, không cần gọi AI lập kế hoạch.
        const namedRelationshipPayload = await handleNamedRelationshipExpression({ clanId, message, forced: res.locals.chatbotTurn.forced });
        if (namedRelationshipPayload && res.locals.chatbotTurn.forced) res.locals.chatbotTurn.forced = null;
        if (namedRelationshipPayload?.needsClarification && namedRelationshipPayload.candidates?.length) {
            res.locals.chatbotTurn.pending = {
                intent: namedRelationshipPayload.intent,
                subject: namedRelationshipPayload.subject || null,
                message,
                candidates: namedRelationshipPayload.candidates,
            };
            updateConversationMemory(memorySessionId, { pendingClarification: res.locals.chatbotTurn.pending });
        }
        // Yêu cầu tạo sự kiện/lời nhắc ("nhắc tôi giỗ ông nội 15/3 âm lịch"): dựng bản nháp để người dùng bấm lưu.
        const eventDraftPayload = namedRelationshipPayload ? null : buildEventDraftPayload(message);
        const ruleFastPath = namedRelationshipPayload || eventDraftPayload;
        const planning = ruleFastPath ? {
            plan: { intent: ruleFastPath.intent, confidence: ruleFastPath.confidence, entities: {} },
            planner: { source: namedRelationshipPayload ? 'rule_named_relationship' : 'rule_event_command', accepted: true, aiServerSkipped: true },
        } : await queryPlanner.planQuery({
            message,
            memory: memory || conversationMemory,
            userId: accountId || currentMemberId,
            clanId,
            currentMemberId,
            history: chatbotContext.history,
            userProfile: chatbotContext.userProfile,
            clanContext: {
                clan_name: chatbotContext.clanInfo?.clan_name,
                history: chatbotContext.clanInfo?.history,
                hall_address: chatbotContext.clanInfo?.hall_address,
            },
            forceAI: true,
        });
        const parsed = planning.plan;
        const planner = planning.planner;
        timings.planMs = Date.now() - startedAt;
        const explicitTargetPersonId = toPositiveId(body.targetPersonId || body.target_person_id);
        if (explicitTargetPersonId && parsed.entities) {
            parsed.entities.targetPersonId = explicitTargetPersonId;
        }
        await storeChatbotMessage({
            conversationId,
            clanId,
            accountId,
            currentMemberId,
            role: 'user',
            message: rawMessage,
            intent: parsed.intent,
            confidence: parsed.confidence,
            metadata: { entities: parsed.entities, planner, ast: parsed.ast || null },
        });

        if (namedRelationshipPayload) {
            responsePayload = { ...namedRelationshipPayload, planner };
        } else if (eventDraftPayload) {
            responsePayload = { ...eventDraftPayload, planner };
        } else if (parsed.intent === 'find_relationship') {
            responsePayload = await handleFindRelationship({ res, clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'compare_relationship') {
            responsePayload = await handleCompareRelationship({ res, clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'list_children') {
            responsePayload = await handleListChildren({ res, clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'find_spouse') {
            responsePayload = await handleFindSpouse({ res, clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'find_parents') {
            responsePayload = await handleFindParents({ res, clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'find_by_kinship') {
            responsePayload = await handleFindByKinship({ clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'find_generation') {
            responsePayload = await handleFindGeneration({ res, clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'same_generation') {
            responsePayload = await handleSameGeneration({ res, clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'list_ancestors') {
            responsePayload = await handleListAncestors({ res, clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'child_status') {
            responsePayload = await handleChildStatus({ res, clanId, currentMemberId, parsed: withNamedEntities(parsed) });
        } else if (parsed.intent === 'person_anniversary') {
            responsePayload = await handlePersonAnniversary({ res, clanId, currentMemberId, accountId, parsed: withNamedEntities(parsed) });
        } else if (parsed.intent === 'event_lookup') {
            responsePayload = await handleEventLookup({ clanId, accountId, parsed: withKeywordEntity(parsed) });
        } else if (parsed.intent === 'clan_info') {
            responsePayload = await handleClanInfoIntent({ parsed, context: chatbotContext, planner });
        } else if (parsed.intent === 'self_identity') {
            responsePayload = await handleSelfIdentity({ clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'relationship_expression' && parsed.ast?.steps?.length) {
            responsePayload = await handlePlannedRelationshipExpression({
                clanId,
                currentMemberId,
                message,
                parsed,
                memory: memory || conversationMemory,
                planner,
            });
        } else if (parsed.intent === 'relationship_query' && parsed.ast?.steps?.length) {
            responsePayload = await handlePlannedRelationshipExpression({
                clanId,
                currentMemberId,
                message,
                parsed,
                memory: memory || conversationMemory,
                planner,
            });
        } else if (parsed.intent === 'person_info') {
            responsePayload = await handlePersonInfoIntent({ clanId, currentMemberId, message, parsed, context: chatbotContext, planner });
        } else if (parsed.intent === 'person_exists') {
            responsePayload = await handlePersonExistsIntent({ clanId, parsed, planner });
        } else if (parsed.intent === 'clan_history') {
            responsePayload = await handleClanHistoryIntent({ message, parsed, context: chatbotContext, planner });
        } else if (parsed.intent === 'memories_stories') {
            responsePayload = await handleMemoriesIntent({ message, parsed, context: chatbotContext, planner });
        } else if (parsed.intent === 'stats_count' || parsed.intent === 'family_analytics') {
            responsePayload = await handleStatsIntent({ clanId, message, parsed, context: chatbotContext, planner });
        } else if (parsed.intent === 'events_upcoming') {
            responsePayload = await handleEventsIntent({ clanId, accountId, message, parsed, context: chatbotContext, planner });
        } else if (parsed.intent === 'general_chat') {
            responsePayload = await handleGeneralChatIntent({ message, parsed, context: chatbotContext, planner });
        } else {
            responsePayload = await handleCoreferenceFollowUp({ clanId, currentMemberId, message, memory: memory || conversationMemory }) ||
                await handleRelationshipExpression({ clanId, currentMemberId, message }) || {
                success: true,
                intent: 'unknown',
                answer: buildUnknownAnswer(message),
                confidence: parsed.confidence,
                planner,
            };
        }

        if (!responsePayload || res.headersSent) return;
        if (!responsePayload.planner) responsePayload.planner = planner;
        timings.totalMs = Date.now() - startedAt;
        responsePayload.timings = timings;
        // Ghi lại câu trả lời chậm (không ghi nội dung câu hỏi) để theo dõi p95.
        if (timings.totalMs > Number(process.env.CHATBOT_SLOW_MS || 3000)) {
            console.warn('chatbot slow answer', { intent: parsed.intent, planner: planner?.source, ...timings });
        }
        if (!responsePayload.source && responsePayload.relationshipPath) responsePayload.source = 'rule_engine';

        responsePayload = await applyPermissionFilterToResponse(responsePayload, {
            clanId,
            viewer: {
                id: accountId,
                clanId,
                role: req.user?.role_name || req.user?.role,
            },
        });

        const memoryPatch = memoryPatchFromResponse(responsePayload);
        if (memoryPatch) {
            updateConversationMemory(memorySessionId, {
                userId: accountId || currentMemberId,
                clanId,
                ...memoryPatch,
            });
        }
        // Người được hỏi tới (để hiểu "ông ấy", "thế còn X") và người trong câu trả lời.
        const singlePerson = Array.isArray(responsePayload.people) && responsePayload.people.length === 1 ? responsePayload.people[0] : null;
        const subjectPerson = responsePayload.subjectPerson
            || responsePayload.person
            || (responsePayload.sourcePerson && Number(responsePayload.sourcePerson.id) !== Number(currentMemberId) ? responsePayload.sourcePerson : null)
            || responsePayload.targetPerson
            || singlePerson
            || null;
        const subject = subjectPerson?.id ? { id: Number(subjectPerson.id), name: subjectPerson.name || null } : (memory?.lastSubject || null);
        const answerPeople = (responsePayload.people || []).filter((item) => item?.id).slice(0, 10).map((item) => ({ id: Number(item.id), name: item.name || null }));
        const entityNames = Array.isArray(parsed.entities) ? parsed.entities : [].concat(parsed.entities?.targetName || []);
        const focusText = findFocusText(message, [subjectPerson?.name, ...entityNames, parsed.entities?.kinshipTerm]);
        const turnInfo = { question: message, focusText, subject, answerPeople, pending: res.locals.chatbotTurn.pending || null };
        updateConversationMemory(memorySessionId, {
            lastQuestion: message,
            lastFocusText: focusText,
            lastSubject: subject,
            lastAnswerPeople: answerPeople,
        });
        if (subjectPerson?.id && !(Array.isArray(responsePayload.suggestions) && responsePayload.suggestions.length) && !responsePayload.needsClarification) {
            const suggestionGraph = await relationshipEngine.loadClanGraph(clanId).catch(() => null);
            responsePayload.suggestions = followUpSuggestions(subjectPerson, suggestionGraph, message);
        }

        await storeChatbotMessage({
            conversationId,
            clanId,
            accountId,
            currentMemberId,
            role: 'assistant',
            message: responsePayload.answer,
            intent: responsePayload.intent,
            confidence: responsePayload.confidence,
            metadata: { ...responsePayload, turn: turnInfo },
        });

        if (conversationId) {
            // Đặt tiêu đề chạy nền để không làm chậm câu trả lời.
            maybeGenerateConversationTitle(conversationId).catch(() => {});
        }

        if (req.app?.locals?.emitToAccount && accountId) {
            req.app.locals.emitToAccount(accountId, 'chatbot_answered', {
                clanId,
                currentMemberId,
                intent: responsePayload.intent,
                confidence: responsePayload.confidence,
            });
        }

        return res.json(publicRelationPayload(responsePayload));
    } catch (error) {
        console.error('chatbot ask error:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể xử lý câu hỏi chatbot',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

exports.history = async (req, res) => {
    try {
        if (!(await memberSearch.tableExists('chatbot_messages'))) {
            return res.json({ success: true, messages: [], pagination: { limit: 50, offset: 0 } });
        }
        const clanId = toPositiveId(req.query.clanId || req.query.clan_id || req.user?.clan_id);
        const currentMemberId = toPositiveId(req.query.currentMemberId || req.query.current_member_id || req.user?.person_id);
        const accountId = toPositiveId(req.user?.id || req.user?.account_id);
        const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
        const offset = Math.max(Number(req.query.offset || 0), 0);
        if (!clanId || !currentMemberId) return res.status(400).json({ success: false, message: 'clanId và currentMemberId là bắt buộc' });
        if (!(await canAccessClan(req, clanId, currentMemberId))) return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập dòng họ này' });

        const columns = await getTableColumns('chatbot_messages');
        const roleSelect = columns.has('role')
            ? 'role'
            : columns.has('sender')
                ? "CASE WHEN sender = 'bot' THEN 'assistant' ELSE sender END AS role"
                : "'assistant' AS role";
        const confidenceSelect = columns.has('confidence') ? 'confidence' : 'NULL AS confidence';
        const metadataSelect = columns.has('metadata') ? 'metadata' : 'NULL AS metadata';
        const where = [];
        const params = [];
        if (columns.has('clan_id')) {
            where.push('clan_id = ?');
            params.push(clanId);
        }
        // Lịch sử luôn gắn với tài khoản đang đăng nhập; current_member_id do client gửi
        // lên nên không đủ để phân quyền.
        if (columns.has('account_id') && accountId) {
            where.push('account_id = ?');
            params.push(accountId);
        } else {
            return res.json({ success: true, messages: [], pagination: { limit, offset } });
        }
        if (columns.has('current_member_id')) {
            where.push('current_member_id = ?');
            params.push(currentMemberId);
        }
        params.push(limit, offset);

        const [rows] = await db.query(
            `
            SELECT id, ${roleSelect}, message, intent, ${confidenceSelect}, ${metadataSelect}, created_at
            FROM chatbot_messages
            WHERE ${where.join(' AND ')}
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            `,
            params
        );

        return res.json({
            success: true,
            messages: rows.reverse().map((row) => ({
                ...row,
                metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : row.metadata,
            })),
            pagination: { limit, offset },
        });
    } catch (error) {
        console.error('chatbot history error:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải lịch sử chatbot' });
    }
};

exports.suggestions = async (req, res) => {
    try {
        const clanId = toPositiveId(req.query.clanId || req.query.clan_id || req.user?.clan_id);
        const currentMemberId = toPositiveId(req.query.currentMemberId || req.query.current_member_id || req.user?.person_id);
        // Chỉ dùng tên người thật khi người hỏi có quyền với dòng họ; ngược lại trả các câu chung.
        const allowed = clanId && await canAccessClan(req, clanId, currentMemberId);
        const suggestions = await suggestionService.getSuggestions({
            clanId: allowed ? clanId : null,
            currentMemberId: allowed ? currentMemberId : null,
        });
        return res.json({ success: true, suggestions });
    } catch (error) {
        console.error('chatbot suggestions error:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải gợi ý câu hỏi' });
    }
};

exports.getRelationshipById = withViewer(async (req, res) => {
    try {
        const clanId = toPositiveId(req.query.clanId || req.query.clan_id || req.user?.clan_id);
        const currentMemberId = toPositiveId(req.query.currentMemberId || req.query.current_member_id || req.user?.person_id);
        const targetId = toPositiveId(req.params.id);
        if (!clanId || !currentMemberId || !targetId) {
            return res.status(400).json({ success: false, message: 'clanId, currentMemberId và id là bắt buộc' });
        }
        if (!(await canAccessClan(req, clanId, currentMemberId))) return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập dòng họ này' });
        const relation = await relationshipEngine.findRelationship(currentMemberId, targetId, { clanId });
        if (!relation.found) return res.status(404).json({ success: false, message: 'Không tìm thấy đường quan hệ' });
        return res.json({
            success: true,
            relationship: {
                sourcePerson: { id: relation.sourcePerson.id, name: relation.sourceName },
                targetPerson: { id: relation.targetPerson.id, name: relation.targetName },
                relationshipPath: relation.relationshipPath,
                relationshipKey: relation.relationshipKey,
                relationshipLabel: relation.relationshipLabel,
                explanation: explanationService.explainRelationship(relation),
                evidence: relation.evidence,
                pathVisualizer: explanationService.buildPathVisualizer(relation),
                confidence: relation.confidence,
            },
        });
    } catch (error) {
        console.error('chatbot relationship error:', error);
        return res.status(500).json({ success: false, message: 'Không thể tính quan hệ' });
    }
});

exports.getPath = withViewer(async (req, res) => {
    try {
        const clanId = toPositiveId(req.query.clanId || req.query.clan_id || req.user?.clan_id);
        const sourceId = toPositiveId(req.query.sourceId || req.query.source_id || req.user?.person_id);
        const targetId = toPositiveId(req.query.targetId || req.query.target_id);
        if (!clanId || !sourceId || !targetId) return res.status(400).json({ success: false, message: 'clanId, sourceId và targetId là bắt buộc' });
        if (!(await canAccessClan(req, clanId, sourceId))) return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập dòng họ này' });
        const relation = await relationshipEngine.findRelationship(sourceId, targetId, { clanId });
        if (!relation.found) return res.status(404).json({ success: false, message: 'Không tìm thấy đường quan hệ' });
        return res.json({
            success: true,
            path: explanationService.buildPathVisualizer(relation),
            relationship: relation.relationshipLabel,
            evidence: relation.evidence,
        });
    } catch (error) {
        console.error('chatbot path error:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải đường quan hệ' });
    }
});

exports.voice = async (req, res) => {
    const transcript = sanitizeMessage(req.body?.transcript || req.body?.message || '');
    if (!transcript) {
        return res.status(400).json({
            success: false,
            code: 'VOICE_TRANSCRIPT_REQUIRED',
            message: 'Voice API hiện nhận transcript văn bản. Tầng speech-to-text sẽ gọi endpoint này sau khi nhận diện giọng nói.',
        });
    }
    req.body = { ...req.body, message: transcript };
    return exports.ask(req, res);
};
