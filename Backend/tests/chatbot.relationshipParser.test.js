const assert = require('assert');
const {
    normalizeRelationshipQuery,
    relationshipTermToEdges,
    parseRelationshipExpression,
} = require('../src/modules/chatbot/relationshipQueryParser');
const { resolveRelationshipExpression } = require('../src/modules/chatbot/relationshipExpressionResolver');

function assertChain(text, expectedChain) {
    const ast = parseRelationshipExpression(text);
    assert.strictEqual(ast.needsClarification, false, `${text} should parse`);
    assert.deepStrictEqual(ast.chain, expectedChain);
    assert.strictEqual(ast.base, 'me');
}

assert.strictEqual(normalizeRelationshipQuery('  Ông ngoại của VỢ tôi? '), 'ong ngoai cua vo toi');
assert.deepStrictEqual(relationshipTermToEdges('ông ngoại'), ['mother', 'father']);

assertChain('ông ngoại của tôi', ['mother', 'father']);
assertChain('ông ngoại của vợ tôi', ['spouse', 'mother', 'father']);
assertChain('con của chị gái mẹ tôi', ['mother', 'older_sister', 'child']);
assertChain('cha của cha của tôi', ['father', 'father']);
assertChain('ba của tôi', ['father']);
assertChain('má của tôi', ['mother']);

const unsupported = parseRelationshipExpression('người bạn thân của tôi là ai');
assert.strictEqual(unsupported.needsClarification, true);
assert.strictEqual(unsupported.chain.length, 0);

const graph = {
    adjacency: new Map([
        [1, [
            { to: 2, type: 'mother' },
            { to: 5, type: 'spouse' },
        ]],
        [2, [
            { to: 3, type: 'father' },
            { to: 4, type: 'older_sister' },
        ]],
        [4, [
            { to: 6, type: 'son' },
            { to: 7, type: 'daughter' },
        ]],
        [5, [
            { to: 8, type: 'mother' },
        ]],
        [8, [
            { to: 9, type: 'father' },
        ]],
    ]),
};

const grandfatherAst = parseRelationshipExpression('ông ngoại của tôi');
const grandfatherResult = resolveRelationshipExpression(grandfatherAst, { sourcePersonId: 1, graph });
assert.strictEqual(grandfatherResult.ok, true);
assert.strictEqual(grandfatherResult.needsClarification, false);
assert.deepStrictEqual(grandfatherResult.relationshipPath, ['mother', 'father']);
assert.deepStrictEqual(grandfatherResult.candidatePersonIds, [3]);

const spouseGrandfatherAst = parseRelationshipExpression('ông ngoại của vợ tôi');
const spouseGrandfatherResult = resolveRelationshipExpression(spouseGrandfatherAst, { sourcePersonId: 1, graph });
assert.strictEqual(spouseGrandfatherResult.ok, true);
assert.deepStrictEqual(spouseGrandfatherResult.candidatePersonIds, [9]);

const niblingAst = parseRelationshipExpression('con của chị gái mẹ tôi');
const niblingResult = resolveRelationshipExpression(niblingAst, { sourcePersonId: 1, graph });
assert.strictEqual(niblingResult.ok, true);
assert.strictEqual(niblingResult.needsClarification, true);
assert.deepStrictEqual(niblingResult.candidatePersonIds, [6, 7]);

const noMatchAst = parseRelationshipExpression('bà nội của tôi');
const noMatchResult = resolveRelationshipExpression(noMatchAst, { sourcePersonId: 1, graph });
assert.strictEqual(noMatchResult.ok, false);
assert.strictEqual(noMatchResult.reason, 'no_matching_person');

console.log('chatbot.relationshipParser.test.js passed');
