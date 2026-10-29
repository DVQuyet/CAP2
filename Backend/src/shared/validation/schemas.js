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

// ---- Công việc (task) ----
const taskText = {
    description: v.string({ max: 5000, label: 'mô tả' }),
    due_date: v.string({ max: 40, label: 'hạn hoàn thành' }),
};
const assignTask = validate({
    body: {
        title: v.string({ required: true, max: 255, label: 'tiêu đề', message: 'Tiêu đề công việc là bắt buộc' }),
        ...taskText,
        event_id: nullableId('sự kiện'),
        member_account_ids: v.ids({ max: 1000, label: 'danh sách thành viên' }),
    },
});
const createEventTask = validate({
    params: { eventId: v.id({ label: 'event_id', message: 'event_id không hợp lệ' }) },
    body: {
        title: v.string({ required: true, max: 255, label: 'tiêu đề', message: 'Tiêu đề công việc là bắt buộc' }),
        ...taskText,
        member_account_ids: v.ids({ max: 1000, label: 'danh sách thành viên' }),
    },
});
const bulkAssignTasks = validate({
    body: {
        event_id: nullableId('sự kiện'),
        tasks: v.array(
            v.object({
                title: v.string({ max: 255, label: 'tiêu đề' }),
                ...taskText,
                member_account_ids: v.ids({ max: 1000, label: 'danh sách thành viên' }),
                member_ids: v.ids({ max: 1000, label: 'danh sách thành viên' }),
            }),
            { max: 50, label: 'danh sách công việc', message: 'Không được giao quá 50 công việc trong một lần' }
        ),
    },
});
const updateAssignedTask = validate({
    params: { id: v.id({ label: 'ID công việc', message: 'ID công việc không hợp lệ' }) },
    body: {
        title: v.string({ required: true, max: 255, label: 'tên công việc', message: 'Tên công việc không được để trống' }),
        ...taskText,
        clan_id: nullableId('dòng họ'),
    },
});
const taskIdParam = validate({
    params: { id: v.id({ label: 'ID công việc', message: 'ID công việc không hợp lệ' }) },
});
const updateTaskStatus = validate({
    params: { id: v.id({ label: 'ID công việc', message: 'ID công việc không hợp lệ' }) },
    body: { status: v.enum(['in_progress', 'completed'], { required: true, label: 'trạng thái', message: 'Trạng thái không hợp lệ' }) },
});

// ---- Kỷ niệm / time capsule ----
const memoryReader = v.object({
    account_id: nullableId('account_id'),
    person_id: nullableId('person_id'),
});
const createFamilyMemory = validate({
    body: {
        title: v.string({ max: 255, label: 'tiêu đề' }),
        content: v.string({ max: 20000, label: 'nội dung' }),
        media_url: v.string({ max: 2048, label: 'URL tệp' }),
        mime_type: v.string({ max: 100, label: 'mime_type' }),
        original_filename: v.string({ max: 255, label: 'tên tệp' }),
        visibility: v.string({ max: 20, label: 'quyền xem' }),
        scheduled_publish_at: v.string({ max: 40, label: 'thời điểm công khai' }),
        readers: v.array(memoryReader, { max: 500, label: 'người được đọc' }),
    },
});
const updateFamilyMemory = validate({
    params: { id: v.id({ label: 'ID kỷ niệm', message: 'ID kỷ niệm không hợp lệ.' }) },
    body: {
        title: v.string({ max: 255, label: 'tiêu đề' }),
        content: v.string({ max: 20000, label: 'nội dung' }),
        visibility: v.string({ max: 20, label: 'quyền xem' }),
    },
});

// ---- Hồ sơ cá nhân ----
const updateMemberProfile = validate({
    body: {
        surname: name('họ'),
        middle_name: name('tên đệm'),
        first_name: name('tên'),
        email: name('email', EMAIL_MAX),
        hometown: name('quê quán', 255),
        generation: v.int({ min: 0, max: 1000, label: 'đời' }),
    },
});
const updateMyProfile = validate({
    body: {
        full_name: name('họ và tên', 150),
        display_name: name('họ và tên', 150),
        gender: v.string({ max: 20, label: 'giới tính' }),
        birth_date: v.string({ max: 32, label: 'ngày sinh' }),
        phone: name('số điện thoại', 30),
        address: name('địa chỉ', 255),
        hometown: name('quê quán', 255),
        bio: v.string({ max: 5000, label: 'tiểu sử' }),
        avatar_url: v.string({ max: 500000, label: 'ảnh đại diện' }), // có thể là data URL
    },
});

// ---- Dòng họ ----
const updateClanInfo = validate({
    body: {
        clan_name: v.string({ required: true, max: 255, label: 'tên dòng họ', message: 'Tên dòng họ không được để trống' }),
        history: v.string({ max: 50000, label: 'lịch sử' }),
        hall_address: v.string({ max: 500, label: 'địa chỉ nhà thờ họ' }),
    },
});
const registerClan = validate({
    body: {
        clan_name: v.string({ required: true, max: 255, label: 'tên dòng họ', message: 'Thiếu tên dòng họ (clan_name)' }),
        chief_account_id: v.id({ required: true, label: 'chief_account_id', message: 'Thiếu id trưởng họ (chief_account_id) hoặc không hợp lệ' }),
    },
});
const registerClanWithManager = validate({
    body: {
        clan_name: v.string({ required: true, max: 255, label: 'tên dòng họ', message: 'Thiếu tên dòng họ' }),
        email: v.string({ required: true, max: EMAIL_MAX, label: 'email', message: 'Thiếu email' }),
        password: password({ required: true, message: 'Thiếu mật khẩu' }),
        display_name: v.string({ required: true, max: 150, label: 'tên hiển thị', message: 'Thiếu tên hiển thị' }),
        first_name: name('tên'),
        middle_name: name('tên đệm'),
        surname: name('họ'),
        birth_date: v.string({ max: 32, label: 'ngày sinh' }),
        gender: v.string({ max: 20, label: 'giới tính' }),
        hometown: name('quê quán', 255),
    },
});

