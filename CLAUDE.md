# CLAUDE.md guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Typical patterns

We will frequently make use of the Observer pattern, as there are many instances where we update objects in response to a given event. Right now, one of the big problems we face is that we update many buttons manually. Also, we seem to have a issue with magic numbers. 

## Overview

RLViz is a web-based interactive graph editor and simulator for Markov Decision Processes (MDPs). It allows users to create state-action-state graphs, visualize MDP transition matrices, run animated simulations with trace generation, and step through Value Iteration.

## Running the Application

This is a client-side p5.js application with no build step:

- **Run locally**: Open `index.html` in a web browser or use a local server:
  ```bash
  python3 -m http.server 8000
  # Then navigate to http://localhost:8000
  ```

- **No package.json**: This project uses vanilla JavaScript with p5.js loaded from the `libraries/` folder. There is no npm, webpack, or build process.

- **Script load order matters**: All JS files are loaded via `<script>` tags in `index.html`. Dependencies must be listed before dependents.

## Architecture

The codebase follows **Clean Architecture** with clear separation of concerns:

### Layer Structure (loaded in order via index.html)

1. **Domain Layer** (`src/main/domain/`): Core entities with business logic
   - `command.js`: Base `Command` class and all concrete command implementations (Add/Delete Node, Add/Delete Edge, Move, Rename, Resize, RenormalizeCommand, SetImageCommand, AddTextLabelCommand, etc.)
   - `commandHistory.js`: Stores the command stack for undo/redo (default 50 entries)
   - `nodesObj.js`: Base class for all nodes
   - `stateNodes.js`, `actionNodes.js`: MDP state and action node entities
   - `edgeObj.js`: Edge connections between nodes
   - `graphObj.js`: Main graph aggregate managing nodes, edges, and text labels
   - `simulationState.js`: Phase state machine for simulation animation (`idle` → `highlight` → `transition`)
   - `valueIterationState.js`: Phase + sub-phase state machine for VI animation; also runs full VI computation and stores history, Q-values, best actions, and backup details
   - `traceGenerator.js`: Generates random MDP traces from a start state
   - `viewportState.js`: Pan and zoom state in the domain
   - `textLabel.js`: Text annotations on canvas

2. **Use Case Layer** (`src/main/use_case/`): Application logic following Input-Interactor-Presenter pattern
   - Each use case has its own folder with: `*InputBoundary.js`, `*InputData.js`, `*Interactor.js`, `*OutputBoundary.js`, `*Presenter.js`
   - Key use cases: `createNode`, `createEdge`, `createTextLabel`, `deleteNode`, `moveNode`, `renameNode`, `resizeNode`, `nodeInteraction`, `selectNode`, `setImage`, `importGraph`, `serializeGraph`, `renormalizeProbabilities`, `setSpinningArrow`, `zoom`, `setMode`, `undo`, `redo`
   - **Simulation** (`simulation/`): Split into separate play/pause/reset/step/skip interactors plus a shared `simulationAnimator.js` that drives phase transitions and updates the view model
   - **Value Iteration** (`valueIteration/`): Same pattern as simulation — separate run/play/pause/reset/step/skip interactors plus a `viAnimator.js` and `viPresenter.js`

3. **Adapter Layer** (`src/main/adapter/`): Connects domain to view
   - `controller/CanvasController.js`: Handles user input and delegates to interactors
   - `viewmodel/CanvasViewModel.js`: Main view state aggregator
   - `viewmodel/NodeViewModel.js`, `EdgeViewModel.js`: Entity-specific view data
   - `viewmodel/InteractionViewModel.js`: Tracks interaction state (dragging, placing, resizing)
   - `viewmodel/SelectionViewModel.js`: Manages selected entities
   - `viewmodel/ViewportViewModel.js`: Pan and zoom state
   - `viewmodel/ValueIterationViewModel.js`: VI animation state exposed to the view

4. **View Layer** (`src/main/view/`): p5.js rendering and UI components
   - `mainView.js`: Main canvas rendering and input handling
   - `menuBar.js`: Top menu (Import/Export, Undo/Redo, Zoom)
   - `toolBar.js`: Secondary toolbar (Node creation, Simulation controls, VI controls)
   - `rightPanel.js`: Side panel showing node/edge properties
   - `valueIterationView.js`: Renders the VI table overlay with tween animations (`VITweenEngine`)
   - `rewardParticleSystem.js`: Particle burst effect when rewards are collected during simulation
   - `helpers/GeometricHelper.js`: Hit testing and geometric calculations
   - `helpers/line_drawers.js`, `alpha_codes.js`, `button_indices.js`, `panel_rules.js`, `policy_indices.js`: Drawing helpers and index constants

