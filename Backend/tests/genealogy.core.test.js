const assert = require('assert');
const core = require('../src/modules/genealogy/core');
const { buildFixtureRows, person, MALE, FEMALE } = require('./fixtures/genealogyFixture');

const NOW = new Date(Date.UTC(2026, 9, 5));
const graphOf = (mutate) => {
    const rows = buildFixtureRows();
    if (mutate) mutate(rows);
    return core.buildKinshipGraph(rows);
};
const label = (graph, a, b, region = 'north') => core.describeKinship(graph, a, b, { region, now: NOW })?.label;
const codes = (issues) => issues.map((issue) => issue.code).sort();

// ---------- Ngày tháng có độ chính xác ----------
{
    const year = core.parseHistoricalDate('1900-01-01', 'year');
    const exact = core.parseHistoricalDate('1900-06-15', 'exact');
    assert.strictEqual(year.precision, 'year');
    assert.strictEqual(core.isDefinitelyBefore(year, exact), false, 'cùng năm thì không chắc chắn trước/sau');
    const approx = core.parseHistoricalDate('1900', 'approximate');
    assert.strictEqual(approx.uncertain, true);
    assert.strictEqual(core.parseHistoricalDate('1900-01-01', 'unknown'), null);
    assert.strictEqual(core.lifeStatus({ is_living: null }), 'unknown');
    assert.strictEqual(core.lifeStatus({ is_living: 1, birth_date: '1850-01-01' }, NOW), 'deceased', 'sinh quá 120 năm coi như đã mất');
    assert.strictEqual(core.lifeStatus({ is_living: 1, birth_date: '1990-01-01' }, NOW), 'living');
}

// ---------- Xưng hô ----------
{
    const graph = graphOf();
    // Vai vế: 17 lớn tuổi hơn 16 nhưng thuộc nhánh em (ông Hai) nên là em họ.
    assert.strictEqual(label(graph, 16, 17), 'em họ');
    assert.strictEqual(label(graph, 17, 16), 'anh họ');
    assert.strictEqual(label(graph, 16, 12), 'chú họ');
    assert.strictEqual(label(graph, 16, 6), 'ông chú');
    assert.strictEqual(label(graph, 16, 5), 'bà cô');
    assert.strictEqual(label(graph, 16, 4), 'ông nội');
    assert.strictEqual(label(graph, 16, 1), 'cụ nội');
    assert.strictEqual(label(graph, 16, 1, 'south'), 'ông cố nội');
    assert.strictEqual(label(graph, 16, 11), 'cô');
    assert.strictEqual(label(graph, 16, 11, 'central'), 'o');
    // Vợ cả / vợ lẽ.
    assert.strictEqual(label(graph, 7, 2), 'mẹ cả');
    assert.strictEqual(label(graph, 4, 3), 'dì');
    // Dâu, rể, bên chồng.
    assert.strictEqual(label(graph, 4, 14), 'con dâu');
    assert.strictEqual(label(graph, 14, 4), 'bố chồng');
    assert.strictEqual(label(graph, 14, 4, 'south'), 'ba chồng');
    assert.strictEqual(label(graph, 11, 14), 'chị dâu');
    assert.strictEqual(label(graph, 14, 11), 'em chồng');
    assert.strictEqual(label(graph, 16, 15), 'thím họ');
    assert.strictEqual(label(graph, 16, 9), 'bà thím');
    assert.strictEqual(label(graph, 16, 19), 'dượng họ');
    // Con thừa tự là anh/em nuôi; thông gia.
    assert.strictEqual(label(graph, 16, 21), 'em nuôi');
    assert.strictEqual(label(graph, 10, 21), 'con thừa tự');
    assert.strictEqual(label(graph, 12, 25), 'thông gia');
    assert.strictEqual(label(graph, 12, 25, 'south'), 'sui gia');
    assert.strictEqual(label(graph, 4, 16), 'cháu nội');
    assert.strictEqual(label(graph, 13, 16), 'cháu họ');
}

