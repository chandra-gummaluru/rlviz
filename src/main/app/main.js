// Domain
const graph = new Graph();
const commandHistory = new CommandHistory(50);
const simulationState = new SimulationState();
const traceGenerator = new TraceGenerator(graph);
const valueIterationState = new ValueIterationState();

// Adapter - Create ViewModel (no interactors in constructor anymore)
const canvasViewModel = new CanvasViewModel(graph, simulationState);
const valueIterationViewModel = new ValueIterationViewModel();
canvasViewModel.valueIterationState = valueIterationState;
canvasViewModel.valueIterationViewModel = valueIterationViewModel;

// Presenters for existing use cases
const createNodePresenter = new CreateNodePresenter(canvasViewModel.interaction);
const createEdgePresenter = new CreateEdgePresenter(canvasViewModel);
const serializeGraphPresenter = new SerializeGraphPresenter(canvasViewModel);
const undoPresenter = new UndoPresenter(canvasViewModel);
const redoPresenter = new RedoPresenter(canvasViewModel);
const setModePresenter = new SetModePresenter(canvasViewModel.interaction);
const zoomPresenter = new ZoomPresenter(canvasViewModel.viewport);
const importGraphPresenter = new ImportGraphPresenter(canvasViewModel);

// Presenters for new refactored use cases
const deleteNodePresenter = new DeleteNodePresenter(canvasViewModel.selection);
const moveNodePresenter = new MoveNodePresenter(canvasViewModel.interaction);
const renameNodePresenter = new RenameNodePresenter(canvasViewModel.interaction);
const selectNodePresenter = new SelectNodePresenter(canvasViewModel.selection);
const createTextLabelPresenter = new CreateTextLabelPresenter(canvasViewModel.interaction);
const resizeNodePresenter = new ResizeNodePresenter(canvasViewModel);
const renormalizeProbabilitiesPresenter = new RenormalizeProbabilitiesPresenter(canvasViewModel);
const setImagePresenter = new SetImagePresenter(canvasViewModel);
const setSpinningArrowPresenter = new SetSpinningArrowPresenter(canvasViewModel);

// Interactors for existing use cases
const createNodeInteractor = new CreateNodeInteractor(graph, createNodePresenter);
const createEdgeInteractor = new CreateEdgeInteractor(graph, commandHistory, createEdgePresenter);
const serializeGraphInteractor = new SerializeGraphInteractor(graph, serializeGraphPresenter);
const undoInteractor = new UndoInteractor(commandHistory, undoPresenter);
const redoInteractor = new RedoInteractor(commandHistory, redoPresenter);
const setModeInteractor = new SetModeInteractor(setModePresenter);
const zoomInInteractor = new ZoomInInteractor(zoomPresenter);
const zoomOutInteractor = new ZoomOutInteractor(zoomPresenter);
const importGraphInteractor = new ImportGraphInteractor(graph, importGraphPresenter);
const resizeNodeInteractor = new ResizeNodeInteractor(graph, commandHistory, resizeNodePresenter);

// Interactors for new refactored use cases
const deleteNodeInteractor = new DeleteNodeInteractor(graph, commandHistory, deleteNodePresenter);
const moveNodeInteractor = new MoveNodeInteractor(graph, moveNodePresenter);
const renameNodeInteractor = new RenameNodeInteractor(graph, commandHistory, renameNodePresenter);
const selectNodeInteractor = new SelectNodeInteractor(graph, selectNodePresenter);
const createTextLabelInteractor = new CreateTextLabelInteractor(graph, commandHistory, createTextLabelPresenter);
const renormalizeProbabilitiesInteractor = new RenormalizeProbabilitiesInteractor(graph, commandHistory, renormalizeProbabilitiesPresenter);
const setImageInteractor = new SetImageInteractor(graph, commandHistory, setImagePresenter);
const setSpinningArrowInteractor = new SetSpinningArrowInteractor(simulationState, setSpinningArrowPresenter);

// Controller (receives all interactors, delegates to them)
const canvasController = new CanvasController(canvasViewModel, {
    createNode: createNodeInteractor,
    createEdge: createEdgeInteractor,
    deleteNode: deleteNodeInteractor,
    moveNode: moveNodeInteractor,
    renameNode: renameNodeInteractor,
    selectNode: selectNodeInteractor,
    createTextLabel: createTextLabelInteractor,
    resizeNode: resizeNodeInteractor,
    undo: undoInteractor,
    redo: redoInteractor,
    setMode: setModeInteractor,
    zoomIn: zoomInInteractor,
    zoomOut: zoomOutInteractor,
    importGraph: importGraphInteractor,
    serializeGraph: serializeGraphInteractor,
    renormalizeProbabilities: renormalizeProbabilitiesInteractor,
    setImage: setImageInteractor,
    setSpinningArrow: setSpinningArrowInteractor
});

