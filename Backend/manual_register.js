const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function manualRegister() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const email = 'test_manual@example.com';
        const password = 'password123';
        const hashedPassword = await bcrypt.hash(password, 10);
        
        console.log('Registering test_manual@example.com...');
        
        // Step 1: Create Person
        const [personResult] = await connection.query(
            `INSERT INTO people (display_name, first_name, surname, gender, birth_date, hometown, generation) VALUES (?, ?, ?, ?, ?, ?, 1)`,
            ['Test Manual', 'Manual', 'Test', 1, '1990-01-01', 'Hanoi']
        );
        const personId = personResult.insertId;

        // Step 2: Create Account
        await connection.query(
            `INSERT INTO accounts (email, password, person_id, role_id, status) VALUES (?, ?, ?, 3, 'active')`,
            [email, hashedPassword, personId]
        );

        console.log('Registration successful!');

        // Verify login
        const match = await bcrypt.compare(password, hashedPassword);
        console.log('Login verification:', match ? 'SUCCESS' : 'FAILED');

    } catch (err) {
        console.error('Registration failed:', err);
    } finally {
        await connection.end();
    }
}

manualRegister();
