// Schema kiểm tra đầu vào cho các route ghi rủi ro nhất. Đây chỉ là lớp kiểm tra thêm:
// controller vẫn giữ nguyên các kiểm tra và thông báo lỗi cũ. Thông báo ở đây cố ý khớp thông báo cũ.
const { validate, v } = require('./validate');

const EMAIL_MAX = 254;
const PASSWORD_MAX = 128;
const AMOUNT_MAX = 1000000000000; // 1 nghìn tỷ, đủ rộng cho quỹ dòng họ

// Mật khẩu so sánh nguyên văn nên không trim.
const password = (o) => v.string({ trim: false, max: PASSWORD_MAX, label: 'mật khẩu', ...o });
const name = (label, max = 100) => v.string({ max, label });
// Id tuỳ chọn: chấp nhận null/''/0 (nghĩa là "không có") để không phá client cũ.
const nullableId = (label) => v.int({ min: 0, label });
const amount = () => v.int({ required: true, min: 1, max: AMOUNT_MAX, label: 'số tiền', message: 'Số tiền phải lớn hơn 0.' });

// ---- Auth ----
const register = validate({
    body: {
        email: v.string({ max: EMAIL_MAX, label: 'email' }),
        password: password(),
        display_name: name('tên hiển thị', 150),
        first_name: name('tên'),
        middle_name: name('tên đệm'),
        surname: name('họ'),
        hometown: name('quê quán', 255),
        birth_date: v.string({ max: 32, label: 'ngày sinh' }),
        clan_id: v.id({ label: 'ID dòng họ', message: 'Vui lòng nhập ID dòng họ hợp lệ' }),
    },
});

const login = validate({
    body: {
        email: v.string({ max: EMAIL_MAX, label: 'email', message: 'Vui lòng nhập email và mật khẩu!' }),
        password: password({ message: 'Vui lòng nhập email và mật khẩu!' }),
    },
});

const forgotPassword = validate({
    body: { email: v.string({ max: EMAIL_MAX, label: 'email', message: 'Email không hợp lệ.' }) },
});

const resetPassword = validate({
    body: {
        email: v.string({ max: EMAIL_MAX, label: 'email' }),
        code: v.string({ max: 20, label: 'mã xác nhận' }),
        new_password: password({ label: 'mật khẩu mới' }),
    },
});

// ---- Gia phả ----
const personFields = {
    display_name: name('họ tên', 150),
    surname: name('họ'),
    middle_name: name('tên đệm'),
    first_name: name('tên'),
    hometown: name('quê quán', 255),
    address: name('địa chỉ', 255),
    phone: name('số điện thoại', 30),
    email: name('email', EMAIL_MAX),
    bio: v.string({ max: 5000, label: 'tiểu sử' }),
    note: v.string({ max: 5000, label: 'ghi chú' }),
    birth_date: v.string({ max: 32, label: 'ngày sinh' }),
    death_date: v.string({ max: 32, label: 'ngày mất' }),
};

const parentFields = {
    parent_father_id: nullableId('id cha'),
    parent_mother_id: nullableId('id mẹ'),
    father_person_id: nullableId('id cha'),
    mother_person_id: nullableId('id mẹ'),
};

const createPerson = validate({ body: { ...personFields, ...parentFields } });
const updatePerson = validate({
    params: { id: v.id({ label: 'id thành viên' }) },
    body: personFields,
});
const linkRelations = validate({
    body: { person_id: v.id({ label: 'person_id', message: 'person_id không hợp lệ' }), ...parentFields },
});
const createFamily = validate({
    body: {
        father_id: nullableId('id cha'),
        mother_id: nullableId('id mẹ'),
        father_person_id: nullableId('id cha'),
        mother_person_id: nullableId('id mẹ'),
    },
});
const updateFamily = validate({
    params: { familyId: v.id({ label: 'family_id', message: 'family_id khong hop le' }) },
    body: {
        father_id: nullableId('id cha'),
        mother_id: nullableId('id mẹ'),
        father_person_id: nullableId('id cha'),
        mother_person_id: nullableId('id mẹ'),
    },
});
const addFamilyChild = validate({
    params: { familyId: v.id({ label: 'family_id', message: 'family_id hoac person_id khong hop le' }) },
    body: { person_id: nullableId('person_id'), child_id: nullableId('child_id') },
});

// ---- Quỹ ----
// method là chuỗi tự do ('Tiền mặt', 'Chuyển khoản'...) nên chỉ giới hạn độ dài.
const method = () => v.string({ max: 50, label: 'phương thức' });
const dateLike = () => v.date({ allowTime: true, label: 'ngày' });
const fundIncome = validate({
    body: {
        amount: amount(),
        note: v.string({ max: 1000, label: 'ghi chú' }),
        method: method(),
        date: dateLike(),
        person_id: nullableId('người nộp'),
        event_id: nullableId('sự kiện'),
        campaign_id: nullableId('đợt quỹ'),
    },
});
const fundExpense = validate({
    body: {
        amount: amount(),
        note: v.string({ max: 1000, label: 'ghi chú' }),
        date: dateLike(),
        event_id: nullableId('sự kiện'),
        campaign_id: nullableId('đợt quỹ'),
        recipient_person_id: nullableId('người nhận'),
        recipient_note: v.string({ max: 1000, label: 'ghi chú người nhận' }),
        status: v.enum(['pending', 'approved', 'rejected'], { label: 'trạng thái' }),
    },
});
const fundReportPayment = validate({
    body: {
        amount: amount(),
        note: v.string({ max: 1000, label: 'ghi chú' }),
        method: method(),
        campaign_id: nullableId('đợt quỹ'),
    },
});

// ---- Bài viết / bình luận ----
const postComment = validate({
    params: { id: v.id({ label: 'id bài viết' }) },
    body: {
        content: v.string({ max: 5000, label: 'bình luận', message: 'Bình luận quá dài (tối đa 5000 ký tự).' }),
        parent_id: nullableId('bình luận gốc'),
    },
});
const postCreate = validate({
    body: {
        description: v.string({ max: 5000, label: 'mô tả' }),
        content: v.string({ max: 50000, label: 'nội dung' }),
        image_url: v.string({ max: 2048, label: 'URL ảnh' }),
    },
});
const postUpdate = validate({
    params: { id: v.id({ label: 'id bài viết' }) },
    body: {
        description: v.string({ max: 5000, label: 'mô tả' }),
        content: v.string({ max: 50000, label: 'nội dung' }),
    },
});

// ---- Lời mời / phân quyền ----
const createInvitation = validate({
    body: {
        email: v.string({ max: EMAIL_MAX, label: 'email', message: 'Email khong hop le.' }),
        role: v.string({ max: 20, label: 'vai trò' }),
    },
});
const updateAccountAccess = validate({
    params: { id: v.id({ label: 'account_id', message: 'account_id không hợp lệ' }) },
    body: {
        email: v.string({ max: EMAIL_MAX, label: 'email' }),
        password: password({ trim: false }),
        role_id: v.id({ label: 'vai trò' }),
    },
});

module.exports = {
    register, login, forgotPassword, resetPassword,
    createPerson, updatePerson, linkRelations, createFamily, updateFamily, addFamilyChild,
    fundIncome, fundExpense, fundReportPayment,
    postComment, postCreate, postUpdate,
    createInvitation, updateAccountAccess,
};
