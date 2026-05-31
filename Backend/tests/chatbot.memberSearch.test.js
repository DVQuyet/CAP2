const assert = require('assert');
const { findPersonByName } = require('../src/modules/chatbot/memberSearchService');

const people = [
    { id: 1, display_name: 'Đinh Viết Đồng', generation: 3, branch: 'Đinh Viết' },
    { id: 2, display_name: 'Nguyễn Văn A', generation: 2 },
];

const exact = findPersonByName('dinh viet dong', people);
assert.strictEqual(exact[0]?.id, 1);

const contains = findPersonByName('Viết Đồng', people);
assert.strictEqual(contains[0]?.id, 1);

const tokenMatch = findPersonByName('dinh dong', people);
assert.strictEqual(tokenMatch[0]?.id, 1);

const noMatch = findPersonByName('Tran Van B', people);
assert.strictEqual(noMatch.length, 0);

console.log('chatbot.memberSearch.test.js passed');
