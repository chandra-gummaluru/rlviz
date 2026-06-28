# Expectation Mode — Design Spec

**Date:** 2026-06-28
**Status:** Draft

---

## Overview

Add a 4th application mode called **"Expectation"** (alongside Edit, Simulate, and Value Iteration). The mode runs N independent Monte Carlo rollouts from the configured start node under the same policy used by Simulate mode, displays them as a mini-panel grid on the canvas, and shows cumulative utility statistics in the right panel with Line and Distribution chart tabs. A timeline scrubber below the grid lets the user inspect any timestep T.

---

## User-Facing Behavior

### Entering the mode
- A 4th segment "Expectation" is added to the mode toggle in the toolbar (right side).
- On entry: if a valid start node is set, rollouts are computed immediately. If no valid start node is set, the canvas and right panel prompt the user to set one in Edit or Simulate mode.
- Before generating rollouts, Expectation uses the same transition-probability validation and user-approved renormalization flow as Simulate mode. It does not silently normalize probabilities inside the expectation use case or `TraceGenerator`.
- On exit: the timeline scrubber is removed, rollout data is cleared.
- Entering Expectation pauses an active simulation or value-iteration animation before computing rollouts.
- Expectation is read-only. Canvas selection, node dragging, edge creation, panning, zooming, and editor keyboard shortcuts do not run in this mode.

### Policy
Expectation reuses the policy already defined for simulation; it does not introduce a second policy editor.

- `SimulationState.policy` is a sparse object mapping `stateId → actionId`.
- A present entry selects that action deterministically.
- A missing entry means **Random**, which selects uniformly among the state's available actions.
- Outcome transitions from action nodes continue to use their configured probabilities.
- The existing right-panel Policy section remains the source of policy configuration. It is currently rendered by the default MDP information panel in Edit mode when no node or edge panel takes priority. Expectation shows a compact read-only summary and the instruction `"To change π, switch to Edit mode and clear the current selection."`
- On entry or regeneration, `RunExpectationInteractor` receives a shallow snapshot of `simulationState.policy`. All N runs in that batch use the same snapshot.
- Invalid policy entries, including actions removed from a state since the policy was configured, follow the existing `TraceGenerator` behavior and fall back to Random. The presenter reports that fallback in the Expectation panel.

### Main canvas — run grid
The canvas (minus the timeline scrubber strip at the bottom) is split into a grid of N panels (N = 4, 8, or 16). Each panel:
- Renders a simplified, directed topology view of the full MDP, scaled to fit the panel with `push()/pop()/translate()/scale()`.
- Distinguishes state and action nodes, shows abbreviated node names, and draws directed straight edges with arrowheads. Images, text labels, selection/hover decoration, edge labels, and quadratic edge paths are omitted in the mini-panels.
- Dims unvisited nodes and edges.
- Highlights the nodes and edges visited through the current completed transition T in the run's color.
- Shows a small label: `"Run {i}  G = {utility.toFixed(1)}"` in the top-left corner.

Grid layout: N=4 → 2×2, N=8 → 4×2, N=16 → 4×4.

Each panel uses graph bounds, independent of the editor viewport, to fit the full graph with padding. Panel drawing is clipped to the panel rectangle so labels and edges cannot bleed into adjacent panels. V1 performs no off-screen caching; scrubber events are coalesced to at most one redraw per animation frame. Add caching only if browser profiling shows that 16-panel redraws miss the interactive frame-rate target.

### Timeline scrubber
A 36px HTML overlay div at the bottom of the canvas area containing:
- Label: "T ="
- A draggable `<input type="range">` that snaps to integer values 0..maxT
- A readout: "{t} / {maxT}"

Dragging updates all panels and the right panel stats/chart on the next animation frame. Input events are coalesced so at most one canvas/chart update is performed per `requestAnimationFrame`.

### Right panel — controls + stats + charts
The right panel in Expectation mode shows (top to bottom):

