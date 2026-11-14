// Bộ câu đo "tiếng Việt có dấu" cho scripts/chatbot-e2e-check.js --suite accent.
// Dòng họ: datasetAccent.js (họ Trần). Người hỏi: Trần Văn Minh.
// Mỗi dòng: [nhóm, câu hỏi, đáp án phải có, ghi chú, đáp án KHÔNG được có].
// Câu "không dấu mơ hồ": đáp án đúng là HỎI LẠI kèm đủ các cách hiểu; trả lời thẳng một cách hiểu là sai.

const nfd = (text) => text.normalize('NFD');
const ASK_AGAIN = /Bạn muốn hỏi|người khớp|người tên/;

const PAIRS = 'Cặp chỉ khác dấu';
const NAMES = 'Tên trùng khi bỏ dấu';
const MARKS = 'Dấu rời và kiểu đặt dấu';
const TONES = 'Sai thanh';
const PARTIAL = 'Thiếu dấu vài chữ';
const PLAIN = 'Không dấu mơ hồ';
const ACCESS = 'Quyền hạn';
const CONTACT = /0900000008|nam@example.test|Số 8 đường Mẫu/;

const rows = [
    // ---- bà / ba, cô / cố, bà cô / bà cố: cùng dạng không dấu, khác người.
    [PAIRS, 'Bà tôi là ai?', /Nguyễn Thị Hoa[\s\S]*Vũ Thị Sáu/, 'bà = bà nội và bà ngoại', /Trần Văn Hùng/],
    [PAIRS, 'Ba tôi là ai?', /Trần Văn Hùng/, 'ba = cha', /Nguyễn Thị Hoa|Vũ Thị Sáu/],
    [PAIRS, 'Bà của tôi tên gì?', /Nguyễn Thị Hoa[\s\S]*Vũ Thị Sáu/, '', /Trần Văn Hùng/],
    [PAIRS, 'Ba của tôi tên gì?', /Trần Văn Hùng/, '', /Nguyễn Thị Hoa|Vũ Thị Sáu/],
    [PAIRS, 'Cô tôi là ai?', /Trần Thị Út/, 'cô = em gái của cha', /Trần Văn Cả|Lê Thị Lễ/],
    [PAIRS, 'Cố tôi là ai?', /Trần Văn Cả[\s\S]*Lê Thị Lễ/, 'cố = cụ', /Trần Thị Út/],
    [PAIRS, 'Cô tôi tên gì?', /Trần Thị Út/, '', /Trần Văn Cả|Lê Thị Lễ|Không tìm thấy/],
    [PAIRS, 'Cố tôi tên gì?', /Trần Văn Cả[\s\S]*Lê Thị Lễ/, '', /Trần Thị Út|Không tìm thấy/],
    [PAIRS, 'Cô của tôi là ai?', /Trần Thị Út/, '', /Trần Văn Cả|Lê Thị Lễ/],
    [PAIRS, 'Cố của tôi là ai?', /Trần Văn Cả[\s\S]*Lê Thị Lễ/, '', /Trần Thị Út/],
    [PAIRS, 'Bà cô tôi là ai?', /Trần Thị Năm/, 'bà cô = em gái ông nội', /Trần Văn Cả|Lê Thị Lễ/],
    [PAIRS, 'Bà cố tôi là ai?', /Lê Thị Lễ/, 'bà cố = cụ bà', /Trần Thị Năm/],
    [PAIRS, 'Chú tôi là ai?', /Trần Văn Nam/, '', ASK_AGAIN],
    [PAIRS, 'Dì tôi là ai?', /Phạm Thị Thủy/, '', ASK_AGAIN],
    [PAIRS, 'Mợ tôi là ai?', /Lý Thị Mơ/, 'mợ (xưng hô) khác Mơ (tên)', ASK_AGAIN],
    [PAIRS, 'Cậu tôi là ai?', /Phạm Văn Cường/, '', ASK_AGAIN],
    [PAIRS, 'Cụ tôi là ai?', /Trần Văn Cả[\s\S]*Lê Thị Lễ/, '', /Trần Thị Út/],
    [PAIRS, 'Thím tôi là ai?', /Đỗ Thị Hóa/, '', ASK_AGAIN],
    [PAIRS, 'Bà nội tôi là ai?', /Nguyễn Thị Hoa/, '', /Vũ Thị Sáu|Trần Văn Hùng/],
    [PAIRS, 'Ba mẹ tôi là ai?', /Trần Văn Hùng[\s\S]*Phạm Thị Hòa/, 'ba mẹ = cha và mẹ', /Phạm Văn Dũng/],

    // ---- Hoa / Hòa / Hóa, Hùng / Hưng, Nam / Năm: gõ có dấu thì phải chọn đúng một người.
    [NAMES, 'Hòa sinh năm nào?', /Phạm Thị Hòa sinh ngày 07\/07\/1960/, '', /Nguyễn Thị Hoa|Đỗ Thị Hóa|khớp/],
    [NAMES, 'Hoa sinh năm nào?', /Nguyễn Thị Hoa sinh ngày 04\/04\/1934/, 'gõ "Hoa" không thanh trong câu có dấu = đúng tên Hoa', /Phạm Thị Hòa|Đỗ Thị Hóa|khớp/],
    [NAMES, 'Hóa sinh năm nào?', /Đỗ Thị Hóa sinh ngày 10\/10\/1966/, '', /Nguyễn Thị Hoa|Phạm Thị Hòa|khớp/],
    [NAMES, 'Bà Hoa là ai?', /Nguyễn Thị Hoa/, '', /Phạm Thị Hòa|Đỗ Thị Hóa|khớp/],
    [NAMES, 'Hưng là ai?', /Trần Văn Hưng/, '', /Trần Văn Hùng:|khớp|ngoài phạm vi/],
    [NAMES, 'Hùng là ai?', /Trần Văn Hùng/, '', /Trần Văn Hưng:|khớp|ngoài phạm vi/],
    [NAMES, 'Trần Văn Hưng sinh năm nào?', /Trần Văn Hưng sinh ngày 03\/03\/1930/, '', /Trần Văn Hùng|khớp/],
    [NAMES, 'Trần Văn Hùng sinh năm nào?', /Trần Văn Hùng sinh ngày 06\/06\/1958/, '', /Trần Văn Hưng|khớp/],
    [NAMES, 'Trần Văn Nam sinh năm nào?', /Trần Văn Nam sinh ngày 09\/09\/1963/, '', /Trần Thị Năm|Trần Văn Cả|khớp/],
    [NAMES, 'Trần Thị Năm sinh năm nào?', /Trần Thị Năm sinh ngày 08\/08\/1938/, '', /Trần Thị Út|Trần Văn Nam|khớp/],
    [NAMES, 'Vợ của Trần Văn Hưng là ai?', /Nguyễn Thị Hoa/, '', /Phạm Thị Hòa|người tên/],
    [NAMES, 'Vợ của Trần Văn Hùng là ai?', /Phạm Thị Hòa/, '', /Nguyễn Thị Hoa|người tên/],
    [NAMES, 'Con của bà Hoa là ai?', /Trần Văn Hùng[\s\S]*Trần Văn Nam[\s\S]*Trần Thị Út/, '', /Trần Văn Minh|Trần Văn Khôi|người tên/],
    [NAMES, 'Vợ của chú Nam là ai?', /Đỗ Thị Hóa/, 'chú Nam: đàn ông tên Nam, không phải bà Năm', /Trần Thị Năm|khớp/],
    [NAMES, 'Bà Lễ là ai?', /Lê Thị Lễ/, 'Lễ (tên) khác Lê (họ)', /khớp/],

    // ---- Cùng một câu, gõ bằng dấu rời (macOS/iOS) hoặc kiểu đặt dấu "oà", "uỷ".
    [MARKS, nfd('Ông nội tôi là ai?'), /Trần Văn Hưng/, 'dấu rời', /Trần Văn Hùng|Phạm Văn Dũng/],
    [MARKS, nfd('Bà tôi là ai?'), /Nguyễn Thị Hoa[\s\S]*Vũ Thị Sáu/, 'dấu rời', /Trần Văn Hùng/],
    [MARKS, nfd('Cố tôi là ai?'), /Trần Văn Cả[\s\S]*Lê Thị Lễ/, 'dấu rời', /Trần Thị Út/],
    [MARKS, nfd('Cô tôi là ai?'), /Trần Thị Út/, 'dấu rời', /Trần Văn Cả|Lê Thị Lễ/],
    [MARKS, nfd('Mợ tôi là ai?'), /Lý Thị Mơ/, 'dấu rời', ASK_AGAIN],
    [MARKS, nfd('Thím tôi là ai?'), /Đỗ Thị Hóa/, 'dấu rời', ASK_AGAIN],
    [MARKS, nfd('Hòa sinh năm nào?'), /Phạm Thị Hòa sinh ngày 07\/07\/1960/, 'dấu rời trong tên', /Nguyễn Thị Hoa|Đỗ Thị Hóa|khớp/],
    [MARKS, 'Hoà sinh năm nào?', /Phạm Thị Hòa sinh ngày 07\/07\/1960/, 'kiểu đặt dấu oà', /Nguyễn Thị Hoa|Đỗ Thị Hóa|khớp/],
    [MARKS, 'Phạm Thị Thuỷ là ai?', /Phạm Thị Thủy/, 'kiểu đặt dấu uỷ', /Không tìm thấy|ngoài phạm vi/],
    [MARKS, 'Dì Thuỷ sinh năm nào?', /Phạm Thị Thủy sinh ngày 17\/07\/1967/, 'kiểu đặt dấu uỷ', /Không tìm thấy|ngoài phạm vi/],

    // ---- Gõ sai thanh (hỏi/ngã, đặt nhầm dấu) ở từ thường; tên người vẫn gõ đúng.
    [TONES, 'Giổ ông nội ngày nào?', /Ngày giỗ của Trần Văn Hưng là ngày 13\/4 âm lịch/, 'giổ = giỗ', /chưa nắm được/],
    [TONES, 'Ngày giổ của ông nội tôi là ngày nào?', /Ngày giỗ của Trần Văn Hưng là ngày 13\/4 âm lịch/, '', /chưa nắm được/],
    [TONES, 'Bố cũa tôi là ai?', /Trần Văn Hùng/, 'cũa = của', /chưa nắm được|Không tìm thấy/],
    [TONES, 'Vợ cũa chú Nam là ai?', /Đỗ Thị Hóa/, '', /Trần Thị Năm|chưa nắm được/],
    [TONES, 'Con của ông Hưng gồm nhửng ai?', /Trần Văn Hùng, Trần Văn Nam, Trần Thị Út/, 'nhửng = những', /chưa nắm được|người tên/],
    [TONES, 'Anh chị em cũa tôi gồm nhửng ai?', /Trần Thị Quý/, '', /chưa nắm được/],
    [TONES, 'Mẹ tôi sinh năm nảo?', /Phạm Thị Hòa sinh ngày 07\/07\/1960/, 'nảo = nào', /chưa nắm được/],
    [TONES, 'Bà ngọai tôi là ai?', /Vũ Thị Sáu/, 'đặt dấu nặng nhầm chỗ', /Nguyễn Thị Hoa|chưa nắm được/],
    [TONES, 'Ông ngọai của tôi là ai?', /Phạm Văn Dũng/, '', /Trần Văn Hưng|chưa nắm được/],
    [TONES, 'Em gái tôi tên gỉ?', /Trần Thị Quý/, 'gỉ = gì', /chưa nắm được|Không tìm thấy/],
    [TONES, 'Mẹ tôi tên gí?', /Phạm Thị Hòa/, '', /chưa nắm được|Không tìm thấy/],
    [TONES, 'Chú tôi lả ai?', /Trần Văn Nam/, 'lả = là', /chưa nắm được|Không tìm thấy/],
    [TONES, 'Dì tôi là aỉ?', /Phạm Thị Thủy/, '', /chưa nắm được|Không tìm thấy/],
    [TONES, 'Cậu của tôi tên lả gì?', /Phạm Văn Cường/, '', /chưa nắm được|Không tìm thấy/],
    [TONES, 'Ông nội tôi sinh ngảy nào?', /Trần Văn Hưng sinh ngày 03\/03\/1930/, 'ngảy = ngày', /chưa nắm được/],

    // ---- Câu có dấu nhưng sót dấu ở một hai chữ.
    [PARTIAL, 'Ông noi tôi là ai?', /ông nội của bạn là: Trần Văn Hưng/, 'noi không phải một từ -> nội', /Phạm Văn Dũng/],
    [PARTIAL, 'Bà ngoai tôi là ai?', /Vũ Thị Sáu/, '', /Nguyễn Thị Hoa/],
    [PARTIAL, 'Ông ngoai của tôi là ai?', /Phạm Văn Dũng/, '', /Trần Văn Hưng/],
    [PARTIAL, 'Bà noi của tôi tên gì?', /Nguyễn Thị Hoa/, '', /Vũ Thị Sáu/],
    [PARTIAL, 'Vợ của chu Nam là ai?', /Đỗ Thị Hóa/, 'chu -> chú; Nam viết hoa là tên', /Trần Thị Năm|khớp/],
    [PARTIAL, 'Bố toi là ai?', /Trần Văn Hùng/, '', /chưa nắm được|Không tìm thấy/],
    [PARTIAL, 'Mẹ toi tên gì?', /Phạm Thị Hòa/, '', /chưa nắm được|Không tìm thấy/],
    [PARTIAL, 'Em gai tôi tên gì?', /Trần Thị Quý/, '', /chưa nắm được|Không tìm thấy/],
    [PARTIAL, 'Cậu toi là ai?', /Phạm Văn Cường/, '', /chưa nắm được|Không tìm thấy/],
    [PARTIAL, 'Dì cua tôi là ai?', /Phạm Thị Thủy/, '', /chưa nắm được|Không tìm thấy/],
    [PARTIAL, 'Con cua Trần Văn Nam là ai?', /Trần Văn Khôi/, '', /chưa nắm được|khớp/],
    [PARTIAL, 'Thim tôi là ai?', /Đỗ Thị Hóa/, '', /chưa nắm được|Không tìm thấy/],
    [PARTIAL, 'Chồng của cô Út la ai?', /chưa thấy dữ liệu chồng của Trần Thị Út/, '', /chưa nắm được|Không tìm thấy/],
    [PARTIAL, 'Chú tôi sinh nam nào?', /Trần Văn Nam sinh ngày 09\/09\/1963/, 'nam (không dấu) ở đây là "năm"', /chưa nắm được/],
    [PARTIAL, 'Me tôi là ai?', /Phạm Thị Hòa/, '', /chưa nắm được|Không tìm thấy/],

    // ---- Cả câu không dấu. Nhiều cách hiểu cho người khác nhau thì phải hỏi lại; chỉ một cách hiểu thì trả lời thẳng.
    [PLAIN, 'ba toi la ai', /Bạn muốn hỏi[\s\S]*Trần Văn Hùng[\s\S]*Nguyễn Thị Hoa/, 'ba (cha) hay bà', /Theo dữ liệu gia phả hiện tại/],
    [PLAIN, 'co toi la ai', /^(?=[\s\S]*Bạn muốn hỏi)(?=[\s\S]*Trần Thị Út)(?=[\s\S]*Lê Thị Lễ)/, 'cô hay cố', /Theo dữ liệu gia phả hiện tại/],
    [PLAIN, 'co cua toi ten gi', /^(?=[\s\S]*Bạn muốn hỏi)(?=[\s\S]*Trần Thị Út)(?=[\s\S]*Lê Thị Lễ)/, '', /Theo dữ liệu gia phả hiện tại/],
    [PLAIN, 'ba co toi la ai', /Bạn muốn hỏi[\s\S]*Lê Thị Lễ[\s\S]*Trần Thị Năm/, 'bà cố hay bà cô', /Theo dữ liệu gia phả hiện tại/],
    [PLAIN, 'hoa sinh nam nao', /Nguyễn Thị Hoa[\s\S]*Phạm Thị Hòa[\s\S]*Đỗ Thị Hóa/, 'ba người Hoa / Hòa / Hóa'],
    [PLAIN, 'hung la ai', /Trần Văn Hưng[\s\S]*Trần Văn Hùng/, 'Hưng hay Hùng', /ngoài phạm vi/],
    [PLAIN, 'ba hoa la ai', /Nguyễn Thị Hoa[\s\S]*Phạm Thị Hòa[\s\S]*Đỗ Thị Hóa/, '', /ngoài phạm vi/],
    [PLAIN, 'ong noi toi la ai', /ông nội của bạn là: Trần Văn Hưng/, 'chỉ một cách hiểu', ASK_AGAIN],
    [PLAIN, 'ba noi toi la ai', /bà nội của bạn là: Nguyễn Thị Hoa/, 'chỉ một cách hiểu', ASK_AGAIN],
    [PLAIN, 'me toi ten gi', /Phạm Thị Hòa/, '', ASK_AGAIN],
    [PLAIN, 'chu toi la ai', /Trần Văn Nam/, 'chủ không phải xưng hô', ASK_AGAIN],
    [PLAIN, 'di toi la ai', /Phạm Thị Thủy/, '', ASK_AGAIN],
    [PLAIN, 'cau toi la ai', /Phạm Văn Cường/, '', ASK_AGAIN],
    [PLAIN, 'cu toi la ai', /Trần Văn Cả[\s\S]*Lê Thị Lễ/, '', ASK_AGAIN],
    [PLAIN, 'tran van nam sinh nam nao', /Trần Văn Nam sinh ngày 09\/09\/1963/, 'họ tên đầy đủ chỉ khớp một người', /Trần Thị Năm|Trần Văn Cả|khớp/],

    // ---- Người hỏi là thành viên thường: cách hỏi nào cũng không lộ số điện thoại, email, địa chỉ của người khác.
    [ACCESS, 'Số điện thoại của chú Nam là gì?', /không cung cấp số điện thoại hay email/, '', CONTACT],
    [ACCESS, 'Sđt cũa chu Nam', /không cung cấp số điện thoại hay email/, 'sai thanh và sót dấu vẫn không lộ', CONTACT],
    [ACCESS, 'so dien thoai cua tran van nam', /không cung cấp số điện thoại hay email/, '', CONTACT],
    [ACCESS, 'Email của Trần Văn Nam là gì?', /không cung cấp số điện thoại hay email/, '', CONTACT],
    [ACCESS, 'Nam là ai?', /Trần Văn Nam/, 'tên một chữ: chỉ trả thông tin gia phả', CONTACT],
    [ACCESS, 'Chú tôi là ai?', /Trần Văn Nam/, '', CONTACT],
];

module.exports = rows.map(([group, question, expected, note, forbidden], index) => (
    [group, question, expected, note, forbidden, 'accent', `accent-${index}`]
));
