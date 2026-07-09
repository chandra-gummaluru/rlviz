# RLViz - MDP Graph Editor and Simulator

An interactive web-based tool for creating, editing, and simulating Markov Decision Processes (MDPs). Build state-action-state graphs visually, run animated Monte Carlo rollouts, and step through Value Iteration / a manually-edited "Learning Iteration" Q-table — all in a theme-aware (light/dark) UI.

## Features

- **Visual MDP Editor**: Create state and action nodes, connect them with probabilistic transitions, annotate the canvas with text labels
- **Build & Policy Modes**: Full graph editing plus a dedicated Policy π editor (deterministic or weighted-random actions per state)
- **Trace Simulation**: Animate a sampled rollout through the graph with Play/Step/Reset and an optional "spinning arrow" visualization of probabilistic edge selection
- **Values Mode**: A Monte Carlo sub-view (many parallel rollouts with per-state aggregate stats) and a 2×2 Value Iteration method matrix — Value Iteration, Learning Iteration, Belief Iteration, and PO Q-Learning — selected via the P known/unknown and full/partial observability toggles
- **Import/Export**: Full graph export (positions, edges, text labels — reimportable) or MDP-only export (transition/reward matrices), plus PNG export and a recent-files menu
- **Undo/Redo**: Full command history with a 50-level undo stack
- **Graph Analysis**: Automatic probability normalization and transition-matrix generation
- **Light/Dark Theme**: A single token-based palette drives both canvas rendering and DOM chrome
- **Clean Architecture**: Well-structured codebase following separation of concerns

## Getting Started

### Running the Application

No build process required - this is a vanilla JavaScript application using p5.js (no bundler, no `package.json`, no npm scripts):

```bash
# Option 1: Open directly in browser
open index.html

# Option 2: Use a local server (recommended - avoids file:// restrictions)
python3 -m http.server 8000
# Then navigate to http://localhost:8000
```

There is no automated test suite. `test_schema/` holds example MDP graph JSON fixtures for manually exercising Import/Export.

### Basic Usage

1. **Build mode** (default) — unified editing + trace simulation:
   - Use the floating tool palette (top-left) to select the Select / Add State / Add Action / Add Text tool
   - Click and drag nodes to move them; drag a node's edge to resize it
   - Click two different node types (a state then an action, or vice versa) to create an edge
   - Double-click a node to rename it; double-click a text label's corner to resize it
   - Right-click a state node to set it as the start node (s₀)
   - Select an element and press Delete/Backspace to remove it
   - Use Run/Step/Reset to play a sampled trace through the graph

2. **Policy mode** — identical canvas to Build mode, but the right panel's default view is a Policy π editor: toggle each state between Deterministic (pick one action) and Random (weighted sliders per action)

3. **Values mode** — estimator sub-views, switched via the floating pill at top-center:
   - **Monte Carlo**: generate and display many rollouts at once (4/8/16/32/64 panels), with a shared scrubber and per-state aggregate stats
   - **Method** (Value Iteration / Learning Iteration / Belief Iteration / PO Q-Learning): step through the real Bellman-backup computation, or — when P is marked "unknown" — edit the Q-table directly. Which of the four quadrants you see depends on the P known/unknown and full/partial observability toggles in the Parameters popover
   - Both sub-views show an "Estimate vs exact" comparison table per state

## Architecture

Built with **Clean Architecture** principles:

- **Domain Layer**: MDP entities (nodes, edges, graph, text labels, simulation/value-iteration/expectation state)
- **Use Case Layer**: Application logic, one folder per use case (create/delete/move/rename nodes, simulation replay, Value Iteration, Monte Carlo, import/export, ...)
- **Adapter Layer**: View models and controller — the controller is the sole entry point for user input and delegates to interactors
- **View Layer**: p5.js canvas rendering plus DOM chrome (top bar, floating tool palette/pills, right panel, chart dock)

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## MDP Concepts

### Graph Structure

- **State Nodes**: Represent states in the MDP, contain available actions
- **Action Nodes**: Represent actions, contain probabilistic transitions to next states
- **Transitions**: Each action→state transition has a probability and reward
- **Probabilities**: Automatically normalized to sum to 1.0 per action

### Simulation

The simulator generates a random trace through the MDP by:
1. Starting at the selected start state
2. Selecting an action per the current policy (deterministic match, then weighted-if-present, then uniform fallback)
3. Sampling the next state based on transition probabilities
4. Repeating until no more actions are available

### Monte Carlo & Value Iteration

- **Monte Carlo** generates many independent rollouts from the start state and aggregates per-state statistics across them
- **Value Iteration** runs the real Bellman-backup computation and animates it column by column; when P is marked "unknown" the computed Q-values become directly editable ("Learning Iteration") instead of being recomputed by an algorithm
- The two partial-observability quadrants (Belief Iteration, PO Q-Learning) are illustrative relabelings of Value Iteration's real numbers, not true POMDP algorithms

## File Structure

```
rlviz/
├── index.html           # Main HTML with script loading order (domain → use cases → adapter → view → app)
├── style.css            # Styling, incl. CSS custom properties mirrored from AppPalette
├── libraries/            # p5.js and other vendored libraries
├── src/main/
│   ├── domain/           # Core entities (Graph, Node, Edge, TextLabel, SimulationState, ValueIterationState, ExpectationState)
│   ├── use_case/         # Application logic, one folder per use case (Input-Interactor-Presenter pattern)
│   ├── adapter/
│   │   ├── controller/   # CanvasController - entry point for all user input
│   │   └── viewmodel/    # CanvasViewModel and per-entity/sub-mode view models
│   ├── view/             # mainView (canvas), topBar, toolPalette, estimatorPill/mcRunsPill/zoomPill,
│   │                     # rightPanel, expectationView, valueIterationView, chartDock, helpers/
│   └── app/               # main.js - dependency injection and p5.js bootstrap
└── test_schema/          # Example MDP graph JSON fixtures for Import/Export
```

## Controls

### Keyboard Shortcuts

- `Cmd/Ctrl + Z`: Undo
- `Cmd/Ctrl + Shift + Z`: Redo
- `Cmd/Ctrl + C` / `Cmd/Ctrl + V`: Copy / paste the selected node
- `Delete` / `Backspace`: Delete selected element
- `R`: Reset zoom to default
- `S`: Export graph to console (for debugging)
- `Cmd/Ctrl + O` / `Cmd/Ctrl + S`: Open / Save (from the filename menu)

### Mouse Controls

- **Left Click**: Select a node/edge, or place a node/text label while a placement tool is active
- **Click + Drag**: Move a node or text label (Build/Policy mode); pan the canvas when starting on empty space
- **Double Click**: Rename a node, or resize a text label from its corner handle
- **Right Click**: Set the clicked state node as the start node (s₀) (Build/Policy mode)
- **Shift + Drag on node edge**: Resize node
- **Mouse Wheel**: Zoom in/out (only when the cursor is over the canvas itself)

## Contributing

The codebase follows strict architectural patterns. See [CLAUDE.md](CLAUDE.md) for:
- How to add new use cases
- File organization conventions
- Common development workflows

## License

[Add your license here]
