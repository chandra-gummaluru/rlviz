# Refactoring Plan: CanvasViewModel → Controller + Presenters

## Executive Summary

**Goal:** Refactor `CanvasViewModel` (871 lines) into a clean **Model-View-Controller-Presenter (MVCP)** architecture that adheres to Clean Architecture principles.

**Current Problem:** CanvasViewModel violates Single Responsibility Principle by:
- Acting as both Controller AND Presenter
- Managing state for multiple concerns (selection, drag, resize, zoom, pan, simulation)
- Containing business logic that belongs in Use Cases
- Directly manipulating Domain entities

**Target Architecture:**
```
View (MainView, SideBar)
  ↓ (user events)
Controller (CanvasController)
  ↓ (delegates to)
Interactors (Use Cases)
  ↓ (calls back)
Presenters (one per use case)
  ↓ (updates)
ViewModels (read-only state)
  ↑ (reads)
View (renders state)
```

---

## Current State Analysis

### CanvasViewModel Responsibilities (Too Many!)

| Responsibility | Lines | Should Be In |
|---------------|-------|--------------|
| State management (selection, drag, pan, zoom) | 27-78 | **ViewModel** |
| Input handling (mouse, keyboard) | 138-440 | **Controller** |
| Business logic delegation | 442-549 | **Controller** |
| Presentation logic (colors, visibility) | 563-668 | **Presenters** |
| Geometric calculations (edge detection) | 224-345 | **View Helper** |
| Command management | 496-519, 794-841 | **Use Case Interactors** |
| Viewport transformations | 674-782 | **ViewModel** |

### Use Cases Needing Presenters

Currently, some use cases have presenters, but CanvasViewModel is doing presenter work for many operations:

| Use Case | Has Presenter? | ViewModel Does Presentation? |
|----------|----------------|------------------------------|
| CreateNode | ✅ Yes | No |
| CreateEdge | ✅ Yes | No |
| NodeInteraction | ✅ Yes | No |
| SerializeGraph | ✅ Yes | No |
| Undo/Redo | ✅ Yes | No |
| SetMode | ✅ Yes | No |
| Zoom | ✅ Yes | No |
| ImportGraph | ✅ Yes | No |
| ResizeNode | ✅ Yes | No |
| Simulation | ✅ Yes | No |
| **DeleteNode** | ❌ **NO** | ✅ **YES** (lines 496-519) |
| **MoveNode** | ❌ **NO** | ✅ **YES** (lines 794-809) |
| **RenameNode** | ❌ **NO** | ✅ **YES** (lines 155-158) |
| **SelectNode** | ❌ **NO** | ✅ **YES** (getNodeColor) |
| **CreateTextLabel** | ❌ **NO** | ✅ **YES** (lines 96-105) |
| **GetNodeColor** | ❌ **NO** | ✅ **YES** (lines 563-581) |
| **GetEdgeColor** | ❌ **NO** | ✅ **YES** (lines 641-668) |

---

## Target Architecture

### New Structure

```
src/main/
├── domain/                      # No changes needed
├── use_case/                    # Add missing use cases
│   ├── deleteNode/             # NEW
│   ├── moveNode/               # NEW (extract from NodeInteraction?)
│   ├── renameNode/             # NEW
│   ├── selectNode/             # NEW
│   ├── createTextLabel/        # NEW
│   └── [existing use cases]/
├── adapter/
│   ├── controller/             # NEW LAYER
│   │   └── CanvasController.js
│   └── viewmodel/              # REFACTORED
│       ├── CanvasViewModel.js          # State only
│       ├── NodeViewModel.js            # Node presentation state
│       ├── EdgeViewModel.js            # Edge presentation state
│       ├── ViewportViewModel.js        # Zoom/pan state
│       └── SelectionViewModel.js       # Selection state
└── view/
    ├── helpers/                # NEW
    │   └── GeometricHelper.js  # Edge detection, collision
    └── [existing views]/
```

---

## Phase 1: Extract Controller Layer

### 1.1 Create CanvasController

**File:** `src/main/adapter/controller/CanvasController.js`

**Responsibilities:**
- Receive user input events from View
- Translate events to Use Case input data
- Delegate to appropriate Interactors
- NO state management (reads from ViewModel)
- NO presentation logic (Presenters handle that)

**Interface:**
```javascript
class CanvasController {
    constructor(viewModel, interactors) {
        this.viewModel = viewModel;
        this.interactors = interactors; // All use case interactors
    }

    // Input handlers (called by View)
    handleMousePress(screenX, screenY) { }
    handleMouseDrag(screenX, screenY) { }
    handleMouseRelease(screenX, screenY) { }
    handleKeyPress(key) { }
    handleMouseWheel(delta, screenX, screenY) { }

    // User actions (called by View/Buttons)
    startNodePlacement(type) { }
    deleteSelected() { }
    createEdge(fromId, toId, probability, reward) { }
    importGraph(jsonString) { }
    exportGraph() { }
    undo() { }
    redo() { }
    setMode(mode) { }
    zoomIn(centerX, centerY) { }
    zoomOut(centerX, centerY) { }

    // Helper methods (private)
    _screenToWorld(screenX, screenY) { }
    _determineClickTarget(worldX, worldY) { }
    _handleEditorModeClick(target, worldX, worldY) { }
    _handleSimulateModeClick(target) { }
}
```

