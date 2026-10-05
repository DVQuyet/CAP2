// Kiểm tra toàn cây, sửa đời hàng loạt, chính sách gia phả của dòng họ, lịch sử xác nhận và tra xưng hô.
const { db, parseNullableId } = require('../manager/common.service');
const { resolveManagedClanId } = require('../manager/managerClan.service');
const core = require('./core');
const { ensureGenealogySchema } = require('./genealogySchema.service');
const { getClanGenealogyPolicy, saveClanGenealogyPolicy } = require('./genealogyPolicy.service');
const {
    RelationDraft,
    loadClanRows,
    publicIssue,
    withRelationTransaction,
} = require('./relationCommand.service');
const { emitTreeUpdated } = require('../../socket/treeRealtime');

const resolveClan = async (req, res) => {
    const clanId = await resolveManagedClanId(req, { ...(req.query || {}), ...(req.body || {}) });
    if (clanId == null) {
        res.status(404).json({ success: false, message: 'Không xác định được dòng họ cần quản lý' });
        return null;
    }
    return clanId;
};

const loadConfirmedIssueKeys = async (clanId) => {
    const [rows] = await db.query(
        'SELECT DISTINCT issue_key FROM genealogy_relation_overrides WHERE clan_id = ?',
        [clanId]
    );
    return new Set(rows.map((row) => row.issue_key));
};

// Kiểm tra toàn bộ gia phả: lỗi, vấn đề trái luật (đánh dấu đã xác nhận nếu có lưu vết), cảnh báo, gợi ý sửa đời.
const auditFamilyTree = async (req, res) => {
    try {
        const clanId = await resolveClan(req, res);
        if (clanId == null) return undefined;
        await ensureGenealogySchema();
        const [rows, policy, confirmedKeys] = await Promise.all([
            loadClanRows(db, clanId),
            getClanGenealogyPolicy(clanId),
            loadConfirmedIssueKeys(clanId),
        ]);
        const graph = core.buildKinshipGraph(rows);
        const issues = core.validateGraph(graph, { policy }).map((issue) => ({
            ...publicIssue(issue),
            confirmed: confirmedKeys.has(core.issueKey(issue)),
        }));
        const generationChanges = core.generationChanges(graph, policy).map((change) => ({
            person_id: change.personId,
            from: change.from,
            to: change.to,
        }));
        const lineage = core.computeLineage(graph, policy);
        const summary = issues.reduce((acc, issue) => {
            acc[issue.severity] = (acc[issue.severity] || 0) + 1;
            return acc;
        }, {});
        return res.json({
            success: true,
            policy,
            summary: { ...summary, generation_mismatches: generationChanges.length, people: graph.people.size, families: graph.families.size },
            issues,
            generation_changes: generationChanges,
            lineage: [...lineage.entries()].map(([personId, info]) => ({ person_id: personId, role: info.role, in_clan: info.inClan })),
        });
    } catch (error) {
        console.error('auditFamilyTree error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi kiểm tra gia phả' });
    }
};

// Sửa đời của toàn cây theo cha mẹ (dữ liệu cũ nhập tay lệch đời).
const recomputeGenerations = async (req, res) => {
    try {
        if (![1, 2].includes(Number(req.user?.role_id))) {
            return res.status(403).json({ success: false, message: 'Chỉ quản lý dòng họ được sửa đời hàng loạt.' });
        }
        const clanId = await resolveClan(req, res);
        if (clanId == null) return undefined;
        const changes = await withRelationTransaction(null, async (conn) => {
            const draft = await RelationDraft.load(conn, clanId);
            const graph = draft.graph();
            const list = core.generationChanges(graph, draft.policy);
            await draft.commit({ evaluation: { generationChanges: list, confirm: [] }, accountId: req.user?.id, action: 'recompute_generations' });
            return list;
        });
        if (changes.length) emitTreeUpdated(req, clanId, { action: 'generations_recomputed' });
        return res.json({
            success: true,
            message: changes.length ? `Đã cập nhật đời cho ${changes.length} người.` : 'Đời của các thành viên đã khớp với quan hệ cha mẹ.',
            generation_changes: changes.map((change) => ({ person_id: change.personId, from: change.from, to: change.to })),
        });
    } catch (error) {
        console.error('recomputeGenerations error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật đời' });
    }
};

