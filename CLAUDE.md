# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

RLViz is a web-based interactive graph editor and simulator for Markov Decision Processes (MDPs). It allows users to create state-action-state graphs, visualize MDP transition matrices, and run animated simulations with trace generation.

## Running the Application

This is a client-side p5.js application with no build step:

- **Run locally**: Open `index.html` in a web browser or use a local server:
  ```bash
  python3 -m http.server 8000
  # Then navigate to http://localhost:8000
  ```

- **No package.json**: This project uses vanilla JavaScript with p5.js loaded from CDN (`libraries/` folder). There is no npm, webpack, or build process.

## Architecture

The codebase follows **Clean Architecture** with clear separation of concerns:

### Layer Structure (loaded in order via index.html)

1. **Domain Layer** (`src/main/domain/`): Core entities with business logic
   - `nodesObj.js`: Base class for all nodes
   - `stateNodes.js`, `actionNodes.js`: MDP state and action node entities
   - `edgeObj.js`: Edge connections between nodes
   - `graphObj.js`: Main graph aggregate containing nodes, edges, and text labels
   - `commandHistory.js`: Command pattern for undo/redo
   - `simulationState.js`: Manages simulation replay state and animation phases
   - `traceGenerator.js`: Generates random MDP traces from a start state
   - `textLabel.js`: Text annotations on canvas

2. **Use Case Layer** (`src/main/use_case/`): Application logic following Input-Interactor-Presenter pattern
   - Each use case has its own folder with: `*InputBoundary.js`, `*InputData.js`, `*Interactor.js`, `*OutputBoundary.js`, `*Presenter.js`
   - Key use cases: `createNode`, `createEdge`, `deleteNode`, `moveNode`, `renameNode`, `selectNode`, `importGraph`, `serializeGraph`, `simulation`, `zoom`, `setMode`, `renormalizeProbabilities`, `setSpinningArrow`

3. **Adapter Layer** (`src/main/adapter/`): Connects domain to view
   - `controller/CanvasController.js`: Handles user input and delegates to interactors
   - `viewmodel/`: View state management
     - `CanvasViewModel.js`: Main view state aggregator
     - `NodeViewModel.js`, `EdgeViewModel.js`: Entity-specific view data
     - `InteractionViewModel.js`: Tracks interaction state (dragging, placing, resizing)
     - `SelectionViewModel.js`: Manages selected entities
     - `ViewportViewModel.js`: Pan and zoom state

4. **View Layer** (`src/main/view/`): p5.js rendering and UI components
   - `mainView.js`: Main canvas rendering and input handling
   - `menuBar.js`: Top menu (Import/Export, Undo/Redo, Zoom)
   - `toolBar.js`: Secondary toolbar (Node creation, Simulation controls)
   - `rightPanel.js`: Side panel showing node/edge properties
   - `helpers/GeometricHelper.js`: Hit testing and geometric calculations

5. **App Bootstrap** (`src/main/app/main.js`): Dependency injection and wiring
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

### Simulation System

The simulation uses a multi-phase animation system:

1. **Trace Generation**: `TraceGenerator` creates random path through MDP
2. **Replay State**: `SimulationState` manages animation phases:
   - `idle`: Waiting between transitions
   - `highlight`: Highlighting available edges
   - `transition`: Animating movement to next node
3. **Visibility Control**: Nodes/edges revealed progressively as simulation runs
4. **Spinning Arrow**: Optional visual animation for probabilistic edge selection

### Command Pattern

All modifying operations (create, delete, move, rename, resize) use the Command pattern for undo/redo:
- Commands stored in `CommandHistory` with configurable stack size (default 50)
- Each command implements `execute()` and `undo()`

## Import/Export Format

Graphs can be exported to JSON with two modes:

1. **Full export** (includePositions=true): Contains node positions, edges, text labels - can be reimported
2. **MDP export** (includePositions=false): Contains only transition matrices P[s][a][s'] and rewards R[s][a][s']

Example exports in `test_schema/` directory.

## Mode System

The application has two modes:

- **Editor mode**: Create, edit, delete nodes and edges
- **Simulate mode**: Run MDP simulations, set start node, view traces

Mode changes clear selection and start node.

## File Organization Patterns

- Use cases follow strict naming: `{action}{Entity}*` (e.g., `createNode`, `deleteNode`, `moveNode`)
- Each use case is self-contained in its own directory
- View models expose read-only state to views
- Controllers never directly modify domain objects - always go through interactors

## Common Workflows

### Adding a New Use Case

1. Create folder in `src/main/use_case/{useCaseName}/`
2. Create files: `{useCaseName}InputBoundary.js`, `{useCaseName}InputData.js`, `{useCaseName}Interactor.js`, `{useCaseName}OutputBoundary.js`, `{useCaseName}Presenter.js`
3. Add script tags to `index.html` in dependency order
4. Wire up in `main.js`: create interactor and presenter, inject into controller
5. Add method to `CanvasController.js` to trigger the use case

### Modifying Graph Serialization

The `Graph.serialize()` method in `src/main/domain/graphObj.js` builds transition matrices and exports graph structure. The `Graph.deserialize()` method reconstructs the graph from JSON.

### Working with Animation Phases

Simulation phases are managed in `SimulationState`. The `SimulationPresenter` orchestrates phase transitions and updates the view model. To modify animation timing, adjust `phaseDuration` values in the simulation interactors.
