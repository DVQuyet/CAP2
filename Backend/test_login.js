const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

async function testLogin() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            port: process.env.DB_PORT || 3307,
            user: process.env.DB_USER || 'cap2_user',
            password: process.env.DB_PASSWORD || 'cap2_password',
            database: process.env.DB_NAME || 'defaultdb'
        });

        const [rows] = await connection.execute('SELECT password FROM accounts WHERE email = ?', ['admin@gmail.com']);
        if (rows.length === 0) {
            console.log('User not found');
            return;
        }

        const hash = rows[0].password;
        console.log('Hash in DB:', hash);

        const testPasswords = ['1', '123456'];
        for (const pass of testPasswords) {
            const match = await bcrypt.compare(pass, hash);
            console.log(`Password "${pass}" match: ${match}`);
        }
    } finally {
        if (connection) await connection.end();
    }
}

testLogin().catch(console.error);
