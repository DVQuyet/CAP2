// Luật kiểm tra quan hệ gia phả theo 3 mức:
//  - 'error'   : không thể xảy ra (vô lý) -> chặn.
//  - 'legal'   : trái Luật HN&GĐ 2014 nhưng có thể đã xảy ra -> dữ liệu lịch sử: xác nhận; người còn sống: chặn.
//  - 'warning' : bất thường về sinh học/thời gian -> cần xác nhận.
//  - 'notice'  : phong tục / gợi ý -> chỉ thông báo.
// Ngày "ước lượng" (chưa kiểm chứng) hạ lỗi ngày tháng xuống thành cảnh báo.
const {
    parseHistoricalDate,
    personBirth,
    personDeath,
    isDefinitelyBefore,
    isDefinitelyAfter,
    sameExactDay,
    ageRangeAt,
    todayDayNumber,
    lifeStatus,
    formatDateForMessage,
} = require('./dates');
const { MALE, FEMALE, isBloodLink, isAdoptiveLink, toId } = require('./kinshipGraph');
const { DEFAULT_POLICY, computeLineage, computeGenerations } = require('./lineage');

const SEVERITY_RANK = { error: 4, legal: 3, warning: 2, notice: 1 };

const labelOf = (person) => {
    if (!person) return 'Thành viên';
    const display = String(person.display_name || '').trim();
    if (display) return display;
    const parts = [person.surname, person.middle_name, person.first_name]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    return parts.join(' ') || `Thành viên #${person.id}`;
};

const issueKey = (issue) => {
    const ids = [...new Set((issue.personIds || []).map(Number))].sort((a, b) => a - b).join(',');
    return `${issue.code}:${ids}:${issue.familyId || ''}`;
};

const familyDates = (family) => ({
    marriage: parseHistoricalDate(family?.marriage_date, family?.marriage_date_precision),
    ended: parseHistoricalDate(family?.ended_at, family?.ended_at_precision),
});

const isPaperSource = (row) => String(row?.source_type || '').toLowerCase() === 'paper_genealogy';

const yearStartDay = (year) => Math.floor(Date.UTC(year, 0, 1) / 86400000);

// Bối cảnh lịch sử: có nguồn gia phả giấy, hoặc mọi người liên quan đã mất/không rõ, hoặc sự việc trước mốc luật.
const isHistoricalContext = (graph, { personIds = [], familyIds = [], eventDate = null, policy = DEFAULT_POLICY, now = new Date() }) => {
    const people = personIds.map((id) => graph.person(id)).filter(Boolean);
    const families = familyIds.map((id) => graph.family(id)).filter(Boolean);
    if (people.some(isPaperSource) || families.some(isPaperSource)) return true;
    if (people.length && people.every((person) => lifeStatus(person, now) !== 'living')) return true;
    if (eventDate && eventDate.end < yearStartDay(policy.marriageLawYear)) return true;
    return false;
};

class IssueCollector {
    constructor(graph, policy, now) {
        this.graph = graph;
        this.policy = policy;
        this.now = now;
        this.issues = new Map();
    }

    add(issue) {
        const normalized = {
            ...issue,
            personIds: [...new Set((issue.personIds || []).map(Number).filter(Boolean))],
            familyId: issue.familyId ? Number(issue.familyId) : null,
        };
        if (normalized.severity === 'legal') {
            normalized.historical = isHistoricalContext(this.graph, {
                personIds: normalized.personIds,
                familyIds: normalized.familyId ? [normalized.familyId] : [],
                eventDate: issue.eventDate || null,
                policy: this.policy,
                now: this.now,
            });
        }
        delete normalized.eventDate;
        const key = issueKey(normalized);
        const existing = this.issues.get(key);
        if (!existing || SEVERITY_RANK[normalized.severity] > SEVERITY_RANK[existing.severity]) {
            this.issues.set(key, normalized);
        }
    }

    list() {
        return [...this.issues.values()];
    }
}

// Lỗi ngày tháng: nếu một trong các ngày chỉ là ước lượng thì hạ xuống cảnh báo.
const dateSeverity = (...dates) => (dates.some((date) => date?.uncertain) ? 'warning' : 'error');

