# Clean Architecture Compliance Guide

## Overview

This document identifies Clean Architecture violations in the rlviz codebase and provides actionable refactoring guidance to ensure each layer adheres to the Dependency Rule:

> **Source code dependencies must point only inward, toward higher-level policies.**

Outer layers can depend on inner layers, but inner layers must never depend on outer layers.

---

## Current Violations

### Critical: Adapter Layer Violations

The `CanvasViewModel` (Adapter layer) currently violates Clean Architecture in several ways:

#### 1. **Direct Domain Entity Creation** (Lines 66, 99-100)

**Violation:**
```javascript
// Line 66: CanvasViewModel creates CommandHistory directly
this.commandHistory = new CommandHistory(50);

// Lines 99-100: CanvasViewModel creates TextLabel directly
const label = new TextLabel(text, 0, 0, 16);
this.graph.addTextLabel(label);
```

**Problem:** The Adapter layer is creating Domain entities directly. This creates a dependency from Adapter → Domain, which is allowed, BUT the Adapter is making business decisions (what size? what position?) that should be made by Use Cases.

**Impact:**
- Business logic leaks into the Adapter layer
- Cannot test business rules independently
- Difficult to change entity creation logic

---

#### 2. **Direct Command Execution** (Lines 499-507, 797-809)

**Violation:**
```javascript
// Lines 499-507: CanvasViewModel directly executes commands
deleteSelected() {
    if (this.selectedNode) {
        const node = this.selectedNode;
        const command = new DeleteNodeCommand(this.graph, node);
        this.commandHistory.execute(command);  // Direct domain manipulation!
        this.selectedNode = null;
        return { deleted: 'node' };
    }
    // ... more direct command creation
}

// Lines 797-809: Direct MoveNodeCommand creation
createMoveCommand(node) {
    const startPos = this.nodeDragStartPos.get(node.id);
    if (startPos && (startPos.x !== node.x || startPos.y !== node.y)) {
        const command = new MoveNodeCommand(node, startPos.x, startPos.y, node.x, node.y);
        this.commandHistory.execute(command);  // Direct domain manipulation!
        this.nodeDragStartPos.delete(node.id);
    }
}
```

**Problem:** The Adapter is directly creating and executing Domain commands. This is business logic that belongs in Use Case Interactors.

**Impact:**
- Undo/redo logic scattered across layers
- Cannot unit test command creation without Adapter
- Violates Single Responsibility Principle

---

#### 3. **Business Logic in Adapter** (Lines 155-158, 245-345, 606-638)

**Violation:**
```javascript
// Lines 155-158: Rename validation logic in Adapter
const newName = prompt('Enter new name:', hitNode.getName());
if (newName !== null && newName.trim() !== '') {
    hitNode.setName(newName);  // Direct domain manipulation!
}

// Lines 245-345: Complex edge detection algorithms
isPointNearVisibleLine(from, to, x, y, threshold) {
    // 100+ lines of geometric calculations
    // This is presentation logic, but implements business rules
}

// Lines 606-638: Reward color interpolation
interpolateColor(reward, minReward, maxReward) {
    // Color calculation based on business rules
    // Should this be in Domain or View?
}
```

**Problem:**
- Validation rules (name trimming) are business logic
- Geometric algorithms for selection might be presentation concerns, but the thresholds and rules are business logic
- Color mapping based on rewards is a presentation concern, but reward interpretation is business logic

---

#### 4. **UI Framework Calls from Adapter** (Lines 98, 155)

**Violation:**
```javascript
// Line 98: Direct UI interaction
const text = prompt('Enter text:', 'Text');

// Line 155: Direct UI interaction
const newName = prompt('Enter new name:', hitNode.getName());
```

**Problem:** The Adapter layer is calling browser APIs (`prompt`, `alert`). The Adapter should only prepare data for the View layer, not interact with UI directly.

**Impact:**
- Cannot test without browser environment
- Tight coupling to web platform
- Cannot reuse logic in non-web environments

