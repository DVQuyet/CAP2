const assert = require('assert');
const { describeRelationshipPath, matchVietnameseKinshipRule } = require('../src/modules/chatbot/vietnameseKinshipRules');

const male = { gender: 1 };
const female = { gender: 2 };
const unknown = {};

assert.strictEqual(describeRelationshipPath(['father', 'older_brother'], { targetPerson: male }), 'bác');
assert.strictEqual(describeRelationshipPath(['father', 'younger_brother'], { targetPerson: male }), 'chú');
assert.strictEqual(describeRelationshipPath(['father', 'younger_brother', 'spouse'], { targetPerson: female }), 'thím');
assert.strictEqual(describeRelationshipPath(['father', 'older_sister', 'spouse'], { targetPerson: male }), 'dượng');
assert.strictEqual(describeRelationshipPath(['mother', 'younger_brother', 'spouse'], { targetPerson: female }), 'mợ');
assert.strictEqual(describeRelationshipPath(['father', 'older_brother', 'son'], { targetPerson: male }), 'anh em họ');
assert.strictEqual(describeRelationshipPath(['father', 'father'], { targetPerson: male }), 'ông nội');
assert.strictEqual(describeRelationshipPath(['mother', 'mother'], { targetPerson: female }), 'bà ngoại');
assert.strictEqual(describeRelationshipPath(['son', 'son'], { targetPerson: male }), 'cháu trai nội');
assert.strictEqual(describeRelationshipPath(['daughter', 'daughter'], { targetPerson: female }), 'cháu gái ngoại');
assert.strictEqual(describeRelationshipPath(['adopted_son'], { targetPerson: male }), 'con nuôi');
assert.strictEqual(describeRelationshipPath(['step_mother'], { targetPerson: female }), 'mẹ kế');
assert.strictEqual(describeRelationshipPath(['child'], { targetPerson: male }), 'con trai');
assert.strictEqual(describeRelationshipPath(['child'], { targetPerson: female }), 'con gái');
assert.strictEqual(describeRelationshipPath(['child'], { targetPerson: unknown }), 'con trai/con gái');
assert.strictEqual(describeRelationshipPath(['spouse'], { targetPerson: male }), 'chồng');
assert.strictEqual(describeRelationshipPath(['spouse'], { targetPerson: female }), 'vợ');
assert.strictEqual(describeRelationshipPath(['spouse'], { targetPerson: unknown }), 'chồng/vợ');
assert.strictEqual(describeRelationshipPath(['older_sibling'], { targetPerson: male }), 'anh trai');
assert.strictEqual(describeRelationshipPath(['older_sibling'], { targetPerson: female }), 'chị gái');
assert.strictEqual(describeRelationshipPath(['older_sibling'], { targetPerson: unknown }), 'anh trai/chị gái');
assert.strictEqual(describeRelationshipPath(['father', 'older_brother', 'son'], { targetPerson: unknown }), 'anh em họ/chị em họ');

const uncleRule = matchVietnameseKinshipRule(['father', 'younger_brother'], { targetPerson: male });
assert.strictEqual(uncleRule.id, 'paternal_younger_uncle');
assert.strictEqual(uncleRule.category, 'uncle_aunt');
assert.strictEqual(uncleRule.label, 'chú');

console.log('chatbot.kinship.test.js passed');
