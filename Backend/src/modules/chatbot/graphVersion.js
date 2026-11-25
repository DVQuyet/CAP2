// Phiên bản đồ thị dòng họ cho bộ nhớ đệm của trợ lý (relationshipEngine.loadClanGraph).
// Trước đây trigger MySQL tăng family_graph_versions mỗi khi sửa families/children; TiDB không có trigger nên số đó
// đứng yên và trợ lý trả lời theo cây cũ tới hết TTL. Nay phiên bản là "dấu vân tay" tính từ chính dữ liệu cây:
// mọi đường ghi (controller, lệnh trợ lý, nhập GEDCOM, SQL chạy tay) đều làm số đổi, không cần sửa từng chỗ ghi.
// Vẫn cộng family_graph_versions để bumpGraphVersion() và trigger trên MySQL (nếu có) còn tác dụng.
const db = require('../../config/db');

const MEMO_MS = Number(process.env.CHATBOT_GRAPH_VERSION_MEMO_MS || 2000);
const memo = new Map();

// Cột ảnh hưởng tới suy luận quan hệ / câu trả lời. Thêm cột mới mà trợ lý dùng thì thêm vào đây.
const FINGERPRINT_SQL = `
SELECT CRC32(CONCAT_WS(':',
  (SELECT CONCAT(COUNT(*), '-', COALESCE(SUM(CRC32(CONCAT_WS('|', p.id, p.display_name, p.first_name, p.middle_name, p.surname,
      p.gender, p.generation, p.branch, p.birth_date, p.death_date, p.is_living, p.display_order))), 0))
     FROM people p WHERE p.clan_id = ?),
  (SELECT CONCAT(COUNT(*), '-', COALESCE(SUM(CRC32(CONCAT_WS('|', f.id, f.father_id, f.mother_id, f.marriage_date,
      f.relationship_status, f.ended_at, f.union_type, f.wife_rank, f.husband_rank, f.visibility))), 0))
     FROM families f WHERE f.clan_id = ?),
  (SELECT CONCAT(COUNT(*), '-', COALESCE(SUM(CRC32(CONCAT_WS('|', c.id, c.family_id, c.person_id, c.sort_order,
      c.child_type, c.is_primary_lineage))), 0))
     FROM children c JOIN families cf ON cf.id = c.family_id WHERE cf.clan_id = ?),
  (SELECT CONCAT(COUNT(*), '-', COALESCE(SUM(am.id), 0)) FROM archived_members am WHERE am.clan_id = ?),
  (SELECT COALESCE(MAX(v.graph_version), 1) FROM family_graph_versions v WHERE v.clan_id = ?)
)) + 1 AS graph_version`;

const now = () => Date.now();

async function computeGraphVersion(clanId, query = db.query.bind(db)) {
    try {
        const [rows] = await query(FINGERPRINT_SQL, [clanId, clanId, clanId, clanId, clanId]);
        return Number(rows?.[0]?.graph_version || 1);
    } catch (error) {
        // DB cũ thiếu cột/bảng (vd child_type): không chặn trợ lý, chỉ mất khả năng nhận biết thay đổi trước TTL.
        if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return 1;
        throw error;
    }
}

// Nhớ tạm vài giây: một câu hỏi gọi loadClanGraph nhiều lần, không cần tính lại mỗi lần.
async function getGraphVersion(clanId, { query } = {}) {
    const hit = memo.get(clanId);
    if (hit && hit.expiresAt > now()) return hit.version;
    const version = await computeGraphVersion(clanId, query);
    memo.set(clanId, { version, expiresAt: now() + MEMO_MS });
    return version;
}

function forgetGraphVersion(clanId) {
    if (clanId === undefined) memo.clear();
    else memo.delete(clanId);
}

module.exports = { FINGERPRINT_SQL, computeGraphVersion, getGraphVersion, forgetGraphVersion };
