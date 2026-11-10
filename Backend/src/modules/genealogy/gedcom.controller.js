// Xuất GEDCOM của dòng họ do người quản lý phụ trách (admin chọn ?clan_id=). Chỉ đọc.
const { db } = require('../manager/common.service');
const { resolveManagedClanId } = require('../manager/managerClan.service');
const { loadClanRows } = require('./relationCommand.service');
const { buildGedcom } = require('./gedcom.service');
const { buildContentDisposition } = require('../../shared/utils/contentDisposition');

const exportGedcom = async (req, res) => {
    try {
        const clanId = await resolveManagedClanId(req, { ...(req.query || {}) });
        if (clanId == null) {
            return res.status(404).json({ success: false, message: 'Không xác định được dòng họ cần xuất' });
        }
        // Quản lý/admin được xem cả quan hệ visibility='managers' nên giữ nguyên toàn bộ families.
        const rows = await loadClanRows(db, clanId);
        const [extraRows] = await db.query('SELECT id, hometown, bio FROM people WHERE clan_id = ?', [clanId]);
        const extra = new Map(extraRows.map((row) => [Number(row.id), row]));
        const [clanRows] = await db.query('SELECT clan_name FROM clans WHERE id = ? LIMIT 1', [clanId]);
        const clanName = clanRows[0]?.clan_name || `clan-${clanId}`;

        const people = rows.people.map((person) => ({
            ...person,
            hometown: extra.get(Number(person.id))?.hometown ?? null,
            bio: extra.get(Number(person.id))?.bio ?? null,
        }));
        const text = buildGedcom({ clanName, people, families: rows.families, children: rows.children });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', buildContentDisposition('attachment', `gia-pha-${clanName}.ged`));
        res.setHeader('Cache-Control', 'no-store');
        return res.send(text);
    } catch (error) {
        console.error('exportGedcom error:', error);
        return res.status(500).json({ success: false, message: 'Không thể xuất file GEDCOM' });
    }
};

module.exports = { exportGedcom };
