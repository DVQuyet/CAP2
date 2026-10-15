// Đo độ phủ của bộ hiểu câu hỏi bằng luật (không cần DB, không gọi LLM).
// Chạy: node scripts/chatbot-coverage.js            (in danh sách câu chưa nhận ra)
//       node scripts/chatbot-coverage.js --min 50   (thoát mã 1 nếu nhận ra ít hơn 50 câu)
// Thêm câu hỏi thật của người dùng vào QUESTIONS để thấy chỗ còn thiếu.
const path = require('path');

const chatbot = path.join(__dirname, '..', 'src', 'modules', 'chatbot');
const intentParser = require(path.join(chatbot, 'intentParserService'));
const relationshipParser = require(path.join(chatbot, 'relationshipQueryParser'));
const { parseEventCommand } = require(path.join(chatbot, 'eventCommandService'));

const QUESTIONS = {
    'Quan hệ': [
        'Ông Nguyễn Văn A là gì của tôi?', 'Tôi gọi Đinh Viết Lâm bằng gì?', 'Cha của Đinh Viết Lâm là ai?',
        'Mẹ của Đinh Viết Lâm tên gì', 'Ông nội tôi là ai?', 'Bà ngoại của tôi tên gì', 'Anh em của tôi gồm những ai',
        'Chị gái của Đinh Viết Lâm là ai', 'Em trai tôi là ai', 'Chú ruột của tôi là ai', 'Anh họ của tôi là ai',
        'Vợ của Đinh Viết Hòa tên gì', 'Con của Đinh Viết Hòa là ai', 'Cháu nội của ông Hòa là ai',
        'Con dâu của ông Hòa là ai', 'Đinh Viết Lâm và Đinh Viết Hòa có quan hệ gì', 'Ai là tổ tiên của Đinh Viết Lâm',
        'Những người cùng đời với tôi', 'Ai là con trưởng của ông Hòa',
    ],
    'Thống kê': [
        'Gia phả có bao nhiêu người?', 'Dòng họ này có mấy đời?', 'Có bao nhiêu nam bao nhiêu nữ',
        'Đời 3 có bao nhiêu người', 'Ai là người lớn tuổi nhất còn sống', 'Có bao nhiêu người đã mất',
    ],
    'Thông tin người': [
        'Đinh Viết Lâm sinh năm nào', 'Đinh Viết Hòa mất năm nào', 'Quê quán của Đinh Viết Lâm ở đâu',
        'Đinh Viết Lâm thuộc đời thứ mấy', 'Trong gia phả có Đinh Viết Lâm không', 'Số điện thoại của Đinh Viết Lâm',
    ],
    'Lịch và sự kiện': [
        'Sắp tới có sự kiện gì', 'Ngày giỗ sắp tới là khi nào', 'Tháng này có giỗ ai không', 'Hôm nay có sự kiện gì',
        'Sinh nhật của ai sắp tới', 'Giỗ ông nội là ngày nào',
    ],
    'Tạo sự kiện': [
        'Nhắc tôi giỗ ông nội ngày 15/3 âm lịch', 'Thêm sự kiện họp họ ngày 20/10 lúc 8h', 'Đặt lịch đi tảo mộ ngày mai',
        'Hẹn họp chi vào chủ nhật tuần sau',
    ],
    'Khác': [
        'Giới thiệu về dòng họ', 'Có kỷ niệm nào gần đây không', 'Chào bạn', 'Bạn làm được những gì',
        'Hôm nay trời thế nào',
    ],
};

// Mô phỏng thứ tự của queryPlannerService: lệnh tạo sự kiện -> parser ý định -> biểu thức quan hệ.
function classify(question) {
    const now = new Date();
    if (parseEventCommand(question, { now, lunarToSolar: () => null })) return 'create_event_draft';
    const named = relationshipParser.parseNamedRelationshipExpression(question);
    if (named) return 'named_relationship';
    const intent = intentParser.parse(question);
    if (intent.intent !== 'unknown') return intent.intent;
    const expression = relationshipParser.parseRelationshipExpression(question);
    if (!expression.needsClarification) return 'relationship_expression';
    return null;
}

const minArg = process.argv.indexOf('--min');
const minRecognized = minArg > -1 ? Number(process.argv[minArg + 1]) : 0;

let total = 0;
let recognized = 0;
for (const [group, questions] of Object.entries(QUESTIONS)) {
    const missed = [];
    for (const question of questions) {
        total += 1;
        if (classify(question)) recognized += 1;
        else missed.push(question);
    }
    console.log(`${group}: ${questions.length - missed.length}/${questions.length}`);
    missed.forEach((question) => console.log(`   chưa nhận ra: ${question}`));
}
console.log(`\nNhận ra bằng luật: ${recognized}/${total} (${Math.round((recognized / total) * 100)}%). Phần còn lại chuyển sang LLM planner hoặc trả lời gợi ý.`);
if (recognized < minRecognized) process.exit(1);
