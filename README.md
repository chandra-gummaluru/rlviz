# RLViz - MDP Graph Editor and Simulator

An interactive web-based tool for creating, editing, and simulating Markov Decision Processes (MDPs). Build state-action-state graphs visually, run animated Monte Carlo rollouts, step through Value Iteration to ε-convergence (or a manually-edited "Learning Iteration" Q-table when P is unknown), and exactly evaluate whatever policy — stationary or time-dependent — you've configured, all in a theme-aware (light/dark) UI.

## Features

- **Visual MDP Editor**: Create state and action nodes, connect them with probabilistic transitions, annotate the canvas with text labels
- **Build & Policy Modes**: Full graph editing plus a dedicated Policy π editor — Stationary (deterministic or weighted-random actions per state) or time-dependent π_t (a per-timestep action — deterministic, weighted-random, or uniform — driven by a horizon slider and time pager, with its own finite-horizon backward-induction evaluation)
- **Trace Simulation**: Animate a sampled rollout through the graph with Play/Step/Reset and an optional "spinning arrow" visualization of probabilistic edge selection
- **Monte Carlo & Iteration Modes**: A goal-card entry point into Values mode, each landing on a persistent 52/48 split canvas — Monte Carlo (many parallel rollouts + a Grid/Chart toggle) and Iteration, a 2×2 method matrix (Value Iteration, Learning Iteration, Belief Iteration, PO Q-Learning) selected via the P known/unknown and full/partial observability toggles, with a States/Explain/Backward/Chart view split and a live ε-convergence stop condition (not a fixed sweep count)
- **Find Optimal π**: In the Value Iteration quadrant, a dedicated "★ Find optimal π" run drives the same backup-reveal animation to the true Bellman-optimality (`max_a`) fixed point, with its own ending choreography and a one-click path to log the resulting optimal policy
- **Evaluate π / Policy log**: Compute the exact value of whatever policy is currently configured via the Bellman expectation equation (not the optimal V* from Value Iteration, nor a Monte Carlo estimate) — named, capped at 6 entries, renamable/removable, with hover-preview and click-to-restore; the Monte Carlo Chart view can overlay any logged policy's exact value-over-time curve and sampled return-distribution histogram for direct comparison
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

2. **Policy mode** — identical canvas to Build mode, but the right panel's default view is a Policy π editor: toggle each state between Deterministic (pick one action) and Random (weighted sliders per action) under **Stationary**, or switch to **π_t (time-dep)** to set a different action per timestep, up to a max-steps horizon

3. **Monte Carlo / Iteration modes** — clicking either top-bar segment enters Values mode via a goal card ("Want to find V^π(S₀)?"); picking a scene lands on a persistent 52%/48% split canvas:
   - **Monte Carlo**: left pane toggles Grid (many rollouts at once — 16/32/64 panels via the runs pill) or Chart (Convergence/Histogram, plus a "+ Log π" chip strip that overlays any logged policy's exact value curve and return histogram); right pane always shows the live MDP graph, highlighting whichever rollout is selected
   - **Iteration**: left pane shows one dashed-bordered section per computed sweep (only the live one stays expanded) with an animated per-state backup-reveal card (ghost-subtree value marker, edge flare, a live equation zone that substitutes each term into `Q(s,a)`); right pane toggles Explain (a plain-language narration of the same reveal) / Backward (grouped by target state — only with an active π_t policy) / Chart (a per-sweep Q-table + Convergence chart). The stop condition is ε-convergence (`‖V_{t+1} − V_t‖ < ε`, configurable in Parameters), not a fixed sweep count — `T` is just a safety cap. In the real Value Iteration quadrant, a **★ Find optimal π** run replays the same reveal choreography to the true `max_a` fixed point, with its own ending and a one-click way to log the result
   - Both modes expose an **Evaluate π** button (top bar) that computes the current policy's exact value and, via a name prompt (pre-filled `π1, π2, ...`), appends it to the shared Policy log (right panel — capped at 6 entries, rename by double-click, remove with ×), independent of whatever Monte Carlo/Iteration happen to be showing

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

### Three ways to get a "value"

- **Monte Carlo** samples many independent rollouts from the start state under the current policy and averages the discounted return — an *approximate*, policy-specific estimate
- **Value Iteration** runs the real Bellman *optimality* backup (`max_a` over actions) and animates it column by column, stopping once the max-norm delta between sweeps drops below ε (a safety cap `T` bounds it if it never converges); when P is marked "unknown" the computed Q-values become directly editable ("Learning Iteration") instead of being recomputed by an algorithm. The two partial-observability quadrants (Belief Iteration, PO Q-Learning) are illustrative relabelings of Value Iteration's real numbers, not true POMDP algorithms — Value Iteration solves for the *optimal* policy, independent of whatever π is currently configured
- **Evaluate π** runs the Bellman *expectation* equation (`sum_a π(a|s) * ...`, no `max_a`) to convergence for the exact policy currently configured — the same policy Monte Carlo is sampling — giving an *exact*, policy-specific value instead of an optimal or a sampled one. Each click appends an entry to the shared Policy log; hovering a log entry previews that policy on the canvas without changing it, clicking restores it for real
- **π_t** (Policy mode's Stationary | π_t toggle) is a separate, additive policy representation: an action per timestep instead of one fixed action per state, with its own finite-horizon backward-induction evaluation (a time-varying policy has no infinite-horizon fixed point)

## File Structure

```
rlviz/
├── index.html           # Main HTML with script loading order (domain → use cases → adapter → view → app)
├── style.css            # Styling, incl. CSS custom properties mirrored from AppPalette
├── libraries/            # p5.js and other vendored libraries
├── src/main/
│   ├── domain/           # Core entities (Graph, Node, Edge, TextLabel, SimulationState, ValueIterationState,
│   │                     # ExpectationState, PolicyEvaluationState)
│   ├── use_case/         # Application logic, one folder per use case (Input-Interactor-Presenter pattern),
│   │                     # incl. valueIteration/, expectation/, evaluatePolicy/, logOptimalPolicy/, simulation/
│   ├── adapter/
│   │   ├── controller/   # CanvasController - entry point for all user input
│   │   └── viewmodel/    # CanvasViewModel and per-entity/sub-mode view models
│   ├── view/             # mainView (canvas) + DOM chrome: topBar, toolPalette, goalCard, findOptimalCard,
│   │                     # namePolicyModal/renormalizeConfirmModal/toast, estimatorPill/mcRunsPill/zoomPill/
│   │                     # viSweepChip, rightPanel, expectationView + expectationChartView,
│   │                     # valueIterationView + viStatesView/viChartView/viEquationView/viBackwardView/
│   │                     # viRightViewPill, treeView + treeViewPill, chartDock,
│   │                     # helpers/ (incl. viBackupDiagram, RevealTimeline, valuesMethodMatrix, PolicyChartOverlay)
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
