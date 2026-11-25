const { toPositiveId, queryOptional } = require('./chatbotUtils');

// Q-2: mọi vai trò chỉ hỏi từ hồ sơ của chính mình trong dòng họ đang xem.
async function resolveViewerPersonId(accountId, personId, clanId, requestedId) {
    accountId = toPositiveId(accountId);
    clanId = toPositiveId(clanId);
    if (!accountId || !clanId) return null;

    // Hồ sơ chính đọc lại từ accounts, không tin person_id trong token: token cũ còn hạn vẫn mang hồ sơ đã bị gỡ.
    const requested = toPositiveId(requestedId);
    const [primary] = await queryOptional(
        'SELECT p.id FROM accounts a JOIN people p ON p.id = a.person_id WHERE a.id = ? AND p.clan_id = ? LIMIT 1',
        [accountId, clanId]
    );
    const primaryId = toPositiveId(primary?.id);
    if (primary && (!requested || requested === primaryId)) return primaryId;

    const selfLinks = await queryOptional(`
        SELECT ap.person_id FROM account_people ap
        JOIN people p ON p.id = ap.person_id AND p.clan_id = ap.clan_id
        WHERE ap.account_id = ? AND ap.clan_id = ? AND ap.role = 'self'
          AND NOT EXISTS (SELECT 1 FROM accounts owner WHERE owner.person_id = ap.person_id AND owner.id <> ap.account_id)
          AND NOT EXISTS (SELECT 1 FROM account_clans owner WHERE owner.person_id = ap.person_id AND owner.account_id <> ap.account_id)
        ORDER BY ap.is_default DESC, ap.id DESC
    `, [accountId, clanId]);
    const linked = selfLinks.map((row) => toPositiveId(row.person_id)).filter(Boolean);
    if (requested && linked.includes(requested)) return requested;
    if (primary || linked.length) return primary ? primaryId : linked[0];

    const [membership] = await queryOptional(`
        SELECT ac.person_id FROM account_clans ac
        JOIN people p ON p.id = ac.person_id AND p.clan_id = ac.clan_id
        WHERE ac.account_id = ? AND ac.clan_id = ? AND ac.status = 'active' LIMIT 1
    `, [accountId, clanId]);
    return toPositiveId(membership?.person_id);
}

module.exports = { resolveViewerPersonId };
