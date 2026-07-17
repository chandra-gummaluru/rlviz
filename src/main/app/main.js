// Shared canvas text renderer (used by ValueIterationView and MainView)
const mathRenderer = new MathRenderer(() => { if (typeof redraw === 'function') redraw(); });

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

// Expectation mode domain + ViewModel
const expectationState = new ExpectationState();
const expectationViewModel = new ExpectationViewModel();
canvasViewModel.expectationState = expectationState;
canvasViewModel.expectationViewModel = expectationViewModel;

// Learning Iteration (unknown:full quadrant) real Q-learning domain. Presentation/session-only,
// excluded from graph import/export (attached to the viewmodel, never touched by graphObj.js).
const qLearningState = new QLearningState();
const qLearningEpisodeGenerator = new QLearningEpisodeGenerator(graph, traceGenerator);
canvasViewModel.qLearningState = qLearningState;

// Presenters for existing use cases
const createNodePresenter = new CreateNodePresenter(canvasViewModel.interaction);
const createEdgePresenter = new CreateEdgePresenter(canvasViewModel);
const serializeGraphPresenter = new SerializeGraphPresenter(canvasViewModel);
const undoPresenter = new UndoPresenter(canvasViewModel);
const redoPresenter = new RedoPresenter(canvasViewModel);
const setModePresenter = new SetModePresenter(canvasViewModel);
const setValuesSubViewPresenter = new SetValuesSubViewPresenter(canvasViewModel);
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
const setValuesSubViewInteractor = new SetValuesSubViewInteractor(setValuesSubViewPresenter);
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
    setValuesSubView: setValuesSubViewInteractor,
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
let topBar;
let rightPanel;
let toolPalette;
let zoomPill;
let estimatorPill;
let mcRunsPill;
let viSweepChip;
let learningTreePill;
let treeViewPill;
let traceScrubber;
// Build/Policy's own TraceScrubber callbacks (Task 3) - kept as a named reference so the
// onEnter.build/policy mode-lifecycle hooks below can re-assert ownership of the single shared
// traceScrubber instance's `callbacks` property whenever Build/Policy is (re-)entered. Monte
// Carlo (expectationView.js) reassigns `.callbacks` to its own handlers while its sub-view is
// active (Task 4) - without this, dragging the scrubber after a Values -> Monte Carlo visit
// would keep calling Monte Carlo's callbacks instead of jumping the Build/Policy simulation.
let buildPolicyScrubberCallbacks;

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
let viSkipInteractor;

// Evaluate Policy (created in setup)
let policyEvaluationState;
let evaluatePolicyInteractor;

// Callbacks
const onStateClick = () => {
    canvasController.startNodePlacement('state');
    if (toolPalette) toolPalette.updateActiveTool(canvasViewModel.interaction.placingMode);
    redraw();
};

const onActionClick = () => {
    canvasController.startNodePlacement('action');
    if (toolPalette) toolPalette.updateActiveTool(canvasViewModel.interaction.placingMode);
    redraw();
};

const onTextBoxClick = () => {
    canvasController.startNodePlacement('textbox');
    if (toolPalette) toolPalette.updateActiveTool(canvasViewModel.interaction.placingMode);
    redraw();
};

const onSelectTool = () => {
    canvasController.cancelPlacement();
    if (toolPalette) toolPalette.updateActiveTool(canvasViewModel.interaction.placingMode);
    redraw();
};

// ===== Filename menu: New/Open/Save/Export PNG/recent files =====

const onNewGraph = () => {
    if (confirm('Start a new graph? Unsaved changes will be lost.')) {
        location.reload();
    }
};

const onOpenGraph = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const json = event.target.result;
            canvasController.importGraph(json);
            if (topBar) topBar.setFilename(file.name);
            RecentFiles.add({ name: file.name, json });
            if (rightPanel) rightPanel.updateContent();
            redraw();
        };
        reader.readAsText(file);
    };
    input.click();
};

const onSaveGraph = () => {
    const json = canvasController.exportGraph(true);
    if (!json) {
        console.error('Save failed: no data returned from exportGraph');
        alert('Save failed: could not serialize graph');
        return;
    }

    const filename = (topBar && topBar.currentFilename) || 'gridworld.mdp';
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    RecentFiles.add({ name: filename, json });
};

