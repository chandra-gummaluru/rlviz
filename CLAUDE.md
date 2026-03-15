# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

rlviz is an interactive browser-based tool for creating and simulating Markov Decision Processes (MDPs). Built with p5.js and vanilla JavaScript ES6+, it implements Clean Architecture with SOLID principles.

## Running the Application

### Local Development Server (Recommended)
```bash
# Navigate to project folder
cd "/Users/oscaryasunaga/Desktop/proj/rlviz ai"

# Start HTTP server (Python 3)
python -m http.server 8000

# Open browser to http://localhost:8000
```

### Alternative: Direct File Opening
Simply open `index.html` in a browser (may have CORS limitations).

## Architecture

The codebase follows **Clean Architecture with MVCP (Model-View-Controller-Presenter)** pattern and strict dependency rules:

```
Domain → Use Case → Adapter → View → App
(inner)           (Controller/ViewModel)  (outer)
```

### Layer Responsibilities

**Domain Layer** (`src/main/domain/`)
- Core business entities with NO external dependencies
- `Graph`: Central data structure holding nodes, edges, and text labels
- `StateNodes`, `ActionNodes`: MDP node types with adjacency lists
- `EdgeObj`: Connections between nodes with probability/reward
- `Command`: Base class for undo/redo pattern (10+ command types)
- `CommandHistory`: Command stack with 50-item limit
- `SimulationState`: State machine for MDP trace playback
- `TraceGenerator`: Creates random execution traces through MDP

**Use Case Layer** (`src/main/use_case/`)
- Application workflows as Interactor + Presenter pairs
- Each use case has its own folder with 5 files:
  - `*InputBoundary.js`: Interface definition
  - `*InputData.js`: Request model
  - `*Interactor.js`: Business logic orchestration
  - `*OutputBoundary.js`: Response interface
  - `*Presenter.js`: Formats output for ViewModel
- Use cases: `createNode`, `createEdge`, `deleteNode`, `moveNode`, `renameNode`, `selectNode`, `createTextLabel`, `renormalizeProbabilities`, `nodeInteraction`, `serializeGraph`, `importGraph`, `simulation` (play/skip/reset), `resizeNode`, `undo`, `redo`, `zoom`, `setMode`

**Adapter Layer** (`src/main/adapter/`)
- **Controller** (`controller/CanvasController.js`):
  - Receives user input from View
  - Translates events to Use Case input data
  - Delegates to appropriate Interactors
  - NO state management, NO business logic
- **ViewModels** (`viewmodel/`):
  - `CanvasViewModel`: Coordinator for sub-ViewModels (145 lines, down from 871)
  - `SelectionViewModel`: Manages selection state (nodes, edges, text labels)
  - `ViewportViewModel`: Manages zoom/pan state and transformations
  - `InteractionViewModel`: Manages drag, resize, placement, rename requests
  - `NodeViewModel`: Node presentation logic (colors based on selection/simulation)
  - `EdgeViewModel`: Edge presentation logic (reward-based color gradients)

**View Layer** (`src/main/view/`)
- `MainView`: p5.js canvas rendering and input handling
- `MenuBar`: Top menu bar with File, Edit, View menus (Row 1 of UI layout)
- `ToolBar`: Contextual toolbar with mode-dependent buttons (Row 2 of UI layout)
- `RightPanel`: Information panel displaying MDP state/action space and node editing
- `buttons/`: Individual button components
- `helpers/GeometricHelper`: Geometric calculations (hit detection, curves, distances)

**App Layer** (`src/main/app/`)
- `main.js`: Dependency injection and p5.js lifecycle hooks
- Manual wiring: Domain → Interactors → Presenters → ViewModels → Controller → Views

### Dependency Injection Pattern

All dependencies are manually wired in `src/main/app/main.js`:

1. Create Domain objects (Graph, CommandHistory, SimulationState, TraceGenerator)
2. Create CanvasViewModel (NO interactor references - pure state)
3. Create all Presenters (receive appropriate ViewModel/sub-ViewModel references)
4. Create all Interactors (receive Domain objects + Presenter references)
5. Create CanvasController (receives ViewModel + ALL interactors)
6. Create View components in `setup()` (receive ViewModel + Controller references)
7. Create SimulationPresenter and its Interactors (need both ViewModel AND MainView)

**IMPORTANT**:
- ViewModel has NO references to Interactors (one-way dependency)
- Controller holds ALL interactor references
- SimulationPresenter requires both ViewModel AND MainView, so it must be created inside p5's `setup()` function after MainView is instantiated
- Views delegate ALL user actions to Controller, which delegates to Interactors

### Script Loading Order

