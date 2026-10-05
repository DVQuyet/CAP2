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
const { resolveRelationshipExpression } = require('./relationshipExpressionResolver');
const { toPositiveId, queryOptional } = require('./chatbotUtils');
const {
    needsCurrentPersonAnswer,
    handlePersonInfoIntent,
    handlePersonExistsIntent,
    handleClanHistoryIntent,
    handleMemoriesIntent,
    handleStatsIntent,
    handleEventsIntent,
    handleGeneralChatIntent,
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
        displayName ? `Trong gia phả có ${displayName} không?` : 'Trong gia phả có [Tên người] không?',
    ];
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

function ambiguityResponse(res, intent, candidates) {
    const clarification = buildClarificationResponse({
        candidates,
        reason: 'ambiguous_person',
        context: { intent },
    });
    return res.status(409).json({
        success: false,
        code: 'AMBIGUOUS_PERSON',
        intent,
        answer: clarification.answer,
        needsClarification: true,
        reason: clarification.reason,
        candidates: clarification.candidates.map((candidate) => ({
            ...candidate,
            confidence: Number(candidates.find((person) => Number(person.id) === Number(candidate.id))?.score || 0),
        })),
        pendingClarification: clarification.pendingClarification,
    });
}

function notFoundResponse(res, intent, name) {
    return res.status(404).json({
        success: false,
        code: 'PERSON_NOT_FOUND',
        intent,
        answer: `Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy thành viên khớp với "${Array.isArray(name) ? name[0] : name}".`,
        confidence: 0,
    });
}

async function resolveNamedPerson(res, clanId, intent, names, currentMemberId = null) {
    const kinship = await resolveKinshipReference({ clanId, currentMemberId, names });
    if (kinship?.status === 'resolved') return kinship.person;
    if (kinship?.status === 'ambiguous') {
        ambiguityResponse(res, intent, kinship.candidates);
        return null;
    }
    if (kinship?.status === 'not_found') {
        res.status(404).json({
            success: false,
            code: 'PERSON_NOT_FOUND',
            intent,
            answer: `Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy ${kinship.label} của bạn.`,
            confidence: 0,
        });
        return null;
    }

    const result = await memberSearch.resolvePerson({ clanId, names });
    if (result.status === 'not_found') {
        notFoundResponse(res, intent, names);
        return null;
    }
    if (result.status === 'ambiguous') {
        ambiguityResponse(res, intent, result.candidates);
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
    const personA = await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.personAName, currentMemberId);
    if (!personA) return null;
    const personB = await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.personBName, currentMemberId);
    if (!personB) return null;

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
        answer: explanationService.explainRelationship(relation) || `Theo dữ liệu gia phả hiện tại, ${relation.targetName} là ${relation.relationshipLabel} của ${relation.sourceName}.`,
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

async function handleListChildren({ res, clanId, currentMemberId, parsed }) {
    const target = await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.targetName, currentMemberId);
    if (!target) return null;
    const children = await relationshipEngine.getChildrenOf(target.id, { clanId });
    const targetName = relationshipEngine.personName(target);

    return {
        success: true,
        intent: parsed.intent,
        answer: children.length
            ? `Theo dữ liệu gia phả hiện tại, con của ${targetName} là: ${formatPeopleList(children)}.`
            : `Theo dữ liệu gia phả hiện tại, tôi chưa thấy dữ liệu con của ${targetName}.`,
        confidence: parsed.confidence,
        people: children.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
    };
}