const onExportPNG = () => {
    if (!mainView || !mainView.canvas) return;
    const dataUrl = mainView.canvas.elt.toDataURL('image/png');
    const filename = (topBar && topBar.currentFilename) || 'gridworld';
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${filename.replace(/\.[a-zA-Z0-9]+$/, '')}.png`;
    link.click();
};

const getRecentFiles = () => RecentFiles.list();

const onOpenRecent = (entry) => {
    canvasController.importGraph(entry.json);
    if (topBar) topBar.setFilename(entry.name);
    if (rightPanel) rightPanel.updateContent();
    redraw();
};

// ===== Parameters popover: P known/unknown, observability =====

const onModelKnownToggle = (known) => {
    canvasController.setModelKnown(known);
    if (topBar) topBar.refreshParameters();
    if (topBar) topBar.setEvaluatePolicyEnabled(canvasViewModel.modelKnown);
    if (topBar) topBar.refreshModeToggle();
    if (rightPanel) rightPanel.updateContent();
    if (mainView && mainView.chartDock) mainView.chartDock.refresh();
    if (estimatorPill) estimatorPill.refresh();
    // Entering/leaving the Learning Iteration quadrant toggles the Graph|Tree pill (and seeds
    // the tree root on first entry) without waiting for a Run/Step click.
    refreshLearningTreePill();
    // The shared VI Play/Step/Skip buttons' label and enabled-state are quadrant-dependent
    // (Learning Iteration vs. the other three) - re-resolve immediately rather than waiting for
    // the next mode/subview entry, or they go stale (see refreshVIButtons()).
    if (canvasViewModel.mode === 'values' && canvasViewModel.valuesSubView === 'vi') {
        refreshVIButtons();
    }
    redraw();
};

const onObservabilityToggle = (value) => {
    canvasController.setObservability(value);
    if (topBar) topBar.refreshParameters();
    if (estimatorPill) estimatorPill.refresh();
    if (rightPanel) rightPanel.updateContent();
    if (mainView && mainView.chartDock) mainView.chartDock.refresh();
    refreshLearningTreePill();
    if (canvasViewModel.mode === 'values' && canvasViewModel.valuesSubView === 'vi') {
        refreshVIButtons();
    }
    redraw();
};

// True when the resolved Values-mode quadrant is unknown:full (Learning Iteration) - the only
// quadrant driven by the real Q-learning subsystem rather than VI's Bellman sweep.
function _isLearningIterationActive() {
    return ValuesMethodMatrix.key(canvasViewModel.modelKnown, canvasViewModel.observability) === 'unknown:full';
}

// Idempotently seeds the Q-learning tree root from the current start state, so Tree mode shows a
// root placeholder immediately on entering the quadrant (not gated behind the first Run/Step).
function ensureQLRoot() {
    const startNode = canvasViewModel.startNode;
    if (startNode) qLearningState.ensureRoot(startNode.id, startNode.name);
}

// Show/hide + refresh the floating Graph|Tree pill based on the current quadrant/sub-view (the
// pill self-gates in show()); called from the same lifecycle points as the other Values pills.
function refreshLearningTreePill() {
    if (!learningTreePill || !mainView) return;
    const inVi = canvasViewModel.mode === 'values' && canvasViewModel.valuesSubView === 'vi';
    const isLI = inVi && _isLearningIterationActive();
    const w = windowWidth - mainView.RIGHT_PANEL_WIDTH;
    if (isLI) {
        // Learning Iteration owns the top-right pill slot: show Graph|Tree, hide VI's sweep chip
        // (the two share the same anchor; VI's sweep status is meaningless in this quadrant).
        learningTreePill.updateBounds(0, w);
        ensureQLRoot();
        learningTreePill.show();
        if (mainView.viSweepChip) mainView.viSweepChip.hide();
    } else {
        learningTreePill.hide();
        if (inVi && mainView.viSweepChip) {
            mainView.viSweepChip.updateBounds(0, w);
            mainView.viSweepChip.show();
            mainView.viSweepChip.refresh();
        }
    }
}

// ===== Values-mode sub-view lifecycle (registered on canvasController below) =====
// mc entry: pause other playback, run MC rollouts, set up the scrubber. Mirrors what entering
// the old standalone 'expectation' mode used to do.
function enterMCSubView() {
    if (simulationState.isPlaying && pauseInteractor) {
        pauseInteractor.execute(new PauseInputData());
    }
    if (valueIterationState && valueIterationState.isPlaying && viPauseInteractor) {
        viPauseInteractor.execute(new VIPauseInputData());
    }

    if (!checkAndRenormalizeIfNeeded(true)) {
        redraw();
        return;
    }

    const startNode = canvasViewModel.startNode;
    if (startNode && runExpectationInteractor) {
        runExpectationInteractor.execute(new RunExpectationInputData(
            startNode.id,
            Object.assign({}, simulationState.policy),
            expectationState.displayRuns,
            expectationState.maxSteps,
            expectationState.gamma,
            Object.assign({}, simulationState.policyWeights)
        ));
    }

    if (mainView && mainView.expectationView) {
        const topOffset = mainView.TOP_BARS_HEIGHT;
        const panelW = rightPanel ? rightPanel.getWidth() : 272;
        const fullCanvasW = windowWidth - panelW;
        const canvasH = windowHeight - topOffset - mainView.getDockHeight();
        const canvasW = mainView._valuesPaneWidths(fullCanvasW).mc;
        mainView.expectationView.setupScrubber(canvasW, canvasH, topOffset);
    }
    if (mainView && mainView.chartDock) mainView.chartDock.refresh();
}

// View/animation-layer teardown only, run on every within-Values-mode sub-view switch (mc<->vi).
// Deliberately does NOT touch expectationState/valueIterationState's computed data, so that data
// persists across a sub-view switch and can be cross-referenced by the right panel's "Estimate
// vs exact" table regardless of which pane is currently active. Full data invalidation happens
// separately, only when leaving Values mode entirely - see resetMCData/resetVIData below.
function leaveMCSubView() {
    if (mainView && mainView.expectationView) mainView.expectationView.teardown();
    expectationViewModel.invalidateLayout();
}

// The inline Chart view has real content only once rollouts exist for a real start node -
// otherwise ExpectationView.draw() itself early-returns to a single canvas-wide "Set an Initial
// State..." prompt (pre-existing, unaffected by the Phase 3a split), and showing the Chart view's
// DOM on top of/beside that centered prompt is visibly wrong (empty axes floating over half the
// canvas while the prompt text bleeds into the other half). Gate visibility on the same
// !state.computed || !startNode condition ExpectationView.draw() already uses.
function _shouldShowMcChartView() {
    return expectationViewModel.leftView === 'chart'
        && expectationState.computed
        && !!canvasViewModel.startNode;
}

// Positions/shows the Phase 3a split's own chrome (the [Grid|Chart] pill + the inline chart
// view's bounds) - called from both the cold-entry values() hook and onEnterSubView.mc, since
// both paths need this and the geometry math is identical either way.
function setUpMCSplitChrome() {
    if (!mainView) return;
    const panelW = rightPanel ? rightPanel.getWidth() : 272;
    const fullCanvasW = windowWidth - panelW;
    const canvasW = mainView._valuesPaneWidths(fullCanvasW).mc;
    const topOffset = mainView.TOP_BARS_HEIGHT;
    const canvasH = windowHeight - topOffset - mainView.getDockHeight();
    const { leftW } = expectationViewModel.splitWidths(canvasW);

    if (mainView.mcLeftViewPill) {
        mainView.mcLeftViewPill.updateBounds(0, leftW);
        mainView.mcLeftViewPill.show();
        mainView.mcLeftViewPill.refresh();
    }
    if (mainView.expectationChartView) {
        mainView.expectationChartView.updateBounds(0, topOffset, leftW, canvasH);
        if (_shouldShowMcChartView()) mainView.expectationChartView.show();
        else mainView.expectationChartView.hide();
    }
}

function leaveVISubView() {
    mathRenderer.clear();
    valueIterationViewModel?.clearExplanationDetail();
    if (rightPanel) rightPanel.updateContent();
}

// Full domain-data reset, used only when leaving Values mode entirely (back to Build), where the
// graph itself may be edited before Values mode is re-entered - stale computed results (from a
// since-changed graph) must not persist across that boundary. Not called on a same-mode sub-view
// switch (mc<->vi), where the graph can't have changed and the data is worth keeping around.
function resetMCData() {
    expectationState.resetData();
}

function resetVIData() {
    valueIterationState.reset();
    valueIterationViewModel.reset();
}

canvasController.registerModeLifecycle({
    onLeave: {
        // Leaving Values mode entirely tears down both sub-views' view state AND their computed
        // data unconditionally, regardless of which sub-view was active (matches the old
        // exclusive-mode behavior) - the graph may be edited in Build mode before Values mode is
        // next entered, so nothing computed against the old graph should survive this boundary.
        values: () => {
            leaveMCSubView();
            leaveVISubView();
            resetMCData();
            resetVIData();
            // Leaving Values mode entirely is the ONE full-reset boundary for Q-learning (the
            // graph may be edited before Values is re-entered, so stale learned Q must not
            // survive). Switching quadrants/algorithm/sub-view deliberately preserves it.
            qLearningState.reset();
            if (mainView && mainView.chartDock) mainView.chartDock.hide();
            if (mainView && mainView.estimatorPill) mainView.estimatorPill.hide();
            if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.hide();
            if (mainView && mainView.mcLeftViewPill) mainView.mcLeftViewPill.hide();
            if (mainView && mainView.expectationChartView) mainView.expectationChartView.hide();
            if (mainView && mainView.viSweepChip) mainView.viSweepChip.hide();
            if (learningTreePill) learningTreePill.hide();
        },
        // Policy's canvas is now identical to Build's (fully editable - only the right panel
        // differs), so it shares the same tool-palette show/hide lifecycle.
        build: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.hide();
            if (treeViewPill) treeViewPill.hide();
            if (traceScrubber) traceScrubber.hide();
            canvasController.setBuildCanvasView('graph');
        },
        policy: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.hide();
            if (treeViewPill) treeViewPill.hide();
            if (traceScrubber) traceScrubber.hide();
            canvasController.setBuildCanvasView('graph');
        }
    },
    onEnter: {
        build: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.show();
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (treeViewPill) {
                treeViewPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                treeViewPill.show();
            }
            if (traceScrubber) {
                // Monte Carlo (Values mode) reassigns the shared instance's callbacks/ticks to
                // its own while active (see expectationView.js) - reassert Build/Policy's own
                // ownership here so a prior Values -> Monte Carlo visit doesn't leave Build's
                // scrubber silently driving expectationState instead of the simulation.
                traceScrubber.callbacks = buildPolicyScrubberCallbacks;
                traceScrubber.setTicks(simulationState.visited.map(entry => entry.name));
                traceScrubber.setPosition(simulationState.currentIndex);
                traceScrubber.setMaxSteps(simulationState.maxSteps);
                traceScrubber.resize(0, 0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                // A trace generated before leaving Build/Policy (e.g. via Values mode, or the
                // other of this pair) survives the round trip - simulationState isn't reset by
                // these mode-lifecycle hooks - so re-show immediately rather than waiting for
                // another presentInitializationComplete() that may never come.
                if (simulationState.replayInitialized) traceScrubber.show();
            }
        },
        policy: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.show();
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (treeViewPill) {
                treeViewPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                treeViewPill.show();
            }
            if (traceScrubber) {
                traceScrubber.callbacks = buildPolicyScrubberCallbacks;
                traceScrubber.setTicks(simulationState.visited.map(entry => entry.name));
                traceScrubber.setPosition(simulationState.currentIndex);
                traceScrubber.setMaxSteps(simulationState.maxSteps);
                traceScrubber.resize(0, 0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                if (simulationState.replayInitialized) traceScrubber.show();
            }
        },
        // Cold-entry into Values mode (e.g. clicking the collapsed slot) runs whatever the
        // current sub-view's enter logic is, same as explicitly selecting that sub-view.
        values: () => {
            if (mainView && mainView.estimatorPill) {
                mainView.estimatorPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.estimatorPill.show();
                mainView.estimatorPill.refresh();
            }
            const sv = canvasViewModel.valuesSubView;
            if (sv === 'mc') {
                enterMCSubView();
                if (mainView && mainView.zoomPill) mainView.zoomPill.hide();
                if (mainView && mainView.viSweepChip) mainView.viSweepChip.hide();
                // Chart view (Phase 3a's inline Convergence/Histogram) replaces the bottom dock
                // for Monte Carlo specifically - the dock stays hidden here, unlike the vi branch
                // below which still shows it (Iteration's own screen split is Phase 3b, unstarted).
                if (mainView && mainView.chartDock) mainView.chartDock.hide();
                if (mainView && mainView.mcRunsPill) {
                    mainView.mcRunsPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.mcRunsPill.show();
                    mainView.mcRunsPill.refresh();
                }
                setUpMCSplitChrome();
            } else if (sv === 'vi') {
                if (mainView && mainView.chartDock) {
                    mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.chartDock.show();
                }
                if (mainView && mainView.zoomPill) mainView.zoomPill.show();
                if (mainView && mainView.viSweepChip) {
                    mainView.viSweepChip.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.viSweepChip.show();
                    mainView.viSweepChip.refresh();
                }
                refreshLearningTreePill();
            }
        }
    },
    onEnterSubView: {
        mc: () => {
            enterMCSubView();
            if (mainView && mainView.zoomPill) mainView.zoomPill.hide();
            if (mainView && mainView.estimatorPill) mainView.estimatorPill.refresh();
            if (mainView && mainView.viSweepChip) mainView.viSweepChip.hide();
            if (learningTreePill) learningTreePill.hide();
            if (mainView && mainView.chartDock) mainView.chartDock.hide();
            if (mainView && mainView.mcRunsPill) {
                mainView.mcRunsPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.mcRunsPill.show();
                mainView.mcRunsPill.refresh();
            }
            setUpMCSplitChrome();
        },
        vi: () => {
            // VI has no other "run on enter" behavior - starts via explicit Play click
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (mainView && mainView.estimatorPill) mainView.estimatorPill.refresh();
            if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.hide();
            if (mainView && mainView.mcLeftViewPill) mainView.mcLeftViewPill.hide();
            if (mainView && mainView.expectationChartView) mainView.expectationChartView.hide();
            if (mainView && mainView.chartDock) {
                mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.chartDock.show();
            }
            if (mainView && mainView.viSweepChip) {
                mainView.viSweepChip.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.viSweepChip.show();
                mainView.viSweepChip.refresh();
            }
            refreshLearningTreePill();
        }
    },
    onLeaveSubView: {
        mc: leaveMCSubView,
        vi: leaveVISubView
    }
});

const onModeChange = (mode) => {
    canvasController.setMode(mode);
    // Leaving Values mode via Build/Policy while the goal card was still showing (i.e. the user
    // clicked Monte Carlo/Iteration but then navigated away without picking a scene) must not
    // strand the overlay - it's a full-viewport fixed-position element that would otherwise float
    // uselessly over the Build/Policy canvas with no way to dismiss it short of muting the card
    // for the whole session. onModeChange is only ever called for 'build'/'policy' (Monte Carlo/
    // Iteration route through the separate onEnterValuesScene callback instead), so this is safe
    // to run unconditionally here.
    canvasController.dismissGoalCard();
    if (mainView && mainView.goalCard) mainView.goalCard.refresh();
    redraw();
};

const onValuesSubViewChange = (subView) => {
    canvasController.setValuesSubView(subView);
    if (topBar) topBar.refreshValuesSubView(subView);
    if (estimatorPill) estimatorPill.refresh();
    redraw();
};

// Expectation interactors (initialized in setup)
let runExpectationInteractor;
let updateExpectationGammaInteractor;

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

const onEvaluatePolicy = () => {
    if (!evaluatePolicyInteractor) return;
    const gamma = rightPanel ? rightPanel.discountFactor : 0.9;
    evaluatePolicyInteractor.execute(new EvaluatePolicyInputData(gamma));
};

const onResetZoom = () => {
    canvasViewModel.viewport.reset();
    redraw();
};

// Animation speed: continuous slider (t: 0 = fastest, 1 = slowest), linearly interpolating
// every duration between these two hand-tuned endpoints. Default (t = 0.5) lands within
// 50ms of the old hand-tuned "medium" preset - simulationAnimator's own default TIMING
// already matches that midpoint, so no explicit initial onSetAnimationSpeed call is needed.
const SPEED_FAST = {
    PRE_SETUP_PAUSE: 200,
    POST_ERASE_PAUSE: 100,
    CAMERA_CENTER: 300,
    DECISION_PAUSE: 150,
    EDGE_HIGHLIGHT: 250,
    TRANSITION_PAUSE: 100,
    CAMERA_TRANSITION: 250
};
const SPEED_SLOW = {
    PRE_SETUP_PAUSE: 800,
    POST_ERASE_PAUSE: 500,
    CAMERA_CENTER: 1000,
    DECISION_PAUSE: 700,
    EDGE_HIGHLIGHT: 1000,
    TRANSITION_PAUSE: 500,
    CAMERA_TRANSITION: 1000
};

let currentSpeed = 0.5;

const onSetAnimationSpeed = (t) => {
    const clamped = Math.max(0, Math.min(1, t));
    const timing = {};
    for (const key of Object.keys(SPEED_FAST)) {
        timing[key] = Math.round(SPEED_FAST[key] + (SPEED_SLOW[key] - SPEED_FAST[key]) * clamped);
    }
    currentSpeed = clamped;
    if (playInteractor) playInteractor.setTiming(timing);
    if (stepInteractor) stepInteractor.setTiming(timing);
    if (topBar) topBar.updateSettingsChecks(currentSpeed, simulationState.spinningArrowEnabled);
};

const onToggleSpinningArrow = () => {
    const newEnabled = !simulationState.spinningArrowEnabled;
    canvasController.toggleSpinningArrow(newEnabled);
    if (topBar) topBar.updateSettingsChecks(currentSpeed, newEnabled);
};

/**
 * Check for unnormalized action nodes before simulation starts.
 * If found, prompt user to confirm auto-renormalization.
 * Returns true if simulation should proceed, false otherwise.
 */
function checkAndRenormalizeIfNeeded(forceCheck = false) {
    if (!forceCheck && simulationState.replayInitialized) return true;
    const names = canvasController.getUnnormalizedActionNames();
    if (names.length === 0) return true;
    const proceed = confirm(
        `Action node(s) [${names.join(', ')}] have probabilities that don't sum to 1.\n\n` +
        `Continuing will renormalize these probabilities. Proceed?`
    );
    if (proceed) {
        canvasController.renormalizeProbabilities();
    }
    return proceed;
}