// Mẹ kế, cha dượng, con riêng, anh em cột chèo.
{
    const graph = graphOf((rows) => {
        rows.people.push(
            person(40, 'Cha', MALE, 3, 1950),
            person(41, 'Mẹ (mất 1980)', FEMALE, 3, 1952, { death_date: '1980-05-01', death_date_precision: 'exact' }),
            person(42, 'Mẹ kế', FEMALE, 3, 1955),
            person(43, 'Con', MALE, 4, 1975),
            person(44, 'Con riêng mẹ kế', FEMALE, 4, 1978),
            person(45, 'Chồng trước mẹ kế', MALE, 3, 1950),
            person(46, 'Em gái Mẹ kế', FEMALE, 3, 1960),
            person(47, 'Chồng em gái mẹ kế', MALE, 3, 1958),
            person(48, 'Ông ngoại con riêng', MALE, 2, 1925),
        );
        rows.families.push(
            { id: 140, father_id: 40, mother_id: 41, relationship_status: 'widowed', wife_rank: 1 },
            { id: 141, father_id: 40, mother_id: 42, relationship_status: 'active', marriage_date: '1982-01-01', wife_rank: 2 },
            { id: 142, father_id: 45, mother_id: 42, relationship_status: 'divorced' },
            { id: 143, father_id: 48, mother_id: null, relationship_status: 'active' },
            { id: 144, father_id: 47, mother_id: 46, relationship_status: 'active' },
        );
        rows.children.push(
            { family_id: 140, person_id: 43, sort_order: 1 },
            { family_id: 142, person_id: 44, sort_order: 1 },
            { family_id: 143, person_id: 42, sort_order: 1 },
            { family_id: 143, person_id: 46, sort_order: 2 },
        );
    });
    assert.strictEqual(label(graph, 43, 42), 'mẹ kế');
    assert.strictEqual(label(graph, 44, 40), 'cha dượng');
    assert.strictEqual(label(graph, 40, 44), 'con riêng của vợ');
    assert.strictEqual(label(graph, 43, 44), 'em kế', 'con riêng của mẹ kế, nhỏ tuổi hơn');
    assert.strictEqual(label(graph, 40, 47), 'em cột chèo');
}

// ---------- Dòng họ và đời ----------
{
    const graph = graphOf();
    const lineage = core.computeLineage(graph);
    assert.strictEqual(lineage.get(1).role, 'founder');
    assert.strictEqual(lineage.get(2).role, 'in_law');
    assert.strictEqual(lineage.get(14).role, 'in_law');
    assert.strictEqual(lineage.get(21).role, 'descendant', 'con thừa tự nối dòng theo gia đình nhận nuôi');
    assert.strictEqual(lineage.get(20).role, 'outside', 'con của con gái lấy chồng ngoài không thuộc dòng nội');
    assert.strictEqual(lineage.get(25).role, 'outside_founder', 'nhà thông gia là dòng ngoài');

    const generations = core.computeGenerations(graph);
    assert.strictEqual(generations.get(16), 4);
    assert.strictEqual(generations.get(14), 3, 'dâu cùng đời với chồng');

    // Gán Ông Cả làm con của chính cháu mình: vòng lặp tổ tiên.
    const looped = graphOf((rows) => {
        rows.children.find((row) => row.person_id === 4).family_id = 105;
    });
    assert.ok(core.validateGraph(looped, { now: NOW }).some((issue) => issue.code === 'ANCESTOR_LOOP'));
    const selfParent = graphOf((rows) => {
        rows.children.find((row) => row.person_id === 10).family_id = 105;
    });
    assert.ok(core.validateGraph(selfParent, { now: NOW }).some((issue) => issue.code === 'SELF_PARENT'));

    // Đổi cha mẹ của cả nhánh: đời được tính lại cho con cháu và dâu rể.
    const rehomed = graphOf((rows) => {
        rows.children.find((row) => row.person_id === 12).family_id = 103; // Chú Mười Hai thành con Ông Cả
        rows.people.find((row) => row.id === 4).generation = 2;
    });
    const scope = core.affectedLineageIds(rehomed, [12]);
    assert.ok(scope.has(17) && scope.has(15), 'phạm vi gồm con cháu và vợ/chồng');
    assert.deepStrictEqual(core.generationChanges(rehomed, core.DEFAULT_POLICY, scope), []);
}

