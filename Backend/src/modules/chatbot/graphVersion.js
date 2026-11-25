// Phiên bản đồ thị dòng họ cho bộ nhớ đệm của trợ lý (relationshipEngine.loadClanGraph).
// Trước đây trigger MySQL tăng family_graph_versions mỗi khi sửa families/children; TiDB không có trigger nên số đó
// đứng yên và trợ lý trả lời theo cây cũ tới hết TTL. Nay phiên bản là "dấu vân tay" tính từ chính dữ liệu cây:
// mọi đường ghi (controller, lệnh trợ lý, nhập GEDCOM, SQL chạy tay) đều làm số đổi, không cần sửa từng chỗ ghi.
// Vẫn cộng family_graph_versions để bumpGraphVersion() và trigger trên MySQL (nếu có) còn tác dụng.
const db = require('../../config/db');

const MEMO_MS = Number(process.env.CHATBOT_GRAPH_VERSION_MEMO_MS || 2000);
const memo = new Map();

// Cột mà loadClanGraph đọc (people: câu SELECT + HISTORY_COLUMNS của peopleHistoryQuery; families/children: SELECT *).
// Thêm cột mới mà trợ lý dùng thì thêm vào đây. EXTENDED là cột DB cũ có thể chưa có: thiếu thì tính lại không có chúng.
const COLUMNS = {
    people: {
        base: ['id', 'display_name', 'first_name', 'middle_name', 'surname', 'gender', 'generation', 'branch',
            'birth_date', 'death_date', 'is_living', 'display_order'],
        extended: ['birth_date_precision', 'death_date_precision', 'death_anniversary_lunar'],
    },
    families: {
        base: ['id', 'father_id', 'mother_id', 'marriage_date', 'relationship_status', 'ended_at', 'union_type',
            'wife_rank', 'husband_rank', 'visibility'],
        extended: ['relation_note', 'marriage_date_precision', 'ended_at_precision', 'spouse_a_id', 'spouse_b_id'],
    },
    children: {
        base: ['id', 'family_id', 'person_id', 'sort_order', 'child_type', 'is_primary_lineage'],
        extended: ['relationship_note'],
    },
};

// Mỗi cột có chỗ riêng và NULL thành '~' (CONCAT_WS bỏ qua NULL nên (P,NULL) và (NULL,P) từng ra cùng một chuỗi).
// Độ dài đứng trước giá trị nên dấu '|' trong dữ liệu cũng không làm hai bộ giá trị khác nhau trùng chuỗi.
const rowHash = (alias, columns) => `CRC32(CONCAT(${columns
    .map((column) => `COALESCE(CONCAT(CHAR_LENGTH(${alias}.${column}), ':', ${alias}.${column}), '~')`)
    .join(", '|', ")}))`;

const tableHash = (alias, columns, fromWhere) =>
    `(SELECT CONCAT(COUNT(*), '-', COALESCE(SUM(${rowHash(alias, columns)}), 0)) ${fromWhere})`;

function buildFingerprintSql({ extended = true } = {}) {
    const pick = (table) => [...COLUMNS[table].base, ...(extended ? COLUMNS[table].extended : [])];
    return `
SELECT CRC32(CONCAT_WS(':',
  ${tableHash('p', pick('people'), 'FROM people p WHERE p.clan_id = ?')},
  ${tableHash('f', pick('families'), 'FROM families f WHERE f.clan_id = ?')},
  ${tableHash('c', pick('children'), 'FROM children c JOIN families cf ON cf.id = c.family_id WHERE cf.clan_id = ?')},
  (SELECT CONCAT(COUNT(*), '-', COALESCE(SUM(am.id), 0)) FROM archived_members am WHERE am.clan_id = ?),
  (SELECT COALESCE(MAX(v.graph_version), 1) FROM family_graph_versions v WHERE v.clan_id = ?)
)) + 1 AS graph_version`;
}

const FINGERPRINT_SQL = buildFingerprintSql();
const FINGERPRINT_SQL_BASE = buildFingerprintSql({ extended: false });

const now = () => Date.now();

async function computeGraphVersion(clanId, query = db.query.bind(db)) {
    const params = [clanId, clanId, clanId, clanId, clanId];
    for (const sql of [FINGERPRINT_SQL, FINGERPRINT_SQL_BASE]) {
        try {
            const [rows] = await query(sql, params);
            return Number(rows?.[0]?.graph_version || 1);
        } catch (error) {
            if (error.code === 'ER_BAD_FIELD_ERROR') continue; // DB cũ thiếu cột mở rộng: thử bộ cột gốc.
            if (error.code === 'ER_NO_SUCH_TABLE') return 1;
            throw error;
        }
    }
    // Thiếu cả cột gốc: không chặn trợ lý, chỉ mất khả năng nhận biết thay đổi trước TTL.
    return 1;
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

module.exports = {
    COLUMNS, FINGERPRINT_SQL, FINGERPRINT_SQL_BASE, buildFingerprintSql, computeGraphVersion, getGraphVersion, forgetGraphVersion,
};
