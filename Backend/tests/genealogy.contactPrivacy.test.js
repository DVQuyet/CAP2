const test = require('node:test');
const assert = require('node:assert');
const { redactContactFields } = require('../src/modules/genealogy/contactPrivacy');

const people = [
    { id: 1, display_name: 'A', phone: '0901', email: 'a@x.vn', address: 'Hà Nội' },
    { id: 2, display_name: 'B', phone: '0902', email: 'b@x.vn', address: 'Huế' },
    { id: 3, display_name: 'C', phone: '0903', email: 'c@x.vn', address: 'Đà Nẵng' },
];

test('admin và manager thấy đủ thông tin liên hệ', () => {
    assert.strictEqual(redactContactFields(people, { user: { role_id: 1 } }), people);
    assert.strictEqual(redactContactFields(people, { user: { role_name: 'manager' } }), people);
});

test('thành viên chỉ thấy liên hệ của chính mình, các trường khác giữ nguyên', () => {
    const result = redactContactFields(people, { user: { role_id: 3 }, viewerPersonId: 2 });
    assert.deepStrictEqual(result[1], people[1]);
    assert.deepStrictEqual(result[0], { id: 1, display_name: 'A', phone: null, email: null, address: null });
    assert.strictEqual(result[2].phone, null);
    assert.strictEqual(people[0].phone, '0901', 'không sửa dữ liệu gốc');
});

test('thành viên có khóa sửa tạm thấy liên hệ của người trong phạm vi được sửa', () => {
    const result = redactContactFields(people, { user: { role_id: 3 }, viewerPersonId: 2, editablePersonIds: [3] });
    assert.strictEqual(result[2].phone, '0903');
    assert.strictEqual(result[0].email, null);
});

test('không rõ vai trò hoặc chưa liên kết người thì ẩn hết', () => {
    const result = redactContactFields(people, { user: {}, viewerPersonId: null });
    assert.ok(result.every((person) => person.phone === null && person.email === null && person.address === null));
});
