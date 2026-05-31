const assert = require('assert');
const {
    buildClarificationResponse,
    resolveClarificationSelection,
} = require('../src/modules/chatbot/clarificationService');

const candidates = [
    { id: 1, display_name: 'Nguyễn Văn An', birth_date: '1970-01-01', generation: 3 },
    { id: 2, display_name: 'Nguyễn Văn An', birth_date: '1995-05-10', generation: 5 },
];

const clarification = buildClarificationResponse({
    candidates,
    reason: 'ambiguous_person',
    context: { name: 'Nguyễn Văn An' },
});

assert.strictEqual(clarification.needsClarification, true);
assert.strictEqual(clarification.candidates.length, 2);
assert(clarification.answer.includes('1.'));
assert(clarification.answer.includes('1995'));

const byNumber = resolveClarificationSelection({
    message: '2',
    pendingClarification: clarification.pendingClarification,
});
assert.strictEqual(byNumber.resolved, true);
assert.strictEqual(byNumber.personId, 2);
assert.strictEqual(byNumber.reason, 'selected_by_index');

const byYear = resolveClarificationSelection({
    message: 'người sinh năm 1970',
    pendingClarification: clarification.pendingClarification,
});
assert.strictEqual(byYear.resolved, true);
assert.strictEqual(byYear.personId, 1);
assert.strictEqual(byYear.reason, 'selected_by_birth_year');

const invalid = resolveClarificationSelection({
    message: 'người thứ 9',
    pendingClarification: clarification.pendingClarification,
});
assert.strictEqual(invalid.resolved, false);
assert.strictEqual(invalid.needsClarification, true);
assert.strictEqual(invalid.reason, 'invalid_selection');

console.log('chatbot.clarification.test.js passed');