### 1.2 Implementation Strategy

**Step 1: Extract Input Handling**

Move from CanvasViewModel → CanvasController:
- `handleMousePress()` (lines 138-218)
- `handleMouseDrag()` (lines 348-372)
- `handleMouseRelease()` (lines 374-440)

**Before (CanvasViewModel):**
```javascript
handleMousePress(x, y) {
    // 80+ lines of logic mixing:
    // - Hit detection
    // - State updates
    // - Mode-specific behavior
    // Returns complex object
}
```

**After (CanvasController):**
```javascript
handleMousePress(screenX, screenY) {
    const world = this._screenToWorld(screenX, screenY);
    const target = this._determineClickTarget(world.x, world.y);

    if (this.viewModel.mode === 'editor') {
        return this._handleEditorModeClick(target, world.x, world.y);
    } else {
        return this._handleSimulateModeClick(target);
    }
}

_handleEditorModeClick(target, worldX, worldY) {
    if (target.type === 'node' && this._isDoubleClick(target.node)) {
        // Delegate to rename use case
        this.interactors.renameNode.requestRename(target.node.id);
        return;
    }

    if (target.type === 'node' && this._isResizeGesture(target.node, worldX, worldY)) {
        // Delegate to resize use case
        this.interactors.resizeNode.startResize(target.node.id, worldX, worldY);
        return;
    }

    if (target.type === 'node') {
        // Delegate to selection use case
        this.interactors.selectNode.select(target.node.id);
        return;
    }

    // ... other cases
}
```

**Step 2: Extract Action Methods**

Move from CanvasViewModel → CanvasController:
- `deleteSelected()` (lines 496-519) → Use DeleteNode interactor
- `startNodePlacement()` (lines 95-121) → Use CreateNode/CreateTextLabel interactors
- `createEdge()` (lines 442-453) → Already delegates, just move
- `importGraph()` (lines 521-537) → Already delegates, just move
- `serializeGraph()` (lines 539-549) → Already delegates, just move

---

## Phase 2: Create Missing Use Cases & Presenters

### 2.1 DeleteNode Use Case

**Files to Create:**
```
src/main/use_case/deleteNode/
├── deleteNodeInputBoundary.js
├── deleteNodeInputData.js
├── deleteNodeInteractor.js
├── deleteNodeOutputBoundary.js
└── deleteNodePresenter.js
```

**DeleteNodeInteractor:**
```javascript
class DeleteNodeInteractor {
    constructor(graph, commandHistory, presenter) {
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    execute(inputData) {
        const entity = this._findEntity(inputData);

        if (!entity) {
            this.presenter.presentError('Entity not found');
            return;
        }

        const command = this._createDeleteCommand(entity);
        this.commandHistory.execute(command);

        this.presenter.presentDeleted(entity);
    }

    _findEntity(inputData) {
        if (inputData.nodeId) {
            return this.graph.getNodeById(inputData.nodeId);
        }
        if (inputData.edgeId) {
            return this.graph.edges.find(e => this._edgeMatches(e, inputData));
        }
        if (inputData.textLabelId) {
            return this.graph.getTextLabelById(inputData.textLabelId);
        }
        return null;
    }

    _createDeleteCommand(entity) {
        if (entity.type === 'state' || entity.type === 'action') {
            return new DeleteNodeCommand(this.graph, entity);
        }
        if (entity.getFromNode) { // It's an edge
            return new DeleteEdgeCommand(this.graph, entity);
        }
        if (entity.text !== undefined) { // It's a text label
            return new DeleteTextLabelCommand(this.graph, entity);
        }
        throw new Error('Unknown entity type');
    }
}
```

**DeleteNodePresenter:**
```javascript
class DeleteNodePresenter extends DeleteNodeOutputBoundary {
    constructor(selectionViewModel) {
        super();
        this.selectionViewModel = selectionViewModel;
    }

    presentDeleted(entity) {
        // Clear selection since deleted entity was selected
        this.selectionViewModel.clearSelection();
        this.selectionViewModel.lastDeletedType = this._getEntityType(entity);
    }

    presentError(message) {
        this.selectionViewModel.errorMessage = message;
    }

    _getEntityType(entity) {
        if (entity.type) return entity.type; // node
        if (entity.getFromNode) return 'edge';
        if (entity.text !== undefined) return 'textLabel';
        return 'unknown';
    }
}
```

### 2.2 MoveNode Use Case

**Should we create a new MoveNode use case or extend NodeInteraction?**

**Decision:** Create separate **MoveNodeInteractor** because:
- NodeInteraction currently handles "finding" nodes
- Moving is a distinct action with undo/redo
- Clear separation of concerns

**Files to Create:**
```
src/main/use_case/moveNode/
├── moveNodeInputBoundary.js
├── moveNodeInputData.js
├── moveNodeInteractor.js
├── moveNodeOutputBoundary.js
└── moveNodePresenter.js
```

