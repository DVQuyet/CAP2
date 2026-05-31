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
    ['dong ho toi co bao nhieu nguoi', 'stats_count'],
    ['doi 2 co bao nhieu nguoi', 'stats_count'],
    ['gia pha co bao nhieu thanh vien', 'stats_count'],
    ['gia pha co bao nhieu nguoi', 'stats_count'],
    ['dong ho nay co may doi', 'stats_count'],
    ['gia pha co bao nhieu chi', 'stats_count'],
    ['co bao nhieu chi', 'stats_count'],
    ['lich su dong ho minh nhu the nao', 'clan_history'],
    ['Lich su dong ho la gi?', 'clan_history'],
    ['Thong tin dong ho', 'clan_history'],
    ['Gia pha nay noi ve gi?', 'clan_history'],
    ['Trong gia pha co Dinh Viet Dong khong?', 'person_exists'],
    ['Co Nguyen Van A khong?', 'person_exists'],
    ['Tim Dinh Viet Dong', 'person_exists'],
    ['Dinh Viet Dong co trong cay khong?', 'person_exists'],
    ['Ai la cha cua Dinh Viet Dong?', 'find_parents'],
    ['Con cua Dinh Viet Dong la ai?', 'list_children'],
    ['sap co su kien dong ho nao khong', 'events_upcoming'],
    ['ke toi nghe cau chuyen gia dinh', 'memories_stories'],
    ['thong tin Nguyen Van A', 'person_info'],
    ['chao ban', 'general_chat'],
];

for (const [message, expectedIntent] of cases) {
    const result = parser.parse(message);
    assert.strictEqual(result.intent, expectedIntent, `${message} should be ${expectedIntent}`);
}

const generationStats = parser.parse('doi 2 co bao nhieu nguoi');
assert.strictEqual(generationStats.entities.generation, 2);

const generationCount = parser.parse('Dong ho nay co may doi?');
assert.strictEqual(generationCount.entities.metric, 'generation_count');

const branchCount = parser.parse('Gia pha co bao nhieu chi?');
assert.strictEqual(branchCount.entities.metric, 'branch_count');

const currentGeneration = parser.parse('Nguoi nay thuoc doi thu may?');
assert.strictEqual(currentGeneration.intent, 'find_generation');
assert.strictEqual(currentGeneration.entities.source, 'current_member');

console.log('chatbot.intent.test.js passed');
