// Refactored CanvasViewModel - Coordinator for sub-ViewModels
class CanvasViewModel {
    constructor(graph, simulationState) {
        this.graph = graph;
        this.simulationState = simulationState;

        // Sub-ViewModels (focused responsibilities)
        this.selection = new SelectionViewModel();
        this.viewport = new ViewportViewModel();
        this.interaction = new InteractionViewModel();

        // Undo/Redo state (set by presenters)
        this.canUndoFlag = false;
        this.canRedoFlag = false;
        this.undoDescription = '';
        this.redoDescription = '';

        // Value Iteration (set after construction)
        this.valueIterationState = null;
        this.valueIterationViewModel = null;

        // Messages (set by presenters)
        this.errorMessage = null;
        this.infoMessage = null;
        this.lastOperationError = null;
        this.lastOperationMessage = null;

        // Bottom chart dock (Values mode). Starts closed/zero-height so canvas layout math
        // doesn't reserve a gap before ChartDock.show() is called on entering Values mode.
        this.dockState = {
            open: false,
            collapsed: false,
            heightPx: 0,
            preferredHeightPx: 132,
            slot1Chart: 'convergence',
            slot2Chart: 'histogram'
        };

        // Whether the VI pane presents itself as "Value Iteration" (P known, exact Bellman
        // backup) or "Learning Iteration" (P unknown, teal->purpleT, editable Q-table). This is
        // presentation-tier: the graph's real transition probabilities don't change, only what
        // the UI claims to know/show.
        this.modelKnown = true;

        // Whether the current method-matrix quadrant presents as fully observable ('full') or
        // partially observable ('partial') - the second axis alongside modelKnown, together
        // selecting Value Iteration / Learning Iteration / Belief Iteration / PO Q-Learning.
        // Presentation-tier only, same as modelKnown; consumption lives in a later phase.
        this.observability = 'full';

        // Learning Iteration (unknown:full quadrant) canvas view: 'graph' (flat MDP) or 'tree'
        // (episode search tree). Presentation-tier only, toggled by the floating Graph|Tree pill.
        this.learningIterationCanvasView = 'graph';

        // Build/Policy canvas view: 'graph' (normal editor) or 'tree' (the MDP unrolled into a
        // left-to-right search tree rooted at startNode). Presentation-tier only, toggled by the
        // floating Graph|Tree pill (Build/Policy only - unrelated to learningIterationCanvasView
        // above, which is Values -> Learning Iteration's own, separate Graph|Tree toggle).
        this.buildCanvasView = 'graph';

        // "Animations · per mode" (top bar Parameters popover) - when false, that mode's reveal
        // is instant instead of animated/tweened; the underlying computation is unaffected
        // (Monte Carlo still advances tick-by-tick, Value Iteration still computes sweep-by-
        // sweep - see expectationView.js's startPlay()/viStatesView.js's _prepareLiveSection()).
        // Presentation-tier only, excluded from graph import/export, same convention as
        // buildCanvasView/learningIterationCanvasView above.
        this.mcAnimationEnabled = true;
        this.iterationAnimationEnabled = true;

        // Set<pathId> of tree nodes the user has manually expanded beyond the default depth cap.
        // pathId format: "s0.a0.1" (state root, then alternating .a<actionIndex>/.<outcomeIndex>
        // segments) - a state can recur at multiple tree positions, so expansion is keyed by tree
        // position, not state id. Cleared whenever startNode changes (see setStartNode below).
        this.treeExpanded = new Set();

        // Real episodic Q-learning state for the Learning Iteration quadrant. Attached in main.js;
        // presentation/session-only, excluded from graph import/export (see QLearningState).
        this.qLearningState = null;

        // Evaluate redesign Phase 1: the full-canvas "goal card" shown on entering Values mode
        // (V^pi(S0) = E[G | S=S0]), gating direct entry into the Monte Carlo/Iteration sub-views.
        // Both fields are presentation-tier only, session-scoped (goalCardMuted is NOT persisted
        // to localStorage, unlike theme preference) - excluded from graph import/export, same
        // convention as buildCanvasView/treeExpanded above.
        this.goalCardVisible = false;
        // "don't ask again" for this session - once true, entering Values mode or clicking Reset
        // in Monte Carlo/Iteration no longer shows the card until the page reloads.
        this.goalCardMuted = false;

        // "Find optimal π" flow's own focused overlay (findOptimalCard.js) - shown instead of
        // (never alongside) the generic goal card above; see
        // CanvasController.enterFindOptimalScene()/dismissFindOptimalCard(). Same
        // presentation-tier, session-only, import/export-excluded convention as goalCardVisible.
        this.findOptimalCardVisible = false;

        // Whichever Policy log entry's policy is currently live, if any - the LaTeX label string
        // (e.g. "\pi_{\text{policy_1}}" or "\pi^{*}_{\text{optimal-1}}") of the entry last
        // restored via CanvasController.restorePolicyFromLog(), so goalCard.js's "Want to find"
        // equation can read V^{that label} instead of a generic V^pi. Set to null (falls back to
        // plain \pi) by restorePolicyFromLog's own callers on fresh restore, and invalidated back
        // to null by every direct policy edit (setPolicyAction/setPolicyWeight/setPiMode/...) -
        // once the user touches the policy by hand it may no longer match the named log entry.
        // Presentation-only, same convention as goalCardVisible above.
        this.activePolicyLabel = null;
    }

