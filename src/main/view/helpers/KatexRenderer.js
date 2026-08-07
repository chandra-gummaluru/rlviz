// Shared KaTeX-to-HTML rendering helper - a thin wrapper around katex.renderToString(), safe to
// call from any file that needs to inject real LaTeX-rendered HTML into a DOM element (NOT a
// canvas - see MathRenderer.js for the canvas-based renderer, which has a different, canvas-
// context-specific set of constraints that ruled it out for viBackupDiagram.js/viEquationView.js).
// Promoted out of rightPanel.js so viEquationView.js can reuse the exact same rendering without
// duplicating it.
const KatexRenderer = {
    // Render a LaTeX string directly to an HTML string via KaTeX.
    // display=true for block (display) math, false for inline.
    render(latex, display = false) {
        if (typeof katex === 'undefined') return `<span>${latex}</span>`;
        return katex.renderToString(latex, { throwOnError: false, displayMode: display });
    },

    // Escape user-controlled names for use inside LaTeX \text{} blocks.
    escapeText(value) {
        return String(value)
            .replace(/\\/g, '\\textbackslash{}')
            .replace(/[{}]/g, match => `\\${match}`)
            .replace(/_/g, '\\_')
            .replace(/%/g, '\\%')
            .replace(/&/g, '\\&')
            .replace(/#/g, '\\#')
            .replace(/\$/g, '\\$');
    }
};
