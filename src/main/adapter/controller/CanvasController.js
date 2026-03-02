// Controller for canvas user input and interaction
class CanvasController {
    constructor(viewModel, interactors) {
        this.viewModel = viewModel;
        this.interactors = interactors;

        // Debug: verify classes are loaded
        console.log('CanvasController created');
        console.log('MoveNodeInputData:', typeof MoveNodeInputData);
        console.log('MoveNodeInputData.forNodeStart:', typeof MoveNodeInputData.forNodeStart);
        console.log('SelectNodeInputData:', typeof SelectNodeInputData);
        console.log('RenameNodeInputData:', typeof RenameNodeInputData);
        console.log('CreateTextLabelInputData:', typeof CreateTextLabelInputData);

        // Verify graph references
        console.log('ViewModel graph:', this.viewModel.graph);
        console.log('Number of nodes in graph:', this.viewModel.graph.nodes.length);
    }

    // ===== Mouse Input Handling =====

    handleMousePress(screenX, screenY) {
        const world = this.viewModel.screenToWorld(screenX, screenY);
        const x = world.x;
        const y = world.y;

        console.log('handleMousePress:', screenX, screenY, '-> world:', x, y);

        // Handle node placement
        if (this.viewModel.interaction.placingMode) {
            this._finishPlacement();
            return;
        }

        // Find what was clicked
        const target = GeometricHelper.findEntityAtPosition(this.viewModel.graph, x, y);
        console.log('Found target:', target.type, target.entity);

        // Check for double-click
        const isDoubleClick = GeometricHelper.isDoubleClick(
            this.viewModel.interaction.lastClickTime,
            this.viewModel.interaction.lastClickedNode,
            target.entity
        );

        this.viewModel.interaction.lastClickTime = Date.now();
        this.viewModel.interaction.lastClickedNode = target.entity;

        if (isDoubleClick && target.type === 'node') {
            this._handleDoubleClick(target.entity);
            return;
        }

        // Handle single clicks by entity type
        switch (target.type) {
            case 'edgeLabel':
                this._handleEdgeLabelClick(target.entity, x, y);
                break;
            case 'textLabel':
                this._handleTextLabelClick(target.entity, x, y);
                break;
            case 'edge':
                this._handleEdgeClick(target.entity);
                break;
            case 'node':
                this._handleNodeClick(target.entity, x, y);
                break;
            case 'none':
                this._handleCanvasClick();
                break;
        }
    }

    handleMouseDrag(screenX, screenY) {
        const world = this.viewModel.screenToWorld(screenX, screenY);
        const x = world.x;
        const y = world.y;

        console.log('handleMouseDrag - draggingNode:', this.viewModel.interaction.draggingNode ? this.viewModel.interaction.draggingNode.name : null);

        // Update node placement
        if (this.viewModel.interaction.heldNode) {
            this.viewModel.interaction.heldNode.setPosition(x, y);
            return;
        }

        if (this.viewModel.interaction.heldTextLabel) {
            this.viewModel.interaction.heldTextLabel.setPosition(x, y);
            return;
        }

        // Handle resizing
        if (this.viewModel.interaction.resizingNode) {
            const currentDistance = this.viewModel.interaction.resizingNode.distanceTo(x, y);
            const newSize = Math.max(10, Math.min(100, currentDistance));
            this.viewModel.interaction.resizingNode.setSize(newSize);
            return;
        }

        // Handle edge label drag
        if (this.viewModel.interaction.draggingEdgeLabel) {
            const edge = this.viewModel.interaction.draggingEdgeLabel;
            const dx = x - this.viewModel.interaction.dragStartX;
            const dy = y - this.viewModel.interaction.dragStartY;
            edge.setLabelOffset(
                this.viewModel.interaction.dragStartLabelOffsetX + dx,
                this.viewModel.interaction.dragStartLabelOffsetY + dy
            );
            return;
        }

        // Handle text label drag
        if (this.viewModel.interaction.draggingTextLabel) {
            this.viewModel.interaction.updateDragDistance(x, y);
            this.viewModel.interaction.draggingTextLabel.setPosition(x, y);
            return;
        }

        // Handle node drag
        if (this.viewModel.interaction.draggingNode) {
            console.log('Moving node to:', x, y);
            this.viewModel.interaction.updateDragDistance(x, y);
            if (this.interactors.moveNode) {
                const inputData = MoveNodeInputData.forNodeUpdate(
                    this.viewModel.interaction.draggingNode.id,
                    x,
                    y
                );
                this.interactors.moveNode.updateMove(inputData);
            } else {
                this.viewModel.interaction.draggingNode.setPosition(x, y);
            }
            return;
        }
    }

