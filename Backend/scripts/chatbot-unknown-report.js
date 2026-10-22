// Báo cáo câu hỏi bot chưa hiểu: intent 'unknown' hoặc phải nhờ LLM lập kế hoạch (metadata.fallback).
//
//   node scripts/chatbot-unknown-report.js --days 7 --top 20
//
// Chỉ ĐỌC từ chatbot_messages (kết nối DB theo Backend/.env, cẩn thận khi .env trỏ production).
// Hàm gom nhóm/chuẩn hóa (normalizeQuestion, groupUnknownQuestions) là hàm thuần, có test riêng.

const stripDiacritics = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd');

// Chuẩn hóa để gom các câu gần giống nhau: bỏ dấu, bỏ dấu câu, bỏ lời xã giao đầu/cuối câu.
function normalizeQuestion(text) {
    return stripDiacritics(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(cho (minh|toi|em|con|chau|tui) hoi|xin hoi|minh hoi|toi hoi|hoi)\s+/, '')
        .replace(/\s+(a|ah|ạ|nhe|nha|di|vay|the)$/, '')
        .trim();
}

function parseMetadata(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return {}; }
}

// rows: { message?, intent, metadata, created_at } của tin nhắn assistant.
// Trả về [{ question, count, intents, fallbacks, lastSeen, examples }] giảm dần theo count.
function groupUnknownQuestions(rows, { top = 20 } = {}) {
    const groups = new Map();
    for (const row of rows || []) {
        const metadata = parseMetadata(row.metadata);
        const fallback = metadata.fallback || null;
        if (row.intent !== 'unknown' && !fallback) continue;
        const raw = metadata.turn?.rawQuestion || metadata.turn?.question || null;
        const key = normalizeQuestion(raw);
        if (!key) continue;

        let group = groups.get(key);
        if (!group) {
            group = { question: key, count: 0, intents: new Set(), fallbacks: new Set(), lastSeen: null, examples: [] };
            groups.set(key, group);
        }
        group.count += 1;
        group.intents.add(row.intent || 'unknown');
        if (fallback) group.fallbacks.add(fallback);
        const seen = row.created_at ? new Date(row.created_at) : null;
        if (seen && (!group.lastSeen || seen > group.lastSeen)) group.lastSeen = seen;
        if (group.examples.length < 3 && !group.examples.includes(raw)) group.examples.push(raw);
    }
    return [...groups.values()]
        .sort((a, b) => b.count - a.count || a.question.localeCompare(b.question))
        .slice(0, Math.max(Number(top) || 20, 1))
        .map((group) => ({ ...group, intents: [...group.intents], fallbacks: [...group.fallbacks] }));
}

function parseArgs(argv) {
    const args = { days: 7, top: 20 };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--days') args.days = Number(argv[index + 1]);
        if (argv[index] === '--top') args.top = Number(argv[index + 1]);
    }
    if (!Number.isFinite(args.days) || args.days <= 0) args.days = 7;
    if (!Number.isFinite(args.top) || args.top <= 0) args.top = 20;
    return args;
}

async function main() {
    const { days, top } = parseArgs(process.argv.slice(2));
    const db = require('../src/config/db');
    const [roleColumn] = await db.query("SHOW COLUMNS FROM chatbot_messages LIKE 'role'");
    const assistantFilter = roleColumn.length ? "role = 'assistant'" : "sender = 'bot'";
    const [rows] = await db.query(
        `SELECT intent, metadata, created_at
         FROM chatbot_messages
         WHERE ${assistantFilter}
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           AND (intent = 'unknown' OR JSON_EXTRACT(metadata, '$.fallback') IS NOT NULL)`,
        [days]
    );
    const groups = groupUnknownQuestions(rows, { top });
    console.log(`Câu bot chưa hiểu trong ${days} ngày qua (${rows.length} lượt, top ${top}):`);
    groups.forEach((group, index) => {
        const when = group.lastSeen ? group.lastSeen.toISOString().slice(0, 10) : '-';
        console.log(`${String(index + 1).padStart(2)}. [${group.count}x] ${group.question}  (${group.fallbacks.join(',') || group.intents.join(',')}; gần nhất ${when})`);
    });
    if (!groups.length) console.log('Không có câu nào.');
    process.exit(0);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = { normalizeQuestion, groupUnknownQuestions, parseArgs };