// ---------- Kiểm tra quan hệ ----------
{
    // Gia phả mẫu chỉ có một điểm cần xác nhận: cụ Tổ có vợ lẽ (dữ liệu lịch sử, được phép lưu sau khi xác nhận).
    const fixtureIssues = core.validateGraph(graphOf(), { now: NOW });
    assert.deepStrictEqual([...new Set(codes(fixtureIssues))], ['CONCURRENT_UNIONS']);
    assert.ok(fixtureIssues.every((item) => item.historical));
    assert.strictEqual(core.classifyIssues(fixtureIssues).blocking.length, 0);

    // Con sinh trước cha: lỗi; nếu ngày chỉ ước lượng thì hạ xuống cảnh báo.
    const bornBefore = graphOf((rows) => { rows.people.find((row) => row.id === 16).birth_date = '1890-01-01'; });
    const issue = core.validateGraph(bornBefore, { now: NOW }).find((item) => item.code === 'PARENT_BORN_AFTER_CHILD');
    assert.strictEqual(issue.severity, 'error');
    const approx = graphOf((rows) => {
        const row = rows.people.find((item) => item.id === 16);
        row.birth_date = '1890-01-01';
        row.birth_date_precision = 'approximate';
    });
    assert.strictEqual(core.validateGraph(approx, { now: NOW }).find((item) => item.code === 'PARENT_BORN_AFTER_CHILD').severity, 'warning');

    // Tảo hôn ngày xưa: cha mẹ 14 tuổi là cảnh báo (không chặn); 10 tuổi là vô lý.
    const young = graphOf((rows) => { rows.people.find((row) => row.id === 16).birth_date = '1914-06-01'; rows.people.find((row) => row.id === 16).birth_date_precision = 'exact'; });
    assert.ok(codes(core.validateGraph(young, { now: NOW })).includes('PARENT_UNDER_AGE'));

    // Con sinh sau khi mẹ mất.
    const posthumous = graphOf((rows) => {
        const mother = rows.people.find((row) => row.id === 14);
        mother.death_date = '1920-01-01';
        mother.death_date_precision = 'exact';
    });
    assert.ok(codes(core.validateGraph(posthumous, { now: NOW })).includes('BORN_AFTER_MOTHER_DEATH'));

    // Hai cha mẹ ruột.
    const twoBio = graphOf((rows) => {
        rows.children.find((row) => row.person_id === 21 && row.family_id === 105).child_type = 'biological';
    });
    assert.ok(codes(core.validateGraph(twoBio, { now: NOW })).includes('MULTIPLE_BIOLOGICAL_PARENTS'));
}

// Kết hôn trong 3 đời: dữ liệu lịch sử thì cần xác nhận, người còn sống thì chặn.
{
    const cousins = (living) => graphOf((rows) => {
        if (living) {
            rows.people.find((row) => row.id === 10).is_living = 1;
            rows.people.find((row) => row.id === 10).birth_date = '1990-01-01';
            rows.people.find((row) => row.id === 13).is_living = 1;
            rows.people.find((row) => row.id === 13).birth_date = '1992-01-01';
        }
        rows.families.push({ id: 150, father_id: 10, mother_id: 13, relationship_status: 'divorced' });
    });
    const historical = core.validateGraph(cousins(false), { now: NOW, scope: { familyIds: [150] } })
        .find((item) => item.code === 'MARRIAGE_WITHIN_THREE_GENERATIONS');
    assert.strictEqual(historical.historical, true);
    assert.strictEqual(core.classifyIssues([historical]).confirm.length, 1);

    const living = core.validateGraph(cousins(true), { now: NOW, scope: { familyIds: [150] } })
        .find((item) => item.code === 'MARRIAGE_WITHIN_THREE_GENERATIONS');
    assert.strictEqual(living.historical, false);
    assert.strictEqual(core.classifyIssues([living]).blocking.length, 1);

    // Có chung tổ tiên 4 đời (anh em họ đời thứ 4) chỉ là thông báo phong tục.
    const distant = graphOf((rows) => {
        rows.families.push({ id: 151, father_id: 16, mother_id: 20, relationship_status: 'active' });
        rows.people.find((row) => row.id === 20).gender = FEMALE;
    });
    const distantIssues = core.validateGraph(distant, { now: NOW, scope: { familyIds: [151] } });
    assert.deepStrictEqual(codes(distantIssues), ['MARRIAGE_SAME_ANCESTOR']);
}

