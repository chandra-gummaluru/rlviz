// Floating, top-right Values -> Learning Iteration control: a [Graph | Tree] segmented switch
// for the Learning Iteration (unknown:full) quadrant's canvas view. Modeled on McRunsPill's
// DOM structure / mount / show-hide convention. Shown ONLY in the unknown:full quadrant while
// the 'vi' (Method) sub-view is active - hidden everywhere else, so it never leaks into Value
// Iteration / Belief Iteration / PO Q-Learning.
const LEARNING_TREE_PILL_OPTIONS = [
    { key: 'graph', label: 'Graph' },
    { key: 'tree',  label: 'Tree' }
];

class LearningTreeTogglePill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        this._topOffset = topOffset + 24;

        const container = document.createElement('div');
        container.className = 'learning-tree-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const label = document.createElement('span');
        label.className = 'learning-tree-pill-label';
        label.textContent = 'view';
        container.appendChild(label);

        const track = document.createElement('div');
        track.className = 'learning-tree-pill-track';
        container.appendChild(track);

        LEARNING_TREE_PILL_OPTIONS.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'learning-tree-pill-btn';
            btn.textContent = opt.label;
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (this.callbacks.onSelectView) this.callbacks.onSelectView(opt.key);
            });
            track.appendChild(btn);
            this.buttons[opt.key] = btn;
        });

        this.refresh();
    }

    // x, width: the canvas region (same bounds convention as McRunsPill) - right-edge anchored.
    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        this.containerEl.style.left = (this._bounds.x + this._bounds.width - 12) + 'px';
        this.containerEl.style.transform = 'translateX(-100%)';
    }

    // True only in the Learning Iteration (unknown:full) quadrant AND the 'vi' sub-view.
    _shouldShow() {
        if (!this.viewModel) return false;
        if (this.viewModel.valuesSubView !== 'vi') return false;
        return ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability) === 'unknown:full';
    }

    refresh() {
        if (!this.containerEl) return;
        const current = this.viewModel.learningIterationCanvasView || 'graph';
        Object.entries(this.buttons).forEach(([key, btn]) => {
            btn.classList.toggle('learning-tree-pill-btn--active', key === current);
        });
    }

    // Show only when the quadrant/sub-view predicate holds; callers can call this unconditionally
    // (e.g. from mode-lifecycle hooks) and it self-gates.
    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = this._shouldShow() ? '' : 'none';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
