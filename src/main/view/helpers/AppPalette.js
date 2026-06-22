// Canonical color palette for the rlviz application.
// All shared canvas, DOM, and CSS colors live here.
// Domain files must NOT reference this file.

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach(name => {
        const val = obj[name];
        if (val && typeof val === 'object') deepFreeze(val);
    });
    return Object.freeze(obj);
}

const AppPalette = deepFreeze({
    brand: {
        primary:  '#2196F3',
        success:  '#4CAF50',
        danger:   '#F44336',
        warning:  '#FF9800',
        purple:   '#9C27B0',
        gray:     '#757575'
    },
    text: {
        primary:     '#333333',
        secondary:   '#444444',
        muted:       '#555555',
        subtle:      '#666666',
        placeholder: '#999999',
        inverse:     '#FFFFFF',
        black:       '#000000',
        nearBlack:   '#1E1E1E',
        dark:        '#3C3C3C',
        medium:      '#505050',
        mediumDark:  '#464646',
        mediumLight: '#646464',
        light:       '#828282'
    },
    surface: {
        canvas: 240,       // p5 grayscale value for background()
        white:  '#FFFFFF',
        light:  '#F5F5F5',
        card:   '#F9F9F9'
    },
    border: {
        light:      '#DDDDDD',
        medium:     '#CCCCCC',
        row:        '#EEEEEE',
        canvasDark: '#3C3C3C'
    },
    node: {
        state:         '#BDBDBD',
        action:        '#424242',
        selected:      '#FFC107',
        held:          '#9CCC65',
        activeInitial: '#FF9800',
        badgeState:    '#2D6A4F',
        badgeAction:   '#1565C0',
        startRing:     '#FFC107'
    },
    edge: {
        default:      '#666666',
        highlighted:  '#FF5722',
        selectedText: '#FFC107',
        label:        '#505050'
    },
    reward: {
        positive:       '#2E7D32',
        positiveBright: '#4CAF50',
        negative:       '#C62828',
        negativeBright: '#F44336',
        positiveCss:    'hsl(140, 90%, 38%)',
        negativeCss:    'hsl(0, 90%, 40%)',
        zero:           '#000000',
        zeroMuted:      '#666666'
    },
    valueIteration: {
        best:            '#2EA043',
        result:          '#19507A',
        badge:           '#19507A',
        actionBlue:      '#6495ED',
        highlightYellow: '#FFF03C'
    },
    simulation: {
        travelBall:          '#FFD700',
        spinningArrow:       '#FF5722',
        spinLabelHighlight:  '#FFEB3B',
        spinLabelBackground: '#FFFFFF'
    }
});

function applyPaletteCssVars(rootElement) {
    const vars = {
        '--color-primary':    AppPalette.brand.primary,
        '--color-success':    AppPalette.brand.success,
        '--color-danger':     AppPalette.brand.danger,
        '--color-warning':    AppPalette.brand.warning,
        '--color-purple':     AppPalette.brand.purple,
        '--color-gray':       AppPalette.brand.gray,

        '--text-dark':        AppPalette.text.primary,
        '--text-medium':      AppPalette.text.secondary,
        '--text-muted':       AppPalette.text.muted,
        '--text-light':       AppPalette.text.subtle,
        '--text-placeholder': AppPalette.text.placeholder,
        '--text-white':       AppPalette.text.inverse,

        '--bg-white':  AppPalette.surface.white,
        '--bg-light':  AppPalette.surface.light,
        '--bg-card':   AppPalette.surface.card,

        '--border-light':  AppPalette.border.light,
        '--border-medium': AppPalette.border.medium,
        '--border-row':    AppPalette.border.row,

        '--reward-positive': AppPalette.reward.positiveCss,
        '--reward-negative': AppPalette.reward.negativeCss,
        '--reward-zero':     AppPalette.reward.zero
    };
    Object.entries(vars).forEach(function(entry) {
        rootElement.style.setProperty(entry[0], entry[1]);
    });
}

applyPaletteCssVars(document.documentElement);