const checkPerson = (collector, person) => {
    const birth = personBirth(person);
    const death = personDeath(person);
    const today = todayDayNumber(collector.now);
    if (birth && birth.start > today) {
        collector.add({
            code: 'BIRTH_DATE_IN_FUTURE',
            severity: 'error',
            personIds: [person.id],
            message: `Ngày sinh của ${labelOf(person)} không được lớn hơn ngày hiện tại.`,
        });
    }
    if (birth && death && isDefinitelyBefore(death, birth)) {
        collector.add({
            code: 'INVALID_LIFE_DATES',
            severity: dateSeverity(birth, death),
            personIds: [person.id],
            message: `Ngày mất của ${labelOf(person)} (${formatDateForMessage(death)}) trước ngày sinh (${formatDateForMessage(birth)}).`,
        });
    }
};

const checkChildLink = (collector, link) => {
    const { graph, policy } = collector;
    const child = graph.person(link.personId);
    const family = graph.family(link.familyId);
    if (!child || !family) return;
    const parentIds = graph.parentIdsOfFamily(family);

    if (parentIds.includes(child.id)) {
        collector.add({
            code: 'SELF_PARENT',
            severity: 'error',
            personIds: [child.id],
            familyId: family.id,
            message: `${labelOf(child)} không thể là cha/mẹ của chính mình.`,
        });
        return;
    }

    for (const parentId of parentIds) {
        if (graph.isAncestor(child.id, parentId, 'any')) {
            collector.add({
                code: 'ANCESTOR_LOOP',
                severity: 'error',
                personIds: [child.id, parentId],
                familyId: family.id,
                message: `Không thể tạo vòng lặp tổ tiên - con cháu: ${labelOf(graph.person(parentId))} đang là con cháu của ${labelOf(child)}.`,
            });
        }
    }

    const biologicalLinks = graph.parentLinks(child.id).filter((item) => item.childType === 'biological');
    if (biologicalLinks.length > 1) {
        collector.add({
            code: 'MULTIPLE_BIOLOGICAL_PARENTS',
            severity: 'error',
            personIds: [child.id],
            message: `${labelOf(child)} chỉ có thể có một cặp cha mẹ ruột. Với cha mẹ nuôi, con thừa tự hãy chọn đúng loại quan hệ.`,
        });
    }

    const childBirth = personBirth(child);
    for (const parentId of parentIds) {
        const parent = graph.person(parentId);
        const parentBirth = personBirth(parent);
        const parentDeath = personDeath(parent);
        const isFather = family.father_id === parentId;
        const role = isFather ? 'cha' : 'mẹ';

        if (isBloodLink(link)) {
            if (sameExactDay(childBirth, parentBirth)) {
                collector.add({
                    code: 'PARENT_CHILD_SAME_BIRTH_DATE',
                    severity: 'error',
                    personIds: [child.id, parentId],
                    familyId: family.id,
                    message: `${labelOf(parent)} và con ${labelOf(child)} không thể có cùng ngày sinh.`,
                });
                continue;
            }
            if (isDefinitelyBefore(childBirth, parentBirth)) {
                collector.add({
                    code: 'PARENT_BORN_AFTER_CHILD',
                    severity: dateSeverity(childBirth, parentBirth),
                    personIds: [child.id, parentId],
                    familyId: family.id,
                    message: `${labelOf(child)} sinh (${formatDateForMessage(childBirth)}) trước ${role} ${labelOf(parent)} (${formatDateForMessage(parentBirth)}).`,
                });
                continue;
            }
            const age = ageRangeAt(parentBirth, childBirth);
            if (age && age.max < policy.minParentAge) {
                collector.add({
                    code: 'PARENT_TOO_YOUNG',
                    severity: dateSeverity(childBirth, parentBirth),
                    personIds: [child.id, parentId],
                    familyId: family.id,
                    message: `${labelOf(parent)} chưa đủ ${policy.minParentAge} tuổi khi ${labelOf(child)} ra đời.`,
                });
            } else if (age && age.max < policy.warnParentAge) {
                collector.add({
                    code: 'PARENT_UNDER_AGE',
                    severity: 'warning',
                    personIds: [child.id, parentId],
                    familyId: family.id,
                    message: `${labelOf(parent)} dưới ${policy.warnParentAge} tuổi khi sinh ${labelOf(child)} (tảo hôn/ít tuổi). Hãy kiểm tra lại năm sinh.`,
                });
            }
            if (age && !isFather && age.min > policy.maxMotherAge) {
                collector.add({
                    code: 'MOTHER_TOO_OLD',
                    severity: 'warning',
                    personIds: [child.id, parentId],
                    familyId: family.id,
                    message: `${labelOf(parent)} trên ${policy.maxMotherAge} tuổi khi sinh ${labelOf(child)}. Hãy kiểm tra lại năm sinh.`,
                });
            }
            if (age && isFather && age.min > policy.maxFatherAge) {
                collector.add({
                    code: 'FATHER_TOO_OLD',
                    severity: 'warning',
                    personIds: [child.id, parentId],
                    familyId: family.id,
                    message: `${labelOf(parent)} trên ${policy.maxFatherAge} tuổi khi sinh ${labelOf(child)}. Hãy kiểm tra lại năm sinh.`,
                });
            }
            if (!isFather && isDefinitelyAfter(childBirth, parentDeath)) {
                collector.add({
                    code: 'BORN_AFTER_MOTHER_DEATH',
                    severity: dateSeverity(childBirth, parentDeath),
                    personIds: [child.id, parentId],
                    familyId: family.id,
                    message: `${labelOf(child)} sinh (${formatDateForMessage(childBirth)}) sau khi mẹ ${labelOf(parent)} mất (${formatDateForMessage(parentDeath)}).`,
                });
            }
            if (isFather && isDefinitelyAfter(childBirth, parentDeath, policy.posthumousBirthDays)) {
                collector.add({
                    code: 'BORN_LONG_AFTER_FATHER_DEATH',
                    severity: dateSeverity(childBirth, parentDeath),
                    personIds: [child.id, parentId],
                    familyId: family.id,
                    message: `${labelOf(child)} sinh quá ${policy.posthumousBirthDays} ngày sau khi cha ${labelOf(parent)} mất.`,
                });
            }
        } else if (isAdoptiveLink(link) && isDefinitelyBefore(childBirth, parentBirth)) {
            collector.add({
                code: 'ADOPTIVE_PARENT_YOUNGER',
                severity: 'warning',
                personIds: [child.id, parentId],
                familyId: family.id,
                message: `${role === 'cha' ? 'Cha' : 'Mẹ'} nuôi ${labelOf(parent)} sinh sau con nuôi ${labelOf(child)}.`,
            });
        }
    }
};

