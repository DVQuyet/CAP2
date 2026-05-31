function personName(person) {
    if (!person) return null;
    const display = String(person.display_name || person.name || '').trim();
    if (display) return display;
    const parts = [person.surname, person.middle_name, person.first_name]
        .map((part) => String(part || '').trim())
        .filter(Boolean);
    return parts.join(' ') || `Thanh vien #${person.id}`;
}

function birthYear(person) {
    const raw = person?.birth_date || person?.birthDate || null;
    if (!raw) return null;
    const match = String(raw).match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    return match ? Number(match[1]) : null;
}

function normalizeCandidates(candidates = []) {
    return candidates.map((person, index) => ({
        index: index + 1,
        id: person.id,
        name: personName(person),
        birthYear: birthYear(person),
        birth_date: person.birth_date || null,
        generation: person.generation || person.generation_level || null,
        raw: person,
    }));
}

function buildClarificationResponse({ candidates = [], reason = 'ambiguous', context = {} } = {}) {
    const normalizedCandidates = normalizeCandidates(candidates);
    const subject = context.subject || context.name || 'người này';
    const lines = normalizedCandidates.map((candidate) => {
        const meta = [
            candidate.birthYear ? String(candidate.birthYear) : null,
            candidate.generation ? `đời ${candidate.generation}` : null,
        ].filter(Boolean);
        return `${candidate.index}. ${candidate.name}${meta.length ? ` (${meta.join(', ')})` : ''}`;
    });

    return {
        success: false,
        code: 'NEEDS_CLARIFICATION',
        needsClarification: true,
        reason,
        context,
        answer: normalizedCandidates.length
            ? `Tôi tìm thấy ${normalizedCandidates.length} người khớp với "${subject}":\n\n${lines.join('\n')}\n\nBạn muốn hỏi người nào?`
            : 'Tôi cần thêm thông tin để xác định đúng người bạn đang hỏi.',
        candidates: normalizedCandidates.map(({ raw, ...candidate }) => candidate),
        pendingClarification: {
            reason,
            context,
            candidates: normalizedCandidates.map(({ raw, ...candidate }) => candidate),
            createdAt: new Date().toISOString(),
        },
    };
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[?!.:,;()[\]{}"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function resolveClarificationSelection({ message, pendingClarification, graph } = {}) {
    const candidates = pendingClarification?.candidates || [];
    if (!candidates.length) {
        return {
            resolved: false,
            needsClarification: true,
            reason: 'missing_pending_clarification',
        };
    }

    const normalized = normalizeText(message);
    const numeric = normalized.match(/(?:^|\s)(\d+)(?:\s|$)/);
    if (numeric) {
        const index = Number(numeric[1]);
        const candidate = candidates.find((item) => Number(item.index) === index);
        if (candidate) return { resolved: true, candidate, personId: candidate.id, reason: 'selected_by_index' };
    }

    const year = normalized.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    if (year) {
        const matches = candidates.filter((item) => Number(item.birthYear) === Number(year[1]));
        if (matches.length === 1) return { resolved: true, candidate: matches[0], personId: matches[0].id, reason: 'selected_by_birth_year' };
        if (matches.length > 1) return { resolved: false, needsClarification: true, reason: 'ambiguous_birth_year', candidates: matches };
    }

    const nameMatches = candidates.filter((item) => normalizeText(item.name).includes(normalized) || normalized.includes(normalizeText(item.name)));
    if (nameMatches.length === 1) return { resolved: true, candidate: nameMatches[0], personId: nameMatches[0].id, reason: 'selected_by_name' };
    if (nameMatches.length > 1) return { resolved: false, needsClarification: true, reason: 'ambiguous_name', candidates: nameMatches };

    if (graph?.people && typeof graph.people.get === 'function') {
        const graphMatches = candidates.filter((item) => {
            const person = graph.people.get(Number(item.id));
            return person && normalizeText(personName(person)).includes(normalized);
        });
        if (graphMatches.length === 1) return { resolved: true, candidate: graphMatches[0], personId: graphMatches[0].id, reason: 'selected_by_graph_name' };
    }

    return {
        resolved: false,
        needsClarification: true,
        reason: 'invalid_selection',
        candidates,
    };
}

module.exports = {
    buildClarificationResponse,
    resolveClarificationSelection,
};
