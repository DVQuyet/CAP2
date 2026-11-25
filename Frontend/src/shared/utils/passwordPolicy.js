// Quy tắc mật khẩu tối thiểu (S6), bản phía giao diện để báo lỗi sớm bằng i18n.
// Backend kiểm lại ở Backend/src/shared/validation/passwordPolicy.js; đổi một bên thì đổi cả bên kia.
// Chỉ dùng khi tạo/đổi/đặt lại mật khẩu, không dùng ở form đăng nhập.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const LETTER_RE = /\p{L}/u;
const DIGIT_RE = /\p{Nd}/u;

const fold = (text) => String(text ?? "").normalize("NFC").trim().toLowerCase();

function identityValues({ email, username } = {}) {
  const values = new Set();
  const mail = fold(email);
  if (mail) {
    values.add(mail);
    const local = mail.split("@")[0];
    if (local) values.add(local);
  }
  const user = fold(username);
  if (user) values.add(user);
  return values;
}

// Mã lý do: too_short | too_long | needs_letter_and_digit | same_as_identity, hoặc null nếu đạt.
export function passwordPolicyIssue(password, identity = {}) {
  const text = typeof password === "string" ? password : String(password ?? "");
  const length = [...text].length;
  if (length < PASSWORD_MIN_LENGTH) return "too_short";
  if (length > PASSWORD_MAX_LENGTH) return "too_long";
  if (!LETTER_RE.test(text) || !DIGIT_RE.test(text)) return "needs_letter_and_digit";
  if (identityValues(identity).has(fold(text))) return "same_as_identity";
  return null;
}

// Câu lỗi đã dịch (khóa shared.passwordPolicy.*), hoặc null nếu mật khẩu đạt.
export function passwordPolicyMessage(t, password, identity) {
  const issue = passwordPolicyIssue(password, identity);
  if (!issue) return null;
  return t(`shared.passwordPolicy.${issue}`, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
}

// Cho form xử lý lỗi bằng try/catch: ném Error mang câu đã dịch nếu mật khẩu không đạt.
export function assertPasswordPolicy(t, password, identity) {
  const message = passwordPolicyMessage(t, password, identity);
  if (message) throw new Error(message);
}
