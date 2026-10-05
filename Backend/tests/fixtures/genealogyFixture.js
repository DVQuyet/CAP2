// Gia phả mẫu dùng cho test lõi quan hệ. Bao phủ: vợ cả/vợ lẽ, con vợ lẽ, vai vế anh em họ
// (nhánh trên ít tuổi hơn nhánh dưới), dâu/rể, con thừa tự, thông gia, con gái trong họ lấy chồng ngoài.
const MALE = 1;
const FEMALE = 2;

const person = (id, name, gender, generation, birth, extra = {}) => ({
    id,
    display_name: name,
    gender,
    generation,
    birth_date: birth ? `${birth}-01-01` : null,
    birth_date_precision: birth ? 'year' : 'exact',
    is_living: 0,
    ...extra,
});

const people = [
    person(1, 'Cụ Tổ', MALE, 1, 1850),
    person(2, 'Cụ bà cả', FEMALE, 1, 1855),
    person(3, 'Cụ bà hai', FEMALE, 1, 1860),
    person(4, 'Ông Cả', MALE, 2, 1875),
    person(5, 'Bà Cô', FEMALE, 2, 1878),
    person(6, 'Ông Hai', MALE, 2, 1880),
    person(7, 'Ông Ba (con vợ lẽ)', MALE, 2, 1882),
    person(8, 'Bà Cả dâu', FEMALE, 2, 1878),
    person(9, 'Bà Hai dâu', FEMALE, 2, 1882),
    person(10, 'Bác Mười', MALE, 3, 1900),
    person(11, 'Cô Mười Một', FEMALE, 3, 1903),
    person(12, 'Chú Mười Hai', MALE, 3, 1899),
    person(13, 'Cô Mười Ba', FEMALE, 3, 1905),
    person(14, 'Bà Mười Bốn (dâu)', FEMALE, 3, 1902),
    person(15, 'Bà Mười Lăm (dâu)', FEMALE, 3, 1901),
    person(16, 'Anh Mười Sáu', MALE, 4, 1925),
    person(17, 'Anh Mười Bảy', MALE, 4, 1920),
    person(19, 'Ông Mười Chín (rể)', MALE, 3, 1900),
    person(20, 'Cháu ngoại Hai Mươi', MALE, 4, 1930),
    person(21, 'Con thừa tự', MALE, 4, 1928),
    person(22, 'Cha đẻ của con thừa tự', MALE, 3, 1895),
    person(23, 'Mẹ đẻ của con thừa tự', FEMALE, 3, 1897),
    person(24, 'Vợ Mười Bảy', FEMALE, 4, 1922),
    person(25, 'Cha vợ Mười Bảy', MALE, 3, 1890),
];

const families = [
    { id: 101, father_id: 1, mother_id: 2, relationship_status: 'active', union_type: 'marriage', wife_rank: 1 },
    { id: 102, father_id: 1, mother_id: 3, relationship_status: 'active', union_type: 'concubine', wife_rank: 2 },
    { id: 103, father_id: 4, mother_id: 8, relationship_status: 'active' },
    { id: 104, father_id: 6, mother_id: 9, relationship_status: 'active' },
    { id: 105, father_id: 10, mother_id: 14, relationship_status: 'active' },
    { id: 106, father_id: 12, mother_id: 15, relationship_status: 'active' },
    { id: 107, father_id: 19, mother_id: 13, relationship_status: 'active' },
    { id: 108, father_id: 22, mother_id: 23, relationship_status: 'active' },
    { id: 109, father_id: 25, mother_id: null, relationship_status: 'active' },
    { id: 110, father_id: 17, mother_id: 24, relationship_status: 'active' },
];

const children = [
    { family_id: 101, person_id: 4, sort_order: 1 },
    { family_id: 101, person_id: 5, sort_order: 2 },
    { family_id: 101, person_id: 6, sort_order: 3 },
    { family_id: 102, person_id: 7, sort_order: 1 },
    { family_id: 103, person_id: 10, sort_order: 1 },
    { family_id: 103, person_id: 11, sort_order: 2 },
    { family_id: 104, person_id: 12, sort_order: 1 },
    { family_id: 104, person_id: 13, sort_order: 2 },
    { family_id: 105, person_id: 16, sort_order: 1 },
    { family_id: 105, person_id: 21, sort_order: 2, child_type: 'heir', is_primary_lineage: 1 },
    { family_id: 108, person_id: 21, sort_order: 1, child_type: 'biological', is_primary_lineage: 0 },
    { family_id: 106, person_id: 17, sort_order: 1 },
    { family_id: 107, person_id: 20, sort_order: 1 },
    { family_id: 109, person_id: 24, sort_order: 1 },
];

const buildFixtureRows = () => ({
    people: people.map((row) => ({ ...row })),
    families: families.map((row) => ({ ...row })),
    children: children.map((row) => ({ ...row })),
});

module.exports = { MALE, FEMALE, buildFixtureRows, person };
