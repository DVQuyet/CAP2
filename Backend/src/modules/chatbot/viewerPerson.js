// Q-2: trợ lý chỉ trả lời "với tư cách" người của chính tài khoản đang đăng nhập.
// currentMemberId do client gửi chỉ được nhận khi là:
//   - req.user.person_id (hồ sơ đã gắn chính thức với tài khoản), hoặc
//   - một người tài khoản này đã chọn làm "góc nhìn" và được lưu ở account_people (cùng dòng họ).
// Mọi vai trò (member, manager, admin) đều theo quy tắc này (chốt 15/11/2026).
// Id không hợp lệ thì bỏ qua và dùng người của chính tài khoản; không báo lỗi để client cũ vẫn chạy.
const { toPositiveId, queryOptional } = require('./chatbotUtils');

async function loadLinkedPersonIds(accountId, clanId) {
    if (!accountId || !clanId) return [];
    const rows = await queryOptional(
        `
        SELECT person_id
        FROM account_people
        WHERE account_id = ? AND clan_id = ?
        ORDER BY is_default DESC, id DESC
        `,
        [accountId, clanId]
    );
    return rows.map((row) => toPositiveId(row.person_id)).filter(Boolean);
}

async function resolveViewerPersonId(req, clanId, requestedId) {
    const accountId = toPositiveId(req.user?.id || req.user?.account_id);
    const ownPersonId = toPositiveId(req.user?.person_id);
    const requested = toPositiveId(requestedId);
    if (requested && requested === ownPersonId) return requested;

    const linked = await loadLinkedPersonIds(accountId, toPositiveId(clanId));
    if (requested && linked.includes(requested)) return requested;
    return ownPersonId || linked[0] || null;
}

module.exports = { resolveViewerPersonId };
