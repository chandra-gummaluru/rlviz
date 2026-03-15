// User interaction state management
class InteractionViewModel {
    constructor() {
        this.mode = 'editor'; // 'editor' or 'simulate'

        // Placement state
        this.placingMode = null; // 'state', 'action', 'textbox'
        this.heldNode = null;
        this.heldTextLabel = null;

        // Drag state
        this.draggingNode = null;
        this.draggingTextLabel = null;
        this.draggingEdgeLabel = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragDistance = 0;
        this.dragStartNodeX = 0;
        this.dragStartNodeY = 0;
        this.dragStartLabelOffsetX = 0;
        this.dragStartLabelOffsetY = 0;

        // Resize state
        this.resizingNode = null;
        this.resizeStartSize = 0;
        this.resizeStartDistance = 0;

        // Pan state
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;

        // Double-click detection
        this.lastClickTime = 0;
        this.lastClickedNode = null;

        // Rename state
        this.pendingRenameNodeId = null;
        this.pendingRenameCurrentName = null;
        this.renameRequested = false;
        this.renameTargetNode = null;

        // Text label creation state
        this.pendingTextLabelText = null;
        this.textLabelRequested = false;

        // Edge creation state
        this.edgeCreationRequested = false;
        this.pendingEdgeFrom = null;
        this.pendingEdgeTo = null;

        // Camera control state
        this.shouldCenterOnNode = false;
        this.nodeToCenterOn = null;

        // Simulation state
        this.startNode = null;
    }

    reset() {
        this.placingMode = null;
        this.heldNode = null;
        this.heldTextLabel = null;
        this.draggingNode = null;
        this.draggingTextLabel = null;
        this.draggingEdgeLabel = null;
        this.resizingNode = null;
        this.isPanning = false;
        this.renameRequested = false;
        this.textLabelRequested = false;
    }

    isInteracting() {
        return this.heldNode !== null ||
               this.heldTextLabel !== null ||
               this.draggingNode !== null ||
               this.draggingTextLabel !== null ||
               this.draggingEdgeLabel !== null ||
               this.resizingNode !== null ||
               this.isPanning;
    }

    startDrag(node, startX, startY) {
        this.draggingNode = node;
        this.dragStartX = startX;
        this.dragStartY = startY;
        this.dragStartNodeX = node.x;
        this.dragStartNodeY = node.y;
        this.dragDistance = 0;
    }

    updateDragDistance(currentX, currentY) {
        if (this.draggingNode) {
            this.dragDistance += Math.abs(currentX - this.draggingNode.x) +
                                 Math.abs(currentY - this.draggingNode.y);
        }
        if (this.draggingTextLabel) {
            this.dragDistance += Math.abs(currentX - this.draggingTextLabel.x) +
                                 Math.abs(currentY - this.draggingTextLabel.y);
        }
        if (this.draggingEdgeLabel) {
            // Just increment to track that dragging occurred
            this.dragDistance += Math.abs(currentX - this.dragStartX) +
                                 Math.abs(currentY - this.dragStartY);
        }
    }

    wasDragged(threshold = 5) {
        return this.dragDistance > threshold;
    }

    clearDrag() {
        this.draggingNode = null;
        this.draggingTextLabel = null;
        this.draggingEdgeLabel = null;
        this.dragDistance = 0;
    }
}