**Compact control row (two halves):**
- Left half: γ (discount factor) — slider 0.0..1.0, default 0.9
- Right half: Runs — `<select>` with options 4 / 8 / 16, default 4

**Max Steps row:**
- Full-width integer input with `min=1`, `max=1000`, default 100. Each run's trace terminates at this many state→action→state transitions OR when a terminal/no-action state is reached.

Parameter behavior is intentionally split:
- Changing **Runs** or **Max Steps** generates a new batch of random trajectories.
- Changing **γ** preserves the current trajectories and rewards and recomputes only their discounted utilities. This makes before/after γ comparisons meaningful.
- Leaving and re-entering Expectation generates a new batch while preserving the selected γ, Runs, Max Steps, and chart tab preferences.

**Policy summary:** read-only text. Format: `"Policy: {k} det. action(s), {m} Random"`, counting only states with at least one available action. If stale policy entries exist: append `" (⚠ {n} stale)"`. If policy is completely empty: `"Policy: all Random"`.

**Stats row:** `Mean G = {mean}` (left) and `σ = {sigma}` (right), computed across all N runs at the current T. `σ` is population standard deviation:

`σ = sqrt((1 / N) Σᵢ (Gᵢ - mean)²)`

**Chart tabs:** "Line" / "Distribution"
- **Line tab:** X = completed transition count 0..maxT, Y = utility. Blue line = empirical mean utility over time with a ±1 population-standard-deviation shaded band. A separate single-point dataset marks the currently selected T and moves when the scrubber changes. The band is descriptive, not a confidence interval.
- **Distribution tab:** At current T, show one mark per run on a shared utility axis. Implemented as a Chart.js `scatter` chart with `x: utility` and a small deterministic y-offset based on run index so identical outcomes remain countable. The x-axis min/max is clamped to the data range with 10% padding, supporting negative returns.
- Charts are rendered with a pinned local Chart.js 4.4.1 UMD file at `libraries/chartjs/chart.umd.min.js`; the app must not require network access. This file must be downloaded as a pre-implementation step and added to `index.html` before all app scripts (after KaTeX).

**No max/min highlight toggles** in v1.

---

## Architecture

### New Domain Object: `ExpectationState`
`src/main/domain/expectationState.js`