5. **Constants** (`libraries/rules/`): Global visual and timing constants (imported as ES modules)
   - `color_palette_rules.js`: Named color constants `COLOR_1`…`COLOR_18` (RGB arrays)
   - `speed_preset_rules.js`: `SPEED_PRESETS` (fast/medium/slow) with named phase durations; `DEFAULT_SPEED`
   - `decimal_precision_rules.js`: Floating-point display precision per field type
   - `text_size_rules.js`, `visual_offset_rules.js`: Layout constants

6. **App Bootstrap** (`src/main/app/main.js`): Dependency injection and wiring
   - Creates all domain entities, interactors, presenters, and controller
   - Sets up p5.js lifecycle hooks

## Key Domain Concepts

### MDP Graph Structure

- **State Nodes**: Contain list of available action IDs
- **Action Nodes**: Contain list of transitions (SAS = State-Action-State)
  - Each transition has: `nextState` (ID), `probability`, `reward`
  - Probabilities should sum to 1.0 (enforced by renormalization)
- **Edges**: Visual representation of state→action or action→state connections
- **Graph**: Root aggregate managing all nodes and edges

### Mode System

The application has three modes:

- **Editor mode**: Create, edit, delete nodes and edges
- **Simulate mode**: Run MDP simulations, set start node, view animated traces
- **Value Iteration mode**: Configure horizon T and discount γ, then step through the VI backup animation

Mode changes clear selection and start node.

### Simulation System

The simulation uses a multi-phase animation system:

1. **Trace Generation**: `TraceGenerator` creates a random path through the MDP
2. **Replay State**: `SimulationState` manages animation phases (`idle` → `highlight` → `transition`)
3. **Animator**: `simulationAnimator.js` drives phase transitions each frame
4. **Visibility Control**: Nodes/edges revealed progressively as simulation runs
5. **Spinning Arrow**: Optional visual animation for probabilistic edge selection
6. **Speed**: Phase durations come from `SPEED_PRESETS` in `libraries/rules/speed_preset_rules.js`

### Value Iteration System

`ValueIterationState.computeHistory(graph, T, gamma)` runs the full VI computation upfront and stores:
- `history[i]` — V-table at timestep T-i
- `qValues[i][stateId]` — Q-values per state per timestep
- `bestActions[i][stateId]` — greedy action at each step
- `backupDetails[i][stateId]` — full Bellman backup breakdown for animation

`viAnimator.js` then animates through columns (timesteps) and rows (states) using a sub-phase state machine:
`idle → show_equation → show_actions → show_transitions → compute_q_values → select_max → revealing_value`

The `valueIterationView.js` uses `VITweenEngine` for smooth per-cell number animations.

### Command Pattern

All modifying operations use the Command pattern for undo/redo. Concrete commands are defined in `command.js`:
- `AddNodeCommand`, `DeleteNodeCommand`, `MoveNodeCommand`, `ResizeNodeCommand`
- `AddEdgeCommand`, `DeleteEdgeCommand`
- `AddTextLabelCommand`, `DeleteTextLabelCommand`, `MoveTextLabelCommand`
- `RenameNodeCommand`, `RenormalizeCommand`, `SetImageCommand`

Commands are pushed to `CommandHistory` (default stack size 50). `UndoInteractor` and `RedoInteractor` pop/replay them.

## Import/Export Format

Graphs can be exported to JSON with two modes:

1. **Full export** (`includePositions=true`): Contains node positions, edges, text labels — can be reimported
2. **MDP export** (`includePositions=false`): Contains only transition matrices P[s][a][s'] and rewards R[s][a][s']

Example exports in `test_schema/` directory.

## Common Workflows

### Adding a New Use Case

1. Create folder in `src/main/use_case/{useCaseName}/`
2. Create files: `{useCaseName}InputBoundary.js`, `{useCaseName}InputData.js`, `{useCaseName}Interactor.js`, `{useCaseName}OutputBoundary.js`, `{useCaseName}Presenter.js`
3. Add `<script>` tags to `index.html` in dependency order
4. Wire up in `main.js`: create interactor and presenter, inject into controller
5. Add method to `CanvasController.js` to trigger the use case

### Modifying Animation Timing

Phase durations for simulation come from `SPEED_PRESETS` in `libraries/rules/speed_preset_rules.js`. VI sub-phase durations are set in `viAnimator.js` via `state.setPhase(phase, durationMs)`.

### Modifying Graph Serialization

`Graph.serialize()` in `src/main/domain/graphObj.js` builds transition matrices and exports graph structure. `Graph.deserialize()` reconstructs the graph from JSON.

### Adding New Visual Constants

Add named exports to the appropriate file in `libraries/rules/` and import them where needed. Avoid raw magic numbers in rendering code.
