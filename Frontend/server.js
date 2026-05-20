require('dotenv').config(); // Nạp cấu hình từ file .env
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// 1. KẾT NỐI CLOUD AIVEN DÙNG BIẾN MÔI TRƯỜNG
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10
});

// Kiểm tra kết nối khi khởi động
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Không thể kết nối đến Aiven MySQL:', err.message);
    } else {
        console.log('✅ Đã kết nối thành công đến Cloud Aiven MySQL');
        connection.release();
    }
});

// 2. LOGIC ĐĂNG KÝ (Lưu trạng thái PENDING)
app.post('/register', async (req, res) => {
    const { first_name, last_name, email, password, dob, gender, target_tree_id } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (first_name, last_name, email, password_hash, date_of_birth, gender, target_tree_id, status) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`;
        
        db.query(sql, [first_name, last_name, email, hashedPassword, dob, gender, target_tree_id], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Lỗi: Email đã tồn tại hoặc dữ liệu sai!");
            }
            res.redirect('/waiting.html'); 
        });
    } catch (e) { res.status(500).send("Lỗi hệ thống!"); }
});

// 3. LOGIC ĐĂNG NHẬP (Chỉ cho phép ACTIVE)
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT * FROM users WHERE email = ?";

    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).send("Lỗi truy vấn cơ sở dữ liệu");
        
        if (results.length > 0) {
            const user = results[0];
            
            if (user.status === 'pending') {
                return res.send("<h2>Tài khoản của bạn đang chờ Tộc trưởng phê duyệt!</h2><a href='/login.html'>Quay lại</a>");
            }
            if (user.status === 'rejected') {
                return res.send("<h2>Yêu cầu của bạn đã bị từ chối.</h2>");
            }

            // Hỗ trợ cả mật khẩu thường (để test) và mật khẩu hash
            const isMatch = (password === user.password_hash) || await bcrypt.compare(password, user.password_hash);

            if (isMatch) {
                if (user.role_id === 2) {
                    res.redirect('/manager.html');
                } else {
                    res.send(`<h1>Chào mừng ${user.first_name} đã trở lại tộc!</h1><a href="/index.html">Vào trang chủ</a>`);
                }
            } else { res.send("Sai mật khẩu!"); }
        } else { res.send("Tài khoản không tồn tại!"); }
    });
});

// 4. API LẤY DANH SÁCH CHỜ
app.get('/api/pending-users', (req, res) => {
    db.query("SELECT user_id, first_name, last_name, email, date_of_birth, target_tree_id FROM users WHERE status = 'pending'", (err, results) => {
        if (err) return res.status(500).json([]);
        res.json(results);
    });
});

// 5. API PHÊ DUYỆT THÀNH VIÊN (Sửa lỗi lồng callback)
app.post('/approve/:id', (req, res) => {
    const userId = req.params.id;

    db.getConnection((err, connection) => {
        if (err) return res.status(500).send("Lỗi kết nối");

        connection.beginTransaction((err) => {
            if (err) return res.status(500).send("Lỗi transaction");

            connection.query("UPDATE users SET status = 'active' WHERE user_id = ?", [userId], (err) => {
                if (err) return connection.rollback(() => res.status(500).send("Lỗi cập nhật trạng thái"));

                const sqlLink = `INSERT INTO family_tree_members (family_tree_id, user_id)
                                 SELECT target_tree_id, user_id FROM users WHERE user_id = ?`;
                
                connection.query(sqlLink, [userId], (err) => {
                    if (err) return connection.rollback(() => res.status(500).send("Lỗi liên kết cây"));

                    connection.commit((err) => {
                        if (err) return connection.rollback(() => res.status(500).send("Lỗi commit"));
                        connection.release();
                        res.json({ success: true });
                    });
                });
            });
        });
    });
});

// 6. API TỪ CHỐI
app.post('/reject/:id', (req, res) => {
    db.query("UPDATE users SET status = 'rejected' WHERE user_id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Hệ thống Gia tộc chạy tại http://localhost:${PORT}`));