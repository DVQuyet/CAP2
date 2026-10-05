// Ẩn quan hệ nhạy cảm (families.visibility = 'managers') khỏi cây mà thành viên thường xem.
// Con của quan hệ đó vẫn hiển thị là con của người còn lại; người vợ/chồng chỉ có quan hệ ẩn thì bị ẩn theo.
const canSeeSensitiveRelations = (user) => [1, 2].includes(Number(user?.role_id));

const applyFamilyVisibility = ({ people = [], families = [], children = [] }, user) => {
    if (canSeeSensitiveRelations(user)) return { people, families, children };
    const hidden = families.filter((family) => String(family.visibility || 'public') === 'managers');
    if (!hidden.length) return { people, families, children };

    const unionCount = new Map();
    families.forEach((family) => {
        [family.father_id, family.mother_id].filter(Boolean).forEach((id) => {
            unionCount.set(Number(id), (unionCount.get(Number(id)) || 0) + 1);
        });
    });

    const hiddenSpouseIds = new Set();
    const hiddenIds = new Set(hidden.map((family) => Number(family.id)));
    const nextFamilies = families.map((family) => {
        if (!hiddenIds.has(Number(family.id))) return family;
        const fatherUnions = unionCount.get(Number(family.father_id)) || 0;
        const motherUnions = unionCount.get(Number(family.mother_id)) || 0;
        const hideMother = fatherUnions >= motherUnions;
        const hiddenSpouse = hideMother ? family.mother_id : family.father_id;
        if (hiddenSpouse) hiddenSpouseIds.add(Number(hiddenSpouse));
        return {
            ...family,
            father_id: hideMother ? family.father_id : null,
            mother_id: hideMother ? null : family.mother_id,
            marriage_date: null,
            relation_note: null,
            source_note: null,
        };
    });

    const stillReferenced = new Set();
    nextFamilies.forEach((family) => {
        [family.father_id, family.mother_id].filter(Boolean).forEach((id) => stillReferenced.add(Number(id)));
    });
    children.forEach((row) => stillReferenced.add(Number(row.person_id)));
    const removedPeople = new Set([...hiddenSpouseIds].filter((id) => !stillReferenced.has(id)));

    return {
        people: people.filter((person) => !removedPeople.has(Number(person.id))),
        families: nextFamilies.filter((family) => family.father_id || family.mother_id),
        children,
    };
};

module.exports = {
    canSeeSensitiveRelations,
    applyFamilyVisibility,
};
