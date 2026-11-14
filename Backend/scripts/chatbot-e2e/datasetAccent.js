// Dòng họ thứ ba (họ Trần, clan 15) cho bộ câu đo "tiếng Việt có dấu": mọi từ xưng hô và tên người
// dễ lẫn khi bỏ dấu đều ứng với những người KHÁC nhau, để câu trả lời sai lộ ra ngay.
// Người hỏi: Trần Văn Minh (id 30, đời 4), con của Trần Văn Hùng và Phạm Thị Hòa.
//
//   bà  = bà nội Nguyễn Thị Hoa, bà ngoại Vũ Thị Sáu      ba  = cha Trần Văn Hùng
//   cô  = Trần Thị Út (em gái của cha)                     cố  = cụ Trần Văn Cả, cụ Lê Thị Lễ
//   chú = Trần Văn Nam, thím = Đỗ Thị Hóa                  bà cô = Trần Thị Năm (em gái ông nội)
//   cậu = Phạm Văn Cường, mợ = Lý Thị Mơ, dì = Phạm Thị Thủy
//   Tên dễ lẫn: Hoa / Hòa / Hóa, Hùng / Hưng, Nam / Năm, Lễ (tên) / Lê (họ), Út và Cả (tên trùng từ thứ bậc).
module.exports = function buildAccentDataset({ person, family, child, clan, M, F }) {
    const CLAN_ID = 15;
    const ME = 30;
    const p = (id, displayName, gender, generation, extra = {}) => ({
        ...person(id, displayName, gender, generation, extra),
        clan_id: CLAN_ID,
        hometown: 'Đức Thọ, Hà Tĩnh',
    });
    const people = [
        p(1, 'Trần Văn Cả', M, 1, { is_living: 0, birth_date: '1900-01-01', birth_date_precision: 'year', death_anniversary_lunar: '02-12' }),
        p(2, 'Lê Thị Lễ', F, 1, { is_living: 0, birth_date: '1905-01-01', birth_date_precision: 'year' }),
        p(3, 'Trần Văn Hưng', M, 2, { is_living: 0, birth_date: '1930-03-03', death_date: '2001-05-05', death_anniversary_lunar: '04-13' }),
        p(4, 'Nguyễn Thị Hoa', F, 2, { birth_date: '1934-04-04' }),
        p(5, 'Trần Thị Năm', F, 2, { birth_date: '1938-08-08' }),
        p(6, 'Trần Văn Hùng', M, 3, { birth_date: '1958-06-06' }),
        p(7, 'Phạm Thị Hòa', F, 3, { birth_date: '1960-07-07' }),
        p(8, 'Trần Văn Nam', M, 3, { birth_date: '1963-09-09', phone: '0900000008', email: 'nam@example.test', address: 'Số 8 đường Mẫu' }),
        p(9, 'Đỗ Thị Hóa', F, 3, { birth_date: '1966-10-10' }),
        p(10, 'Trần Thị Út', F, 3, { birth_date: '1970-11-11' }),
        p(11, 'Phạm Văn Dũng', M, 2, { is_living: 0, birth_date: '1932-02-02' }),
        p(12, 'Vũ Thị Sáu', F, 2, { birth_date: '1936-06-16' }),
        p(13, 'Phạm Văn Cường', M, 3, { birth_date: '1964-04-14' }),
        p(14, 'Lý Thị Mơ', F, 3, { birth_date: '1968-08-18' }),
        p(15, 'Phạm Thị Thủy', F, 3, { birth_date: '1967-07-17' }),
        p(30, 'Trần Văn Minh', M, 4, { birth_date: '1990-01-10' }),
        p(31, 'Trần Thị Quý', F, 4, { birth_date: '1994-04-20' }),
        p(32, 'Trần Văn Khôi', M, 4, { birth_date: '1992-02-22' }),
    ];
    const f = (id, fatherId, motherId) => ({ ...family(id, fatherId, motherId), clan_id: CLAN_ID });
    const families = [f(1, 1, 2), f(2, 3, 4), f(3, 6, 7), f(4, 8, 9), f(5, 11, 12), f(6, 13, 14)];
    const children = [
        child(1, 3, 1), child(1, 5, 2),
        child(2, 6, 1), child(2, 8, 2), child(2, 10, 3),
        child(3, 30, 1), child(3, 31, 2),
        child(4, 32, 1),
        child(5, 7, 1), child(5, 13, 2), child(5, 15, 3),
    ];
    return {
        clanId: CLAN_ID,
        me: ME,
        people,
        families,
        children,
        clan: { ...clan, id: CLAN_ID, clan_name: 'Họ Trần làng Đức Thọ', history: null, hall_address: null },
    };
};
