// Floating zoom control, bottom-right of canvas: [−] [123%] [+]. Pure restyle/relocation of the
// already-working zoom mechanism (canvasController.zoomIn/zoomOut, viewport.reset()) - no new
// clamp logic, the underlying 0.1-5.0 zoom range is unchanged.
class ZoomPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.percentEl = null;
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'zoom-pill';
        document.body.appendChild(container);
        this.containerEl = container;

        this._createButton('−', 'Zoom out', () => this.callbacks.onZoomOut());

        const percentBtn = document.createElement('button');
        percentBtn.type = 'button';
        percentBtn.className = 'zoom-pill-percent';
        percentBtn.title = 'Reset zoom';
        percentBtn.addEventListener('mousedown', e => e.stopPropagation());
        percentBtn.addEventListener('click', e => {
            e.stopPropagation();
            this.callbacks.onResetZoom();
            this.refresh();
        });
        container.appendChild(percentBtn);
        this.percentEl = percentBtn;

        this._createButton('+', 'Zoom in', () => this.callbacks.onZoomIn());

        this.refresh();
    }

    _createButton(glyph, title, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'zoom-pill-btn';
        btn.textContent = glyph;
        btn.title = title;
        btn.addEventListener('mousedown', e => e.stopPropagation());
        btn.addEventListener('click', e => {
            e.stopPropagation();
            onClick();
            this.refresh();
        });
        this.containerEl.appendChild(btn);
        return btn;
    }

    // rightPanelWidth: anchors the pill just left of the resizable right panel.
    updateBounds(rightPanelWidth) {
        if (this.containerEl) this.containerEl.style.right = (rightPanelWidth + 16) + 'px';
    }

    refresh() {
        if (this.percentEl) this.percentEl.textContent = Math.round(this.viewModel.viewport.zoom * 100) + '%';
    }

    show() {
        if (this.containerEl) this.containerEl.style.display = '';
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
