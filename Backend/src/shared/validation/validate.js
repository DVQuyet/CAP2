// Bộ kiểm tra dữ liệu đầu vào nhỏ gọn (không phụ thuộc thư viện ngoài).
// Dùng: router.post('/x', validate({ body: { name: v.string({ required: true, max: 100 }) } }), handler)
// - Chỉ kiểm tra/làm sạch các trường được khai báo; trường lạ giữ nguyên (trừ khi truyền strict: true).
// - Trường vắng mặt (undefined) không bị thêm vào body, để controller còn phân biệt "không gửi" với "gửi rỗng".

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isRealDate = (year, month, day) => {
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};

const rule = (kind, options = {}) => ({ kind, ...options });

// Các kiểu rule. Tuỳ chọn chung: required, label (tên hiển thị trong thông báo), message (ghi đè mọi lỗi của trường).
const v = {
    string: (o) => rule('string', o),
    int: (o) => rule('int', o),
    number: (o) => rule('number', o),
    boolean: (o) => rule('boolean', o),
    enum: (values, o) => rule('enum', { ...o, values }),
    date: (o) => rule('date', o), // allowTime: true cho phép thêm giờ sau ngày
    // Id nguyên dương; null/'' được giữ nguyên khi không bắt buộc.
    id: (o) => rule('int', { min: 1, ...o }),
    array: (item, o) => rule('array', { ...o, item }),
    ids: (o) => rule('array', { ...o, item: rule('int', { min: 1 }) }),
};

const checkOne = (r, raw, label) => {
    switch (r.kind) {
        case 'string': {
            if (typeof raw !== 'string' && typeof raw !== 'number') return { error: `${label} phải là chuỗi ký tự.` };
            let text = String(raw);
            if (r.trim !== false) text = text.trim();
            if (text === '') {
                if (r.required) return { error: `Vui lòng nhập ${label}.` };
                return { value: text };
            }
            if (r.min && text.length < r.min) return { error: `${label} tối thiểu ${r.min} ký tự.` };
            if (r.max && text.length > r.max) return { error: `${label} tối đa ${r.max} ký tự.` };
            if (r.email && !EMAIL_RE.test(text)) return { error: `${label} không hợp lệ.` };
            if (r.pattern && !r.pattern.test(text)) return { error: `${label} không hợp lệ.` };
            return { value: text };
        }
        case 'int':
        case 'number': {
            const isInt = r.kind === 'int';
            const what = isInt ? 'số nguyên' : 'số';
            let num;
            if (typeof raw === 'number') num = raw;
            else if (typeof raw === 'string' && (isInt ? /^[+-]?\d+$/ : /^[+-]?\d+(\.\d+)?$/).test(raw.trim())) num = Number(raw.trim());
            else return { error: `${label} phải là ${what}.` };
            if (!Number.isFinite(num) || (isInt && !Number.isSafeInteger(num))) return { error: `${label} phải là ${what} hợp lệ.` };
            if (r.min !== undefined && num < r.min) return { error: r.min === 1 ? `${label} phải lớn hơn 0.` : `${label} tối thiểu ${r.min}.` };
            if (r.max !== undefined && num > r.max) return { error: `${label} tối đa ${r.max}.` };
            return { value: num };
        }
        case 'boolean': {
            if (typeof raw === 'boolean') return { value: raw };
            if (raw === 1 || raw === '1' || raw === 'true') return { value: true };
            if (raw === 0 || raw === '0' || raw === 'false') return { value: false };
            return { error: `${label} phải là đúng/sai.` };
        }
        case 'enum': {
            const probe = typeof raw === 'string' ? raw.trim() : raw;
            const found = r.values.find((x) => String(x) === String(probe));
            if (found === undefined) return { error: `${label} không hợp lệ.` };
            return { value: found };
        }
        case 'date': {
            if (typeof raw !== 'string') return { error: `${label} phải có dạng YYYY-MM-DD.` };
            const text = raw.trim();
            const m = (r.allowTime ? DATETIME_RE : DATE_RE).exec(text);
            if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) return { error: `${label} phải có dạng YYYY-MM-DD.` };
            return { value: text };
        }
        case 'array': {
            if (!Array.isArray(raw)) return { error: `${label} phải là danh sách.` };
            if (r.max !== undefined && raw.length > r.max) return { error: `${label} tối đa ${r.max} phần tử.` };
            if (r.min !== undefined && raw.length < r.min) return { error: `${label} tối thiểu ${r.min} phần tử.` };
            const out = [];
            for (let i = 0; i < raw.length; i += 1) {
                const res = checkOne(r.item, raw[i], `${label} (mục ${i + 1})`);
                if (res.error) return res;
                out.push(res.value);
            }
            return { value: out };
        }
        default:
            return { error: `${label} không hợp lệ.` };
    }
};

// Kiểm tra một object theo schema { field: rule }. Trả về { values, errors }.
// values chỉ chứa các trường khai báo mà client có gửi (đã trim/ép kiểu).
function validateObject(source, schema) {
    const values = {};
    const errors = [];
    const src = source && typeof source === 'object' ? source : {};
    for (const [field, r] of Object.entries(schema)) {
        const label = r.label || field;
        const fail = (msg) => errors.push({ field, message: r.message || msg });
        const raw = src[field];
        if (raw === undefined) {
            if (r.required) fail(`Vui lòng nhập ${label}.`);
            continue;
        }
        // null và '' (với kiểu không phải chuỗi) được coi là "để trống": bắt buộc thì lỗi, không thì giữ nguyên cho controller.
        if (raw === null || (raw === '' && r.kind !== 'string')) {
            if (r.required) fail(`Vui lòng nhập ${label}.`);
            else values[field] = raw;
            continue;
        }
        const res = checkOne(r, raw, label);
        if (res.error) fail(res.error);
        else values[field] = res.value;
    }
    return { values, errors };
}

// validate({ body, query, params, strict }): middleware Express.
// strict: true => body chỉ giữ các trường đã khai báo.
function validate({ body, query, params, strict = false } = {}) {
    return (req, res, next) => {
        const errors = [];
        const pending = [];
        for (const [key, schema] of [['body', body], ['query', query], ['params', params]]) {
            if (!schema) continue;
            const result = validateObject(req[key], schema);
            errors.push(...result.errors);
            pending.push([key, result.values]);
        }
        if (errors.length) {
            return res.status(400).json({ success: false, message: errors[0].message, errors });
        }
        for (const [key, values] of pending) {
            if (key === 'body') {
                const current = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
                req.body = strict ? values : { ...current, ...values };
            } else if (key === 'params') {
                Object.assign(req.params, values);
            } else {
                // Express 5: req.query chỉ đọc, nên giá trị đã làm sạch đặt ở req.validatedQuery.
                req.validatedQuery = { ...(req.query || {}), ...values };
            }
        }
        return next();
    };
}

module.exports = { validate, validateObject, v };
