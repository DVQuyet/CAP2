// LLM giả cho bộ thử trình duyệt: giả API Groq (dạng OpenAI) ở POST /openai/v1/chat/completions.
// Backend trỏ vào đây bằng GROQ_BASE_URL (groq-sdk tự đọc), nên không gọi Groq thật và kết quả luôn như nhau.
// Hiện chỉ trả lời "AI lập kế hoạch sự kiện" (ai.controller generateEventFormAI); lời nhắc khác trả JSON rỗng.
import http from "node:http";

const PORT = Number(process.env.FAKE_LLM_PORT || 4010);
export const FAKE_EVENT_TITLE = "Giỗ tổ họ Trần (AI giả)";

function eventFormAnswer(userContent) {
  let payload = {};
  try { payload = JSON.parse(userContent); } catch { payload = {}; }
  const count = Math.min(Math.max(Number(payload.requested_task_count) || 3, 1), 20);
  const date = "2026-12-20";
  return {
    status: "success",
    mode: payload.mode === "task_create" ? "task_create" : "event_create",
    event: { title: FAKE_EVENT_TITLE, event_date: date, start_date: date, end_date: date, description: "Sự kiện do LLM giả tạo cho bộ thử." },
    manager_tasks: Array.from({ length: count }, (_, i) => ({
      title: `Việc chuẩn bị số ${i + 1}`,
      description: "Mô tả ngắn do LLM giả tạo.",
      due_date: "2026-12-15",
      suggested_role: "manager",
      status: "assigned",
    })),
  };
}

function answerFor(messages) {
  const system = String(messages.find((m) => m.role === "system")?.content || "");
  const user = String(messages.filter((m) => m.role === "user").at(-1)?.content || "");
  if (/requested_task_count|manager_tasks/.test(system + user)) return JSON.stringify(eventFormAnswer(user));
  return "{}";
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") { res.end("ok"); return; }
  if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) { res.statusCode = 404; res.end(); return; }
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    let request = {};
    try { request = JSON.parse(body); } catch { request = {}; }
    const content = answerFor(Array.isArray(request.messages) ? request.messages : []);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      id: "fake-1", object: "chat.completion", created: Math.floor(Date.now() / 1000), model: request.model || "fake",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }));
  });
});

server.listen(PORT, "127.0.0.1", () => process.stdout.write(`[fake-llm] http://127.0.0.1:${PORT}
`));
