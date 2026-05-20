import { buildApiUrl } from "../services/api";

const BASE_URL = "/api/auth";

async function postAuth(path, body, fallbackError) {
    let res;
    try {
        res = await fetch(buildApiUrl(`${BASE_URL}${path}`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch (fetchErr) {
        const msg = String(fetchErr?.message || "");
        const isNetwork =
            fetchErr?.name === "TypeError" ||
            msg.includes("fetch") ||
            msg.includes("Failed to fetch") ||
            msg.includes("NetworkError");
        throw new Error(
            isNetwork
                ? "Không kết nối được máy chủ API. Hãy chạy Backend (npm run dev, cổng 3000) và để Vite proxy /api."
                : msg || fallbackError
        );
    }
    const text = await res.text();
    let result = {};
    try {
        result = text ? JSON.parse(text) : {};
    } catch (e) {
        console.error("Phản hồi không phải JSON:", text);
    }
    if (!res.ok) {
        throw new Error(result.message || fallbackError);
    }
    return result;
}

/**
 * ĐĂNG NHẬP
 */
export const loginAPI = async (data) => {
    try {
        return await postAuth(
            "/login",
            { email: data.email, password: data.password },
            "Email hoặc mật khẩu không chính xác"
        );
    } catch (error) {
        console.error("Lỗi Login API:", error.message);
        throw error;
    }
};

/**
 * ĐĂNG KÝ
 */
export const registerAPI = async (data) => {
    try {
        const clanId = Number(String(data.clan_id ?? "").trim());
        if (!Number.isInteger(clanId) || clanId <= 0) {
            throw new Error("Vui lòng nhập ID dòng họ hợp lệ.");
        }

        const payload = {
            email: data.email,
            password: data.password,
            display_name: data.display_name,
            first_name: data.first_name,
            middle_name: data.middle_name || "",
            surname: data.surname,
            birth_date: data.birth_date,
            gender: Number(data.gender) || 1,
            hometown: data.hometown,
            clan_id: clanId,
        };

        return await postAuth("/register", payload, "Đăng ký không thành công");
    } catch (error) {
        console.error("Lỗi Register API:", error.message);
        throw error;
    }
};

/**
 * ĐĂNG KÝ DÒNG HỌ MỚI (CLAN)
 */
export const registerClanAPI = async (data) => {
    try {
        return await postAuth(
            "/register-clan",
            {
                clan_name: data.clan_name,
                chief_account_id: data.chief_account_id,
            },
            "Đăng ký dòng họ không thành công"
        );
    } catch (error) {
        console.error("Lỗi registerClanAPI:", error.message);
        throw error;
    }
};

/**
 * ĐĂNG KÝ DÒNG HỌ + TÀI KHOẢN MANAGER
 */
export const registerClanManagerAPI = async (data) => {
    try {
        return await postAuth(
            "/register-clan-manager",
            {
                clan_name: data.clan_name,
                email: data.email,
                password: data.password,
                display_name: data.display_name,
                first_name: data.first_name,
                middle_name: data.middle_name,
                surname: data.surname,
                birth_date: data.birth_date,
                gender: Number(data.gender) || 1,
                hometown: data.hometown,
            },
            "Đăng ký dòng họ Manager không thành công"
        );
    } catch (error) {
        console.error("Lỗi registerClanManagerAPI:", error.message);
        throw error;
    }
};

export const requestPasswordResetAPI = async (email) =>
    postAuth("/forgot-password", { email }, "Không gửi được mã.");

export const resetPasswordWithCodeAPI = async ({ email, code, new_password }) =>
    postAuth("/reset-password", { email, code, new_password }, "Đặt lại mật khẩu thất bại.");