---

### Minor: Use Case Layer Issues

#### 5. **Presenters Calling UI Methods** (createNodePresenter.js:16)

**Violation:**
```javascript
presentError(message) {
    console.error(`Create node error: ${message}`);
    alert(`Error creating node: ${message}`);  // Presenter calling browser API!
}
```

**Problem:** Presenters should only update the ViewModel. The View should be responsible for showing alerts.

---

## Refactoring Strategy

### Phase 1: Extract Command Operations to Use Cases

**Goal:** Move all command creation/execution from Adapter to Use Cases.

#### Create `DeleteNodeUseCase`

**New Files:**
- `src/main/use_case/deleteNode/deleteNodeInputBoundary.js`
- `src/main/use_case/deleteNode/deleteNodeInputData.js`
- `src/main/use_case/deleteNode/deleteNodeInteractor.js`
- `src/main/use_case/deleteNode/deleteNodeOutputBoundary.js`
- `src/main/use_case/deleteNode/deleteNodePresenter.js`

**Interactor:**
```javascript
class DeleteNodeInteractor {
    constructor(graph, commandHistory, presenter) {
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    execute(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);

        if (!node) {
            this.presenter.presentError('Node not found');
            return;
        }

        const command = new DeleteNodeCommand(this.graph, node);
        this.commandHistory.execute(command);

        this.presenter.presentNodeDeleted(node);
    }
}
```

**Update CanvasViewModel:**
```javascript
// Remove from CanvasViewModel:
deleteSelected() {
    if (this.selectedNode) {
        const node = this.selectedNode;
        const command = new DeleteNodeCommand(this.graph, node);
        this.commandHistory.execute(command);
        this.selectedNode = null;
        return { deleted: 'node' };
    }
    // ...
}

// Replace with:
deleteSelected() {
    if (this.selectedNode) {
        const inputData = new DeleteNodeInputData(this.selectedNode.id);
        this.deleteNodeInteractor.execute(inputData);
    }
    // ... similar for edge and text label
}
```

---

### Phase 2: Remove CommandHistory from Adapter

**Goal:** CommandHistory is a Domain object and should not be instantiated in the Adapter.

**Current Violation:**
```javascript
// canvasViewModel.js:66
this.commandHistory = new CommandHistory(50);
```

**Refactor:**

1. **Move to main.js:**
```javascript
// main.js (already exists, just emphasizing):
const commandHistory = new CommandHistory(50);
```

2. **Remove from CanvasViewModel:**
```javascript
class CanvasViewModel {
    constructor(graph, interactors) {
        this.graph = graph;
        // REMOVE: this.commandHistory = new CommandHistory(50);
        // ... other initialization
    }
}
```

3. **Pass CommandHistory to Use Cases only:**
```javascript
// main.js
const deleteNodeInteractor = new DeleteNodeInteractor(graph, commandHistory, deleteNodePresenter);
const moveNodeInteractor = new MoveNodeInteractor(graph, commandHistory, moveNodePresenter);
// etc.
```

**Result:** CanvasViewModel no longer has direct access to CommandHistory. All command operations flow through Use Case Interactors.

---

### Phase 3: Extract Text Label Creation to Use Case

**Goal:** Remove direct TextLabel instantiation from Adapter.

**Current Violation:**
```javascript
// canvasViewModel.js:98-100
const text = prompt('Enter text:', 'Text');
if (text) {
    const label = new TextLabel(text, 0, 0, 16);
    this.graph.addTextLabel(label);
    this.heldTextLabel = label;
    this.placingMode = 'textbox';
}
```

**Refactor:**

**Create `CreateTextLabelUseCase`:**