const getGenealogyPolicy = async (req, res) => {
    try {
        const clanId = await resolveClan(req, res);
        if (clanId == null) return undefined;
        return res.json({ success: true, policy: await getClanGenealogyPolicy(clanId), defaults: core.DEFAULT_POLICY });
    } catch (error) {
        console.error('getGenealogyPolicy error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi đọc cài đặt gia phả' });
    }
};

const updateGenealogyPolicy = async (req, res) => {
    try {
        if (![1, 2].includes(Number(req.user?.role_id))) {
            return res.status(403).json({ success: false, message: 'Chỉ quản lý dòng họ được đổi cài đặt gia phả.' });
        }
        const clanId = await resolveClan(req, res);
        if (clanId == null) return undefined;
        const policy = await saveClanGenealogyPolicy(clanId, req.body?.policy || req.body || {});
        emitTreeUpdated(req, clanId, { action: 'genealogy_policy_updated' });
        return res.json({ success: true, policy, message: 'Đã lưu cài đặt gia phả.' });
    } catch (error) {
        console.error('updateGenealogyPolicy error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi lưu cài đặt gia phả' });
    }
};

const listRelationOverrides = async (req, res) => {
    try {
        const clanId = await resolveClan(req, res);
        if (clanId == null) return undefined;
        await ensureGenealogySchema();
        const limit = Math.min(500, Math.max(1, Number(req.query?.limit) || 200));
        const [rows] = await db.query(
            `
            SELECT o.id, o.action, o.issue_code, o.severity, o.message, o.person_ids, o.family_id, o.reason,
                   o.source_type, o.source_note, o.created_at, o.account_id,
                   COALESCE(p.display_name, a.email) AS confirmed_by
            FROM genealogy_relation_overrides o
            LEFT JOIN accounts a ON a.id = o.account_id
            LEFT JOIN people p ON p.id = a.person_id
            WHERE o.clan_id = ?
            ORDER BY o.created_at DESC, o.id DESC
            LIMIT ?
            `,
            [clanId, limit]
        );
        return res.json({
            success: true,
            overrides: rows.map((row) => ({
                ...row,
                person_ids: typeof row.person_ids === 'string' ? JSON.parse(row.person_ids || '[]') : row.person_ids || [],
            })),
        });
    } catch (error) {
        console.error('listRelationOverrides error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi đọc lịch sử xác nhận' });
    }
};

// Xưng hô giữa hai người: "target là gì của source".
const describeKinshipBetween = async (req, res) => {
    try {
        const clanId = await resolveClan(req, res);
        if (clanId == null) return undefined;
        const sourceId = parseNullableId(req.query?.source_person_id ?? req.query?.from);
        const targetId = parseNullableId(req.query?.target_person_id ?? req.query?.to);
        if (!sourceId || !targetId) {
            return res.status(400).json({ success: false, message: 'Cần source_person_id và target_person_id.' });
        }
        const [rows, policy] = await Promise.all([loadClanRows(db, clanId), getClanGenealogyPolicy(clanId)]);
        const graph = core.buildKinshipGraph(rows);
        if (!graph.hasPerson(sourceId) || !graph.hasPerson(targetId)) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên trong dòng họ.' });
        }
        const region = ['north', 'central', 'south'].includes(req.query?.region) ? req.query.region : policy.region;
        const forward = core.describeKinship(graph, sourceId, targetId, { region });
        const backward = core.describeKinship(graph, targetId, sourceId, { region });
        return res.json({
            success: true,
            region,
            source_person_id: sourceId,
            target_person_id: targetId,
            relation: forward,
            reverse_relation: backward,
        });
    } catch (error) {
        console.error('describeKinshipBetween error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi tra cứu xưng hô' });
    }
};

module.exports = {
    auditFamilyTree,
    recomputeGenerations,
    getGenealogyPolicy,
    updateGenealogyPolicy,
    listRelationOverrides,
    describeKinshipBetween,
};
