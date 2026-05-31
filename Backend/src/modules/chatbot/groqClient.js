let Groq = null;

try {
    // Optional at runtime so local tests still use deterministic fallbacks
    // when dependencies or GROQ_API_KEY are not configured.
    Groq = require('groq-sdk');
} catch (_) {
    Groq = null;
}

const MODEL = process.env.GROQ_MODEL || 'llama3-8b-8192';

let groq = null;

function getGroqClient() {
    if (!Groq || !process.env.GROQ_API_KEY) return null;
    if (!groq) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groq;
}

async function callGroq(systemPrompt, userContent, maxTokens = 1000) {
    const client = getGroqClient();
    if (!client) return null;

    try {
        const response = await client.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            max_tokens: maxTokens,
            temperature: 0.1,
        });
        return response?.choices?.[0]?.message?.content || null;
    } catch (_) {
        return null;
    }
}

module.exports = {
    callGroq,
};
