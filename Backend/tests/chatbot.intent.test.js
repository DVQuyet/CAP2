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
    // Sự kiện theo mốc thời gian / loại, không cần nhắc "dòng họ"
    ['Sắp tới có sự kiện gì', 'events_upcoming'],
    ['Hôm nay có sự kiện gì', 'events_upcoming'],
    ['Tháng này có giỗ ai không', 'events_upcoming'],
    ['Sinh nhật của ai sắp tới', 'events_upcoming'],
    ['Ngày giỗ sắp tới là khi nào', 'events_upcoming'],
    // "Có ... không" nhưng là kỷ niệm, không phải tra tên người
    ['Có kỷ niệm nào gần đây không', 'memories_stories'],
    // Lịch sử vẫn là lịch sử dòng họ, không bị coi là lịch sự kiện
    ['Lịch sử dòng họ như thế nào', 'clan_history'],
    ['Những người cùng đời với tôi', 'same_generation'],
    ['Ai là tổ tiên của Đinh Viết Lâm', 'list_ancestors'],
    ['Bạn làm được những gì', 'general_chat'],
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

const eventWindow = parser.parse('Tháng này có giỗ ai không');
assert.strictEqual(eventWindow.entities.window, 'month');
assert.strictEqual(eventWindow.entities.kind, 'death_anniversary');
assert.strictEqual(parser.parse('Sinh nhật của ai sắp tới').entities.kind, 'birthday');
assert.strictEqual(parser.parse('Hôm nay có sự kiện gì').entities.window, 'today');
assert.strictEqual(parser.parse('Ngày mai có sự kiện gì').entities.window, 'tomorrow');
assert.strictEqual(parser.parse('Tuần sau có sự kiện gì').entities.window, 'next_week');

const sameGenSelf = parser.parse('Những người cùng đời với tôi');
assert.strictEqual(sameGenSelf.entities.source, 'current_member');
const sameGenNamed = parser.parse('Ai cùng đời với Đinh Viết Lâm');
assert.strictEqual(sameGenNamed.intent, 'same_generation');
assert.strictEqual(sameGenNamed.entities.source, 'named_person');
assert.ok(sameGenNamed.entities.targetName.some((name) => /Đinh Viết Lâm/i.test(name)));
assert.strictEqual(parser.parse('Bạn làm được những gì').entities.topic, 'capabilities');

console.log('chatbot.intent.test.js passed');