Domain state object — no p5 or DOM dependencies.
- Stores rollouts: `[{ trace, rewards, utilities, numSteps }]`
  - `trace` — array of `{id, type, name}` nodes from TraceGenerator
  - `rewards[k]` — reward on the k-th (state→action→state') transition
  - `utilities[T]` — G(T) = Σ_{k=0}^{T-1} γ^k · rewards[k]
- Stores `currentT`, `maxT`, `runs`, `maxSteps`, `gamma`, `computed` flag
- Helper methods: `getUtilitiesAtT(t)`, `getMeanAtT(t)`, `getSigmaAtT(t)`, `getMeansOverTime()`, `getSigmasOverTime()`
- `utilities[0]` is always `0`. After reward `k` is received, `utilities[k + 1] = utilities[k] + gamma^k * rewards[k]`.
- A completed transition consumes the alternating entries at trace indices `2k` (state), `2k + 1` (action), and `2k + 2` (next state).
- `numSteps = Math.floor((trace.length - 1) / 2)`.
- At timestep T, set `effectiveT = Math.min(T, numSteps)` and use `trace.slice(0, 2 * effectiveT + 1)` as the visible completed trace. If generation ends on an action with no outcome, that dangling action is not shown as a completed transition and contributes no reward.
- Runs may terminate at different times. For every `T > numSteps`, the run returns its final utility. Therefore every statistic at every T always uses all N runs.
- `maxT` is the maximum completed-transition count among the generated runs, not the requested Max Steps value.
- `setGamma(gamma)` validates γ, preserves traces and rewards, and rebuilds each rollout's utilities.
- `resetData()` clears rollouts and cursor state but preserves user preferences (`runs`, `maxSteps`, `gamma`).
- Mean and sigma helpers return `null` when no rollouts are computed; they never silently discard missing or non-finite values.

### New expectation use cases
`src/main/use_case/expectation/`

The folder follows the existing `simulation/` pattern: operation-specific input boundaries, input data, and interactors share one output boundary and presenter.

Files load in this order:

1. `expectationOutputBoundary.js`
2. `runExpectationInputBoundary.js`
3. `runExpectationInputData.js`
4. `runExpectationInteractor.js`
5. `updateExpectationGammaInputBoundary.js`
6. `updateExpectationGammaInputData.js`
7. `updateExpectationGammaInteractor.js`
8. `expectationPresenter.js`

`RunExpectationInputData` has constructor fields `startNodeId`, `policy`, `runs`, `maxSteps`, and `gamma`.

`RunExpectationInteractor.execute(inputData)`:
1. Resolves `startNode = graph.getNodeById(startNodeId)`
2. Validates that it is still a state node in the current graph; `runs` is one of `4`, `8`, or `16`; `maxSteps` is an integer in `[1, 1000]`; and `gamma` is finite and in `[0, 1]`.
3. Copies and validates the supplied sparse policy so the batch is not affected by later mutations. It records entries whose action is no longer available from the corresponding state; `TraceGenerator` will use its existing Random fallback for those entries.
4. For each run: calls `traceGenerator.generate(startNode, maxSteps * 2 + 1, policySnapshot)` (×2+1 because trace alternates state/action nodes)
5. Extracts rewards per step: for each consecutive action→state pair, looks up `actionNode.sas.find(t => t.nextState === nextStateId).reward`
6. Computes discounted utilities array per rollout
7. Calls `expectationState.setRollouts(rollouts)`
8. Calls `outputBoundary.presentComplete(responseModel)`, including any recorded policy fallbacks

Reward extraction must fail with a presented error if the trace references a missing action, state, transition, or non-finite reward; it must not convert malformed data to a zero reward. A stale policy entry for a state that no longer exists is ignored because that state cannot be visited.

`UpdateExpectationGammaInputData` contains `gamma`. Both interactors depend on `ExpectationOutputBoundary` and receive the same `ExpectationPresenter` instance in `main.js`.

`UpdateExpectationGammaInteractor.execute(inputData)`:
1. Validates γ is finite and in `[0, 1]`
2. Calls `expectationState.setGamma(gamma)` to rebuild utilities from existing rewards
3. Calls `outputBoundary.presentComplete(responseModel)` to refresh statistics, datasets, labels, and the canvas

This operation does not call `TraceGenerator`.

### Expectation output model and presenter

The run and gamma interactors emit response models through their output boundaries. Successful responses contain:

```javascript
{
    success: true,
    error: null,
    currentT,
    maxT,
    rollouts,
    mean,
    sigma,
    meansOverTime,
    sigmasOverTime,
    policyFallbacks: [
        {
            stateId,
            configuredActionId,
            reason: 'action_not_available'
        }
    ]
}
```

Failure responses contain `success: false`, a user-facing `error`, and no partial rollout batch. `ExpectationPresenter extends ExpectationOutputBoundary`, updates only `ExpectationViewModel`, and invokes injected callbacks for canvas redraw and structural/data-only right-panel refresh. It does not reference Chart.js, DOM nodes, p5 drawing functions, or `MainView`.

### New ViewModel: `ExpectationViewModel`
`src/main/adapter/viewmodel/ExpectationViewModel.js`

Thin coordinator holding:
- Reference to `ExpectationState`
- Panel layout (cols, rows, panel positions) — recomputed on window resize or N change
- Graph-fit transforms and layout invalidation state
- `activeTab: 'line' | 'distribution'`

The ViewModel does not hold Chart.js instances, DOM nodes, or p5 objects.

### Modified: `CanvasViewModel`

`src/main/adapter/viewmodel/CanvasViewModel.js`:
- Attach `expectationState` and `expectationViewModel` after construction, matching the existing value-iteration integration.
- When leaving Expectation mode, call `expectationState.resetData()` and clear transient layout state while preserving γ, Runs, Max Steps, and active-tab preferences.
- Keep commands and rollout business logic out of `ExpectationViewModel`.

### New View: `ExpectationView`
`src/main/view/expectationView.js`

Instantiated in `setup()`, attached to `mainView.expectationView`.

- `draw(canvasW, canvasH)` — called from `MainView.draw()` in expectation mode; returns without normal graph/simulation drawing.
  - Computes panel layout and graph-fit transform if stale:
    - Bounding box `(minX, minY, maxX, maxY)` from `graph.nodes` world positions.
    - Node radius is included in the bounds. Empty graphs render an empty-state message. For a single node or zero-width/height bounds, clamp each bounds dimension to at least one node diameter before division.
    - `fitScale = min((panelW - 2*padding) / bbW, (panelH - labelH - 2*padding) / bbH)`, clamped to a finite positive range.
    - `offsetX = (panelW - bbW*fitScale)/2 - minX*fitScale`, `offsetY = labelH + (panelH - labelH - bbH*fitScale)/2 - minY*fitScale`.
    - All panels share the same transform.
  - For each panel: clip with `drawingContext.save(); beginPath(); rect(x,y,w,h); clip()`, then `push(); translate(x+offsetX, y+offsetY); scale(fitScale);`, draw dim graph + bright visited nodes/edges at `currentT`, `pop(); drawingContext.restore()`, then draw panel label in screen space.
  - **No static cache in v1** — `noLoop` + RAF coalescing means at most one redraw per frame.
- `setupScrubber(canvasW, canvasH, topOffset)` — creates `<div class="expectation-scrubber">` positioned absolutely at `(0, topOffset + canvasH - SCRUBBER_H)`. On `input`: coalesce with `requestAnimationFrame` (cancel any pending RAF before scheduling new one).
- `removeScrubber()` — cancels its pending animation frame, clears the frame handle, and removes the DOM overlay on mode exit.
- `resize(canvasW, canvasH, topOffset)` — repositions the scrubber and calls `expectationViewModel.invalidateLayout()`.

Expectation rendering uses self-contained `_drawNode(node, color, alpha)` and `_drawEdge(from, to, color, alpha)` methods inside `ExpectationView`. These implement the simplified topology view without going through MainView's viewport transform or simulation state. It must not call `MainView.drawNodes()` or `drawEdges()` directly.

Pseudocode:
- `_drawNode`: draw a circle using the state/action palette, then an abbreviated node name centered inside it. Clamp screen-space text to a readable range after accounting for `fitScale`.
- `_drawEdge`: draw a straight line clipped to the source and target node boundaries plus an arrowhead at the target end.

Run colors: a fixed 8-color palette (`RUN_COLORS`) cycling by `i % 8`. Use `AppPalette` values for the palette. All panels for run i use the same color.

### Modified: `AppPalette`
`src/main/view/helpers/AppPalette.js`:
- Add eight named Expectation run colors under `AppPalette.expectation.runColors`.
- Reuse existing state, action, text, and edge colors for the simplified base topology.
- Do not place raw color literals in `ExpectationView`.

### Modified: `SetModeInteractor`
`src/main/use_case/setMode/SetModeInteractor.js` line 16 — add `'expectation'` to `this.validModes`.
Update its invalid-mode error text to list all four supported modes.

### Modified: `ToolBar`
`src/main/view/toolBar.js` — add 4th segment button ("Expectation") to the mode toggle. No left-side buttons needed for this mode.

### Modified: `RightPanel`
`src/main/view/rightPanel.js`:
- Add `renderExpectationPanel()` method
- Add `updateExpectationData()` for T-only updates (stats, chart datasets, and panel labels without rebuilding controls)
- Track `this.expectationChartInst` and call `.destroy()` before container removal in `updateContent()`
- In `updateContent()` dispatch: add `else if (isExpectationMode) { this.renderExpectationPanel(); }` at top (before selected node, etc.)

`RightPanel` exclusively owns the Chart.js instance. Structural rendering occurs on mode entry, tab change, or control changes. Scrubber movement calls `chart.update('none')` on the existing instance:
- **Line tab on scrubber**: update the current-T marker dataset to the selected mean point, then call `chart.update('none')`.
- **Distribution tab on scrubber**: update the scatter dataset with current-T utilities and deterministic y-offsets, then call `chart.update('none')`.
- Y-offsets encode no statistic; hide the distribution y-axis and explain that vertical position only separates overlapping runs.

### Modified: `CanvasController`
`src/main/adapter/controller/CanvasController.js` — primary read-only gate: `handleMousePress()`, `handleMouseMove()`, `handleMouseDrag()`, `handleMouseRelease()`, and `handleKeyPress()` all return early at the top if `this.viewModel.interaction.mode === 'expectation'`.

### Modified: `MainView`
`src/main/view/mainView.js`:
- Delegate to `this.expectationView.draw(...)` in `draw()` when mode is `'expectation'`, then return before normal graph/simulation drawing.
- `mouseWheel()` and pan-drag in `mouseDragged()` return early in Expectation mode as belt-and-suspenders guards for controller-bypass paths.
- Both `windowResized()` and `onPanelResize(newPanelWidth)` call `expectationView.resize(canvasWidth, canvasHeight, TOP_BARS_HEIGHT)` when Expectation is active, after resizing the p5 canvas.

### Modified: animation presenters

`src/main/use_case/simulation/simulationPresenter.js` and `src/main/use_case/valueIteration/viPresenter.js`:
- Guard delayed mode-specific toolbar and right-panel callbacks with the current interaction mode.
- A phase already awaiting completion may finish its internal state cleanup after a mode switch, but it must not replace Expectation UI or schedule mode-specific animation redraws.

### Modified: `main.js`
`src/main/app/main.js`:
- Top-level: create `ExpectationState`, `ExpectationViewModel`, then attach both to `CanvasViewModel`
- Inside `setup()`: create one `ExpectationPresenter`, pass it to both `RunExpectationInteractor` and `UpdateExpectationGammaInteractor`, and create `ExpectationView`
- Wire `onModeChange`: before entering Expectation, execute the existing simulation and VI pause interactors when their states are playing; then snapshot `simulationState.policy`, validate probabilities, and generate rollouts. On exit, remove Expectation UI and clear rollout data.
- Refactor the existing `checkAndRenormalizeIfNeeded()` helper to accept `{ forceCheck = false }`. Preserve its simulation behavior when false; when entering Expectation call `checkAndRenormalizeIfNeeded({ forceCheck: true })` so an existing `simulationState.replayInitialized` flag cannot skip current-graph validation. If the user cancels, leave Expectation in its empty-prompt state.
- Any delayed simulation or VI presenter callback that completes after the mode switch must check the active mode before rebuilding mode-specific right-panel or toolbar UI. It may finish internal cleanup, but it must not replace Expectation presentation.
- Wire separate `onExpectationSamplingChange` and `onExpectationGammaChange` callbacks to right-panel controls
- Do not add graph-mutation invalidation hooks in v1. Expectation is read-only, data is cleared on exit, and every entry generates a fresh batch from the current graph, start node, and policy.

### Modified: `index.html`
- Add a pinned local Chart.js 4.4.1 UMD script from `libraries/` before app scripts
- Add new script tags in dependency order

Chart.js is retained because its responsive axes, filled deviation band, tooltips, and canvas fallback avoid introducing a second custom chart renderer alongside the new mini-panel renderer.

### Modified: `style.css`
- `.expectation-scrubber` — timeline overlay styles
- `.panel-half-row` — two-column compact control row

---

## Data Flow

```
Enter Expectation mode
  → validate/offer renormalization of transition probabilities
  → snapshot SimulationState.policy
  → RunExpectationInteractor.execute()
  → TraceGenerator.generate() × N runs
  → Extract rewards from actionNode.sas
  → Compute utilities[T] per rollout
  → ExpectationState.setRollouts()
  → ExpectationPresenter.presentComplete()
  → rightPanel.renderExpectationPanel() (Chart.js Line chart)
  → ExpectationView.draw() (N mini-panels at T=0)

Drag timeline scrubber to T=k
  → ExpectationState.currentT = k
  → coalesce update with requestAnimationFrame
  → redraw() → ExpectationView redraws dynamic layers at T=k
  → rightPanel.updateExpectationData() (stats + existing chart datasets)

Change γ
  → UpdateExpectationGammaInteractor.execute()
  → recompute utilities from existing rewards
  → preserve traces, currentT, and selected tab
```

---

## Reused Utilities

| Utility | Location |
|---------|----------|
| `TraceGenerator.generate(startNode, maxNodes, policy)` | `src/main/domain/traceGenerator.js` |
| `graph.getNodeById(id)` | `src/main/domain/graphObj.js:64` |
| `actionNode.sas[].reward` | `src/main/domain/actionNodes.js` |
| `push()/pop()/translate()/scale()` | p5.js — same pattern as ValueIterationView |
| `AppPalette` | `src/main/view/helpers/AppPalette.js` |
| `ColorUtils.applyAlpha()` | `src/main/view/helpers/ColorUtils.js` |

---

## Verification

1. Start `python -m http.server 8000`, open browser
2. Build MDP (2-3 states, 2+ actions, edges with rewards), set start node in Simulate mode
3. In Edit mode's default MDP information panel, configure a mixed policy: one deterministic state and one Random state
4. Switch to Expectation → every run follows the deterministic choice where configured and samples uniformly at the Random state
5. Verify weighted action→state outcomes still vary according to transition probabilities
6. Drag timeline scrubber → panels, stats, and chart update without rebuilding controls
   - On Line, the current-T marker moves to the selected mean point.
   - On Distribution, identical utilities remain individually countable via deterministic vertical offsets.
7. Use runs with different terminal lengths → terminated runs retain their final utility through maxT and every statistic uses all N runs
8. Change γ → traces remain identical while utilities and charts change
9. Change Runs to 8 → a new batch is sampled and 8 panels appear
10. Change Max Steps → a new batch is sampled with the new cap
11. Use negative rewards → Distribution chart includes negative utilities
12. Resize the window → panels refit, remain clipped, and scrubber stays aligned
13. Try canvas editing, panning, zooming, and shortcuts → no graph mutation occurs in Expectation mode
14. Switch away and back → rollout data resets, preferences persist, and a new batch is sampled
15. Delete the selected start state or import a different graph → entry shows the missing-start prompt without throwing
16. Use a stale policy action ID → rollout falls back to Random and the panel reports the fallback
17. Start on a terminal state → `maxT = 0`, the scrubber remains valid at `0 / 0`, mean is 0, and σ is 0
18. End on an action with no outgoing transition → the dangling action is not highlighted and contributes no reward
19. Test γ = 0 and γ = 1 → utility calculations match their boundary definitions
20. Use zero and identical rewards → Distribution renders coincident values and σ = 0 without invalid chart bounds
21. Use a malformed or non-finite reward → the batch fails with a presented error and no partial results
22. Use unnormalized transition probabilities → the same renormalization confirmation used by Simulate mode appears; cancellation does not run rollouts
23. Rapidly scrub and switch modes → pending animation-frame updates do not recreate removed UI
24. Resize the right panel and browser window while active → chart, grid, and scrubber remain aligned
25. Disable network access and reload → local Chart.js still loads