// View instances (will be set in setup)
let mainView;
let menuBar;
let toolBar;
let rightPanel;

// Simulation Presenter (needs ViewModel and MainView references, created in setup)
let simulationPresenter;
let playInteractor;
let pauseInteractor;
let stepInteractor;
let skipInteractor;
let resetInteractor;

// Value Iteration (created in setup)
let viPresenter;
let runVIInteractor;
let viPlayInteractor;
let viPauseInteractor;
let viStepInteractor;
let viResetInteractor;

// Callbacks
const onStateClick = () => {
    canvasController.startNodePlacement('state');
    redraw();
};

const onActionClick = () => {
    canvasController.startNodePlacement('action');
    redraw();
};

const onTextBoxClick = () => {
    canvasController.startNodePlacement('textbox');
    redraw();
};

const onImportGraph = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            // Pass the JSON string directly to importGraph
            // The interactor will handle parsing and validation
            canvasController.importGraph(event.target.result);
            redraw();
        };
        reader.readAsText(file);
    };
    input.click();
};

const onExportGraph = () => {
    // Get the serialized graph
    const json = canvasController.exportGraph(true);

    if (!json) {
        console.error('Export failed: no data returned from exportGraph');
        alert('Export failed: could not serialize graph');
        return;
    }

    // Create a blob from the JSON string
    const blob = new Blob([json], { type: 'application/json' });

    // Create a download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `mdp-graph-${timestamp}.json`;

    // Trigger download
    link.click();

    // Clean up
    URL.revokeObjectURL(url);
};

const onModeChange = (mode) => {
    // Reset VI state when leaving value_iteration mode
    if (mode !== 'value_iteration' && valueIterationState.initialized) {
        valueIterationState.pause();
        valueIterationState.reset();
        valueIterationViewModel.reset();
    }
    canvasController.setMode(mode);
    redraw();
};

const onZoomIn = () => {
    canvasController.zoomIn(windowWidth / 2, windowHeight / 2);
    redraw();
};

const onZoomOut = () => {
    canvasController.zoomOut(windowWidth / 2, windowHeight / 2);
    redraw();
};

const onUndo = () => {
    canvasController.undo();
    redraw();
};

const onRedo = () => {
    canvasController.redo();
    redraw();
};

const onRenormalize = () => {
    const inputData = new RenormalizeProbabilitiesInputData();
    renormalizeProbabilitiesInteractor.execute(inputData);
    redraw();
};

const onResetZoom = () => {
    canvasViewModel.viewport.reset();
    redraw();
};

// Animation speed presets
const SPEED_PRESETS = {
    fast: {
        PRE_SETUP_PAUSE: 200,
        POST_ERASE_PAUSE: 100,
        CAMERA_CENTER: 300,
        DECISION_PAUSE: 150,
        EDGE_HIGHLIGHT: 250,
        TRANSITION_PAUSE: 100,
        CAMERA_TRANSITION: 250
    },
    medium: {
        PRE_SETUP_PAUSE: 500,
        POST_ERASE_PAUSE: 300,
        CAMERA_CENTER: 600,
        DECISION_PAUSE: 400,
        EDGE_HIGHLIGHT: 600,
        TRANSITION_PAUSE: 300,
        CAMERA_TRANSITION: 600
    },
    slow: {
        PRE_SETUP_PAUSE: 800,
        POST_ERASE_PAUSE: 500,
        CAMERA_CENTER: 1000,
        DECISION_PAUSE: 700,
        EDGE_HIGHLIGHT: 1000,
        TRANSITION_PAUSE: 500,
        CAMERA_TRANSITION: 1000
    }
};

let currentSpeed = 'medium';

const onSetAnimationSpeed = (speed) => {
    const timing = SPEED_PRESETS[speed];
    if (!timing) return;
    currentSpeed = speed;
    if (playInteractor) playInteractor.setTiming(timing);
    if (stepInteractor) stepInteractor.setTiming(timing);
    if (menuBar) menuBar.updateSettingsChecks(currentSpeed, simulationState.spinningArrowEnabled);
};

