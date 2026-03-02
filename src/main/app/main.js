// Domain
const graph = new Graph();
const commandHistory = new CommandHistory(50);
const simulationState = new SimulationState();
const traceGenerator = new TraceGenerator(graph);

// Adapter - Create ViewModel (no interactors in constructor anymore)
const canvasViewModel = new CanvasViewModel(graph, simulationState);

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
    setImage: setImageInteractor
});

// View instances (will be set in setup)
let mainView;
let sideBar;
let menuBar;
let toolBar;
let rightPanel;

// Simulation Presenter (needs ViewModel and MainView references, created in setup)
let simulationPresenter;
let playInteractor;
let skipInteractor;
let resetInteractor;

// Callbacks
const onStateClick = () => {
    console.log('State button clicked!');
    canvasController.startNodePlacement('state');
    console.log('Placement mode:', canvasViewModel.interaction.placingMode);
    console.log('Held node:', canvasViewModel.interaction.heldNode);
    redraw();
};

const onActionClick = () => {
    console.log('Action button clicked!');
    canvasController.startNodePlacement('action');
    console.log('Placement mode:', canvasViewModel.interaction.placingMode);
    console.log('Held node:', canvasViewModel.interaction.heldNode);
    redraw();
};

const onTextBoxClick = () => {
    console.log('Text box button clicked!');
    canvasController.startNodePlacement('textbox');
    redraw();
};

const onImportGraph = () => {
    console.log('Import graph clicked!');
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
    console.log('Export graph clicked!');
    // Get the serialized graph
    const json = canvasController.exportGraph();

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
    console.log('Mode changed to:', mode);
    canvasController.setMode(mode);
    redraw();
};

const onZoomIn = () => {
    console.log('Zoom in clicked!');
    canvasController.zoomIn(windowWidth / 2, windowHeight / 2);
    redraw();
};

const onZoomOut = () => {
    console.log('Zoom out clicked!');
    canvasController.zoomOut(windowWidth / 2, windowHeight / 2);
    redraw();
};

const onUndo = () => {
    console.log('Undo clicked!');
    canvasController.undo();
    sideBar.updateUndoRedoButtons();
    redraw();
};

const onRedo = () => {
    console.log('Redo clicked!');
    canvasController.redo();
    sideBar.updateUndoRedoButtons();
    redraw();
};

const onRenormalize = () => {
    console.log('Renormalize clicked!');
    const inputData = new RenormalizeProbabilitiesInputData();
    renormalizeProbabilitiesInteractor.execute(inputData);
    redraw();
};

const onResetZoom = () => {
    console.log('Reset zoom clicked!');
    canvasViewModel.viewport.reset();
    redraw();
};

const onPlay = () => {
    console.log('Play clicked!');
    if (!playInteractor) {
        console.error('PlayInteractor not initialized');
        return;
    }

    // Check if start node is selected
    if (!canvasViewModel.interaction.startNode && !simulationState.replayInitialized) {
        alert('Please select a start node first by double-clicking a state node');
        return;
    }

    const inputData = new PlayInputData();
    playInteractor.execute(inputData);

    // Update play button state (toggle between play and pause)
    // Note: For first click (initialization), the presenter will set it to playing
    // For subsequent clicks, we toggle here immediately
    if (simulationState.replayInitialized) {
        sideBar.playButton.setPlaying(simulationState.isPlaying);
    }
};

const onSkip = () => {
    console.log('Skip clicked!');
    if (!skipInteractor) {
        console.error('SkipInteractor not initialized');
        return;
    }

    // Check if simulation has been initialized
    if (!simulationState.replayInitialized) {
        alert('Please click Play first to start the simulation');
        return;
    }

    // Pause if playing
    if (simulationState.isPlaying) {
        simulationState.pause();
        sideBar.playButton.setPlaying(false);
    }

    const inputData = new SkipInputData();
    skipInteractor.execute(inputData);
};

const onReset = () => {
    console.log('Reset clicked!');
    if (!resetInteractor) {
        console.error('ResetInteractor not initialized');
        return;
    }

    // Check if simulation has been initialized
    if (!simulationState.replayInitialized) {
        console.log('No simulation to reset');
        return;
    }

    const inputData = new ResetInputData();
    resetInteractor.execute(inputData);

    // Reset play button to Play state
    sideBar.playButton.setPlaying(false);
};

const onToggleSidebar = () => {
    if (mainView) {
        mainView.toggleSidebar();
    }
};

// p5.js lifecycle hooks
function setup() {
    console.log('Setup called!');

    // Create menu bar (Row 1)
    menuBar = new MenuBar({
        onImport: onImportGraph,
        onExport: onExportGraph,
        onUndo: onUndo,
        onRedo: onRedo,
        onZoomIn: onZoomIn,
        onZoomOut: onZoomOut,
        onResetZoom: onResetZoom
    });
    menuBar.setup();
    console.log('MenuBar created:', menuBar);

    // Create toolbar (Row 2)
    toolBar = new ToolBar({
        onStateClick: onStateClick,
        onActionClick: onActionClick,
        onTextBoxClick: onTextBoxClick,
        onRenormalize: onRenormalize,
        onPlay: onPlay,
        onStep: onSkip, // Using skip as step for now
        onRerun: onReset,
        onModeChange: onModeChange
    }, canvasViewModel);
    toolBar.setup(menuBar.getHeight());
    console.log('ToolBar created:', toolBar);

    // Create right panel
    rightPanel = new RightPanel(canvasViewModel, canvasController);
    rightPanel.setup(menuBar.getHeight() + toolBar.getHeight());
    console.log('RightPanel created:', rightPanel);

    // Set right panel reference in setModePresenter so it can update when mode changes
    setModePresenter.setRightPanel(rightPanel);

    // Sidebar removed - functionality now in menuBar and toolBar
    // sideBar = new SideBar(onStateClick, onActionClick, onToggleSidebar, onTextBoxClick, onImportGraph, onExportGraph, onModeChange, onZoomIn, onZoomOut, onUndo, onRedo, onPlay, onSkip, onReset, onRenormalize, canvasViewModel);
    // console.log('SideBar created:', sideBar);

    mainView = new MainView(canvasViewModel, canvasController, null, menuBar, toolBar, rightPanel);
    console.log('MainView created:', mainView);

    // Create simulation presenter and interactors (need both ViewModel and MainView)
    simulationPresenter = new SimulationPresenter(canvasViewModel, mainView);

    // Create start node provider function
    const startNodeProvider = () => canvasViewModel.interaction.startNode;

    playInteractor = new PlayInteractor(simulationState, traceGenerator, simulationPresenter, startNodeProvider);
    skipInteractor = new SkipInteractor(simulationState, simulationPresenter);
    resetInteractor = new ResetInteractor(simulationState, simulationPresenter);

    // Initialize
    mainView.setup();
    console.log('Setup complete!');
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
