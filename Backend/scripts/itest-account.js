// Tạo dòng họ + tài khoản tạm (ITEST_/itest_) để QA tay trên trình duyệt. In JSON gồm email/mật khẩu.
// Dọn bằng:  node scripts/itest-cleanup.js
//   node scripts/itest-account.js           manager + member cùng dòng họ, có vài người trên cây (một người đã mất)
process.env.RUN_DB_TESTS = '1';
require('../src/config/loadEnv');
const { db, createTempClan, createTempPerson, createTempAccount } = require('../tests-integration/helpers/fixtures');

(async () => {
    const clanId = await createTempClan('QA');
    const manager = await createTempAccount({ role: 'manager', clanId, password: 'Itest#QA12345' });
    const member = await createTempAccount({ role: 'member', clanId, password: 'Itest#QA12345' });
    const grandfather = await createTempPerson({ clanId, exactName: 'Nguyễn Văn Lâm', generation: 1, birthDate: '1940-10-25', deathDate: '2010-03-02', isLiving: 0, hometown: 'Nam Định' });
    const grandmother = await createTempPerson({ clanId, exactName: 'Lê Thị Hoa', gender: 2, generation: 1 });
    const [family] = await db.query('INSERT INTO families (clan_id, father_id, mother_id) VALUES (?, ?, ?)', [clanId, grandfather, grandmother]);
    await db.query('INSERT INTO children (family_id, person_id, sort_order) VALUES (?, ?, 1), (?, ?, 2)', [family.insertId, manager.personId, family.insertId, member.personId]);
    await db.query('UPDATE people SET generation = 2 WHERE id IN (?, ?)', [manager.personId, member.personId]);
    console.log(JSON.stringify({
        clanId,
        manager: { email: manager.email, password: manager.password, personId: manager.personId },
        member: { email: member.email, password: member.password, personId: member.personId },
        deceasedPersonId: grandfather,
    }));
    await db.end();
})().catch((error) => { console.error(error); process.exit(1); });
