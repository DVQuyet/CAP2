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
// Vai vế: con nhà bác (anh của cha) là anh họ, con nhà chú là em họ.
assert.strictEqual(describeRelationshipPath(['father', 'older_brother', 'son'], { targetPerson: male }), 'anh họ');
assert.strictEqual(describeRelationshipPath(['father', 'younger_brother', 'daughter'], { targetPerson: female }), 'em họ');
assert.strictEqual(describeRelationshipPath(['mother', 'older_sister', 'daughter'], { targetPerson: female }), 'chị họ');
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
assert.strictEqual(describeRelationshipPath(['father', 'older_brother', 'son'], { targetPerson: unknown }), 'anh/chị họ');

// Nhà chồng/nhà vợ, dâu rể, quan hệ kế, anh chị em của ông bà.
assert.strictEqual(describeRelationshipPath(['spouse', 'father'], { sourcePerson: female, targetPerson: male }), 'bố chồng');
assert.strictEqual(describeRelationshipPath(['spouse', 'mother'], { sourcePerson: male, targetPerson: female }), 'mẹ vợ');
assert.strictEqual(describeRelationshipPath(['spouse', 'younger_sister'], { sourcePerson: female, targetPerson: female }), 'em chồng');
assert.strictEqual(describeRelationshipPath(['spouse', 'older_brother'], { sourcePerson: male, targetPerson: male }), 'anh vợ');
assert.strictEqual(describeRelationshipPath(['son', 'spouse'], { targetPerson: female }), 'con dâu');
assert.strictEqual(describeRelationshipPath(['daughter', 'spouse'], { targetPerson: male }), 'con rể');
assert.strictEqual(describeRelationshipPath(['father', 'spouse'], { targetPerson: female }), 'mẹ kế');
assert.strictEqual(describeRelationshipPath(['mother', 'spouse'], { targetPerson: male }), 'cha dượng');
assert.strictEqual(describeRelationshipPath(['spouse', 'son'], { sourcePerson: male, targetPerson: male }), 'con riêng của vợ');
assert.strictEqual(describeRelationshipPath(['father', 'father', 'younger_brother'], { targetPerson: male }), 'ông chú');
assert.strictEqual(describeRelationshipPath(['father', 'mother', 'older_sister'], { targetPerson: female }), 'bà dì');
assert.strictEqual(describeRelationshipPath(['spouse', 'older_brother', 'spouse'], { sourcePerson: female, targetPerson: female }), 'chị em dâu');
assert.strictEqual(describeRelationshipPath(['father', 'younger_brother', 'daughter', 'spouse'], { targetPerson: male }), 'em rể họ');

const uncleRule = matchVietnameseKinshipRule(['father', 'younger_brother'], { targetPerson: male });
assert.strictEqual(uncleRule.id, 'paternal_younger_uncle');
assert.strictEqual(uncleRule.category, 'uncle_aunt');
assert.strictEqual(uncleRule.label, 'chú');

console.log('chatbot.kinship.test.js passed');
