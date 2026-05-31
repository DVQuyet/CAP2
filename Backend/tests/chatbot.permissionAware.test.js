const assert = require('assert');
const {
    canAccessRelationship,
    filterEvidenceByPermission,
    restrictedAnswer,
} = require('../src/modules/chatbot/permissionAwareResponseService');

const viewer = { id: 1, clanId: 10, role: 'member' };
const admin = { id: 2, clanId: 10, role: 'admin' };
const source = { id: 100, clan_id: 10, display_name: 'Source' };
const target = { id: 101, clan_id: 10, display_name: 'Target' };
const hidden = { id: 102, clan_id: 10, display_name: 'Hidden', privacy_level: 'private' };
const otherClan = { id: 103, clan_id: 11, display_name: 'Other' };

assert.strictEqual(canAccessRelationship({ sourcePerson: source, targetPerson: target, viewer }).allowed, true);
assert.strictEqual(canAccessRelationship({ sourcePerson: source, targetPerson: hidden, viewer }).allowed, false);
assert.strictEqual(canAccessRelationship({ sourcePerson: source, targetPerson: hidden, viewer: admin }).allowed, true);
assert.strictEqual(canAccessRelationship({ sourcePerson: source, targetPerson: otherClan, viewer }).reason, 'cross_clan_access_denied');

const graph = {
    people: new Map([
        [100, source],
        [102, hidden],
    ]),
};

const evidence = {
    steps: [
        {
            fromPersonId: 100,
            toPersonId: 102,
            fromName: 'Source',
            toName: 'Hidden',
            text: 'Hidden là con của Source.',
        },
    ],
    summary: 'Hidden là con của Source.',
};

const filtered = filterEvidenceByPermission({ evidence, viewer, graph });
assert.strictEqual(filtered.restricted, true);
assert.strictEqual(filtered.steps[0].toName, 'một người thân');
assert(filtered.steps[0].text.includes('bị ẩn'));

const open = filterEvidenceByPermission({ evidence, viewer: admin, graph });
assert.strictEqual(open.restricted, false);
assert.strictEqual(open.steps[0].toName, 'Hidden');

assert.strictEqual(restrictedAnswer('person_restricted').answer, 'Tôi không có quyền hiển thị thông tin này.');

console.log('chatbot.permissionAware.test.js passed');
