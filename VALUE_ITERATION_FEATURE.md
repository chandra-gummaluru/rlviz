# Value Iteration Feature — Design Specification

## Overview

This document describes the design for a **Value Iteration** mode in the MDP visualizer. The mode visualizes the finite-horizon dynamic programming backup — unrolling the MDP across timesteps from `t = T` down to `t = 0`, animating how the state value function `V(s)` is computed at each step.

---

## Concept

Value iteration (finite-horizon) computes the value of each state by working backwards from a terminal timestep `T`:

```
V_T(s)   = 0   for all states s    (base case: no future value beyond horizon)

V_t(s)   = max_a  Σ_{s'} P(s'|s,a) · [ R(s,a,s') + γ · V_{t+1}(s') ]
```

The visualization makes this backward induction tangible by literally drawing it out left-to-right on the canvas — each column is a timestep, each row is a state, and edges connecting columns represent the probabilistic transitions used in the backup.

---

## Visual Layout

### Column Structure

Each timestep `t` is represented as a **vertical column** of state nodes, spaced evenly from top to bottom. Columns progress **left to right**, with the rightmost column being `t = T` and newer (earlier) columns appearing to the left as the animation advances.

```
t = T-2          t = T-1          t = T
 ┌─────┐           ┌─────┐          ┌─────┐
 │ s0  │──────────▶│ s0  │─────────▶│ s0  │
 │ V=? │    ╲      │ V=2 │    ╲     │ V=0 │
 └─────┘     ╲     └─────┘     ╲    └─────┘
              ╲                  ╲
 ┌─────┐       ╲  ┌─────┐        ╲ ┌─────┐
 │ s1  │──────────▶│ s1  │─────────▶│ s1  │
 │ V=? │          │ V=5 │          │ V=0 │
 └─────┘           └─────┘          └─────┘

 ┌─────┐           ┌─────┐          ┌─────┐
 │ s2  │──────────▶│ s2  │─────────▶│ s2  │
 │ V=? │          │ V=1 │          │ V=0 │
 └─────┘           └─────┘          └─────┘
```

- **State node**: circle (same style as editor), with its name and `V = <value>` displayed below or inside
- **Edges**: arrows from each state in column `t` to the states it can reach in column `t+1`, labeled with the transition probability and reward
- **V label**: starts hidden, revealed during animation as the backup is computed

### Focus + Fade

At any given moment during the animation, only one state is being actively computed. Everything else recedes visually so the spotlight stays on the current node:

- **Active node** (currently being computed): full opacity, normal color
- **Inactive nodes in the current column** (not yet computed, or already done): faded to ~20% opacity
- **Nodes in older columns** (already completed timesteps): faded to ~35% opacity — visible for context but not distracting
- **Edges**: only the outgoing edges of the **active node** are drawn at full opacity; all other edges fade to ~15% opacity

This fade-in/fade-out transitions smoothly (e.g. 200ms ease) as the animation advances from one state to the next.

### Action Color Coding

When the backup for a state is being animated, each action's Q-value is evaluated and color-coded on the outgoing edge group:

- **Best action** (highest Q-value): edges rendered in **saturated green** (`hsl(140, 90%, 45%)`)
- **Worst action** (lowest Q-value): edges rendered in **saturated red** (`hsl(0, 85%, 50%)`)
- **Intermediate actions** (if more than two): interpolated between red and green on a per-rank basis

The color is applied to both the edge lines and a small colored ring or arc on the action node in the backup diagram. After the backup for that state is complete, the best-action edges remain green and the rest fade back to neutral gray, serving as a "policy trace" for the completed columns.

### Spacing

- Vertical spacing between nodes within a column: proportional to canvas height / number of states, with padding
- Horizontal spacing between columns: fixed gap wide enough to display edges and labels without crowding
- The entire scene pans left each time a new column is prepended

---

## Animation Sequence

### Phase 1 — Initialize Terminal Column (t = T)

1. All state nodes slide into position in a vertical column on the right side of the canvas
2. Top-down, one state at a time:
   - All other nodes immediately fade to their inactive opacity
   - Active node highlights (pulse or glow)
   - `V = 0` label fades in below the node
   - Node returns to completed opacity, next node becomes active
3. After all states are labeled, a short pause; all nodes settle at completed opacity

### Phase 2 — Backup to t = T−1

