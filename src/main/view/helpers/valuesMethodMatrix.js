// Central 2x2 lookup for Values mode's method matrix (transition-model known/unknown x
// observability full/partial). Every per-quadrant UI surface (estimator pill, method badge,
// right-panel title, run-button label, canvas value-label tint) reads through this instead of
// each maintaining its own modelKnown/observability branching.
//
// paletteNamespace: the AppPalette sub-object used for canvas V/Q/belief label tinting (same
// role valueIterationView.js's viColors already plays for valueIteration/learningIteration).
// accent: the AppPalette.accent.* key used for chrome (pill segments, badges) - read live via
// AppPalette.accent[accent] at each call site, not baked into this table, so it stays
// theme-aware.
const ValuesMethodMatrix = {
    entries: {
        'known:full':      { title: 'Value Iteration',   pillLabel: 'Value Iter',   paletteNamespace: 'valueIteration',       accent: 'teal' },
        'unknown:full':    { title: 'Learning Iteration', pillLabel: 'Learning Iter', paletteNamespace: 'learningIteration',    accent: 'purpleT' },
        'known:partial':   { title: 'Belief Iteration',   pillLabel: 'Belief Iter',  paletteNamespace: 'partialObservability', accent: 'yellow' },
        'unknown:partial': { title: 'PO Q-Learning',      pillLabel: 'PO Learning',  paletteNamespace: 'partialObservability', accent: 'yellow' }
    },

    key(modelKnown, observability) {
        return `${modelKnown ? 'known' : 'unknown'}:${observability === 'partial' ? 'partial' : 'full'}`;
    },

    resolve(modelKnown, observability) {
        return this.entries[this.key(modelKnown, observability)];
    },

    // Illustrative-only heuristic "belief" scalar for the partial-observability quadrants
    // (Belief Iteration / PO Q-Learning) - NOT a real belief-state update. Deterministic and
    // presentation-only: states whose value is more distinguishable from the rest of that
    // column get a higher displayed belief confidence. Reuses VI's already-computed numbers
    // (viState.getValues); does not read or write any domain state. Shared by
    // valueIterationView.js's canvas labels and rightPanel.js's Estimate-vs-exact table so both
    // surfaces agree on the same number.
    beliefFor(viState, stateId, colIdx) {
        const values = viState.getValues(colIdx);
        const vs = Object.values(values);
        const vMin = Math.min(...vs);
        const vMax = Math.max(...vs);
        const v = values[stateId] ?? 0;
        const range = (vMax - vMin) || 1;
        const b = Math.min(0.9, Math.max(0.3, 0.4 + 0.5 * (v - vMin) / range));
        return { b, vOfB: b * v };
    }
};
