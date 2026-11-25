const { toPositiveId, queryOptional } = require('./chatbotUtils');

// Q-2: mọi vai trò chỉ hỏi từ hồ sơ của chính mình trong dòng họ đang xem.
async function resolveViewerPersonId(accountId, personId, clanId, requestedId) {
    accountId = toPositiveId(accountId);
    clanId = toPositiveId(clanId);
    if (!accountId || !clanId) return null;

    const primaryId = toPositiveId(personId);
    const requested = toPositiveId(requestedId);
    const [primary] = primaryId ? await queryOptional(
        'SELECT id FROM people WHERE id = ? AND clan_id = ? LIMIT 1', [primaryId, clanId]
    ) : [];
    if (primary && (!requested || requested === primaryId)) return primaryId;

    const selfLinks = await queryOptional(`
        SELECT ap.person_id FROM account_people ap
        JOIN people p ON p.id = ap.person_id AND p.clan_id = ap.clan_id
        WHERE ap.account_id = ? AND ap.clan_id = ? AND ap.role = 'self'
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
