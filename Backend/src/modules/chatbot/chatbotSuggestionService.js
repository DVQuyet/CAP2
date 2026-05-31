const DEFAULT_SUGGESTIONS = [
    'Trong gia phả có [Tên người] không?',
    'Ai là cha của [Tên người]?',
    'Con của [Tên người] là ai?',
    'Gia phả có bao nhiêu người?',
    'Dòng họ này có mấy đời?',
    'Giới thiệu về dòng họ',
];

async function getSuggestions() {
    return DEFAULT_SUGGESTIONS.map((text, index) => ({
        id: index + 1,
        text,
        intent_hint: ['person_exists', 'find_parents', 'list_children', 'stats_count', 'stats_count', 'clan_history'][index],
    }));
}

module.exports = {
    getSuggestions,
};
