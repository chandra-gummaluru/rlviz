# Debugging Guide

## Issues Fixed (Latest Session - 2026-03-02)

### 1. Duplicate MoveNodeInputData Class Definition
**Problem**: `MoveNodeInputData.forNodeStart is not a function` error when trying to drag nodes.

**Root Cause**: Two definitions of `MoveNodeInputData` class:
- Legacy version in `src/main/use_case/nodeInteraction/nodeInteractionInputData.js` (no static factory methods)
- New refactored version in `src/main/use_case/moveNode/moveNodeInputData.js` (with factory methods)

Since the old one loaded first, it overwrote the new one.

**Solution**: Removed the duplicate class from `nodeInteractionInputData.js`.

**Code location**: `src/main/use_case/nodeInteraction/nodeInteractionInputData.js:9-10`

### 2. Falsy ID Check Bug (ID = 0)
**Problem**: First node created (ID 0) couldn't be selected or moved. "Entity not found" errors.

**Root Cause**: JavaScript falsy values - `if (inputData.nodeId)` returns false when `nodeId === 0`.

**Solution**: Changed all ID checks from `if (inputData.nodeId)` to `if (inputData.nodeId !== null && inputData.nodeId !== undefined)`

**Files fixed**:
- `src/main/use_case/selectNode/selectNodeInteractor.js:28`
- `src/main/use_case/moveNode/moveNodeInteractor.js:52`
- `src/main/use_case/deleteNode/deleteNodeInteractor.js:25`

### 3. Node Selection Not Persisting
**Problem**: Clicking a node would select it momentarily, but deselect immediately on mouse release.

**Root Cause**: On `mouseReleased`, if no drag occurred, `_handleNodeClickForEdge` was called which would deselect the node if it was the same node (lines 465-471).

**Solution**: Removed the `_handleNodeClickForEdge` call from the non-drag path in `handleMouseRelease`. Edge creation now only happens via the check in `_handleNodeClick` before drag starts.

**Code location**: `src/main/adapter/controller/CanvasController.js:185-188`

### 4. Selection Not Cleared After Edge Creation
**Problem**: After creating an edge between two nodes, the first node remained selected.

**Solution**: Added selection clearing after edge creation in `promptForEdge`.

**Code location**: `src/main/view/mainView.js:462-466`

### 5. Edge Creation vs Dragging Conflict
**Problem**: When clicking a second node to create an edge, it would start dragging instead.

**Solution**: Added edge creation check BEFORE starting drag in `_handleNodeClick`. If a different compatible node is already selected, create edge instead of dragging.

**Code location**: `src/main/adapter/controller/CanvasController.js:419-423`

### 6. Resize State Not Clearing
**Problem**: After starting to resize a node, clicking off would leave the app stuck in resize mode.

**Root Cause**: `_handleCanvasClick` only cleared selection but didn't clear other interaction states like `resizingNode`, `draggingNode`, etc.

**Solution**: Added clearing of all interaction states (`resizingNode`, `draggingNode`, `draggingTextLabel`) in `_handleCanvasClick`.

**Code location**: `src/main/adapter/controller/CanvasController.js:456-459`

## Previous Issues Fixed

### 6. Panning Not Working
**Problem**: Clicking on empty canvas didn't start panning.

**Root Cause**: The old code had MainView call `startPan()` when the ViewModel returned `{mode: 'deselect'}`. The new Controller architecture doesn't return result objects - it just performs actions.

**Solution**: Updated MainView to detect empty canvas clicks BEFORE delegating to controller. If empty canvas is clicked, MainView starts panning directly.

**Code location**: `src/main/view/mainView.js:310-330`

### 7. Missing ViewModel Properties
**Problem**: ViewModels were missing properties that MainView expected.

**Fixed**:
- **ViewportViewModel**: Added `isPanning`, `panStartX`, `panStartY`, `panStartOffsetX`, `panStartOffsetY`
- **InteractionViewModel**: Added `renameTargetNode`, `edgeCreationRequested`, `pendingEdgeFrom`, `pendingEdgeTo`, `shouldCenterOnNode`, `nodeToCenterOn`

## Current Status

### What Should Work
✅ Node creation (State, Action buttons)
✅ Node selection (clicking nodes, including first node with ID 0)
✅ Node dragging
✅ Node resizing
✅ Panning (clicking empty canvas and dragging)
✅ Text label creation
✅ Edge creation (select node 1, click compatible node 2)
✅ Selection clears after edge creation
✅ Undo/Redo
✅ Zoom in/out
✅ Mode switching (Editor/Simulate)

### Testing Checklist

1. **Node Selection**:
   - Create a State node → should auto-select (yellow)
   - Click empty canvas → should deselect
   - Click the node again → should select (yellow) and stay selected

2. **Edge Creation**:
   - Create a State node and an Action node
   - Click State node → turns yellow
   - Click Action node → prompts for edge, then both deselect

3. **Node Dragging**:
   - Click and drag a node → node should move
   - Release → should create undo command
   - Click without dragging → node stays selected

4. **First Node (ID 0)**:
   - Create the very first node → should be selectable
   - Should be draggable
   - Should be able to create edges from/to it

## Known Architecture

### Mouse Event Flow

```
User clicks
  ↓
MainView.mousePressed()
  ↓
Check for empty canvas → Start panning (View layer concern)
  ↓
CanvasController.handleMousePress()
  ↓
GeometricHelper.findEntityAtPosition() → Find what was clicked
  ↓
Switch on target.type:
  - 'node' → _handleNodeClick()
    - Check for resize
    - Check for edge creation (if different compatible node selected)
    - Select node
    - Start drag
  - 'edge' → _handleEdgeClick()
  - 'textLabel' → _handleTextLabelClick()
  - 'none' → _handleCanvasClick()
  ↓
Call appropriate interactor:
  - SelectNode.select()
  - MoveNode.startMove()
  - etc.
  ↓
Interactor calls Presenter
  ↓
Presenter updates ViewModel
  ↓
MainView.draw() reads ViewModel and renders
```

### Layer Responsibilities

**View Layer (MainView)**:
- Handle p5.js events (mousePressed, mouseDragged, keyPressed)
- Manage panning (view-layer concern, not business logic)
- Prompt user for input (text labels, edge parameters, rename)
- Read ViewModel and render graphics
- Detect when ViewModel flags are set (e.g., `textLabelRequested`)

**Controller Layer (CanvasController)**:
- Translate user input to use case calls
- Handle geometric queries (what did user click?)
- Call interactors with appropriate InputData
- NO business logic, NO ViewModel updates

**Use Case Layer (Interactors)**:
- Execute business logic
- Validate input
- Create commands for undo/redo
- Call presenters with results

**Presenter Layer**:
- Update ViewModels
- Set flags for View to respond to
- Format data for presentation

**ViewModel Layer**:
- Hold state for rendering
- Provide getters for convenience
- NO business logic

## Common Pitfalls

1. **Falsy ID checks**: Always use `!== null && !== undefined` instead of truthy checks when dealing with IDs that can be 0
2. **Object reference equality**: When comparing nodes, use `===` for same object, or compare `.id` properties for same logical node
3. **Mouse event order**: `mousePressed` → `mouseDragged` (optional) → `mouseReleased`
4. **Selection persistence**: Don't clear selection unless explicitly needed (user clicks away, edge created, etc.)