// Khoảng thời gian của một cuộc hôn nhân: [ngày cưới, ngày kết thúc / ngày một người mất].
// end = Infinity nghĩa là còn đang chung sống (cả hai còn sống); endKnown = false khi không biết lúc kết thúc.
const unionInterval = (graph, family, now = new Date()) => {
    const { marriage, ended } = familyDates(family);
    const start = marriage ? marriage.start : -Infinity;
    let end = Infinity;
    let endKnown = true;
    if (ended) {
        end = ended.end;
    } else if (family.relationship_status !== 'active') {
        endKnown = false;
    } else {
        for (const id of [family.father_id, family.mother_id]) {
            const person = graph.person(id);
            const death = personDeath(person);
            if (death) end = Math.min(end, death.end);
            else if (person && lifeStatus(person, now) !== 'living') endKnown = false;
        }
    }
    return { start, end, endKnown, marriage };
};

// Chỉ coi là trùng thời gian khi chắc chắn: cả hai đang tiếp diễn, hoặc lần cưới sau (đã biết ngày) xảy ra trước khi lần kia kết thúc.
const definitelyOverlap = (a, b) => {
    if (!a.endKnown || !b.endKnown) return false;
    if (a.end === Infinity && b.end === Infinity) return true;
    const laterStart = Math.max(a.start, b.start);
    if (!Number.isFinite(laterStart)) return false;
    return laterStart < Math.min(a.end, b.end);
};

// Chắc chắn không trùng: một cuộc kết thúc (đã biết lúc nào) trước khi cuộc kia bắt đầu (đã biết ngày).
const definitelySeparate = (a, b) => (
    (a.endKnown && Number.isFinite(b.start) && a.end < b.start)
    || (b.endKnown && Number.isFinite(a.start) && b.end < a.start)
);

