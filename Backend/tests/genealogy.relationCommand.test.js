// Bản nháp quan hệ + ghi DB, chạy với kết nối giả (không cần MySQL).
const assert = require('assert');
const { RelationDraft, RelationError } = require('../src/modules/genealogy/relationCommand.service');
const { DEFAULT_POLICY } = require('../src/modules/genealogy/core');
const { buildFixtureRows, person, MALE, FEMALE } = require('./fixtures/genealogyFixture');

const NOW = new Date(Date.UTC(2026, 9, 5));

const fakeConnection = () => {
    const queries = [];
    let nextId = 900;
    return {
        queries,
        async query(sql, params = []) {
            queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
            if (/^\s*INSERT/i.test(sql)) {
                nextId += 1;
                return [{ insertId: nextId, affectedRows: 1 }];
            }
            return [{ affectedRows: 1 }];
        },
    };
};

const draftOf = (mutate) => {
    const rows = buildFixtureRows();
    if (mutate) mutate(rows);
    const connection = fakeConnection();
    const draft = new RelationDraft({ connection, clanId: 1, rows, policy: DEFAULT_POLICY, now: NOW });
    return { draft, connection };
};

const expectRelationError = (fn, code) => {
    try {
        fn();
    } catch (error) {
        assert.ok(error instanceof RelationError, 'phải là RelationError');
        if (code) assert.strictEqual(error.relationResult.code, code);
        return error;
    }
    throw new Error(`Mong lỗi ${code}`);
};

