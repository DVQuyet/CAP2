const REGIONAL_KINSHIP_PROFILES = {
    central: {
        grandparentSiblingChildSpouse: 'mự',
        grandparentSiblingChildSpouseMale: 'dượng',
        paternalAunt: 'o',
    },
    north: {
        grandparentSiblingChildSpouse: 'mợ/dượng',
        grandparentSiblingChildSpouseMale: 'dượng',
        paternalAunt: 'cô',
    },
    south: {
        grandparentSiblingChildSpouse: 'mợ/dượng',
        grandparentSiblingChildSpouseMale: 'dượng',
        paternalAunt: 'cô',
    },
};

function getRegionalKinshipProfile(region = 'central') {
    return REGIONAL_KINSHIP_PROFILES[region] || REGIONAL_KINSHIP_PROFILES.central;
}

module.exports = {
    REGIONAL_KINSHIP_PROFILES,
    getRegionalKinshipProfile,
};
