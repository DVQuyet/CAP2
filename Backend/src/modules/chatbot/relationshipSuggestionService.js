function ruleBasedSuggestions({ relation } = {}) {
    const targetName = relation?.targetName || relation?.targetPerson?.name || 'người này';
    return [
        { type: 'explore_person', text: `${targetName} có con là ai?` },
        { type: 'explore_person', text: `Vợ/chồng của ${targetName} là ai?` },
        { type: 'explore_generation', text: `${targetName} thuộc đời thứ mấy?` },
        { type: 'explore_branch', text: `Nhánh của ${targetName} gồm những ai?` },
    ];
}

module.exports = {
    ruleBasedSuggestions,
};
