export const DATASET_CONFIG = {
    ppl_densit: {
        name: 'Population Density',
        phrases: [
            "what is the",
            "what's the",
            "tell me the",
            "show me the",
            "compare the",
            "which state has higher",
            "which state has the highest",
            "which state has lower",
            "which state has the lowest",
            "higher",
            "highest",
            "lower",
            "lowest"
        ],
        completion: "population density",
        questionTemplates: [
            "what is the population density of",
            "compare the population density of",
            "which state has higher population density:"
        ]
    },
    walk_to_wo: {
        name: 'Walking to Work',
        phrases: [
            "what is the",
            "what's the",
            "tell me the",
            "show me the",
            "compare the",
            "which state has higher",
            "which state has the highest",
            "which state has lower",
            "which state has the lowest",
            "higher",
            "highest",
            "lower",
            "lowest"
        ],
        completion: "percentage of people who walk to work",
        questionTemplates: [
            "what is the percentage of people who walk to work in",
            "compare the percentage of people who walk to work in",
            "which state has a higher percentage of people who walk to work:"
        ]
    },
    transit_to: {
        name: 'Public Transit to Work',
        phrases: [
            "what is the",
            "what's the",
            "tell me the",
            "show me the",
            "compare the",
            "which state has higher",
            "which state has the highest",
            "which state has lower",
            "which state has the lowest",
            "higher",
            "highest",
            "lower",
            "lowest"
        ],
        completion: "percentage of people who commute by public transit",
        questionTemplates: [
            "what is the percentage of people who commute by public transit in",
            "compare the percentage of people who commute by public transit in",
            "which state has a higher percentage of public transit usage:"
        ]
    }
};

export const SPATIAL_PATTERN_KEYWORDS = [
    "spatial pattern",
    "spatial distribution",
    "clustering pattern",
    "density pattern",
    "density distribution"
]; 