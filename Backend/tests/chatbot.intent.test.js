const assert = require('assert');
const parser = require('../src/modules/chatbot/intentParserService');

const cases = [
    ['Ông Nguyễn Văn A là gì của tôi?', 'find_relationship'],
    ['Con của bác Hai là ai?', 'list_children'],
    ['Vợ của cậu Út tên gì?', 'find_spouse'],
    ['Nguyễn Văn A và Nguyễn Văn B có quan hệ gì?', 'compare_relationship'],
    ['Ông nội của tôi là ai?', 'find_by_kinship'],
    ['Tôi gọi Nguyễn Văn A bằng gì?', 'find_relationship'],
    ['Người này thuộc đời thứ mấy?', 'find_generation'],
];

for (const [message, expectedIntent] of cases) {
    const result = parser.parse(message);
    assert.strictEqual(result.intent, expectedIntent, `${message} should be ${expectedIntent}`);
}

console.log('chatbot.intent.test.js passed');
