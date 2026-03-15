// Contextual toolbar (Row 2) - mode-dependent buttons
class ToolBar {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;
        this.height = 50;
        this.toolBarElement = null;
        this.leftButtonsContainer = null;
        this.rightToggleContainer = null;

        // Edit mode buttons
        this.addStateBtn = null;
        this.addActionBtn = null;
        this.addTextBtn = null;
        this.renormalizeBtn = null;

        // Simulate mode buttons
        this.playPauseBtn = null;
        this.stepBtn = null;
        this.rerunBtn = null;

        // Mode toggle
        this.editToggleBtn = null;
        this.simulateToggleBtn = null;

        this.currentMode = 'editor';
    }

    setup(menuBarHeight) {
        // Create main toolbar container
        this.toolBarElement = createDiv();
        this.toolBarElement.position(0, menuBarHeight);
        this.toolBarElement.size(windowWidth, this.height);
        this.toolBarElement.addClass('toolbar');

        // Create left container for mode-dependent buttons
        this.leftButtonsContainer = createDiv();
        this.leftButtonsContainer.parent(this.toolBarElement);
        this.leftButtonsContainer.addClass('toolbar-left');

        // Create right container for mode toggle
        this.rightToggleContainer = createDiv();
        this.rightToggleContainer.parent(this.toolBarElement);
        this.rightToggleContainer.addClass('toolbar-right');

        // Create Edit mode buttons
        this.createEditModeButtons();

        // Create Simulate mode buttons
        this.createSimulateModeButtons();

        // Create mode toggle
        this.createModeToggle();

        // Show Edit mode by default
        this.setMode('editor');
    }

    createEditModeButtons() {
        this.addStateBtn = this.createButton('Add State', () => this.callbacks.onStateClick(), 'toolbar-btn--state');
        this.addActionBtn = this.createButton('Add Action', () => this.callbacks.onActionClick(), 'toolbar-btn--action');
        this.addTextBtn = this.createButton('Add Text', () => this.callbacks.onTextBoxClick(), 'toolbar-btn--text');
        this.renormalizeBtn = this.createButton('Renormalize', () => this.callbacks.onRenormalize(), 'toolbar-btn--renormalize');
    }

    createSimulateModeButtons() {
        this.playPauseBtn = this.createButton('▶ Play', () => this.handlePlayPauseClick(), 'toolbar-btn--play');
        this.playPauseBtn.elt.dataset.mode = 'play';

        this.stepBtn = this.createButton('⏭ Step', () => this.callbacks.onStep(), 'toolbar-btn--step');
        this.rerunBtn = this.createButton('⟲ Rerun', () => this.callbacks.onRerun(), 'toolbar-btn--rerun');
    }

    handlePlayPauseClick() {
        const mode = this.playPauseBtn.elt.dataset.mode;
        if (mode === 'play') {
            if (this.callbacks.onPlay) {
                this.callbacks.onPlay();
            }
        } else {
            if (this.callbacks.onPause) {
                this.callbacks.onPause();
            }
        }
    }

    createButton(label, onClick, modifierClass) {
        const btn = createButton(label);
        btn.parent(this.leftButtonsContainer);
        btn.addClass('toolbar-btn');
        if (modifierClass) {
            btn.addClass(modifierClass);
        }
        btn.mousePressed(onClick);
        return btn;
    }

    createModeToggle() {
        // Edit toggle button
        this.editToggleBtn = createButton('Edit');
        this.editToggleBtn.parent(this.rightToggleContainer);
        this.editToggleBtn.addClass('toolbar-toggle');
        this.editToggleBtn.addClass('toolbar-toggle--first');
        this.editToggleBtn.addClass('toolbar-toggle--active');
        this.editToggleBtn.mousePressed(() => this.switchMode('editor'));

        // Simulate toggle button
        this.simulateToggleBtn = createButton('Simulate');
        this.simulateToggleBtn.parent(this.rightToggleContainer);
        this.simulateToggleBtn.addClass('toolbar-toggle');
        this.simulateToggleBtn.addClass('toolbar-toggle--last');
        this.simulateToggleBtn.mousePressed(() => this.switchMode('simulate'));
    }

    switchMode(newMode) {
        this.currentMode = newMode;
        this.setMode(newMode);

        if (this.callbacks.onModeChange) {
            this.callbacks.onModeChange(newMode);
        }
    }

    setMode(mode) {
        this.currentMode = mode;

        if (mode === 'editor') {
            this.addStateBtn.show();
            this.addActionBtn.show();
            this.addTextBtn.show();
            this.renormalizeBtn.show();

            this.playPauseBtn.hide();
            this.stepBtn.hide();
            this.rerunBtn.hide();

            // Update toggle styles
            this.editToggleBtn.addClass('toolbar-toggle--active');
            this.simulateToggleBtn.removeClass('toolbar-toggle--active');
        } else {
            this.addStateBtn.hide();
            this.addActionBtn.hide();
            this.addTextBtn.hide();
            this.renormalizeBtn.hide();

            this.playPauseBtn.show();
            this.stepBtn.show();
            this.rerunBtn.show();

            this.setPlayPauseMode('play');
            this.setPlayPauseEnabled(true);
            this.setStepEnabled(true);

            this.simulateToggleBtn.addClass('toolbar-toggle--active');
            this.editToggleBtn.removeClass('toolbar-toggle--active');
        }
    }

    updateWidth(newWidth) {
        if (this.toolBarElement) {
            this.toolBarElement.size(newWidth, this.height);
        }
    }

    updatePosition(menuBarHeight) {
        if (this.toolBarElement) {
            this.toolBarElement.position(0, menuBarHeight);
        }
    }

    getHeight() {
        return this.height;
    }

    getCurrentMode() {
        return this.currentMode;
    }

    setPlayPauseMode(mode) {
        if (!this.playPauseBtn) return;

        this.playPauseBtn.elt.dataset.mode = mode;

        if (mode === 'play') {
            this.playPauseBtn.html('▶ Play');
            this.playPauseBtn.removeClass('toolbar-btn--pause');
            this.playPauseBtn.addClass('toolbar-btn--play');
        } else {
            this.playPauseBtn.html('⏸ Pause');
            this.playPauseBtn.removeClass('toolbar-btn--play');
            this.playPauseBtn.addClass('toolbar-btn--pause');
        }
    }

    setPlayPauseEnabled(enabled) {
        if (this.playPauseBtn) {
            if (enabled) {
                this.playPauseBtn.removeAttribute('disabled');
            } else {
                this.playPauseBtn.attribute('disabled', '');
            }
        }
    }

    setStepEnabled(enabled) {
        if (this.stepBtn) {
            if (enabled) {
                this.stepBtn.removeAttribute('disabled');
            } else {
                this.stepBtn.attribute('disabled', '');
            }
        }
    }

    updateButtonStates(isPlaying, canAdvance) {
        if (isPlaying) {
            this.setPlayPauseMode('pause');
            this.setPlayPauseEnabled(true);
        } else {
            this.setPlayPauseMode('play');
            this.setPlayPauseEnabled(canAdvance);
        }

        this.setStepEnabled(!isPlaying && canAdvance);
    }
}