    handleMouseRelease(screenX, screenY) {
        const world = this.viewModel.screenToWorld(screenX, screenY);
        const x = world.x;
        const y = world.y;

        // Handle resize end
        if (this.viewModel.interaction.resizingNode) {
            const node = this.viewModel.interaction.resizingNode;
            const newSize = node.getSize();

            if (newSize !== this.viewModel.interaction.resizeStartSize) {
                if (this.interactors.resizeNode) {
                    const inputData = new ResizeNodeInputData(
                        node.id,
                        this.viewModel.interaction.resizeStartSize,
                        newSize
                    );
                    this.interactors.resizeNode.resizeNode(inputData);
                }
            }

            this.viewModel.interaction.resizingNode = null;
            return;
        }

        // Handle edge label drag end
        if (this.viewModel.interaction.draggingEdgeLabel) {
            // Edge label dragging doesn't need undo/redo - just clear the state
            this.viewModel.interaction.draggingEdgeLabel = null;
            this.viewModel.interaction.dragDistance = 0;
            return;
        }

        // Handle text label drag end
        if (this.viewModel.interaction.draggingTextLabel) {
            const label = this.viewModel.interaction.draggingTextLabel;
            const wasDragged = this.viewModel.interaction.wasDragged();

            if (wasDragged && this.interactors.moveNode) {
                const inputData = MoveNodeInputData.forTextLabelFinish(
                    label.id,
                    this.viewModel.interaction.dragStartX,
                    this.viewModel.interaction.dragStartY,
                    label.x,
                    label.y
                );
                this.interactors.moveNode.finishMove(inputData);
            }

            this.viewModel.interaction.draggingTextLabel = null;
            this.viewModel.interaction.dragDistance = 0;
            return;
        }

        // Handle node drag end
        if (this.viewModel.interaction.draggingNode) {
            const node = this.viewModel.interaction.draggingNode;
            const wasDragged = this.viewModel.interaction.wasDragged();

            if (wasDragged) {
                // Finish move with command
                if (this.interactors.moveNode) {
                    const inputData = MoveNodeInputData.forNodeFinish(
                        node.id,
                        this.viewModel.interaction.dragStartNodeX,
                        this.viewModel.interaction.dragStartNodeY,
                        node.x,
                        node.y
                    );
                    this.interactors.moveNode.finishMove(inputData);
                }
            } else {
                // Was a click, not a drag
                // Don't do anything here - selection already happened in mousePressed
            }

            this.viewModel.interaction.draggingNode = null;
            this.viewModel.interaction.dragDistance = 0;
            return;
        }
    }

    // ===== Keyboard Input Handling =====

    handleKeyPress(key) {
        // Delete key
        if (key === 'Delete' || key === 'Backspace') {
            this.deleteSelected();
            return true;
        }

        // Undo
        if ((key === 'z' || key === 'Z') && (keyIsDown(CONTROL) || keyIsDown(91))) {
            if (keyIsDown(SHIFT)) {
                this.redo();
            } else {
                this.undo();
            }
            return false; // Prevent default
        }

        // Reset zoom
        if (key === 'r' || key === 'R') {
            this.viewModel.resetZoom();
            return true;
        }

        // Export to console
        if (key === 's' || key === 'S') {
            this.exportToConsole();
            return true;
        }

        return true; // Allow default
    }

    // ===== User Actions =====

    startNodePlacement(type) {
        if (type === 'textbox') {
            if (this.interactors.createTextLabel) {
                const inputData = CreateTextLabelInputData.forRequest();
                this.interactors.createTextLabel.requestCreate(inputData);
            }
        } else {
            if (this.interactors.createNode) {
                // Calculate center of canvas in world coordinates
                // Canvas is full window width and height minus top bars
                const canvasWidth = window.innerWidth;
                const canvasHeight = window.innerHeight - 90; // menu bar (40px) + toolbar (50px)
                const screenCenterX = canvasWidth / 2;
                const screenCenterY = canvasHeight / 2;

                // Convert to world coordinates
                const worldCenter = this.viewModel.viewport.screenToWorld(screenCenterX, screenCenterY);

                const inputData = new CreateNodeInputData(type, worldCenter.x, worldCenter.y);
                this.interactors.createNode.execute(inputData);

                // Get the created node
                const node = this.viewModel.graph.nodes[this.viewModel.graph.nodes.length - 1];
                this.viewModel.interaction.heldNode = node;
                this.viewModel.interaction.placingMode = type;
            }
        }
    }