**MoveNodeInteractor:**
```javascript
class MoveNodeInteractor {
    constructor(graph, commandHistory, presenter) {
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    startMove(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);
        if (!node) {
            this.presenter.presentError('Node not found');
            return;
        }

        // Store starting position for undo
        this.presenter.presentMoveStarted(node, node.x, node.y);
    }

    updateMove(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);
        if (!node) return;

        // Update position (no command yet - live update)
        node.setPosition(inputData.newX, inputData.newY);
        this.presenter.presentMoveUpdated(node);
    }

    finishMove(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);
        if (!node) return;

        // Only create command if position actually changed
        if (inputData.startX !== inputData.endX || inputData.startY !== inputData.endY) {
            const command = new MoveNodeCommand(
                node,
                inputData.startX,
                inputData.startY,
                inputData.endX,
                inputData.endY
            );
            this.commandHistory.execute(command);
        }

        this.presenter.presentMoveFinished(node);
    }

    cancelMove(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);
        if (!node) return;

        // Reset to start position
        node.setPosition(inputData.startX, inputData.startY);
        this.presenter.presentMoveCancelled(node);
    }
}
```

### 2.3 RenameNode Use Case

**Files to Create:**
```
src/main/use_case/renameNode/
├── renameNodeInputBoundary.js
├── renameNodeInputData.js
├── renameNodeInteractor.js
├── renameNodeOutputBoundary.js
└── renameNodePresenter.js
```

**RenameNodeInteractor:**
```javascript
class RenameNodeInteractor {
    constructor(graph, commandHistory, presenter) {
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    requestRename(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);
        if (!node) {
            this.presenter.presentError('Node not found');
            return;
        }

        // Request user input (View will handle prompt)
        this.presenter.presentRenameRequested(node, node.getName());
    }

    executeRename(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);
        if (!node) {
            this.presenter.presentError('Node not found');
            return;
        }

        // Business rule: validate name
        if (!inputData.newName || inputData.newName.trim() === '') {
            this.presenter.presentError('Name cannot be empty');
            return;
        }

        const oldName = node.getName();
        const command = new RenameNodeCommand(node, oldName, inputData.newName);
        this.commandHistory.execute(command);

        this.presenter.presentRenamed(node);
    }
}
```

**RenameNodePresenter:**
```javascript
class RenameNodePresenter extends RenameNodeOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
    }

    presentRenameRequested(node, currentName) {
        // Signal to View that rename is needed
        this.viewModel.pendingRenameNodeId = node.id;
        this.viewModel.pendingRenameCurrentName = currentName;
        this.viewModel.renameRequested = true;
    }

    presentRenamed(node) {
        // Clear pending state
        this.viewModel.pendingRenameNodeId = null;
        this.viewModel.pendingRenameCurrentName = null;
        this.viewModel.renameRequested = false;
    }

    presentError(message) {
        this.viewModel.errorMessage = message;
    }
}
```

### 2.4 SelectNode Use Case

**Files to Create:**
```
src/main/use_case/selectNode/
├── selectNodeInputBoundary.js
├── selectNodeInputData.js
├── selectNodeInteractor.js
├── selectNodeOutputBoundary.js
└── selectNodePresenter.js
```

**SelectNodeInteractor:**
```javascript
class SelectNodeInteractor {
    constructor(graph, presenter) {
        this.graph = graph;
        this.presenter = presenter;
    }

    select(inputData) {
        const entity = this._findEntity(inputData);

        if (!entity) {
            this.presenter.presentSelectionCleared();
            return;
        }

        this.presenter.presentSelected(entity);
    }

    clearSelection(inputData) {
        this.presenter.presentSelectionCleared();
    }

    _findEntity(inputData) {
        if (inputData.nodeId) {
            return this.graph.getNodeById(inputData.nodeId);
        }
        if (inputData.edgeFromId && inputData.edgeToId) {
            return this.graph.edges.find(e =>
                e.getFromNode().id === inputData.edgeFromId &&
                e.getToNode().id === inputData.edgeToId
            );
        }
        if (inputData.textLabelId) {
            return this.graph.getTextLabelById(inputData.textLabelId);
        }
        return null;
    }
}
```

**SelectNodePresenter:**
```javascript
class SelectNodePresenter extends SelectNodeOutputBoundary {
    constructor(selectionViewModel) {
        super();
        this.selectionViewModel = selectionViewModel;
    }

    presentSelected(entity) {
        this.selectionViewModel.selectedNode = null;
        this.selectionViewModel.selectedEdge = null;
        this.selectionViewModel.selectedTextLabel = null;

        if (entity.type === 'state' || entity.type === 'action') {
            this.selectionViewModel.selectedNode = entity;
        } else if (entity.getFromNode) { // Edge
            this.selectionViewModel.selectedEdge = entity;
        } else if (entity.text !== undefined) { // TextLabel
            this.selectionViewModel.selectedTextLabel = entity;
        }
    }

    presentSelectionCleared() {
        this.selectionViewModel.selectedNode = null;
        this.selectionViewModel.selectedEdge = null;
        this.selectionViewModel.selectedTextLabel = null;
    }
}
```

### 2.5 CreateTextLabel Use Case

**Files to Create:**
```
src/main/use_case/createTextLabel/
├── createTextLabelInputBoundary.js
├── createTextLabelInputData.js
├── createTextLabelInteractor.js
├── createTextLabelOutputBoundary.js
└── createTextLabelPresenter.js
```

