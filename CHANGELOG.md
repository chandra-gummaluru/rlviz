# Changelog

## Value Iteration Animation Overhaul (2026-05-10)

### Detailed Bellman Backup Animation
- Replaced the quick 2-phase animation (highlight → reveal) with a **6-phase educational animation** per state: show equation → show actions → show transitions → compute Q-values → select max → reveal V(s)
- Bellman equation overlay rendered on the canvas showing the computation step-by-step
- Action diamonds fan out from state nodes with color coding (green=best, red=worst)
- Transition edges show `p=`, `r=`, and term breakdown `p·[r + γ·V(s')]`

### Q-Value Computation Table
- Added a **progressive table** that populates during per-action animation (light mode, drawn on canvas)
- Rows = actions (A1, A3, A4, ...), Columns = transitions (s', (p, r)), final column = Q(s, a)
- Cells populate as each transition is stepped through: first shows `p=0.07`, then computed term `0.07·[58+0.9·0]=4.06`
- Completed actions show their Q-value in bold; best action highlighted in green
- Running Q sum shown in italic while action is being computed
- `select_max` phase adds a final row: `V(s) = max = X.XX`
- Replaces the equation text overlay in per-action mode

### Per-Action Mode (Toggle)
- **"Per-action" checkbox** in toolbar enables per-transition stepping
- Steps through each action's transitions one at a time: A0→S0, A0→S1, ..., then A1→S0, ...
- Each transition shows its individual contribution to Q(s, a) with a running sum
- After all transitions for an action: Q(s, a) finalized
- After all actions: `select_max` shows all Q-values, picks V(s) = max

### Step + Skip Controls
- **Step** button advances one sub-phase (or one transition in per-action mode)
- **Skip** button completes one full state backup instantly

### Visual Fixes
- Forward edges between completed columns stay visible during per-action animation
- Active column edges suppressed during animation (drawn by per-action overlay instead)
- `select_max` phase shows only action diamonds + Q-values (no transition clutter)
- Transitions filtered to only show forward edges to next column (no backward arrows)
- States sorted by y-position for top-to-bottom animation order

### Presenter Fix
- Presenter methods now read `viState.subPhase` instead of hardcoding bundled phase names — this was the root cause of per-action mode showing all actions at once

### Edge Hover Effect (Larger)
- Squiggly reward line: 50→80px length, 3→5px amplitude, 4→5 waves
- Probability label offset: 16→22px
- Reward text: 12→13px font

### Edge Colors (Saturation-Based)
- Changed from darkness-based (black → dark green/red) to saturation-based (gray-green → vivid green, gray-red → vivid red) using HSL
- Low rewards look muted, high rewards look vivid

---

## Value Iteration Feature + Clean Architecture Fixes (2026-03-29)

### Feature: Value Iteration Mode

Added a third application mode — **Value Iteration** — that visualizes finite-horizon dynamic programming by unrolling the MDP into timestep columns.

#### How It Works

1. Switch to the **Value Iter** tab in the toolbar
2. Set the horizon **T** (number of backup steps) using the input field
3. Click **Play** to auto-animate, **Step** to advance one state at a time, or **Reset** to clear

The visualization:
- Computes all V-tables upfront using the Bellman equation: `V_t(s) = max_a Σ P(s'|s,a)[R + γ·V_{t+1}(s')]`
- Starts with the terminal column (t=T, all V=0) centered on canvas
- Each new column appears on the left, shifting existing columns right
- Animates state-by-state: active node is full opacity, others are faded
- **First two backup steps** show detailed action nodes (diamonds) between columns with Q-values and transition probabilities
- Later columns use simplified direct edges to reduce clutter
- Action color coding: green = best action (highest Q), red = non-best
- Right panel shows Bellman equation, parameters (γ, T), and a live V(s) table

#### New Files (21 total)

**Domain Layer (1 file):**
- `src/main/domain/valueIterationState.js` — Precomputed V history, Q-values, best actions, animation cursor, and phase state machine

**Use Case Layer (18 files in `src/main/use_case/valueIteration/`):**
- `viOutputBoundary.js` — Shared output boundary interface
- `viAnimator.js` — Async/await animation orchestration (only depends on domain + output boundary)
- `viPresenter.js` — Translates state changes to ViewModel updates
- `runVIInputBoundary.js`, `runVIInputData.js`, `runVIInteractor.js` — Initialize computation
- `viPlayInputBoundary.js`, `viPlayInputData.js`, `viPlayInteractor.js` — Continuous playback
- `viPauseInputBoundary.js`, `viPauseInputData.js`, `viPauseInteractor.js` — Pause animation
- `viStepInputBoundary.js`, `viStepInputData.js`, `viStepInteractor.js` — Single-state advance
- `viResetInputBoundary.js`, `viResetInputData.js`, `viResetInteractor.js` — Clear and reset

**Adapter Layer (1 file):**
- `src/main/adapter/viewmodel/ValueIterationViewModel.js` — Column layout with progressive reveal (`visibleColumnCount` / `showNextColumn()`)

**View Layer (1 file):**
- `src/main/view/valueIterationView.js` — p5.js rendering of unrolled columns with focus+fade, action diamonds, and Q-value annotations

#### Modified Files

- `src/main/use_case/setMode/setModeInteractor.js` — Added `'value_iteration'` to valid modes
- `src/main/adapter/viewmodel/CanvasViewModel.js` — Added `valueIterationState` and `valueIterationViewModel` properties; mode setter resets VI state when leaving the mode
- `src/main/view/toolBar.js` — 3-segment toggle (Edit/Simulate/Value Iter), VI buttons (Play/Pause, Step, Reset), T number input
- `src/main/view/mainView.js` — Delegates to `ValueIterationView` when in VI mode
- `src/main/view/rightPanel.js` — Added `renderValueIterationPanel()` showing Bellman equation, parameters, and V(s) table
- `src/main/app/main.js` — DI wiring for all VI components, VI callbacks
- `index.html` — 21 new script tags in dependency order
- `style.css` — `.toolbar-toggle--middle`, `.toolbar-t-label`, `.toolbar-t-input` styles

---

### Clean Architecture Fixes

Conducted a full architecture audit (overall score: 6/10) and fixed the most critical violations.

#### Fix #1: Domain layer p5.js dependency

**File:** `src/main/domain/edgeObj.js`

`getLabelColor()` was calling p5.js `color()` — a rendering framework dependency in the domain layer. Changed to return `rgb()` strings (`'rgb(0, 100, 0)'` etc.), which are framework-agnostic and already supported by `applyAlphaToColor()` in MainView.

#### Fix #2: VI interactors holding ViewModel references

**Files:** `viAnimator.js`, `runVIInteractor.js`, `viPlayInteractor.js`, `viStepInteractor.js`, `viResetInteractor.js`

All VI interactors and the animator were receiving `viViewModel` (adapter layer) directly — violating the dependency rule (Use Cases must not depend on Adapters).

Moved all ViewModel manipulation to `VIPresenter`:
- `showNextColumn()` → called in `presentColumnStart()`
- `activeColumnIndex/activeStateId` → set in `presentColumnStart()` / `presentStateBackupStart()`
- `revealValue()` → called in `presentStateBackupComplete()`
- `revealColumn()` → called in `presentColumnComplete()`
- `reset()` → called in `presentReset()`

Added `presentLayoutNeeded(canvasWidth, canvasHeight)` to the output boundary so `runVIInteractor` can signal the presenter to compute layout without touching the ViewModel.

#### Fix #3: Interactor using p5.js globals

**File:** `src/main/use_case/valueIteration/runVIInteractor.js`

Was reading `windowWidth` and `windowHeight` (p5.js globals) directly. Canvas dimensions are now passed through `RunVIInputData(T, gamma, canvasWidth, canvasHeight)` from the callback in `main.js`.

#### Fix #4: Presenters calling `alert()`

**Files:** `createNodePresenter.js`, `createEdgePresenter.js`, `serializeGraphPresenter.js`, `importGraphPresenter.js`, `simulationPresenter.js`, `viPresenter.js`

Replaced all `alert()` calls with ViewModel state updates:
- Errors → `this.viewModel.lastOperationError = message`
- Messages → `this.viewModel.lastOperationMessage = message`
- `createNodePresenter` (receives sub-ViewModel) → `this.viewModel.errorMessage = message`

#### Fix #5: View layer mutating domain objects directly

**File:** `src/main/view/rightPanel.js`

Three direct domain mutations were routed through the Controller:
- `node.image = ...` → `this.controller.setNodeImage(node.id, imageData)`
- `delete node.image` → `this.controller.setNodeImage(node.id, null)`
- `transition.probability = newProb` → `this.controller.setTransitionProbability(actionNodeId, nextStateId, newProb)`
- `transition.reward = newReward` → `this.controller.setTransitionReward(actionNodeId, nextStateId, newReward)`

Added `setTransitionProbability()` and `setTransitionReward()` methods to `CanvasController.js`.

#### Fix #6: Business logic in main.js callbacks

**Files:** `src/main/app/main.js`, `src/main/use_case/setMode/setModePresenter.js`, `src/main/adapter/controller/CanvasController.js`

- **SetModePresenter** now receives the full `canvasViewModel` (was `canvasViewModel.interaction`), so the mode setter's VI cleanup logic fires automatically. Removed manual cleanup from `onModeChange` callback.
- **`checkAndRenormalizeIfNeeded()`** now uses `canvasController.getUnnormalizedActionNames()` and `canvasController.renormalizeProbabilities()` instead of querying the graph domain directly.
- Added `getUnnormalizedActionNames()` and `renormalizeProbabilities()` to `CanvasController`.

---

### Edge Rendering Fix

**File:** `src/main/view/valueIterationView.js`

Fixed edge connection points in the Value Iteration view. Edges were using hardcoded `+radius` / `-radius` on x only (assuming left-to-right), but columns are laid out right-to-left (column 0 = t=T is rightmost). Changed to compute connection points using the actual angle between nodes via `cos(angle)` / `sin(angle)`, which works regardless of relative column positions.

---

### Documentation Updates

- **CLAUDE.md** — Updated application modes (three modes), toolbar description (3-segment control), use case list, script loading order, discount factor location, and added gotcha #6 (SetModePresenter bypass). Updated `getLabelColor()` documentation.
- **VALUE_ITERATION_FEATURE.md** — Replaced speculative architecture section with actual implemented file structure, real DI wiring code, progressive column reveal documentation, and marked implemented features in open questions.
