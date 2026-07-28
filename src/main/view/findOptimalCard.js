// Full-canvas overlay shown by the Policy log's "Find optimal π" button (rightPanel.js) - a
// focused sibling of goalCard.js's generic "want to find V^pi = E[G]" MC/Iteration picker, shown
// INSTEAD of it for this flow (CanvasController.enterFindOptimalScene() deliberately skips
// showGoalCardIfNotMuted()). States the real Bellman OPTIMALITY equation (max_a, not the
// expectation goalCard.js states) and offers one CTA that kicks off the same VI Play/continuous-
// sweep animation the top bar's own "▶ Find Optimal" button (known:full quadrant, see
// ValuesMethodMatrix) already drives - see main.js's onRunFindOptimalBackups.
//
// DOM-based overlay, same convention as goalCard.js (see its own file-header comment) and reusing
// its .goal-card-overlay/.goal-card/.goal-card-eyebrow/.goal-card-equation CSS classes for the
// shared shell - only the sub-equation/run-button/skip-link get their own new classes.
class FindOptimalCard {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;
        this.overlayEl = null;
        this.equationEl = null;
    }

    setup() {
        if (this.overlayEl) return;

        const overlay = document.createElement('div');
        overlay.className = 'goal-card-overlay find-optimal-card-overlay';
        document.body.appendChild(overlay);
        this.overlayEl = overlay;

        const card = document.createElement('div');
        card.className = 'goal-card find-optimal-card';
        overlay.appendChild(card);

        const eyebrow = document.createElement('div');
        eyebrow.className = 'goal-card-eyebrow';
        eyebrow.textContent = 'Want to find';
        card.appendChild(eyebrow);

        const equation = document.createElement('div');
        equation.className = 'goal-card-equation';
        card.appendChild(equation);
        this.equationEl = equation;

        const subEquation = document.createElement('div');
        subEquation.className = 'find-optimal-card-subequation';
        subEquation.innerHTML = renderKatex(
            'V \\leftarrow \\max_a \\sum p(s\'|s,a)\\cdot[\\,r + \\gamma\\cdot V(s\')\\,]',
            false
        );
        card.appendChild(subEquation);

        const runBtn = document.createElement('button');
        runBtn.type = 'button';
        runBtn.className = 'find-optimal-card-run';
        runBtn.textContent = '▶ Run max-a backups';
        runBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (this.callbacks.onRun) this.callbacks.onRun();
        });
        card.appendChild(runBtn);

        const footer = document.createElement('div');
        footer.className = 'goal-card-footer';
        const skipLink = document.createElement('span');
        skipLink.className = 'goal-card-mute find-optimal-card-skip';
        skipLink.textContent = 'skip';
        skipLink.addEventListener('click', e => {
            e.stopPropagation();
            if (this.callbacks.onSkip) this.callbacks.onSkip();
        });
        footer.appendChild(skipLink);
        card.appendChild(footer);

        // Same canvas-click-blocking convention as goalCard.js.
        card.addEventListener('mousedown', e => e.stopPropagation());
        overlay.addEventListener('mousedown', e => e.stopPropagation());

        this.refresh();
    }

    // Mirrors goalCard.js's own refresh() exactly: re-renders the equation only when the
    // start-state name actually changed, then shows/hides based on
    // canvasViewModel.findOptimalCardVisible.
    refresh() {
        if (!this.overlayEl) return;

        const startNode = this.viewModel.startNode;
        const startName = startNode ? startNode.name : 'S₀';
        const equationKey = startName;
        if (this._lastEquationKey !== equationKey) {
            this._lastEquationKey = equationKey;
            this.equationEl.innerHTML = renderKatex(
                `V^{*}(${this._latexEscapeName(startName)}) = \\max_{\\pi} V^{\\pi}(${this._latexEscapeName(startName)})`,
                true
            );
        }

        const visible = !!this.viewModel.findOptimalCardVisible;
        this.overlayEl.style.display = visible ? 'flex' : 'none';
    }

    show() {
        if (!this.overlayEl) return;
        this.overlayEl.style.display = 'flex';
    }

    hide() {
        if (!this.overlayEl) return;
        this.overlayEl.style.display = 'none';
    }

    _latexEscapeName(name) {
        return typeof latexEscapeText === 'function' ? latexEscapeText(name) : String(name);
    }
}
