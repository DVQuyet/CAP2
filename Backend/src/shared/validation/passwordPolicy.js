// Quy tắc mật khẩu tối thiểu (S6). Mọi đường tạo/đổi/đặt lại mật khẩu gọi weakPasswordBody() trước khi băm.
// Đăng nhập KHÔNG gọi hàm này: tài khoản cũ có mật khẩu yếu vẫn đăng nhập được.
// Frontend có bản sao cùng quy tắc ở Frontend/src/shared/utils/passwordPolicy.js; đổi một bên thì đổi cả bên kia.

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const LETTER_RE = /\p{L}/u;
const DIGIT_RE = /\p{Nd}/u;

const MESSAGES = {
    too_short: `Mật khẩu cần tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`,
    too_long: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.`,
    needs_letter_and_digit: 'Mật khẩu cần có cả chữ và số.',
    same_as_identity: 'Mật khẩu không được trùng với email hoặc tên đăng nhập.',
};

const fold = (text) => String(text ?? '').normalize('NFC').trim().toLowerCase();

// Các chuỗi định danh mật khẩu không được trùng: email đầy đủ, phần trước @, tên đăng nhập (nếu có).
function identityValues({ email, username } = {}) {
    const values = new Set();
    const mail = fold(email);
    if (mail) {
        values.add(mail);
        const local = mail.split('@')[0];
        if (local) values.add(local);
    }
    const user = fold(username);
    if (user) values.add(user);
    return values;
}

// Trả về mã lý do (too_short | too_long | needs_letter_and_digit | same_as_identity) hoặc null nếu đạt.
function passwordPolicyIssue(password, identity = {}) {
    const text = typeof password === 'string' ? password : String(password ?? '');
    const length = [...text].length;
    if (length < PASSWORD_MIN_LENGTH) return 'too_short';
    if (length > PASSWORD_MAX_LENGTH) return 'too_long';
    if (!LETTER_RE.test(text) || !DIGIT_RE.test(text)) return 'needs_letter_and_digit';
    if (identityValues(identity).has(fold(text))) return 'same_as_identity';
    return null;
}

function passwordPolicyMessage(password, identity) {
    const issue = passwordPolicyIssue(password, identity);
    return issue ? MESSAGES[issue] : null;
}

// Thân phản hồi 400 khi mật khẩu không đạt, hoặc null. Dùng: const weak = weakPasswordBody(pw, { email }); if (weak) return res.status(400).json(weak);
function weakPasswordBody(password, identity) {
    const issue = passwordPolicyIssue(password, identity);
    if (!issue) return null;
    return { success: false, message: MESSAGES[issue], code: 'WEAK_PASSWORD', reason: issue };
}

// Cho controller: gửi 400 và trả true nếu mật khẩu không đạt. Dùng: if (rejectWeakPassword(res, pw, { email })) return;
function rejectWeakPassword(res, password, identity) {
    const body = weakPasswordBody(password, identity);
    if (!body) return false;
    res.status(400).json(body);
    return true;
}

// Dạng lỗi có status cho các hàm service ném lỗi thay vì trả res.
function assertStrongPassword(password, identity) {
    const body = weakPasswordBody(password, identity);
    if (body) throw Object.assign(new Error(body.message), { status: 400, code: body.code, reason: body.reason });
}

module.exports = {
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    PASSWORD_POLICY_MESSAGES: MESSAGES,
    passwordPolicyIssue,
    passwordPolicyMessage,
    weakPasswordBody,
    rejectWeakPassword,
    assertStrongPassword,
};
