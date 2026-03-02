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

        // Messages (set by presenters)
        this.errorMessage = null;
        this.infoMessage = null;
        this.lastOperationError = null;
        this.lastOperationMessage = null;
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
        if (value === 'editor') {
            this.interaction.startNode = null;
        }
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

        this.viewport.zoom = 5.0;
        this.viewport.panX = centerX - (node.x * this.viewport.zoom);
        this.viewport.panY = centerY - (node.y * this.viewport.zoom);
    }
}
