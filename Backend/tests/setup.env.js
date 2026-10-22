// Preload cho `node --test`: ép test luôn trỏ vào DB "chết", không bao giờ chạm DB thật dù có Backend/.env.
// Chạy TRƯỚC mọi module; dotenv không ghi đè biến đã có nên .env/.env.local không thắng được các giá trị này.
Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_HOST: '127.0.0.1',
    DB_PORT: '1',
    DB_USER: 'test',
    DB_PASSWORD: 'test',
    DB_NAME: 'test',
    DB_SSL: 'false',
    DB_USE_PUBLIC_DNS: 'false',
    DB_CONNECT_TIMEOUT: '1000',
});
delete process.env.DATABASE_URL;
delete process.env.MYSQL_URL;
