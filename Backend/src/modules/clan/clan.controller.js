const db = require("../../config/db");
const bcrypt = require("bcryptjs");
const { ensureFreeSubscriptionForClan } = require("../billing/billing.service");

// Đăng ký dòng họ mới + chỉ định trưởng họ
// Nếu tài khoản trưởng họ hiện chưa thuộc clan (people.clan_id IS NULL) thì tự nâng role_id = 2 và gán clan_id.
exports.registerClan = async(req, res) => {
    const { clan_name, chief_account_id } = req.body;

    const normalizedChiefId =
        chief_account_id === undefined || chief_account_id === null || String(chief_account_id).trim() === "" ?
        NaN :
        Number(chief_account_id);

    if (!clan_name || String(clan_name).trim() === "") {
        return res.status(400).json({ success: false, message: "Thiếu tên dòng họ (clan_name)" });
    }

    if (!Number.isFinite(normalizedChiefId)) {
        return res
            .status(400)
            .json({ success: false, message: "Thiếu id trưởng họ (chief_account_id) hoặc không hợp lệ" });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [clanResult] = await connection.query("INSERT INTO clans (clan_name) VALUES (?)", [
            String(clan_name).trim(),
        ]);
        const clanId = clanResult.insertId;
        await ensureFreeSubscriptionForClan(clanId, connection);

        const [accounts] = await connection.query("SELECT id, person_id FROM accounts WHERE id = ?", [
            normalizedChiefId,
        ]);

        if (!accounts || accounts.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản trưởng họ" });
        }

        const chief = accounts[0];
        if (!chief.person_id) {
            await connection.rollback();
            return res
                .status(400)
                .json({ success: false, message: "Tài khoản trưởng họ chưa liên kết person_id" });
        }

        const [peopleRows] = await connection.query("SELECT id, clan_id FROM people WHERE id = ?", [chief.person_id]);
        const person = peopleRows && peopleRows.length ? peopleRows[0] : null;

        if (!person) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Không tìm thấy person của trưởng họ" });
        }

        let promoted = false;

        // Chỉ tự động nâng role + gán clan nếu tài khoản chưa thuộc clan nào
        if (person.clan_id === null) {
            await connection.query("UPDATE people SET clan_id = ? WHERE id = ?", [clanId, chief.person_id]);
            await connection.query("UPDATE accounts SET role_id = 2, status = 'active' WHERE id = ?", [
                normalizedChiefId,
            ]);
            promoted = true;
        }

        await connection.commit();

        return res.json({
            success: true,
            message: promoted ? "Đăng ký dòng họ thành công! Đã nâng trưởng họ lên Manager." : "Đăng ký dòng họ thành công!",
            clan_id: clanId,
            chief_account_id: normalizedChiefId,
            chief_promoted: promoted,
        });
    } catch (error) {
        await connection.rollback();
        console.error("registerClan error:", error);
        return res.status(500).json({ success: false, message: "Lỗi đăng ký dòng họ" });
    } finally {
        connection.release();
    }
};

// Đăng ký dòng họ + tài khoản Manager
exports.registerClanWithManager = async(req, res) => {
    const {
        clan_name,
        email,
        password,
        display_name,
        first_name,
        middle_name,
        surname,
        birth_date,
        gender,
        hometown,
    } = req.body;

    if (!clan_name || String(clan_name).trim() === "") {
        return res.status(400).json({ success: false, message: "Thiếu tên dòng họ" });
    }

    if (!email || String(email).trim() === "") {
        return res.status(400).json({ success: false, message: "Thiếu email" });
    }

    if (!password || String(password).trim() === "") {
        return res.status(400).json({ success: false, message: "Thiếu mật khẩu" });
    }

    if (!display_name || String(display_name).trim() === "") {
        return res.status(400).json({ success: false, message: "Thiếu tên hiển thị" });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [clanResult] = await connection.query("INSERT INTO clans (clan_name) VALUES (?)", [
            String(clan_name).trim(),
        ]);
        const clanId = clanResult.insertId;
        await ensureFreeSubscriptionForClan(clanId, connection);

        const hashedPassword = await bcrypt.hash(password, 10);

        const [personResult] = await connection.query(
            `INSERT INTO people (clan_id, display_name, first_name, middle_name, surname, gender, birth_date, hometown, generation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`, [
                clanId,
                String(display_name).trim(),
                first_name ? String(first_name).trim() : "",
                middle_name ? String(middle_name).trim() : "",
                surname ? String(surname).trim() : "",
                Number(gender) || 1,
                birth_date || null,
                hometown ? String(hometown).trim() : "",
            ]
        );

        const personId = personResult.insertId;

        const [accountResult] = await connection.query(
            "INSERT INTO accounts (email, password, person_id, role_id, status) VALUES (?, ?, ?, 2, 'active')", [String(email).trim(), hashedPassword, personId]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "Đăng ký dòng họ và tài khoản Manager thành công",
            clan_id: clanId,
            account_id: accountResult.insertId,
            person_id: personId,
        });
    } catch (error) {
        await connection.rollback();
        console.error("registerClanWithManager error:", error);
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ success: false, message: "Email đã tồn tại" });
        }
        return res.status(500).json({ success: false, message: "Lỗi đăng ký dòng họ + manager" });
    } finally {
        connection.release();
    }
};