```javascript
// createTextLabelInteractor.js
class CreateTextLabelInteractor {
    constructor(graph, commandHistory, presenter) {
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
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

**Update CanvasViewModel:**
```javascript
startNodePlacement(type) {
    if (type === 'textbox') {
        // Remove prompt() call - this should be in View layer
        // The View will collect text and call the interactor
        this.placingMode = 'textbox';
        return;
    }
    // ...
}
```

**Update View:**
```javascript
// View layer handles UI interaction
onTextButtonClick() {
    const text = prompt('Enter text:', 'Text');
    if (text) {
        canvasViewModel.placingMode = 'textbox';
        canvasViewModel.pendingTextLabelText = text;
    }
}

// When user clicks canvas to place:
if (canvasViewModel.placingMode === 'textbox') {
    const inputData = new CreateTextLabelInputData(
        canvasViewModel.pendingTextLabelText,
        x, y
    );
    createTextLabelInteractor.execute(inputData);
}
```

---

### Phase 4: Remove UI Calls from Adapter

**Goal:** Remove `prompt()` and `alert()` calls from CanvasViewModel.

**Current Violations:**
```javascript
// canvasViewModel.js:98
const text = prompt('Enter text:', 'Text');

// canvasViewModel.js:155
const newName = prompt('Enter new name:', hitNode.getName());
```

**Refactor:**

**Pattern: Two-Stage Interaction**

1. **First Click: Signal Intent**
```javascript
// CanvasViewModel
handleDoubleClick(node) {
    if (this.mode === 'editor') {
        // Don't prompt here - just signal intent
        return { action: 'request_rename', node: node };
    }
}
```

2. **View Handles UI:**
```javascript
// mainView.js
const result = this.viewModel.handleDoubleClick(hitNode);
if (result.action === 'request_rename') {
    const newName = prompt('Enter new name:', result.node.getName());
    if (newName !== null && newName.trim() !== '') {
        const inputData = new RenameNodeInputData(result.node.id, newName);
        this.renameNodeInteractor.execute(inputData);
    }
}
```

**Create `RenameNodeUseCase`:**
```javascript
class RenameNodeInteractor {
    constructor(graph, commandHistory, presenter) {
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    execute(inputData) {
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

        this.presenter.presentNodeRenamed(node);
    }
}
```

---

### Phase 5: Clarify Business Logic vs Presentation Logic

**Goal:** Determine which geometric/color logic belongs in Domain vs Adapter vs View.

#### Decision Framework

**Domain Layer:** Pure business rules
- Reward ranges and their meanings
- Node size constraints (10-100px)
- Probability validation (0-1)

**Adapter Layer:** Coordinate presentation data
- Convert domain data to view models
- Calculate derived display properties
- NO geometric algorithms, NO color calculations

**View Layer:** Visual presentation
- Geometric calculations for rendering
- Color mappings
- Hit detection algorithms

#### Refactor: Move Edge Detection to View

**Current Location:** `canvasViewModel.js:224-345` (Adapter)

**Problem:** These are presentation concerns - they calculate screen-space geometry.

**Refactor:**

```javascript
// Move to mainView.js or new ViewHelper class
class EdgeDetectionHelper {
    static isPointNearVisibleLine(from, to, x, y, threshold) {
        // ... existing implementation
    }

    static isPointNearVisibleCurve(from, to, x, y, threshold) {
        // ... existing implementation
    }
}

// CanvasViewModel delegates to View helper:
findEdgeAtPosition(x, y, threshold = 10) {
    // This method can stay in ViewModel as a query
    // But the geometric calculation moves to View
    return this.graph.edges.find(edge => {
        // Simple lookup - no calculations here
        return EdgeDetectionHelper.isPointNearEdge(edge, x, y, threshold);
    });
}
```

**Better Approach: Domain-Driven Hit Testing**

```javascript
// Domain: Pure business logic
class Edge {
    isNearPoint(x, y, threshold, isBidirectional) {
        // Domain knows its geometry type
        if (isBidirectional) {
            return this.isNearCurve(x, y, threshold);
        } else {
            return this.isNearLine(x, y, threshold);
        }
    }
}

// CanvasViewModel: Simple delegation
findEdgeAtPosition(x, y) {
    return this.graph.edges.find(edge => {
        const isBidi = this.isBidirectionalEdge(edge);
        return edge.isNearPoint(x, y, 10, isBidi);
    });
}
```

#### Refactor: Reward Color Calculation

**Current Location:** `canvasViewModel.js:606-668` (Adapter)

**Problem:** Color calculation is presentation, but reward interpretation is business logic.

**Refactor:**

**Domain Layer: Reward Categorization**
```javascript
// Domain knows business meaning of rewards
class RewardAnalyzer {
    constructor(graph) {
        this.graph = graph;
    }