**CreateTextLabelInteractor:**
```javascript
class CreateTextLabelInteractor {
    constructor(graph, commandHistory, presenter) {
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    requestCreate(inputData) {
        // Request text input from user (View handles prompt)
        this.presenter.presentTextRequested();
    }

    execute(inputData) {
        // Validate text
        if (!inputData.text || inputData.text.trim() === '') {
            this.presenter.presentError('Text cannot be empty');
            return;
        }

        // Business rule: default font size
        const fontSize = inputData.fontSize || 16;

        const label = new TextLabel(
            inputData.text,
            inputData.x,
            inputData.y,
            fontSize
        );

        const command = new AddTextLabelCommand(this.graph, label);
        this.commandHistory.execute(command);

        this.presenter.presentTextLabelCreated(label);
    }
}
```

---

## Phase 3: Split ViewModel into Focused ViewModels

### 3.1 Create Focused ViewModels

Current CanvasViewModel has too many concerns. Split into:

#### SelectionViewModel
```javascript
class SelectionViewModel {
    constructor() {
        this.selectedNode = null;
        this.selectedEdge = null;
        this.selectedTextLabel = null;
        this.errorMessage = null;
        this.lastDeletedType = null;
    }

    clearSelection() {
        this.selectedNode = null;
        this.selectedEdge = null;
        this.selectedTextLabel = null;
    }

    hasSelection() {
        return this.selectedNode !== null ||
               this.selectedEdge !== null ||
               this.selectedTextLabel !== null;
    }

    getSelectedEntity() {
        return this.selectedNode || this.selectedEdge || this.selectedTextLabel;
    }
}
```

#### ViewportViewModel
```javascript
class ViewportViewModel {
    constructor() {
        this.zoom = 1.0;
        this.minZoom = 0.1;
        this.maxZoom = 5.0;
        this.panX = 0;
        this.panY = 0;
    }

    setZoom(newZoom, centerX, centerY) {
        const oldZoom = this.zoom;
        this.zoom = Math.max(this.minZoom, Math.min(newZoom, this.maxZoom));

        if (centerX !== undefined && centerY !== undefined) {
            this.panX -= (centerX - this.panX) * (this.zoom / oldZoom - 1);
            this.panY -= (centerY - this.panY) * (this.zoom / oldZoom - 1);
        }
    }

    setPan(x, y) {
        this.panX = x;
        this.panY = y;
    }

    reset() {
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
    }

    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.panX) / this.zoom,
            y: (screenY - this.panY) / this.zoom
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.zoom + this.panX,
            y: worldY * this.zoom + this.panY
        };
    }
}
```

#### NodeViewModel
```javascript
class NodeViewModel {
    constructor(node, selectionViewModel, simulationState) {
        this.node = node;
        this.selectionViewModel = selectionViewModel;
        this.simulationState = simulationState;
    }

    get color() {
        // Simulation highlighting
        if (this.simulationState?.isNodeCurrent(this.node.id)) {
            return '#FF9800'; // Orange
        }

        // Start node highlighting
        if (this.simulationState?.isStartNode(this.node.id)) {
            return '#00E676'; // Bright green
        }

        // Selection highlighting
        if (this.selectionViewModel.selectedNode === this.node) {
            return '#FFC107'; // Yellow
        }

        // Default colors
        return this.node.type === 'state' ? '#BDBDBD' : '#424242';
    }

    get isVisible() {
        if (!this.simulationState?.isActive()) {
            return true;
        }
        return this.simulationState.isNodeVisible(this.node.id);
    }

    get size() {
        return this.node.size;
    }

    get position() {
        return { x: this.node.x, y: this.node.y };
    }

    get name() {
        return this.node.name;
    }
}
```

#### EdgeViewModel
```javascript
class EdgeViewModel {
    constructor(edge, graph, selectionViewModel, simulationState) {
        this.edge = edge;
        this.graph = graph;
        this.selectionViewModel = selectionViewModel;
        this.simulationState = simulationState;
    }

    get color() {
        // Simulation highlighting
        if (this.simulationState?.isEdgeHighlighted(
            this.edge.getFromNode().id,
            this.edge.getToNode().id
        )) {
            return '#FF5722'; // Red
        }

        // Selection highlighting
        if (this.selectionViewModel.selectedEdge === this.edge) {
            return '#FF5722';
        }

        // Reward-based colors for Action → State edges
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();

        if (from.type === 'action' && to.type === 'state') {
            return this._getRewardColor();
        }

        // Default for State → Action edges
        return '#666666';
    }

    get isBidirectional() {
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();

        return this.graph.edges.some(e =>
            e.getFromNode().id === to.id && e.getToNode().id === from.id
        );
    }

    _getRewardColor() {
        const reward = this.edge.getReward();
        const { minReward, maxReward } = this._getRewardRange();

        if (reward === 0) return '#808080'; // Gray

        if (reward > 0) {
            const intensity = maxReward === 0 ? 0 : reward / maxReward;
            return this._interpolateToGreen(intensity);
        } else {
            const intensity = minReward === 0 ? 0 : Math.abs(reward / minReward);
            return this._interpolateToRed(intensity);
        }
    }

    _getRewardRange() {
        // Calculate min/max rewards across all Action→State edges
        const actionStateEdges = this.graph.edges.filter(e =>
            e.getFromNode().type === 'action' && e.getToNode().type === 'state'
        );

        if (actionStateEdges.length === 0) {
            return { minReward: 0, maxReward: 0 };
        }

        let minReward = Infinity;
        let maxReward = -Infinity;

        actionStateEdges.forEach(e => {
            const r = e.getReward();
            minReward = Math.min(minReward, r);
            maxReward = Math.max(maxReward, r);
        });

        return { minReward, maxReward };
    }

    _interpolateToGreen(intensity) {
        const r = Math.round(128 * (1 - intensity));
        const g = Math.round(128 + 102 * intensity); // 128 to 230
        const b = Math.round(128 * (1 - intensity));
        return `rgb(${r}, ${g}, ${b})`;
    }

    _interpolateToRed(intensity) {
        const r = Math.round(128 + 102 * intensity); // 128 to 230
        const g = Math.round(128 * (1 - intensity));
        const b = Math.round(128 * (1 - intensity));
        return `rgb(${r}, ${g}, ${b})`;
    }
}
```