`index.html` loads scripts in strict dependency order:
1. Domain layer (nodesObj → stateNodes/actionNodes/textLabel → edgeObj → graphObj → command → commandHistory → simulationState → traceGenerator)
2. Use Case folders (each folder's 5 files in order: InputBoundary → InputData → Interactor → OutputBoundary → Presenter)
3. Adapter layer ViewModels (SelectionViewModel → ViewportViewModel → InteractionViewModel → NodeViewModel → EdgeViewModel → CanvasViewModel)
4. Adapter layer Controller (CanvasController)
5. View layer helpers (GeometricHelper)
6. View layer (buttons → sideBar → mainView)
7. App bootstrap (main.js)

**Never reorder scripts** - breaks dependencies. The order ensures inner layers load before outer layers.

## Data Model

### MDP Graph Structure

**State Nodes**
- Properties: `id`, `type: 'state'`, `name`, `actions` (list of action IDs), `size` (10-100px radius)
- Methods: `addAction(actionId)`, `delAction(actionId)`

**Action Nodes**
- Properties: `id`, `type: 'action'`, `name`, `sas` (list of transitions), `size`
- Transition format: `{ nextState: stateId, probability: 0.0-1.0, reward: number }`
- Methods: `addTransition(stateId, prob, reward)`, `renormalizeProbabilities(forceNormalize = false)`
  - Auto-normalization: Only normalizes when sum > 1 (prevents rounding errors)
  - Force-normalization: When `forceNormalize = true`, always normalizes to exactly 1.0 (used by Renormalize button)

**Edges**
- Connect nodes via references (not IDs)
- Automatic bidirectional curve rendering when edges exist in both directions
- Reward-based color gradients (green for positive, red for negative, gray for zero)

### Export Format

The `serializeGraph` use case generates **dual representation** JSON:

```javascript
{
  "nodes": [
    // Adjacency list format for visualization/editing
    { "id": 0, "type": "state", "name": "S0", "actions": [0, 1], "size": 30 },
    { "id": 0, "type": "action", "name": "A0", "transitions": [{...}] }
  ],
  "transitionMatrix": {
    // Standard MDP format for RL algorithms
    "states": [0, 1, 2],
    "stateNames": ["S0", "S1", "S2"],
    "actions": [0, 1],
    "actionNames": ["A0", "A1"],
    "P": [[[...], ...], ...],  // P[s][a][s'] = probability
    "R": [[[...], ...], ...]   // R[s][a][s'] = reward
  }
}
```

Matrix dimensions: `P` and `R` are both `[#states][#actions][#states]` 3D arrays following Sutton & Barto notation.

## Command Pattern

All reversible operations use the Command pattern for undo/redo:

- `AddNodeCommand`, `DeleteNodeCommand`, `MoveNodeCommand`
- `AddEdgeCommand`, `DeleteEdgeCommand`
- `RenameNodeCommand`, `ResizeNodeCommand`
- `AddTextLabelCommand`, `DeleteTextLabelCommand`, `EditTextLabelCommand`

Commands stored in `CommandHistory` with 50-item limit. Executing a new command clears the redo stack.

## Application Modes

The app has two modes managed by `SetModeInteractor`:

**Editor Mode** (default)
- Create/delete/move/resize nodes
- Create edges with probability/reward prompts
- Rename nodes (double-click)
- Add text labels
- Full undo/redo support

**Simulate Mode**
- Set start node (double-click state → bright green)
- Play/Skip/Reset controls for trace playback
- Phase-based animation (approach → edge highlight → exit)
- Camera follows simulation with easing
- Real-time simulation statistics in right panel:
  - Initial state and current state
  - Total accumulated reward (color-coded)
  - Step count (state→action→state transitions)
  - Decision probabilities p(a|s) when at a state
  - Outcome probabilities p(s'|a,s) when at an action
- No graph editing allowed

## UI Layout

The application follows a three-section layout:

**Row 1 - Top Menu Bar** (always visible, 40px height)
- Black background (#000000) with white text (#FFFFFF)
- **File Menu**: Import, Export
- **Edit Menu**: Undo (Ctrl+Z), Redo (Ctrl+Shift+Z)
- **View Menu**: Zoom In, Zoom Out, Reset Zoom
- Dropdown menus with keyboard shortcuts displayed
- Implemented in `menuBar.js`

**Row 2 - Contextual Toolbar** (always visible, 50px height, mode-dependent)
- Light gray background (#F5F5F5)
- **Left side**: Mode-specific buttons
  - Edit Mode: Add State (green), Add Action (blue), Add Text (gray), Renormalize (orange)
  - Simulate Mode: Play (green), Step (blue), Rerun (orange)
- **Right side**: Edit/Simulate mode toggle (segmented control)
- Implemented in `toolBar.js`

**Main Workspace** (canvas + right panel)
- **Canvas** (left side, dynamic width = window width - 300px)
  - Graph visualization and editing
  - Positioned below menu bar and toolbar (90px total offset)
  - Uses Calibri font for all text rendering
- **Right Panel** (300px width, white background)
  - When no node selected: Displays MDP information
    - Title: "Markov Decision Process" with LaTeX tuple ⟨S, s₀, A, P, r, γ⟩
    - State space: S = {s₀, s₁, s₂, ...} (shows first 5, then ellipsis)
    - Action space: A = {a₀, a₁, a₂, ...} (shows first 5, then ellipsis)
    - Probability: P[s][a][s'] with dimensions
    - Reward: R[s][a][s'] with dimensions
    - Discount factor (γ) with editable input (0.0 - 1.0)
  - When node selected: Displays node editor
    - Name editing with save button (integrates with double-click rename)
    - Image upload/remove functionality (base64 data URLs)
    - State nodes: Shows available actions
    - Action nodes: Shows transitions with probabilities and rewards
  - Mathematical notation rendered with MathJax
  - Scalable display for large MDPs
  - Implemented in `rightPanel.js`

## Simulation System

**TraceGenerator** (`domain/traceGenerator.js`)
- Generates random execution traces through MDP
- Walks from start state following probability-weighted transitions
- Outputs sequence of state/action pairs

**SimulationState** (`domain/simulationState.js`)
- State machine: `notInitialized → initialized → playing/paused → finished`
- Manages replay phases: `approach → edgeHighlight → exit`
- Frame-based timing for smooth animation

**SimulationPresenter** (`use_case/simulation/simulationPresenter.js`)
- Controls MainView camera and rendering during playback
- Phase-specific animations and highlights

## Key Features

### Node Resizing
- Click within 8px of node circumference and drag
- Size range: 10-100 pixel radius
- Affects edge start/end point calculations
- Uses `ResizeNodeCommand` for undo/redo

### Bidirectional Curved Edges
- Automatically detect edges in both directions between same nodes
- Render as Bezier curves with 15% offset from center line
- **Arrowhead positioning algorithm**:
  1. Calculate quadratic Bezier curve from `from.x, from.y` to `to.x, to.y` (center-to-center)
  2. Control point: `(from.x + to.x) / 2 + perpendicular * 15%`
  3. Binary search (10 iterations) finds exact `t` value where curve intersects node circumference
  4. Calculate tangent vector at intersection point: `derivative of quadratic Bezier at t`
  5. Stop curve at `arrowTip - tangent * arrowSize` to avoid overlapping arrowhead
  6. Draw arrowhead at intersection point with tangent direction
- Curves stop at arrowhead base (not node center) for clean visual appearance
- Click detection on visible curve pixels only (excludes portions inside node circles)
- Implementation in `mainView.js:drawCurvedEdge()`

### Edge Selection (Pixel-Perfect)
- `isPointNearVisibleLine()`: Calculates line segment from edge of from-node to edge of to-node (not center-to-center)
- `isPointNearVisibleCurve()`: Samples 20 points on Bezier curve, filters points inside node circles
- 10px selection threshold
- Clicking inside node circle always selects node, never edge

### Viewport Controls
- Pan: drag canvas (when not dragging node)
- Zoom: mouse wheel or zoom buttons (centers on mouse position)
- Reset: Press `R` key
- Zoom state managed in `CanvasViewModel.viewportState`

## Keyboard Shortcuts

- `S`: Export graph to console (JSON.stringify)
- `R`: Reset zoom/pan to default
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z`: Redo
- `Delete`/`Backspace`: Delete selected item

## Development Guidelines

### Adding a New Use Case

1. Create folder in `src/main/use_case/yourUseCase/`
2. Implement the 5 files:
   - `yourUseCaseInputBoundary.js` (interface)
   - `yourUseCaseInputData.js` (request model)
   - `yourUseCaseInteractor.js` (business logic)
   - `yourUseCaseOutputBoundary.js` (response interface)
   - `yourUseCasePresenter.js` (formats for ViewModel)
3. Add scripts to `index.html` in dependency order (InputBoundary → InputData → Interactor → OutputBoundary → Presenter)
4. Wire up in `src/main/app/main.js`:
   - Create Presenter (receives appropriate ViewModel or sub-ViewModel)
   - Create Interactor (receives Domain objects + Presenter)
   - Add Interactor to Controller's interactors object
5. Add method to CanvasController to invoke the new Interactor
6. Call from View via Controller (e.g., `controller.yourAction()`)

### Adding a New Command

1. Extend `Command` base class in `src/main/domain/command.js`
2. Implement `execute()`, `undo()`, `getDescription()`
3. Store necessary state for reversal (old/new values)
4. Create and push to `CommandHistory` in appropriate Interactor
5. Ensure `execute()` is idempotent (can be called multiple times)

### Modifying the Graph Structure

When changing `Graph`, `StateNodes`, or `ActionNodes`:
- Update `buildTransitionMatrix()` in `graphObj.js` (export format)
- Update `importGraph()` logic in `importGraphInteractor.js`
- Test export/import roundtrip
- Consider backward compatibility with existing JSON files

### Working with p5.js

- Global p5 functions: `setup()`, `draw()`, `mousePressed()`, etc. are in `main.js`
- All delegated to `MainView` methods
- `noLoop()` mode by default - call `redraw()` after state changes
- Use `push()`/`pop()` for transformation matrix isolation
- Canvas coordinates transformed by viewport (pan/zoom) in `MainView.applyViewportTransform()`
- All text rendered in Calibri font family: `'Calibri, "Segoe UI", Tahoma, sans-serif'`

### Node Placement

New nodes are created at the **center of the canvas** in world coordinates:
- Calculate canvas center in screen coordinates (accounting for menu bar 40px + toolbar 50px)
- Convert to world coordinates using `viewport.screenToWorld()`
- This ensures nodes appear at the visual center regardless of current zoom/pan state
- Implementation in `CanvasController.startNodePlacement()`

## Common Tasks

### Debug Graph Structure
```javascript
// In browser console (press S or add breakpoint)
console.log(graph.nodes);
console.log(graph.edges);
console.log(canvasViewModel);
```

### Test Serialization
```javascript
// Press S key to log JSON to console
// Or click Export Graph button to download
```

### Trace Simulation Issues
```javascript
console.log(simulationState.currentPhase);
console.log(simulationState.isPlaying);
console.log(canvasViewModel.startNode);
```

### Check Command History
```javascript
console.log(commandHistory.undoStack);
console.log(commandHistory.redoStack);
```

## Browser Compatibility

- Modern browsers only (ES6+ required)
- No transpilation or build step
- CORS issues if opening file directly (use local server)
- Tested on Chrome, Firefox, Safari, Edge

## MVCP Architecture (2026-03-01 Refactoring)

The codebase was refactored from a monolithic 871-line CanvasViewModel into a clean MVCP architecture:

### Before Refactoring
- Single 871-line CanvasViewModel with multiple responsibilities
- ViewModel directly created and executed Commands (violated Clean Architecture)
- Business logic mixed with presentation logic
- Difficult to test and maintain

### After Refactoring
- **5 focused ViewModels** (162 lines total): SelectionViewModel, ViewportViewModel, InteractionViewModel, NodeViewModel, EdgeViewModel
- **CanvasController** (479 lines): All input handling, delegates to Use Cases
- **GeometricHelper** (186 lines): All geometric calculations extracted from ViewModel
- **5 new Use Cases** (25 files): DeleteNode, MoveNode, RenameNode, SelectNode, CreateTextLabel
- **Clean separation**: View → Controller → Interactor → Presenter → ViewModel → Domain

### Key Architectural Decisions

**Controller Pattern**
- View delegates ALL user actions to Controller
- Controller translates events to InputData objects
- Controller delegates to appropriate Interactors
- Controller has NO state, NO business logic

**ViewModel Composition**
- CanvasViewModel acts as coordinator
- Composition over inheritance (has-a, not is-a)
- Each sub-ViewModel has single responsibility
- Factory methods create presentation ViewModels (NodeViewModel, EdgeViewModel)

**Two-Stage Interaction Pattern**
For operations requiring user input (rename, create text label):
1. **Stage 1**: Controller calls `interactor.requestAction()` → Presenter sets flag in ViewModel
2. **Stage 2**: View checks flag, prompts user, then calls `interactor.executeAction(inputData)`

Example (Rename Node):
```javascript
// Stage 1: User double-clicks node
controller.handleMousePress() → renameNodeInteractor.requestRename() →
presenter.presentRenameRequested() → viewModel.interaction.renameRequested = true

// Stage 2: View checks flag in draw loop
if (viewModel.interaction.renameRequested) {
  const newName = prompt(...);
  renameNodeInteractor.executeRename(new RenameNodeInputData(nodeId, newName));
}
```

**Important Gotchas**

1. **Falsy ID Check Bug**: Never use `if (inputData.nodeId)` - fails for ID 0. Use `if (inputData.nodeId !== undefined && inputData.nodeId !== null)`
2. **Property Access Changes**: After refactoring, many properties moved:
   - `viewModel.zoom` → `viewModel.viewport.zoom`
   - `viewModel.selectedNode` → `viewModel.selection.selectedNode`
   - `viewModel.placingMode` → `viewModel.interaction.placingMode`
3. **Controller Order Matters**: In `handleMousePress`, check for edge creation BEFORE starting node drag
4. **State Cleanup**: Always clear interaction states when clicking empty canvas

See `REFACTOR_COMPLETE.md` and `DEBUGGING.md` for detailed information.
- memorize