    getRewardCategory(reward) {
        if (reward > 0) return 'positive';
        if (reward < 0) return 'negative';
        return 'neutral';
    }

    getRewardIntensity(reward) {
        const { minReward, maxReward } = this.getRewardRange();

        if (reward > 0 && maxReward > 0) {
            return reward / maxReward; // 0-1
        }
        if (reward < 0 && minReward < 0) {
            return Math.abs(reward / minReward); // 0-1
        }
        return 0;
    }

    getRewardRange() {
        // Calculate min/max rewards
        // This is business logic - analyzing the MDP
    }
}
```

**Adapter Layer: Map to View Model**
```javascript
// CanvasViewModel
getEdgeViewModel(edge) {
    const category = this.rewardAnalyzer.getRewardCategory(edge.getReward());
    const intensity = this.rewardAnalyzer.getRewardIntensity(edge.getReward());

    return {
        edge: edge,
        rewardCategory: category,     // 'positive', 'negative', 'neutral'
        rewardIntensity: intensity,   // 0-1
        isHighlighted: this.selectedEdge === edge
    };
}
```

**View Layer: Color Mapping**
```javascript
// mainView.js
drawEdge(edgeViewModel) {
    const color = this.getEdgeColor(edgeViewModel);
    // ... render with color
}

getEdgeColor(edgeViewModel) {
    if (edgeViewModel.isHighlighted) {
        return '#FF5722';
    }

    // Map categories to colors (presentation decision)
    const baseColors = {
        'positive': [0, 230, 0],    // Green
        'negative': [230, 0, 0],    // Red
        'neutral': [128, 128, 128]  // Gray
    };

    const base = baseColors[edgeViewModel.rewardCategory];
    const intensity = edgeViewModel.rewardIntensity;

    // Interpolate (presentation logic)
    const r = Math.round(128 + (base[0] - 128) * intensity);
    const g = Math.round(128 + (base[1] - 128) * intensity);
    const b = Math.round(128 + (base[2] - 128) * intensity);

    return `rgb(${r}, ${g}, ${b})`;
}
```

---

### Phase 6: Remove Presenter UI Calls

**Goal:** Presenters should only update ViewModel, never call UI methods.

**Current Violation:**
```javascript
// createNodePresenter.js:16
alert(`Error creating node: ${message}`);
```

**Refactor:**

**Presenter Updates ViewModel:**
```javascript
class CreateNodePresenter {
    constructor(viewModel) {
        this.viewModel = viewModel;
    }

