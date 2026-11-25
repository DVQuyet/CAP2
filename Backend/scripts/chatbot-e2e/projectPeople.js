function projectPeople(sql, rows) {
    const select = /^SELECT (.+?) FROM /i.exec(sql)?.[1];
    if (select === '*' || /^p\.\*$/i.test(select)) return rows;
    if (!select) throw new Error('Expected a SELECT projection for people');

    const columns = select.split(',').map((column) => {
        const match = /^(?:p\.)?([a-z_]\w*)(?:\s+AS\s+([a-z_]\w*))?$/i.exec(column.trim());
        if (!match) throw new Error(`Unsupported people projection: ${column.trim()}`);
        const [, field, alias = field] = match;
        return [field, alias];
    });
    return rows.map((row) => Object.fromEntries(columns.map(([field, alias]) => [alias, row[field]])));
}

module.exports = { projectPeople };
