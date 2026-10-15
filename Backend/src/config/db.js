const dns = require('dns');
const net = require('net');
const mysql = require('mysql2');
require('dotenv').config();

const dbHost = process.env.DB_HOST;
const dbPort = Number(process.env.DB_PORT || 3306);
const usePublicDns = String(process.env.DB_USE_PUBLIC_DNS || '').toLowerCase() === 'true';
const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const rejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'false').toLowerCase() !== 'false';
const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT || 10);

const resolver = new dns.Resolver();
resolver.setServers(
    (process.env.DB_DNS_SERVERS || '8.8.8.8,1.1.1.1')
        .split(',')
        .map((server) => server.trim())
        .filter(Boolean)
);

const lookupWithPublicDns = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    resolver.resolve4(hostname, (resolveError, addresses) => {
        if (!resolveError && addresses && addresses.length > 0) {
            if (options && options.all) {
                callback(null, addresses.map((address) => ({ address, family: 4 })));
                return;
            }
            callback(null, addresses[0], 4);
            return;
        }

        dns.lookup(hostname, options, callback);
    });
};

const poolConfig = {
    host: dbHost,
    port: dbPort,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0
};

if (usePublicDns) {
    poolConfig.stream = () => net.connect({
        host: dbHost,
        port: dbPort,
        lookup: lookupWithPublicDns,
    });
}

if (useSsl) {
    poolConfig.ssl = {
        rejectUnauthorized
    };
}

const pool = mysql.createPool(poolConfig);

const db = pool.promise();

// Khi đã chạy `npm run migrate`, đặt DISABLE_RUNTIME_DDL=true để các hàm ensure*() rải rác trong
// controller không tự ALTER/CREATE trên đường xử lý request (tốn thời gian, khóa bảng, khó kiểm soát).
const DDL_PATTERN = /^\s*(ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX)\b/i;
const { AsyncLocalStorage } = require('async_hooks');
// Migrate chạy trong ngữ cảnh này nên được phép DDL, còn request khác trong cùng tiến trình vẫn bị chặn.
const ddlAllowedStore = new AsyncLocalStorage();
const isRuntimeDdlDisabled = () =>
    String(process.env.DISABLE_RUNTIME_DDL || '').toLowerCase() === 'true' && !ddlAllowedStore.getStore();
const skippedDdl = new Set();

const shouldSkipDdl = (sql) => {
    if (!isRuntimeDdlDisabled()) return false;
    const text = typeof sql === 'string' ? sql : sql && sql.sql;
    if (typeof text !== 'string' || !DDL_PATTERN.test(text)) return false;
    const head = text.replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!skippedDdl.has(head)) {
        skippedDdl.add(head);
        console.warn(`[db] DISABLE_RUNTIME_DDL: bỏ qua "${head}". Chạy npm run migrate nếu schema chưa đủ.`);
    }
    return true;
};

const SKIPPED_RESULT = () => [{ affectedRows: 0, warningStatus: 0 }, undefined];

const guardMethods = (target) => {
    for (const method of ['query', 'execute']) {
        const original = target[method];
        if (typeof original !== 'function') continue;
        target[method] = function guardedQuery(sql, ...rest) {
            if (shouldSkipDdl(sql)) return Promise.resolve(SKIPPED_RESULT());
            return original.call(this, sql, ...rest);
        };
    }
    return target;
};

guardMethods(db);

const originalGetConnection = db.getConnection.bind(db);
db.getConnection = async (...args) => guardMethods(await originalGetConnection(...args));

db.allowDdl = (callback) => ddlAllowedStore.run(true, callback);

module.exports = db;