const checkConcurrentUnions = (collector, family) => {
    const { graph } = collector;
    if (!family.father_id || !family.mother_id) return;
    const current = unionInterval(graph, family, collector.now);
    for (const personId of [family.father_id, family.mother_id]) {
        for (const other of graph.unionsOf(personId)) {
            if (other.id === family.id) continue;
            const otherSpouse = graph.spouseIdInFamily(other, personId);
            if (!otherSpouse) continue;
            const otherInterval = unionInterval(graph, other, collector.now);
            // Vợ lẽ/thiếp theo định nghĩa là song song với vợ cả, trừ khi biết chắc hai cuộc tách rời.
            const concubinage = family.union_type === 'concubine' || other.union_type === 'concubine';
            const overlapping = definitelyOverlap(current, otherInterval)
                || (concubinage && !definitelySeparate(current, otherInterval));
            if (!overlapping) continue;
            const person = graph.person(personId);
            const later = current.start >= otherInterval.start ? current : otherInterval;
            const role = person?.gender === FEMALE ? 'chồng' : 'vợ';
            const unionTypes = new Set([family.union_type, other.union_type]);
            collector.add({
                code: 'CONCURRENT_UNIONS',
                severity: 'legal',
                personIds: [personId, family.father_id === personId ? family.mother_id : family.father_id, otherSpouse],
                familyId: family.id,
                eventDate: later.marriage || null,
                sensitiveAllowed: unionTypes.has('concubine') || unionTypes.has('cohabitation'),
                message: `${labelOf(person)} có nhiều ${role} cùng thời điểm (${labelOf(graph.person(otherSpouse))} và ${labelOf(graph.person(graph.spouseIdInFamily(family, personId)))}).`,
            });
        }
    }
};

