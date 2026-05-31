const BROTHER = ['older_brother', 'younger_brother'];
const SISTER = ['older_sister', 'younger_sister'];
const OLDER_BROTHER = ['older_brother'];
const YOUNGER_BROTHER = ['younger_brother'];
const OLDER_SISTER = ['older_sister'];
const ANY_SIBLING = { normalize: 'sibling' };
const ANY_CHILD = { anyChild: true };
const ANY_PARENT = { parent: true };

const gendered = (male, female, unknown) => ({ male, female, unknown });

const VIETNAMESE_KINSHIP_RULES = [
    { id: 'self', priority: 1000, pattern: [], label: 'chính bạn', category: 'self' },

    { id: 'father', priority: 950, pattern: ['father'], label: 'cha', category: 'ancestor' },
    { id: 'mother', priority: 950, pattern: ['mother'], label: 'mẹ', category: 'ancestor' },
    { id: 'parent_unknown', priority: 940, pattern: ['parent'], label: gendered('cha', 'mẹ'), category: 'ancestor' },
    { id: 'spouse', priority: 940, pattern: ['spouse'], label: gendered('chồng', 'vợ'), category: 'affinal' },

    { id: 'son', priority: 940, pattern: ['son'], label: 'con trai', category: 'descendant' },
    { id: 'daughter', priority: 940, pattern: ['daughter'], label: 'con gái', category: 'descendant' },
    { id: 'child_unknown', priority: 930, pattern: ['child'], label: gendered('con trai', 'con gái'), category: 'descendant' },
    { id: 'adopted_child', priority: 930, pattern: [['adopted_son', 'adopted_daughter', 'adopted_child']], label: 'con nuôi', category: 'descendant' },
    { id: 'step_child', priority: 930, pattern: [['step_son', 'step_daughter', 'step_child']], label: 'con riêng', category: 'descendant' },

    { id: 'older_brother', priority: 930, pattern: ['older_brother'], label: 'anh trai', category: 'sibling' },
    { id: 'younger_brother', priority: 930, pattern: ['younger_brother'], label: 'em trai', category: 'sibling' },
    { id: 'older_sister', priority: 930, pattern: ['older_sister'], label: 'chị gái', category: 'sibling' },
    { id: 'younger_sister', priority: 930, pattern: ['younger_sister'], label: 'em gái', category: 'sibling' },
    { id: 'older_sibling_unknown', priority: 920, pattern: ['older_sibling'], label: gendered('anh trai', 'chị gái'), category: 'sibling' },
    { id: 'younger_sibling_unknown', priority: 920, pattern: ['younger_sibling'], label: gendered('em trai', 'em gái'), category: 'sibling' },
    {
        id: 'half_sibling',
        priority: 920,
        pattern: ['half_sibling'],
        label: gendered('anh/em trai cùng cha hoặc cùng mẹ', 'chị/em gái cùng cha hoặc cùng mẹ'),
        category: 'sibling',
    },

    { id: 'paternal_grandfather', priority: 920, pattern: ['father', 'father'], label: 'ông nội', category: 'ancestor' },
    { id: 'paternal_grandmother', priority: 920, pattern: ['father', 'mother'], label: 'bà nội', category: 'ancestor' },
    { id: 'maternal_grandfather', priority: 920, pattern: ['mother', 'father'], label: 'ông ngoại', category: 'ancestor' },
    { id: 'maternal_grandmother', priority: 920, pattern: ['mother', 'mother'], label: 'bà ngoại', category: 'ancestor' },
    {
        id: 'grandparent_unknown',
        priority: 850,
        pattern: [ANY_PARENT, ANY_PARENT],
        label: gendered('ông', 'bà'),
        category: 'ancestor',
    },

    { id: 'paternal_older_uncle', priority: 910, pattern: ['father', OLDER_BROTHER], label: 'bác', category: 'uncle_aunt' },
    { id: 'paternal_younger_uncle', priority: 910, pattern: ['father', YOUNGER_BROTHER], label: 'chú', category: 'uncle_aunt' },
    { id: 'paternal_aunt', priority: 910, pattern: ['father', SISTER], label: 'cô', category: 'uncle_aunt' },
    { id: 'maternal_uncle_older', priority: 910, pattern: ['mother', OLDER_BROTHER], label: 'bác', category: 'uncle_aunt' },
    { id: 'maternal_uncle_younger', priority: 910, pattern: ['mother', YOUNGER_BROTHER], label: 'cậu', category: 'uncle_aunt' },
    { id: 'maternal_aunt', priority: 910, pattern: ['mother', SISTER], label: 'dì', category: 'uncle_aunt' },

    { id: 'paternal_younger_uncle_wife', priority: 905, pattern: ['father', YOUNGER_BROTHER, 'spouse'], label: 'thím', category: 'affinal' },
    { id: 'maternal_uncle_wife', priority: 905, pattern: ['mother', BROTHER, 'spouse'], label: 'mợ', category: 'affinal' },
    { id: 'aunt_husband', priority: 905, pattern: [ANY_PARENT, SISTER, 'spouse'], label: 'dượng', category: 'affinal' },
    {
        id: 'older_uncle_spouse_unknown_side',
        priority: 800,
        pattern: [ANY_PARENT, OLDER_BROTHER, 'spouse'],
        label: gendered('bác trai', 'bác gái'),
        category: 'affinal',
    },

    { id: 'older_brother_spouse', priority: 900, pattern: ['older_brother', 'spouse'], label: 'chị dâu', category: 'affinal' },
    { id: 'older_sister_spouse', priority: 900, pattern: ['older_sister', 'spouse'], label: 'anh rể', category: 'affinal' },
    {
        id: 'younger_sibling_spouse',
        priority: 895,
        pattern: [['younger_brother', 'younger_sister'], 'spouse'],
        label: gendered('em rể', 'em dâu'),
        category: 'affinal',
    },
    {
        id: 'sibling_spouse_unknown',
        priority: 800,
        pattern: [ANY_SIBLING, 'spouse'],
        label: gendered('anh/chị/em rể', 'anh/chị/em dâu'),
        category: 'affinal',
    },

    {
        id: 'nibling',
        priority: 890,
        pattern: [ANY_SIBLING, ANY_CHILD],
        label: gendered('cháu trai', 'cháu gái'),
        category: 'descendant',
    },
    {
        id: 'first_cousin',
        priority: 890,
        pattern: [ANY_PARENT, ANY_SIBLING, ANY_CHILD],
        label: gendered('anh em họ', 'chị em họ'),
        category: 'cousin',
    },
    {
        id: 'maternal_parent_cousin',
        priority: 880,
        pattern: ['mother', ANY_PARENT, ANY_SIBLING, ANY_CHILD],
        label: gendered('cậu họ', 'dì họ'),
        category: 'cousin',
    },
    {
        id: 'paternal_parent_cousin',
        priority: 870,
        pattern: ['father', ANY_PARENT, ANY_SIBLING, ANY_CHILD],
        label: gendered('chú họ', 'cô họ/o họ'),
        category: 'cousin',
    },
];

module.exports = {
    VIETNAMESE_KINSHIP_RULES,
};
