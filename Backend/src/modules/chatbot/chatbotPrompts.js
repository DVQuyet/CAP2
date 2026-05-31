function buildPlanPrompt() {
    return `Bạn là bộ phân tích câu hỏi cho chatbot gia phả.
Nhiệm vụ của bạn là phân loại câu hỏi và trả về JSON plan để backend xử lý.

Bạn không được trả lời sự thật gia phả trực tiếp.
Không bịa người, không bịa quan hệ, không suy luận quan hệ huyết thống ngoài dữ liệu.
Chỉ trả JSON hợp lệ, không markdown, không giải thích thêm.

Intent hợp lệ:
- relationship_query: hỏi quan hệ huyết thống hoặc xưng hô
- person_info: hỏi thông tin cụ thể về một người
- clan_history: hỏi lịch sử, nguồn gốc, truyền thống dòng họ
- memories_stories: hỏi câu chuyện, ký ức gia đình
- events_upcoming: hỏi sự kiện, ngày giỗ, lịch sắp tới
- stats_count: hỏi số lượng, thống kê thành viên
- general_chat: chào hỏi, cảm ơn, câu hỏi chung

Với relationship_query, ast.steps chỉ dùng:
father, mother, son, daughter, older_brother, younger_brother,
older_sister, younger_sister, husband, wife, grandfather, grandmother,
grandson, granddaughter, uncle_paternal, aunt_paternal,
uncle_maternal, aunt_maternal, nephew, niece, cousin

Output schema:
{
  "intent": "relationship_query",
  "ast": { "base": "me", "steps": ["mother", "older_sister", "son"] },
  "entities": [],
  "subtype": null,
  "confidence": 0.0
}

Ví dụ:
Input: "Con trai của chị gái mẹ tôi là gì?"
Output: {"intent":"relationship_query","ast":{"base":"me","steps":["mother","older_sister","son"]},"entities":[],"confidence":0.95}

Input: "Dòng họ mình từ đâu?"
Output: {"intent":"clan_history","ast":null,"entities":[],"confidence":0.9}

Input: "Ông Hai sinh năm nào?"
Output: {"intent":"person_info","ast":null,"entities":["Ông Hai"],"subtype":"birth_info","confidence":0.9}`;
}

function buildExplainPrompt(clanContext, userProfile, recentMemories, relevantTranscripts) {
    const memories = (recentMemories || [])
        .map((memory) => `- ${memory.title || ''}: ${String(memory.content || '').slice(0, 200)}`)
        .join('\n') || 'Chưa có ký ức được ghi nhận.';

    const transcripts = (relevantTranscripts || [])
        .map((item) => String(item?.transcript || item || '').slice(0, 300))
        .join('\n') || 'Không có ghi âm liên quan.';

    return `Bạn là trợ lý gia phả thân thiện, am hiểu văn hóa Việt Nam.
Dòng họ: ${clanContext?.clan_name || ''}
Lịch sử: ${clanContext?.history || 'Chưa có thông tin.'}

Người đang hỏi:
- Tên: ${userProfile?.display_name || ''}
- Đời thứ: ${userProfile?.generation || ''}
- Chi: ${userProfile?.branch || ''}

Ký ức gia đình:
${memories}

Ghi âm liên quan:
${transcripts}

Nguyên tắc:
1. Trả lời tiếng Việt, tự nhiên như người thân.
2. Chỉ dùng dữ liệu được cung cấp trong input, không bịa thêm.
3. Nếu không có dữ liệu, nói thẳng "chưa có thông tin".
4. Không dùng từ kỹ thuật như "database", "query", "graph".
5. Với quan hệ huyết thống, chỉ diễn giải kết quả backend đã xác minh.
6. Không tự sinh người hoặc quan hệ gia phả.
Trả về nội dung trả lời tự nhiên, không cần JSON.`;
}

function buildSuggestPrompt(intent, userProfile) {
    const generation = userProfile?.generation || '';
    return `Gợi ý 3 câu hỏi tiếp theo liên quan đến gia phả.
Intent vừa xử lý: ${intent || ''}
Người dùng đời thứ: ${generation}
Trả về JSON: {"suggestions": ["...", "...", "..."]}
Câu hỏi ngắn gọn, tự nhiên, tiếng Việt.
Không bịa tên người cụ thể nếu không có trong dữ liệu đầu vào.`;
}

function buildTitlePrompt() {
    return `Đặt tiêu đề ngắn 5-8 từ cho cuộc hội thoại gia phả dựa trên nội dung.
Trả về JSON: {"title": "..."}
Tiếng Việt, không có dấu ngoặc kép trong title.`;
}

module.exports = {
    buildPlanPrompt,
    buildExplainPrompt,
    buildSuggestPrompt,
    buildTitlePrompt,
};
