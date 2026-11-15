// So câu trả lời của trợ lý khi tắt và bật CHATBOT_ACCENT_FIRST (parser quan hệ cũ / parser đọc chữ có dấu)
// trên toàn bộ câu của hai bộ đo. In từng câu có câu trả lời khác nhau kèm cả hai câu trả lời, để người xem duyệt
// trước khi bật cờ mặc định (bước L14). Chạy trên DB giả của chatbot-e2e-check.js, không gọi Groq.
//
//   node scripts/chatbot-parser-diff.js
//   node scripts/chatbot-parser-diff.js --ask "Bà của vợ tôi là ai?|ba cua toi la ai" [--dataset accent]
const { spawnSync } = require('child_process');
const path = require('path');

const CHECK = path.join(__dirname, 'chatbot-e2e-check.js');
const ROW = /^([✔✘])? ?\[([^\]]*)\] (.*)\n {4}→ (.*)$/gmu;

function run(args, accentFirst) {
    const result = spawnSync(process.execPath, [CHECK, ...args], {
        encoding: 'utf8',
        env: { ...process.env, CHATBOT_ACCENT_FIRST: accentFirst ? '1' : '' },
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    return [...result.stdout.matchAll(ROW)].map((match) => ({
        ok: match[1] === '✔',
        graded: Boolean(match[1]),
        intent: match[2].replace(/^\d+ /, ''),
        // Bỏ phần "ids=[...] msg=..." để khóa so sánh chỉ là câu hỏi.
        question: match[3].replace(/ ids=\[[^\]]*\] msg=\S+$/, ''),
        answer: match[4],
    }));
}

function compare(label, args) {
    const before = run(args, false);
    const after = run(args, true);
    if (before.length !== after.length) {
        console.log(`${label}: số câu đọc được khác nhau (${before.length} và ${after.length}), không so được.`);
        return { total: 0, changed: 1 };
    }
    const mark = (row) => (row.graded ? (row.ok ? '✔ ' : '✘ ') : '');
    const changed = before
        .map((row, index) => ({ row, next: after[index] }))
        .filter(({ row, next }) => row.answer !== next.answer || row.intent !== next.intent);
    console.log(`\n## ${label}: ${changed.length}/${before.length} câu trả lời khác nhau`);
    changed.forEach(({ row, next }) => {
        console.log(`\n${row.question}`);
        console.log(`  cờ tắt: ${mark(row)}[${row.intent}] ${row.answer}`);
        console.log(`  cờ bật: ${mark(next)}[${next.intent}] ${next.answer}`);
    });
    return { total: before.length, changed: changed.length };
}

const askIndex = process.argv.indexOf('--ask');
const summary = askIndex > -1
    ? [compare('Câu hỏi thử', process.argv.slice(askIndex))]
    : [compare('Bộ chính', ['--all']), compare('Bộ tiếng Việt có dấu', ['--all', '--suite', 'accent'])];
const total = summary.reduce((sum, item) => sum + item.total, 0);
const changed = summary.reduce((sum, item) => sum + item.changed, 0);
console.log(`\nTổng: ${changed}/${total} câu có câu trả lời khác nhau giữa hai parser.`);
