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

        // Real episodic Q-learning state for the Learning Iteration quadrant. Attached in main.js;
        // presentation/session-only, excluded from graph import/export (see QLearningState).
        this.qLearningState = null;
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
