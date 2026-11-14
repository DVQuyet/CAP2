// Dữ liệu mẫu cho scripts/chatbot-e2e-check.js (chuyển nguyên văn từ file đó).
// ---------------- Dòng họ thứ hai (họ Lê, clan 14): anh chị em của cha có thứ bậc sinh rõ ràng ----------------
// Dùng cho câu hỏi "chú út / bác cả / cô ba / thím năm / dượng ba". Người hỏi: Lê Văn Tâm (id 13), con của Lê Văn Phong (thứ 2).
// Anh chị em của cha theo năm sinh (đếm cả cha): 1 Đại 1950, 2 Phong 1953 (cha), 3 Hoa 1956, 4 Sơn 1960, 5 Út 1965.
module.exports = function buildLeDataset({ person, family, child, clan, M, F }) {
    const LE_CLAN_ID = 14;
    const LE_ME = 13;
    const lePerson = (id, displayName, gender, generation, extra = {}) => ({ ...person(id, displayName, gender, generation, extra), clan_id: LE_CLAN_ID, hometown: 'Hương Khê, Hà Tĩnh' });
    const lePeople = [
        lePerson(1, 'Lê Văn Tổ', M, 1, { is_living: 0, birth_date: '1920-01-01' }),
        lePerson(2, 'Nguyễn Thị Sen', F, 1, { is_living: 0, birth_date: '1924-01-01' }),
        lePerson(3, 'Lê Văn Đại', M, 2, { birth_date: '1950-03-03' }),
        lePerson(4, 'Lê Thị Hoa', F, 2, { birth_date: '1956-04-04' }),
        lePerson(5, 'Lê Văn Phong', M, 2, { birth_date: '1953-05-05' }),
        lePerson(6, 'Lê Văn Sơn', M, 2, { birth_date: '1960-06-06' }),
        lePerson(7, 'Lê Văn Út', M, 2, { birth_date: '1965-07-07' }),
        lePerson(8, 'Trần Thị Bích', F, 2, { birth_date: '1952-02-02' }),
        lePerson(9, 'Phạm Văn Kiên', M, 2, { birth_date: '1951-01-01' }),
        lePerson(10, 'Võ Thị Lài', F, 2, { birth_date: '1958-08-08' }),
        lePerson(11, 'Phạm Thị Thơm', F, 2, { birth_date: '1962-09-09' }),
        lePerson(12, 'Đỗ Thị Mận', F, 2, { birth_date: '1967-10-10' }),
        lePerson(13, 'Lê Văn Tâm', M, 3, { birth_date: '1990-01-01' }),
        lePerson(14, 'Lê Thị Na', F, 3, { birth_date: '1995-02-02' }),
        lePerson(15, 'Lê Văn Bảo', M, 3, { birth_date: '1988-03-03' }),
        lePerson(16, 'Lê Thị Chi', F, 3, { birth_date: '1992-04-04' }),
    ];
    const leFamily = (id, fatherId, motherId) => ({ ...family(id, fatherId, motherId), clan_id: LE_CLAN_ID });
    const leFamilies = [leFamily(1, 1, 2), leFamily(2, 3, 8), leFamily(3, 9, 4), leFamily(4, 5, 10), leFamily(5, 6, 11), leFamily(6, 7, 12)];
    const leChildren = [
        child(1, 3, 1), child(1, 5, 2), child(1, 4, 3), child(1, 6, 4), child(1, 7, 5),
        child(2, 15, 1), child(4, 13, 1), child(5, 16, 1), child(6, 14, 1),
    ];
    const leClan = { ...clan, id: LE_CLAN_ID, clan_name: 'Họ Lê làng Hương Khê', history: null, hall_address: null };
    return { clanId: LE_CLAN_ID, me: LE_ME, people: lePeople, families: leFamilies, children: leChildren, clan: leClan };
};