async function handleFindSpouse({ res, clanId, currentMemberId, parsed }) {
    const target = await resolveNamedPerson(res, clanId, parsed.intent, parsed.entities.targetName, currentMemberId);
    if (!target) return null;
    const spouses = await relationshipEngine.getSpousesOf(target.id, { clanId });
    const targetName = relationshipEngine.personName(target);

    return {
        success: true,
        intent: parsed.intent,
        answer: spouses.length
            ? `Theo dữ liệu gia phả hiện tại, vợ/chồng của ${targetName} là: ${formatPeopleList(spouses)}.`
            : `Theo dữ liệu gia phả hiện tại, tôi chưa thấy dữ liệu vợ/chồng của ${targetName}.`,
        confidence: parsed.confidence,
        people: spouses.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
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
    const people = await relationshipEngine.findPeopleByKinship(currentMemberId, parsed.entities.kinshipTerm, { clanId });
    return {
        success: true,
        intent: parsed.intent,
        answer: people.length
            ? `Theo dữ liệu gia phả hiện tại, ${parsed.entities.kinshipTerm} của bạn là: ${people.map((item) => item.targetName).join(', ')}.`
            : `Theo dữ liệu gia phả hiện tại, tôi chưa tìm thấy ${parsed.entities.kinshipTerm} của bạn.`,
        confidence: people.length ? parsed.confidence : 0.45,
        people: people.map((item) => ({
            id: item.targetPerson.id,
            name: item.targetName,
            relationshipPath: item.relationshipPath,
            pathNodes: item.pathNodes,
            relationshipLabel: item.relationshipLabel,
            evidence: item.evidence,
            pathVisualizer: explanationService.buildPathVisualizer(item),
        })),
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

// "<quan hệ> của <tên người>": tìm người theo tên rồi đi theo chuỗi quan hệ từ người đó.
// Trả null để luồng cũ xử lý khi câu không có dạng này hoặc không tìm thấy tên.
async function handleNamedRelationshipExpression({ clanId, message }) {
    const ast = parseNamedRelationshipExpression(message);
    if (!ast) return null;
    const search = await memberSearch.resolvePerson({ clanId, names: [ast.personName] });
    if (search.status === 'not_found') return null;
    const label = String(ast.originalTerms || ast.terms.join(' của ')).toLocaleLowerCase('vi-VN');
    if (search.status === 'ambiguous') {
        return {
            success: true,
            intent: 'relationship_expression',
            answer: `Có nhiều người tên "${ast.personName}" trong gia phả: ${formatPeopleList(search.candidates)}. Bạn muốn hỏi ${label} của người nào?`,
            confidence: 0.5,
            needsClarification: true,
            people: search.candidates.map((person) => ({ id: person.id, name: relationshipEngine.personName(person) })),
        };
    }
    const base = search.person;
    const graph = await relationshipEngine.loadClanGraph(clanId);
    const resolved = resolveRelationshipExpression({ ...ast, base: 'me' }, { sourcePersonId: base.id, graph });
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

exports.ask = async (req, res) => {
    let responsePayload = null;

    try {
        const body = req.body || {};
        const message = sanitizeMessage(body.message || '');
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

        if (isCommonChatShortcut(message)) {
            const suggestedQuestions = buildSuggestedQuestions(chatbotContext.userProfile, chatbotContext.clanInfo);
            responsePayload = {
                success: true,
                intent: 'general_chat',
                answer: buildGreetingReply(chatbotContext.userProfile, chatbotContext.clanInfo),
                reply: buildGreetingReply(chatbotContext.userProfile, chatbotContext.clanInfo),
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
                message,
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
        const namedRelationshipPayload = await handleNamedRelationshipExpression({ clanId, message });
        const planning = namedRelationshipPayload ? {
            plan: { intent: 'relationship_expression', confidence: namedRelationshipPayload.confidence, entities: {} },
            planner: { source: 'rule_named_relationship', accepted: true, aiServerSkipped: true },
        } : await queryPlanner.planQuery({
            message,
            memory: conversationMemory,
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
            message,
            intent: parsed.intent,
            confidence: parsed.confidence,
            metadata: { entities: parsed.entities, planner, ast: parsed.ast || null },
        });

        if (namedRelationshipPayload) {
            responsePayload = { ...namedRelationshipPayload, planner };
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
        } else if (parsed.intent === 'self_identity') {
            responsePayload = await handleSelfIdentity({ clanId, currentMemberId, parsed });
        } else if (parsed.intent === 'relationship_expression' && parsed.ast?.steps?.length) {
            responsePayload = await handlePlannedRelationshipExpression({
                clanId,
                currentMemberId,
                message,
                parsed,
                memory: conversationMemory,
                planner,
            });
        } else if (parsed.intent === 'relationship_query' && parsed.ast?.steps?.length) {
            responsePayload = await handlePlannedRelationshipExpression({
                clanId,
                currentMemberId,
                message,
                parsed,
                memory: conversationMemory,
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
            responsePayload = await handleEventsIntent({ clanId, message, parsed, context: chatbotContext, planner });
        } else if (parsed.intent === 'general_chat') {
            responsePayload = await handleGeneralChatIntent({ message, parsed, context: chatbotContext, planner });
        } else {
            responsePayload = await handleCoreferenceFollowUp({ clanId, currentMemberId, message, memory: conversationMemory }) ||
                await handleRelationshipExpression({ clanId, currentMemberId, message }) || {
                success: true,
                intent: 'unknown',
                answer: 'Tôi chưa hiểu rõ câu hỏi. Bạn có thể hỏi theo dạng: "Nguyễn Văn A là gì của tôi?", "Con của bác Hai là ai?", hoặc "Ai là ông nội của tôi?".',
                confidence: parsed.confidence,
                planner,
            };
        }

        if (!responsePayload || res.headersSent) return;
        if (!responsePayload.planner) responsePayload.planner = planner;
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
};

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
        const suggestions = await suggestionService.getSuggestions(req);
        return res.json({ success: true, suggestions });
    } catch (error) {
        console.error('chatbot suggestions error:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải gợi ý câu hỏi' });
    }
};

exports.getRelationshipById = async (req, res) => {
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
};

exports.getPath = async (req, res) => {
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
};

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
