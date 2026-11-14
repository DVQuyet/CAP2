// Từ thường gặp trong câu hỏi gia phả (ngoài từ xưng hô), viết bằng chữ có dấu.
// Dùng để sửa chữ gõ sai thanh hoặc sót dấu: "giổ" -> "giỗ", "cũa" -> "của", "noi" -> "nội".

// Từ mà trợ lý hiểu. Chữ gõ sai chỉ được sửa VỀ một trong các từ này (hoặc một từ xưng hô).
const QUESTION_WORDS = [
    // tự xưng, sở hữu, nối
    'tôi', 'mình', 'tui', 'tớ', 'của', 'là', 'và', 'với', 'thì', 'trong', 'ở',
    // từ hỏi
    'ai', 'gì', 'nào', 'đâu', 'mấy', 'bao', 'nhiêu', 'không', 'chưa', 'sao',
    // thông tin người
    'tên', 'sinh', 'mất', 'năm', 'ngày', 'tháng', 'tuổi', 'quê', 'sống', 'còn', 'đã', 'có', 'người', 'những', 'gồm', 'gọi',
    // sự kiện
    'giỗ', 'lễ', 'họp', 'lịch', 'nhắc', 'sắp',
    // gia phả
    'họ', 'đời', 'thế', 'hệ', 'nhánh', 'gia', 'phả', 'dòng', 'tổ', 'thủy',
    // từ ghép với xưng hô và thứ bậc
    'nội', 'ngoại', 'trai', 'gái', 'ruột', 'nuôi', 'dâu', 'rể', 'cả', 'út', 'trưởng', 'thứ',
];

// Từ có thật khác, chỉ khác một từ ở trên (hoặc một từ xưng hô) ở thanh điệu.
// Gõ đúng một trong các từ này thì giữ nguyên, không "sửa" thành từ hiểu được.
const KEEP_WORDS = [
    'lá', 'lạ', 'não', 'náo', 'nhưng', 'nhiều', 'nằm', 'nắm',
    'bộ', 'bồ', 'bổ', 'vỡ', 'vở', 'chống', 'tối', 'tội', 'tồi', 'ống',
    'chủ', 'cầu', 'cấu', 'dị', 'mở', 'mỡ', 'mờ', 'cũ', 'củ', 'cú', 'ký', 'kỳ', 'kỷ',
    'nối', 'nổi', 'nồi', 'ngoài', 'ngoái', 'trái', 'trại', 'ánh', 'ảnh', 'chỉ', 'chí',
    'đợi', 'mầy', 'báo', 'bảo', 'bão', 'đầu', 'đấu', 'đậu', 'khí', 'vá', 'vả', 'vạ', 'vời',
    'đá', 'đà', 'chứa', 'chừa', 'thử', 'thư', 'cá', 'cà', 'trường', 'dấu', 'dầu', 'rễ', 'mật', 'ái',
    'cổ', 'cỗ', 'ổng', 'nôi', 'lê', 'bá', 'bả', 'má', 'mà', 'mả', 'thầy', 'sơ',
];

// Từ không dấu có nghĩa riêng và hay gặp: trong câu có dấu vẫn giữ nguyên, không thêm dấu.
const KEEP_PLAIN_WORDS = ['nam', 'sau', 'hai', 'ba', 'tu', 'bay', 'tam', 'sang', 'ban', 'cho', 'thu'];

// Từ đứng trước tên người ("chú Nam", "bà Hoa"): khi chữ đứng trước một tên viết hoa bị sót dấu thì chỉ xét các từ này.
const NAME_TITLES = ['ông', 'bà', 'cụ', 'bác', 'chú', 'cô', 'cậu', 'dì', 'mợ', 'thím', 'dượng', 'anh', 'chị', 'em', 'cháu'];

module.exports = { QUESTION_WORDS, KEEP_WORDS, KEEP_PLAIN_WORDS, NAME_TITLES };