    createEdge(fromId, toId, probability, reward) {
        if (this.interactors.createEdge) {
            const inputData = new CreateEdgeInputData(fromId, toId, probability, reward);
            this.interactors.createEdge.execute(inputData);
        }
    }

    deleteSelected() {
        if (!this.viewModel.selection.hasSelection()) {
            return;
        }

        const entity = this.viewModel.selection.getSelectedEntity();

        if (this.interactors.deleteNode) {
            let inputData;

            if (entity.type === 'state' || entity.type === 'action') {
                inputData = DeleteNodeInputData.forNode(entity.id);
            } else if (entity.getFromNode) { // Edge
                inputData = DeleteNodeInputData.forEdge(
                    entity.getFromNode().id,
                    entity.getToNode().id
                );
            } else if (entity.text !== undefined) { // TextLabel
                inputData = DeleteNodeInputData.forTextLabel(entity.id);
            }

            if (inputData) {
                this.interactors.deleteNode.execute(inputData);
            }
        }
    }

    undo() {
        if (this.interactors.undo) {
            this.interactors.undo.execute();
        }
    }

    redo() {
        if (this.interactors.redo) {
            this.interactors.redo.execute();
        }
    }

    setMode(mode) {
        if (this.interactors.setMode) {
            const inputData = new SetModeInputData(mode);
            this.interactors.setMode.execute(inputData);
        }
        this.viewModel.selection.clearSelection();
        this.viewModel.interaction.startNode = null;
    }

    zoomIn(centerX, centerY) {
        if (this.interactors.zoomIn) {
            const inputData = new ZoomInputData(
                centerX,
                centerY,
                this.viewModel.zoom,
                this.viewModel.panX,
                this.viewModel.panY
            );
            this.interactors.zoomIn.execute(inputData);
        }
    }

    zoomOut(centerX, centerY) {
        if (this.interactors.zoomOut) {
            const inputData = new ZoomInputData(
                centerX,
                centerY,
                this.viewModel.zoom,
                this.viewModel.panX,
                this.viewModel.panY
            );
            this.interactors.zoomOut.execute(inputData);
        }
    }

    importGraph(jsonString) {
        if (this.interactors.importGraph) {
            const inputData = new ImportGraphInputData(jsonString);
            this.interactors.importGraph.execute(inputData);
        }
    }

    exportGraph() {
        if (this.interactors.serializeGraph) {
            const inputData = new SerializeGraphInputData();
            this.interactors.serializeGraph.execute(inputData);
            // Get serialized data from presenter
            if (this.interactors.serializeGraph.presenter) {
                return this.interactors.serializeGraph.presenter.getSerializedData();
            }
        }
        return null;
    }

    exportToConsole() {
        const json = this.exportGraph();
        if (json) {
            console.log('Graph exported:');
            console.log(json);
        }
    }

    // ===== Private Helper Methods =====

    _finishPlacement() {
        this.viewModel.interaction.heldNode = null;
        this.viewModel.interaction.heldTextLabel = null;
        this.viewModel.interaction.placingMode = null;
    }

    _handleDoubleClick(node) {
        if (this.viewModel.mode === 'editor') {
            // Request rename
            if (this.interactors.renameNode) {
                const inputData = RenameNodeInputData.forRequest(node.id);
                this.interactors.renameNode.requestRename(inputData);
            }
        } else if (this.viewModel.mode === 'simulate') {
            // Set as start node and center camera
            this.viewModel.interaction.startNode = node;
            // Signal MainView to center on node
            this.viewModel.interaction.shouldCenterOnNode = true;
            this.viewModel.interaction.nodeToCenterOn = node;
        }
    }

    _handleTextLabelClick(label, x, y) {
        // Select and start dragging
        if (this.interactors.selectNode) {
            const inputData = SelectNodeInputData.forTextLabel(label.id);
            this.interactors.selectNode.select(inputData);
        }

        this.viewModel.interaction.draggingTextLabel = label;
        this.viewModel.interaction.dragStartX = x;
        this.viewModel.interaction.dragStartY = y;
        this.viewModel.interaction.dragDistance = 0;
    }

