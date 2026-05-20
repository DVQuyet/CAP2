const dns = require('dns');
const net = require('net');
const mysql = require('mysql2');
require('dotenv').config();

const dbHost = process.env.DB_HOST;
const dbPort = Number(process.env.DB_PORT || 3306);
const usePublicDns = String(process.env.DB_USE_PUBLIC_DNS || '').toLowerCase() === 'true';
const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const rejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'false').toLowerCase() !== 'false';
const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT || 5);

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

module.exports = db;
