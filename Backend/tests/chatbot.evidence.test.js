const assert = require('assert');
const {
    buildRelationshipEvidence,
    edgeToEvidenceText,
} = require('../src/modules/chatbot/relationshipEvidenceService');

const me = { id: 1, display_name: 'bạn', gender: 1 };
const father = { id: 2, display_name: 'Nguyễn Văn A', gender: 1 };
const uncle = { id: 3, display_name: 'Nguyễn Văn B', gender: 1 };
const mother = { id: 4, display_name: 'Nguyễn Thị C', gender: 2 };
const maternalUncle = { id: 5, display_name: 'Nguyễn Văn D', gender: 1 };
const wife = { id: 6, display_name: 'Nguyễn Thị E', gender: 2 };
const adoptedChild = { id: 7, display_name: 'Nguyễn Văn F', gender: 1 };
const stepChild = { id: 8, display_name: 'Nguyễn Thị G', gender: 2 };

const peopleById = new Map([
    [me.id, me],
    [father.id, father],
    [uncle.id, uncle],
    [mother.id, mother],
    [maternalUncle.id, maternalUncle],
    [wife.id, wife],
    [adoptedChild.id, adoptedChild],
    [stepChild.id, stepChild],
]);

const paternalEvidence = buildRelationshipEvidence({
    sourcePerson: me,
    targetPerson: uncle,
    relationshipPath: ['father', 'older_brother'],
    pathNodes: [1, 2, 3],
    peopleById,
    relationshipLabel: 'bác',
});

assert.strictEqual(paternalEvidence.steps.length, 2);
assert.strictEqual(paternalEvidence.steps[0].fromPersonId, 1);
assert.strictEqual(paternalEvidence.steps[0].toPersonId, 2);
assert.strictEqual(paternalEvidence.steps[0].edge, 'father');
assert(paternalEvidence.steps[0].text.includes('cha'));
assert.strictEqual(paternalEvidence.steps[1].fromPersonId, 2);
assert.strictEqual(paternalEvidence.steps[1].toPersonId, 3);
assert.strictEqual(paternalEvidence.steps[1].edge, 'older_brother');
assert(paternalEvidence.summary.includes('bác'));
assert(paternalEvidence.pathText.includes('cha'));

const maternalEvidence = buildRelationshipEvidence({
    sourcePerson: me,
    targetPerson: maternalUncle,
    relationshipPath: ['mother', 'younger_brother'],
    pathNodes: [1, 4, 5],
    peopleById,
    relationshipLabel: 'cậu',
});
assert.strictEqual(maternalEvidence.steps[0].edge, 'mother');
assert.strictEqual(maternalEvidence.steps[1].edge, 'younger_brother');
assert(maternalEvidence.summary.includes('cậu'));

const spouseEvidence = buildRelationshipEvidence({
    sourcePerson: me,
    targetPerson: wife,
    relationshipPath: ['spouse'],
    pathNodes: [1, 6],
    peopleById,
    relationshipLabel: 'vợ',
});
assert.strictEqual(spouseEvidence.steps.length, 1);
assert.strictEqual(spouseEvidence.steps[0].edge, 'spouse');
assert(spouseEvidence.steps[0].text.includes('vợ/chồng'));

assert(edgeToEvidenceText('adopted_son', me, adoptedChild, { fromName: 'bạn', toName: 'Nguyễn Văn F' }).includes('con nuôi'));
assert(edgeToEvidenceText('step_daughter', me, stepChild, { fromName: 'bạn', toName: 'Nguyễn Thị G' }).includes('con riêng'));

const fallbackEvidence = buildRelationshipEvidence({
    sourcePerson: me,
    targetPerson: uncle,
    relationshipPath: ['father', 'older_brother'],
    peopleById,
    relationshipLabel: 'bác',
});
assert.strictEqual(fallbackEvidence.steps.length, 2);
assert.strictEqual(fallbackEvidence.steps[1].toName, 'Nguyễn Văn B');

const privateEvidence = buildRelationshipEvidence({
    sourcePerson: me,
    targetPerson: uncle,
    relationshipPath: ['father', 'older_brother'],
    pathNodes: [1, 2, 3],
    peopleById,
    relationshipLabel: 'bác',
    canViewPersonName: (person) => person.id === 1,
});
assert.strictEqual(privateEvidence.steps[0].toName, 'một người thân');
assert.strictEqual(privateEvidence.steps[1].toName, 'một người thân');
assert(privateEvidence.summary.includes('người này'));

console.log('chatbot.evidence.test.js passed');
