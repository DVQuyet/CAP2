const assert = require('assert');
const {
    buildConversationSessionId,
    getConversationMemory,
    updateConversationMemory,
    clearConversationMemory,
} = require('../src/modules/chatbot/conversationMemoryService');
const { resolveCoreference } = require('../src/modules/chatbot/coreferenceResolver');

const scopedA = buildConversationSessionId({ userId: 1, clanId: 10, sessionId: 'chat-1' });
const scopedB = buildConversationSessionId({ userId: 1, clanId: 11, sessionId: 'chat-1' });

clearConversationMemory(scopedA);
clearConversationMemory(scopedB);

assert.strictEqual(getConversationMemory(scopedA), null);

const memory = updateConversationMemory(scopedA, {
    userId: 1,
    clanId: 10,
    lastMentionedPersonId: 123,
    lastMentionedPersonName: 'Nguyễn Văn A',
    lastRelationshipLabel: 'bác',
    lastRelationshipPath: ['father', 'older_brother'],
    lastPathNodes: [1, 2, 123],
    lastEvidence: { summary: 'test' },
});

assert.strictEqual(getConversationMemory(scopedA).lastMentionedPersonId, 123);
assert.strictEqual(memory.sessionId, scopedA);

updateConversationMemory(scopedB, {
    userId: 1,
    clanId: 11,
    lastMentionedPersonId: 999,
});
assert.strictEqual(getConversationMemory(scopedA).lastMentionedPersonId, 123);
assert.strictEqual(getConversationMemory(scopedB).lastMentionedPersonId, 999);

clearConversationMemory(scopedB);
assert.strictEqual(getConversationMemory(scopedB), null);

const peopleById = new Map([
    [123, { id: 123, clan_id: 10, display_name: 'Nguyễn Văn A' }],
]);

const uncleReference = resolveCoreference('vợ của bác ấy là ai?', getConversationMemory(scopedA), {
    peopleById,
    clanId: 10,
});
assert.strictEqual(uncleReference.resolved, true);
assert.strictEqual(uncleReference.intent, 'follow_up_relationship_query');
assert.strictEqual(uncleReference.basePersonId, 123);
assert.deepStrictEqual(uncleReference.chain, ['spouse']);

const personReference = resolveCoreference('người đó có con không?', getConversationMemory(scopedA), {
    peopleById,
    clanId: 10,
});
assert.strictEqual(personReference.resolved, true);
assert.deepStrictEqual(personReference.chain, ['child']);

const missingReference = resolveCoreference('vợ của bác ấy là ai?', null, {
    peopleById,
    clanId: 10,
});
assert.strictEqual(missingReference.resolved, false);
assert.strictEqual(missingReference.needsClarification, true);
assert.strictEqual(missingReference.reason, 'missing_conversation_reference');

const disallowedReference = resolveCoreference('vợ của bác ấy là ai?', getConversationMemory(scopedA), {
    peopleById,
    clanId: 11,
});
assert.strictEqual(disallowedReference.resolved, false);
assert.strictEqual(disallowedReference.reason, 'reference_not_allowed');

clearConversationMemory(scopedA);
assert.strictEqual(getConversationMemory(scopedA), null);

console.log('chatbot.memory.test.js passed');
