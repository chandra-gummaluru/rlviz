// Domain
const graph = new Graph();
const commandHistory = new CommandHistory(50);
const simulationState = new SimulationState();
const traceGenerator = new TraceGenerator(graph);

// Adapter - Create ViewModel with temporary null interactors
const canvasViewModel = new CanvasViewModel(graph, {
    undo: null,
    redo: null,
    setMode: null,
    zoomIn: null,
    zoomOut: null,
    importGraph: null,
    play: null,
    skip: null,
    reset: null,
    createNode: null,
    createEdge: null,
    nodeInteraction: null,
    serializeGraph: null
});

// Presenters (need ViewModel reference)
const createNodePresenter = new CreateNodePresenter(canvasViewModel);
const createEdgePresenter = new CreateEdgePresenter(canvasViewModel);
const nodeInteractionPresenter = new NodeInteractionPresenter(canvasViewModel);
const serializeGraphPresenter = new SerializeGraphPresenter(canvasViewModel);
const undoPresenter = new UndoPresenter(canvasViewModel);
const redoPresenter = new RedoPresenter(canvasViewModel);
const setModePresenter = new SetModePresenter(canvasViewModel);
const zoomPresenter = new ZoomPresenter(canvasViewModel);
const importGraphPresenter = new ImportGraphPresenter(canvasViewModel);
const resizeNodePresenter = new ResizeNodePresenter(canvasViewModel);

// Interactors (need domain objects and presenters)
const createNodeInteractor = new CreateNodeInteractor(graph, createNodePresenter);
const createEdgeInteractor = new CreateEdgeInteractor(graph, createEdgePresenter);
const nodeInteractionInteractor = new NodeInteractionInteractor(graph, nodeInteractionPresenter);
const serializeGraphInteractor = new SerializeGraphInteractor(graph, serializeGraphPresenter);
const undoInteractor = new UndoInteractor(commandHistory, undoPresenter);
const redoInteractor = new RedoInteractor(commandHistory, redoPresenter);
const setModeInteractor = new SetModeInteractor(setModePresenter);
const zoomInInteractor = new ZoomInInteractor(zoomPresenter);
const zoomOutInteractor = new ZoomOutInteractor(zoomPresenter);
const importGraphInteractor = new ImportGraphInteractor(graph, importGraphPresenter);
const resizeNodeInteractor = new ResizeNodeInteractor(graph, commandHistory, resizeNodePresenter);

// View instances (will be set in setup)
let mainView;
let sideBar;

// Simulation Presenter (needs ViewModel and MainView references, created in setup)
let simulationPresenter;
let playInteractor;
let skipInteractor;
let resetInteractor;

// Wire up interactors to ViewModel (after they're all created)
canvasViewModel.createNodeInteractor = createNodeInteractor;
canvasViewModel.createEdgeInteractor = createEdgeInteractor;
canvasViewModel.nodeInteractionInteractor = nodeInteractionInteractor;
canvasViewModel.nodeInteractionPresenter = nodeInteractionPresenter;  // For getFoundNode()
canvasViewModel.serializeGraphInteractor = serializeGraphInteractor;
canvasViewModel.serializeGraphPresenter = serializeGraphPresenter;  // For getSerializedData()
canvasViewModel.undoInteractor = undoInteractor;
canvasViewModel.redoInteractor = redoInteractor;
canvasViewModel.setModeInteractor = setModeInteractor;
canvasViewModel.zoomInInteractor = zoomInInteractor;
canvasViewModel.zoomOutInteractor = zoomOutInteractor;
canvasViewModel.importGraphInteractor = importGraphInteractor;
canvasViewModel.resizeNodeInteractor = resizeNodeInteractor;

// Callbacks
const onStateClick = () => {
    console.log('State button clicked!');
    canvasViewModel.startNodePlacement('state');
    console.log('Placement mode:', canvasViewModel.placingMode);
    console.log('Held node:', canvasViewModel.heldNode);
    redraw();
};

const onActionClick = () => {
    console.log('Action button clicked!');
    canvasViewModel.startNodePlacement('action');
    console.log('Placement mode:', canvasViewModel.placingMode);
    console.log('Held node:', canvasViewModel.heldNode);
    redraw();
};

const onTextBoxClick = () => {
    console.log('Text box button clicked!');
    canvasViewModel.startNodePlacement('textbox');
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
            canvasViewModel.importGraph(event.target.result);
            redraw();
        };
        reader.readAsText(file);
    };
    input.click();
};

const onExportGraph = () => {
    console.log('Export graph clicked!');
    // Get the serialized graph
    const json = canvasViewModel.serializeGraph();

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
    canvasViewModel.setMode(mode);
    redraw();
};

const onZoomIn = () => {
    console.log('Zoom in clicked!');
    canvasViewModel.zoomIn(windowWidth / 2, windowHeight / 2);
    redraw();
};

const onZoomOut = () => {
    console.log('Zoom out clicked!');
    canvasViewModel.zoomOut(windowWidth / 2, windowHeight / 2);
    redraw();
};

const onUndo = () => {
    console.log('Undo clicked!');
    if (canvasViewModel.undo()) {
        sideBar.updateUndoRedoButtons();
        redraw();
    }
};

const onRedo = () => {
    console.log('Redo clicked!');
    if (canvasViewModel.redo()) {
        sideBar.updateUndoRedoButtons();
        redraw();
    }
};

const onPlay = () => {
    console.log('Play clicked!');
    if (!playInteractor) {
        console.error('PlayInteractor not initialized');
        return;
    }

    // Check if start node is selected
    if (!canvasViewModel.startNode && !simulationState.replayInitialized) {
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

    // Create view instances
    sideBar = new SideBar(onStateClick, onActionClick, onToggleSidebar, onTextBoxClick, onImportGraph, onExportGraph, onModeChange, onZoomIn, onZoomOut, onUndo, onRedo, onPlay, onSkip, onReset, canvasViewModel);
    console.log('SideBar created:', sideBar);

    mainView = new MainView(canvasViewModel, sideBar);
    console.log('MainView created:', mainView);

    // Create simulation presenter and interactors (need both ViewModel and MainView)
    simulationPresenter = new SimulationPresenter(canvasViewModel, mainView);

    // Create start node provider function
    const startNodeProvider = () => canvasViewModel.startNode;

    playInteractor = new PlayInteractor(simulationState, traceGenerator, simulationPresenter, startNodeProvider);
    skipInteractor = new SkipInteractor(simulationState, simulationPresenter);
    resetInteractor = new ResetInteractor(simulationState, simulationPresenter);

    // Wire up simulation interactors to ViewModel
    canvasViewModel.playInteractor = playInteractor;
    canvasViewModel.skipInteractor = skipInteractor;
    canvasViewModel.resetInteractor = resetInteractor;
    canvasViewModel.simulationState = simulationState;

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
