const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testLogin() {
    const email = 'test_manager_reg@example.com';
    const password = 'password123'; // I assume the subagent used this or something similar

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const [rows] = await connection.query('SELECT password FROM accounts WHERE email = ?', [email]);
        if (rows.length === 0) {
            console.log('User not found');
            return;
        }

        const hashed = rows[0].password;
        console.log('Hashed password from DB:', hashed);

        // Test with a few common passwords the subagent might have used
        const candidates = ['password123', 'Password123', '123456', 'dummy123'];
        for (const cand of candidates) {
            const match = await bcrypt.compare(cand, hashed);
            console.log(`Testing "${cand}": ${match ? 'MATCH!' : 'no match'}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

testLogin();
