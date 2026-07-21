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
let namePolicyModal;
let noStartNodeModal;
let toast;
let renormalizeConfirmModal;
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
let logOptimalPolicyInteractor;

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
    // the next mode/subview entry, or they go stale (see refreshVIButtons()). The 52/48 split's
    // own chrome (Phase 3b) is quadrant-dependent too - entering/leaving Learning Iteration must
    // show/hide the States view immediately, the same way it already does for the sweep chip via
    // refreshLearningTreePill() above - not just on the next mode/subview transition.
    if (canvasViewModel.mode === 'values' && canvasViewModel.valuesSubView === 'vi') {
        refreshVIButtons();
        setUpVISplitChrome();
        // ViStatesView._buildCard() decides diagram-vs-flat once per card, not per-frame (see
        // its own comment) - already-built sections keep showing the PREVIOUS quadrant's card
        // style otherwise, e.g. rich known:full diagrams surviving a toggle into a partial-
        // observability quadrant that should show flat state:value cards instead.
        if (mainView && mainView.viStatesView) mainView.viStatesView.rebuildAll();
        if (mainView && mainView.chartDock) {
            if (_isLearningIterationActive()) {
                mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.chartDock.show();
            } else {
                mainView.chartDock.hide();
            }
        }
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
        setUpVISplitChrome();
        // Same diagram-vs-flat re-render need as onModelKnownToggle's own identical fix above.
        if (mainView && mainView.viStatesView) mainView.viStatesView.rebuildAll();
        if (mainView && mainView.chartDock) {
            if (_isLearningIterationActive()) {
                mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.chartDock.show();
            } else {
                mainView.chartDock.hide();
            }
        }
    }
    redraw();
};

// "Animations · per mode" switches (Parameters popover) - purely presentation, no cascading
// re-renders needed beyond the popover's own switch visuals (the flag is read live wherever the
// next reveal happens: viStatesView.js's _prepareLiveSection(), expectationView.js's startPlay()).
const onSetMcAnimationEnabled = (enabled) => {
    canvasController.setMcAnimationEnabled(enabled);
    if (topBar) topBar.refreshParameters();
};

const onSetIterationAnimationEnabled = (enabled) => {
    canvasController.setIterationAnimationEnabled(enabled);
    if (topBar) topBar.refreshParameters();
};

// True when the resolved Values-mode quadrant is unknown:full (Learning Iteration) - the only
// quadrant driven by the real Q-learning subsystem rather than VI's Bellman sweep.
function _isLearningIterationActive() {
    return ValuesMethodMatrix.key(canvasViewModel.modelKnown, canvasViewModel.observability) === 'unknown:full';
}