(async () => {
    // Thêm con cho người có 2 vợ: chọn đúng cuộc hôn nhân, không tự gán vợ cả.
    {
        const { draft, connection } = draftOf((rows) => {
            rows.people.push(person(30, 'Con vợ hai', MALE, 1, 1885)); // đời nhập sai, sẽ được sửa theo cha
        });
        const family = draft.upsertUnion({ personId: 1, spouseId: 3 });
        assert.strictEqual(family.id, 102, 'dùng gia đình cụ Tổ - vợ hai đã có');
        draft.addChildLink(family.id, 30, { childType: 'biological' });
        const evaluation = draft.evaluate({ force: false });
        assert.strictEqual(evaluation.ok, true, evaluation.message);
        const committed = await draft.commit({ evaluation });
        assert.ok(connection.queries.some((query) => query.sql.startsWith('INSERT INTO children') && query.params[0] === 102 && query.params[1] === 30));
        assert.deepStrictEqual(committed.generationChanges.map((change) => [change.personId, change.to]), [[30, 2]]);
    }

    // Con "không rõ mẹ": tạo gia đình một cha mẹ, không gắn vào vợ hiện tại.
    {
        const { draft, connection } = draftOf((rows) => {
            rows.people.push(person(31, 'Con không rõ mẹ', FEMALE, 4, 1930));
        });
        const family = draft.upsertUnion({ personId: 10, spouseId: null });
        assert.ok(family.id < 0, 'gia đình mới');
        assert.strictEqual(family.mother_id, null);
        draft.addChildLink(family.id, 31);
        const evaluation = draft.evaluate();
        assert.strictEqual(evaluation.ok, true, evaluation.message);
        await draft.commit({ evaluation });
        const familyInsert = connection.queries.find((query) => query.sql.startsWith('INSERT INTO families'));
        assert.strictEqual(familyInsert.params[1], 10, 'cha là 10');
        assert.strictEqual(familyInsert.params[2], null, 'mẹ để trống');
    }

    // Đặt cha mẹ ruột mới chuyển người con khỏi gia đình cũ và cập nhật đời cả nhánh.
    {
        const { draft, connection } = draftOf();
        draft.setParents(12, { fatherId: 4, motherId: 8 });
        const evaluation = draft.evaluate();
        assert.strictEqual(evaluation.ok, true, evaluation.message);
        assert.deepStrictEqual(evaluation.generationChanges, [], 'Ông Cả và Ông Hai cùng đời nên đời không đổi');
        await draft.commit({ evaluation });
        assert.ok(connection.queries.some((query) => query.sql.startsWith('DELETE FROM children') && query.params[0] === 104 && query.params[1] === 12));
    }
    {
        const { draft } = draftOf();
        draft.setParents(6, { fatherId: 12, motherId: 15 });
        const evaluation = draft.evaluate();
        assert.strictEqual(evaluation.ok, false, 'Ông Hai làm con của chính con trai mình là vòng lặp');
        assert.strictEqual(evaluation.code, 'ANCESTOR_LOOP');
    }

    // Con nuôi / thừa tự giữ cha mẹ đẻ, đổi dòng chính.
    {
        const { draft } = draftOf((rows) => {
            rows.people.push(person(32, 'Cháu được nhận thừa tự', MALE, 4, 1931));
            rows.children.push({ family_id: 104, person_id: 32, sort_order: 3 });
        });
        draft.setParents(32, { fatherId: 4, motherId: 8, childType: 'heir' });
        const links = draft.parentLinksOf(32);
        assert.strictEqual(links.length, 2);
        assert.strictEqual(links.find((link) => link.child_type === 'heir').is_primary_lineage, 1);
        assert.strictEqual(links.find((link) => link.child_type === 'biological').is_primary_lineage, 0);
        assert.strictEqual(draft.evaluate().ok, true);
    }

    // Vợ hai của người còn sống: chặn; với quản lý và loại "chung sống không đăng ký": cần xác nhận + lý do, đặt chế độ chỉ quản lý xem.
    {
        const living = (rows) => {
            rows.people.push(
                person(40, 'Anh', MALE, 4, 1980, { is_living: 1 }),
                person(41, 'Vợ', FEMALE, 4, 1982, { is_living: 1 }),
                person(42, 'Người thứ hai', FEMALE, 4, 1985, { is_living: 1 }),
            );
            rows.families.push({ id: 140, father_id: 40, mother_id: 41, relationship_status: 'active' });
        };
        const blocked = draftOf(living).draft;
        blocked.upsertUnion({ personId: 40, spouseId: 42 });
        const blockedResult = blocked.evaluate({ allowSensitive: true });
        assert.strictEqual(blockedResult.ok, false);
        assert.strictEqual(blockedResult.code, 'STRICT_KINSHIP_CONFLICT');

        const { draft, connection } = draftOf(living);
        const family = draft.upsertUnion({ personId: 40, spouseId: 42, fields: { union_type: 'cohabitation' } });
        assert.strictEqual(family.wife_rank, 2, 'tự đánh thứ tự vợ');
        const needsReason = draft.evaluate({ allowSensitive: true, force: true });
        assert.strictEqual(needsReason.requiresConfirmation, true);
        assert.strictEqual(needsReason.reasonRequired, true);
        const evaluation = draft.evaluate({ allowSensitive: true, force: true, reason: 'Theo khai báo của gia đình' });
        assert.strictEqual(evaluation.ok, true);
        await draft.commit({ evaluation, accountId: 7, reason: 'Theo khai báo của gia đình' });
        const insert = connection.queries.find((query) => query.sql.startsWith('INSERT INTO families'));
        assert.ok(insert.params.includes('managers'), 'quan hệ nhạy cảm chỉ quản lý xem');
        const override = connection.queries.find((query) => query.sql.startsWith('INSERT INTO genealogy_relation_overrides'));
        assert.strictEqual(override.params[3], 'CONCURRENT_UNIONS');
        assert.strictEqual(override.params[9], 'Theo khai báo của gia đình');
    }

    // Vấn đề đã có từ trước không chặn sửa đổi không liên quan.
    {
        const { draft } = draftOf((rows) => {
            const child = rows.people.find((row) => row.id === 16);
            child.birth_date = '1890-01-01';
        });
        draft.updatePerson(16, { display_name: 'Anh Mười Sáu (đổi tên)' });
        assert.strictEqual(draft.evaluate().ok, true);
    }

    // Đặt đời trái với cha mẹ bị từ chối; đời do cha mẹ quyết định.
    {
        const { draft } = draftOf();
        draft.updatePerson(16, { generation: 7 });
        const evaluation = draft.evaluate();
        assert.strictEqual(evaluation.ok, false);
        assert.strictEqual(evaluation.code, 'GENERATION_DERIVED_FROM_PARENTS');
    }

    // Gỡ vợ/chồng: gia đình không có con thì xóa, có con thì giữ người còn lại.
    {
        const { draft, connection } = draftOf();
        const result = draft.unlinkSpouse({ personId: 17, familyId: 110 });
        assert.strictEqual(result, null);
        const evaluation = draft.evaluate();
        await draft.commit({ evaluation });
        assert.ok(connection.queries.some((query) => query.sql.startsWith('DELETE FROM families') && query.params[0] === 110));
    }
    {
        const { draft } = draftOf();
        const family = draft.unlinkSpouse({ personId: 10, familyId: 105 });
        assert.strictEqual(family.father_id, 10);
        assert.strictEqual(family.mother_id, null);
    }

    // Tự là cha mẹ của mình.
    {
        const { draft } = draftOf();
        expectRelationError(() => draft.setParents(10, { fatherId: 10 }), 'SELF_PARENT');
    }

    console.log('genealogy.relationCommand.test.js passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
