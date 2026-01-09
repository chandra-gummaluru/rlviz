class ModeSelect {
    constructor(x, y, width, onModeChange) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.onModeChange = onModeChange;
        this.mode = 'editor'; // 'editor' or 'simulate'

        this.dropdown = createSelect();
        this.dropdown.position(this.x, this.y);
        this.dropdown.option('Editor Mode');
        this.dropdown.option('Simulate Mode');
        this.dropdown.selected('Editor Mode');
        this.dropdown.style('width', `${this.width}px`);
        this.dropdown.style('font-size', '14px');
        this.dropdown.changed(() => this.handleModeChange());
    }

    handleModeChange() {
        const selected = this.dropdown.value();
        this.mode = selected === 'Editor Mode' ? 'editor' : 'simulate';
        if (this.onModeChange) {
            this.onModeChange(this.mode);
        }
    }

    getMode() {
        return this.mode;
    }

    setMode(mode) {
        this.mode = mode;
        this.dropdown.selected(mode === 'editor' ? 'Editor Mode' : 'Simulate Mode');
    }

    hide() {
        this.dropdown.hide();
    }

    show() {
        this.dropdown.show();
    }
}