1. The existing column **slides to the right** (easing animation)
2. A new column for `t = T-1` appears on the left; all its nodes start fully transparent and fade in
3. **Top-down, one state at a time**, for each state `s` in the new column:
   a. All nodes except `s` fade to inactive opacity; `s` pulses to full brightness
   b. Outgoing edges to the `t = T` column draw in one action-group at a time:
      - Each action's edges appear with a color indicating its rank (green = best, red = worst)
      - Edge labels show `p = P(s'|s,a)` and the weighted contribution `p·(R + γ·V)`
   c. A computation annotation appears near `s`:
      ```
      V(s) = max_a Σ P(s'|s,a)[R + γ·V_T(s')]
           = <computed value>
      ```
   d. `V = <value>` label fades in on `s`; the best-action edges stay green, others fade to gray
   e. `s` settles to completed opacity; the next state becomes active
4. After all states in the new column are computed, a short pause; the column fully settles

### Phase 3 — Repeat for t = T−2, T−3, …, 0

- Each step prepends a new column to the left
- The animation continues with the same per-state backup visualization
- Columns that are two or more steps behind the current one render at reduced opacity (~35%)
- Only the **current column being computed** and the **one immediately to its right** render at near-full opacity
- The animation can be **paused at any point** — the canvas freezes in its current visual state, including all fade levels and partial edge drawings; resuming continues exactly from where it stopped

### Animation Controls

| Control | Behavior |
|---|---|
| **Play** | Runs through all timesteps automatically |
| **Pause** | Freezes the animation mid-sequence without losing progress; Play resumes from the same point |
| **Step** | Advances one state at a time within the current backup |
| **Reset** | Clears all columns and returns to the initial state |
| **T input** | Number input (integer ≥ 1) that sets the number of backup steps |

**Play/Pause toggle**: The Play and Pause buttons share the same button slot in the toolbar — Play is visible when paused/stopped, Pause is visible while the animation is running. This mirrors the existing Simulate mode behavior.

---

## UI / Mode Integration

### New Mode Tab

A third tab is added to the existing **Edit / Simulate** segmented control in the toolbar:

```
[ Edit ]  [ Simulate ]  [ Value Iter ]
```

Switching to Value Iteration mode:
- Hides the regular MDP graph
- Shows the unrolled column visualization in the canvas
- Replaces the toolbar buttons with: **Play**, **Step**, **Reset**, and a **T = [ _ ]** input field
- The right panel shows the current computed `V(s)` table

Switching away from Value Iteration mode:
- Discards the unrolled visualization
- Returns the canvas to the normal graph view

### Discount Factor

The discount factor `γ` is read from the existing right-panel input (already part of the UI). It is used directly in all backup computations.

---

## Computation Logic

### Data Needed

All of this is already available in the existing `Graph` domain object:

- **State nodes**: `graph.nodes.filter(n => n.type === 'state')`
- **Action nodes and transitions**: each `StateNode.actions` → `ActionNode.sas` → `{ nextState, probability, reward }`
- **Discount factor γ**: from the right-panel `γ` input (stored in `CanvasViewModel` or fetched at render time)

### Value Backup Algorithm

```javascript
// Initialize
const states = graph.nodes.filter(n => n.type === 'state');
const V = {};
states.forEach(s => V[s.id] = 0);  // V_T(s) = 0

// Backup one step
function backupOneStep(V_next, gamma) {
    const V_curr = {};
    states.forEach(s => {
        // For each action available at s
        let maxQ = -Infinity;
        s.actions.forEach(actionId => {
            const action = graph.getNodeById(actionId);
            let Q = 0;
            action.sas.forEach(({ nextState, probability, reward }) => {
                Q += probability * (reward + gamma * (V_next[nextState] ?? 0));
            });
            if (Q > maxQ) maxQ = Q;
        });
        V_curr[s.id] = s.actions.length > 0 ? maxQ : 0;
    });
    return V_curr;
}

// Run T steps
const history = [V];  // history[0] = V_T, history[1] = V_{T-1}, ...
for (let t = 0; t < T; t++) {
    history.push(backupOneStep(history[history.length - 1], gamma));
}
// history is computed upfront; the animation replays it
```

### Edge Labels

When drawing an edge from `s` (at `t`) to `s'` (at `t+1`), label it with:
- Probability: `p = P(s'|s,a)`
- Contribution: `p · (R + γ·V)`

---

## Architecture (Implemented)

Following the existing MVCP pattern, the feature is structured as:

### File Structure