const checkFamily = (collector, family) => {
    const { graph, policy } = collector;
    const father = graph.person(family.father_id);
    const mother = graph.person(family.mother_id);

    if (family.father_id && family.father_id === family.mother_id) {
        collector.add({
            code: 'SAME_PERSON_AS_SPOUSE',
            severity: 'error',
            personIds: [family.father_id],
            familyId: family.id,
            message: 'Cha và mẹ (vợ và chồng) không thể là cùng một người.',
        });
        return;
    }

    if (father && mother && father.gender && mother.gender && father.gender === mother.gender) {
        collector.add({
            code: 'SAME_GENDER_SPOUSE',
            severity: 'error',
            personIds: [father.id, mother.id],
            familyId: family.id,
            message: `Không thể tạo quan hệ vợ/chồng cùng giới giữa ${labelOf(father)} và ${labelOf(mother)}.`,
        });
    } else {
        if (father?.gender === FEMALE) {
            collector.add({
                code: 'FEMALE_AS_HUSBAND',
                severity: 'error',
                personIds: [father.id],
                familyId: family.id,
                message: `${labelOf(father)} là nữ nên không thể ở vai trò chồng/cha.`,
            });
        }
        if (mother?.gender === MALE) {
            collector.add({
                code: 'MALE_AS_WIFE',
                severity: 'error',
                personIds: [mother.id],
                familyId: family.id,
                message: `${labelOf(mother)} là nam nên không thể ở vai trò vợ/mẹ.`,
            });
        }
    }

    for (const other of graph.families.values()) {
        if (other.id === family.id) continue;
        if (other.father_id === family.father_id && other.mother_id === family.mother_id) {
            collector.add({
                code: 'DUPLICATE_SPOUSE_FAMILY',
                severity: 'error',
                personIds: [family.father_id, family.mother_id],
                familyId: family.id,
                message: 'Cặp vợ chồng này đã có một gia đình. Nếu ly hôn rồi tái hợp, hãy cập nhật trạng thái của gia đình cũ.',
            });
            break;
        }
    }

    const { marriage, ended } = familyDates(family);
    if (marriage && ended && isDefinitelyBefore(ended, marriage)) {
        collector.add({
            code: 'UNION_ENDED_BEFORE_START',
            severity: dateSeverity(marriage, ended),
            personIds: [family.father_id, family.mother_id],
            familyId: family.id,
            message: `Ngày kết thúc hôn nhân (${formatDateForMessage(ended)}) trước ngày cưới (${formatDateForMessage(marriage)}).`,
        });
    }
    for (const spouse of [father, mother].filter(Boolean)) {
        const birth = personBirth(spouse);
        const death = personDeath(spouse);
        if (marriage && birth && isDefinitelyBefore(marriage, birth)) {
            collector.add({
                code: 'MARRIAGE_BEFORE_BIRTH',
                severity: dateSeverity(marriage, birth),
                personIds: [spouse.id],
                familyId: family.id,
                message: `Ngày cưới (${formatDateForMessage(marriage)}) trước ngày sinh của ${labelOf(spouse)}.`,
            });
        }
        if (marriage && death && isDefinitelyAfter(marriage, death)) {
            collector.add({
                code: 'MARRIAGE_AFTER_DEATH',
                severity: 'warning',
                personIds: [spouse.id],
                familyId: family.id,
                message: `Ngày cưới (${formatDateForMessage(marriage)}) sau khi ${labelOf(spouse)} đã mất. Chỉ lưu nếu đây là hôn lễ sau khi mất theo tục lệ.`,
            });
        }
    }

    if (!father || !mother) return;
    const pair = [father.id, mother.id];

    if (graph.isAncestor(father.id, mother.id, 'blood') || graph.isAncestor(mother.id, father.id, 'blood')) {
        collector.add({
            code: 'MARRIAGE_DIRECT_LINE',
            severity: 'legal',
            personIds: pair,
            familyId: family.id,
            eventDate: marriage,
            message: `${labelOf(father)} và ${labelOf(mother)} cùng dòng máu trực hệ (tổ tiên - con cháu).`,
        });
    } else {
        const common = graph.nearestCommonAncestors(father.id, mother.id, { kind: 'blood', maxDepth: Math.max(policy.sameAncestorWarnGenerations, policy.legalKinshipGenerations) + 1 });
        const nearest = common[0];
        if (nearest) {
            const deeper = Math.max(nearest.depthA, nearest.depthB);
            if (deeper <= policy.legalKinshipGenerations - 1) {
                const detail = nearest.depthA === 1 && nearest.depthB === 1
                    ? 'anh chị em ruột/cùng cha/cùng mẹ'
                    : 'người có họ trong phạm vi ba đời';
                collector.add({
                    code: 'MARRIAGE_WITHIN_THREE_GENERATIONS',
                    severity: 'legal',
                    personIds: pair,
                    familyId: family.id,
                    eventDate: marriage,
                    message: `${labelOf(father)} và ${labelOf(mother)} là ${detail} (chung tổ tiên ${labelOf(graph.person(nearest.ancestorId))}).`,
                });
            } else if (policy.sameAncestorWarnGenerations > 0 && deeper <= policy.sameAncestorWarnGenerations - 1) {
                collector.add({
                    code: 'MARRIAGE_SAME_ANCESTOR',
                    severity: 'notice',
                    personIds: pair,
                    familyId: family.id,
                    message: `${labelOf(father)} và ${labelOf(mother)} có chung tổ tiên ${labelOf(graph.person(nearest.ancestorId))} trong vòng ${deeper + 1} đời (phong tục thường tránh).`,
                });
            }
        }
    }

    const adoptiveParentsOfFather = graph.parentIds(father.id, 'adoptive');
    const adoptiveParentsOfMother = graph.parentIds(mother.id, 'adoptive');
    if (adoptiveParentsOfFather.includes(mother.id) || adoptiveParentsOfMother.includes(father.id)) {
        collector.add({
            code: 'MARRIAGE_ADOPTIVE_PARENT',
            severity: 'legal',
            personIds: pair,
            familyId: family.id,
            eventDate: marriage,
            message: `${labelOf(father)} và ${labelOf(mother)} là cha/mẹ nuôi và con nuôi.`,
        });
    }

    for (const [a, b] of [[father, mother], [mother, father]]) {
        const otherSpousesOfB = graph.spouseIds(b.id).filter((id) => id !== a.id);
        if (otherSpousesOfB.some((spouseId) => graph.parentIds(spouseId, 'kin').includes(a.id))) {
            collector.add({
                code: 'MARRIAGE_PARENT_IN_LAW',
                severity: 'legal',
                personIds: pair,
                familyId: family.id,
                eventDate: marriage,
                message: `${labelOf(a)} là cha/mẹ của người từng là vợ/chồng của ${labelOf(b)} (cha chồng - con dâu, mẹ vợ - con rể).`,
            });
        }
        const parentsOfB = graph.parentIds(b.id, 'any');
        const stepParent = parentsOfB.some((parentId) => parentId !== a.id && graph.spouseIds(parentId).includes(a.id));
        if (stepParent && !parentsOfB.includes(a.id)) {
            collector.add({
                code: 'MARRIAGE_STEP_PARENT',
                severity: 'legal',
                personIds: pair,
                familyId: family.id,
                eventDate: marriage,
                message: `${labelOf(a)} là vợ/chồng của cha/mẹ ${labelOf(b)} (cha dượng/mẹ kế - con riêng).`,
            });
        }
    }

    checkConcurrentUnions(collector, family);
};

