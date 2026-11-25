const db = require('../../config/db');

const HISTORY_COLUMNS = ['birth_date_precision', 'death_date_precision', 'death_anniversary_lunar'];

async function queryPeopleWithHistory(buildSql, params, prefix = '') {
    const remaining = new Set(HISTORY_COLUMNS);
    while (true) {
        const fields = [...remaining].map((column) => `, ${prefix}${column}`).join('');
        try {
            return await db.query(buildSql(fields), params);
        } catch (error) {
            const missing = /^Unknown column '(?:\w+\.)?(\w+)' in 'field list'/i.exec(error.sqlMessage || error.message);
            if (error.code !== 'ER_BAD_FIELD_ERROR' || !missing || !remaining.delete(missing[1])) throw error;
        }
    }
}

module.exports = { queryPeopleWithHistory };
