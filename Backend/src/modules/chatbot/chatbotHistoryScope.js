// Tin cũ trong một hội thoại chỉ được đọc lại (ngữ cảnh LLM, trí nhớ, đặt tiêu đề) khi cùng tài khoản,
// cùng dòng họ và cùng hồ sơ đang hỏi, giống /history. Hội thoại gắn theo tài khoản nên nếu chỉ lọc
// conversation_id thì tin của dòng họ cũ (kể cả liên hệ của người ở họ đó) sẽ đi sang họ mới.
function chatbotHistoryScope(columns, { conversationId, clanId, accountId, currentMemberId } = {}) {
    const where = ['conversation_id = ?'];
    const params = [conversationId];
    if (columns.has('clan_id')) {
        where.push('clan_id = ?');
        params.push(clanId ?? null);
    }
    if (columns.has('account_id')) {
        where.push('account_id = ?');
        params.push(accountId ?? null);
    }
    if (columns.has('current_member_id')) {
        where.push(currentMemberId ? 'current_member_id = ?' : 'current_member_id IS NULL');
        if (currentMemberId) params.push(currentMemberId);
    }
    if (columns.has('hidden_at')) where.push('hidden_at IS NULL');
    return { where: where.join(' AND '), params };
}

module.exports = { chatbotHistoryScope };
