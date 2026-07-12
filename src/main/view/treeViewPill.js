// Floating, top-right Build/Policy control: a [Graph | Tree] segmented switch for
// canvasViewModel.buildCanvasView. Modeled directly on LearningTreeTogglePill (same DOM/CSS
// skeleton, same two-option shape) - kept as a SEPARATE file/class rather than a shared
// parameterized component: different gate (_isEditableMode() vs. the unknown:full quadrant),
// different backing state (buildCanvasView vs. learningIterationCanvasView), and the two pills
// can never be visible at the same time (Build/Policy vs. Values -> Learning Iteration), so
// sharing would add indirection without real benefit.
const TREE_VIEW_PILL_OPTIONS = [
    { key: 'graph', label: 'Graph' },
    { key: 'tree',  label: 'Tree' }
];

class TreeViewPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        this._topOffset = topOffset + 12;

        const container = document.createElement('div');
        container.className = 'tree-view-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const label = document.createElement('span');
        label.className = 'tree-view-pill-label';
        label.textContent = 'view';
        container.appendChild(label);

        const track = document.createElement('div');
        track.className = 'tree-view-pill-track';
        container.appendChild(track);

        TREE_VIEW_PILL_OPTIONS.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tree-view-pill-btn';
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

    // x, width: the canvas region (same bounds convention as every other floating pill in this
    // codebase) - right-edge anchored.
    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        this.containerEl.style.left = (this._bounds.x + this._bounds.width - 12) + 'px';
        this.containerEl.style.transform = 'translateX(-100%)';
    }

    refresh() {
        if (!this.containerEl) return;
        const current = this.viewModel.buildCanvasView || 'graph';
        Object.entries(this.buttons).forEach(([key, btn]) => {
            btn.classList.toggle('tree-view-pill-btn--active', key === current);
        });
    }

    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
