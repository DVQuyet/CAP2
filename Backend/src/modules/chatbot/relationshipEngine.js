const db = require('../../config/db');
const {
    describeRelationshipPath,
    relationshipKeyFromPath,
    pathMatchesKinship,
    MALE,
    FEMALE,
} = require('./vietnameseKinshipRules');
const { pickBestRelationshipPath, scorePath } = require('./relationshipPathRanker');
const { buildRelationshipEvidence } = require('./relationshipEvidenceService');

const GRAPH_TTL_MS = Number(process.env.CHATBOT_GRAPH_CACHE_TTL_MS || 120000);
const PATH_TTL_MS = Number(process.env.CHATBOT_PATH_CACHE_TTL_MS || 300000);
const MAX_GRAPH_CACHE_SIZE = Number(process.env.CHATBOT_GRAPH_CACHE_MAX_SIZE || 100);
const MAX_PATH_CACHE_SIZE = Number(process.env.CHATBOT_PATH_CACHE_MAX_SIZE || 5000);
const MAX_SIBLING_PAIR_MATERIALIZATION = Number(process.env.CHATBOT_MAX_SIBLING_PAIR_MATERIALIZATION || 300);
const MAX_HALF_SIBLING_PAIR_MATERIALIZATION = Number(process.env.CHATBOT_MAX_HALF_SIBLING_PAIR_MATERIALIZATION || 5000);
const DEFAULT_MAX_DEPTH = Number(process.env.CHATBOT_RELATIONSHIP_MAX_DEPTH || 8);
const DEFAULT_CANDIDATE_LIMIT = Number(process.env.CHATBOT_RELATIONSHIP_CANDIDATE_LIMIT || 8);

const graphCache = new Map();
const pathCache = new Map();
const tableCache = new Map();

function now() {
    return Date.now();
}

function pruneTimedCache(cache, maxSize) {
    const current = now();
    for (const [key, value] of cache.entries()) {
        if (Number(value?.expiresAt || 0) <= current) cache.delete(key);
    }
    if (cache.size <= maxSize) return;
    const overflow = cache.size - maxSize;
    for (const key of [...cache.keys()].slice(0, overflow)) cache.delete(key);
}

function setTimedCache(cache, key, value, maxSize) {
    pruneTimedCache(cache, maxSize);
    cache.set(key, value);
}

function toPositiveId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function personName(person) {
    if (!person) return null;
    const display = String(person.display_name || '').trim();
    if (display) return display;
    const parts = [person.surname, person.middle_name, person.first_name]
        .map((part) => String(part || '').trim())
        .filter(Boolean);
    return parts.join(' ') || `Thành viên #${person.id}`;
}