// Nhiều vợ cùng lúc.
{
    const polygamy = (unionType, living) => graphOf((rows) => {
        rows.people.push(
            person(60, 'Chồng', MALE, 4, living ? 1980 : 1900, { is_living: living ? 1 : 0 }),
            person(61, 'Vợ một', FEMALE, 4, living ? 1982 : 1902, { is_living: living ? 1 : 0 }),
            person(62, 'Vợ hai', FEMALE, 4, living ? 1985 : 1905, { is_living: living ? 1 : 0 }),
        );
        rows.families.push(
            { id: 160, father_id: 60, mother_id: 61, relationship_status: 'active', marriage_date: living ? '2005-01-01' : '1920-01-01', marriage_date_precision: 'year' },
            { id: 161, father_id: 60, mother_id: 62, relationship_status: 'active', union_type: unionType, marriage_date: living ? '2010-01-01' : '1925-01-01', marriage_date_precision: 'year' },
        );
    });
    const living = core.validateGraph(polygamy('marriage', true), { now: NOW, scope: { familyIds: [161] } });
    const concurrent = living.find((item) => item.code === 'CONCURRENT_UNIONS');
    assert.ok(concurrent && !concurrent.historical);
    assert.strictEqual(core.classifyIssues([concurrent]).blocking.length, 1);
    const cohabitation = core.validateGraph(polygamy('cohabitation', true), { now: NOW, scope: { familyIds: [161] } })
        .find((item) => item.code === 'CONCURRENT_UNIONS');
    assert.strictEqual(core.classifyIssues([cohabitation], { allowSensitive: true }).confirm[0].sensitive, true);
    assert.strictEqual(core.classifyIssues([cohabitation], { allowSensitive: false }).blocking.length, 1);
    const historical = core.validateGraph(polygamy('concubine', false), { now: NOW, scope: { familyIds: [161] } })
        .find((item) => item.code === 'CONCURRENT_UNIONS');
    assert.strictEqual(historical.historical, true, 'vợ lẽ trước mốc luật là dữ liệu lịch sử');

    // Tái hôn sau khi vợ trước mất (chưa cập nhật trạng thái) không bị coi là đa thê.
    const remarried = graphOf((rows) => {
        rows.people.push(
            person(70, 'Ông', MALE, 4, 1950, { is_living: 1 }),
            person(71, 'Bà trước', FEMALE, 4, 1952, { is_living: 0, death_date: '2000-03-01', death_date_precision: 'exact' }),
            person(72, 'Bà sau', FEMALE, 4, 1960, { is_living: 1 }),
        );
        rows.families.push(
            { id: 170, father_id: 70, mother_id: 71, relationship_status: 'active' },
            { id: 171, father_id: 70, mother_id: 72, relationship_status: 'active', marriage_date: '2003-01-01' },
        );
    });
    assert.ok(!codes(core.validateGraph(remarried, { now: NOW, scope: { familyIds: [171] } })).includes('CONCURRENT_UNIONS'));
}

// Cấm kết hôn với cha mẹ chồng/vợ cũ và cha dượng/mẹ kế.
{
    const graph = graphOf((rows) => {
        rows.families.push({ id: 180, father_id: 4, mother_id: 14, relationship_status: 'active' });
    });
    assert.ok(codes(core.validateGraph(graph, { now: NOW, scope: { familyIds: [180] } })).includes('MARRIAGE_PARENT_IN_LAW'));
}

// Chỉ những vấn đề mới phát sinh mới bị tính.
{
    const before = [{ code: 'A', severity: 'warning', personIds: [1], familyId: null }];
    const after = [...before, { code: 'B', severity: 'error', personIds: [2], familyId: 3 }];
    assert.deepStrictEqual(core.diffIssues(before, after).map((item) => item.code), ['B']);
}

console.log('genealogy.core.test.js passed');
