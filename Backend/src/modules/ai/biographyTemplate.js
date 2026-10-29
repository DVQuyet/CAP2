// Bản tiểu sử / lời tưởng niệm dựng tất định từ dữ kiện, dùng khi AI không khả dụng hoặc bị bác vì bịa chi tiết.
// Chỉ ghép những gì có trong dữ kiện; thiếu thông tin thì bỏ câu đó (không in "undefined"/"null").

const joinList = (items, andWord) => {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} ${andWord} ${items[items.length - 1]}`;
};

function vietnamese(facts, { purpose, tone, length }) {
    const { person, parents, spouses, children } = facts;
    const title = person.gender === 'female' ? 'Bà' : person.gender === 'male' ? 'Ông' : 'Người';
    const pronoun = person.gender === 'female' ? 'Bà' : person.gender === 'male' ? 'Ông' : 'Người';
    const memorial = purpose === 'memorial';
    const medium = length === 'medium';
    const sentences = [];

    if (memorial) {
        sentences.push(tone === 'warm'
            ? `Hôm nay, con cháu cùng quây quần để tưởng nhớ ${title.toLowerCase()} ${person.name}.`
            : `Nhân ngày giỗ, con cháu kính cẩn tưởng nhớ ${title.toLowerCase()} ${person.name}.`);
    }

    let intro = `${title} ${person.name}`;
    if (person.birth) intro += ` sinh ${/^\d{4}$/.test(person.birth) ? 'năm' : /^\d{2}\/\d{4}$/.test(person.birth) ? 'tháng' : 'ngày'} ${person.birth}`;
    if (person.hometown) intro += `${person.birth ? ',' : ''} quê ở ${person.hometown}`;
    if (!person.birth && !person.hometown) {
        intro += person.generation ? ` là thành viên đời thứ ${person.generation}` : ' là thành viên';
        intro += person.clan ? ` của dòng họ ${person.clan}` : ' của dòng họ';
    }
    sentences.push(`${intro}.`);

    if (parents.length) {
        const fathers = parents.filter((item) => item.relation === 'father').map((item) => item.name);
        const mothers = parents.filter((item) => item.relation === 'mother').map((item) => item.name);
        const names = [...new Set([...fathers, ...mothers])];
        sentences.push(`${pronoun} là con của ${joinList(names, 'và')}.`);
    }

    if (medium || !memorial) {
        if (spouses.length) sentences.push(`${pronoun} kết duyên cùng ${joinList(spouses.map((item) => item.name), 'và')}.`);
    }
    if (children.length) {
        const listed = children.slice(0, medium ? 8 : 3).map((child) => (child.birth_year && medium ? `${child.name} (sinh ${child.birth_year})` : child.name));
        sentences.push(`${pronoun} có ${children.length} người con: ${joinList(listed, 'và')}${children.length > listed.length ? ' và các con khác' : ''}.`);
    }

    if (!person.is_living && person.death) {
        sentences.push(`${pronoun} qua đời ${/^\d{4}$/.test(person.death) ? 'năm' : /^\d{2}\/\d{4}$/.test(person.death) ? 'tháng' : 'ngày'} ${person.death}.`);
    }
    if (!person.is_living && person.death_anniversary_lunar) {
        sentences.push(`Ngày giỗ của ${title.toLowerCase()} vào ngày ${person.death_anniversary_lunar} âm lịch.`);
    }

    if (medium && facts.memories.length) {
        sentences.push(`Gia đình còn lưu những kỷ niệm: ${joinList(facts.memories.map((item) => item.title).filter(Boolean), 'và')}.`);
    }

    if (memorial) {
        sentences.push(tone === 'warm'
            ? `Xin thắp nén hương lòng, nguyện cầu ${title.toLowerCase()} an nghỉ và phù hộ cho con cháu bình an.`
            : `Kính xin ${title.toLowerCase()} chứng giám lòng thành của con cháu và phù hộ cho gia đình bình an.`);
    }
    return sentences.join(' ');
}

function english(facts, { purpose, tone, length }) {
    const { person, parents, spouses, children } = facts;
    const subject = person.gender === 'female' ? 'She' : person.gender === 'male' ? 'He' : 'This person';
    const possessive = person.gender === 'female' ? 'her' : person.gender === 'male' ? 'his' : 'their';
    const memorial = purpose === 'memorial';
    const medium = length === 'medium';
    const sentences = [];

    if (memorial) {
        sentences.push(tone === 'warm'
            ? `Today the family gathers to remember ${person.name}.`
            : `On this memorial day, the descendants solemnly remember ${person.name}.`);
    }

    let intro = person.name;
    if (person.birth) intro += ` was born ${/^\d{4}$/.test(person.birth) ? 'in' : 'on'} ${person.birth}`;
    if (person.hometown) intro += `${person.birth ? ' and is from' : ' is from'} ${person.hometown}`;
    if (!person.birth && !person.hometown) {
        intro += person.generation ? ` is a member of generation ${person.generation}` : ' is a member';
        intro += person.clan ? ` of the ${person.clan} clan` : ' of the clan';
    }
    sentences.push(`${intro}.`);

    if (parents.length) sentences.push(`${subject} is the child of ${joinList([...new Set(parents.map((item) => item.name))], 'and')}.`);
    if ((medium || !memorial) && spouses.length) sentences.push(`${subject} married ${joinList(spouses.map((item) => item.name), 'and')}.`);
    if (children.length) {
        const listed = children.slice(0, medium ? 8 : 3).map((child) => (child.birth_year && medium ? `${child.name} (born ${child.birth_year})` : child.name));
        sentences.push(`${subject} had ${children.length} ${children.length === 1 ? 'child' : 'children'}: ${joinList(listed, 'and')}${children.length > listed.length ? ' and others' : ''}.`);
    }
    if (!person.is_living && person.death) sentences.push(`${subject} passed away ${/^\d{4}$/.test(person.death) ? 'in' : 'on'} ${person.death}.`);
    if (!person.is_living && person.death_anniversary_lunar) sentences.push(`${possessive.charAt(0).toUpperCase() + possessive.slice(1)} memorial day falls on ${person.death_anniversary_lunar} (lunar calendar).`);
    if (memorial) sentences.push(tone === 'warm' ? 'May they rest in peace and watch over the family.' : 'We offer our respect and pray for the family\'s peace.');
    return sentences.join(' ');
}

function buildTemplateBiography(facts, { purpose = 'biography', tone = 'formal', length = 'short', language = 'vi' } = {}) {
    const options = { purpose, tone, length };
    return (language === 'en' ? english(facts, options) : vietnamese(facts, options)).replace(/\s+/g, ' ').trim();
}

module.exports = { buildTemplateBiography };
