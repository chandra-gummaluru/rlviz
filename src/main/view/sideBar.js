class SideBar {
    constructor(onStateClick, onActionClick, onToggle, onTextBoxClick, onImportGraph, onModeChange, onZoomIn, onZoomOut, onUndo, onRedo, onPlay, onSkip, onReset, canvasViewModel) {
        this.width = 260;
        this.collapsed = false;
        this.mode = 'editor'; // 'editor' or 'simulate'

        this.onStateClick = onStateClick;
        this.onActionClick = onActionClick;
        this.onToggle = onToggle;
        this.onTextBoxClick = onTextBoxClick;
        this.onImportGraph = onImportGraph;
        this.onModeChange = onModeChange;
        this.onZoomIn = onZoomIn;
        this.onZoomOut = onZoomOut;
        this.onUndo = onUndo;
        this.onRedo = onRedo;
        this.onPlay = onPlay;
        this.onSkip = onSkip;
        this.onReset = onReset;
        this.canvasViewModel = canvasViewModel;

        this.toggleButton = null;
        this.modeSelect = null;
        this.stateButton = null;
        this.actionButton = null;
        this.textButton = null;
        this.importButton = null;
        this.zoomInButton = null;
        this.zoomOutButton = null;
        this.undoButton = null;
        this.redoButton = null;
        this.playButton = null;
        this.skipButton = null;
        this.resetButton = null;
        this.helpText = null;
        this.startNodeStatus = null;
    }

    setup() {
        console.log('SideBar setup called');

        // Toggle sidebar button
        this.toggleButton = createButton('<<');
        this.toggleButton.position(10, 10);
        this.toggleButton.size(30, 30);
        this.toggleButton.mousePressed(() => this.onToggle());
        this.styleToggleButton();
        console.log('Toggle button created');

        // Undo/Redo and Zoom buttons (above mode select)
        this.undoButton = new UndoButton(
            20, 50, 50, 40,
            () => this.onUndo()
        );
        console.log('Undo button created');

        this.redoButton = new RedoButton(
            80, 50, 50, 40,
            () => this.onRedo()
        );
        console.log('Redo button created');

        this.zoomInButton = new ZoomInButton(
            140, 50, 50, 40,
            () => this.onZoomIn()
        );
        console.log('Zoom in button created');

        this.zoomOutButton = new ZoomOutButton(
            200, 50, 50, 40,
            () => this.onZoomOut()
        );
        console.log('Zoom out button created');

        // Mode selector dropdown (moved down)
        this.modeSelect = new ModeSelect(
            20, 100, 220,
            (mode) => this.handleModeChange(mode)
        );
        console.log('Mode selector created');

        // Add State button
        this.stateButton = new StateButton(
            20, 140, 100, 40,
            () => this.onStateClick()
        );
        console.log('State button created:', this.stateButton);

        // Add Action button
        this.actionButton = new ActionButton(
            130, 140, 100, 40,
            () => this.onActionClick()
        );
        console.log('Action button created:', this.actionButton);

        // Import Graph button
        this.importButton = new ImportButton(
            20, 190, 100, 40,
            () => this.onImportGraph()
        );
        console.log('Import button created');

        // Add Text button
        this.textButton = new TextButton(
            130, 190, 100, 40,
            () => this.onTextBoxClick()
        );
        console.log('Text button created');

        // Simulation control buttons (positioned at top right of screen)
        // These will be positioned dynamically based on window width
        const rightOffset = 20; // 20px from right edge
        const topOffset = 10;   // 10px from top
        const buttonWidth = 80;
        const buttonHeight = 40;
        const buttonSpacing = 10;

        // Calculate positions from right edge
        this.resetButton = new ResetButton(
            windowWidth - rightOffset - buttonWidth,
            topOffset,
            buttonWidth,
            buttonHeight,
            () => this.onReset()
        );
        console.log('Reset button created');

        this.skipButton = new SkipButton(
            windowWidth - rightOffset - (buttonWidth * 2) - buttonSpacing,
            topOffset,
            buttonWidth,
            buttonHeight,
            () => this.onSkip()
        );
        console.log('Skip button created');

        this.playButton = new PlayButton(
            windowWidth - rightOffset - (buttonWidth * 3) - (buttonSpacing * 2),
            topOffset,
            buttonWidth,
            buttonHeight,
            () => this.onPlay()
        );
        console.log('Play button created');

        // Help text
        this.helpText = createElement('div');
        this.helpText.position(20, 240);
        this.helpText.size(220);
        this.helpText.style('font-size', '12px');
        this.helpText.style('color', '#666');
        this.helpText.style('line-height', '1.4');
        this.helpText.html(`
            <b>Editor Controls:</b><br>
            • Double-click node to rename<br>
            • Select node/edge + Delete key<br>
            • Click & drag to move nodes<br>
            • Click two nodes to create edge<br>
            • Mouse wheel or pinch to zoom<br>
            • Press R to reset zoom<br>
            • Drag empty canvas to pan<br>
            • Ctrl+Z / Ctrl+Shift+Z: Undo/Redo
        `);

        // Simulate mode prompt
        this.simulatePrompt = createElement('div');
        this.simulatePrompt.position(20, 240);
        this.simulatePrompt.size(220);
        this.simulatePrompt.style('font-size', '14px');
        this.simulatePrompt.style('color', '#00E676');
        this.simulatePrompt.style('line-height', '1.4');
        this.simulatePrompt.style('font-weight', 'bold');
        this.simulatePrompt.html(`
            <b>Simulate Mode</b><br>
            • Double-click a node to start the simulation<br>
            • Mouse wheel or pinch to zoom<br>
            • Drag empty canvas to pan
        `);
        this.simulatePrompt.hide(); // Hidden by default

        // Start node status indicator (positioned below mode select)
        this.startNodeStatus = createElement('div');
        this.startNodeStatus.position(20, 145);
        this.startNodeStatus.size(200, 30);
        this.startNodeStatus.style('font-size', '13px');
        this.startNodeStatus.style('line-height', '1.4');
        this.startNodeStatus.style('padding', '5px 8px');
        this.startNodeStatus.style('background-color', '#ffffff');
        this.startNodeStatus.style('border-radius', '4px');
        this.startNodeStatus.style('border', 'none');
        this.startNodeStatus.html(`<span style="color: #999;">●</span> Start Node: <span style="color: #666;">None selected</span>`);
        this.startNodeStatus.hide(); // Hidden by default

        this.updateModeDisplay();
    }

    handleModeChange(mode) {
        this.mode = mode;
        this.updateModeDisplay();
        if (this.onModeChange) {
            this.onModeChange(this.mode);
        }
    }

    updateModeDisplay() {
        if (this.mode === 'editor') {
            // Show editor buttons and help text
            this.stateButton.show();
            this.actionButton.show();
            this.textButton.show();
            this.importButton.show();
            this.helpText.show();
            this.simulatePrompt.hide();
            this.startNodeStatus.hide();
            // Hide simulation control buttons
            this.playButton.hide();
            this.skipButton.hide();
            this.resetButton.hide();
        } else {
            // Hide editor buttons, show simulate prompt
            this.stateButton.hide();
            this.actionButton.hide();
            this.textButton.hide();
            this.importButton.hide();
            this.helpText.hide();
            this.simulatePrompt.show();
            this.startNodeStatus.show();
            // Show simulation control buttons
            this.playButton.show();
            this.skipButton.show();
            this.resetButton.show();
            // Update start node status when switching to simulate mode
            this.updateStartNodeStatus();
        }
    }

    setCollapsed(collapsed) {
        this.collapsed = collapsed;

        if (collapsed) {
            this.toggleButton.html('>>');
            this.modeSelect.hide();
            this.stateButton.hide();
            this.actionButton.hide();
            this.textButton.hide();
            this.importButton.hide();
            this.zoomInButton.hide();
            this.zoomOutButton.hide();
            this.undoButton.hide();
            this.redoButton.hide();
            this.playButton.hide();
            this.skipButton.hide();
            this.resetButton.hide();
            this.helpText.hide();
            this.simulatePrompt.hide();
            this.startNodeStatus.hide();
            
        } else {
            this.toggleButton.html('<<');
            this.modeSelect.show();
            this.zoomInButton.show();
            this.zoomOutButton.show();
            this.undoButton.show();
            this.redoButton.show();
            this.updateModeDisplay();
            this.updateUndoRedoButtons();
        }
    }

    updateUndoRedoButtons() {
        if (!this.undoButton || !this.redoButton || !this.canvasViewModel) {
            return;
        }

        // Update undo button state
        const canUndo = this.canvasViewModel.canUndo();
        this.undoButton.setEnabled(canUndo);

        // Update redo button state
        const canRedo = this.canvasViewModel.canRedo();
        this.redoButton.setEnabled(canRedo);
    }

    updateStartNodeStatus() {
        if (!this.startNodeStatus || !this.canvasViewModel) {
            return;
        }

        const startNode = this.canvasViewModel.startNode;

        if (!startNode) {
            // No start node selected - show neutral/gray state
            this.startNodeStatus.html(`<span style="color: #999;">●</span> Start Node: <span style="color: #666;">None selected</span>`);
        } else {
            // Start node selected - show active/green state with node name
            this.startNodeStatus.html(`<span style="color: #00E676;">●</span> Start Node: <span style="color: #000; font-weight: bold;">${startNode.getName()}</span>`);
        }
    }

    updateSimulationButtonPositions() {
        // Reposition simulation control buttons when window is resized
        const rightOffset = 20;
        const topOffset = 10;
        const buttonWidth = 80;
        const buttonSpacing = 10;

        if (this.resetButton) {
            this.resetButton.button.position(
                windowWidth - rightOffset - buttonWidth,
                topOffset
            );
        }

        if (this.skipButton) {
            this.skipButton.button.position(
                windowWidth - rightOffset - (buttonWidth * 2) - buttonSpacing,
                topOffset
            );
        }

        if (this.playButton) {
            this.playButton.button.position(
                windowWidth - rightOffset - (buttonWidth * 3) - (buttonSpacing * 2),
                topOffset
            );
        }
    }

    styleToggleButton() {
        this.toggleButton.style('font-size', '16px');
        this.toggleButton.style('padding', '0');
        this.toggleButton.style('cursor', 'pointer');
    }
}
