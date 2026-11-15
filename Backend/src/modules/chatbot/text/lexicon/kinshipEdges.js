// Cạnh đồ thị ứng với từng xưng hô (key ở lexicon/kinship.js), đi từ người gốc ra.
// Chỉ là đường dự phòng: câu trả lời chính tra theo nhãn của describeKinship (relationshipEngine.resolveKinshipChain).
// Vì vậy chỉ ghi cạnh khi nó ĐÚNG với mọi trường hợp của từ đó; từ không ghi ở đây (dượng, ông chú, bà cô...)
// không có đường dự phòng, tránh trả nhầm người gần nghĩa.
// Từ dùng chung cho nhiều vai (bác, cô, cậu, dì) dùng cạnh chung để ra mọi người khớp rồi hỏi lại.
const { stripAll } = require('../vietnameseText');

const KEY_EDGES = {
    'cha': ['father'],
    'mẹ': ['mother'],
    'cha mẹ': ['parent'],
    'vợ': ['spouse'],
    'chồng': ['spouse'],
    'ông nội': ['father', 'father'],
    'bà nội': ['father', 'mother'],
    'ông ngoại': ['mother', 'father'],
    'bà ngoại': ['mother', 'mother'],
    'ông bà nội': ['father', 'parent'],
    'ông bà ngoại': ['mother', 'parent'],
    'ông bà': ['parent', 'parent'],
    'ông': ['parent', 'father'],
    'bà': ['parent', 'mother'],
    'cụ nội': ['father', 'parent', 'parent'],
    'cụ ngoại': ['mother', 'parent', 'parent'],
    'cụ': ['parent', 'parent', 'parent'],
    'kỵ': ['parent', 'parent', 'parent', 'parent'],
    'anh trai': ['older_brother'],
    'chị gái': ['older_sister'],
    'em trai': ['younger_brother'],
    'em gái': ['younger_sister'],
    'anh': ['older_brother'],
    'chị': ['older_sister'],
    'em': ['younger_sibling'],
    'anh chị em': ['sibling'],
    // Anh/chị/em của cha hoặc mẹ và vợ/chồng họ.
    'bác': ['parent', 'older_sibling'],
    'chú': ['father', 'younger_brother'],
    'cô': ['father', 'sister'],
    'cậu': ['mother', 'brother'],
    'dì': ['mother', 'sister'],
    'thím': ['father', 'younger_brother', 'spouse'],
    'mợ': ['mother', 'brother', 'spouse'],
    // Con nhà bác là anh/chị họ, con nhà chú/cô/cậu/dì là em họ: theo vai, không xét tuổi.
    'anh họ': ['parent', 'older_sibling', 'son'],
    'chị họ': ['parent', 'older_sibling', 'daughter'],
    'em họ': ['parent', 'younger_sibling', 'child'],
    'anh chị em họ': ['parent', 'sibling', 'child'],
    // Nhà chồng, nhà vợ, dâu rể.
    'cha chồng': ['spouse', 'father'],
    'mẹ chồng': ['spouse', 'mother'],
    'cha vợ': ['spouse', 'father'],
    'mẹ vợ': ['spouse', 'mother'],
    'con dâu': ['son', 'spouse'],
    'con rể': ['daughter', 'spouse'],
    'chị dâu': ['older_brother', 'spouse'],
    'em dâu': ['younger_brother', 'spouse'],
    'anh rể': ['older_sister', 'spouse'],
    'em rể': ['younger_sister', 'spouse'],
    // Con cháu.
    'con trai': ['son'],
    'con gái': ['daughter'],
    'con': ['child'],
    'cháu nội': ['son', 'child'],
    'cháu ngoại': ['daughter', 'child'],
    'cháu': ['child', 'child'],
    'chắt': ['child', 'child', 'child'],
};

// Cách viết mang thêm giới tính so với key chung.
const FORM_EDGES = new Map([
    ['bác trai', ['parent', 'older_brother']],
    ['bác gái', ['parent', 'older_sister']],
    ['cụ ông', ['parent', 'parent', 'father']],
    ['cụ bà', ['parent', 'parent', 'mother']],
]);
const PLAIN_FORM_EDGES = new Map([...FORM_EDGES].map(([form, edges]) => [stripAll(form), edges]));

// form: cụm đã gõ (có dấu hoặc không dấu). Trả null khi từ không có đường dự phòng.
function edgesFor(key, form = '') {
    return FORM_EDGES.get(form) || PLAIN_FORM_EDGES.get(form) || KEY_EDGES[key] || null;
}

module.exports = { edgesFor };