#### InteractionViewModel
```javascript
class InteractionViewModel {
    constructor() {
        this.mode = 'editor'; // 'editor' or 'simulate'

        // Placement state
        this.placingMode = null; // 'state', 'action', 'textbox'
        this.heldNode = null;
        this.heldTextLabel = null;

        // Drag state
        this.draggingNode = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragDistance = 0;

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
    }

    reset() {
        this.placingMode = null;
        this.heldNode = null;
        this.heldTextLabel = null;
        this.draggingNode = null;
        this.resizingNode = null;
        this.isPanning = false;
        this.renameRequested = false;
    }

    isInteracting() {
        return this.heldNode !== null ||
               this.heldTextLabel !== null ||
               this.draggingNode !== null ||
               this.resizingNode !== null ||
               this.isPanning;
    }
}
```

#### CanvasViewModel (Refactored - Coordinator)
```javascript
class CanvasViewModel {
    constructor(graph, simulationState) {
        this.graph = graph;
        this.simulationState = simulationState;

        // Sub-ViewModels
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
    }

    // Factory methods for creating view models
    createNodeViewModel(node) {
        return new NodeViewModel(node, this.selection, this.simulationState);
    }

    createEdgeViewModel(edge) {
        return new EdgeViewModel(edge, this.graph, this.selection, this.simulationState);
    }

    // Convenience getters
    get mode() {
        return this.interaction.mode;
    }

    set mode(value) {
        this.interaction.mode = value;
    }

    get zoom() {
        return this.viewport.zoom;
    }

    get selectedNode() {
        return this.selection.selectedNode;
    }

    // Clear all transient state
    reset() {
        this.selection.clearSelection();
        this.interaction.reset();
        this.errorMessage = null;
        this.infoMessage = null;
    }
}
```

---

## Phase 4: Move Geometric Calculations to View Helpers

### 4.1 Create GeometricHelper

**File:** `src/main/view/helpers/GeometricHelper.js`

```javascript
class GeometricHelper {
    /**
     * Check if point is near a straight line edge (visible portion only)
     */
    static isPointNearStraightEdge(from, to, x, y, threshold = 10) {
        // ... move isPointNearVisibleLine implementation here
    }

    /**
     * Check if point is near a curved (bidirectional) edge
     */
    static isPointNearCurvedEdge(from, to, x, y, threshold = 10) {
        // ... move isPointNearVisibleCurve implementation here
    }

    /**
     * Check if click is on the edge (circumference) of a node
     */
    static isClickOnNodeEdge(node, x, y, edgeThreshold = 8) {
        // ... move from CanvasViewModel
    }

    /**
     * Calculate Bezier curve control point for bidirectional edges
     */
    static calculateCurveControlPoint(from, to, curveOffset = 0.15) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const perpX = -dy / distance;
        const perpY = dx / distance;

        const offset = distance * curveOffset;
        return {
            x: (from.x + to.x) / 2 + perpX * offset,
            y: (from.y + to.y) / 2 + perpY * offset
        };
    }

    /**
     * Find which entity (node, edge, textLabel) is at a given position
     */
    static findEntityAtPosition(graph, x, y) {
        // Check text labels first (on top)
        const textLabel = graph.textLabels.find(label => label.contains(x, y));
        if (textLabel) {
            return { type: 'textLabel', entity: textLabel };
        }

        // Check edges (before nodes, so edges between nodes are selectable)
        const edge = this.findEdgeAtPosition(graph.edges, x, y);
        if (edge) {
            return { type: 'edge', entity: edge };
        }

        // Check nodes (bottom layer)
        for (let i = graph.nodes.length - 1; i >= 0; i--) {
            const node = graph.nodes[i];
            if (node.contains(x, y)) {
                return { type: 'node', entity: node };
            }
        }

        return { type: 'none', entity: null };
    }

    static findEdgeAtPosition(edges, x, y, threshold = 10) {
        // ... implementation
    }
}
```

---

## Phase 5: Update View Layer

### 5.1 MainView Updates

**Before:**
```javascript
// MainView reads complex state from CanvasViewModel
const color = this.viewModel.getNodeColor(node);
```

**After:**
```javascript
// MainView uses NodeViewModel for presentation
const nodeVM = this.viewModel.createNodeViewModel(node);
const color = nodeVM.color;
const isVisible = nodeVM.isVisible;
```