// ---- Tài khoản (admin, trừ đổi vai trò) ----
const adminCreateAccount = validate({
    body: {
        email: v.string({ max: EMAIL_MAX, label: 'email' }),
        password: password(),
        role_id: v.int({ min: 0, label: 'vai trò' }),
        status: v.string({ max: 20, label: 'trạng thái' }),
        display_name: name('tên hiển thị', 150),
        first_name: name('tên'),
        middle_name: name('tên đệm'),
        surname: name('họ'),
        clan_id: nullableId('ID dòng họ'),
    },
});
const adminCreateManager = validate({
    body: {
        email: v.string({ max: EMAIL_MAX, label: 'email' }),
        password: password(),
        surname: name('họ'),
        middle_name: name('tên đệm'),
        first_name: name('tên'),
        gender: v.string({ max: 20, label: 'giới tính' }),
        birth_date: v.string({ max: 32, label: 'ngày sinh' }),
        hometown: name('quê quán', 255),
        generation: v.int({ min: 0, max: 1000, label: 'đời' }),
        clan_id: v.id({ required: true, label: 'clan_id', message: 'Cần clan_id (dòng họ) hợp lệ' }),
    },
});
const adminDeleteAccount = validate({
    params: { id: v.id({ label: 'account_id', message: 'account_id không hợp lệ' }) },
});

// ---- Lưu trữ thành viên ----
const archiveMember = validate({
    params: { id: v.id({ label: 'account_id', message: 'account_id không hợp lệ' }) },
    body: { reason: v.string({ max: 1000, label: 'lý do' }) },
});
const restoreArchivedMember = validate({
    params: { id: v.id({ label: 'archive_id', message: 'archive_id không hợp lệ' }) },
});

// ---- Lịch (calendar) ----
// Controller tự chuẩn hóa/cắt chuỗi và giữ thông báo lỗi cũ (rỗng, ngày sai...), nên ở đây chỉ chặn sai kiểu và quá cỡ.
const calendarEventBody = {
    title: v.string({ max: 1000, label: 'tên lịch' }),
    date: v.string({ max: 40, label: 'ngày lịch' }),
    event_date: v.string({ max: 40, label: 'ngày lịch' }),
    time: v.string({ max: 40, label: 'giờ' }),
    event_time: v.string({ max: 40, label: 'giờ' }),
    type: v.string({ max: 50, label: 'loại lịch' }),
    note: v.string({ max: 5000, label: 'ghi chú' }),
    visibility: v.string({ max: 20, label: 'phạm vi' }),
    scope: v.string({ max: 20, label: 'phạm vi' }),
    reminder_days: v.number({ min: -1000, max: 1000, label: 'số ngày nhắc' }),
    reminderDays: v.number({ min: -1000, max: 1000, label: 'số ngày nhắc' }),
    person_id: nullableId('người được gắn'),
    personId: nullableId('người được gắn'),
    repeat_yearly: v.boolean({ label: 'lặp hằng năm' }),
    repeatYearly: v.boolean({ label: 'lặp hằng năm' }),
};
const calendarEventId = { id: v.id({ label: 'ID lịch', message: 'ID lịch không hợp lệ.' }) };
const createCalendarEvent = validate({ body: calendarEventBody });
const updateCalendarEvent = validate({ params: calendarEventId, body: calendarEventBody });
const deleteCalendarEvent = validate({ params: calendarEventId });

const generatePersonBiography = validate({
    body: {
        person_id: v.id({ required: true, label: 'person_id', message: 'person_id không hợp lệ' }),
        tone: v.enum(['formal', 'friendly'], { label: 'giọng văn' }),
        length: v.enum(['short', 'medium'], { label: 'độ dài' }),
        language: v.enum(['vi', 'en'], { label: 'ngôn ngữ' }),
        notes: v.string({ max: 600, label: 'ghi chú cho AI' }),
    },
});

const generatePostDraft = validate({
    body: {
        idea: v.string({ max: 1000, label: 'ý tưởng' }),
        event_id: v.string({ max: 80, pattern: /^[A-Za-z0-9_-]+$/, label: 'sự kiện' }),
        kind: v.enum(['meeting', 'anniversary', 'celebration', 'general'], { label: 'loại bài' }),
        tone: v.enum(['formal', 'friendly'], { label: 'giọng văn' }),
    },
});

const dismissDuplicate = validate({
    body: {
        person_a_id: v.id({ required: true, label: 'người thứ nhất' }),
        person_b_id: v.id({ required: true, label: 'người thứ hai' }),
    },
});

module.exports = {
    generatePersonBiography, generatePostDraft, dismissDuplicate,
    createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
    assignTask, createEventTask, bulkAssignTasks, updateAssignedTask, taskIdParam, updateTaskStatus,
    createFamilyMemory, updateFamilyMemory, updateMemberProfile, updateMyProfile,
    updateClanInfo, registerClan, registerClanWithManager,
    adminCreateAccount, adminCreateManager, adminDeleteAccount, archiveMember, restoreArchivedMember,
    register, login, forgotPassword, resetPassword,
    createPerson, updatePerson, linkRelations, createFamily, updateFamily, addFamilyChild,
    fundIncome, fundExpense, fundReportPayment,
    postComment, postCreate, postUpdate,
    createInvitation, updateAccountAccess,
};
