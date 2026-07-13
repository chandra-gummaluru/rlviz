// Controller for canvas user input and interaction
class CanvasController {
    constructor(viewModel, interactors) {
        this.viewModel = viewModel;
        this.interactors = interactors;
        this.copiedNodeData = null;
        this.lastClickedNodeForCopy = null;
        this.preferLastClickedNodeForCopy = false;
        // Mode-transition side effects (registered by main.js once all views exist), keyed by
        // mode/sub-view name: { onLeave, onEnter, onLeaveSubView, onEnterSubView }
        this.modeLifecycle = null;
    }

    registerModeLifecycle(hooks) {
        this.modeLifecycle = hooks;
    }

    // Policy's canvas is identical to Build's (fully editable - only the right panel differs),
    // so every structural-edit guard that used to allowlist 'build' alone now allowlists both.
    _isEditableMode() {
        return this.viewModel.mode === 'build' || this.viewModel.mode === 'policy';
    }

    // ===== Mouse Input Handling =====

    handleMousePress(screenX, screenY) {
        if (this.viewModel.interaction.mode === 'values') return;
        this._blurActiveTextInput();

        const world = this.viewModel.screenToWorld(screenX, screenY);
        const x = world.x;
        const y = world.y;

        // Handle node placement
        if (this.viewModel.interaction.placingMode) {
            this._finishPlacement();
            return;
        }

        // Find what was clicked
        const target = GeometricHelper.findEntityAtPosition(this.viewModel.graph, x, y);

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
            case 'nodeNameLabel':
                this._handleNodeNameLabelClick(target.entity, x, y);
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

    handleMouseMove(screenX, screenY) {
        if (this.viewModel.interaction.mode === 'values') return false;
        if (this.viewModel.interaction.isInteracting()) return false;

        const world = this.viewModel.screenToWorld(screenX, screenY);
        const entity = GeometricHelper.findEntityAtPosition(this.viewModel.graph, world.x, world.y);
        const interaction = this.viewModel.interaction;

        const prevNode = interaction.hoveredNode;
        const prevEdge = interaction.hoveredEdge;

        interaction.hoveredNode = entity.type === 'node' ? entity.entity : null;
        interaction.hoveredEdge = (entity.type === 'edge' || entity.type === 'edgeLabel') ? entity.entity : null;

        return interaction.hoveredNode !== prevNode || interaction.hoveredEdge !== prevEdge;
    }

    handleMouseDrag(screenX, screenY) {
        if (this.viewModel.interaction.mode === 'values') return;
        const world = this.viewModel.screenToWorld(screenX, screenY);
        const x = world.x;
        const y = world.y;

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

        // Handle text label resizing (font size) - label.y is the box's vertical center (see
        // TextLabel.contains()), so the corner's vertical offset from center is fontSize/2;
        // dragging the corner away from center grows the text, mirroring node resize's
        // "distance from center" behavior.
        if (this.viewModel.interaction.resizingTextLabel) {
            const newFontSize = Math.max(8, Math.min(72, 2 * Math.abs(y - this.viewModel.interaction.resizingTextLabel.y)));
            this.viewModel.interaction.resizingTextLabel.setFontSize(newFontSize);
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

        if (this.viewModel.interaction.draggingNodeNameLabel) {
            this.viewModel.interaction.updateDragDistance(x, y);
            this.viewModel.interaction.draggingNodeNameLabel.setNameLabelPosition(x, y);
            return;
        }

        // Handle node drag
        if (this.viewModel.interaction.draggingNode) {
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
        if (this.viewModel.interaction.mode === 'values') return;
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

        // Handle text label resize end
        if (this.viewModel.interaction.resizingTextLabel) {
            const label = this.viewModel.interaction.resizingTextLabel;
            const newFontSize = label.fontSize;

            if (newFontSize !== this.viewModel.interaction.resizeStartFontSize) {
                if (this.interactors.resizeNode) {
                    const inputData = ResizeNodeInputData.forTextLabel(
                        label.id,
                        this.viewModel.interaction.resizeStartFontSize,
                        newFontSize
                    );
                    this.interactors.resizeNode.resizeNode(inputData);
                }
            }

            this.viewModel.interaction.resizingTextLabel = null;
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

        if (this.viewModel.interaction.draggingNodeNameLabel) {
            this.viewModel.interaction.draggingNodeNameLabel = null;
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
        if (this.viewModel.interaction.mode === 'values') return;
        // Don't intercept keys while a text input has focus
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            return true;
        }

        // Delete key
        if (key === 'Delete' || key === 'Backspace') {
            this.deleteSelected();
            return true;
        }

        // Undo
        if ((key === 'z' || key === 'Z') && this._isShortcutModifierDown()) {
            if (keyIsDown(SHIFT)) {
                this.redo();
            } else {
                this.undo();
            }
            return false; // Prevent default
        }

        // Copy selected node
        if ((key === 'c' || key === 'C') && this._isShortcutModifierDown()) {
            this.copySelectedNode();
            return false;
        }

        // Paste copied node
        if ((key === 'v' || key === 'V') && this._isShortcutModifierDown()) {
            this.pasteCopiedNode();
            return false;
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
                const canvasHeight = window.innerHeight - 40; // top bar height
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
                this.viewModel.interaction.clearEditorFocus();
            }
        }
    }

    // Drops whatever node/text label is currently being placed at its current position and
    // returns to the select tool, without creating anything new. Used by the floating tool
    // palette's Select button; equivalent to clicking the canvas mid-placement.
    cancelPlacement() {
        this._finishPlacement();
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

        if (this.viewModel.selection.selectedNodeNameLabel) {
            this.viewModel.selection.clearSelection();
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
                this.viewModel.interaction.clearEditorFocus();
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

    copySelectedNode() {
        const node = this._getNodeForCopy();
        if (!node || (node.type !== 'state' && node.type !== 'action')) {
            return false;
        }

        this.copiedNodeData = {
            type: node.type,
            name: node.name,
            size: node.size,
            image: node.image,
            nameLabelOffset: node.nameLabelOffset ? {
                x: node.nameLabelOffset.x,
                y: node.nameLabelOffset.y
            } : null,
            x: node.x,
            y: node.y,
            pasteCount: 0
        };
        return true;
    }

    pasteCopiedNode() {
        if (!this.copiedNodeData ||
            !this._isEditableMode() ||
            this.viewModel.interaction.isInteracting()) {
            return false;
        }

        const data = this.copiedNodeData;
        data.pasteCount += 1;

        const offset = 36 * data.pasteCount;
        const node = data.type === 'state'
            ? new StateNode(data.name, data.x + offset, data.y + offset, data.size)
            : new ActionNode(data.name, data.x + offset, data.y + offset, data.size);

        node.id = this._nextNodeId();
        if (data.image !== undefined && data.image !== null) {
            node.image = data.image;
        }
        if (data.nameLabelOffset) {
            node.nameLabelOffset = {
                x: data.nameLabelOffset.x,
                y: data.nameLabelOffset.y
            };
        }

        const command = new AddNodeCommand(this.viewModel.graph, node, this.viewModel.selection);
        this._executeCommand(command);
        this.lastClickedNodeForCopy = node;
        this.preferLastClickedNodeForCopy = false;
        this.viewModel.interaction.clearEditorFocus();

        return true;
    }

    setMode(mode) {
        const prevMode = this.viewModel.mode;
        const isRealTransition = prevMode !== mode;

        if (isRealTransition && this.modeLifecycle?.onLeave?.[prevMode]) {
            this.modeLifecycle.onLeave[prevMode](prevMode, mode);
        }

        if (this.interactors.setMode) {
            const inputData = new SetModeInputData(mode);
            this.interactors.setMode.execute(inputData);
        }
        this.viewModel.selection.clearSelection();
        this.viewModel.interaction.clearEditorFocus();
        this.preferLastClickedNodeForCopy = false;

        if (isRealTransition && this.modeLifecycle?.onEnter?.[mode]) {
            this.modeLifecycle.onEnter[mode](mode, prevMode);
        }
    }

    // Switches the sub-view shown within Values mode ('mc' | 'vi'). Does not itself change the
    // top-level mode — callers should call setMode('values') first if needed.
    setValuesSubView(subView) {
        const prevSubView = this.viewModel.valuesSubView;
        const isRealTransition = prevSubView !== subView;

        if (isRealTransition && this.modeLifecycle?.onLeaveSubView?.[prevSubView]) {
            this.modeLifecycle.onLeaveSubView[prevSubView](prevSubView, subView);
        }

        if (this.interactors.setValuesSubView) {
            const inputData = new SetValuesSubViewInputData(subView);
            this.interactors.setValuesSubView.execute(inputData);
        }

        if (isRealTransition && this.modeLifecycle?.onEnterSubView?.[subView]) {
            this.modeLifecycle.onEnterSubView[subView](subView, prevSubView);
        }
    }

    // Toggles the VI pane between "Value Iteration" (P known) and "Learning Iteration"
    // (P unknown) presentation. No domain/algorithm change - see setManualQOverride for the
    // accompanying editable-Q-table affordance.
    setModelKnown(known) {
        this.viewModel.modelKnown = !!known;
    }

    // Toggles the second method-matrix axis: 'full' or 'partial' observability. Same
    // presentation-tier pattern as setModelKnown - no domain change here. Consumption (dashed
    // partially-observable nodes, selecting Belief Iteration / PO Q-Learning) is a later phase.
    setObservability(value) {
        this.viewModel.observability = value === 'partial' ? 'partial' : 'full';
    }

    // Presentation-layer manual override for a displayed Q-value, used only while
    // modelKnown === false (editable Q-table). Bypasses the Command/undo pattern, matching the
    // existing setTransitionProbability/setTransitionReward precedent for lightweight edits.
    setManualQOverride(stateId, actionId, value) {
        const viState = this.viewModel.valueIterationState;
        if (!viState) return;
        if (!isFinite(value)) return;
        viState.manualOverrides[`${stateId}:${actionId}`] = value;
    }

    // ===== Q-learning (Learning Iteration, unknown:full quadrant) =====
    // Thin methods mirroring setManualQOverride's style: build InputData, call the interactor,
    // no Command/undo (presentation-tier session state). qLearningState lives on the viewModel.

    // Runs `episodeCount` sampled Q-learning episodes (default 10 for "Run learning"). Step
    // reuses the same interactor with episodeCount 1.
    runQLearning(episodeCount = 10) {
        if (!this.interactors.runQL) return;
        const startNode = this.viewModel.startNode;
        if (!startNode) return;
        const gamma = this.viewModel.qLearningState ? this.viewModel.qLearningState.gamma : 0.9;
        this.interactors.runQL.execute(new RunQLInputData(startNode.id, gamma, episodeCount));
    }

    stepQLearning() {
        this.runQLearning(1);
    }

    resetQLearning() {
        if (!this.interactors.qlReset) return;
        this.interactors.qlReset.execute(new QLResetInputData());
    }

    // Switches exploration algorithm ('epsilonGreedy' | 'ucb' | 'optimistic') and, optionally,
    // its single hyperparameter. Does NOT reset learned Q/N (see SetQLAlgorithmInteractor).
    setQLAlgorithm(algorithm, param) {
        if (!this.interactors.setQLAlgorithm) return;
        this.interactors.setQLAlgorithm.execute(new SetQLAlgorithmInputData(algorithm, param));
    }

    // 'graph' | 'tree' canvas view for the Learning Iteration quadrant (presentation-only flag).
    setLearningIterationCanvasView(view) {
        this.viewModel.learningIterationCanvasView = view === 'tree' ? 'tree' : 'graph';
    }

    setBuildCanvasView(view) {
        this.viewModel.buildCanvasView = view === 'tree' ? 'tree' : 'graph';
        // A lingering Graph-view selection would otherwise outrank the new tree edge-hover in
        // RightPanel.updateContent()'s precedence (selectedNode > selectedEdge > hoveredNode >
        // hoveredEdge > mode default), silently hiding this feature. Mirrors setStartNode()
        // clearing treeExpanded for the same category of reason - a view transition invalidating
        // state that belonged to the old context.
        if (view === 'tree') {
            this.viewModel.selection.clearSelection();
        }
    }

    // Toggles one tree position's expansion (expand if collapsed, collapse if expanded).
    toggleTreeNodeExpanded(pathId) {
        const expanded = this.viewModel.treeExpanded;
        if (expanded.has(pathId)) {
            expanded.delete(pathId);
        } else {
            expanded.add(pathId);
        }
    }

    // Sets (or, when actionId is null/undefined, clears back to "random") the policy action
    // for a state. Shared by Build's Policy π section, Simulate's trace generation, and Monte
    // Carlo's policy snapshot - simulationState.policy remains the single source of truth.
    setPolicyAction(stateId, actionId) {
        this.viewModel.simulationState.setPolicyAction(stateId, actionId);
    }

    // Seeds a state's weighted-random policy with equal starting weights across actionIds -
    // called once when a state is first switched to Random mode in Policy mode's inspector.
    initPolicyWeightsUniform(stateId, actionIds) {
        this.viewModel.simulationState.initPolicyWeightsUniform(stateId, actionIds);
    }

    // Sets one action's raw weight within a state's weighted-random policy (Policy mode's
    // per-action sliders) - see SimulationState.setPolicyWeight for normalization semantics.
    setPolicyWeight(stateId, actionId, value) {
        this.viewModel.simulationState.setPolicyWeight(stateId, actionId, value);
    }

    /**
     * Check for unnormalized action nodes. Returns array of names, or empty if all OK.
     */
    getUnnormalizedActionNames() {
        const unnormalized = this.viewModel.graph.getUnnormalizedActionNodes();
        return unnormalized.map(n => n.name);
    }

    /**
     * Renormalize all action node probabilities.
     */
    renormalizeProbabilities() {
        if (this.interactors.renormalizeProbabilities) {
            this.interactors.renormalizeProbabilities.execute(new RenormalizeProbabilitiesInputData());
        }
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

    exportGraph(includePositions = false) {
        if (this.interactors.serializeGraph) {
            const inputData = new SerializeGraphInputData(includePositions);
            this.interactors.serializeGraph.execute(inputData);
            // Get serialized data from presenter
            const presenter = this.interactors.serializeGraph.presenter;
            if (presenter) {
                const data = presenter.getSerializedData();
                if (data) {
                    return data;
                }
                console.error('Export failed: serialized data is null');
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

    setStartNode(node) {
        this.viewModel.startNode = node;
        // Re-rooting invalidates all prior tree-position expansion state (a pathId like
        // "s0.a0.1" is meaningless once the root itself changes).
        this.viewModel.treeExpanded.clear();
    }

    // ===== Private Helper Methods =====

    _finishPlacement() {
        this.viewModel.interaction.heldNode = null;
        this.viewModel.interaction.heldTextLabel = null;
        this.viewModel.interaction.placingMode = null;
    }

    _handleDoubleClick(node) {
        if (this._isEditableMode()) {
            this.viewModel.interaction.setEditorFocus(node, this.viewModel.graph);
        }
    }

    _handleTextLabelClick(label, x, y) {
        this.preferLastClickedNodeForCopy = false;

        // Select (works in any mode reaching here) and start dragging/resizing (Build/Policy
        // only - structural edit; Values' canvas never dispatches here at all).
        if (this.interactors.selectNode) {
            const inputData = SelectNodeInputData.forTextLabel(label.id);
            this.interactors.selectNode.select(inputData);
        }

        if (!this._isEditableMode()) return;

        // Clicking the bottom-right corner resizes (font size) instead of dragging - mirrors
        // _handleNodeClick's isClickOnNodeEdge check.
        if (GeometricHelper.isClickOnTextLabelCorner(label, x, y)) {
            this.viewModel.interaction.resizingTextLabel = label;
            this.viewModel.interaction.resizeStartFontSize = label.fontSize;
            return;
        }

        this.viewModel.interaction.draggingTextLabel = label;
        this.viewModel.interaction.dragStartX = x;
        this.viewModel.interaction.dragStartY = y;
        this.viewModel.interaction.dragDistance = 0;
    }

    _handleNodeNameLabelClick(node, x, y) {
        this.preferLastClickedNodeForCopy = false;
        this.viewModel.selection.selectedNode = null;
        this.viewModel.selection.selectedEdge = null;
        this.viewModel.selection.selectedTextLabel = null;
        this.viewModel.selection.selectedNodeNameLabel = node;

        if (this._isEditableMode()) {
            this.viewModel.interaction.draggingNodeNameLabel = node;
            this.viewModel.interaction.dragStartX = x;
            this.viewModel.interaction.dragStartY = y;
            const pos = node.getNameLabelPosition();
            this.viewModel.interaction.dragStartNameLabelX = pos.x;
            this.viewModel.interaction.dragStartNameLabelY = pos.y;
            this.viewModel.interaction.dragDistance = 0;
        }
    }

    _handleEdgeLabelClick(edge, x, y) {
        this.preferLastClickedNodeForCopy = false;

        // Start dragging edge label (doesn't select the edge) - Build/Policy only, structural edit.
        if (!this._isEditableMode()) return;

        this.viewModel.interaction.draggingEdgeLabel = edge;
        this.viewModel.interaction.dragStartX = x;
        this.viewModel.interaction.dragStartY = y;
        this.viewModel.interaction.dragStartLabelOffsetX = edge.labelOffset.x;
        this.viewModel.interaction.dragStartLabelOffsetY = edge.labelOffset.y;
        this.viewModel.interaction.dragDistance = 0;
    }

    _handleEdgeClick(edge) {
        this.preferLastClickedNodeForCopy = false;

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
        this.lastClickedNodeForCopy = node;
        this.preferLastClickedNodeForCopy = true;

        // Check if clicking on edge of node (for resizing) in build/policy mode
        if (this._isEditableMode() &&
            GeometricHelper.isClickOnNodeEdge(node, x, y)) {
            this.viewModel.interaction.resizingNode = node;
            this.viewModel.interaction.resizeStartSize = node.getSize();
            this.viewModel.interaction.resizeStartDistance = node.distanceTo(x, y);
            return;
        }

        // Check for edge creation before dragging
        const selectedNode = this.viewModel.selection.selectedNode;
        if (selectedNode && selectedNode !== node && this._isEditableMode()) {
            // Different node already selected - check if we can create an edge
            if (selectedNode.type !== node.type) {
                // Compatible types for edge creation
                this._handleNodeClickForEdge(node);
                return;
            }
        }

        // Select node
        if (this.interactors.selectNode) {
            const inputData = SelectNodeInputData.forNode(node.id);
            this.interactors.selectNode.select(inputData);
        }
        this.preferLastClickedNodeForCopy = false;

        // Start dragging (in build/policy mode)
        if (this._isEditableMode()) {
            this.viewModel.interaction.startDrag(node, x, y);

            if (this.interactors.moveNode) {
                const inputData = MoveNodeInputData.forNodeStart(node.id);
                this.interactors.moveNode.startMove(inputData);
            }
        }
    }

    _handleCanvasClick() {
        this.preferLastClickedNodeForCopy = false;

        // Clear all interaction states when clicking empty canvas
        this.viewModel.interaction.clearEditorFocus();
        this.viewModel.interaction.resizingNode = null;
        this.viewModel.interaction.resizingTextLabel = null;
        this.viewModel.interaction.draggingNode = null;
        this.viewModel.interaction.draggingTextLabel = null;
        this.viewModel.interaction.draggingNodeNameLabel = null;
        this.viewModel.interaction.draggingEdgeLabel = null;

        // Clear selection
        if (this.interactors.selectNode) {
            const inputData = SelectNodeInputData.forClear();
            this.interactors.selectNode.clearSelection(inputData);
        }
    }

    _handleNodeClickForEdge(clickedNode) {
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

    // ===== Transition Editing =====

    setTransitionProbability(actionNodeId, nextStateId, probability) {
        const actionNode = this.viewModel.graph.getNodeById(actionNodeId);
        if (!actionNode) return;
        const transition = actionNode.sas.find(t => t.nextState === nextStateId);
        if (transition) {
            transition.probability = probability;
        }
    }

    setTransitionReward(actionNodeId, nextStateId, reward) {
        const actionNode = this.viewModel.graph.getNodeById(actionNodeId);
        if (!actionNode) return;
        const transition = actionNode.sas.find(t => t.nextState === nextStateId);
        if (transition) {
            transition.reward = reward;
        }
    }

    // ===== Spinning Arrow Animation =====

    toggleSpinningArrow(enabled) {
        if (this.interactors.setSpinningArrow) {
            const duration = this.viewModel.simulationState.spinningArrowDuration;
            const inputData = new SetSpinningArrowInputData(enabled, duration);
            this.interactors.setSpinningArrow.execute(inputData);
        }
    }

    setSpinningArrowDuration(duration) {
        if (this.interactors.setSpinningArrow) {
            const enabled = this.viewModel.simulationState.spinningArrowEnabled;
            const inputData = new SetSpinningArrowInputData(enabled, duration);
            this.interactors.setSpinningArrow.execute(inputData);
        }
    }

    clearSelection() {
        if (this.interactors.selectNode) {
            this.interactors.selectNode.clearSelection(SelectNodeInputData.forClear());
        }
    }

    createTextLabel(text, x = 0, y = 0) {
        if (this.interactors.createTextLabel) {
            this.interactors.createTextLabel.execute(CreateTextLabelInputData.forExecution(text, x, y, 16));
        }
    }

    renameNode(nodeId, oldName, newName) {
        if (this.interactors.renameNode) {
            this.interactors.renameNode.executeRename(RenameNodeInputData.forExecution(nodeId, oldName, newName));
        }
    }

    _nextNodeId() {
        return this.viewModel.graph.nodes.length > 0
            ? Math.max(...this.viewModel.graph.nodes.map(n => n.id)) + 1
            : 0;
    }

    _getNodeForCopy() {
        const lastClicked = this.lastClickedNodeForCopy;
        if (this.preferLastClickedNodeForCopy &&
            lastClicked &&
            this.viewModel.graph.getNodeById(lastClicked.id) === lastClicked) {
            return lastClicked;
        }
        return this.viewModel.selection.selectedNode;
    }

    _isShortcutModifierDown() {
        return keyIsDown(CONTROL) || keyIsDown(91) || keyIsDown(93);
    }

    _blurActiveTextInput() {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            active.blur();
        }
    }

    _executeCommand(command) {
        const commandHistory = this.interactors.undo?.commandHistory || this.interactors.redo?.commandHistory;
        if (commandHistory) {
            commandHistory.execute(command);
            this.viewModel.updateUndoRedoState(commandHistory.canUndo(), commandHistory.canRedo());
            this.viewModel.undoDescription = commandHistory.getUndoDescription() || '';
            this.viewModel.redoDescription = commandHistory.getRedoDescription() || '';
        } else {
            command.execute();
        }
    }

}