const checkSpouseGenerations = (collector, family, generations) => {
    const { graph } = collector;
    if (!family.father_id || !family.mother_id) return;
    const fatherHasParents = graph.parentLinks(family.father_id).length > 0;
    const motherHasParents = graph.parentLinks(family.mother_id).length > 0;
    if (!fatherHasParents || !motherHasParents) return;
    const genFather = generations.get(family.father_id);
    const genMother = generations.get(family.mother_id);
    if (genFather && genMother && genFather !== genMother) {
        collector.add({
            code: 'SPOUSE_DIFFERENT_GENERATION',
            severity: 'notice',
            personIds: [family.father_id, family.mother_id],
            familyId: family.id,
            message: `${labelOf(graph.person(family.father_id))} (đời ${genFather}) và ${labelOf(graph.person(family.mother_id))} (đời ${genMother}) khác đời trong gia phả.`,
        });
    }
};

// Kiểm tra đồ thị. scope = { personIds, familyIds } để chỉ xét phần bị ảnh hưởng; bỏ trống = kiểm tra toàn cây.
const validateGraph = (graph, { policy = DEFAULT_POLICY, now = new Date(), scope = null } = {}) => {
    const collector = new IssueCollector(graph, policy, now);
    const personScope = scope?.personIds ? new Set([...scope.personIds].map(Number)) : null;
    const familyScope = scope?.familyIds ? new Set([...scope.familyIds].map(Number)) : null;

    const familiesToCheck = new Set();
    if (!scope) {
        graph.families.forEach((_, id) => familiesToCheck.add(id));
    } else {
        (familyScope || new Set()).forEach((id) => familiesToCheck.add(id));
        (personScope || new Set()).forEach((personId) => {
            graph.unionIds(personId).forEach((id) => familiesToCheck.add(id));
            graph.parentLinks(personId).forEach((link) => familiesToCheck.add(link.familyId));
        });
    }

    for (const person of graph.people.values()) {
        if (personScope && !personScope.has(person.id)) continue;
        checkPerson(collector, person);
    }

    for (const [familyId, links] of graph.childLinksByFamily.entries()) {
        for (const link of links) {
            const inScope = !scope || familiesToCheck.has(familyId) || personScope?.has(link.personId);
            if (inScope && graph.hasPerson(link.personId)) checkChildLink(collector, link);
        }
    }

    const lineage = computeLineage(graph, policy);
    const generations = computeGenerations(graph, policy, lineage);
    for (const familyId of familiesToCheck) {
        const family = graph.family(familyId);
        if (!family) continue;
        checkFamily(collector, family);
        checkSpouseGenerations(collector, family, generations);
    }

    return collector.list();
};

// Các vấn đề mới phát sinh sau thay đổi (bỏ qua vấn đề đã có từ trước để không chặn các sửa đổi không liên quan).
const diffIssues = (before = [], after = []) => {
    const previous = new Map(before.map((issue) => [issueKey(issue), issue]));
    return after.filter((issue) => {
        const old = previous.get(issueKey(issue));
        return !old || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[old.severity];
    });
};

// Phân loại vấn đề thành: chặn / cần xác nhận / thông báo.
// options.allowSensitive: người có quyền quản lý được ghi quan hệ nhạy cảm của người còn sống (vợ lẽ, chung sống).
const classifyIssues = (issues = [], { allowSensitive = false } = {}) => {
    const blocking = [];
    const confirm = [];
    const notices = [];
    for (const issue of issues) {
        if (issue.severity === 'error') blocking.push(issue);
        else if (issue.severity === 'legal') {
            if (issue.historical) confirm.push(issue);
            else if (issue.sensitiveAllowed && allowSensitive) confirm.push({ ...issue, sensitive: true });
            else blocking.push({ ...issue, strict: true });
        } else if (issue.severity === 'warning') confirm.push(issue);
        else notices.push(issue);
    }
    return { blocking, confirm, notices };
};

module.exports = {
    SEVERITY_RANK,
    issueKey,
    isHistoricalContext,
    validateGraph,
    diffIssues,
    classifyIssues,
    labelOf,
    unionInterval,
};