const onToggleSpinningArrow = () => {
    const newEnabled = !simulationState.spinningArrowEnabled;
    canvasController.toggleSpinningArrow(newEnabled);
    if (menuBar) menuBar.updateSettingsChecks(currentSpeed, newEnabled);
};

/**
 * Check for unnormalized action nodes before simulation starts.
 * If found, prompt user to confirm auto-renormalization.
 * Returns true if simulation should proceed, false otherwise.
 */
function checkAndRenormalizeIfNeeded() {
    if (simulationState.replayInitialized) return true; // already running
    const unnormalized = graph.getUnnormalizedActionNodes();
    if (unnormalized.length === 0) return true; // all good
    const names = unnormalized.map(n => n.name).join(', ');
    const proceed = confirm(
        `Action node(s) [${names}] have probabilities that don't sum to 1.\n\n` +
        `Continuing will renormalize these probabilities. Proceed?`
    );
    if (proceed) {
        renormalizeProbabilitiesInteractor.execute(new RenormalizeProbabilitiesInputData());
    }
    return proceed;
}

// Value Iteration callbacks
const onVIPlay = () => {
    if (!runVIInteractor || !viPlayInteractor) return;

    const T = toolBar ? toolBar.getVIT() : 5;
    const gamma = rightPanel ? rightPanel.discountFactor : 0.9;

    // Initialize if not already done
    if (!valueIterationState.initialized) {
        const inputData = new RunVIInputData(T, gamma);
        runVIInteractor.execute(inputData);
    }

    viPlayInteractor.execute(new VIPlayInputData());

    if (toolBar) {
        toolBar.updateVIButtonStates(valueIterationState.isPlaying, valueIterationState.canAdvance());
    }
};

const onVIPause = () => {
    if (!viPauseInteractor) return;
    viPauseInteractor.execute(new VIPauseInputData());
    if (toolBar) {
        toolBar.updateVIButtonStates(valueIterationState.isPlaying, valueIterationState.canAdvance());
    }
};

const onVIStep = () => {
    if (!viStepInteractor) return;

    const T = toolBar ? toolBar.getVIT() : 5;
    const gamma = rightPanel ? rightPanel.discountFactor : 0.9;

    // Initialize if not already done
    if (!valueIterationState.initialized) {
        const inputData = new RunVIInputData(T, gamma);
        runVIInteractor.execute(inputData);
    }

    // Pause if playing
    if (valueIterationState.isPlaying) {
        valueIterationState.pause();
    }

    viStepInteractor.execute(new VIStepInputData());

    if (toolBar) {
        toolBar.updateVIButtonStates(valueIterationState.isPlaying, valueIterationState.canAdvance());
    }
};

const onVIReset = () => {
    if (!viResetInteractor) return;
    viResetInteractor.execute(new VIResetInputData());
    if (toolBar) {
        toolBar.updateVIButtonStates(false, true);
    }
};

const onPlay = () => {
    if (!playInteractor) return;

    // Check if start node is selected
    if (!canvasViewModel.interaction.startNode && !simulationState.replayInitialized) {
        alert('Please select a start node first by double-clicking a state node');
        return;
    }

    // Check for unnormalized probabilities before first initialization
    if (!checkAndRenormalizeIfNeeded()) return;

    const inputData = new PlayInputData();
    playInteractor.execute(inputData);

    // Update button states
    if (toolBar) {
        toolBar.updateButtonStates(simulationState.isPlaying, simulationState.canAdvance());
    }
};

const onPause = () => {
    if (!pauseInteractor) return;

    const inputData = new PauseInputData();
    pauseInteractor.execute(inputData);

    // Update button states
    if (toolBar) {
        toolBar.updateButtonStates(simulationState.isPlaying, simulationState.canAdvance());
    }
};

const onStep = () => {
    if (!stepInteractor) return;

    // Check if start node is selected for first step
    if (!canvasViewModel.interaction.startNode && !simulationState.replayInitialized) {
        alert('Please select a start node first by double-clicking a state node');
        return;
    }

    // Check for unnormalized probabilities before first initialization
    if (!checkAndRenormalizeIfNeeded()) return;

    // Pause if playing
    if (simulationState.isPlaying) {
        simulationState.pause();
        if (toolBar) {
            toolBar.updateButtonStates(false, simulationState.canAdvance());
        }
    }

    const inputData = new StepInputData();
    stepInteractor.execute(inputData);
};

