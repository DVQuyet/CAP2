const assert = require('assert');
const {
    analyzeRelationshipPath,
    buildGenealogyLabel,
    buildAddressLabel,
    interpretKinshipPath,
} = require('../src/modules/chatbot/kinshipPathInterpreter');
const { describeRelationshipPath } = require('../src/modules/chatbot/vietnameseKinshipRules');

const femaleDistantPath = ['father', 'father', 'father', 'parent', 'older_sibling', 'child', 'child', 'child'];
const maleDistantPath = ['father', 'father', 'parent', 'younger_sibling', 'child', 'child', 'child'];
const cousinPath = ['father', 'older_brother', 'child'];
const spousePath = ['father', 'father', 'sibling', 'child', 'spouse'];

const sourcePerson = { gender: 1, full_name: 'Đinh Viết Quyết' };
const femaleTarget = { gender: 2, full_name: 'ĐINH THỊ DỊU' };
const maleTarget = { gender: 1, full_name: 'ĐINH VĂN NAM' };
const unknownTarget = {};

const analysis = analyzeRelationshipPath(femaleDistantPath, { sourcePerson, targetPerson: femaleTarget });
assert.strictEqual(analysis.relativeGeneration, -1);
assert.strictEqual(analysis.upDepth, 4);
assert.strictEqual(analysis.downDepth, 3);
assert.strictEqual(analysis.hasSiblingBranch, true);
assert.strictEqual(analysis.hasSpouse, false);
assert.strictEqual(analysis.side, 'paternal');
assert.strictEqual(analysis.branchDepth, 'ky');
assert.strictEqual(analysis.isDistant, true);

const femaleInterpreted = interpretKinshipPath({
    path: femaleDistantPath,
    sourcePerson,
    targetPerson: femaleTarget,
});
assert.strictEqual(femaleInterpreted.genealogyLabel, 'chắt của anh/chị em cụ/kỵ của bạn');
assert.strictEqual(femaleInterpreted.addressLabel, 'cô họ xa');
assert.strictEqual(femaleInterpreted.shortLabel, 'cô họ');
assert.strictEqual(femaleInterpreted.socialLabel, 'cô Dịu');
assert.strictEqual(femaleInterpreted.relativeGeneration, -1);

const maleInterpreted = interpretKinshipPath({
    path: maleDistantPath,
    sourcePerson,
    targetPerson: maleTarget,
});
assert.strictEqual(maleInterpreted.genealogyLabel, 'chắt của em ông/bà cố của bạn');
assert.strictEqual(maleInterpreted.addressLabel, 'chú họ xa');
assert.strictEqual(maleInterpreted.shortLabel, 'chú họ');

const sameGeneration = interpretKinshipPath({
    path: cousinPath,
    sourcePerson,
    targetPerson: unknownTarget,
});
assert.strictEqual(sameGeneration.addressLabel, 'anh/chị/em họ');

const childGeneration = interpretKinshipPath({
    path: ['older_brother', 'child'],
    sourcePerson,
    targetPerson: maleTarget,
});
assert.strictEqual(childGeneration.addressLabel, 'cháu họ');

const grandChildGeneration = interpretKinshipPath({
    path: ['older_brother', 'child', 'child'],
    sourcePerson,
    targetPerson: maleTarget,
});
assert.strictEqual(grandChildGeneration.addressLabel, 'chắt họ');

const centralSpouse = interpretKinshipPath({
    path: spousePath,
    sourcePerson,
    targetPerson: femaleTarget,
    region: 'central',
});
assert.strictEqual(centralSpouse.genealogyLabel, 'vợ/chồng của họ hàng đời trên');
assert.strictEqual(centralSpouse.addressLabel, 'mự');
assert.strictEqual(centralSpouse.shortLabel, 'mự');
assert.strictEqual(centralSpouse.regionLabel, 'mự');

assert.strictEqual(interpretKinshipPath({
    path: femaleDistantPath,
    sourcePerson,
    targetPerson: femaleTarget,
    mode: 'genealogy',
}).label, 'chắt của anh/chị em cụ/kỵ của bạn');

assert.strictEqual(interpretKinshipPath({
    path: femaleDistantPath,
    sourcePerson,
    targetPerson: femaleTarget,
    mode: 'address',
}).label, 'cô họ xa');

assert.strictEqual(interpretKinshipPath({
    path: femaleDistantPath,
    sourcePerson,
    targetPerson: femaleTarget,
    mode: 'short',
}).label, 'cô họ');

assert.strictEqual(buildGenealogyLabel(analysis, { path: femaleDistantPath }), 'chắt của anh/chị em cụ/kỵ của bạn');
assert.strictEqual(buildAddressLabel(analysis, { path: femaleDistantPath, targetPerson: femaleTarget }), 'cô họ xa');

assert.strictEqual(describeRelationshipPath(femaleDistantPath, { sourcePerson, targetPerson: femaleTarget }), 'cô họ xa');
assert.strictEqual(describeRelationshipPath(femaleDistantPath, { sourcePerson, targetPerson: femaleTarget, mode: 'genealogy' }), 'chắt của anh/chị em cụ/kỵ của bạn');
assert.strictEqual(describeRelationshipPath(['son', 'son'], { targetPerson: maleTarget }), 'cháu trai nội');

console.log('chatbot.kinshipPathInterpreter.test.js passed');
