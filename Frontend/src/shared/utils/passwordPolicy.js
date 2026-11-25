// Quy tắc mật khẩu tối thiểu (S6), bản phía giao diện để báo lỗi sớm bằng i18n.
// Backend kiểm lại ở Backend/src/shared/validation/passwordPolicy.js; đổi một bên thì đổi cả bên kia.
// Chỉ dùng khi tạo/đổi/đặt lại mật khẩu, không dùng ở form đăng nhập.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt chỉ dùng 72 byte đầu
const LETTER_RE = /\p{L}/u;
const DIGIT_RE = /\p{Nd}/u;
const REASONS = new Set(["too_short", "too_long", "needs_letter_and_digit", "same_as_identity"]);

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
  if (new TextEncoder().encode(text).length > PASSWORD_MAX_BYTES) return "too_long";
  if (!LETTER_RE.test(text) || !DIGIT_RE.test(text)) return "needs_letter_and_digit";
  if (identityValues(identity).has(fold(text))) return "same_as_identity";
  return null;
}

// Câu lỗi đã dịch (khóa shared.passwordPolicy.*), hoặc null nếu mật khẩu đạt.
export function passwordPolicyMessage(t, password, identity) {
  const issue = passwordPolicyIssue(password, identity);
  if (!issue) return null;
  return t(`shared.passwordPolicy.${issue}`, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_BYTES });
}

// Lỗi API WEAK_PASSWORD (backend gửi code + reason) -> câu đã dịch; lỗi khác -> null.
// Đọc ở error.code/error.reason hoặc error.data (lớp api/* gắn nguyên thân phản hồi vào error.data).
export function weakPasswordErrorMessage(t, error) {
  const code = error?.code || error?.data?.code;
  const reason = error?.reason || error?.data?.reason;
  if (code !== "WEAK_PASSWORD" || !REASONS.has(reason)) return null;
  return t(`shared.passwordPolicy.${reason}`, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_BYTES });
}

