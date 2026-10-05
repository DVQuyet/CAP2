// Các cột dùng chung khi trả dữ liệu cây gia phả cho frontend.
const TREE_PERSON_EXTRA_COLUMNS = `
    p.birth_date_precision,
    p.birth_calendar,
    p.death_date_precision,
    p.death_calendar,
    p.death_anniversary_lunar,
    p.source_type,
    p.source_note`;

const TREE_FAMILY_COLUMNS = `
    id, clan_id, father_id, mother_id, marriage_date, marriage_date_precision,
    relationship_status, ended_at, ended_at_precision, relation_note,
    union_type, wife_rank, husband_rank, source_type, source_note, visibility`;

const TREE_CHILD_COLUMNS = 'c.family_id, c.person_id, c.sort_order, c.child_type, c.is_primary_lineage';

module.exports = {
    TREE_PERSON_EXTRA_COLUMNS,
    TREE_FAMILY_COLUMNS,
    TREE_CHILD_COLUMNS,
};
