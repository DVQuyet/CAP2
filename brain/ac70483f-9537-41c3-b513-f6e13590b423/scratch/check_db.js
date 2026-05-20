const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkData() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('--- Latest Accounts ---');
        const [accounts] = await connection.query('SELECT id, email, password, role_id, status, created_at FROM accounts ORDER BY id DESC LIMIT 5');
        console.table(accounts.map(a => ({...a, password_prefix: a.password.substring(0, 10) + '...'})));

        console.log('--- Latest People ---');
        const [people] = await connection.query('SELECT id, display_name, clan_id, birth_date, created_at FROM people ORDER BY id DESC LIMIT 5');
        console.table(people);

        console.log('--- Latest Clans ---');
        const [clans] = await connection.query('SELECT id, clan_name, created_at FROM clans ORDER BY id DESC LIMIT 5');
        console.table(clans);

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkData();