    presentError(message) {
        // Update ViewModel state
        this.viewModel.lastOperationError = message;
        this.viewModel.lastOperationMessage = null;
    }
}
```

**View Displays Errors:**
```javascript
// mainView.js
draw() {
    // ... normal rendering

    // Check for error messages
    if (this.viewModel.lastOperationError) {
        this.displayError(this.viewModel.lastOperationError);
        this.viewModel.lastOperationError = null; // Clear after display
    }
}

displayError(message) {
    // Option 1: Alert
    alert(`Error: ${message}`);

    // Option 2: Toast notification (better UX)
    this.showToast(message, 'error');

    // Option 3: Error panel
    this.errorPanel.show(message);
}
```

---

## Dependency Rule Checklist

After refactoring, verify each layer:

### ✅ Domain Layer (Inner)
- [ ] No imports from Use Case, Adapter, or View layers
- [ ] No UI framework dependencies (no `alert`, `prompt`, `console`)
- [ ] Pure business entities and rules
- [ ] Can be tested in isolation with zero dependencies

### ✅ Use Case Layer
- [ ] Depends only on Domain layer
- [ ] No imports from Adapter or View layers
- [ ] All Interactors receive domain objects, not UI objects
- [ ] Presenters call methods on OutputBoundary interfaces, not concrete ViewModels

### ✅ Adapter Layer
- [ ] Depends only on Use Case and Domain layers
- [ ] No direct command creation or execution
- [ ] No UI framework calls (`alert`, `prompt`)
- [ ] ViewModel only stores state and coordinates use cases
- [ ] No business logic (validation, calculations)

### ✅ View Layer (Outer)
- [ ] Can depend on all inner layers
- [ ] Handles all UI interactions
- [ ] Converts user actions to Use Case input data
- [ ] Renders data from ViewModel
- [ ] Contains presentation logic (colors, layouts, animations)

---

## Migration Priority

### High Priority (Breaks Dependency Rule)
1. **Remove CommandHistory from CanvasViewModel** (Phase 2)
2. **Extract DeleteNode/MoveNode to Use Cases** (Phase 1)
3. **Remove `prompt()` from CanvasViewModel** (Phase 4)

### Medium Priority (Design Improvement)
4. **Extract TextLabel creation to Use Case** (Phase 3)
5. **Move edge detection to View** (Phase 5)
6. **Remove `alert()` from Presenters** (Phase 6)

### Low Priority (Cleanup)
7. **Refactor color calculations** (Phase 5)
8. **Add comprehensive tests for each layer**
9. **Document dependency contracts**

---

## Testing Strategy

After each refactoring phase, ensure:

### Unit Tests

**Domain Layer:**
```javascript
// Pure unit tests - no mocks needed
test('CommandHistory limits size', () => {
    const history = new CommandHistory(2);
    history.execute(new MockCommand());
    history.execute(new MockCommand());
    history.execute(new MockCommand());
    expect(history.undoStack.length).toBe(2);
});
```

**Use Case Layer:**
```javascript
// Test with mock presenter
test('DeleteNodeInteractor deletes node', () => {
    const graph = new Graph();
    const node = new StateNode('S0', 0, 0);
    graph.addNode(node);

    const mockPresenter = { presentNodeDeleted: jest.fn() };
    const interactor = new DeleteNodeInteractor(graph, new CommandHistory(), mockPresenter);

    const inputData = new DeleteNodeInputData(node.id);
    interactor.execute(inputData);

    expect(graph.nodes.length).toBe(0);
    expect(mockPresenter.presentNodeDeleted).toHaveBeenCalledWith(node);
});
```

**Adapter Layer:**
```javascript
// Test delegation to interactors
test('CanvasViewModel delegates delete to interactor', () => {
    const mockInteractor = { execute: jest.fn() };
    const viewModel = new CanvasViewModel(graph, { deleteNode: mockInteractor });

    viewModel.selectedNode = someNode;
    viewModel.deleteSelected();

    expect(mockInteractor.execute).toHaveBeenCalled();
});
```

---

## Summary

The primary violations are in the **Adapter Layer (CanvasViewModel)**:

1. **Creates Domain entities directly** (TextLabel, Commands)
2. **Executes business logic** (command creation, validation)
3. **Calls UI methods** (`prompt`, `alert`)
4. **Contains presentation algorithms** (edge detection, color calculation)

**Fix:** Extract all business operations to Use Case Interactors, remove UI calls, and clarify layer responsibilities.

After refactoring:
- **Domain**: Pure business logic
- **Use Cases**: Application workflows
- **Adapter**: State coordination ONLY
- **View**: UI and presentation logic

This will enable:
- Independent testing of each layer
- Easier maintenance and feature additions
- Clear separation of concerns
- Ability to swap UI frameworks without touching business logic
