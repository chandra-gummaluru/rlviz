# Simulation UI Changes

**Date**: 2026-03-09
**Summary**: Removed automatic camera movements and start node highlighting during simulation to provide a cleaner, less intrusive viewing experience.

---

## Changes Made

### 1. Remove Zoom Adjustment During Animation

**File**: `src/main/adapter/viewmodel/CanvasViewModel.js`
**Line**: 149-156
**Change**: Removed automatic zoom to 5.0x when centering on nodes

**Before**:
```javascript
centerOnNode(node, canvasWidth, canvasHeight) {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    this.viewport.zoom = 5.0;
    this.viewport.panX = centerX - (node.x * this.viewport.zoom);
    this.viewport.panY = centerY - (node.y * this.viewport.zoom);
}
```

**After**:
```javascript
centerOnNode(node, canvasWidth, canvasHeight) {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // Pan to center on node without changing zoom level
    this.viewport.panX = centerX - (node.x * this.viewport.zoom);
    this.viewport.panY = centerY - (node.y * this.viewport.zoom);
}
```

**Rationale**: Users want to maintain their preferred zoom level throughout the simulation, not have it automatically changed to 500% zoom.

---

### 2. Remove Camera Recentering During Simulation

**File**: `src/main/use_case/simulation/simulationPresenter.js`
**Lines**: 43-61
**Change**: Removed camera centering logic for both start node and during animation phases

**Before**:
```javascript
case 'center_camera':
    // Center camera on start node
    const startNode = this.viewModel.simulationState.visited[0];
    const actualNode = this.viewModel.graph.getNodeById(startNode.id);
    if (actualNode) {
        this.viewModel.centerOnNode(actualNode, this.mainView.canvas.width, this.mainView.canvas.height);
    }
    this.mainView.redrawSimulation();
    break;

case 'camera_move':
    // Center camera on current node (which is now the toNode after advance)
    const currentNodeData = this.viewModel.simulationState.currentNode;
    const currentActualNode = this.viewModel.graph.getNodeById(currentNodeData.id);
    if (currentActualNode) {
        this.viewModel.centerOnNode(currentActualNode, this.mainView.canvas.width, this.mainView.canvas.height);
    }
    this.mainView.redrawSimulation();
    break;
```

**After**:
```javascript
case 'center_camera':
    // Skip camera centering - maintain original perspective
    this.mainView.redrawSimulation();
    break;

case 'camera_move':
    // Skip camera centering - maintain original perspective
    this.mainView.redrawSimulation();
    break;
```

**Rationale**: Users want to maintain their viewport position throughout the simulation without the camera automatically panning to follow nodes.

---

### 3. Remove Camera Recentering on Double-Click

**File**: `src/main/view/mainView.js`
**Line**: 517
**Change**: Removed camera centering when double-clicking a node to set it as start state

**Before**:
```javascript
// Check if we should center on node (simulate mode double-click)
if (this.viewModel.interaction.shouldCenterOnNode && this.viewModel.interaction.nodeToCenterOn) {
    this.centerOnNode(this.viewModel.interaction.nodeToCenterOn, width, height);
    this.viewModel.interaction.shouldCenterOnNode = false;
    this.viewModel.interaction.nodeToCenterOn = null;
    this.sideBar.updateStartNodeStatus();
}
```

**After**:
```javascript
// Check if we should update after simulate mode double-click
if (this.viewModel.interaction.shouldCenterOnNode && this.viewModel.interaction.nodeToCenterOn) {
    // Skip camera centering - just update UI elements
    this.viewModel.interaction.shouldCenterOnNode = false;
    this.viewModel.interaction.nodeToCenterOn = null;
    this.sideBar.updateStartNodeStatus();
    this.rightPanel.updateContent(); // Update right panel to show new initial state
}
```

**Rationale**: Users want to set the start node without the camera jumping to that node's position.

---

### 4. Update Right Panel on Start Node Selection

**File**: `src/main/view/mainView.js`
**Line**: 521
**Change**: Added call to update right panel when start node is selected

**Addition**:
```javascript
this.rightPanel.updateContent(); // Update right panel to show new initial state
```

**Rationale**: When a user double-clicks a node to set it as the start state, the right panel's "Initial State" section should immediately update to reflect this change.

---

### 5. Remove Start Node Highlighting

**File**: `src/main/adapter/viewmodel/NodeViewModel.js`
**Lines**: 21-25
**Change**: Removed highlighting for the start node in simulate mode

**Before**:
```javascript
// Simulation active: highlight current node
if (this.interactionViewModel.mode === 'simulate' &&
    this.simulationState &&
    this.simulationState.replayInitialized) {
    const currentNode = this.simulationState.currentNode;
    if (currentNode && currentNode.id === this.node.id) {
        return '#FF9800'; // Orange
    }
}

// Simulate mode: highlight start node with orange (same as current state)
if (this.interactionViewModel.mode === 'simulate' &&
    this.interactionViewModel.startNode === this.node) {
    return '#FF9800'; // Orange for start node
}

// Editor mode: existing colors
```

**After**:
```javascript
// Simulation active: highlight current node only
if (this.interactionViewModel.mode === 'simulate' &&
    this.simulationState &&
    this.simulationState.replayInitialized) {
    const currentNode = this.simulationState.currentNode;
    if (currentNode && currentNode.id === this.node.id) {
        return '#FF9800'; // Orange
    }
}

// Editor mode: existing colors
```

**Rationale**: Users only want to see the current node highlighted during simulation, not the start node. The start node should look like a normal node until the simulation reaches it.

---

## Summary of Behavioral Changes

### Before Changes:
1. Zoomed to 500% when centering on nodes
2. Camera automatically panned to follow each node during simulation
3. Camera jumped to start node when double-clicking to select it
4. Start node was highlighted in bright green (#00E676)
5. Right panel didn't update when start node was selected

### After Changes:
1. ✅ Zoom level remains constant throughout simulation
2. ✅ Camera viewport stays in user's chosen position
3. ✅ Double-clicking to set start node doesn't move the camera
4. ✅ Start node has no special highlighting (only current node during simulation is highlighted in orange)
5. ✅ Right panel updates immediately when start node is selected

### User Experience Improvements:
- **Full control**: Users can position their view however they want
- **Less distraction**: No automatic camera movements or unnecessary highlighting
- **Cleaner visualization**: Only the actively executing node is highlighted
- **Better for presentations**: Stable viewport makes it easier to show specific parts of the MDP
- **More predictable**: UI behaves consistently without surprising movements

---

## Files Modified

1. `src/main/adapter/viewmodel/CanvasViewModel.js` - Removed zoom adjustment in `centerOnNode()`
2. `src/main/use_case/simulation/simulationPresenter.js` - Removed camera movements during animation phases
3. `src/main/view/mainView.js` - Removed camera centering on double-click, added right panel update
4. `src/main/adapter/viewmodel/NodeViewModel.js` - Removed start node highlighting

---

## Testing Checklist

- [ ] Set zoom level to 1.0x, verify it stays at 1.0x during entire simulation
- [ ] Position viewport in corner, verify it doesn't move during simulation
- [ ] Double-click a node to set as start state, verify camera doesn't jump
- [ ] Verify right panel "Initial State" updates when start node is double-clicked
- [ ] Verify start node has no special color before simulation starts
- [ ] Verify only current node is orange during simulation
- [ ] Run complete simulation and verify viewport/zoom never changes