// viSweepChip only ever shows for the 3 split quadrants (Learning Iteration hides it in favor of
// its own Graph|Tree pill in the same slot - see refreshLearningTreePill()), so its right edge
// docks to the LEFT pane's own right edge (viSplit.leftW), not the full canvas width - anchoring
// to the canvas's right edge would collide with viRightViewPill.js, which already right-anchors
// to the RIGHT pane at this same top row.
function _viSweepChipBounds() {
    const w = windowWidth - mainView.RIGHT_PANEL_WIDTH;
    const viSplit = mainView._viSplitWidths(w);
    return { x: 0, width: viSplit ? viSplit.leftW : w };
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
            const b = _viSweepChipBounds();
            mainView.viSweepChip.updateBounds(b.x, b.width);
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

    checkAndRenormalizeIfNeeded(true, () => {
        const startNode = canvasViewModel.startNode;
        if (startNode && runExpectationInteractor) {
            runExpectationInteractor.execute(new RunExpectationInputData(
                startNode.id,
                Object.assign({}, simulationState.policy),
                expectationState.displayRuns,
                expectationState.maxSteps,
                expectationState.gamma,
                Object.assign({}, simulationState.policyWeights),
                simulationState.isTimeDependent() ? simulationState.timeDependentPolicy : null
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
        redraw();
    });
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
    const { leftW, rightW } = expectationViewModel.splitWidths(canvasW);

    // Anchored to the RIGHT (MDP graph) pane's bounds, not the left grid/chart pane it actually
    // controls - a deliberate cosmetic placement so it reads as "which view is shown beside the
    // graph" rather than crowding the left pane's own grid/chart content.
    if (mainView.mcLeftViewPill) {
        mainView.mcLeftViewPill.updateBounds(leftW, rightW);
        mainView.mcLeftViewPill.show();
        mainView.mcLeftViewPill.refresh();
    }
    if (mainView.expectationChartView) {
        // +56 clears estimatorPill's top-left "Monte Carlo"/method badge (values-method-badge,
        // topOffset+24, ~24px tall) - without this inset the chart view's own box starts right at
        // the canvas top and its content visually crowds/bleeds into that badge's corner.
        const chartTopInset = 56;
        mainView.expectationChartView.updateBounds(0, topOffset + chartTopInset, leftW, canvasH - chartTopInset);
        if (_shouldShowMcChartView()) mainView.expectationChartView.show();
        else mainView.expectationChartView.hide();
    }
}

// Positions/shows Phase 3b's own chrome (the States view + its label chip) - called from both
// the cold-entry values() hook and onEnterSubView.vi, mirroring setUpMCSplitChrome()'s own
// two-call-site pattern. No-ops (and hides the States view) for Learning Iteration, which never
// splits.
function setUpVISplitChrome() {
    if (!mainView || !mainView.viStatesView) return;
    const panelW = rightPanel ? rightPanel.getWidth() : 272;
    const canvasW = windowWidth - panelW;
    const canvasH = windowHeight - mainView.TOP_BARS_HEIGHT - mainView.getDockHeight();
    const viSplit = mainView._viSplitWidths(canvasW);
    // +56 clears estimatorPill's top-left "Value Iteration"/"Monte Carlo" method badge
    // (values-method-badge, topOffset+24, ~24px tall) - same inset Phase 3a's
    // ExpectationChartView already applies for MC's identical badge-overlap case.
    const topInset = 56;

    if (viSplit) {
        // Left pane always shows States now - Chart moved to the right pane's own pill (merged
        // with Equation), so there's no left-pane toggle left to respect.
        mainView.viStatesView.updateBounds(0, mainView.TOP_BARS_HEIGHT + topInset, viSplit.leftW, canvasH - topInset);
        mainView.viStatesView.show();

        // Right pane shows exactly one of Equation/Backward/Chart, per viRightViewPill's own
        // toggle - Graph is no longer reachable (see mainView.js draw()'s own comment).
        const rightView = valueIterationViewModel.rightView;
        // Same +56 inset as viStatesView's own, so the Q-table card's top edge lines up with the
        // left pane's "t = 0" card instead of starting higher and colliding with viRightViewPill.
        mainView.viChartView.updateBounds(viSplit.leftW, mainView.TOP_BARS_HEIGHT + topInset, viSplit.rightW, canvasH - topInset);
        if (rightView === 'chart') {
            mainView.viChartView.show();
        } else {
            mainView.viChartView.hide();
        }
        if (rightView === 'equation') {
            mainView.viEquationView.updateBounds(viSplit.leftW, mainView.TOP_BARS_HEIGHT, viSplit.rightW, canvasH);
            mainView.viEquationView.show();
        } else {
            mainView.viEquationView.hide();
        }
        if (mainView.viBackwardView) {
            if (rightView === 'backward') {
                mainView.viBackwardView.updateBounds(viSplit.leftW, mainView.TOP_BARS_HEIGHT, viSplit.rightW, canvasH);
                mainView.viBackwardView.show();
            } else {
                mainView.viBackwardView.hide();
            }
        }
        mainView.viRightViewPill.updateBounds(viSplit.leftW, viSplit.rightW);
        mainView.viRightViewPill.show();
    } else {
        mainView.viStatesView.hide();
        mainView.viChartView.hide();
        if (mainView.viRightViewPill) mainView.viRightViewPill.hide();
        if (mainView.viEquationView) mainView.viEquationView.hide();
        if (mainView.viBackwardView) mainView.viBackwardView.hide();
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
            if (mainView && mainView.viStatesView) mainView.viStatesView.hide();
            if (mainView && mainView.viChartView) mainView.viChartView.hide();
            if (mainView && mainView.viRightViewPill) mainView.viRightViewPill.hide();
            if (mainView && mainView.viEquationView) mainView.viEquationView.hide();
            if (mainView && mainView.viBackwardView) mainView.viBackwardView.hide();
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
                // ChartDock now only shows for Learning Iteration (the 3 split quadrants get
                // their own inline ViChartView instead) - mirrors exactly how Phase 3a already
                // stopped routing Monte Carlo through ChartDock.
                if (mainView && mainView.chartDock) {
                    if (_isLearningIterationActive()) {
                        mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                        mainView.chartDock.show();
                    } else {
                        mainView.chartDock.hide();
                    }
                }
                if (mainView && mainView.zoomPill) mainView.zoomPill.show();
                if (mainView && mainView.viSweepChip) {
                    const b = _viSweepChipBounds();
                    mainView.viSweepChip.updateBounds(b.x, b.width);
                    mainView.viSweepChip.show();
                    mainView.viSweepChip.refresh();
                }
                refreshLearningTreePill();
                setUpVISplitChrome();
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
            if (mainView && mainView.viStatesView) mainView.viStatesView.hide();
            if (mainView && mainView.viChartView) mainView.viChartView.hide();
            if (mainView && mainView.viRightViewPill) mainView.viRightViewPill.hide();
            if (mainView && mainView.viEquationView) mainView.viEquationView.hide();
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
            // ChartDock now only shows for Learning Iteration - see the identical comment in the
            // cold-entry values() hook's vi branch above.
            if (mainView && mainView.chartDock) {
                if (_isLearningIterationActive()) {
                    mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.chartDock.show();
                } else {
                    mainView.chartDock.hide();
                }
            }
            if (mainView && mainView.viSweepChip) {
                const b = _viSweepChipBounds();
                mainView.viSweepChip.updateBounds(b.x, b.width);
                mainView.viSweepChip.show();
                mainView.viSweepChip.refresh();
            }
            refreshLearningTreePill();
            setUpVISplitChrome();
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

// After Evaluate π logs an entry, take the user into Values mode with the generic goal card up
// (offering both Monte Carlo and Iteration, per the handoff's "should go to Monte Carlo and
// Value Iteration") so they can see how the exact value just logged compares. Mirrors
// topBar.js's own enterValuesScene() click handler (topBar.setMode('values') BEFORE the
// controller/goal-card side effects) - this flow doesn't go through that click handler, so it
// has to do the same setup itself (same pattern onFindOptimalPolicy already uses below).
// Preserves whichever sub-view was last active rather than forcing one, defaulting to 'mc' only
// if Values mode has never been entered this session.
const goToValuesSceneAfterEvaluate = () => {
    const subView = canvasViewModel.valuesSubView || 'mc';
    if (topBar) topBar.setMode('values');
    canvasController.enterValuesScene(subView);
    if (topBar) topBar.refreshValuesSubView(subView);
    if (estimatorPill) estimatorPill.refresh();
    if (mainView && mainView.goalCard) mainView.goalCard.refresh();
    redraw();
};

// Runs evaluatePolicyInteractor, marks whatever entry it actually logged as "the active policy"
// (so goalCard.js's equation shows V^{that name} instead of a generic V^pi - mirrors
// CanvasController.restorePolicyFromLog()'s identical assignment, just for a freshly-logged
// entry instead of a restored older one), then navigates to the Values scene. Guards on the
// entries array actually growing rather than assuming success, so a presentError() path (e.g.
// evaluatePolicyInteractor declining internally) can't leave activePolicyLabel pointing at a
// stale, unrelated older entry.
// Extracted so the MC/Iteration "▶ Evaluate π" Play buttons' own name-gate (_withPolicyNameGate
// below) can reuse the exact same logging step without also triggering
// goToValuesSceneAfterEvaluate()'s scene-entry side effects - those buttons name-gate IN PLACE
// (the user already clicked from the scene they want to stay on), unlike the dedicated Evaluate π
// button which always navigates.
const _evaluatePolicyAndLabel = (gamma, name) => {
    const beforeCount = policyEvaluationState ? policyEvaluationState.entries.length : 0;
    const inputData = name !== undefined
        ? new EvaluatePolicyInputData(gamma, 0.01, name)
        : new EvaluatePolicyInputData(gamma);
    evaluatePolicyInteractor.execute(inputData);
    if (policyEvaluationState && policyEvaluationState.entries.length > beforeCount) {
        const entry = policyEvaluationState.entries[policyEvaluationState.entries.length - 1];
        canvasViewModel.activePolicyLabel = entry.label;
    }
};

const _evaluatePolicyAndNavigate = (gamma, name) => {
    _evaluatePolicyAndLabel(gamma, name);
    goToValuesSceneAfterEvaluate();
};

// Gate for Monte Carlo's and Value Iteration's OWN "▶ Evaluate π" Play buttons: unlike the
// dedicated Evaluate π button (Build/Policy), these run the real MC rollout / VI Bellman sweep
// directly, never evaluatePolicyInteractor - but per an explicit request, the first click with no
// policy currently named prompts for one (and actually logs it, same as the dedicated button)
// before letting the real action proceed. Confirming logs AND runs; "Don't Log" (the modal's own
// cancel action here, relabeled - see namePolicyModal.js's cancelLabel) still runs the real
// action, just skips evaluatePolicyInteractor entirely, so nothing is added to the Policy log
// and activePolicyLabel stays unset (this same gate fires again next Play click, since there's
// still no active name). Once activePolicyLabel IS set, later clicks skip straight to runAction -
// naming only gates the first evaluation of a given policy, not every Play click.
const _withPolicyNameGate = (runAction) => {
    if (canvasViewModel.activePolicyLabel) { runAction(); return; }
    // No start node: neither MC nor VI actually needs one to gate naming on (VI computes every
    // state's value regardless; MC already shows its own "set a start state" placeholder) - skip
    // straight to the real action rather than blocking on something naming can't do anything
    // about anyway. Same for the (never-expected-in-practice) missing-modal fallback.
    if (!evaluatePolicyInteractor || !canvasViewModel.startNode || !namePolicyModal) {
        runAction();
        return;
    }
    // Policy log full (policy-logging.md §1's 6-entry cap): show the toast in place of the
    // naming prompt, but still run the real action - same "logging is refused, the action isn't"
    // shape as this same gate's own "Don't Log" cancel path below.
    if (policyEvaluationState && policyEvaluationState.entries.length >= PolicyEvaluationState.MAX_ENTRIES) {
        if (toast) toast.show('Policy log full — remove one first');
        runAction();
        return;
    }
    const existingCount = policyEvaluationState ? policyEvaluationState.entries.length : 0;
    namePolicyModal.show(`policy-${existingCount + 1}`, {
        title: 'Name this policy evaluation',
        cancelLabel: "Don't Log",
        confirmLabel: 'Log',
        onConfirm: (name) => {
            namePolicyModal.hide();
            const gamma = rightPanel ? rightPanel.discountFactor : 0.9;
            _evaluatePolicyAndLabel(gamma, name);
            runAction();
        },
        onCancel: () => {
            namePolicyModal.hide();
            runAction();
        }
    });
};

const onEvaluatePolicy = () => {
    if (!evaluatePolicyInteractor) return;
    if (!canvasViewModel.startNode) {
        alert('Please select a start node first (right-click a state in editor mode, or use the s₀ dropdown)');
        return;
    }
    if (!namePolicyModal) {
        // Fallback for the (never-expected-in-practice) case namePolicyModal failed to
        // construct - keeps Evaluate π functional with the old auto \pi_k label instead of
        // hard-failing the button entirely.
        const gamma = rightPanel ? rightPanel.discountFactor : 0.9;
        _evaluatePolicyAndNavigate(gamma);
        return;
    }
    // Policy log full (policy-logging.md §1's 6-entry cap): this button's whole purpose is
    // logging, so a full log refuses outright - toast instead of the naming prompt, no navigation.
    if (policyEvaluationState && policyEvaluationState.entries.length >= PolicyEvaluationState.MAX_ENTRIES) {
        if (toast) toast.show('Policy log full — remove one first');
        return;
    }
    const existingCount = policyEvaluationState ? policyEvaluationState.entries.length : 0;
    namePolicyModal.show(`policy-${existingCount + 1}`, {
        title: 'Name this policy evaluation',
        cancelLabel: "Don't Log",
        confirmLabel: 'Log',
        onConfirm: (name) => {
            const gamma = rightPanel ? rightPanel.discountFactor : 0.9;
            namePolicyModal.hide();
            _evaluatePolicyAndNavigate(gamma, name);
        },
        // "Don't Log" - same shape as MC/VI's own name-gate (_withPolicyNameGate): still does
        // the real thing (navigate to the Values scene), just skips evaluatePolicyInteractor/
        // the Policy log entry/activePolicyLabel entirely, unlike a true Cancel which would stay
        // put and do nothing.
        onCancel: () => {
            namePolicyModal.hide();
            goToValuesSceneAfterEvaluate();
        }
    });
};

// ===== Find optimal π (Policy log's own button - forces the known:full quadrant, navigates to
// Iteration, runs VI to convergence, then logs the resulting greedy policy under a user-given
// name via logOptimalPolicyInteractor). See CanvasController.enterFindOptimalScene()/
// dismissFindOptimalCard() and findOptimalCard.js/namePolicyModal.js for the rest of the flow. =====
let findOptimalPending = false;

const promptNameOptimalPolicy = () => {
    if (!namePolicyModal) return;
    // Policy log full (policy-logging.md §1's 6-entry cap) - same refusal as
    // onEvaluatePolicy()/_withPolicyNameGate() above, this log is shared across all three entry
    // points.
    if (policyEvaluationState && policyEvaluationState.entries.length >= PolicyEvaluationState.MAX_ENTRIES) {
        if (toast) toast.show('Policy log full — remove one first');
        return;
    }
    const existingOptimalCount = policyEvaluationState
        ? policyEvaluationState.entries.filter(e => e.label && e.label.indexOf('\\pi^{*}') === 0).length
        : 0;
    namePolicyModal.show(`optimal-${existingOptimalCount + 1}`, {
        onConfirm: (name) => {
            if (logOptimalPolicyInteractor) {
                logOptimalPolicyInteractor.execute(new LogOptimalPolicyInputData(name));
            }
            namePolicyModal.hide();
            redraw();
        },
        onCancel: () => namePolicyModal.hide()
    });
};

const onRunFindOptimalBackups = () => {
    canvasController.dismissFindOptimalCard();
    if (mainView && mainView.findOptimalCard) mainView.findOptimalCard.refresh();
    // onVIPlay() always leads to VIPlayInteractor.execute(), which calls
    // outputBoundary.presentComplete() unconditionally - either synchronously (already
    // converged, or already at the T cap: the "!canAdvance()||converged" guard branch) or later,
    // once a genuinely new animated run finishes - so findOptimalPending is always eventually
    // consumed by viPresenter's onComplete hook (see its own wiring above) either way, with no
    // special-casing needed here for "already done".
    findOptimalPending = true;
    onVIPlay('optimal');
    redraw();
};

const onSkipFindOptimalCard = () => {
    canvasController.dismissFindOptimalCard();
    if (mainView && mainView.findOptimalCard) mainView.findOptimalCard.refresh();
    redraw();
};

const onFindOptimalPolicy = () => {
    if (!canvasViewModel.startNode) {
        alert('Please select a start node first (right-click a state in editor mode, or use the s₀ dropdown)');
        return;
    }
    // Force known:full - the only quadrant a real optimum is computed in - by reusing the
    // existing Parameters-popover toggle handlers, so their entire established refresh cascade
    // (topBar labels, estimator pill, chart dock, states view rebuild, ...) runs correctly
    // instead of only flipping canvasViewModel.modelKnown/.observability directly.
    if (!canvasViewModel.modelKnown) onModelKnownToggle(true);
    if (canvasViewModel.observability !== 'full') onObservabilityToggle('full');

    canvasController.enterFindOptimalScene();
    // topBar.js keeps its OWN currentMode/button-visibility state, separate from
    // canvasController's - topBar.js's own enterValuesScene() (the Monte Carlo/Iteration toolbar
    // segments' click handler) always calls topBar.setMode('values') before delegating to the
    // controller; this flow bypasses that click handler entirely (going through the Policy log's
    // button instead), so it must call the same topBar.setMode('values') itself or the top bar
    // stays stuck showing Build's own Play/Step/Reset/Renormalize buttons with "Build" still
    // highlighted as active.
    if (topBar) topBar.setMode('values');
    if (topBar) topBar.refreshValuesSubView('vi');
    if (estimatorPill) estimatorPill.refresh();
    if (mainView && mainView.findOptimalCard) mainView.findOptimalCard.refresh();
    redraw();
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
 * Check for unnormalized action nodes before simulation starts. If found, shows the themed
 * renormalizeConfirmModal and only calls onProceed if the user confirms - unlike the native
 * confirm() this replaced, a DOM modal is inherently async, so callers no longer get a synchronous
 * true/false: onProceed() IS "proceed", simply not calling it IS "abort".
 */
function checkAndRenormalizeIfNeeded(forceCheck, onProceed) {
    if (!forceCheck && simulationState.replayInitialized) { onProceed(); return; }
    const names = canvasController.getUnnormalizedActionNames();
    if (names.length === 0) { onProceed(); return; }
    if (!renormalizeConfirmModal) { onProceed(); return; }
    renormalizeConfirmModal.show(names, () => {
        canvasController.renormalizeProbabilities();
        onProceed();
    });
}

// Value Iteration callbacks
const refreshVIButtons = () => {
    if (!topBar) return;
    // Learning Iteration (unknown:full) is driven by the real Q-learning subsystem, not VI's
    // Bellman sweep - there's no "converged"/"T-capped" concept there, so Play/Step/Reset stay
    // always enabled. Reuse the same quadrant check onVIPlay/onVIStep/onVIReset already use,
    // rather than re-deriving it here.
    if (_isLearningIterationActive()) {
        topBar.updateVIButtonStates(false, true, true, true);
        return;
    }
    // known:full (real Value Iteration): Step/Skip are gated by whether the live sweep's
    // per-state reveal has anything left, NOT by the sweep-level T-cap/convergence check below -
    // crossing into a new sweep is "Find Optimal"'s job alone now. canPlay ("Find Optimal"'s own
    // enablement) is unaffected either way.
    const enablement = valueIterationState.getButtonEnablement();
    if (mainView && mainView.viStatesView && mainView.viStatesView.isDiagramQuadrant()) {
        const canStep = mainView.viStatesView.canRevealNextState();
        const canSkip = mainView.viStatesView.canSkipCurrentState();
        topBar.updateVIButtonStates(valueIterationState.isPlaying, canStep, enablement.canPlay, canSkip);
        return;
    }
    topBar.updateVIButtonStates(valueIterationState.isPlaying, enablement.canStep, enablement.canPlay);
};

// forcedMode is only ever passed by onRunFindOptimalBackups ('optimal') - every other Play/
// Step/Skip click passes nothing, so an already-initialized run just continues in whichever
// mode is currently active (never silently switched back). If forcedMode disagrees with the
// currently active runMode, the accumulated history is invalid under the new rule (max_a and
// the configured-policy expectation backup aren't interchangeable sweep-to-sweep), so this
// resets and reinitializes fresh under forcedMode instead of continuing it.
const ensureVIInitialized = (forcedMode) => {
    if (valueIterationState.initialized) {
        if (forcedMode && valueIterationState.runMode !== forcedMode) {
            valueIterationState.reset();
        } else {
            return;
        }
    }
    const T = rightPanel ? rightPanel.viT : 8;
    const gamma = rightPanel ? rightPanel.discountFactor : 0.9;
    const epsilon = rightPanel ? rightPanel.viEpsilon : 0.01;
    // Belief Iteration / PO Q-Learning (partial observability) always run the true optimality
    // sweep, untouched by the expectation-mode change - only known:full defaults to 'expectation'.
    const defaultMode = canvasViewModel.observability === 'partial' ? 'optimal' : 'expectation';
    runVIInteractor.execute(new RunVIInputData(T, gamma, epsilon, forcedMode || defaultMode));
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

// The actual Play/"Find Optimal" logic, unconditional - see onVIPlay below for the name-gate
// wrapped around this for known:full's own "▶ Evaluate π" click specifically.
const _runVIPlay = (forcedMode) => {
    if (_isLearningIterationActive()) {
        canvasController.runQLearning(10);   // "▶ Run learning": 10 episodes
        _afterQLChange();
        return;
    }
    if (!runVIInteractor || !viPlayInteractor) return;
    ensureVIInitialized(forcedMode);
    viPlayInteractor.execute(new VIPlayInputData());
    // Resume takes priority over refresh() - if a reveal was paused mid-animation, this
    // continues it exactly where it was; refresh() alone only covers the very first frame of
    // a genuinely NEW sweep, before its own first beat completes. Must run BEFORE
    // refreshVIButtons() below - see onVIPause()'s own comment for why the ordering matters.
    // clearStepMode() must run BEFORE resumeActiveReveal() - if VIPlayInteractor's own
    // continuousPlay() loop is already suspended awaiting this exact reveal (isLoopRunning()
    // true, so execute() above didn't start a fresh loop), THIS resumeActiveReveal() call is the
    // only thing that wakes it back up, and without clearing step mode first, a Step-paused
    // reveal would just play one more move and immediately re-pause instead of "Find Optimal"
    // genuinely taking over.
    if (mainView && mainView.viStatesView) {
        mainView.viStatesView.clearStepMode();
        mainView.viStatesView.resumeActiveReveal();
        mainView.viStatesView.refresh();
    }
    refreshVIButtons();
};

// known:full's Play button reads "▶ Evaluate π" (topBar.js's setVIPlayPauseMode) - per an
// explicit request, name-gate it exactly like Monte Carlo's own Play button (_withPolicyNameGate)
// whenever no policy is currently named. Find Optimal (forcedMode === 'optimal', called only from
// onRunFindOptimalBackups) and the other 3 quadrants are unaffected - this button doesn't read
// "Evaluate π" for them, so there's nothing to gate.
const onVIPlay = (forcedMode) => {
    const isEvaluatePiButton = !forcedMode
        && ValuesMethodMatrix.key(canvasViewModel.modelKnown, canvasViewModel.observability) === 'known:full';
    if (isEvaluatePiButton) {
        _withPolicyNameGate(() => _runVIPlay(forcedMode));
        return;
    }
    _runVIPlay(forcedMode);
};

const onVIPause = () => {
    // No continuous playback in Q-learning (Run is synchronous) - nothing to pause.
    if (_isLearningIterationActive()) return;
    if (!viPauseInteractor) return;
    viPauseInteractor.execute(new VIPauseInputData());
    // Freezes whichever state is currently mid-reveal exactly where it is, instead of only
    // preventing the NEXT sweep from starting once the current one finishes on its own. Must run
    // BEFORE refreshVIButtons() below - ViStatesView.canRevealNextState() treats a PAUSED reveal
    // as "Step may resume it" (enabled), but only once _activeReveal.paused is actually true;
    // refreshing buttons first would read the still-actively-playing state and leave Step
    // incorrectly disabled with nothing left to ever re-enable it.
    if (mainView && mainView.viStatesView) mainView.viStatesView.pauseActiveReveal();
    refreshVIButtons();
};

const onVIStep = (forcedMode) => {
    if (_isLearningIterationActive()) {
        canvasController.stepQLearning();    // exactly one episode
        _afterQLChange();
        return;
    }
    if (!viStepInteractor) return;
    ensureVIInitialized(forcedMode);
    viStepInteractor.execute(new VIStepInputData());
    refreshVIButtons();
    if (mainView && mainView.viStatesView) mainView.viStatesView.refresh();
};

const onVISkip = (forcedMode) => {
    if (_isLearningIterationActive()) {
        // Skip has no distinct meaning here yet - behave like Run (10 episodes) as an interim
        // stopgap rather than a dead button.
        canvasController.runQLearning(10);
        _afterQLChange();
        return;
    }
    if (!viSkipInteractor) return;
    ensureVIInitialized(forcedMode);
    viSkipInteractor.execute(new VISkipInputData());
    refreshVIButtons();
    if (mainView && mainView.viStatesView) mainView.viStatesView.refresh();
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
    if (mainView && mainView.viStatesView) mainView.viStatesView.refresh();
    canvasController.showGoalCardIfNotMuted();
    if (mainView && mainView.goalCard) mainView.goalCard.refresh();
};

const onPlay = () => {
    if (!playInteractor) return;

    // Check if start node is selected
    if (!canvasViewModel.interaction.startNode && !simulationState.replayInitialized) {
        if (noStartNodeModal) {
            noStartNodeModal.show();
        } else {
            alert('Please select a start node first (right-click a state in editor mode, or use the s₀ dropdown)');
        }
        return;
    }

    // Check for unnormalized probabilities before first initialization
    checkAndRenormalizeIfNeeded(false, () => {
        const inputData = new PlayInputData();
        playInteractor.execute(inputData);

        // Update button states
        if (topBar) {
            topBar.updateButtonStates(simulationState.isPlaying, simulationState.canAdvance());
        }
        redraw();
    });
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
    checkAndRenormalizeIfNeeded(false, () => {
        // Pause if playing
        if (simulationState.isPlaying) {
            simulationState.pause();
            if (topBar) {
                topBar.updateButtonStates(false, simulationState.canAdvance());
            }
        }

        const inputData = new StepInputData();
        stepInteractor.execute(inputData);
        redraw();
    });
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
        onSetMcAnimationEnabled: onSetMcAnimationEnabled,
        onSetIterationAnimationEnabled: onSetIterationAnimationEnabled,
        onRenormalize: onRenormalize,
        onEvaluatePolicy: onEvaluatePolicy,
        onFindOptimalPolicy: onFindOptimalPolicy,
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
            _withPolicyNameGate(() => {
                if (mainView && mainView.expectationView) mainView.expectationView.startPlay();
            });
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

    estimatorPill = new EstimatorPill({}, canvasViewModel);
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
    mcLeftViewPill.hide();

    viSweepChip = new ViSweepChip(canvasViewModel, estimatorPill);
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

    // "Find optimal π" flow's own focused goal card (findOptimalCard.js) - a sibling overlay to
    // goalCard.js above, shown instead of it (see CanvasController.enterFindOptimalScene()).
    mainView.findOptimalCard = new FindOptimalCard({
        onRun: onRunFindOptimalBackups,
        onSkip: onSkipFindOptimalCard
    }, canvasViewModel);
    mainView.findOptimalCard.setup();

    // "Name this policy" modal (namePolicyModal.js) - shared by both Evaluate π (onEvaluatePolicy)
    // and Find Optimal π (promptNameOptimalPolicy/onRunFindOptimalBackups); each supplies its own
    // onConfirm/onCancel per show() call rather than being bound here at construction time.
    namePolicyModal = new NamePolicyModal();
    namePolicyModal.setup();

    // Themed replacement for the native alert() previously used by onPlay() when Build/Policy's
    // "▶ Run" button is clicked with no start state set.
    noStartNodeModal = new NoStartNodeModal();
    noStartNodeModal.setup();

    // Single-instance toast (toast.js) - backs the Policy log's "log full, remove one first"
    // notification (see onEvaluatePolicy()/_withPolicyNameGate() below).
    toast = new Toast();
    toast.setup();

    // Themed replacement for the native confirm() previously used by checkAndRenormalizeIfNeeded().
    renormalizeConfirmModal = new RenormalizeConfirmModal({});
    renormalizeConfirmModal.setup();

    AppPalette._onThemeChange = () => {
        mainView.invalidateDotGrid();
        rightPanel.updateContent();
        if (topBar) topBar._updateThemeIcon();
        if (mainView.expectationChartView) mainView.expectationChartView.refresh();
        // ViStatesView's known:full diagram cards bake AppPalette colors into raster pixels at
        // build time - a plain refresh() only appends NEW sections, so already-rendered diagram
        // canvases would otherwise keep showing the old theme's colors. rebuildAll() forces every
        // section to redraw with the current palette.
        if (mainView.viStatesView) mainView.viStatesView.rebuildAll();
        // ViChartView's Convergence Chart.js instance also bakes AppPalette colors at render time
        // (line/grid/V* colors) - refresh() rebuilds the chart from scratch, same as
        // expectationChartView above.
        if (mainView.viChartView) mainView.viChartView.refresh();
        // ViEquationView's canvas also bakes AppPalette colors into raster pixels (the reveal's
        // node/line colors) - refresh() re-renders the current frame (held, non-replaying) with
        // the new palette.
        if (mainView.viEquationView) mainView.viEquationView.refresh();
        if (mainView.viBackwardView) mainView.viBackwardView.refresh();
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
    // Detects "a Play/continuous-sweep run just finished" for the "Find optimal π" flow -
    // findOptimalPending is only ever true while a run kicked off via onRunFindOptimalBackups is
    // in flight, so a manually-clicked Play/Step/Skip elsewhere never triggers the naming modal.
    viPresenter.setOnComplete(() => {
        if (findOptimalPending) {
            findOptimalPending = false;
            promptNameOptimalPolicy();
        }
    });

    // Between-sweep pause AND the beat's own pulse duration both track the animation-speed
    // slider (fast .. slow). Beat range (150-450ms) is centered on the old fixed 300ms default.
    // awaitReveal lets continuous Play's ("Find Optimal" in known:full) sweep-advance pacing
    // catch up on/wait for the States view's own per-card reveal to actually finish (instead of
    // racing a fixed timer against it) - viStatesView is declared further below in this same
    // function scope, but these arrow functions only read it at call time (well after that const
    // has run), so the forward reference is safe. revealNextState/skipCurrentState let
    // VIStepInteractor/VISkipInteractor claim a Step/Skip click for known:full's own per-state
    // reveal before falling through to the old sweep-level advance.
    const viAnimOptions = {
        getPauseMs: () => Math.round(150 + 650 * currentSpeed),
        getBeatMs: () => Math.round(150 + 300 * currentSpeed),
        awaitReveal: () => (viStatesView ? viStatesView.playRemainingLiveSweep() : Promise.resolve()),
        isRevealActive: () => (viStatesView ? viStatesView.hasActiveReveal() : false),
        revealNextState: () => (viStatesView ? viStatesView.revealNextState() : false),
        skipCurrentState: () => (viStatesView ? viStatesView.skipCurrentState() : false)
    };
    runVIInteractor = new RunVIInteractor(graph, valueIterationState, viPresenter);
    viPlayInteractor = new VIPlayInteractor(valueIterationState, viPresenter, graph, simulationState, viAnimOptions);
    viPauseInteractor = new VIPauseInteractor(valueIterationState, viPresenter);
    viStepInteractor = new VIStepInteractor(valueIterationState, viPresenter, graph, simulationState, viAnimOptions);
    viResetInteractor = new VIResetInteractor(valueIterationState, viPresenter);
    viSkipInteractor = new VISkipInteractor(valueIterationState, viPresenter, graph, simulationState, viAnimOptions);

    // Create Evaluate Policy presenter and interactor (Policy log - shared across all four modes)
    policyEvaluationState = new PolicyEvaluationState();
    canvasViewModel.policyEvaluationState = policyEvaluationState;

    const evaluatePolicyPresenter = new EvaluatePolicyPresenter(canvasViewModel);
    evaluatePolicyPresenter.setRightPanel(rightPanel);

    evaluatePolicyInteractor = new EvaluatePolicyInteractor(
        graph, simulationState, policyEvaluationState, evaluatePolicyPresenter,
        () => canvasViewModel.startNode, traceGenerator
    );
    topBar.setEvaluatePolicyEnabled(canvasViewModel.modelKnown);

    // "Find optimal π" (Policy log's own button, always enabled - see rightPanel.callbacks.
    // onFindOptimalPolicy below) logs Value Iteration's real greedy policy into this SAME log,
    // reusing LogOptimalPolicyPresenter's identical setRightPanel() wiring.
    const logOptimalPolicyPresenter = new LogOptimalPolicyPresenter(canvasViewModel);
    logOptimalPolicyPresenter.setRightPanel(rightPanel);
    logOptimalPolicyInteractor = new LogOptimalPolicyInteractor(
        valueIterationState, policyEvaluationState, logOptimalPolicyPresenter,
        () => canvasViewModel.startNode, traceGenerator, simulationState
    );

    // Create Value Iteration view
    const valueIterationView = new ValueIterationView(canvasViewModel, {
        getPanelWidth: () => rightPanel.getWidth(),
        getTopOffset: () => mainView.TOP_BARS_HEIGHT,
        getBottomOffset: () => topBar.getHeight(),
        getLeftInset: () => {
            const canvasW = windowWidth - rightPanel.getWidth();
            const viSplit = mainView._viSplitWidths(canvasW);
            return viSplit ? viSplit.leftW : 0;
        }
    });
    mainView.valueIterationView = valueIterationView;

    // Ties the States view's per-card staged reveal to the same animation-speed slider Play/Step/
    // Skip's own sweep pacing already uses (viAnimOptions.getBeatMs(), 150-450ms across the
    // slider's range) - normalized so the slider's midpoint (currentSpeed=0.5, beat=300ms)
    // matches this reveal's own calibrated base pacing (scale=1).
    const getVIRevealSpeedScale = () => viAnimOptions.getBeatMs() / 300;
    const viStatesView = new ViStatesView(
        canvasViewModel, valueIterationState, valueIterationViewModel, getVIRevealSpeedScale,
        // A live-section card's animation can finish entirely on its own (no click involved) -
        // canRevealNextState()/canSkipCurrentState() flipping back to true at that moment needs
        // its own button refresh, since nothing else would trigger one (see ViStatesView's own
        // onRevealProgress doc comment).
        () => refreshVIButtons());
    mainView.viStatesView = viStatesView;
    // Repaint already-drawn (non-animating) backup-diagram cards once a node photo they reference
    // finishes loading - ViBackupDiagram itself only caches/draws images, it has no notion of
    // "which cards exist" to repaint on its own.
    ViBackupDiagram.setOnImageLoaded(() => viStatesView.redrawStaticCards());

    // ViChartView now lives in the RIGHT pane (merged into viRightViewPill's own [Equation|Chart]
    // toggle below) - the left pane always shows States, so there's no left-pane pill anymore
    // (viLeftViewPill.js is kept, just unwired, same treatment as Graph - see viRightViewPill.js).
    const viChartView = new ViChartView(canvasViewModel, valueIterationState, expectationState);
    mainView.viChartView = viChartView;
    // Called here (immediately after construction), not at the viSweepChip.setup() call site the
    // brief's Step 2 pointed at - that call site runs earlier in setup()'s synchronous execution
    // than this const's own declaration, which would throw a TDZ ReferenceError. Still satisfies
    // "call .setup() during app bootstrap"; see the Task 5 report for the full explanation.
    viStatesView.setup();
    viChartView.setup();
    // Wires the real per-sweep-advance refresh hook (Play tick / Step / Skip / Reset all funnel
    // through VIPresenter's own lifecycle methods - see viPresenter.js's _refreshStatesView()).
    viPresenter.setStatesView(viStatesView);
    // Same hook for the Chart left-pane view - without this, ViChartView only ever rendered
    // inside show(), so the Q-table/Convergence chart stayed frozen/empty through an entire
    // Play/Step/Skip/Reset cycle whenever Chart was the active pane (see viPresenter.js's
    // _refreshChartView()).
    viPresenter.setChartView(viChartView);

    const viRightViewPill = new ViRightViewPill({
        onSelectRightView: (key) => {
            valueIterationViewModel.rightView = key;
            viRightViewPill.refresh();
            setUpVISplitChrome();
            if (typeof redraw === 'function') redraw();
        }
    }, canvasViewModel);
    mainView.viRightViewPill = viRightViewPill;

    const viEquationView = new ViEquationView(
        canvasViewModel, valueIterationState, valueIterationViewModel, getVIRevealSpeedScale);
    mainView.viEquationView = viEquationView;
    viRightViewPill.setup(mainView.TOP_BARS_HEIGHT);
    viEquationView.setup();

    viPresenter.setEquationView(viEquationView);

    // Backward view (Evaluate redesign Phase 6) - offered only in known:full while a
    // time-dependent policy is active, gated by ViRightViewPill itself.
    const viBackwardView = new ViBackwardView(canvasViewModel, valueIterationState, valueIterationViewModel);
    mainView.viBackwardView = viBackwardView;
    viBackwardView.setup();
    viPresenter.setBackwardView(viBackwardView);

    // BUG FIX (found during Task 7's own Step 9 verification, outside the brief's explicit step
    // list but within its file scope): ViStatesView.onActiveStateChanged is a real hook the States
    // view's card click handler already invokes (see viStatesView.js's _buildCard()), but nothing
    // in main.js ever assigned it - clicking a card updated activeStateId but never told the
    // Equation pane to re-render, so its header/reveal/Q-table silently stayed on whatever state
    // was active before (or the empty placeholder) until some unrelated VI lifecycle event (a
    // sweep) happened to fire VIPresenter's own _refreshEquationView(). Wiring it here makes the
    // click itself refresh immediately, matching the brief's Step 9 verification ("click a state's
    // card... confirm the Equation pane's header renders...").
    viStatesView.onActiveStateChanged = () => {
        if (mainView.viEquationView) mainView.viEquationView.refresh();
        if (mainView.viBackwardView) mainView.viBackwardView.refresh();
    };

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

    rightPanel.callbacks.onFindOptimalPolicy = onFindOptimalPolicy;

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
        canvasViewModel, expectationState, expectationViewModel, valueIterationState,
        { policyEvaluationState, traceGenerator, startNodeProvider, onLogPolicy: onEvaluatePolicy });
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
            Object.assign({}, simulationState.policyWeights),
            simulationState.isTimeDependent() ? simulationState.timeDependentPolicy : null
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
        // A different run count reshapes the grid entirely - a scroll position carried over from
        // the old layout wouldn't line up with anything meaningful in the new one.
        expectationViewModel.gridScrollY = 0;
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