**MainView.draw():**
```javascript
draw() {
    background(240);

    push();
    translate(this.viewModel.viewport.panX, this.viewModel.viewport.panY);
    scale(this.viewModel.viewport.zoom);

    this.drawEdges();
    this.drawNodes();
    this.drawTextLabels();

    pop();

    this.drawZoomIndicator();
    this.drawMessages();

    // Check for rename request
    if (this.viewModel.interaction.renameRequested) {
        this.handleRenameRequest();
    }
}

drawNodes() {
    this.viewModel.graph.nodes.forEach(node => {
        const nodeVM = this.viewModel.createNodeViewModel(node);

        if (!nodeVM.isVisible) return;

        fill(nodeVM.color);
        stroke(0);
        strokeWeight(2);
        circle(nodeVM.position.x, nodeVM.position.y, nodeVM.size * 2);

        fill(255);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(14);
        text(nodeVM.name, nodeVM.position.x, nodeVM.position.y);
    });
}

drawEdges() {
    this.viewModel.graph.edges.forEach(edge => {
        const edgeVM = this.viewModel.createEdgeViewModel(edge);

        stroke(edgeVM.color);
        strokeWeight(edgeVM.isBidirectional ? 5 : 3);

        if (edgeVM.isBidirectional) {
            this.drawCurvedEdge(edge);
        } else {
            this.drawStraightEdge(edge);
        }
    });
}

handleRenameRequest() {
    const nodeId = this.viewModel.interaction.pendingRenameNodeId;
    const currentName = this.viewModel.interaction.pendingRenameCurrentName;

    const newName = prompt('Enter new name:', currentName);

    if (newName !== null && newName.trim() !== '') {
        const inputData = new RenameNodeInputData(nodeId, newName);
        this.controller.renameNode(inputData);
    } else {
        // Cancel rename
        this.viewModel.interaction.renameRequested = false;
    }
}

drawMessages() {
    if (this.viewModel.errorMessage) {
        this.displayError(this.viewModel.errorMessage);
        this.viewModel.errorMessage = null;
    }

    if (this.viewModel.infoMessage) {
        this.displayInfo(this.viewModel.infoMessage);
        this.viewModel.infoMessage = null;
    }
}
```

### 5.2 MainView Mouse Handling

**Before:**
```javascript
mousePressed() {
    const world = this.viewModel.screenToWorld(mouseX, mouseY);
    const result = this.viewModel.handleMousePress(world.x, world.y);
    // ... complex logic
}
```

**After:**
```javascript
mousePressed() {
    // Delegate to controller
    this.controller.handleMousePress(mouseX, mouseY);
    redraw();
}

mouseDragged() {
    this.controller.handleMouseDrag(mouseX, mouseY);
    redraw();
}

mouseReleased() {
    this.controller.handleMouseRelease(mouseX, mouseY);
    redraw();
}
```

---

## Phase 6: Update Dependency Injection (main.js)

### 6.1 Wire New Components

**Updated main.js:**
```javascript
// Domain
const graph = new Graph();
const commandHistory = new CommandHistory(50);
const simulationState = new SimulationState();
const traceGenerator = new TraceGenerator(graph);

// ViewModels (no interactor dependencies!)
const canvasViewModel = new CanvasViewModel(graph, simulationState);

// Presenters (each gets appropriate ViewModel)
const createNodePresenter = new CreateNodePresenter(canvasViewModel);
const createEdgePresenter = new CreateEdgePresenter(canvasViewModel);
const deleteNodePresenter = new DeleteNodePresenter(canvasViewModel.selection);
const moveNodePresenter = new MoveNodePresenter(canvasViewModel.interaction);
const renameNodePresenter = new RenameNodePresenter(canvasViewModel.interaction);
const selectNodePresenter = new SelectNodePresenter(canvasViewModel.selection);
const createTextLabelPresenter = new CreateTextLabelPresenter(canvasViewModel.interaction);
// ... other presenters

// Interactors
const createNodeInteractor = new CreateNodeInteractor(graph, commandHistory, createNodePresenter);
const createEdgeInteractor = new CreateEdgeInteractor(graph, commandHistory, createEdgePresenter);
const deleteNodeInteractor = new DeleteNodeInteractor(graph, commandHistory, deleteNodePresenter);
const moveNodeInteractor = new MoveNodeInteractor(graph, commandHistory, moveNodePresenter);
const renameNodeInteractor = new RenameNodeInteractor(graph, commandHistory, renameNodePresenter);
const selectNodeInteractor = new SelectNodeInteractor(graph, selectNodePresenter);
const createTextLabelInteractor = new CreateTextLabelInteractor(graph, commandHistory, createTextLabelPresenter);
// ... other interactors

// Controller (depends on ViewModel AND all interactors)
const canvasController = new CanvasController(canvasViewModel, {
    createNode: createNodeInteractor,
    createEdge: createEdgeInteractor,
    deleteNode: deleteNodeInteractor,
    moveNode: moveNodeInteractor,
    renameNode: renameNodeInteractor,
    selectNode: selectNodeInteractor,
    createTextLabel: createTextLabelInteractor,
    undo: undoInteractor,
    redo: redoInteractor,
    setMode: setModeInteractor,
    zoomIn: zoomInInteractor,
    zoomOut: zoomOutInteractor,
    importGraph: importGraphInteractor,
    resizeNode: resizeNodeInteractor,
    play: playInteractor,
    skip: skipInteractor,
    reset: resetInteractor,
    serializeGraph: serializeGraphInteractor
});

// Views (depend on ViewModel AND Controller)
let mainView;
let sideBar;

function setup() {
    sideBar = new SideBar(canvasController, canvasViewModel);
    mainView = new MainView(canvasViewModel, canvasController, sideBar);

    // ... simulation presenter setup

    mainView.setup();
}

// p5.js event handlers delegate to controller via mainView
function mousePressed() {
    mainView.mousePressed();
}

function mouseDragged() {
    mainView.mouseDragged();
}

function mouseReleased() {
    mainView.mouseReleased();
}
```

