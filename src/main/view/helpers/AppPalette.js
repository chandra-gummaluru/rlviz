// Canonical color palette for the rlviz application.
// All shared canvas, DOM, and CSS colors live here.
// Domain files must NOT reference this file.
//
// AppPalette.light / AppPalette.dark are frozen raw token tables. AppPalette.setTheme(name)
// copies one table's namespaces onto AppPalette itself (AppPalette.text, AppPalette.node, ...),
// so every existing call site (AppPalette.node.selected, AppPalette.text.primary, ...) keeps
// working unchanged and always resolves to the currently active theme. The top-level AppPalette
// object is intentionally NOT frozen (only the light/dark tables are) so setTheme() can reassign
// its namespace properties in place.

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach(name => {
        const val = obj[name];
        if (val && typeof val === 'object') deepFreeze(val);
    });
    return Object.freeze(obj);
}

// Light theme = the app's existing appearance. Values are preserved byte-for-byte from the
// pre-redesign palette; new namespaces below (bar/toolbar/panel/accent/tint/typography/shape)
// reuse existing literals rather than inventing new ones, per explicit product decision to
// keep light mode visually unchanged (including the black menubar).
const AppPaletteLight = (function () {
    const accent = {
        cyan:     '#2196F3',
        teal:     '#1baf7a',
        orange:   '#eda100',
        purple:   '#9C27B0',
        purpleT:  '#AB47BC',
        green:    '#2E7D32',
        red:      '#C62828',
        yellow:   '#FFC107',
        edgeGray: '#666666',
        lineGray: '#CCCCCC'
    };
    const text = {
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
    };
    const surface = {
        canvas:    240,        // p5 grayscale value for background()
        white:     '#FFFFFF',
        light:     '#F5F5F5',
        card:      '#F9F9F9',
        frame:     '#FFFFFF',
        toolbar:   '#F5F5F5',
        panel:     '#FFFFFF',
        dock:      '#F9F9F9',
        btn:       '#FFFFFF',
        seg:       '#EEEEEE',
        hover:     '#EEEEEE',
        hoverCard: '#F5F5F5',
        scrim:     'rgba(249,249,249,.92)'
    };
    const border = {
        light:      '#DDDDDD',
        medium:     '#CCCCCC',
        row:        '#EEEEEE',
        canvasDark: '#3C3C3C',
        hairline:   '#DDDDDD',
        frameLine:  '#CCCCCC',
        input:      '#CCCCCC',
        gridDot:    '#DDDDDD', // reuses border.light rather than inventing a new light token
        chartGrid:  '#DDDDDD'
    };
    const tint = {
        stateBorder:   'rgba(33,150,243,.45)',  stateBg:   'rgba(33,150,243,.08)',
        actionBorder:  'rgba(156,39,176,.5)',   actionBg:  'rgba(156,39,176,.1)',
        successBorder: 'rgba(46,125,50,.5)',    successBg: 'rgba(46,125,50,.12)',
        mcBorder:      'rgba(237,161,0,.5)',    mcBg:      'rgba(237,161,0,.14)', mcBgStrong: 'rgba(237,161,0,.6)',
        viBorder:      'rgba(27,175,122,.5)',   viBg:      'rgba(27,175,122,.14)'
    };
    return deepFreeze({
        brand: {
            primary:  '#2196F3',
            success:  '#4CAF50',
            danger:   '#F44336',
            warning:  '#FF9800',
            purple:   '#9C27B0',
            gray:     '#757575'
        },
        text,
        surface,
        border,
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
            label:        '#505050',
            policy:       '#1b1b1b'
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
        // "Learning Iteration" (P unknown) - same shape as valueIteration, purple-toned so the
        // pane visibly distinguishes itself from the P-known teal/blue Value Iteration look.
        learningIteration: {
            best:            '#8E44AD',
            result:          '#74489E',
            badge:           '#74489E',
            actionBlue:      '#9A72AC',
            highlightYellow: '#FFF03C'
        },
        // Belief Iteration / PO Q-Learning (partial observability) - same shape as
        // valueIteration/learningIteration; shares one accent (yellow) across both quadrants of
        // this axis, unlike the known/unknown axis's teal/purpleT split.
        partialObservability: {
            best:            accent.yellow,
            result:          accent.yellow,
            badge:           accent.yellow,
            actionBlue:      accent.yellow,
            highlightYellow: '#FFF03C'
        },
        simulation: {
            travelBall:          '#FFD700',
            spinningArrow:       '#FF5722',
            spinLabelHighlight:  '#FFEB3B',
            spinLabelBackground: '#FFFFFF'
        },
        expectation: {
            runColors: ['#2a78d6', '#1baf7a', '#eda100', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834', '#6b8e23'],
            scrubberLine: '#2a78d6',
            markerYellow: '#FFD700'
        },
        accent,
        tint,
        typography: {
            sans: '"IBM Plex Sans", Calibri, "Segoe UI", Tahoma, sans-serif',
            mono: '"IBM Plex Mono", Consolas, monospace',
            math: '"STIX Two Text", Georgia, serif'
        },
        shape: { frameRadius: 12, buttonRadius: 8, chipRadius: 7, segTrack: 10, segThumb: 7, cardRadius: 9 },
        contrastOnAccent: '#FFFFFF' // text color drawn on top of solid accent chips (e.g. active mode-toggle)
    });
})();

// Dark theme = the redesign's primary theme (default). Tokens transcribed from
// design_handoff_compare_redesign/README.md's "Dark Theme Design Tokens" section, cross-checked
// against the design prototype's own derivation. Per-key mappings for existing fine-grained
// AppPalette keys not explicitly covered by the README's semantic table (badgeState vs
// badgeAction, valueIteration.actionBlue, expectation.runColors, etc.) are provisional judgment
// calls made here, expected to be refined once Values-mode content (phases 2-4) actually renders
// with them.
const AppPaletteDark = (function () {
    const accent = {
        cyan:     '#58C4DD', // states, Edit/Simulate active mode, gamma slider
        teal:     '#5CD0B3', // Value Iteration, exact values V, "rlviz" wordmark
        orange:   '#F0AC5F', // Monte Carlo
        purple:   '#9A72AC', // action nodes
        purpleT:  '#B48CC7', // Learning Iteration (Q-learning)
        green:    '#83C167', // positive rewards, successful episodes
        red:      '#FC6255', // negative rewards, failed episodes
        yellow:   '#F5D76E', // highlights: playhead, hover-links, MC estimate markers
        edgeGray: '#6b6b74', // graph edges + arrowheads
        lineGray: '#3a3a40'  // tree/diagram lines
    };
    // `black`/`nearBlack`/`dark`/`medium`/`mediumDark`/`mediumLight`/`light` are used at call
    // sites both directly on the canvas (now a dark background — see surface.canvas below) and,
    // in valueIterationView.js's detail overlays, on hardcoded-white boxes (fill(255,255,255,~240),
    // not yet theme-aware). These two contexts want opposite treatment in dark mode; Phase 1
    // prioritizes canvas legibility (the dominant surface) since that's this phase's new global
    // background, so this ramp is inverted from light (dark-on-light) to light-on-dark, preserving
    // the original relative ordering (black = strongest emphasis ... light = weakest). The
    // hardcoded-white overlay boxes will read low-contrast text until their backgrounds are also
    // migrated to theme tokens (not part of Phase 1's scope).
    const text = {
        primary:     '#e8e8ec',
        secondary:   '#c6c6cf',
        muted:       '#8b8b96',
        subtle:      '#b9b9c2', // README "text3"
        placeholder: '#6d6d78', // README "muted2" / faint labels
        inverse:     '#e8e8ec', // text on dark chrome bars (menubar/toolbar/dropdowns) in both themes
        black:       '#f2f2f5',
        nearBlack:   '#e8e8ec',
        dark:        '#d3d3da',
        medium:      '#c6c6cf',
        mediumDark:  '#b9b9c2',
        mediumLight: '#8b8b96',
        light:       '#6d6d78'
    };
    const surface = {
        canvas:    '#141418',
        white:     '#1e1e23', // no true "white" in dark theme; nearest card/panel surface
        light:     '#202025',
        card:      '#1e1e23',
        frame:     '#161616',
        toolbar:   '#19191d',
        panel:     '#1b1b1f',
        dock:      '#17171b',
        btn:       '#202025',
        seg:       '#222227',
        hover:     '#1c1c21',
        hoverCard: '#232329',
        scrim:     'rgba(20,20,24,.92)'
    };
    const border = {
        light:      '#34343a',
        medium:     '#2e2e33',
        row:        '#26262b',
        // Despite the name, canvasDark is used exclusively as a muted TEXT color drawn directly
        // on canvas in valueIterationView.js (transition-probability labels etc.), never as an
        // actual border — needs to stay legible against the new dark canvas, not literally dark.
        canvasDark: '#8b8b96',
        hairline:   '#26262b',
        frameLine:  '#2e2e33',
        input:      '#34343a',
        gridDot:    '#232328',
        chartGrid:  '#2c2c32'
    };
    const tint = {
        stateBorder:   'rgba(88,196,221,.45)',  stateBg:   'rgba(88,196,221,.08)',
        actionBorder:  'rgba(154,114,172,.5)',  actionBg:  'rgba(154,114,172,.1)',
        successBorder: 'rgba(131,193,103,.5)',  successBg: 'rgba(131,193,103,.12)',
        mcBorder:      'rgba(240,172,95,.5)',   mcBg:      'rgba(240,172,95,.14)', mcBgStrong: 'rgba(240,172,95,.6)',
        viBorder:      'rgba(92,208,179,.5)',   viBg:      'rgba(92,208,179,.14)'
    };
    return deepFreeze({
        brand: {
            primary:  accent.cyan,
            success:  accent.green,
            danger:   accent.red,
            warning:  accent.orange,
            purple:   accent.purple,
            gray:     text.muted
        },
        text,
        surface,
        border,
        node: {
            state:         text.subtle,
            action:        text.muted,
            selected:      accent.yellow,
            held:          accent.green,
            activeInitial: accent.orange,
            badgeState:    text.subtle,
            badgeAction:   text.muted,
            startRing:     accent.yellow
        },
        edge: {
            default:      accent.edgeGray,
            highlighted:  accent.orange,
            selectedText: accent.yellow,
            label:        text.muted,
            policy:       '#f2f2f4'
        },
        reward: {
            positive:       accent.green,
            positiveBright: '#9ED88A',
            negative:       accent.red,
            negativeBright: '#FF8A80',
            positiveCss:    'hsl(100, 45%, 60%)',
            negativeCss:    'hsl(4, 90%, 68%)',
            zero:           text.primary,
            zeroMuted:      text.muted
        },
        valueIteration: {
            best:            text.primary,
            result:          text.primary,
            badge:           text.primary,
            actionBlue:      text.primary,
            highlightYellow: accent.yellow
        },
        learningIteration: {
            best:            text.secondary,
            result:          text.secondary,
            badge:           text.secondary,
            actionBlue:      text.secondary,
            highlightYellow: accent.yellow
        },
        // Belief Iteration / PO Q-Learning (partial observability) - same shape as
        // valueIteration/learningIteration; shares one accent (yellow) across both quadrants of
        // this axis, unlike the known/unknown axis's teal/purpleT split.
        partialObservability: {
            best:            accent.yellow,
            result:          accent.yellow,
            badge:           accent.yellow,
            actionBlue:      accent.yellow,
            highlightYellow: accent.yellow
        },
        simulation: {
            travelBall:          accent.yellow,
            spinningArrow:       accent.orange,
            spinLabelHighlight:  accent.yellow,
            spinLabelBackground: surface.card
        },
        expectation: {
            runColors: [accent.orange, accent.teal, accent.cyan, accent.purple, accent.red, accent.green, accent.yellow, accent.purpleT],
            scrubberLine: accent.orange,
            markerYellow: accent.yellow
        },
        accent,
        tint,
        typography: {
            sans: '"IBM Plex Sans", Calibri, "Segoe UI", Tahoma, sans-serif',
            mono: '"IBM Plex Mono", Consolas, monospace',
            math: '"STIX Two Text", Georgia, serif'
        },
        shape: { frameRadius: 12, buttonRadius: 8, chipRadius: 7, segTrack: 10, segThumb: 7, cardRadius: 9 },
        contrastOnAccent: '#10151a'
    });
})();

function canvasBackgroundCss(canvasValue) {
    return typeof canvasValue === 'number' ? `rgb(${canvasValue},${canvasValue},${canvasValue})` : canvasValue;
}

function applyPaletteCssVars(rootElement) {
    const p = AppPalette;
    const vars = {
        // Existing vars, kept for backward compatibility with rules already written against them.
        '--color-primary':    p.brand.primary,
        '--color-success':    p.brand.success,
        '--color-danger':     p.brand.danger,
        '--color-warning':    p.brand.warning,
        '--color-purple':     p.brand.purple,
        '--color-gray':       p.brand.gray,
        '--color-primary-contrast': p.contrastOnAccent,

        '--text-dark':        p.text.primary,
        '--text-medium':      p.text.secondary,
        '--text-muted':       p.text.muted,
        '--text-light':       p.text.subtle,
        '--text-lighter':     p.text.placeholder,
        '--text-placeholder': p.text.placeholder,
        '--text-white':       p.text.inverse,

        '--bg-white':  p.surface.white,
        '--bg-light':  p.surface.light,
        '--bg-card':   p.surface.card,

        '--border-light':  p.border.light,
        '--border-medium': p.border.medium,
        '--border-card':   p.border.medium,
        '--border-row':    p.border.row,

        '--reward-positive': p.reward.positiveCss,
        '--reward-negative': p.reward.negativeCss,
        '--reward-zero':     p.reward.zero,

        // Chrome / layout surfaces, previously CSS-only, hardcoded, or missing entirely.
        '--bg-dark-hover': p.surface.hover,
        '--surface-toolbar':  p.surface.toolbar,
        '--surface-panel':    p.surface.panel,
        '--surface-dock':     p.surface.dock,
        '--surface-canvas':   canvasBackgroundCss(p.surface.canvas),
        '--surface-btn':      p.surface.btn,
        '--surface-seg':      p.surface.seg,
        '--surface-card2':    p.surface.card,
        '--surface-hover':      p.surface.hover,
        '--surface-hover-card': p.surface.hoverCard,
        // Pre-existing style.css rules referenced these two names without them ever being
        // defined anywhere (dead custom properties, silently no-op'd by the browser); mapped
        // here now that AppPalette has the matching tokens.
        '--surface-light': p.surface.light,
        '--surface-white': p.surface.hover,

        '--border-hairline': p.border.hairline,
        '--border-frame':    p.border.frameLine,
        '--border-input':    p.border.input,

        '--accent-cyan':    p.accent.cyan,
        '--accent-teal':    p.accent.teal,
        '--accent-orange':  p.accent.orange,
        '--accent-purple':  p.accent.purple,
        '--accent-purpleT': p.accent.purpleT,
        '--accent-green':   p.accent.green,
        '--accent-red':     p.accent.red,
        '--accent-yellow':  p.accent.yellow,

        '--font-family':      p.typography.sans,
        '--font-family-mono': p.typography.mono,
        '--font-family-math': p.typography.math,

        '--radius-frame':     p.shape.frameRadius + 'px',
        '--radius-btn':       p.shape.buttonRadius + 'px',
        '--radius-card':      p.shape.cardRadius + 'px',
        '--radius-seg-track': p.shape.segTrack + 'px',
        '--radius-seg-thumb': p.shape.segThumb + 'px'
    };
    Object.entries(vars).forEach(function (entry) {
        rootElement.style.setProperty(entry[0], entry[1]);
    });
}

const AppPalette = {
    light: AppPaletteLight,
    dark: AppPaletteDark,
    current: 'light',
    _onThemeChange: null, // late-bound by main.js once mainView/rightPanel exist

    getTheme() {
        return this.current;
    },

    setTheme(name) {
        const table = this[name];
        if (!table) return;
        Object.keys(table).forEach(ns => { this[ns] = table[ns]; });
        this.current = name;
        applyPaletteCssVars(document.documentElement);
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.setAttribute('data-theme', name);
        }
        try { localStorage.setItem('rlviz-theme', name); } catch (e) { /* storage unavailable */ }
        if (typeof redraw === 'function') {
            try { redraw(); } catch (e) { /* p5 not initialized yet on first call */ }
        }
        if (typeof this._onThemeChange === 'function') this._onThemeChange(name);
    },

    toggleTheme() {
        this.setTheme(this.current === 'dark' ? 'light' : 'dark');
    }
};

let savedTheme = null;
try { savedTheme = localStorage.getItem('rlviz-theme'); } catch (e) { /* storage unavailable */ }
AppPalette.setTheme(savedTheme === 'dark' ? 'dark' : 'light');
