// Gợi ý người trùng lặp (chỉ đọc) và "bỏ qua cặp này". Không tự gộp hồ sơ.
const { db } = require('../manager/common.service');
const { resolveManagedClanId } = require('../manager/managerClan.service');
const { loadClanRows } = require('./relationCommand.service');
const dup = require('./duplicates.service');

const listDuplicateCandidates = async (req, res) => {
    try {
        const clanId = await resolveManagedClanId(req, { ...(req.query || {}) });
        if (clanId == null) {
            return res.status(404).json({ success: false, message: 'Không xác định được dòng họ cần quản lý' });
        }
        const rows = await loadClanRows(db, clanId);
        const dismissed = await dup.loadDismissed(clanId);
        const found = dup.findDuplicateCandidates({ people: rows.people, families: rows.families, children: rows.children }, { dismissed });
        const page = dup.paginate(found, { limit: req.query?.limit, offset: req.query?.offset });
        return res.json({ success: true, clan_id: clanId, ...page });
    } catch (error) {
        console.error('listDuplicateCandidates error:', error);
        return res.status(500).json({ success: false, message: 'Không thể tìm người trùng lặp' });
    }
};

const dismissDuplicate = async (req, res) => {
    try {
        const a = Number(req.body?.person_a_id);
        const b = Number(req.body?.person_b_id);
        if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a <= 0 || b <= 0 || a === b) {
            return res.status(400).json({ success: false, message: 'Cặp người không hợp lệ' });
        }
        const clanId = await resolveManagedClanId(req, { ...(req.query || {}), ...(req.body || {}) });
        if (clanId == null) {
            return res.status(404).json({ success: false, message: 'Không xác định được dòng họ cần quản lý' });
        }
        const [people] = await db.query('SELECT id FROM people WHERE id IN (?, ?) AND clan_id = ?', [a, b, clanId]);
        if (people.length !== 2) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy cả hai người trong dòng họ' });
        }
        const params = [clanId, Math.min(a, b), Math.max(a, b), req.user?.id || null];
        const sql = 'INSERT IGNORE INTO genealogy_duplicate_dismissals (clan_id, person_a_id, person_b_id, account_id) VALUES (?, ?, ?, ?)';
        try {
            await db.query(sql, params);
        } catch (error) {
            if (!dup.isMissingTable(error)) throw error;
            await dup.ensureDuplicateDismissalsTable();
            await db.query(sql, params);
        }
        return res.json({ success: true, key: `${params[1]}-${params[2]}` });
    } catch (error) {
        console.error('dismissDuplicate error:', error);
        return res.status(500).json({ success: false, message: 'Không thể lưu "không trùng"' });
    }
};

module.exports = { listDuplicateCandidates, dismissDuplicate };
