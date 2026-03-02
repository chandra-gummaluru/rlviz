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
        this.playBtn = null;
        this.stepBtn = null;
        this.rerunBtn = null;

        // Mode toggle
        this.editToggleBtn = null;
        this.simulateToggleBtn = null;

        this.currentMode = 'editor'; // 'editor' or 'simulate'
    }

    setup(menuBarHeight) {
        // Create main toolbar container
        this.toolBarElement = createDiv();
        this.toolBarElement.position(0, menuBarHeight);
        this.toolBarElement.size(windowWidth, this.height);
        this.toolBarElement.style('background-color', '#F5F5F5');
        this.toolBarElement.style('display', 'flex');
        this.toolBarElement.style('align-items', 'center');
        this.toolBarElement.style('justify-content', 'space-between');
        this.toolBarElement.style('padding', '0 15px');
        this.toolBarElement.style('border-bottom', '1px solid #DDDDDD');
        this.toolBarElement.style('z-index', '999');

        // Create left container for mode-dependent buttons
        this.leftButtonsContainer = createDiv();
        this.leftButtonsContainer.parent(this.toolBarElement);
        this.leftButtonsContainer.style('display', 'flex');
        this.leftButtonsContainer.style('gap', '10px');
        this.leftButtonsContainer.style('align-items', 'center');

        // Create right container for mode toggle
        this.rightToggleContainer = createDiv();
        this.rightToggleContainer.parent(this.toolBarElement);
        this.rightToggleContainer.style('display', 'flex');
        this.rightToggleContainer.style('gap', '0');
        this.rightToggleContainer.style('align-items', 'center');

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
        // Add State button
        this.addStateBtn = this.createButton('Add State', () => this.callbacks.onStateClick());
        this.addStateBtn.style('background-color', '#4CAF50');
        this.addStateBtn.style('color', '#FFFFFF');

        // Add Action button
        this.addActionBtn = this.createButton('Add Action', () => this.callbacks.onActionClick());
        this.addActionBtn.style('background-color', '#2196F3');
        this.addActionBtn.style('color', '#FFFFFF');

        // Add Text button
        this.addTextBtn = this.createButton('Add Text', () => this.callbacks.onTextBoxClick());
        this.addTextBtn.style('background-color', '#757575');
        this.addTextBtn.style('color', '#FFFFFF');

        // Renormalize button
        this.renormalizeBtn = this.createButton('Renormalize', () => this.callbacks.onRenormalize());
        this.renormalizeBtn.style('background-color', '#FF9800');
        this.renormalizeBtn.style('color', '#FFFFFF');
    }

    createSimulateModeButtons() {
        // Play button
        this.playBtn = this.createButton('Play', () => this.callbacks.onPlay());
        this.playBtn.style('background-color', '#4CAF50');
        this.playBtn.style('color', '#FFFFFF');

        // Step button
        this.stepBtn = this.createButton('Step', () => this.callbacks.onStep());
        this.stepBtn.style('background-color', '#2196F3');
        this.stepBtn.style('color', '#FFFFFF');

        // Rerun button (Reset)
        this.rerunBtn = this.createButton('Rerun', () => this.callbacks.onRerun());
        this.rerunBtn.style('background-color', '#FF9800');
        this.rerunBtn.style('color', '#FFFFFF');
    }

    createButton(label, onClick) {
        const btn = createButton(label);
        btn.parent(this.leftButtonsContainer);
        btn.style('padding', '8px 16px');
        btn.style('border', 'none');
        btn.style('border-radius', '4px');
        btn.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
        btn.style('font-size', '14px');
        btn.style('font-weight', '500');
        btn.style('cursor', 'pointer');
        btn.style('transition', 'opacity 0.2s');
        btn.mousePressed(onClick);

        // Hover effect
        btn.mouseOver(() => {
            btn.style('opacity', '0.85');
        });
        btn.mouseOut(() => {
            btn.style('opacity', '1.0');
        });

        return btn;
    }

    createModeToggle() {
        // Edit toggle button
        this.editToggleBtn = createButton('Edit');
        this.editToggleBtn.parent(this.rightToggleContainer);
        this.styleToggleButton(this.editToggleBtn, true);
        this.editToggleBtn.mousePressed(() => this.switchMode('editor'));

        // Simulate toggle button
        this.simulateToggleBtn = createButton('Simulate');
        this.simulateToggleBtn.parent(this.rightToggleContainer);
        this.styleToggleButton(this.simulateToggleBtn, false);
        this.simulateToggleBtn.mousePressed(() => this.switchMode('simulate'));
    }

    styleToggleButton(btn, isActive) {
        btn.style('padding', '8px 20px');
        btn.style('border', '1px solid #CCCCCC');
        btn.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
        btn.style('font-size', '14px');
        btn.style('font-weight', '500');
        btn.style('cursor', 'pointer');
        btn.style('transition', 'all 0.2s');

        if (isActive) {
            btn.style('background-color', '#2196F3');
            btn.style('color', '#FFFFFF');
            btn.style('border-color', '#2196F3');
        } else {
            btn.style('background-color', '#FFFFFF');
            btn.style('color', '#666666');
            btn.style('border-color', '#CCCCCC');
        }

        // Remove border radius for middle buttons
        btn.style('border-radius', '0');

        // Add rounded corners to first/last buttons
        if (btn === this.editToggleBtn) {
            btn.style('border-radius', '4px 0 0 4px');
        } else if (btn === this.simulateToggleBtn) {
            btn.style('border-radius', '0 4px 4px 0');
            btn.style('border-left', 'none');
        }
    }

    switchMode(newMode) {
        this.currentMode = newMode;
        this.setMode(newMode);

        // Call the mode change callback
        if (this.callbacks.onModeChange) {
            this.callbacks.onModeChange(newMode);
        }
    }

    setMode(mode) {
        this.currentMode = mode;

        if (mode === 'editor') {
            // Show Edit mode buttons
            this.addStateBtn.show();
            this.addActionBtn.show();
            this.addTextBtn.show();
            this.renormalizeBtn.show();

            // Hide Simulate mode buttons
            this.playBtn.hide();
            this.stepBtn.hide();
            this.rerunBtn.hide();

            // Update toggle button styles
            this.styleToggleButton(this.editToggleBtn, true);
            this.styleToggleButton(this.simulateToggleBtn, false);
        } else {
            // Hide Edit mode buttons
            this.addStateBtn.hide();
            this.addActionBtn.hide();
            this.addTextBtn.hide();
            this.renormalizeBtn.hide();

            // Show Simulate mode buttons
            this.playBtn.show();
            this.stepBtn.show();
            this.rerunBtn.show();

            // Update toggle button styles
            this.styleToggleButton(this.editToggleBtn, false);
            this.styleToggleButton(this.simulateToggleBtn, true);
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
}
