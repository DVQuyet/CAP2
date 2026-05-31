const assert = require('assert');
const queryPlanner = require('../src/modules/chatbot/queryPlannerService');

(async () => {
    const cases = [
        ['dong ho toi co bao nhieu nguoi', 'stats_count'],
        ['doi 2 co bao nhieu nguoi', 'stats_count'],
        ['dong ho nay co may doi', 'stats_count'],
        ['gia pha co bao nhieu chi', 'stats_count'],
        ['co bao nhieu chi', 'stats_count'],
        ['lich su dong ho minh nhu the nao', 'clan_history'],
        ['Lich su dong ho la gi?', 'clan_history'],
        ['Thong tin dong ho', 'clan_history'],
        ['Gia pha nay noi ve gi?', 'clan_history'],
        ['Trong gia pha co Dinh Viet Dong khong?', 'person_exists'],
        ['Co Nguyen Van A khong?', 'person_exists'],
        ['Tim Dinh Viet Dong', 'person_exists'],
        ['Dinh Viet Dong co trong cay khong?', 'person_exists'],
        ['Ai la cha cua Dinh Viet Dong?', 'find_parents'],
        ['Con cua Dinh Viet Dong la ai?', 'list_children'],
        ['sap co su kien dong ho nao khong', 'events_upcoming'],
        ['ke toi nghe cau chuyen gia dinh', 'memories_stories'],
        ['thong tin Nguyen Van A', 'person_info'],
        ['Con cua bac Hai la ai?', 'list_children'],
        ['Vo cua cau Ut ten gi?', 'find_spouse'],
        ['Nguoi nay thuoc doi thu may?', 'find_generation'],
        ['chao ban', 'general_chat'],
    ];

    for (const [message, expectedIntent] of cases) {
        const result = await queryPlanner.planQuery({ message, forceAI: true });
        assert.strictEqual(result.plan.intent, expectedIntent, `${message} should be ${expectedIntent}`);
        assert.strictEqual(result.planner.source, 'rule_parser', `${message} should use rule_parser`);
    }

    const generationStats = await queryPlanner.planQuery({ message: 'doi 2 co bao nhieu nguoi', forceAI: true });
    assert.strictEqual(generationStats.plan.entities.generation, 2);

    const generationCount = await queryPlanner.planQuery({ message: 'dong ho nay co may doi', forceAI: true });
    assert.strictEqual(generationCount.plan.entities.metric, 'generation_count');

    const branchCount = await queryPlanner.planQuery({ message: 'gia pha co bao nhieu chi', forceAI: true });
    assert.strictEqual(branchCount.plan.entities.metric, 'branch_count');

    console.log('chatbot.rulePlanner.test.js passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
