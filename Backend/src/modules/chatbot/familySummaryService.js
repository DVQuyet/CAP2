function personName(person) {
    if (!person) return null;
    const display = String(person.display_name || '').trim();
    if (display) return display;
    return [person.surname, person.middle_name, person.first_name]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ') || `Thanh vien #${person.id}`;
}

function peopleList(graph = {}) {
    if (graph.people instanceof Map) return [...graph.people.values()];
    if (Array.isArray(graph.people)) return graph.people;
    return [];
}

function adjacencyEntries(graph = {}) {
    if (!(graph.adjacency instanceof Map)) return [];
    return [...graph.adjacency.entries()];
}

function buildUndirectedComponents(graph = {}) {
    const people = peopleList(graph);
    const adjacency = new Map();
    for (const person of people) adjacency.set(Number(person.id), new Set());
    for (const [fromId, edges] of adjacencyEntries(graph)) {
        if (!adjacency.has(Number(fromId))) adjacency.set(Number(fromId), new Set());
        for (const edge of edges || []) {
            adjacency.get(Number(fromId)).add(Number(edge.to));
            if (!adjacency.has(Number(edge.to))) adjacency.set(Number(edge.to), new Set());
            adjacency.get(Number(edge.to)).add(Number(fromId));
        }
    }

    const seen = new Set();
    const components = [];
    for (const person of people) {
        const startId = Number(person.id);
        if (seen.has(startId)) continue;
        const queue = [startId];
        const ids = [];
        seen.add(startId);
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
            const current = queue[cursor];
            ids.push(current);
            for (const next of adjacency.get(current) || []) {
                if (seen.has(next)) continue;
                seen.add(next);
                queue.push(next);
            }
        }
        components.push(ids);
    }
    return components;
}

function parentIncomingCounts(graph = {}) {
    const counts = new Map();
    for (const person of peopleList(graph)) counts.set(Number(person.id), 0);
    for (const [, edges] of adjacencyEntries(graph)) {
        for (const edge of edges || []) {
            if (edge.type === 'father' || edge.type === 'mother' || edge.type === 'parent' || edge.type === 'adopted_parent') {
                counts.set(Number(edge.from), counts.get(Number(edge.from)) || 0);
            }
            if (edge.type === 'son' || edge.type === 'daughter' || edge.type === 'child' || edge.type === 'adopted_child') {
                counts.set(Number(edge.to), counts.get(Number(edge.to)) || 0);
            }
        }
    }
    return counts;
}

function computeFamilyStats(graph = {}) {
    const people = peopleList(graph);
    const generations = new Set(people.map((person) => person.generation || person.generation_level).filter(Boolean));
    const missingBirthDates = people.filter((person) => !person.birth_date).length;
    const missingDeathDates = people.filter((person) => !person.death_date).length;
    const components = buildUndirectedComponents(graph);
    const largestComponent = components.slice().sort((a, b) => b.length - a.length)[0] || [];
    const largestBranchRoot = largestComponent.length
        ? people.find((person) => Number(person.id) === Number(largestComponent[0]))
        : null;
    const connectedIds = new Set(adjacencyEntries(graph).flatMap(([fromId, edges]) => [Number(fromId), ...(edges || []).map((edge) => Number(edge.to))]));
    const orphanNodes = people.filter((person) => !connectedIds.has(Number(person.id))).length;
    const datedPeople = people
        .filter((person) => person.birth_date)
        .sort((a, b) => String(a.birth_date).localeCompare(String(b.birth_date)));

    return {
        totalMembers: people.length,
        generations: generations.size,
        missingBirthDates,
        missingDeathDates,
        orphanNodes,
        disconnectedBranches: components.length,
        largestBranch: {
            size: largestComponent.length,
            rootPersonId: largestBranchRoot?.id || null,
            rootName: personName(largestBranchRoot),
        },
        oldestAncestor: datedPeople.length ? {
            id: datedPeople[0].id,
            name: personName(datedPeople[0]),
            birthDate: datedPeople[0].birth_date,
        } : null,
    };
}

function generateFamilySummary({ clanId, graph, stats } = {}) {
    const computedStats = stats || computeFamilyStats(graph);
    const lines = [
        `Gia đình có ${computedStats.generations || 0} đời, ${computedStats.totalMembers || 0} thành viên.`,
        `Có ${computedStats.missingBirthDates || 0} người thiếu ngày sinh và ${computedStats.missingDeathDates || 0} người thiếu ngày mất.`,
        `Hiện có ${computedStats.disconnectedBranches || 0} nhánh rời và ${computedStats.orphanNodes || 0} thành viên chưa nối quan hệ.`,
    ];
    if (computedStats.largestBranch?.size) {
        lines.push(`Nhánh lớn nhất có ${computedStats.largestBranch.size} thành viên${computedStats.largestBranch.rootName ? `, bắt đầu từ ${computedStats.largestBranch.rootName}` : ''}.`);
    }
    if (computedStats.oldestAncestor?.name) {
        lines.push(`Người có năm sinh sớm nhất trong dữ liệu là ${computedStats.oldestAncestor.name}${computedStats.oldestAncestor.birthDate ? ` (${computedStats.oldestAncestor.birthDate})` : ''}.`);
    }

    return {
        clanId: clanId || graph?.clanId || null,
        stats: computedStats,
        summary: lines.join(' '),
    };
}

module.exports = {
    computeFamilyStats,
    generateFamilySummary,
};
