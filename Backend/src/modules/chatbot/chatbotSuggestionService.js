const DEFAULT_SUGGESTIONS = [
    'Ông nội của tôi là ai?',
    'Bà ngoại của tôi là ai?',
    'Tôi gọi người này bằng gì?',
    'Con của bác Hai là ai?',
    'Vợ của cậu Út tên gì?',
    'Người này thuộc đời thứ mấy?',
];

async function getSuggestions() {
    return DEFAULT_SUGGESTIONS.map((text, index) => ({
        id: index + 1,
        text,
        intent_hint: index < 2 ? 'find_by_kinship' : null,
    }));
}

module.exports = {
    getSuggestions,
};