// Value Iteration callbacks
const refreshVIButtons = () => {
    if (!topBar) return;
    // Learning Iteration (unknown:full) is driven by the real Q-learning subsystem, not VI's
    // Bellman sweep - there's no "converged"/"T-capped" concept there, so Play/Step/Reset stay
    // always enabled. Reuse the same quadrant check onVIPlay/onVIStep/onVIReset already use,
    // rather than re-deriving it here.
    if (_isLearningIterationActive()) {
        topBar.updateVIButtonStates(false, true, true);
        return;
    }
    const { canStep, canPlay } = valueIterationState.getButtonEnablement();
    topBar.updateVIButtonStates(valueIterationState.isPlaying, canStep, canPlay);
};

const ensureVIInitialized = () => {
    if (valueIterationState.initialized) return;
    const T = topBar ? topBar.getVIT() : 8;
    const gamma = rightPanel ? rightPanel.discountFactor : 0.9;
    runVIInteractor.execute(new RunVIInputData(T, gamma));
};

// The VI Play/Step/Skip/Reset buttons are shared by all four Values-mode Method quadrants. In
// the unknown:full (Learning Iteration) quadrant they drive the real Q-learning subsystem
// instead of VI's Bellman sweep. Each callback branches at the top and returns before touching
// any VI state, so the two subsystems stay fully decoupled.
function _afterQLChange() {
    if (rightPanel) rightPanel.updateContent();
    if (mainView && mainView.chartDock) mainView.chartDock.refresh();
    if (learningTreePill) learningTreePill.refresh();
    redraw();
}

