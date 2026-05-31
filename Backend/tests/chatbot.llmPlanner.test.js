const assert = require('assert');
const {
    buildPlannerPrompt,
    validatePlannerOutput,
} = require('../src/modules/chatbot/llmPlannerService');

const valid = validatePlannerOutput({
    intent: 'relationship_query',
    queryType: 'how_should_source_call_target',
    source: { base: 'me' },
    target: { base: 'me', chain: ['spouse', 'mother', 'father'] },
});
assert.strictEqual(valid.ok, true);
assert.deepStrictEqual(valid.value.target.chain, ['spouse', 'mother', 'father']);

const validString = validatePlannerOutput(JSON.stringify({
    intent: 'relationship_query',
    source: { base: 'me' },
    target: { base: 'me', chain: ['father'] },
}));
assert.strictEqual(validString.ok, true);

const invalidEdge = validatePlannerOutput({
    intent: 'relationship_query',
    source: { base: 'me' },
    target: { base: 'me', chain: ['teleport'] },
});
assert.strictEqual(invalidEdge.ok, false);
assert(invalidEdge.reason.includes('invalid_edge'));

const inventedPerson = validatePlannerOutput({
    intent: 'relationship_query',
    source: { base: 'me' },
    target: { base: 'me', name: 'Nguyễn Văn A', chain: ['father'] },
});
assert.strictEqual(inventedPerson.ok, false);
assert.strictEqual(inventedPerson.reason, 'target_invented_person');

const unsupported = validatePlannerOutput({
    intent: 'freeform_answer',
    source: { base: 'me' },
    target: { base: 'me' },
});
assert.strictEqual(unsupported.ok, false);
assert.strictEqual(unsupported.reason, 'unsupported_intent');

assert(buildPlannerPrompt('ông ngoại của vợ tôi gọi tôi là gì?').includes('strict JSON'));

console.log('chatbot.llmPlanner.test.js passed');