---

## Phase 7: Update index.html Script Loading

Add new files in correct order:

```html
<!-- Domain Layer -->
<script src="src/main/domain/..."></script>

<!-- Use Case Layer - NEW Use Cases -->
<script src="src/main/use_case/deleteNode/deleteNodeInputBoundary.js"></script>
<script src="src/main/use_case/deleteNode/deleteNodeInputData.js"></script>
<script src="src/main/use_case/deleteNode/deleteNodeInteractor.js"></script>
<script src="src/main/use_case/deleteNode/deleteNodeOutputBoundary.js"></script>
<script src="src/main/use_case/deleteNode/deleteNodePresenter.js"></script>

<script src="src/main/use_case/moveNode/..."></script>
<script src="src/main/use_case/renameNode/..."></script>
<script src="src/main/use_case/selectNode/..."></script>
<script src="src/main/use_case/createTextLabel/..."></script>

<!-- Adapter Layer - ViewModels -->
<script src="src/main/adapter/viewmodel/SelectionViewModel.js"></script>
<script src="src/main/adapter/viewmodel/ViewportViewModel.js"></script>
<script src="src/main/adapter/viewmodel/NodeViewModel.js"></script>
<script src="src/main/adapter/viewmodel/EdgeViewModel.js"></script>
<script src="src/main/adapter/viewmodel/InteractionViewModel.js"></script>
<script src="src/main/adapter/viewmodel/CanvasViewModel.js"></script>

<!-- Adapter Layer - Controller -->
<script src="src/main/adapter/controller/CanvasController.js"></script>

<!-- View Layer - Helpers -->
<script src="src/main/view/helpers/GeometricHelper.js"></script>

<!-- View Layer -->
<script src="src/main/view/..."></script>

<!-- App Bootstrap -->
<script src="src/main/app/main.js"></script>
```

---

## Migration Checklist

### Phase 1: Extract Controller ✓
- [ ] Create `CanvasController.js`
- [ ] Move input handling methods from CanvasViewModel
- [ ] Update View to call Controller instead of ViewModel
- [ ] Test that all mouse/keyboard events work

### Phase 2: Create Missing Use Cases ✓
- [ ] Create DeleteNode use case (5 files)
- [ ] Create MoveNode use case (5 files)
- [ ] Create RenameNode use case (5 files)
- [ ] Create SelectNode use case (5 files)
- [ ] Create CreateTextLabel use case (5 files)
- [ ] Wire all new use cases in main.js
- [ ] Update index.html with new scripts

### Phase 3: Split ViewModel ✓
- [ ] Create SelectionViewModel
- [ ] Create ViewportViewModel
- [ ] Create NodeViewModel
- [ ] Create EdgeViewModel
- [ ] Create InteractionViewModel
- [ ] Refactor CanvasViewModel to use sub-ViewModels
- [ ] Update all Presenters to use appropriate ViewModels

### Phase 4: Extract View Helpers ✓
- [ ] Create GeometricHelper.js
- [ ] Move edge detection algorithms
- [ ] Move geometric calculations
- [ ] Update Controller to use GeometricHelper

### Phase 5: Update View Layer ✓
- [ ] Refactor MainView.draw() to use ViewModels
- [ ] Refactor mouse handlers to delegate to Controller
- [ ] Add message display logic
- [ ] Add rename request handling

### Phase 6: Update DI ✓
- [ ] Update main.js wiring
- [ ] Remove ViewModel → Interactor references
- [ ] Add Controller → Interactor references
- [ ] Update View constructor signatures

### Phase 7: Testing ✓
- [ ] Test node creation/deletion
- [ ] Test edge creation/deletion
- [ ] Test node selection/deselection
- [ ] Test node dragging
- [ ] Test node resizing
- [ ] Test node renaming
- [ ] Test text label creation
- [ ] Test undo/redo
- [ ] Test zoom/pan
- [ ] Test mode switching
- [ ] Test simulation mode

---

## Expected Outcomes

### Before Refactoring
```
CanvasViewModel: 871 lines
- Input handling: 200+ lines
- Business logic: 150+ lines
- Presentation logic: 200+ lines
- State management: 100+ lines
- Geometric calculations: 200+ lines
```

### After Refactoring
```
CanvasController: ~300 lines
  - Input handling only
  - Delegates to interactors

CanvasViewModel: ~100 lines
  - Aggregates sub-ViewModels
  - Factory methods

SelectionViewModel: ~30 lines
ViewportViewModel: ~60 lines
NodeViewModel: ~40 lines
EdgeViewModel: ~80 lines
InteractionViewModel: ~50 lines

GeometricHelper: ~200 lines
  - Pure functions
  - Reusable algorithms

5 New Use Cases: ~50 lines each
  - Clear single responsibility
  - Testable in isolation
```

