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

        // Value Iteration mode buttons
        this.viPlayPauseBtn = null;
        this.viStepBtn = null;
        this.viSkipBtn = null;
        this.viResetBtn = null;
        this.viTInput = null;
        this.viTLabel = null;
        this.viPerActionLabel = null;
        this.viPerActionToggle = null;
        this.viShowCalcsLabel = null;
        this.viShowCalcsToggle = null;

        // Expectation mode buttons
        this.expectationPlayPauseBtn = null;

        this.helpBtn = null;
        this.helpOverlay = null;

        // Mode toggle
        this.editToggleBtn = null;
        this.simulateToggleBtn = null;
        this.expectationToggleBtn = null;
        this.viToggleBtn = null;

        this.currentMode = 'editor';
    }

    setup(menuBarHeight) {
        // Create main toolbar container
        this.toolBarElement = createDiv();
        this.toolBarElement.position(0, menuBarHeight);
        this.toolBarElement.style('height', this.height + 'px');
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

        // Create Expectation mode buttons
        this.createExpectationModeButtons();

        // Create Value Iteration mode buttons
        this.createValueIterModeButtons();

        // Create mode toggle
        this.createModeToggle();

        // Create help button (after mode toggles so it appears to their right)
        this.createHelpButton();

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
        this.playPauseBtn = this.createButton('Play', () => this.handlePlayPauseClick(), 'toolbar-btn--play');
        this.playPauseBtn.elt.dataset.mode = 'play';

        this.stepBtn = this.createButton('Step', () => this.callbacks.onStep(), 'toolbar-btn--step');
        this.rerunBtn = this.createButton('Rerun', () => this.callbacks.onRerun(), 'toolbar-btn--rerun');
    }

    createExpectationModeButtons() {
        this.expectationPlayPauseBtn = this.createButton('Play', () => this.handleExpectationPlayPauseClick(), 'toolbar-btn--play');
        this.expectationPlayPauseBtn.elt.dataset.mode = 'play';
    }

    handleExpectationPlayPauseClick() {
        const mode = this.expectationPlayPauseBtn.elt.dataset.mode;
        if (mode === 'play') {
            if (this.callbacks.onExpectationPlay) this.callbacks.onExpectationPlay();
        } else {
            if (this.callbacks.onExpectationPause) this.callbacks.onExpectationPause();
        }
    }

    setExpectationPlayMode(mode) {
        if (!this.expectationPlayPauseBtn) return;
        this.expectationPlayPauseBtn.elt.dataset.mode = mode;
        if (mode === 'play') {
            this.expectationPlayPauseBtn.html('Play');
            this.expectationPlayPauseBtn.removeClass('toolbar-btn--pause');
            this.expectationPlayPauseBtn.addClass('toolbar-btn--play');
        } else {
            this.expectationPlayPauseBtn.html('Pause');
            this.expectationPlayPauseBtn.removeClass('toolbar-btn--play');
            this.expectationPlayPauseBtn.addClass('toolbar-btn--pause');
        }
    }

    createValueIterModeButtons() {
        this.viPlayPauseBtn = this.createButton('Play', () => this.handleVIPlayPauseClick(), 'toolbar-btn--play');
        this.viPlayPauseBtn.elt.dataset.mode = 'play';

        this.viStepBtn = this.createButton('Step', () => {
            if (this.callbacks.onVIStep) this.callbacks.onVIStep();
        }, 'toolbar-btn--step');

        this.viSkipBtn = this.createButton('Skip', () => {
            if (this.callbacks.onVISkip) this.callbacks.onVISkip();
        }, 'toolbar-btn--action');

        this.viResetBtn = this.createButton('Reset', () => {
            if (this.callbacks.onVIReset) this.callbacks.onVIReset();
        }, 'toolbar-btn--rerun');

        // T input
        this.viTLabel = createSpan('T =');
        this.viTLabel.parent(this.leftButtonsContainer);
        this.viTLabel.addClass('toolbar-t-label');

        this.viTInput = createInput('5', 'number');
        this.viTInput.parent(this.leftButtonsContainer);
        this.viTInput.addClass('toolbar-t-input');
        this.viTInput.attribute('min', '0');
        this.viTInput.attribute('max', '100');
        this.viTInput.size(50);

        // Per-action toggle
        this.viPerActionLabel = createSpan('Per-action');
        this.viPerActionLabel.parent(this.leftButtonsContainer);
        this.viPerActionLabel.addClass('toolbar-t-label');

        this.viPerActionToggle = createCheckbox('', false);
        this.viPerActionToggle.parent(this.leftButtonsContainer);
        this.viPerActionToggle.addClass('toolbar-checkbox');
        this.viPerActionToggle.changed(() => {
            if (this.callbacks.onVIPerActionToggle) {
                this.callbacks.onVIPerActionToggle(this.viPerActionToggle.checked());
            }
        });

        // Show calcs toggle
        this.viShowCalcsLabel = createSpan('Show calcs');
        this.viShowCalcsLabel.parent(this.leftButtonsContainer);
        this.viShowCalcsLabel.addClass('toolbar-t-label');

        this.viShowCalcsToggle = createCheckbox('', true);
        this.viShowCalcsToggle.parent(this.leftButtonsContainer);
        this.viShowCalcsToggle.addClass('toolbar-checkbox');
        this.viShowCalcsToggle.changed(() => {
            if (this.callbacks.onVIShowCalcsToggle) {
                this.callbacks.onVIShowCalcsToggle(this.viShowCalcsToggle.checked());
            }
        });
    }

    handleVIPlayPauseClick() {
        const mode = this.viPlayPauseBtn.elt.dataset.mode;
        if (mode === 'play') {
            if (this.callbacks.onVIPlay) this.callbacks.onVIPlay();
        } else {
            if (this.callbacks.onVIPause) this.callbacks.onVIPause();
        }
    }

    getVIT() {
        return parseInt(this.viTInput.value()) || 5;
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
        this.simulateToggleBtn.addClass('toolbar-toggle--middle');
        this.simulateToggleBtn.mousePressed(() => this.switchMode('simulate'));

        // Expectation toggle button
        this.expectationToggleBtn = createButton('Expectation');
        this.expectationToggleBtn.parent(this.rightToggleContainer);
        this.expectationToggleBtn.addClass('toolbar-toggle');
        this.expectationToggleBtn.addClass('toolbar-toggle--middle');
        this.expectationToggleBtn.mousePressed(() => this.switchMode('expectation'));

        // Value Iteration toggle button
        this.viToggleBtn = createButton('Value Iter');
        this.viToggleBtn.parent(this.rightToggleContainer);
        this.viToggleBtn.addClass('toolbar-toggle');
        this.viToggleBtn.addClass('toolbar-toggle--last');
        this.viToggleBtn.mousePressed(() => this.switchMode('value_iteration'));
    }

    createHelpButton() {
        this.helpBtn = createButton('?');
        this.helpBtn.parent(this.rightToggleContainer);
        this.helpBtn.addClass('toolbar-btn');
        this.helpBtn.addClass('toolbar-btn--help');
        this.helpBtn.mousePressed(() => this.showHelp());

        this.helpOverlay = createDiv();
        this.helpOverlay.addClass('help-overlay');

        const modal = createDiv();
        modal.addClass('help-modal');
        modal.parent(this.helpOverlay);

        const closeBtn = createButton('✕');
        closeBtn.addClass('help-modal-close');
        closeBtn.parent(modal);
        closeBtn.mousePressed(() => this.hideHelp());

        createElement('h2', 'How to Use RLViz').parent(modal);

        createDiv(`
            <p><strong>Editor mode:</strong> In Editor Mode, you can add/remove state and action nodes to the simulation. </p>
            <p><strong>Simulate mode:</strong> In this mode, you can explore different policies for an agent. </p>
            <p><strong>Value Iteration mode:</strong> In Value Iteration mode, you can see the Bellman equations in action. </p>
        `).parent(modal);

        this.helpOverlay.mousePressed(() => this.hideHelp());
        modal.elt.addEventListener('click', e => e.stopPropagation());
    }

    showHelp() {
        this.helpOverlay.addClass('visible');
    }

    hideHelp() {
        this.helpOverlay.removeClass('visible');
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

        // Hide all button sets first
        this.addStateBtn.hide();
        this.addActionBtn.hide();
        this.addTextBtn.hide();
        this.renormalizeBtn.hide();
        this.playPauseBtn.hide();
        this.stepBtn.hide();
        this.rerunBtn.hide();
        this.expectationPlayPauseBtn.hide();
        this.viPlayPauseBtn.hide();
        this.viStepBtn.hide();
        this.viSkipBtn.hide();
        this.viResetBtn.hide();
        this.viTLabel.hide();
        this.viTInput.hide();
        this.viPerActionLabel.hide();
        this.viPerActionToggle.hide();
        this.viShowCalcsLabel.hide();
        this.viShowCalcsToggle.hide();

        // Clear all toggle active states
        this.editToggleBtn.removeClass('toolbar-toggle--active');
        this.simulateToggleBtn.removeClass('toolbar-toggle--active');
        this.expectationToggleBtn.removeClass('toolbar-toggle--active');
        this.viToggleBtn.removeClass('toolbar-toggle--active');

        if (mode === 'editor') {
            this.addStateBtn.show();
            this.addActionBtn.show();
            this.addTextBtn.show();
            this.renormalizeBtn.show();
            this.editToggleBtn.addClass('toolbar-toggle--active');
        } else if (mode === 'simulate') {
            this.playPauseBtn.show();
            this.stepBtn.show();
            this.rerunBtn.show();
            this.setPlayPauseMode('play');
            this.setPlayPauseEnabled(true);
            this.setStepEnabled(true);
            this.simulateToggleBtn.addClass('toolbar-toggle--active');
        } else if (mode === 'expectation') {
            this.expectationPlayPauseBtn.show();
            this.setExpectationPlayMode('play');
            this.expectationToggleBtn.addClass('toolbar-toggle--active');
        } else if (mode === 'value_iteration') {
            this.viPlayPauseBtn.show();
            this.viStepBtn.show();
            this.viSkipBtn.show();
            this.viResetBtn.show();
            this.viTLabel.show();
            this.viTInput.show();
            this.viPerActionLabel.show();
            this.viPerActionToggle.show();
            this.viShowCalcsLabel.show();
            this.viShowCalcsToggle.show();
            this.setVIPlayPauseMode('play');
            this.viToggleBtn.addClass('toolbar-toggle--active');
        }
    }

    updateWidth(_newWidth) {
        // Width is managed by CSS (width: 100%); no-op
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
            this.playPauseBtn.html('Play');
            this.playPauseBtn.removeClass('toolbar-btn--pause');
            this.playPauseBtn.addClass('toolbar-btn--play');
        } else {
            this.playPauseBtn.html('Pause');
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

    // Value Iteration button methods

    setVIPlayPauseMode(mode) {
        if (!this.viPlayPauseBtn) return;

        this.viPlayPauseBtn.elt.dataset.mode = mode;

        if (mode === 'play') {
            this.viPlayPauseBtn.html('Play');
            this.viPlayPauseBtn.removeClass('toolbar-btn--pause');
            this.viPlayPauseBtn.addClass('toolbar-btn--play');
        } else {
            this.viPlayPauseBtn.html('Pause');
            this.viPlayPauseBtn.removeClass('toolbar-btn--play');
            this.viPlayPauseBtn.addClass('toolbar-btn--pause');
        }
    }

    updateVIButtonStates(isPlaying, canAdvance) {
        if (isPlaying) {
            this.setVIPlayPauseMode('pause');
        } else {
            this.setVIPlayPauseMode('play');
        }

        if (this.viPlayPauseBtn) {
            if (canAdvance) {
                this.viPlayPauseBtn.removeAttribute('disabled');
            } else {
                this.viPlayPauseBtn.attribute('disabled', '');
            }
        }

        if (this.viStepBtn) {
            if (!isPlaying && canAdvance) {
                this.viStepBtn.removeAttribute('disabled');
            } else {
                this.viStepBtn.attribute('disabled', '');
            }
        }

        if (this.viSkipBtn) {
            if (!isPlaying && canAdvance) {
                this.viSkipBtn.removeAttribute('disabled');
            } else {
                this.viSkipBtn.attribute('disabled', '');
            }
        }
    }
}
