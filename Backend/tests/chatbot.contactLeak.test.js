const test = require('node:test');
const assert = require('node:assert/strict');

const calls = [];
class FakeGroq {
    chat = {
        completions: {
            create: async (payload, options) => {
                calls.push([payload, options]);
                return { choices: [] };
            },
        },
    };
}

function findLeaks(value, contacts, location, leaks) {
    if (typeof value === 'string') {
        for (const [field, marker] of contacts) {
            if (value.includes(marker)) leaks.add(`${location}: ${field}`);
        }
    } else if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
            findLeaks(key, contacts, location, leaks);
            findLeaks(nested, contacts, `${location}.${key}`, leaks);
        }
    }
}

test('/ask giữ kín SĐT, email và địa chỉ trong JSON trả về và yêu cầu gửi LLM', async () => {
    const sdkPath = require.resolve('groq-sdk');
    require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: FakeGroq };
    Object.assign(process.env, { GROQ_API_KEY: 'test-key', CHATBOT_LLM_REWRITE: 'all' });
    const { ask, CASES, CONVERSATION, DATASETS } = require('../scripts/chatbot-e2e-check');
    const accentCases = require('../scripts/chatbot-e2e/casesAccent');
    const contacts = [];
    for (const [dataset, { people }] of Object.entries(DATASETS)) {
        for (const person of people) {
            Object.assign(person, {
                phone: `+999${person.clan_id}867${String(person.id).padStart(4, '0')}`,
                email: `q1-${dataset}-${person.id}@example.test`,
                address: `Số ${person.id} đường Mẫu Q1 ${dataset}`,
            });
            for (const field of ['phone', 'email', 'address']) contacts.push([field, person[field]]);
        }
    }

    const scenarios = [
        ...[...CASES, ...accentCases].map(([, question, , , , dataset, session], index) => [
            question, session || `case-${index}`, dataset,
        ]),
        ...CONVERSATION.map(([question]) => [question, 'conversation']),
        ['Địa chỉ của Đinh Văn Bình là gì?', 'contact-address'],
        ['Email của Đinh Văn Bình là gì?', 'contact-email'],
    ];
    const leaks = new Set();
    let sawPeople = false;
    let sawCandidates = false;
    for (const [question, session, dataset] of scenarios) {
        const firstCall = calls.length;
        const { status, body } = await ask(question, session, dataset);
        assert.ok(status < 500, `/ask lỗi ${status} với câu hỏi: ${question}`);
        sawPeople ||= Boolean(body.people?.length);
        sawCandidates ||= Boolean(body.candidates?.length);
        const turnCalls = calls.slice(firstCall);
        if (session === 'contact-address' || session === 'contact-email') {
            assert.equal(status, 200);
            assert.equal(body.resolvedData?.data?.[0]?.id, 5, question);
            assert.ok(turnCalls.some(([payload]) => payload.max_tokens === 800), question);
        }
        findLeaks(JSON.parse(JSON.stringify(body)), contacts, `/ask «${question}»`, leaks);
        for (const call of turnCalls) findLeaks(call, contacts, `LLM «${question}»`, leaks);
    }

    assert.equal(leaks.size, 0, [...leaks].join('\n'));
    assert.ok(sawPeople && sawCandidates, 'Bộ đo phải đi qua cả people và candidates');
    assert.ok(calls.some(([payload]) => payload.max_tokens === 500), 'Bộ đo phải gọi LLM lập kế hoạch');
    assert.ok(calls.some(([payload]) => payload.max_tokens === 800), 'Bộ đo phải gọi LLM diễn đạt');
});
