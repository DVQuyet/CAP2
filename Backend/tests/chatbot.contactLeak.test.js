const test = require('node:test');
const assert = require('node:assert/strict');

const calls = [];
class FakeGroq {
    chat = {
        completions: {
            create: async (payload, options) => {
                calls.push([payload, options]);
                if (payload.max_tokens === 500) {
                    const content = JSON.stringify({ intent: 'person_info', entities: ['Đinh Văn Bình'], subtype: 'address_info' });
                    return { choices: [{ message: { content } }] };
                }
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

function loadHarness() {
    const sdkPath = require.resolve('groq-sdk');
    require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: FakeGroq };
    Object.assign(process.env, { GROQ_API_KEY: 'test-key', CHATBOT_LLM_REWRITE: 'all' });
    return require('../scripts/chatbot-e2e-check');
}

// Gắn SĐT/email/địa chỉ giả (duy nhất) cho mọi người trong bộ đo; gọi lại nhiều lần cho cùng kết quả.
function seedContacts(datasets) {
    const contacts = [];
    for (const [dataset, { people }] of Object.entries(datasets)) {
        for (const person of people) {
            Object.assign(person, {
                phone: `+999${person.clan_id}867${String(person.id).padStart(4, '0')}`,
                email: `q1-${dataset}-${person.id}@example.test`,
                address: `Số ${person.id} đường Mẫu Q1 ${dataset}`,
            });
            // Liên hệ còn nằm lẫn trong ghi chú (lỗi Astra 25/11: /ask trả nguyên note).
            person.note = `Liên hệ: ${person.email}, ĐT ${person.phone}, nhà ${person.address}`;
            for (const field of ['phone', 'email', 'address']) contacts.push([field, person[field]]);
        }
    }
    return contacts;
}

test('/ask giữ kín SĐT, email và địa chỉ trong JSON trả về và yêu cầu gửi LLM', async () => {
    const { ask, DATASETS } = loadHarness();
    const contacts = seedContacts(DATASETS);

    const profileCases = [
        ['Địa chỉ của Đinh Văn Bình là gì?', 'person_info', [5]],
        ['Email của Đinh Văn Bình là gì?', 'person_info', [5]],
        ['Số điện thoại của Đinh Văn Bình là gì?', 'person_info', [5]],
        ['Ông Bình là ai?', 'person_info', [5]],
        ['Quê quán của Đinh Văn Lâm ở đâu?', 'person_info', [14]],
        ['Xin một manh mối về Đinh Văn Bình.', 'person_info', [5]],
    ];
    const conversation = [
        ['Đinh Văn Lâm là ai?', 'person_info', [14]],
        ['Vợ của ông ấy là ai?', 'relationship_expression', [20]],
        ['Còn con của ông ấy?', 'relationship_expression', [21]],
        ['Ông ấy sinh năm nào?', 'person_info', [14]],
        ['Thế còn Đinh Văn Bình?', 'person_info', [5]],
        ['Con của Đinh Văn Hùng là ai?', 'relationship_expression', [10, 12]],
        ['1', 'relationship_expression', [101, 18]],
    ];
    const scenarios = [
        ...profileCases,
        ['Tôi gọi Đinh Văn Bình là gì?', 'find_relationship', [5]],
        ['Ai là con nuôi của Đinh Văn Bình?', 'list_children', [17]],
        ['Trong gia phả có ai tên Lan không?', 'person_exists', [6]],
        ['Ba tôi là ai?', 'find_parents', [6], 'accent'],
        ...conversation.map((scenario) => [...scenario, 'dinh', 'conversation']),
    ];
    const leaks = new Set();
    let sawPeople = false;
    let sawCandidates = false;
    for (const [index, [question, intent, targetIds, dataset, session]] of scenarios.entries()) {
        const firstCall = calls.length;
        const { status, body } = await ask(question, session || `case-${index}`, dataset);
        assert.equal(status, 200, question);
        assert.equal(body.intent, intent, question);
        const ids = intent === 'person_info'
            ? body.resolvedData?.data?.map((person) => person.id)
            : body.candidates?.map((person) => person.id) || body.personIds?.slice(0, targetIds.length);
        assert.deepEqual(ids, targetIds, question);
        sawPeople ||= Boolean(body.people?.length);
        sawCandidates ||= Boolean(body.candidates?.length);
        const turnCalls = calls.slice(firstCall);
        if (index < profileCases.length) {
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

test('toàn bộ CASES và CONVERSATION của bộ đo: không lộ liên hệ trong JSON lẫn mọi lời gọi LLM', async () => {
    const { ask, CASES, CONVERSATION, DATASETS } = loadHarness();
    const contacts = seedContacts(DATASETS);
    const leaks = new Set();
    const turns = [
        ...CASES.map(([, question, , dataset], index) => [question, `all-case-${index}`, dataset || undefined]),
        ...CONVERSATION.map(([question]) => [question, 'all-conversation', 'dinh']),
    ];
    for (const [question, session, dataset] of turns) {
        const firstCall = calls.length;
        const { status, body } = await ask(question, session, dataset);
        assert.ok(status < 500, question); // câu chặn (prompt injection...) trả 4xx, vẫn phải kiểm không lộ
        findLeaks(JSON.parse(JSON.stringify(body)), contacts, `/ask «${question}»`, leaks);
        for (const call of calls.slice(firstCall)) findLeaks(call, contacts, `LLM «${question}»`, leaks);
    }
    assert.equal(leaks.size, 0, [...leaks].join('\n'));
});