function dateTime(value) {
    if (!value) return null;
    const time = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

function compareSiblingOrder(a, b) {
    const birthA = dateTime(a.person?.birth_date);
    const birthB = dateTime(b.person?.birth_date);
    if (birthA !== null && birthB !== null && birthA !== birthB) return birthA - birthB;

    const sortA = Number(a.child?.sort_order);
    const sortB = Number(b.child?.sort_order);
    if (Number.isFinite(sortA) && Number.isFinite(sortB) && sortA !== sortB) return sortA - sortB;

    const displayA = Number(a.person?.display_order);
    const displayB = Number(b.person?.display_order);
    if (Number.isFinite(displayA) && Number.isFinite(displayB) && displayA !== displayB) return displayA - displayB;

    return Number(a.person?.id || 0) - Number(b.person?.id || 0);
}

function siblingEdgeLabel(fromPerson, toPerson, orderComparison) {
    const older = orderComparison > 0;
    const gender = Number(toPerson?.gender);
    if (gender === MALE) return older ? 'older_brother' : 'younger_brother';
    if (gender === FEMALE) return older ? 'older_sister' : 'younger_sister';
    return older ? 'older_sibling' : 'younger_sibling';
}

function childEdgeLabel(childPerson) {
    const gender = Number(childPerson?.gender);
    if (gender === MALE) return 'son';
    if (gender === FEMALE) return 'daughter';
    return 'child';
}

function typedChildEdgeLabel(childPerson, childType) {
    const type = String(childType || 'biological').toLowerCase();
    const gender = Number(childPerson?.gender);
    if (type === 'adopted') {
        if (gender === MALE) return 'adopted_son';
        if (gender === FEMALE) return 'adopted_daughter';
        return 'adopted_child';
    }
    if (type === 'step') {
        if (gender === MALE) return 'step_son';
        if (gender === FEMALE) return 'step_daughter';
        return 'step_child';
    }
    return childEdgeLabel(childPerson);
}

function parentEdgeLabel(parentRole, childType) {
    const type = String(childType || 'biological').toLowerCase();
    if (type === 'adopted') return 'adopted_parent';
    if (type === 'step') return parentRole === 'mother' ? 'step_mother' : 'step_father';
    return parentRole;
}

function reverseEdgeType(edgeType, fromPerson, toPerson) {
    if (edgeType === 'father' || edgeType === 'mother' || edgeType === 'adopted_parent') {
        return typedChildEdgeLabel(fromPerson, edgeType === 'adopted_parent' ? 'adopted' : 'biological');
    }
    if (edgeType === 'step_father' || edgeType === 'step_mother') {
        return typedChildEdgeLabel(fromPerson, 'step');
    }
    if (
        edgeType === 'son' ||
        edgeType === 'daughter' ||
        edgeType === 'child' ||
        edgeType === 'adopted_son' ||
        edgeType === 'adopted_daughter' ||
        edgeType === 'adopted_child' ||
        edgeType === 'step_son' ||
        edgeType === 'step_daughter' ||
        edgeType === 'step_child'
    ) {
        if (Number(toPerson?.gender) === MALE) return 'father';
        if (Number(toPerson?.gender) === FEMALE) return 'mother';
        return 'parent';
    }
    if (edgeType === 'older_brother' || edgeType === 'older_sister') {
        if (Number(fromPerson?.gender) === MALE) return 'younger_brother';
        if (Number(fromPerson?.gender) === FEMALE) return 'younger_sister';
        return 'younger_sibling';
    }
    if (edgeType === 'younger_brother' || edgeType === 'younger_sister') {
        if (Number(fromPerson?.gender) === MALE) return 'older_brother';
        if (Number(fromPerson?.gender) === FEMALE) return 'older_sister';
        return 'older_sibling';
    }
    if (edgeType === 'older_sibling') return 'younger_sibling';
    if (edgeType === 'younger_sibling') return 'older_sibling';
    return edgeType;
}

function reversePath(path, graph, sourceId, targetId, edges = []) {
    if (!Array.isArray(path) || !path.length) return [];
    const reversed = [];
    for (let i = path.length - 1; i >= 0; i -= 1) {
        const edge = edges[i];
        const fromPerson = edge ? graph.people.get(Number(edge.from)) : graph.people.get(Number(targetId));
        const toPerson = edge ? graph.people.get(Number(edge.to)) : graph.people.get(Number(sourceId));
        reversed.push(reverseEdgeType(path[i], fromPerson, toPerson));
    }
    return reversed;
}

async function tableExists(tableName) {
    if (tableCache.has(tableName)) return tableCache.get(tableName);
    const [rows] = await db.query(
        `
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
        LIMIT 1
        `,
        [tableName]
    );
    const exists = rows.length > 0;
    tableCache.set(tableName, exists);
    return exists;
}

async function getGraphVersion(clanId) {
    if (!(await tableExists('family_graph_versions'))) return 1;
    const [rows] = await db.query(
        'SELECT graph_version FROM family_graph_versions WHERE clan_id = ? LIMIT 1',
        [clanId]
    );
    return Number(rows[0]?.graph_version || 1);
}

async function bumpGraphVersion(clanId) {
    if (!(await tableExists('family_graph_versions'))) return;
    await db.query(
        `
        INSERT INTO family_graph_versions (clan_id, graph_version)
        VALUES (?, 2)
        ON DUPLICATE KEY UPDATE graph_version = graph_version + 1
        `,
        [clanId]
    );
    clearClanCache(clanId);
}

function addEdge(adjacency, fromId, edge) {
    if (!fromId || !edge?.to) return;
    if (!adjacency.has(fromId)) adjacency.set(fromId, []);
    const list = adjacency.get(fromId);
    const duplicate = list.some((item) => item.to === edge.to && item.type === edge.type);
    if (!duplicate) list.push({ ...edge, from: fromId });
}

async function loadClanGraph(clanId, options = {}) {
    const normalizedClanId = toPositiveId(clanId);
    if (!normalizedClanId) throw new Error('clanId không hợp lệ');

    const cacheKey = String(normalizedClanId);
    const graphVersion = await getGraphVersion(normalizedClanId);
    const cached = graphCache.get(cacheKey);
    if (!options.forceRefresh && cached && cached.expiresAt > now() && Number(cached.graph?.graphVersion || 1) === graphVersion) {
        return cached.graph;
    }
    if (cached && Number(cached.graph?.graphVersion || 1) !== graphVersion) {
        clearClanCache(normalizedClanId);
    }

    const [peopleRows] = await db.query('SELECT * FROM people WHERE clan_id = ?', [normalizedClanId]);
    const [familyRows] = await db.query('SELECT * FROM families WHERE clan_id = ?', [normalizedClanId]);
    const familyIds = familyRows.map((family) => Number(family.id)).filter((id) => Number.isFinite(id));

    let childRows = [];
    if (familyIds.length) {
        const [rows] = await db.query(
            `SELECT * FROM children WHERE family_id IN (${familyIds.map(() => '?').join(',')})`,
            familyIds
        );
        childRows = rows;
    }

    const people = new Map(peopleRows.map((person) => [Number(person.id), person]));
    const families = new Map(familyRows.map((family) => [Number(family.id), family]));
    const childrenByFamily = new Map();
    const parentFamiliesByChild = new Map();

    for (const child of childRows) {
        const familyId = Number(child.family_id);
        const personId = Number(child.person_id);
        if (!childrenByFamily.has(familyId)) childrenByFamily.set(familyId, []);
        childrenByFamily.get(familyId).push(child);
        if (!parentFamiliesByChild.has(personId)) parentFamiliesByChild.set(personId, []);
        parentFamiliesByChild.get(personId).push(familyId);
    }

    const adjacency = new Map();

    for (const family of familyRows) {
        const fatherId = toPositiveId(family.father_id);
        const motherId = toPositiveId(family.mother_id);
        const familyId = Number(family.id);
        const children = (childrenByFamily.get(familyId) || [])
            .map((child) => ({
                child,
                person: people.get(Number(child.person_id)),
            }))
            .filter((item) => item.person);

        if (fatherId && motherId && people.has(fatherId) && people.has(motherId)) {
            addEdge(adjacency, fatherId, { to: motherId, type: 'spouse', familyId });
            addEdge(adjacency, motherId, { to: fatherId, type: 'spouse', familyId });
        }

        for (const item of children) {
            const childId = Number(item.person.id);
            if (fatherId && people.has(fatherId)) {
                addEdge(adjacency, childId, { to: fatherId, type: parentEdgeLabel('father', item.child.child_type), familyId, childType: item.child.child_type || 'biological' });
                addEdge(adjacency, fatherId, { to: childId, type: typedChildEdgeLabel(item.person, item.child.child_type), familyId, childType: item.child.child_type || 'biological' });
            }
            if (motherId && people.has(motherId)) {
                addEdge(adjacency, childId, { to: motherId, type: parentEdgeLabel('mother', item.child.child_type), familyId, childType: item.child.child_type || 'biological' });
                addEdge(adjacency, motherId, { to: childId, type: typedChildEdgeLabel(item.person, item.child.child_type), familyId, childType: item.child.child_type || 'biological' });
            }
        }

        const sortedChildren = [...children].sort(compareSiblingOrder);
        if (sortedChildren.length <= MAX_SIBLING_PAIR_MATERIALIZATION) {
            for (let i = 0; i < sortedChildren.length; i += 1) {
                for (let j = i + 1; j < sortedChildren.length; j += 1) {
                    const older = sortedChildren[i].person;
                    const younger = sortedChildren[j].person;
                    const olderId = Number(older.id);
                    const youngerId = Number(younger.id);
                    addEdge(adjacency, youngerId, {
                        to: olderId,
                        type: siblingEdgeLabel(younger, older, 1),
                        familyId,
                    });
                    addEdge(adjacency, olderId, {
                        to: youngerId,
                        type: siblingEdgeLabel(older, younger, -1),
                        familyId,
                    });
                }
            }
        } else {
            // TODO: Replace pair materialization with lazy sibling expansion for very large families.
        }
    }

    const childParentKeys = new Map();
    for (const [childId, familyIdsForChild] of parentFamiliesByChild.entries()) {
        const family = families.get(Number(familyIdsForChild[0]));
        if (!family) continue;
        childParentKeys.set(Number(childId), {
            fatherId: toPositiveId(family.father_id),
            motherId: toPositiveId(family.mother_id),
        });
    }
    const childIds = [...childParentKeys.keys()];
    if (childIds.length <= MAX_HALF_SIBLING_PAIR_MATERIALIZATION) {
        for (let i = 0; i < childIds.length; i += 1) {
            for (let j = i + 1; j < childIds.length; j += 1) {
                const a = childParentKeys.get(childIds[i]);
                const b = childParentKeys.get(childIds[j]);
                const sameFather = a.fatherId && b.fatherId && a.fatherId === b.fatherId;
                const sameMother = a.motherId && b.motherId && a.motherId === b.motherId;
                if ((sameFather || sameMother) && !(sameFather && sameMother)) {
                    addEdge(adjacency, childIds[i], { to: childIds[j], type: 'half_sibling' });
                    addEdge(adjacency, childIds[j], { to: childIds[i], type: 'half_sibling' });
                }
            }
        }
    } else {
        // TODO: Replace O(n^2) half-sibling materialization with parent-index lazy expansion.
    }

    const graph = {
        clanId: normalizedClanId,
        people,
        families,
        childrenByFamily,
        parentFamiliesByChild,
        adjacency,
        graphVersion,
        loadedAt: new Date(),
    };

    setTimedCache(graphCache, cacheKey, {
        graph,
        expiresAt: now() + GRAPH_TTL_MS,
    }, MAX_GRAPH_CACHE_SIZE);

    return graph;
}

function buildRelationshipResult(graph, sourceId, targetId, path, edges, pathNodes = []) {
    const sourcePerson = graph.people.get(Number(sourceId));
    const targetPerson = graph.people.get(Number(targetId));
    const relationshipLabel = describeRelationshipPath(path, { sourcePerson, targetPerson, edges });
    const normalizedPathNodes = Array.isArray(pathNodes) && pathNodes.length
        ? pathNodes
        : [Number(sourceId), ...(edges || []).map((edge) => Number(edge.to)).filter((id) => Number.isFinite(id))];

    return {
        sourcePerson,
        targetPerson,
        sourceName: personName(sourcePerson),
        targetName: personName(targetPerson),
        relationshipPath: path,
        relationshipKey: relationshipKeyFromPath(path),
        relationshipLabel,
        depth: path.length,
        pathScore: scorePath(path),
        pathNodes: normalizedPathNodes,
        evidence: buildRelationshipEvidence({
            sourcePerson,
            targetPerson,
            relationshipPath: path,
            pathNodes: normalizedPathNodes,
            peopleById: graph.people,
            edges,
            relationshipLabel,
        }),
        confidence: path.length <= 3 ? 0.94 : Math.max(0.62, 0.9 - path.length * 0.04),
        edges,
    };
}

async function findRelationship(sourcePersonId, targetPersonId, options = {}) {
    const clanId = toPositiveId(options.clanId);
    const sourceId = toPositiveId(sourcePersonId);
    const targetId = toPositiveId(targetPersonId);
    const maxDepth = Number(options.maxDepth || DEFAULT_MAX_DEPTH);
    const candidateLimit = Math.max(1, Number(options.candidateLimit || DEFAULT_CANDIDATE_LIMIT));

    if (!clanId || !sourceId || !targetId) {
        return { found: false, reason: 'INVALID_INPUT' };
    }

    const graph = await loadClanGraph(clanId, options);
    const cacheKey = `${clanId}:${graph.graphVersion}:${sourceId}:${targetId}:${maxDepth}:${candidateLimit}`;
    const cachedPath = pathCache.get(cacheKey);
    if (cachedPath && cachedPath.expiresAt > now()) return cachedPath.result;
    if (cachedPath) pathCache.delete(cacheKey);

    if (!graph.people.has(sourceId) || !graph.people.has(targetId)) {
        return { found: false, reason: 'PERSON_NOT_IN_CLAN' };
    }

    if (sourceId === targetId) {
        const result = {
            found: true,
            ...buildRelationshipResult(graph, sourceId, targetId, [], [], [sourceId]),
        };
        setTimedCache(pathCache, cacheKey, { result, expiresAt: now() + PATH_TTL_MS }, MAX_PATH_CACHE_SIZE);
        return result;
    }

    const forward = new Map([[sourceId, { id: sourceId, path: [], edges: [], nodes: [sourceId] }]]);
    const backward = new Map([[targetId, { id: targetId, path: [], edges: [], nodes: [targetId] }]]);
    let forwardFrontier = [sourceId];
    let backwardFrontier = [targetId];
    const candidates = [];

    const expand = (frontier, ownVisited, otherVisited, direction) => {
        const nextFrontier = [];
        const met = [];
        for (const currentId of frontier) {
            const state = ownVisited.get(currentId);
            if (!state || state.path.length >= maxDepth) continue;
            for (const edge of graph.adjacency.get(currentId) || []) {
                if (ownVisited.has(edge.to)) continue;
                const nextState = {
                    id: edge.to,
                    path: [...state.path, edge.type],
                    edges: [...state.edges, edge],
                    nodes: [...state.nodes, edge.to],
                };
                ownVisited.set(edge.to, nextState);
                if (otherVisited.has(edge.to)) {
                    met.push({ metAt: edge.to, direction, state: nextState, other: otherVisited.get(edge.to) });
                    if (met.length >= candidateLimit) return { nextFrontier, met };
                }
                nextFrontier.push(edge.to);
            }
        }
        return { nextFrontier, met };
    };

    const buildCandidate = (metAt) => {
        const fromSource = forward.get(metAt);
        const fromTarget = backward.get(metAt);
        if (!fromSource || !fromTarget) return null;
        const reversedBackwardPath = reversePath(fromTarget.path, graph, sourceId, targetId, fromTarget.edges);
        return {
            path: [...fromSource.path, ...reversedBackwardPath],
            edges: [...fromSource.edges, ...[...fromTarget.edges].reverse()],
            pathNodes: [...fromSource.nodes, ...[...fromTarget.nodes].reverse().slice(1)],
        };
    };

    for (let depth = 0; depth < maxDepth && (forwardFrontier.length || backwardFrontier.length); depth += 1) {
        const expandForward = forwardFrontier.length <= backwardFrontier.length;
        const result = expandForward
            ? expand(forwardFrontier, forward, backward, 'forward')
            : expand(backwardFrontier, backward, forward, 'backward');

        for (const match of result.met || []) {
            const candidate = buildCandidate(match.metAt);
            if (candidate) candidates.push(candidate);
            if (candidates.length >= candidateLimit) break;
        }

        if (candidates.length >= candidateLimit || (candidates.length && depth >= maxDepth - 1)) {
            const bestCandidate = pickBestRelationshipPath(candidates);
            const built = buildRelationshipResult(graph, sourceId, targetId, bestCandidate.path, bestCandidate.edges, bestCandidate.pathNodes);
            const finalResult = {
                found: true,
                ...built,
                candidateCount: candidates.length,
            };
            setTimedCache(pathCache, cacheKey, { result: finalResult, expiresAt: now() + PATH_TTL_MS }, MAX_PATH_CACHE_SIZE);
            await persistRelationshipCache(finalResult, graph).catch(() => {});
            return finalResult;
        }

        if (expandForward) forwardFrontier = result.nextFrontier || [];
        else backwardFrontier = result.nextFrontier || [];
    }

    if (candidates.length) {
        const bestCandidate = pickBestRelationshipPath(candidates);
        const built = buildRelationshipResult(graph, sourceId, targetId, bestCandidate.path, bestCandidate.edges, bestCandidate.pathNodes);
        const finalResult = {
            found: true,
            ...built,
            candidateCount: candidates.length,
        };
        setTimedCache(pathCache, cacheKey, { result: finalResult, expiresAt: now() + PATH_TTL_MS }, MAX_PATH_CACHE_SIZE);
        await persistRelationshipCache(finalResult, graph).catch(() => {});
        return finalResult;
    }

    const result = {
        found: false,
        reason: 'NO_PATH',
        sourcePerson: graph.people.get(sourceId),
        targetPerson: graph.people.get(targetId),
        sourceName: personName(graph.people.get(sourceId)),
        targetName: personName(graph.people.get(targetId)),
    };
    setTimedCache(pathCache, cacheKey, { result, expiresAt: now() + PATH_TTL_MS }, MAX_PATH_CACHE_SIZE);
    return result;
}

async function persistRelationshipCache(result, graph) {
    if (!result?.found || !(await tableExists('relationship_cache'))) return;
    await db.query(
        `
        INSERT INTO relationship_cache
          (clan_id, source_person_id, target_person_id, relationship_key, relationship_label,
           relationship_path, path_depth, confidence, graph_version, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))
        ON DUPLICATE KEY UPDATE
          relationship_key = VALUES(relationship_key),
          relationship_label = VALUES(relationship_label),
          relationship_path = VALUES(relationship_path),
          path_depth = VALUES(path_depth),
          confidence = VALUES(confidence),
          expires_at = VALUES(expires_at),
          updated_at = CURRENT_TIMESTAMP
        `,
        [
            graph.clanId,
            result.sourcePerson.id,
            result.targetPerson.id,
            result.relationshipKey,
            result.relationshipLabel,
            JSON.stringify(result.relationshipPath || []),
            result.depth,
            result.confidence,
            graph.graphVersion || 1,
        ]
    );
}

async function findPeopleByKinship(sourcePersonId, kinshipTerm, options = {}) {
    const clanId = toPositiveId(options.clanId);
    const sourceId = toPositiveId(sourcePersonId);
    const maxDepth = Number(options.maxDepth || DEFAULT_MAX_DEPTH);
    const graph = await loadClanGraph(clanId, options);

    if (!graph.people.has(sourceId)) return [];

    const results = [];
    const queue = [{ id: sourceId, path: [], edges: [] }];
    const visited = new Set([sourceId]);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        if (current.path.length >= maxDepth) continue;

        for (const edge of graph.adjacency.get(current.id) || []) {
            if (visited.has(edge.to)) continue;
            const nextPath = [...current.path, edge.type];
            const nextEdges = [...current.edges, edge];
            const targetPerson = graph.people.get(edge.to);
            if (pathMatchesKinship(nextPath, kinshipTerm, { sourcePerson: graph.people.get(sourceId), targetPerson })) {
                results.push(buildRelationshipResult(graph, sourceId, edge.to, nextPath, nextEdges));
            }
            visited.add(edge.to);
            queue.push({ id: edge.to, path: nextPath, edges: nextEdges });
        }
    }

    return results.sort((a, b) => a.depth - b.depth || String(a.targetName).localeCompare(String(b.targetName), 'vi'));
}