const onVIPlay = () => {
    if (_isLearningIterationActive()) {
        canvasController.runQLearning(10);   // "▶ Run learning": 10 episodes
        _afterQLChange();
        return;
    }
    if (!runVIInteractor || !viPlayInteractor) return;
    ensureVIInitialized();
    viPlayInteractor.execute(new VIPlayInputData());
    refreshVIButtons();
};

const onVIPause = () => {
    // No continuous playback in Q-learning (Run is synchronous) - nothing to pause.
    if (_isLearningIterationActive()) return;
    if (!viPauseInteractor) return;
    viPauseInteractor.execute(new VIPauseInputData());
    refreshVIButtons();
};

const onVIStep = () => {
    if (_isLearningIterationActive()) {
        canvasController.stepQLearning();    // exactly one episode
        _afterQLChange();
        return;
    }
    if (!viStepInteractor) return;
    ensureVIInitialized();
    viStepInteractor.execute(new VIStepInputData());
    refreshVIButtons();
};

const onVISkip = () => {
    if (_isLearningIterationActive()) {
        // Skip has no distinct meaning here yet - behave like Run (10 episodes) as an interim
        // stopgap rather than a dead button.
        canvasController.runQLearning(10);
        _afterQLChange();
        return;
    }
    if (!viSkipInteractor) return;
    ensureVIInitialized();
    viSkipInteractor.execute(new VISkipInputData());
    refreshVIButtons();
};

