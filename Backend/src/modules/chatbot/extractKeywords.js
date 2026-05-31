const STOP_WORDS = new Set([
    'la',
    'gi',
    'cua',
    'toi',
    'minh',
    'co',
    'khong',
    'bao',
    'nhieu',
    'va',
    'hay',
    'hoac',
    'thi',
    'ma',
    'de',
    'duoc',
    'voi',
    'ong',
    'ba',
    'anh',
    'chi',
    'em',
    'con',
    'chau',
    'vo',
    'chong',
]);

function stripAccents(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function extractKeywords(message) {
    const words = stripAccents(message)
        .toLowerCase()
        .replace(/[.,?!:;()[\]{}"']/g, ' ')
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

    return [...new Set(words)].map((word) => `+${word}*`).join(' ');
}

module.exports = {
    extractKeywords,
};