async function getChildrenOf(personId, options = {}) {
    const graph = await loadClanGraph(options.clanId, options);
    const id = toPositiveId(personId);
    const children = [];
    const seen = new Set();

    for (const edge of graph.adjacency.get(id) || []) {
        if (edge.type !== 'son' && edge.type !== 'daughter' && edge.type !== 'child') continue;
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        const person = graph.people.get(edge.to);
        if (person) children.push(person);
    }

    return children.sort((a, b) => {
        const birthDiff = (dateTime(a.birth_date) || 0) - (dateTime(b.birth_date) || 0);
        if (birthDiff) return birthDiff;
        return Number(a.display_order || a.id) - Number(b.display_order || b.id);
    });
}

async function getSpousesOf(personId, options = {}) {
    const graph = await loadClanGraph(options.clanId, options);
    const id = toPositiveId(personId);
    return (graph.adjacency.get(id) || [])
        .filter((edge) => edge.type === 'spouse')
        .map((edge) => graph.people.get(edge.to))
        .filter(Boolean);
}

async function getParentsOf(personId, options = {}) {
    const graph = await loadClanGraph(options.clanId, options);
    const id = toPositiveId(personId);
    const parents = { father: null, mother: null };
    for (const edge of graph.adjacency.get(id) || []) {
        if (edge.type === 'father') parents.father = graph.people.get(edge.to) || null;
        if (edge.type === 'mother') parents.mother = graph.people.get(edge.to) || null;
    }
    return parents;
}

