function viewerIsAdmin(viewer = {}) {
    return viewer.role === 'admin' || viewer.role_name === 'admin' || viewer.isAdmin === true;
}

function sameClan(person, viewer) {
    if (!person?.clan_id || !viewer?.clanId) return true;
    return Number(person.clan_id) === Number(viewer.clanId);
}

function personIsHidden(person = {}) {
    return person.is_hidden === true ||
        person.hidden === true ||
        person.visibility === 'hidden' ||
        person.privacy_level === 'private' ||
        person.privacy === 'private';
}

function canViewPerson(person, viewer = {}) {
    if (!person) return false;
    if (viewerIsAdmin(viewer)) return sameClan(person, viewer);
    if (!sameClan(person, viewer)) return false;
    if (personIsHidden(person)) return false;
    return true;
}

function canAccessRelationship({ sourcePerson, targetPerson, viewer } = {}) {
    if (viewerIsAdmin(viewer)) {
        return {
            allowed: sameClan(sourcePerson, viewer) && sameClan(targetPerson, viewer),
            reason: sameClan(sourcePerson, viewer) && sameClan(targetPerson, viewer) ? null : 'cross_clan_access_denied',
        };
    }

    if (!sameClan(sourcePerson, viewer) || !sameClan(targetPerson, viewer)) {
        return { allowed: false, reason: 'cross_clan_access_denied' };
    }
    if (!canViewPerson(sourcePerson, viewer) || !canViewPerson(targetPerson, viewer)) {
        return { allowed: false, reason: 'person_restricted' };
    }
    return { allowed: true, reason: null };
}

function personById(id, graph = {}) {
    if (!id || !(graph.people instanceof Map)) return null;
    return graph.people.get(Number(id)) || graph.people.get(String(id)) || null;
}

function maskStep(step) {
    return {
        ...step,
        fromName: 'một người thân',
        toName: 'một người thân',
        text: 'Một bước quan hệ trong đường dẫn này bị ẩn do quyền riêng tư.',
        restricted: true,
    };
}

function filterEvidenceByPermission({ evidence, viewer, graph } = {}) {
    if (!evidence) return evidence;
    const steps = (evidence.steps || []).map((step) => {
        const fromPerson = personById(step.fromPersonId, graph);
        const toPerson = personById(step.toPersonId, graph);
        if ((fromPerson && !canViewPerson(fromPerson, viewer)) || (toPerson && !canViewPerson(toPerson, viewer))) {
            return maskStep(step);
        }
        return step;
    });

    const restricted = steps.some((step) => step.restricted);
    return {
        ...evidence,
        steps,
        summary: restricted
            ? 'Một phần bằng chứng quan hệ đã được ẩn do quyền riêng tư.'
            : evidence.summary,
        restricted,
    };
}

function restrictedAnswer(reason) {
    return {
        success: false,
        allowed: false,
        reason,
        answer: 'Tôi không có quyền hiển thị thông tin này.',
    };
}

module.exports = {
    canAccessRelationship,
    filterEvidenceByPermission,
    restrictedAnswer,
};