const onVIReset = () => {
    if (_isLearningIterationActive()) {
        canvasController.resetQLearning();
        ensureQLRoot();                      // re-seed root so Tree shows its placeholder again
        _afterQLChange();
        canvasController.showGoalCardIfNotMuted();
        if (mainView && mainView.goalCard) mainView.goalCard.refresh();
        return;
    }
    if (!viResetInteractor) return;
    viResetInteractor.execute(new VIResetInputData());
    refreshVIButtons();
    canvasController.showGoalCardIfNotMuted();
    if (mainView && mainView.goalCard) mainView.goalCard.refresh();
};

const onPlay = () => {
    if (!playInteractor) return;

    // Check if start node is selected
    if (!canvasViewModel.interaction.startNode && !simulationState.replayInitialized) {
        alert('Please select a start node first (right-click a state in editor mode, or use the s₀ dropdown)');
        return;
    }

    // Check for unnormalized probabilities before first initialization
    if (!checkAndRenormalizeIfNeeded()) return;

    const inputData = new PlayInputData();
    playInteractor.execute(inputData);

    // Update button states
    if (topBar) {
        topBar.updateButtonStates(simulationState.isPlaying, simulationState.canAdvance());
    }
};

const onPause = () => {
    if (!pauseInteractor) return;

    const inputData = new PauseInputData();
    pauseInteractor.execute(inputData);

    // Update button states
    if (topBar) {
        topBar.updateButtonStates(simulationState.isPlaying, simulationState.canAdvance());
    }
};

