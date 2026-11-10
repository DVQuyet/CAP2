// Thông tin liên hệ (SĐT, email, địa chỉ) của người trên cây chỉ gửi cho người có quyền:
// admin/manager, chính người đó, hoặc thành viên đang có khóa sửa tạm bao gồm người đó
// (form sửa cần giá trị thật, nếu không sẽ ghi đè thành rỗng khi lưu).
const CONTACT_FIELDS = ['phone', 'email', 'address'];

const canSeeAllContacts = (user) => [1, 2].includes(Number(user?.role_id))
    || ['admin', 'manager'].includes(String(user?.role_name || ''));

function redactContactFields(people = [], { user, viewerPersonId = null, editablePersonIds = [] } = {}) {
    if (canSeeAllContacts(user)) return people;
    const allowed = new Set([viewerPersonId, ...editablePersonIds].map(Number).filter((id) => id > 0));
    return people.map((person) => {
        if (allowed.has(Number(person.id))) return person;
        const next = { ...person };
        CONTACT_FIELDS.forEach((field) => {
            if (field in next) next[field] = null;
        });
        return next;
    });
}

module.exports = { CONTACT_FIELDS, canSeeAllContacts, redactContactFields };
