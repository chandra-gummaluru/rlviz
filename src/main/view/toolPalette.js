// Floating on-canvas tool palette for Build mode: select/move, add-state, add-action, add-text.
// Relocated from the top toolbar row per the unified-workspace redesign. Only visible in Build
// mode; shown/hidden by the mode-lifecycle hooks in main.js.
class ToolPalette {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {}; // 'select' | 'state' | 'action' | 'textbox' -> button element
    }

    setup(topOffset) {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'tool-palette';
        container.style.top = (topOffset + 12) + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        this.buttons.select = this._createButton('select', '➤', 'Select', 'select', () => {
            this.callbacks.onSelectTool();
        });
        this.buttons.state = this._createButton('state', '⊕', 'Add state', 'state', () => {
            this.callbacks.onStateClick();
        });
        this.buttons.action = this._createButton('action', '⊞', 'Add action', 'action', () => {
            this.callbacks.onActionClick();
        });
        this.buttons.textbox = this._createButton('textbox', 'T', 'Text', 'textbox', () => {
            this.callbacks.onTextBoxClick();
        });

        this.updateActiveTool(this.viewModel.interaction.placingMode);
    }

    // tint: 'select' | 'state' | 'action' | 'textbox' - drives the icon/label accent color via
    // CSS (see .tool-palette-btn--<tint> in style.css), matching each tool's on-canvas color.
    _createButton(key, glyph, label, tint, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `tool-palette-btn tool-palette-btn--${tint}`;
        btn.title = label;
        btn.addEventListener('mousedown', e => e.stopPropagation());
        btn.addEventListener('click', e => {
            e.stopPropagation();
            onClick();
        });

        const iconEl = document.createElement('span');
        iconEl.className = 'tool-palette-btn-icon';
        iconEl.textContent = glyph;
        btn.appendChild(iconEl);

        const labelEl = document.createElement('span');
        labelEl.className = 'tool-palette-btn-label';
        labelEl.textContent = label;
        btn.appendChild(labelEl);

        this.containerEl.appendChild(btn);
        return btn;
    }

    // placingMode: null (select tool active) | 'state' | 'action' | 'textbox'
    updateActiveTool(placingMode) {
        Object.entries(this.buttons).forEach(([key, btn]) => {
            const isActive = key === 'select' ? !placingMode : key === placingMode;
            btn.classList.toggle('tool-palette-btn--active', isActive);
        });
    }

    show() {
        if (this.containerEl) this.containerEl.style.display = '';
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
