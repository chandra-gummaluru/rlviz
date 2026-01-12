class CanvasViewModel {
    constructor(graph, interactors) {
        this.graph = graph;

        // Interactors for all operations (can be null initially, wired up later)
        this.createNodeInteractor = interactors ? interactors.createNode : null;
        this.createEdgeInteractor = interactors ? interactors.createEdge : null;
        this.nodeInteractionInteractor = interactors ? interactors.nodeInteraction : null;
        this.nodeInteractionPresenter = null;  // Set in main.js for getFoundNode()
        this.serializeGraphInteractor = interactors ? interactors.serializeGraph : null;
        this.serializeGraphPresenter = null;  // Set in main.js for getSerializedData()
        this.undoInteractor = interactors ? interactors.undo : null;
        this.redoInteractor = interactors ? interactors.redo : null;
        this.setModeInteractor = interactors ? interactors.setMode : null;
        this.zoomInInteractor = interactors ? interactors.zoomIn : null;
        this.zoomOutInteractor = interactors ? interactors.zoomOut : null;
        this.importGraphInteractor = interactors ? interactors.importGraph : null;

        // Simulation interactors
        this.playInteractor = interactors ? interactors.play : null;
        this.skipInteractor = interactors ? interactors.skip : null;
        this.resetInteractor = interactors ? interactors.reset : null;

        this.mode = 'editor'; // 'editor' or 'simulate'
        this.selectedNode = null;
        this.selectedEdge = null;
        this.selectedTextLabel = null;
        this.heldNode = null;
        this.heldTextLabel = null;
        this.placingMode = null;
        this.dragDistance = 0;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastClickTime = 0;
        this.lastClickedNode = null;

        // Simulate mode: start node selection
        this.startNode = null;

        // Simulation state (created by PlayInteractor, shared with view)
        this.simulationState = null;

        // Zoom and pan
        this.zoom = 1.0;
        this.minZoom = 0.1;
        this.maxZoom = 5.0;
        this.panX = 0;
        this.panY = 0;

        // Panning state
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.panStartPanX = 0;
        this.panStartPanY = 0;

        // Command history for undo/redo
        this.commandHistory = new CommandHistory(50);

        // Track positions for move commands
        this.nodeDragStartPos = new Map(); // nodeId -> {x, y}
        this.textLabelDragStartPos = new Map(); // labelId -> {x, y}

        // Undo/Redo state flags (updated by presenters)
        this.canUndoFlag = false;
        this.canRedoFlag = false;

        // Operation feedback
        this.lastOperationError = null;
        this.lastOperationMessage = null;
    }

    setMode(mode) {
        // Delegate to interactor if available
        if (this.setModeInteractor) {
            const inputData = new SetModeInputData(mode);
            this.setModeInteractor.execute(inputData);
        } else {
            // Fallback: direct update if interactor not yet wired
            this.mode = mode;
        }
        // Clear selections after mode change
        this.clearSelection();
        this.startNode = null; // Clear start node when switching modes
    }

    startNodePlacement(type) {
        if (type === 'textbox') {
            const text = prompt('Enter text:', 'Text');
            if (text) {
                const label = new TextLabel(text, 0, 0, 16);
                this.graph.addTextLabel(label);
                this.heldTextLabel = label;
                this.placingMode = 'textbox';
                return label;
            }
            return null;
        } else {
            // Use interactor if available
            if (this.createNodeInteractor) {
                const inputData = new CreateNodeInputData(type, 0, 0);
                this.createNodeInteractor.execute(inputData);
                // Get the created node from the graph (last added node)
                const node = this.graph.nodes[this.graph.nodes.length - 1];
                this.heldNode = node;
                this.placingMode = type;
                return node;
            } else {
                console.error('CreateNodeInteractor not initialized');
                return null;
            }
        }
    }

    updateNodePlacement(x, y) {
        if (this.heldNode) {
            this.heldNode.setPosition(x, y);
        }
        if (this.heldTextLabel) {
            this.heldTextLabel.setPosition(x, y);
        }
    }

    finishNodePlacement() {
        this.heldNode = null;
        this.heldTextLabel = null;
        this.placingMode = null;
    }

    handleMousePress(x, y) {
        if (this.placingMode) {
            this.finishNodePlacement();
            return { mode: 'placed' };
        }

        // Check for double-click on node
        const currentTime = Date.now();
        const hitNode = this.findNodeAtPosition(x, y);

        if (hitNode && this.lastClickedNode === hitNode && currentTime - this.lastClickTime < 500) {
            // Double-click detected
            this.lastClickTime = 0;
            this.lastClickedNode = null;

            if (this.mode === 'editor') {
                // Editor mode: rename node
                const newName = prompt('Enter new name:', hitNode.getName());
                if (newName !== null && newName.trim() !== '') {
                    hitNode.setName(newName);
                }
                return { mode: 'renamed', node: hitNode };
            } else if (this.mode === 'simulate') {
                // Simulate mode: select start node and center camera on node
                this.startNode = hitNode;
                return { mode: 'center_and_select', node: hitNode };
            }
        }

        this.lastClickTime = currentTime;
        this.lastClickedNode = hitNode;

        // Check for text label click
        const hitTextLabel = this.findTextLabelAtPosition(x, y);
        if (hitTextLabel) {
            this.heldTextLabel = hitTextLabel;
            this.dragStartX = x;
            this.dragStartY = y;
            this.dragDistance = 0;
            this.selectedTextLabel = hitTextLabel;
            this.selectedNode = null;
            this.selectedEdge = null;
            return { mode: 'drag_text', label: hitTextLabel };
        }

        if (!hitNode) {
            // Check for edge click
            const hitEdge = this.findEdgeAtPosition(x, y);
            if (hitEdge) {
                this.selectedEdge = hitEdge;
                this.selectedNode = null;
                this.selectedTextLabel = null;
                return { mode: 'edge_selected', edge: hitEdge };
            }

            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedTextLabel = null;
            return { mode: 'deselect' };
        }

        this.heldNode = hitNode;
        this.dragStartX = x;
        this.dragStartY = y;
        this.dragDistance = 0;
        this.selectedEdge = null;
        this.selectedTextLabel = null;

        return { mode: 'drag_start', node: hitNode };
    }

    findTextLabelAtPosition(x, y) {
        return this.graph.textLabels.find(label => label.contains(x, y));
    }

    findEdgeAtPosition(x, y, threshold = 10) {
        return this.graph.edges.find(edge => {
            const from = edge.getFromNode();
            const to = edge.getToNode();

            // Calculate distance from point to line
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length === 0) return false;

            const dot = ((x - from.x) * dx + (y - from.y) * dy) / (length * length);

            if (dot < 0 || dot > 1) return false;

            const projX = from.x + dot * dx;
            const projY = from.y + dot * dy;
            const distance = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);

            return distance <= threshold;
        });
    }

    handleMouseDrag(x, y) {
        if (this.heldTextLabel) {
            this.dragDistance += Math.abs(x - this.heldTextLabel.x) +
                                 Math.abs(y - this.heldTextLabel.y);
            this.heldTextLabel.setPosition(x, y);
            return { mode: 'dragging_text', label: this.heldTextLabel };
        }

        if (!this.heldNode) return;

        this.dragDistance += Math.abs(x - this.heldNode.x) +
                             Math.abs(y - this.heldNode.y);

        this.moveNode(this.heldNode.id, x, y);

        return { mode: 'dragging', node: this.heldNode };
    }

    handleMouseRelease(x, y) {
        const DRAG_THRESHOLD = 5;
        const wasDrag = this.dragDistance > DRAG_THRESHOLD;

        if (this.heldTextLabel) {
            this.heldTextLabel = null;
            return { mode: 'drag_text_end' };
        }

        if (wasDrag) {
            this.heldNode = null;
            return { mode: 'drag_end' };
        }

        const clickedNode = this.heldNode;
        this.heldNode = null;

        // Simulate mode: no action on single-click (only double-click selects start node)
        if (this.mode === 'simulate') {
            return { mode: 'no_action' };
        }

        // Editor mode: existing edge creation logic
        if (!this.selectedNode) {
            this.selectedNode = clickedNode;
            return { mode: 'select', node: clickedNode };
        }

        if (this.selectedNode === clickedNode) {
            this.selectedNode = null;
            return { mode: 'deselect' };
        }

        const from = this.selectedNode;
        const to = clickedNode;
        this.selectedNode = null;

        if (from.type === to.type) {
            return {
                mode: 'invalid_edge',
                message: 'Cannot connect nodes of same type'
            };
        }

        return {
            mode: 'prompt_edge',
            fromNode: from,
            toNode: to
        };
    }

    createEdge(fromId, toId, probability, reward) {
        // Use interactor if available
        if (this.createEdgeInteractor) {
            const inputData = new CreateEdgeInputData(fromId, toId, probability, reward);
            this.createEdgeInteractor.execute(inputData);
            // Return success (edge is added to graph in interactor)
            return { success: true };
        } else {
            console.error('CreateEdgeInteractor not initialized');
            return { success: false, message: 'Interactor not initialized' };
        }
    }

    // Helper methods that delegate to interactors
    findNodeAtPosition(x, y) {
        if (this.nodeInteractionInteractor && this.nodeInteractionPresenter) {
            const inputData = new FindNodeInputData(x, y);
            this.nodeInteractionInteractor.findNodeAtPosition(inputData);
            return this.nodeInteractionPresenter.getFoundNode();
        } else {
            // Fallback: direct search
            for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
                const node = this.graph.nodes[i];
                if (node.contains(x, y)) {
                    return node;
                }
            }
            return null;
        }
    }

    moveNode(nodeId, newX, newY) {
        if (this.nodeInteractionInteractor) {
            const inputData = new MoveNodeInputData(nodeId, newX, newY);
            this.nodeInteractionInteractor.moveNode(inputData);
        } else {
            // Fallback: direct update
            const node = this.graph.getNodeById(nodeId);
            if (node) {
                node.setPosition(newX, newY);
            }
        }
    }

    deleteSelected() {
        if (this.selectedNode) {
            const node = this.selectedNode;
            const command = new DeleteNodeCommand(this.graph, node);
            this.commandHistory.execute(command);
            this.selectedNode = null;
            return { deleted: 'node' };
        }
        if (this.selectedEdge) {
            const edge = this.selectedEdge;
            const command = new DeleteEdgeCommand(this.graph, edge);
            this.commandHistory.execute(command);
            this.selectedEdge = null;
            return { deleted: 'edge' };
        }
        if (this.selectedTextLabel) {
            const label = this.selectedTextLabel;
            const command = new DeleteTextLabelCommand(this.graph, label);
            this.commandHistory.execute(command);
            this.selectedTextLabel = null;
            return { deleted: 'text' };
        }
        return { deleted: 'none' };
    }

    importGraph(json) {
        // Delegate to interactor if available
        if (this.importGraphInteractor) {
            const inputData = new ImportGraphInputData(json);
            this.importGraphInteractor.execute(inputData);
        } else {
            // Fallback: direct deserialization
            try {
                const data = typeof json === 'string' ? JSON.parse(json) : json;
                this.graph.deserialize(data);
                this.clearSelection();
            } catch (error) {
                console.error('Failed to import graph:', error);
                alert('Error importing graph: ' + error.message);
            }
        }
    }

    serializeGraph() {
        if (this.serializeGraphInteractor && this.serializeGraphPresenter) {
            const inputData = new SerializeGraphInputData();
            this.serializeGraphInteractor.execute(inputData);
            return this.serializeGraphPresenter.getSerializedData();
        } else {
            // Fallback: direct serialization
            const serialized = this.graph.serialize();
            return JSON.stringify(serialized, null, 2);
        }
    }

    getNodes() {
        return this.graph.nodes;
    }

    getEdges() {
        return this.graph.edges;
    }

    getTextLabels() {
        return this.graph.textLabels;
    }

    getNodeColor(node) {
        // Simulation active: highlight current node
        if (this.mode === 'simulate' && this.simulationState && this.simulationState.replayInitialized) {
            const currentNode = this.simulationState.currentNode;
            if (currentNode && currentNode.id === node.id) {
                return '#FF9800'; // Bright orange for current simulation node
            }
        }

        // Simulate mode: highlight start node with bright green (before simulation starts)
        if (this.mode === 'simulate' && this.startNode === node) {
            return '#00E676'; // Bright green for start node
        }

        // Editor mode: existing colors
        if (this.selectedNode === node) return '#FFC107'; // Yellow for selected
        if (this.heldNode === node) return '#9CCC65'; // Light green for held
        return node.type === 'state' ? '#4A90E2' : '#E27D60'; // Blue/Orange
    }

    getEdgeColor(edge) {
        // Simulation active: highlight current edge
        if (this.mode === 'simulate' && this.simulationState && this.simulationState.highlightedEdge) {
            const from = edge.getFromNode();
            const to = edge.getToNode();
            if (this.simulationState.isEdgeHighlighted(from.id, to.id)) {
                return '#FF5722'; // Red for highlighted edge
            }
        }

        // Editor mode: selected edge
        return this.selectedEdge === edge ? '#FF5722' : '#666666';
    }

    getTextLabelColor(label) {
        return this.selectedTextLabel === label ? '#2196F3' : '#000000';
    }

    // Zoom methods
    zoomIn(centerX, centerY) {
        // Delegate to interactor if available
        if (this.zoomInInteractor) {
            const inputData = new ZoomInputData(centerX, centerY, this.zoom, this.panX, this.panY);
            this.zoomInInteractor.execute(inputData);
        } else {
            // Fallback: direct calculation
            const oldZoom = this.zoom;
            this.zoom = Math.min(this.zoom * 1.2, this.maxZoom);
            if (centerX !== undefined && centerY !== undefined) {
                this.panX -= (centerX - this.panX) * (this.zoom / oldZoom - 1);
                this.panY -= (centerY - this.panY) * (this.zoom / oldZoom - 1);
            }
        }
        return this.zoom;
    }

    zoomOut(centerX, centerY) {
        // Delegate to interactor if available
        if (this.zoomOutInteractor) {
            const inputData = new ZoomInputData(centerX, centerY, this.zoom, this.panX, this.panY);
            this.zoomOutInteractor.execute(inputData);
        } else {
            // Fallback: direct calculation
            const oldZoom = this.zoom;
            this.zoom = Math.max(this.zoom / 1.2, this.minZoom);
            if (centerX !== undefined && centerY !== undefined) {
                this.panX -= (centerX - this.panX) * (this.zoom / oldZoom - 1);
                this.panY -= (centerY - this.panY) * (this.zoom / oldZoom - 1);
            }
        }
        return this.zoom;
    }

    setZoom(newZoom, centerX, centerY) {
        // Keep this method for direct zoom setting (used by mouse wheel)
        const oldZoom = this.zoom;
        this.zoom = Math.max(this.minZoom, Math.min(newZoom, this.maxZoom));

        // Adjust pan to zoom towards the center point
        if (centerX !== undefined && centerY !== undefined) {
            this.panX -= (centerX - this.panX) * (this.zoom / oldZoom - 1);
            this.panY -= (centerY - this.panY) * (this.zoom / oldZoom - 1);
        }

        return this.zoom;
    }

    resetZoom() {
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
    }

    // Transform screen coordinates to world coordinates
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.panX) / this.zoom,
            y: (screenY - this.panY) / this.zoom
        };
    }

    // Transform world coordinates to screen coordinates
    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.zoom + this.panX,
            y: worldY * this.zoom + this.panY
        };
    }

    // Pan methods
    startPan(screenX, screenY) {
        this.isPanning = true;
        this.panStartX = screenX;
        this.panStartY = screenY;
        this.panStartPanX = this.panX;
        this.panStartPanY = this.panY;
    }

    updatePan(screenX, screenY) {
        if (!this.isPanning) return;

        const dx = screenX - this.panStartX;
        const dy = screenY - this.panStartY;

        this.panX = this.panStartPanX + dx;
        this.panY = this.panStartPanY + dy;
    }

    endPan() {
        this.isPanning = false;
    }

    // Center camera on a specific node and zoom to 500%
    centerOnNode(node, canvasWidth, canvasHeight) {
        // Calculate screen center
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;

        // Set zoom to 500% (5.0x)
        this.zoom = 5.0;

        // Calculate new pan to center the node at screen center
        // Formula: screenCenter = nodeWorld * zoom + pan
        // Solving for pan: pan = screenCenter - (nodeWorld * zoom)
        this.panX = centerX - (node.x * this.zoom);
        this.panY = centerY - (node.y * this.zoom);
    }

    // Store drag start position for undo/redo
    storeDragStartPosition(node) {
        this.nodeDragStartPos.set(node.id, { x: node.x, y: node.y });
    }

    storeTextLabelDragStartPosition(label) {
        this.textLabelDragStartPos.set(label.id, { x: label.x, y: label.y });
    }

    // Create move command after drag ends
    createMoveCommand(node) {
        const startPos = this.nodeDragStartPos.get(node.id);
        if (startPos && (startPos.x !== node.x || startPos.y !== node.y)) {
            const command = new MoveNodeCommand(node, startPos.x, startPos.y, node.x, node.y);
            this.commandHistory.execute(command);
            this.nodeDragStartPos.delete(node.id);
        }
    }

    createMoveTextLabelCommand(label) {
        const startPos = this.textLabelDragStartPos.get(label.id);
        if (startPos && (startPos.x !== label.x || startPos.y !== label.y)) {
            const command = new MoveTextLabelCommand(label, startPos.x, startPos.y, label.x, label.y);
            this.commandHistory.execute(command);
            this.textLabelDragStartPos.delete(label.id);
        }
    }

    // Undo/redo methods
    undo() {
        // Delegate to interactor if available
        if (this.undoInteractor) {
            this.undoInteractor.execute();
            return this.canUndoFlag;
        } else {
            // Fallback: direct undo
            const success = this.commandHistory.undo();
            if (success) {
                this.clearSelection();
            }
            return success;
        }
    }

    redo() {
        // Delegate to interactor if available
        if (this.redoInteractor) {
            this.redoInteractor.execute();
            return this.canRedoFlag;
        } else {
            // Fallback: direct redo
            const success = this.commandHistory.redo();
            if (success) {
                this.clearSelection();
            }
            return success;
        }
    }

    canUndo() {
        return this.commandHistory.canUndo();
    }

    canRedo() {
        return this.commandHistory.canRedo();
    }

    getUndoDescription() {
        return this.commandHistory.getUndoDescription();
    }

    getRedoDescription() {
        return this.commandHistory.getRedoDescription();
    }

    // Methods for presenters to update state
    clearSelection() {
        this.selectedNode = null;
        this.selectedEdge = null;
        this.selectedTextLabel = null;
    }

    updateUndoRedoState(canUndo, canRedo) {
        this.canUndoFlag = canUndo;
        this.canRedoFlag = canRedo;
    }
}