async function getParentWithSpouseFallback(personId, parentType, options = {}) {
    const parents = await getParentsOf(personId, options);
    if (parentType === 'father' || parentType === 'both') {
        if (parents.father || parentType === 'father') return { parents, inferred: false };
    }
    if (parentType === 'mother' || parentType === 'both') {
        if (parents.mother || parentType === 'mother') {
            if (parents.mother) return { parents, inferred: false };
        }
    }

    if (parentType === 'mother' && !parents.mother && parents.father) {
        const spouses = await getSpousesOf(parents.father.id, options);
        const motherCandidate = spouses.find((person) => Number(person.gender) === FEMALE) || spouses[0] || null;
        if (motherCandidate) {
            return {
                parents: { ...parents, mother: motherCandidate },
                inferred: true,
                inferredFrom: 'father_spouse',
            };
        }
    }

    if (parentType === 'father' && !parents.father && parents.mother) {
        const spouses = await getSpousesOf(parents.mother.id, options);
        const fatherCandidate = spouses.find((person) => Number(person.gender) === MALE) || spouses[0] || null;
        if (fatherCandidate) {
            return {
                parents: { ...parents, father: fatherCandidate },
                inferred: true,
                inferredFrom: 'mother_spouse',
            };
        }
    }

    return { parents, inferred: false };
}

async function getPerson(personId, options = {}) {
    const graph = await loadClanGraph(options.clanId, options);
    return graph.people.get(Number(personId)) || null;
}

function clearClanCache(clanId) {
    const normalizedClanId = toPositiveId(clanId);
    if (!normalizedClanId) return;
    graphCache.delete(String(normalizedClanId));
    for (const key of [...pathCache.keys()]) {
        if (key.startsWith(`${normalizedClanId}:`)) pathCache.delete(key);
    }
}

module.exports = {
    findRelationship,
    findPeopleByKinship,
    getChildrenOf,
    getSpousesOf,
    getParentsOf,
    getParentWithSpouseFallback,
    getPerson,
    loadClanGraph,
    clearClanCache,
    bumpGraphVersion,
    personName,
};
