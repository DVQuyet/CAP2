// Từ xưng hô họ hàng, viết MỘT lần bằng chữ có dấu. Dạng không dấu và bảng từ mơ hồ do lexicon/index.js tự sinh.
//   key        nhãn chuẩn, trùng nhãn do describeKinship (genealogy/core) sinh ra
//   forms      các cách viết có dấu của cùng một xưng hô
//   noPlain    cách viết KHÔNG được nhận ở câu không dấu, vì dạng không dấu trùng một từ thường gặp khác
//              (thầy/thay, má/ma, chị/chi nhánh, o, sơ/so...)
//   labels     nhãn quan hệ được chấp nhận (mặc định là chính key)
//   qualifiers từ đi sau nhãn mà vẫn tính là khớp ("chú họ" khớp "chú")
//   categories khớp theo nhóm quan hệ thay vì theo nhãn
const KINSHIP_TERMS = [
    // Cha mẹ
    { key: 'cha', forms: ['cha', 'bố', 'tía', 'thầy', 'cha ruột', 'bố ruột'], noPlain: ['thầy'] },
    { key: 'mẹ', forms: ['mẹ', 'má', 'bầm', 'mạ', 'mẹ ruột'], noPlain: ['má', 'mạ'] },
    { key: 'cha mẹ', forms: ['cha mẹ', 'bố mẹ', 'ba mẹ', 'ba má'], labels: ['cha', 'mẹ'] },
    // Ông bà, cụ, kỵ
    { key: 'ông nội', forms: ['ông nội'] },
    { key: 'bà nội', forms: ['bà nội'] },
    { key: 'ông ngoại', forms: ['ông ngoại'] },
    { key: 'bà ngoại', forms: ['bà ngoại'] },
    { key: 'ông bà', forms: ['ông bà', 'ông bà nội ngoại'], noPlain: ['ông bà nội ngoại'], labels: ['ông nội', 'bà nội', 'ông ngoại', 'bà ngoại'] },
    { key: 'ông bà nội', forms: ['ông bà nội'], labels: ['ông nội', 'bà nội'] },
    { key: 'ông bà ngoại', forms: ['ông bà ngoại'], labels: ['ông ngoại', 'bà ngoại'] },
    { key: 'ông', forms: ['ông'], qualifiers: ['nội', 'ngoại'] },
    { key: 'bà', forms: ['bà'], qualifiers: ['nội', 'ngoại'] },
    { key: 'cụ nội', forms: ['cụ nội', 'cố nội', 'cụ ông nội', 'cụ bà nội'], noPlain: ['cụ ông nội', 'cụ bà nội'] },
    { key: 'cụ ngoại', forms: ['cụ ngoại', 'cố ngoại'] },
    { key: 'cụ', forms: ['cụ', 'cố', 'cụ ông', 'cụ bà', 'cụ tổ'], noPlain: ['cụ tổ'], qualifiers: ['nội', 'ngoại'] },
    { key: 'kỵ', forms: ['kỵ', 'kị', 'sơ'], noPlain: ['kị', 'sơ'], qualifiers: ['nội', 'ngoại'] },
    // Anh chị em của ông bà
    { key: 'ông chú', forms: ['ông chú'], qualifiers: ['họ'] },
    { key: 'ông bác', forms: ['ông bác'], qualifiers: ['họ'] },
    { key: 'ông cậu', forms: ['ông cậu'], qualifiers: ['họ'] },
    { key: 'bà cô', forms: ['bà cô'], qualifiers: ['họ'] },
    { key: 'bà bác', forms: ['bà bác'], qualifiers: ['họ'] },
    { key: 'bà dì', forms: ['bà dì'], qualifiers: ['họ'] },
    { key: 'ông trẻ', forms: ['ông trẻ'], labels: ['ông chú', 'ông cậu'] },
    { key: 'bà trẻ', forms: ['bà trẻ'], labels: ['bà cô', 'bà dì'] },
    // Anh chị em của cha mẹ và vợ/chồng họ
    { key: 'bác', forms: ['bác', 'bác ruột', 'bác trai', 'bác gái'], qualifiers: ['họ', 'trai', 'gái', 'ruột'] },
    { key: 'chú', forms: ['chú', 'chú ruột'], qualifiers: ['họ', 'ruột'] },
    { key: 'cô', forms: ['cô', 'cô ruột', 'o'], noPlain: ['o'], qualifiers: ['họ', 'ruột'] },
    { key: 'cậu', forms: ['cậu', 'cậu ruột'], qualifiers: ['họ', 'ruột'] },
    { key: 'dì', forms: ['dì', 'dì ruột'], qualifiers: ['họ', 'ruột'] },
    { key: 'thím', forms: ['thím'], qualifiers: ['họ'] },
    { key: 'mợ', forms: ['mợ'], qualifiers: ['họ'] },
    { key: 'dượng', forms: ['dượng'], qualifiers: ['họ'] },
    { key: 'chú họ', forms: ['chú họ'] },
    { key: 'bác họ', forms: ['bác họ'] },
    { key: 'cô họ', forms: ['cô họ'] },
    { key: 'cậu họ', forms: ['cậu họ'] },
    { key: 'dì họ', forms: ['dì họ'] },
    // Anh chị em
    { key: 'anh chị em', forms: ['anh chị em', 'anh chị em ruột', 'anh em', 'chị em', 'anh em ruột'], categories: ['sibling'] },
    { key: 'anh trai', forms: ['anh trai', 'anh ruột'] },
    { key: 'chị gái', forms: ['chị gái', 'chị ruột'] },
    { key: 'em trai', forms: ['em trai'] },
    { key: 'em gái', forms: ['em gái'] },
    { key: 'anh', forms: ['anh'], qualifiers: ['trai', 'ruột'] },
    { key: 'chị', forms: ['chị'], noPlain: ['chị'], qualifiers: ['gái', 'ruột'] },
    { key: 'em', forms: ['em', 'em ruột'], qualifiers: ['trai', 'gái', 'ruột'] },
    // Anh chị em họ
    { key: 'anh chị em họ', forms: ['anh chị em họ', 'anh em họ', 'chị em họ'], categories: ['cousin'] },
    { key: 'anh họ', forms: ['anh họ'] },
    { key: 'chị họ', forms: ['chị họ'] },
    { key: 'em họ', forms: ['em họ'] },
    // Vợ chồng, con cháu
    { key: 'vợ', forms: ['vợ'] },
    { key: 'chồng', forms: ['chồng'] },
    { key: 'con', forms: ['con', 'con cái', 'con ruột'], qualifiers: ['trai', 'gái', 'nuôi', 'ruột'] },
    { key: 'con trai', forms: ['con trai'] },
    { key: 'con gái', forms: ['con gái'] },
    { key: 'con dâu', forms: ['con dâu'] },
    { key: 'con rể', forms: ['con rể'] },
    { key: 'cháu', forms: ['cháu'], qualifiers: ['nội', 'ngoại', 'họ', 'trai', 'gái'] },
    { key: 'cháu nội', forms: ['cháu nội'] },
    { key: 'cháu ngoại', forms: ['cháu ngoại'] },
    { key: 'chắt', forms: ['chắt'], qualifiers: ['nội', 'ngoại', 'họ'] },
    // Dâu rể, nhà chồng/vợ
    { key: 'chị dâu', forms: ['chị dâu'] },
    { key: 'em dâu', forms: ['em dâu'] },
    { key: 'anh rể', forms: ['anh rể'] },
    { key: 'em rể', forms: ['em rể'] },
    { key: 'cha chồng', forms: ['cha chồng', 'bố chồng'], labels: ['cha chồng', 'bố chồng'] },
    { key: 'mẹ chồng', forms: ['mẹ chồng'] },
    { key: 'cha vợ', forms: ['cha vợ', 'bố vợ'], labels: ['cha vợ', 'bố vợ'] },
    { key: 'mẹ vợ', forms: ['mẹ vợ'] },
];

// Cách đọc thêm của một dạng không dấu mà bảng trên không suy ra được: "ba" còn là cách gọi cha (miền Nam, miền Trung).
// Ở câu có dấu "ba" do typingNormalizer xử lý (ba tôi = cha, cô ba = thứ bậc), nên không đưa vào forms.
const EXTRA_PLAIN_READINGS = [['ba', 'cha']];

module.exports = { KINSHIP_TERMS, EXTRA_PLAIN_READINGS };
