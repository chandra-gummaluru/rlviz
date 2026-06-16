export const SPEED_PRESETS = {
    fast: {
        PRE_SETUP_PAUSE: 200,
        POST_ERASE_PAUSE: 100,
        CAMERA_CENTER: 300,
        DECISION_PAUSE: 150,
        EDGE_HIGHLIGHT: 250,
        TRANSITION_PAUSE: 100,
        CAMERA_TRANSITION: 250
    },
    medium: {
        PRE_SETUP_PAUSE: 500,
        POST_ERASE_PAUSE: 300,
        CAMERA_CENTER: 600,
        DECISION_PAUSE: 400,
        EDGE_HIGHLIGHT: 600,
        TRANSITION_PAUSE: 300,
        CAMERA_TRANSITION: 600
    },
    slow: {
        PRE_SETUP_PAUSE: 800,
        POST_ERASE_PAUSE: 500,
        CAMERA_CENTER: 1000,
        DECISION_PAUSE: 700,
        EDGE_HIGHLIGHT: 1000,
        TRANSITION_PAUSE: 500,
        CAMERA_TRANSITION: 1000
    }
};

export const DEFAULT_SPEED = 'medium';