### Benefits
1. **Testability**: Each component can be unit tested in isolation
2. **Maintainability**: Clear responsibilities, easy to find code
3. **Extensibility**: Adding new features requires minimal changes
4. **Clean Architecture Compliance**: Proper dependency flow
5. **Readability**: Smaller, focused classes easier to understand

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation:**
- Refactor incrementally (one phase at a time)
- Keep old CanvasViewModel temporarily alongside new components
- Add integration tests before starting
- Test after each phase completion

### Risk 2: Complex Dependency Wiring
**Mitigation:**
- Document dependency graph clearly
- Create wiring diagram
- Use consistent naming conventions
- Add comments in main.js explaining wiring

### Risk 3: Performance Regression
**Mitigation:**
- Profile before refactoring (baseline metrics)
- Profile after each phase
- Optimize ViewModels (cache computed properties if needed)
- Lazy-create NodeViewModel/EdgeViewModel only when needed for rendering

### Risk 4: Missing Use Cases
**Mitigation:**
- Audit all CanvasViewModel methods
- Create comprehensive feature matrix
- Get user acceptance testing
- Keep fallback to old ViewModel during transition

---

## Success Criteria

✅ **Refactoring is successful when:**

1. All existing features work identically
2. Zero lines of business logic in CanvasViewModel
3. Zero UI calls (`prompt`, `alert`) in Adapter layer
4. Each ViewModel class < 100 lines
5. Controller delegates all actions to Use Cases
6. All geometric calculations in View helpers
7. Each Use Case has dedicated Interactor + Presenter
8. 100% test coverage on new Use Cases
9. Dependency flow: View → Controller → Interactor → Presenter → ViewModel
10. No direct Command creation outside Use Case layer

---

## Timeline Estimate

Assuming 1 developer working full-time:

| Phase | Effort | Duration |
|-------|--------|----------|
| Phase 1: Extract Controller | Medium | 2 days |
| Phase 2: Create Missing Use Cases | High | 4 days |
| Phase 3: Split ViewModel | Medium | 3 days |
| Phase 4: Extract View Helpers | Low | 1 day |
| Phase 5: Update View Layer | Medium | 2 days |
| Phase 6: Update DI | Low | 1 day |
| Phase 7: Testing & Bug Fixes | High | 3 days |
| **Total** | | **16 days** |

Add 20% buffer: **~3.5 weeks total**

---

## Appendix A: File Creation Script

```bash
#!/bin/bash

# Create directory structure
mkdir -p src/main/adapter/controller
mkdir -p src/main/adapter/viewmodel
mkdir -p src/main/view/helpers

# Create missing use cases
for uc in deleteNode moveNode renameNode selectNode createTextLabel; do
    mkdir -p "src/main/use_case/$uc"
    touch "src/main/use_case/$uc/${uc}InputBoundary.js"
    touch "src/main/use_case/$uc/${uc}InputData.js"
    touch "src/main/use_case/$uc/${uc}Interactor.js"
    touch "src/main/use_case/$uc/${uc}OutputBoundary.js"
    touch "src/main/use_case/$uc/${uc}Presenter.js"
done

# Create ViewModels
touch src/main/adapter/viewmodel/SelectionViewModel.js
touch src/main/adapter/viewmodel/ViewportViewModel.js
touch src/main/adapter/viewmodel/NodeViewModel.js
touch src/main/adapter/viewmodel/EdgeViewModel.js
touch src/main/adapter/viewmodel/InteractionViewModel.js

# Create Controller
touch src/main/adapter/controller/CanvasController.js

# Create View Helpers
touch src/main/view/helpers/GeometricHelper.js

echo "File structure created successfully!"
```

---

## Appendix B: Testing Template

```javascript
// Template for testing new Use Cases
describe('DeleteNodeInteractor', () => {
    let graph;
    let commandHistory;
    let mockPresenter;
    let interactor;

    beforeEach(() => {
        graph = new Graph();
        commandHistory = new CommandHistory(50);
        mockPresenter = {
            presentDeleted: jest.fn(),
            presentError: jest.fn()
        };
        interactor = new DeleteNodeInteractor(graph, commandHistory, mockPresenter);
    });

    test('deletes existing node', () => {
        const node = new StateNode('S0', 100, 100);
        graph.addNode(node);

        const inputData = new DeleteNodeInputData(node.id);
        interactor.execute(inputData);

        expect(graph.nodes.length).toBe(0);
        expect(mockPresenter.presentDeleted).toHaveBeenCalledWith(node);
    });

    test('presents error for non-existent node', () => {
        const inputData = new DeleteNodeInputData(999);
        interactor.execute(inputData);

        expect(mockPresenter.presentError).toHaveBeenCalledWith('Entity not found');
    });

    test('can undo delete', () => {
        const node = new StateNode('S0', 100, 100);
        graph.addNode(node);

        const inputData = new DeleteNodeInputData(node.id);
        interactor.execute(inputData);

        commandHistory.undo();

        expect(graph.nodes.length).toBe(1);
        expect(graph.nodes[0]).toBe(node);
    });
});
```