```
src/main/
├── domain/
│   └── valueIterationState.js          # Precomputed V history, Q-values, animation cursor, phase state machine
│
├── use_case/
│   └── valueIteration/
│       ├── viOutputBoundary.js          # Shared output boundary interface
│       ├── viAnimator.js                # Async/await animation orchestration (same waitForPhase pattern as SimulationAnimator)
│       ├── viPresenter.js               # Translates state changes to view updates (created in setup(), needs MainView)
│       ├── runVIInputBoundary.js        # \
│       ├── runVIInputData.js            #  } Run/Initialize — computes history, creates layout
│       ├── runVIInteractor.js           # /
│       ├── viPlayInputBoundary.js       # \
│       ├── viPlayInputData.js           #  } Play — continuous auto-advance
│       ├── viPlayInteractor.js          # /
│       ├── viPauseInputBoundary.js      # \
│       ├── viPauseInputData.js          #  } Pause — freeze mid-animation
│       ├── viPauseInteractor.js         # /
│       ├── viStepInputBoundary.js       # \
│       ├── viStepInputData.js           #  } Step — advance one state backup
│       ├── viStepInteractor.js          # /
│       ├── viResetInputBoundary.js      # \
│       ├── viResetInputData.js          #  } Reset — clear all state
│       └── viResetInteractor.js         # /
│
├── adapter/
│   └── viewmodel/
│       └── ValueIterationViewModel.js   # Column layout, progressive reveal, x-position recomputation
│
└── view/
    └── valueIterationView.js            # p5.js rendering of unrolled columns with focus+fade
```

### Wiring in `main.js`

```javascript
// Domain (top-level, before setup)
const valueIterationState = new ValueIterationState();
const valueIterationViewModel = new ValueIterationViewModel();
canvasViewModel.valueIterationState = valueIterationState;
canvasViewModel.valueIterationViewModel = valueIterationViewModel;

// In setup() — after mainView creation
viPresenter = new VIPresenter(canvasViewModel, mainView);
viPresenter.setToolBar(toolBar);
runVIInteractor = new RunVIInteractor(graph, valueIterationState, valueIterationViewModel, viPresenter);
viPlayInteractor = new VIPlayInteractor(valueIterationState, valueIterationViewModel, viPresenter);
viPauseInteractor = new VIPauseInteractor(valueIterationState, viPresenter);
viStepInteractor = new VIStepInteractor(valueIterationState, valueIterationViewModel, viPresenter);
viResetInteractor = new VIResetInteractor(valueIterationState, valueIterationViewModel, viPresenter);
mainView.valueIterationView = new ValueIterationView(canvasViewModel);
```

### Mode Integration

`SetModeInteractor` accepts a third mode string: `'value_iteration'`. The toolbar renders Play/Pause, Step, Reset, and a T input when this mode is active. `MainView.draw()` delegates to `ValueIterationView.draw()` in this mode. Mode cleanup (resetting VI state) is handled in `onModeChange` in `main.js` because `SetModePresenter` receives `canvasViewModel.interaction` directly, bypassing the `CanvasViewModel.mode` setter.

### Progressive Column Reveal

Columns are not all shown at once. `ValueIterationViewModel` tracks `visibleColumnCount`:
1. `computeLayout()` creates all column data but assigns no x positions and sets `visibleColumnCount = 0`
2. `showNextColumn()` increments `visibleColumnCount` and calls `_recomputeXPositions()` to center visible columns
3. `VIAnimator` calls `showNextColumn()` when a new column starts animating
4. `ValueIterationView` only renders columns `0..visibleColumnCount-1`

This produces the intended effect: t=T appears centered first, then shifts right as t=T-1 appears on the left.

---

## Edge Cases

- **State with no actions**: treated as a terminal state; `V(s) = 0` at all timesteps
- **Disconnected states**: included in the column with `V = 0`
- **Large number of states**: column layout compresses node spacing; a minimum size threshold triggers scrolling or zoom-out
- **T = 0**: shows only the terminal column (all zeros), no backup performed
- **Single state**: trivial but valid — one node per column, labeled `V = 0` throughout if there are no transitions

---

## Open Questions / Future Work

- Should the visualization support **infinite-horizon** value iteration (iterate until convergence, show Δ values)?
- Should the user be able to **click a state in a column** to see a detailed breakdown of its backup (which action won, what the Q-values were)?
- Should a **policy extraction** overlay be available — highlighting the greedy edge from each state at each timestep?
- Should the **right panel** update in sync with the animation to show the current V-table as a grid? *(Implemented — right panel shows V(s) table updated during animation)*
