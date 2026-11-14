// Trường thông tin của một người mà câu hỏi nhắc tới (năm sinh, quê, số điện thoại...) và cách tách tên khỏi câu.
// Bảng PERSON_FIELD_* chuyển nguyên văn từ intentParserService.js.

const PERSON_FIELD_PATTERNS = [
    ['contact_info', /\b(so dien thoai|dien thoai|sdt|email|lien lac|zalo)\b/],
    ['death_info', /\b(mat nam nao|mat nam|nam mat|ngay mat|mat ngay|mat khi nao|qua doi|tu tran|mat luc nao)\b/],
    ['alive_info', /\b(con song khong|con song|con khong|da mat chua|mat chua|con tai the)\b/],
    ['age_info', /\b(bao nhieu tuoi|may tuoi|tuoi|tho bao nhieu)\b/],
    ['birth_info', /\b(sinh nam nao|sinh nam|nam sinh|ngay sinh|sinh ngay|sinh khi nao|sinh luc nao)\b/],
    ['hometown_info', /\b(que quan|que o dau|que)\b/],
    ['address_info', /\b(dia chi|song o dau|o dau)\b/],
    ['bio_info', /\b(tieu su|cuoc doi|la nguoi the nao|lam nghe gi)\b/],
];

// Từ hỏi trường thông tin (có dấu và không dấu), để cắt khỏi câu khi tách tên.
const PERSON_FIELD_WORDS = '(?:thọ bao nhiêu tuổi|tho bao nhieu tuoi|thọ bao nhiêu|tho bao nhieu|số điện thoại|so dien thoai|điện thoại|dien thoai|sđt|sdt|email|liên lạc|lien lac|zalo|sinh năm nào|sinh nam nao|sinh năm|sinh nam|năm sinh|nam sinh|ngày sinh|ngay sinh|sinh ngày|sinh ngay|mất năm nào|mat nam nao|mất năm|mat nam|năm mất|nam mat|ngày mất|ngay mat|mất khi nào|mat khi nao|qua đời|qua doi|còn sống không|con song khong|còn sống|con song|đã mất chưa|da mat chua|bao nhiêu tuổi|bao nhieu tuoi|mấy tuổi|may tuoi|quê quán|que quan|quê ở đâu|que o dau|quê|que|địa chỉ|dia chi|sống ở đâu|song o dau|tiểu sử|tieu su|cuộc đời|cuoc doi|ghi chú|ghi chu|thông tin|thong tin)';

// "Trần Văn Nam sinh năm nào", "tran thi nam mat nam nao": chữ "Nam/Năm" đứng ngay trước "sinh/mất + năm/ngày"
// là tên người, không phải từ "năm" trong "năm sinh". Trả phần tên, hoặc null nếu câu không có dạng này.
const NAME_THEN_FIELD = /^(.*\s(?:năm|nam))\s+(?:sinh|mất|mat)\s+(?:năm|nam|ngày|ngay|khi|lúc|luc)(?:\s|$)/i;

function nameBeforeField(text) {
    const match = String(text || '').match(NAME_THEN_FIELD);
    return match ? match[1].trim() : null;
}

module.exports = { PERSON_FIELD_PATTERNS, PERSON_FIELD_WORDS, nameBeforeField };