const onSkip = () => {
    if (!skipInteractor) return;

    // Check if simulation has been initialized
    if (!simulationState.replayInitialized) {
        alert('Please click Play or Step first to start the simulation');
        return;
    }

    // Pause if playing
    if (simulationState.isPlaying) {
        simulationState.pause();
        if (toolBar) {
            toolBar.updateButtonStates(false, simulationState.canAdvance());
        }
    }

    const inputData = new SkipInputData();
    skipInteractor.execute(inputData);
};

const onReset = () => {
    if (!resetInteractor) return;

    // Check if simulation has been initialized
    if (!simulationState.replayInitialized) return;

    const inputData = new ResetInputData();
    resetInteractor.execute(inputData);

    // Reset button states - keep buttons enabled so user can start a new simulation
    if (toolBar) {
        toolBar.updateButtonStates(false, true);
    }
};

// p5.js lifecycle hooks
function setup() {
    // Create menu bar (Row 1)
    menuBar = new MenuBar({
        onImport: onImportGraph,
        onExport: onExportGraph,
        onUndo: onUndo,
        onRedo: onRedo,
        onZoomIn: onZoomIn,
        onZoomOut: onZoomOut,
        onResetZoom: onResetZoom,
        onSetAnimationSpeed: onSetAnimationSpeed,
        onToggleSpinningArrow: onToggleSpinningArrow
    });
    menuBar.setup();

    // Create toolbar (Row 2)
    toolBar = new ToolBar({
        onStateClick: onStateClick,
        onActionClick: onActionClick,
        onTextBoxClick: onTextBoxClick,
        onRenormalize: onRenormalize,
        onPlay: onPlay,
        onPause: onPause,
        onStep: onStep,
        onRerun: onReset,
        onModeChange: onModeChange,
        onVIPlay: onVIPlay,
        onVIPause: onVIPause,
        onVIStep: onVIStep,
        onVIReset: onVIReset
    }, canvasViewModel);
    toolBar.setup(menuBar.getHeight());

    // Create right panel
    rightPanel = new RightPanel(canvasViewModel, canvasController);
    rightPanel.setup(menuBar.getHeight() + toolBar.getHeight());

    // Set right panel reference in setModePresenter so it can update when mode changes
    setModePresenter.setRightPanel(rightPanel);

    mainView = new MainView(canvasViewModel, canvasController, menuBar, toolBar, rightPanel);

    // Create simulation presenter and interactors (need both ViewModel and MainView)
    simulationPresenter = new SimulationPresenter(canvasViewModel, mainView);

    // Create start node provider function
    const startNodeProvider = () => canvasViewModel.interaction.startNode;

    playInteractor = new PlayInteractor(simulationState, traceGenerator, simulationPresenter, startNodeProvider);
    pauseInteractor = new PauseInteractor(simulationState, simulationPresenter);
    stepInteractor = new StepInteractor(simulationState, traceGenerator, simulationPresenter, startNodeProvider);
    skipInteractor = new SkipInteractor(simulationState, simulationPresenter);
    resetInteractor = new ResetInteractor(simulationState, simulationPresenter);

    // Create Value Iteration presenter and interactors
    viPresenter = new VIPresenter(canvasViewModel, mainView);
    viPresenter.setToolBar(toolBar);

    runVIInteractor = new RunVIInteractor(graph, valueIterationState, valueIterationViewModel, viPresenter);
    viPlayInteractor = new VIPlayInteractor(valueIterationState, valueIterationViewModel, viPresenter);
    viPauseInteractor = new VIPauseInteractor(valueIterationState, viPresenter);
    viStepInteractor = new VIStepInteractor(valueIterationState, valueIterationViewModel, viPresenter);
    viResetInteractor = new VIResetInteractor(valueIterationState, valueIterationViewModel, viPresenter);

    // Create Value Iteration view
    const valueIterationView = new ValueIterationView(canvasViewModel);
    mainView.valueIterationView = valueIterationView;

    // Initialize
    mainView.setup();
}

function draw() {
    mainView.draw();
}

function mousePressed() {
    mainView.mousePressed();
}

function mouseDragged() {
    mainView.mouseDragged();
}

function mouseReleased() {
    mainView.mouseReleased();
}

function mouseMoved() {
    mainView.mouseMoved();
}

function keyPressed() {
    mainView.keyPressed();
}

function keyReleased() {
    return mainView.keyReleased();
}

function mouseWheel(event) {
    return mainView.mouseWheel(event);
}

function touchStarted() {
    return mainView.touchStarted();
}

function touchMoved() {
    return mainView.touchMoved();
}

function windowResized() {
    mainView.windowResized();
}
