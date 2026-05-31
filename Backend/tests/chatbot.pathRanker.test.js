const assert = require('assert');
const {
    scorePath,
    pickBestRelationshipPath,
} = require('../src/modules/chatbot/relationshipPathRanker');

const bloodPath = ['father', 'older_brother'];
const spousePath = ['spouse', 'father', 'older_brother'];
const adoptedPath = ['father', 'adopted_son'];
const stepPath = ['father', 'step_son'];

assert(scorePath(bloodPath) < scorePath(spousePath));
assert(scorePath(adoptedPath) < scorePath(stepPath));
assert(scorePath(['father']) < scorePath(['father', 'father']));

assert.deepStrictEqual(
    pickBestRelationshipPath([
        { path: spousePath, marker: 'spouse' },
        { path: bloodPath, marker: 'blood' },
    ]),
    { path: bloodPath, marker: 'blood' }
);

assert.deepStrictEqual(
    pickBestRelationshipPath([
        { relationshipPath: ['father', 'step_son'], marker: 'step' },
        { relationshipPath: ['father', 'adopted_son'], marker: 'adopted' },
    ]),
    { relationshipPath: ['father', 'adopted_son'], marker: 'adopted' }
);

console.log('chatbot.pathRanker.test.js passed');
