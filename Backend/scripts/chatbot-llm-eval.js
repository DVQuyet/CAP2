// Bộ đo trợ lý AI CÓ gọi Groq thật (không đưa vào CI: tốn quota, kết quả phụ thuộc mạng/model).
//   node scripts/chatbot-llm-eval.js
// Dùng lại dòng họ mẫu của chatbot-e2e-check.js; giữ GROQ_API_KEY trong .env. Giãn nhịp 2,5 giây giữa các câu
// (LLM_EVAL_DELAY_MS để đổi). Xem docs/TIEP_TUC_AI_TRA_LOI.md để biết số đo gần nhất.
const { spawnSync } = require('child_process');
const path = require('path');

const result = spawnSync(process.execPath, [path.join(__dirname, 'chatbot-e2e-check.js'), '--llm', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
});
process.exit(result.status === null ? 1 : result.status);