const onStep = () => {
    if (!stepInteractor) return;

    // Check if start node is selected for first step
    if (!canvasViewModel.interaction.startNode && !simulationState.replayInitialized) {
        alert('Please select a start node first (right-click a state in editor mode, or use the s₀ dropdown)');
        return;
    }

    // Check for unnormalized probabilities before first initialization
    if (!checkAndRenormalizeIfNeeded()) return;

    // Pause if playing
    if (simulationState.isPlaying) {
        simulationState.pause();
        if (topBar) {
            topBar.updateButtonStates(false, simulationState.canAdvance());
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
        if (topBar) {
            topBar.updateButtonStates(false, simulationState.canAdvance());
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
    if (topBar) {
        topBar.updateButtonStates(false, true);
    }
};

// p5.js lifecycle hooks
function preload() {
    Typography.preload();
}

function setup() {
    // Create the single top chrome bar
    topBar = new TopBar({
        onExportPNG: onExportPNG,
        onNewGraph: onNewGraph,
        onOpenGraph: onOpenGraph,
        onSaveGraph: onSaveGraph,
        getRecentFiles: getRecentFiles,
        onOpenRecent: onOpenRecent,
        onUndo: onUndo,
        onRedo: onRedo,
        onSetAnimationSpeed: onSetAnimationSpeed,
        onToggleSpinningArrow: onToggleSpinningArrow,
        onModelKnownToggle: onModelKnownToggle,
        onObservabilityToggle: onObservabilityToggle,
        onRenormalize: onRenormalize,
        onEvaluatePolicy: onEvaluatePolicy,
        onPlay: onPlay,
        onPause: onPause,
        onStep: onStep,
        onRerun: onReset,
        onModeChange: onModeChange,
        onVIPlay: onVIPlay,
        onVIPause: onVIPause,
        onVIStep: onVIStep,
        onVISkip: onVISkip,
        onVIReset: onVIReset,
        onExpectationPlay: () => {
            if (mainView && mainView.expectationView) mainView.expectationView.startPlay();
        },
        onExpectationPause: () => {
            if (mainView && mainView.expectationView) mainView.expectationView.stopPlay();
        },
        onEnterValuesScene: (subView) => {
            canvasController.enterValuesScene(subView);
            if (topBar) topBar.refreshValuesSubView(subView);
            if (estimatorPill) estimatorPill.refresh();
            if (mainView && mainView.goalCard) mainView.goalCard.refresh();
            redraw();
        }
    }, canvasViewModel);
    topBar.setup();

    zoomPill = new ZoomPill({
        onZoomIn: onZoomIn,
        onZoomOut: onZoomOut,
        onResetZoom: onResetZoom
    }, canvasViewModel);
    zoomPill.setup();

    toolPalette = new ToolPalette({
        onSelectTool: onSelectTool,
        onStateClick: onStateClick,
        onActionClick: onActionClick,
        onTextBoxClick: onTextBoxClick
    }, canvasViewModel);
    toolPalette.setup(topBar.getHeight());

    // Create right panel
    rightPanel = new RightPanel(canvasViewModel, canvasController);
    rightPanel.setup(topBar.getHeight());

    // Set right panel reference in setModePresenter so it can update when mode changes
    setModePresenter.setRightPanel(rightPanel);
    setValuesSubViewPresenter.setRightPanel(rightPanel);

    mainView = new MainView(canvasViewModel, canvasController, topBar, rightPanel);
    rightPanel.onPanelResize = (w) => mainView.onPanelResize(w);

    const chartDock = new ChartDock(canvasViewModel, expectationState, expectationViewModel, valueIterationState);
    chartDock.setup();
    chartDock.onResize = () => mainView.onDockResize();
    mainView.chartDock = chartDock;
    mainView.toolPalette = toolPalette;
    toolPalette.show();
    mainView.zoomPill = zoomPill;
    zoomPill.updateBounds(mainView.RIGHT_PANEL_WIDTH);
    zoomPill.show();

    buildPolicyScrubberCallbacks = {
        onScrub: (index, isFinal) => {
            canvasController.jumpSimulationToIndex(index);
            if (rightPanel) rightPanel.updateContent();
            if (topBar) topBar.updateButtonStates(simulationState.isPlaying, simulationState.canAdvance());
            redraw();
        },
        onMaxStepsChange: (value) => {
            simulationState.maxSteps = value;
        }
    };
    traceScrubber = new TraceScrubber(buildPolicyScrubberCallbacks);
    traceScrubber.mount(0, 0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
    traceScrubber.hide();
    mainView.traceScrubber = traceScrubber;

    estimatorPill = new EstimatorPill({
        onSelectSubView: onValuesSubViewChange
    }, canvasViewModel);
    estimatorPill.setup(mainView.TOP_BARS_HEIGHT);
    estimatorPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
    mainView.estimatorPill = estimatorPill;
    estimatorPill.hide();

    // onSelectRuns is wired below once onDisplayRunsChange exists (needs expectationState/
    // expectationViewModel, constructed later in this function).
    mcRunsPill = new McRunsPill({}, canvasViewModel);
    mcRunsPill.setup(mainView.TOP_BARS_HEIGHT);
    mcRunsPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
    mainView.mcRunsPill = mcRunsPill;
    mcRunsPill.hide();

    const mcLeftViewPill = new McLeftViewPill({
        onSelectLeftView: (key) => {
            expectationViewModel.leftView = key;
            mcLeftViewPill.refresh();
            if (mainView && mainView.expectationChartView) {
                if (_shouldShowMcChartView()) mainView.expectationChartView.show();
                else mainView.expectationChartView.hide();
            }
            if (typeof redraw === 'function') redraw();
        }
    }, canvasViewModel);
    mcLeftViewPill.setup(mainView.TOP_BARS_HEIGHT);
    mainView.mcLeftViewPill = mcLeftViewPill;

    viSweepChip = new ViSweepChip(canvasViewModel);
    viSweepChip.setup(mainView.TOP_BARS_HEIGHT);
    viSweepChip.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
    mainView.viSweepChip = viSweepChip;
    viSweepChip.hide();

    // Floating Graph|Tree switch for the Learning Iteration (unknown:full) quadrant only.
    learningTreePill = new LearningTreeTogglePill({
        onSelectView: (view) => {
            canvasController.setLearningIterationCanvasView(view);
            learningTreePill.refresh();
            redraw();
        }
    }, canvasViewModel);
    learningTreePill.setup(mainView.TOP_BARS_HEIGHT);
    learningTreePill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
    mainView.learningTreePill = learningTreePill;
    learningTreePill.hide();

    // Full-canvas tree unroll for Build/Policy mode.
    mainView.treeView = new TreeView(canvasViewModel);
    treeViewPill = new TreeViewPill({
        onSelectView: (view) => {
            canvasController.setBuildCanvasView(view);
            // setBuildCanvasView() already cleared any stale selection/hover fields above, but
            // nothing else forces the panel's DOM to repaint until some later event - without this
            // call the panel can keep showing a stale Graph-view hover/selection until the next
            // unrelated event happens to trigger a refresh.
            rightPanel.updateContent();
            treeViewPill.refresh();
            redraw();
        }
    }, canvasViewModel);
    treeViewPill.setup(mainView.TOP_BARS_HEIGHT);
    treeViewPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
    mainView.treeViewPill = treeViewPill;
    // Unlike learningTreePill (Values-only chrome, correctly hidden here since Build is the
    // default boot mode), treeViewPill is Build/Policy chrome - it must start visible, mirroring
    // toolPalette/zoomPill's unconditional .show() below. canvasController.setMode()'s
    // onEnter/onLeave hooks only fire on a genuine mode *transition*, and the app never calls
    // setMode('build') at boot (mode is already 'build' in the viewmodel's initial state), so an
    // initial .hide() here would leave the pill stuck hidden until the user leaves and re-enters
    // Build/Policy at least once.
    treeViewPill.show();

    // Full-canvas Values-mode goal card - a highest-z-index DOM overlay (not a positioned pill),
    // so unlike the pills above it needs no updateBounds()/TOP_BARS_HEIGHT wiring. This codebase's
    // floating chrome refreshes on-demand from specific call sites (see estimatorPill.refresh()'s
    // many call sites above/below) rather than every draw tick, so goalCard.refresh() is likewise
    // called explicitly from every place that can change goalCardVisible/goalCardMuted, instead of
    // from mainView.js's draw() loop.
    mainView.goalCard = new GoalCard({
        onSelectScene: (subView) => {
            canvasController.enterValuesScene(subView);
            // enterValuesScene may re-show the card (goalCardMuted still false) - but the user
            // just explicitly chose a scene from the card itself, so dismiss it regardless of the
            // mute flag; only an actual future re-entry (toolbar click, Reset) should re-trigger it.
            canvasController.dismissGoalCard();
            if (topBar) topBar.refreshValuesSubView(subView);
            if (estimatorPill) estimatorPill.refresh();
            mainView.goalCard.refresh();
            redraw();
        },
        onMuted: () => {
            canvasController.muteGoalCard();
            mainView.goalCard.refresh();
            redraw();
        }
    }, canvasViewModel);
    mainView.goalCard.setup();

    AppPalette._onThemeChange = () => {
        mainView.invalidateDotGrid();
        rightPanel.updateContent();
        if (topBar) topBar._updateThemeIcon();
        if (mainView.expectationChartView) mainView.expectationChartView.refresh();
    };

    canvasViewModel._onUndoRedoChange = (canUndo, canRedo) => {
        if (topBar) topBar.updateUndoRedoState(canUndo, canRedo);
    };

    // Create simulation presenter and interactors
    simulationPresenter = new SimulationPresenter(canvasViewModel);
    simulationPresenter.setTopBar(topBar);
    simulationPresenter.setTraceScrubber(traceScrubber);
    simulationPresenter.setParticleCallbacks(
        (reward, nodeId) => mainView.launchRewardParticles(reward, nodeId),
        () => { if (mainView.rewardParticleSystem) mainView.rewardParticleSystem.destroy(); }
    );

    // Create start node provider function
    const startNodeProvider = () => canvasViewModel.interaction.startNode;

    playInteractor = new PlayInteractor(simulationState, traceGenerator, simulationPresenter, startNodeProvider);
    pauseInteractor = new PauseInteractor(simulationState, simulationPresenter);
    stepInteractor = new StepInteractor(simulationState, traceGenerator, simulationPresenter, startNodeProvider);
    skipInteractor = new SkipInteractor(simulationState, simulationPresenter);
    resetInteractor = new ResetInteractor(simulationState, simulationPresenter);

    // Create Value Iteration presenter and interactors
    viPresenter = new VIPresenter(canvasViewModel);
    viPresenter.setTopBar(topBar);
    viPresenter.setRightPanel(rightPanel);
    viPresenter.setChartDock(mainView.chartDock);
    viPresenter.setSweepChip(viSweepChip);

    // Between-sweep pause AND the beat's own pulse duration both track the animation-speed
    // slider (fast .. slow). Beat range (150-450ms) is centered on the old fixed 300ms default.
    const viAnimOptions = {
        getPauseMs: () => Math.round(150 + 650 * currentSpeed),
        getBeatMs: () => Math.round(150 + 300 * currentSpeed)
    };
    runVIInteractor = new RunVIInteractor(graph, valueIterationState, viPresenter);
    viPlayInteractor = new VIPlayInteractor(valueIterationState, viPresenter, graph, viAnimOptions);
    viPauseInteractor = new VIPauseInteractor(valueIterationState, viPresenter);
    viStepInteractor = new VIStepInteractor(valueIterationState, viPresenter, graph, viAnimOptions);
    viResetInteractor = new VIResetInteractor(valueIterationState, viPresenter);
    viSkipInteractor = new VISkipInteractor(valueIterationState, viPresenter, graph, viAnimOptions);

    // Create Evaluate Policy presenter and interactor (Policy log - shared across all four modes)
    policyEvaluationState = new PolicyEvaluationState();
    canvasViewModel.policyEvaluationState = policyEvaluationState;

    const evaluatePolicyPresenter = new EvaluatePolicyPresenter(canvasViewModel);
    evaluatePolicyPresenter.setRightPanel(rightPanel);

    evaluatePolicyInteractor = new EvaluatePolicyInteractor(
        graph, simulationState, policyEvaluationState, evaluatePolicyPresenter,
        () => canvasViewModel.startNode
    );
    topBar.setEvaluatePolicyEnabled(canvasViewModel.modelKnown);

    // Create Value Iteration view
    const valueIterationView = new ValueIterationView(canvasViewModel, {
        getPanelWidth: () => rightPanel.getWidth(),
        getTopOffset: () => mainView.TOP_BARS_HEIGHT,
        getBottomOffset: () => topBar.getHeight()
    });
    mainView.valueIterationView = valueIterationView;

    // ===== Learning Iteration (unknown:full) real Q-learning wiring =====
    const qlPresenter = new QLPresenter(canvasViewModel);
    qlPresenter.onComplete = () => {
        // Panel/pill/canvas refresh is done by the callers' _afterQLChange()/rightPanel handlers;
        // keep the presenter minimal so it doesn't double-rebuild the panel.
        if (typeof redraw === 'function') redraw();
    };
    qlPresenter.onError = () => {
        if (rightPanel) rightPanel.updateContent();
    };
    const runQLInteractor = new RunQLInteractor(graph, qLearningEpisodeGenerator, qLearningState, qlPresenter);
    const qlResetInteractor = new QLResetInteractor(qLearningState, qlPresenter);
    const setQLAlgorithmInteractor = new SetQLAlgorithmInteractor(qLearningState, qlPresenter);
    // Registered on the controller's interactor table so the thin runQLearning/stepQLearning/
    // resetQLearning/setQLAlgorithm controller methods can reach them (mirrors setManualQOverride).
    canvasController.interactors.runQL = runQLInteractor;
    canvasController.interactors.qlReset = qlResetInteractor;
    canvasController.interactors.setQLAlgorithm = setQLAlgorithmInteractor;

    const learningIterationView = new LearningIterationView(canvasViewModel);
    mainView.learningIterationView = learningIterationView;

    // VI explanation phase constants (local to setup; labels/counts passed into buildExplanationDetail)
    const VI_EXPLAIN_PHASES = [
        'show_equation',
        'explain_q',
        'show_actions',
        'show_transitions',
        'compute_q_values',
        'select_max',
        'revealing_value'
    ];
    const VI_EXPLAIN_LABELS = ['Equation', 'What is Q?', 'Actions', 'Transitions', 'Q-Values', 'Select Max', 'Final Value'];

    const onVICellClick = (columnIndex, stateId, actionId) => {
        if (!viPresenter || !valueIterationViewModel) return;

        const existing = valueIterationViewModel.explanationDetail;
        if (existing &&
            existing.columnIndex === columnIndex &&
            existing.stateId === stateId &&
            existing.actionId === actionId) {
            valueIterationViewModel.clearExplanationDetail();
            rightPanel.updateContent();
            redraw();
            return;
        }

        if (valueIterationState.isPlaying) {
            viPauseInteractor.execute(new VIPauseInputData());
        }

        const stepIndex = 0; // open at Equation (step 1)
        const detail = viPresenter.buildExplanationDetail({
            columnIndex,
            stateId,
            actionId,
            subPhase: VI_EXPLAIN_PHASES[stepIndex],
            stepIndex,
            stepLabel: VI_EXPLAIN_LABELS[stepIndex],
            totalSteps: VI_EXPLAIN_PHASES.length
        });

        if (detail) {
            valueIterationViewModel.setExplanationDetail(detail);
            rightPanel.updateContent();
            redraw();
        }
    };

    rightPanel.callbacks.onVICellClick = onVICellClick;

    rightPanel.callbacks.onManualQOverride = (stateId, actionId, value) => {
        canvasController.setManualQOverride(stateId, actionId, value);
        rightPanel.updateContent();
        if (mainView && mainView.chartDock) mainView.chartDock.refresh();
        redraw();
    };

    rightPanel.callbacks.onVIExplainClose = () => {
        valueIterationViewModel?.clearExplanationDetail();
        rightPanel.updateContent();
        redraw();
    };

    rightPanel.callbacks.onVIExplainStep = (direction) => {
        const detail = valueIterationViewModel?.explanationDetail;
        if (!detail) return;
        const currentIndex = detail.stepIndex ?? VI_EXPLAIN_PHASES.indexOf(detail.subPhase);
        const nextIndex = direction === 'next'
            ? Math.min(currentIndex + 1, VI_EXPLAIN_PHASES.length - 1)
            : Math.max(currentIndex - 1, 0);
        if (nextIndex === currentIndex) return;
        const nextDetail = viPresenter.buildExplanationDetail({
            columnIndex: detail.columnIndex,
            stateId: detail.stateId,
            actionId: detail.actionId,
            subPhase: VI_EXPLAIN_PHASES[nextIndex],
            stepIndex: nextIndex,
            stepLabel: VI_EXPLAIN_LABELS[nextIndex],
            totalSteps: VI_EXPLAIN_PHASES.length
        });
        if (nextDetail) {
            valueIterationViewModel.setExplanationDetail(nextDetail);
            rightPanel.updateContent();
            redraw();
        }
    };

    // Create Expectation presenter and interactors
    const expectationPresenter = new ExpectationPresenter(canvasViewModel, expectationViewModel);
    expectationPresenter.onComplete = () => {
        if (rightPanel) rightPanel.updateContent();
        redraw();
    };
    expectationPresenter.onError = (msg) => {
        console.error('[Expectation] Error:', msg);
        if (rightPanel) rightPanel.updateContent();
    };

    runExpectationInteractor = new RunExpectationInteractor(
        graph, traceGenerator, expectationState, expectationPresenter
    );
    updateExpectationGammaInteractor = new UpdateExpectationGammaInteractor(
        expectationState, expectationPresenter
    );

    // Create Expectation view
    // Per-tick playback delay tracks the animation-speed slider (fast .. slow), same as Build's
    // simulation timing and VI's sweep beat/pause - centered on the old fixed 250ms default.
    const expectationViewOptions = { getTickMs: () => Math.round(100 + 300 * currentSpeed) };
    const expectationView = new ExpectationView(
        canvasViewModel, expectationViewModel, expectationState, graph, expectationViewOptions
    );
    expectationView.setRightPanel(rightPanel);
    expectationView.setChartDock(mainView.chartDock);
    mainView.expectationView = expectationView;

    const expectationChartView = new ExpectationChartView(
        canvasViewModel, expectationState, expectationViewModel, valueIterationState);
    expectationChartView.setup();
    mainView.expectationChartView = expectationChartView;
    expectationView.setExpectationChartView(expectationChartView);

    // Attach expectation state/viewmodel to right panel
    rightPanel.expectationState = expectationState;
    rightPanel.expectationViewModel = expectationViewModel;

    // Right panel Expectation callbacks
    const _runExpectationBatch = () => {
        if (mainView && mainView.expectationView) mainView.expectationView.stopPlay();
        const startNode = canvasViewModel.startNode;
        if (!startNode) return;
        runExpectationInteractor.execute(new RunExpectationInputData(
            startNode.id,
            Object.assign({}, simulationState.policy),
            expectationState.displayRuns,
            expectationState.maxSteps,
            expectationState.gamma,
            Object.assign({}, simulationState.policyWeights)
        ));
        if (expectationView) expectationView.updateScrubberMax();
    };

    // Shared by the floating mcRunsPill (top-right of the MC canvas) - the right panel's old
    // "Display Runs" dropdown was replaced by that pill, but this handler is still the single
    // source of truth for what "changing the run count" does.
    const onDisplayRunsChange = (displayRuns) => {
        expectationState.displayRuns = displayRuns;
        if (expectationViewModel.selectedRunIndex !== null && expectationViewModel.selectedRunIndex >= displayRuns) {
            expectationViewModel.selectedRunIndex = null;
        }
        expectationViewModel.invalidateLayout();
        rightPanel.updateContent();
        if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.refresh();
        redraw();
    };
    if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.callbacks.onSelectRuns = onDisplayRunsChange;

    rightPanel.callbacks.onExpectationMaxStepsChange = () => {
        _runExpectationBatch();
    };

    rightPanel.callbacks.onExpectationGammaChange = (gamma) => {
        updateExpectationGammaInteractor.execute(new UpdateExpectationGammaInputData(gamma));
    };

    rightPanel.callbacks.onInitialStateChange = () => {
        _runExpectationBatch();
        if (mainView && mainView.chartDock) mainView.chartDock.refresh();
        // Setting an Initial State while already in Values -> Monte Carlo with Chart view
        // selected should reveal the (until-now-hidden) inline chart the moment real rollout
        // data exists, not just on the next mode/sub-view re-entry.
        if (mainView && mainView.expectationChartView) {
            if (_shouldShowMcChartView()) mainView.expectationChartView.show();
            else mainView.expectationChartView.hide();
        }
        rightPanel.updateContent();
        redraw();
    };

    // Expectation Play/Pause/Step/Reset
    expectationView.onPlaybackStateChange = (isPlaying) => {
        if (topBar) topBar.setExpectationPlayMode(isPlaying ? 'pause' : 'play');
    };
    if (topBar) {
        topBar.callbacks.onExpectationStep = () => {
            if (mainView && mainView.expectationView) mainView.expectationView.step();
        };
        // Matches Build/VI's Reset: regenerate from scratch (fresh rollouts) and snap playback
        // back to t=0 - _runExpectationBatch already does both (runExpectationInteractor seeds
        // currentT: 0 on every fresh run, and updateScrubberMax() re-syncs the scrubber to it).
        topBar.callbacks.onExpectationReset = () => {
            _runExpectationBatch();
            if (mainView && mainView.chartDock) mainView.chartDock.refresh();
            rightPanel.updateContent();
            canvasController.showGoalCardIfNotMuted();
            if (mainView && mainView.goalCard) mainView.goalCard.refresh();
            redraw();
        };
    }

    // Initialize
    mainView.setup();
}

function draw() {
    mainView.draw();
}

function mousePressed() {
    if (!mainView) return;
    // The 'mc' sub-view owns the whole canvas and forwards clicks directly to its own
    // hit-testing rather than going through mainView's normal node/edge click routing.
    if (canvasViewModel.interaction.mode === 'values' && canvasViewModel.valuesSubView === 'mc' && mainView.expectationView) {
        mainView.expectationView.handleClick(mouseX, mouseY);
        return;
    }
    mainView.mousePressed();
}

function mouseDragged() {
    if (!mainView) return;
    mainView.mouseDragged();
}

function mouseReleased() {
    if (!mainView) return;
    mainView.mouseReleased();
}

function mouseMoved() {
    if (!mainView) return;
    mainView.mouseMoved();
}

function keyPressed() {
    if (!mainView) return;
    if (canvasViewModel.interaction.mode === 'values' && canvasViewModel.valuesSubView === 'mc' && mainView.expectationView) {
        mainView.expectationView.handleKey(key);
    }
    return mainView.keyPressed();
}

function keyReleased() {
    if (!mainView) return;
    return mainView.keyReleased();
}

function mouseWheel(event) {
    if (!mainView) return;
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
