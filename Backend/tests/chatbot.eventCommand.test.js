// Chatbot dựng bản nháp sự kiện từ câu tự nhiên (không cần DB).
const assert = require('assert');
const { parseEventCommand } = require('../src/modules/chatbot/eventCommandService');

const now = new Date(2026, 9, 5);
// 15/3 âm lịch: năm 2026 rơi vào 01/05/2026 (đã qua), năm 2027 rơi vào 21/04/2027 (theo bộ đổi lịch của hệ thống).
const lunarToSolar = (day, month, year) => (day === 15 && month === 3 && year === 2027 ? '2027-04-21' : day === 15 && month === 3 && year === 2026 ? '2026-05-01' : null);
const parse = (text) => parseEventCommand(text, { now, lunarToSolar });

const anniversary = parse('Nhắc tôi giỗ ông nội ngày 15/3 âm lịch');
assert.strictEqual(anniversary.title, 'Giỗ ông nội');
assert.strictEqual(anniversary.type, 'death_anniversary');
assert.strictEqual(anniversary.lunar, true);
assert.strictEqual(anniversary.date, '2027-04-21', 'lấy lần giỗ gần nhất sắp tới');

const meeting = parse('Thêm sự kiện họp họ ngày 20/10 lúc 8h sáng, nhắc trước 3 ngày');
assert.strictEqual(meeting.title, 'Họp họ');
assert.strictEqual(meeting.date, '2026-10-20');
assert.strictEqual(meeting.time, '08:00');
assert.strictEqual(meeting.reminderDays, 3);

assert.strictEqual(parse('đặt lịch đi tảo mộ ngày mai').date, '2026-10-06');
assert.strictEqual(parse('thêm lịch họp chi lúc 7 giờ tối ngày 01/01/2027').time, '19:00');
assert.strictEqual(parse('nhắc tôi gọi điện cho bác').needsDate, true);
assert.strictEqual(parse('Ông nội tôi là ai?'), null, 'câu hỏi thường không bị coi là tạo sự kiện');
assert.strictEqual(parse('Ngày giỗ sắp tới là khi nào?'), null);

console.log('chatbot.eventCommand.test.js passed');
