// Full-canvas overlay shown on entering Values mode (unless muted this session) - states what
// the Monte Carlo/Iteration scenes are computing before the user picks one. DOM-based, matching
// this codebase's convention of floating chrome as real HTML elements layered over the canvas
// (see estimatorPill.js/treeViewPill.js), not p5 canvas drawing - needed here for KaTeX's own
// DOM-based rendering (renderKatex(), rightPanel.js) rather than the canvas-rasterizing
// MathRenderer path used elsewhere for in-canvas labels.
class GoalCard {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;
        this.overlayEl = null;
        this.equationEl = null;
    }

    setup() {
        if (this.overlayEl) return;

        const overlay = document.createElement('div');
        overlay.className = 'goal-card-overlay';
        document.body.appendChild(overlay);
        this.overlayEl = overlay;

        const card = document.createElement('div');
        card.className = 'goal-card';
        overlay.appendChild(card);

        const eyebrow = document.createElement('div');
        eyebrow.className = 'goal-card-eyebrow';
        eyebrow.textContent = 'Want to find';
        card.appendChild(eyebrow);

        const equation = document.createElement('div');
        equation.className = 'goal-card-equation';
        card.appendChild(equation);
        this.equationEl = equation;

        const scenes = document.createElement('div');
        scenes.className = 'goal-card-scenes';
        card.appendChild(scenes);

        const mcBtn = this._buildSceneButton('mc', '▶ Monte Carlo', 'sample & average', 'goal-card-scene--mc');
        const viBtn = this._buildSceneButton('vi', '▶ Iteration', 'exact backups', 'goal-card-scene--iteration');
        scenes.appendChild(mcBtn);
        scenes.appendChild(viBtn);

        const compareBtn = document.createElement('button');
        compareBtn.type = 'button';
        compareBtn.className = 'goal-card-compare';
        compareBtn.textContent = '⇄ Compare — watch both converge';
        compareBtn.disabled = true;
        compareBtn.title = 'Coming soon';
        card.appendChild(compareBtn);

        const footer = document.createElement('div');
        footer.className = 'goal-card-footer';
        const muteLink = document.createElement('span');
        muteLink.className = 'goal-card-mute';
        muteLink.textContent = "don't ask again";
        muteLink.title = "Don't show this again";
        muteLink.addEventListener('click', e => {
            e.stopPropagation();
            if (this.callbacks.onMuted) this.callbacks.onMuted();
        });
        footer.appendChild(muteLink);
        card.appendChild(footer);

        // Prevent clicks on the card itself (but not the backdrop) from bubbling to the canvas.
        card.addEventListener('mousedown', e => e.stopPropagation());
        overlay.addEventListener('mousedown', e => e.stopPropagation());

        this.refresh();
    }

    _buildSceneButton(subView, label, sublabel, extraClass) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `goal-card-scene ${extraClass}`;
        const labelEl = document.createElement('div');
        labelEl.className = 'goal-card-scene-label';
        labelEl.textContent = label;
        const subEl = document.createElement('div');
        subEl.className = 'goal-card-scene-sublabel';
        subEl.textContent = sublabel;
        btn.appendChild(labelEl);
        btn.appendChild(subEl);
        btn.addEventListener('click', e => {
            e.stopPropagation();
            if (this.callbacks.onSelectScene) this.callbacks.onSelectScene(subView);
        });
        return btn;
    }

    // Re-renders the equation (start-state name may have changed) and shows/hides the overlay
    // based on canvasViewModel.goalCardVisible. Cheap enough to call on every draw tick like
    // other floating chrome refreshes in this codebase (e.g. estimatorPill.refresh()) - call it
    // from mainView.js's draw() loop, gated so it only actually touches the DOM when the visible
    // state or start-node name has changed since the last call (avoid re-invoking KaTeX every
    // frame for no reason).
    refresh() {
        if (!this.overlayEl) return;

        const startNode = this.viewModel.startNode;
        const startName = startNode ? startNode.name : 'S₀';
        const equationKey = startName;
        if (this._lastEquationKey !== equationKey) {
            this._lastEquationKey = equationKey;
            this.equationEl.innerHTML = renderKatex(
                `V^{\\pi}(${this._latexEscapeName(startName)}) = E[\\,G \\mid S = ${this._latexEscapeName(startName)}\\,]`,
                true
            );
        }

        const visible = !!this.viewModel.goalCardVisible;
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

    // Minimal LaTeX-safety for an arbitrary user-chosen node name (matches rightPanel.js's own
    // latexEscapeText() intent, reused here rather than duplicated verbatim since goalCard.js
    // loads after rightPanel.js - see index.html - so the function is already in scope).
    _latexEscapeName(name) {
        return typeof latexEscapeText === 'function' ? latexEscapeText(name) : String(name);
    }
}