    _handleEdgeLabelClick(edge, x, y) {
        // Start dragging edge label (doesn't select the edge)
        this.viewModel.interaction.draggingEdgeLabel = edge;
        this.viewModel.interaction.dragStartX = x;
        this.viewModel.interaction.dragStartY = y;
        this.viewModel.interaction.dragStartLabelOffsetX = edge.labelOffset.x;
        this.viewModel.interaction.dragStartLabelOffsetY = edge.labelOffset.y;
        this.viewModel.interaction.dragDistance = 0;
    }

    _handleEdgeClick(edge) {
        // Select edge
        if (this.interactors.selectNode) {
            const inputData = SelectNodeInputData.forEdge(
                edge.getFromNode().id,
                edge.getToNode().id
            );
            this.interactors.selectNode.select(inputData);
        }
    }

    _handleNodeClick(node, x, y) {
        console.log('_handleNodeClick called:', node.name, 'ID:', node.id, 'type:', node.type, 'mode:', this.viewModel.mode);
        console.log('Node object:', node);

        // Check if clicking on edge of node (for resizing) in editor mode
        if (this.viewModel.mode === 'editor' &&
            GeometricHelper.isClickOnNodeEdge(node, x, y)) {
            this.viewModel.interaction.resizingNode = node;
            this.viewModel.interaction.resizeStartSize = node.getSize();
            this.viewModel.interaction.resizeStartDistance = node.distanceTo(x, y);
            console.log('Starting resize');
            return;
        }

        // Check for edge creation before dragging
        const selectedNode = this.viewModel.selection.selectedNode;
        if (selectedNode && selectedNode !== node && this.viewModel.mode === 'editor') {
            // Different node already selected - check if we can create an edge
            if (selectedNode.type !== node.type) {
                // Compatible types for edge creation
                this._handleNodeClickForEdge(node);
                return;
            }
        }

        // Select node
        if (this.interactors.selectNode) {
            console.log('Calling selectNode.select for node:', node.id);
            const inputData = SelectNodeInputData.forNode(node.id);
            this.interactors.selectNode.select(inputData);
            console.log('After select, selectedNode:', this.viewModel.selection.selectedNode);
        }

        // Start dragging (in editor mode)
        if (this.viewModel.mode === 'editor') {
            console.log('Starting drag for node:', node.name, 'with ID:', node.id);
            this.viewModel.interaction.startDrag(node, x, y);
            console.log('After startDrag, draggingNode:', this.viewModel.interaction.draggingNode ? this.viewModel.interaction.draggingNode.name : null);

            if (this.interactors.moveNode) {
                console.log('Creating MoveNodeInputData with node.id:', node.id);
                const inputData = MoveNodeInputData.forNodeStart(node.id);
                console.log('InputData created:', inputData);
                this.interactors.moveNode.startMove(inputData);
            }
        }
    }

    _handleCanvasClick() {
        // Clear all interaction states when clicking empty canvas
        this.viewModel.interaction.resizingNode = null;
        this.viewModel.interaction.draggingNode = null;
        this.viewModel.interaction.draggingTextLabel = null;
        this.viewModel.interaction.draggingEdgeLabel = null;

        // Clear selection
        if (this.interactors.selectNode) {
            const inputData = SelectNodeInputData.forClear();
            this.interactors.selectNode.clearSelection(inputData);
        }
    }

    _handleNodeClickForEdge(clickedNode) {
        // In simulate mode, don't create edges
        if (this.viewModel.mode === 'simulate') {
            return;
        }

        const selectedNode = this.viewModel.selection.selectedNode;

        if (!selectedNode) {
            // First node selected
            return;
        }

        if (selectedNode === clickedNode) {
            // Clicked same node - deselect
            if (this.interactors.selectNode) {
                const inputData = SelectNodeInputData.forClear();
                this.interactors.selectNode.clearSelection(inputData);
            }
            return;
        }

        // Check if nodes are different types
        if (selectedNode.type === clickedNode.type) {
            return; // Can't connect same types
        }

        // Signal edge creation needed
        this.viewModel.interaction.pendingEdgeFrom = selectedNode;
        this.viewModel.interaction.pendingEdgeTo = clickedNode;
        this.viewModel.interaction.edgeCreationRequested = true;
    }

    // ===== Image Management =====

    setNodeImage(nodeId, imageData) {
        if (this.interactors.setImage) {
            const inputData = new SetImageInputData(nodeId, imageData);
            this.interactors.setImage.execute(inputData);
        }
    }
}
