const relationshipEngine = require('../src/modules/chatbot/relationshipEngine');

async function main() {
    const clanId = Number(process.argv[2]);
    const sourceId = Number(process.argv[3]);
    const targetId = Number(process.argv[4]);

    if (!clanId || !sourceId || !targetId) {
        console.error('Usage: node tests/chatbot.benchmark.js <clanId> <sourcePersonId> <targetPersonId>');
        process.exit(1);
    }

    const start = Date.now();
    const relation = await relationshipEngine.findRelationship(sourceId, targetId, { clanId, forceRefresh: true });
    const elapsedMs = Date.now() - start;

    console.log(JSON.stringify({
        elapsedMs,
        found: relation.found,
        relationshipLabel: relation.relationshipLabel,
        relationshipPath: relation.relationshipPath,
        depth: relation.depth,
    }, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