    // Factory methods for creating presentation view models
    createNodeViewModel(node) {
        return new NodeViewModel(node, this.selection, this.interaction, this.simulationState);
    }

    createEdgeViewModel(edge) {
        return new EdgeViewModel(edge, this.graph, this.selection, this.interaction, this.simulationState);
    }

    // Convenience getters for backward compatibility
    get mode() {
        return this.interaction.mode;
    }

    set mode(value) {
        this.interaction.mode = value;
    }

    get valuesSubView() {
        return this.interaction.valuesSubView;
    }

    set valuesSubView(value) {
        this.interaction.valuesSubView = value;
    }

    get zoom() {
        return this.viewport.zoom;
    }

    get panX() {
        return this.viewport.panX;
    }

    get panY() {
        return this.viewport.panY;
    }

    get selectedNode() {
        return this.selection.selectedNode;
    }

    get selectedEdge() {
        return this.selection.selectedEdge;
    }

    get selectedTextLabel() {
        return this.selection.selectedTextLabel;
    }

    get placingMode() {
        return this.interaction.placingMode;
    }

    get heldNode() {
        return this.interaction.heldNode;
    }

    get heldTextLabel() {
        return this.interaction.heldTextLabel;
    }

    get startNode() {
        return this.interaction.startNode;
    }

    set startNode(value) {
        this.interaction.startNode = value;
    }

    // Methods used by presenters to update state
    clearSelection() {
        this.selection.clearSelection();
    }

    updateUndoRedoState(canUndo, canRedo) {
        this.canUndoFlag = canUndo;
        this.canRedoFlag = canRedo;
        if (this._onUndoRedoChange) this._onUndoRedoChange(canUndo, canRedo);
    }

    canUndo() {
        return this.canUndoFlag;
    }

    canRedo() {
        return this.canRedoFlag;
    }

    // Domain access methods (for read-only queries)
    getNodes() {
        return this.graph.nodes;
    }

    getEdges() {
        return this.graph.edges;
    }

    getTextLabels() {
        return this.graph.textLabels;
    }

    // Clear all transient state
    reset() {
        this.selection.clearSelection();
        this.interaction.reset();
        this.errorMessage = null;
        this.infoMessage = null;
        this.lastOperationError = null;
        this.lastOperationMessage = null;
    }

    // Coordinate transformations (delegates to viewport)
    screenToWorld(screenX, screenY) {
        return this.viewport.screenToWorld(screenX, screenY);
    }

    worldToScreen(worldX, worldY) {
        return this.viewport.worldToScreen(worldX, worldY);
    }

    // Viewport methods (delegates to viewport)
    setZoom(newZoom, centerX, centerY) {
        return this.viewport.setZoom(newZoom, centerX, centerY);
    }

    resetZoom() {
        this.viewport.reset();
    }

    centerOnNode(node, canvasWidth, canvasHeight) {
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;

        // Pan to center on node without changing zoom level
        this.viewport.panX = centerX - (node.x * this.viewport.zoom);
        this.viewport.panY = centerY - (node.y * this.viewport.zoom);
    }
}
