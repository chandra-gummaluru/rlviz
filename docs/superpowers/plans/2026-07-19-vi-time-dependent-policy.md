# Evaluate Redesign, Phase 6: Time-Dependent Policy (π_t) — Decisions + Implementation Plan

Scoping doc: `docs/superpowers/specs/2026-07-19-vi-time-dependent-policy-scoping.md`. That doc
listed 5 open product questions and explicitly said not to implement from it alone. Resolved below
(user confirmed: ship the time pager AND the "Backward" view together in this pass, not deferred).

## Decisions (resolving the scoping doc's 5 open questions)

1. **Which states get a time pager row?** Every multi-action state (generalizing the handoff's
   toy demo, which only had one) — mirrors how the existing Stationary Policy π section already
   renders one row per state, terminal/single-action states shown read-only.
2. **Scope across quadrants:** π_t is a property of `SimulationState.policy`-equivalent storage,
   shared infrastructure already used by Build/Policy/MC/Evaluate π regardless of Method quadrant
   (per CLAUDE.md's own "Policy log — one shared list across all four modes" precedent) — the
   Stationary/π_t toggle and time pager work in all four modes. Only the **Backward** view is
   quadrant-scoped, to `known:full` only (the one quadrant with real per-state backup diagrams
   today), matching the handoff's "Backward appears only in π_t mode" and this codebase's existing
   `viBackupDiagram.js` gating.
3. **What "Evaluate π" reports under π_t:** the finite-horizon value V₀^π_t(S₀) via backward
   induction over the configured horizon (matches the reference prototype's `_polV(...)[0]`) — a
   different quantity in kind from the existing infinite-horizon ε-converged stationary V^π other
   log rows show. The Policy log's reserved "t" column (`rightPanel.js:1447`, currently an em-dash
   placeholder) is populated with the horizon for these rows; a hint line clarifies it's a
   finite-horizon return.
4. **Horizon slider placement:** a dedicated slider lives inside the Policy π section itself
   (shown only in π_t mode), not folded into the shared Parameters section other panels already
   render independently — avoids threading π_t state into every `_renderGammaSlider` call site.
   This deviates from the handoff's literal "Parameters-panel slider" placement for encapsulation;
   noted as a deliberate call, not an oversight.
5. **Ship "Backward" now, decoupled or bundled?** Bundled, per explicit user confirmation.
   **Placement differs from CLAUDE.md's description**, because the codebase has moved on since that
   doc was written: `viLeftViewPill.js` (`[States|Chart]`) is dead code today — "kept, just
   unwired" (`main.js:1338`) — Chart moved to the right pane's own `viRightViewPill.js`
   (`[Equation|Chart]`), which IS live. Reviving a disabled pill mechanism to add Backward is
   higher-risk than extending the one that already works, so **Backward ships as a third segment
   on `viRightViewPill`: `[Equation | Backward | Chart]`**, shown only when `known:full` AND π_t
   mode is active, replacing Equation for whichever state the States view's `activeStateId` (the
   same field Equation view already reads) currently points to.

## Domain layer

### `src/main/domain/simulationState.js`

Add fields (near `this.policy`/`this.policyWeights`):
```js
this.piMode = 'stationary';       // 'stationary' | 'timeDependent'
this.piHorizon = 8;               // shared horizon for time-dependent policy + its sampling/eval
this.timeDependentPolicy = {};    // stateId -> array[piHorizon] of (actionId | 'random')
```

New methods:
- `setPiMode(mode, graph)` — switching to `'timeDependent'` seeds every multi-action state's array
  (length `piHorizon`) from that state's *current stationary* resolved value (deterministic action
  if set, else `'random'`) for any state not already present in `timeDependentPolicy` (so toggling
  back and forth doesn't clobber existing edits).
- `setPiHorizon(horizon, graph)` — resizes every existing array: truncate if shorter, extend by
  repeating the last element if longer (matches "policy stays constant past the last edited
  timestep" — the least surprising default, no new information to fill in with).
- `cycleTimeDependentAction(stateId, t, actions)` — cycles `a0 → a1 → ... → 'random' → a0` at that
  state's t-slot, clamped to `[0, piHorizon-1]`.
- `getTimeDependentAction(stateId, t)` — clamped read, returns `null` if no entry.
- `resolvePiTAction(stateId, elapsedT)` — returns `null` when `piMode !== 'timeDependent'` or no
  entry exists (callers then fall through to today's stationary resolution unchanged); otherwise
  the clamped time-slot value (`actionId` or `'random'`).

### `src/main/domain/traceGenerator.js`

`generate()` gains a 5th optional param `timeDependentPolicy = null` (a plain
`stateId -> array` object, NOT a `SimulationState` reference — keeps this class decoupled from the
domain state, consistent with `policy`/`policyWeights` already being passed as plain snapshots).
Track `elapsedT` (increments once per **decision**, i.e. each time a state node picks an action —
matches the handoff prototype's own `for (let i = 0; i < t; i++)` sampling loop indexing).

`selectActionForPolicy()` gains a 4th param `piTAction = null`: if set to a concrete action id,
resolve it directly (bypassing `policy`/`policyWeights` for that call only); if `'random'`, call
the existing `selectRandomAction()`; if `null`/invalid, fall through to today's unchanged logic.

Call sites to update (both already inject `policy`/`policyWeights` snapshots):
- `src/main/use_case/expectation/runExpectationInteractor.js:35`
- `src/main/use_case/simulation/simulationAnimator.js:43`

Both pass `simulationState.piMode === 'timeDependent' ? simulationState.timeDependentPolicy : null`.

### `src/main/domain/policyEvaluationState.js`

New method `evaluateTimeIndexed(graph, simulationState, startStateId, gamma, horizon)`: backward
induction from `V_H(s) = 0` for all s, walking `t = horizon-1 .. 0`, at each t computing
`V_t(s) = Σ_a π_t(a|s) Σ_s' P(s'|s,a)[R + γV_{t+1}(s')]` — same Bellman *expectation* backup
`evaluate()` already does, just resolving action probabilities per elapsed t instead of a single
stationary distribution, and walking a fixed horizon backward instead of iterating a stationary
policy to ε-convergence (these are genuinely different algorithms for different objects, per
decision #3). A private `_actionProbsAt(stateNode, simulationState, t)` helper resolves each
action's probability at that timestep: concrete action → probability 1 (others 0); `'random'` →
uniform; no entry at all → uniform (matches single-action/terminal states needing no entry).
Returns `{ valueAt0, values }`.

### `src/main/use_case/evaluatePolicy/`

`EvaluatePolicyInputData`/`EvaluatePolicyInteractor`: branch on `simulationState.piMode`. Stationary
→ existing `evaluate()` call, unchanged. Time-dependent → `evaluateTimeIndexed(...)`, and the log
entry gains a `t: simulationState.piHorizon` field (currently always absent/undefined, which
`rightPanel.js`'s existing `createDiv('—')` at `:1447` already renders as em-dash for — so
stationary rows need no change there at all, only time-dependent rows populate real content).

## UI layer

### `src/main/view/rightPanel.js` — `_renderPolicyModeSection()`

Add a `Stationary | π_t` segmented toggle at the top of the Policy π section (same segmented-pill
markup already used elsewhere, e.g. `_renderPolicyActionSegments`), calling a new controller method
`setPiMode(mode)`.

When `piMode === 'timeDependent'`:
- A horizon slider row (`panel-param-row`, same slider styling Phase 4 established for ε — reuse
  `.panel-param-row-slider` verbatim) — range `1–20` (matches the handoff's mock), integer step,
  calling `setPiHorizon`.
- A pager row: `‹ t = {k} / {horizon-1} ›` (0-indexed display, consistent with Phase 4's `k=`
  convention) with prev/next buttons clamped at the ends, plus a segment strip below it — one
  segment per t, current highlighted, segments where *any* multi-action state's resolved action
  differs from its own t=0 action get a secondary "differs" treatment (generalizing the mock's
  single-state gold-marking to multiple states) — click a segment to jump the pager.
- Below the pager: one row per multi-action state, reading `getTimeDependentAction(stateId,
  pagerT)`, click-to-cycle via `cycleTimeDependentAction`. Terminal/single-action states unchanged
  (still "— terminal" / read-only).

When `piMode === 'stationary'`: exactly today's existing rendering, completely unchanged.

Pager position (`this._piTCursor` or similar) is presentation-only view state on `RightPanel`
itself (like `this.discountFactor`/`this.viEpsilon`), not domain state — it doesn't affect
sampling/evaluation, only which timestep's row the panel/canvas overlay currently previews.

### `src/main/adapter/controller/CanvasController.js`

New passthroughs: `setPiMode(mode)`, `setPiHorizon(horizon)`, `cyclePiTAction(stateId, t)` —
delegate straight to `simulationState`, trigger `updateContent()`/`redraw()` the same way existing
`setPolicyAction`/`setPolicyWeight` do.

## Canvas overlay

### `EdgeViewModel.policyEdgeProbability` (or wherever it's computed — grep before editing)

When `simulationState.piMode === 'timeDependent'`, read the action at the right panel's current
pager position (threaded in via the viewmodel) instead of the stationary `policy` map, so the
canvas edge highlighting reflects whichever t the pager is showing — matches the handoff's "π edge
weights follow the pager/scrubber."

### Badge

Wherever the canvas currently has no existing "π" badge yet (confirm by grep — the handoff
describes one but it may not exist as literal UI today), add a small floating label near the graph:
`π at t = k · <action>` in π_t mode, `π · all t` in stationary mode. If no prior art exists for
this exact badge, keep it minimal (reuse an existing small-chip style already in the codebase, e.g.
`viSweepChip.js`'s CSS class family) rather than inventing new chip styling.

## Backward view

New file `src/main/view/viBackwardView.js`, modeled directly on `viEquationView.js`'s
constructor/setup/updateBounds/show/hide shape (same family: plain DOM + Canvas2D, not a p5 draw()
participant). Reads `valueIterationViewModel.activeStateId` (same field Equation view already
reads) and, for the sweep currently pinned/hovered, walks every OTHER state's
`getBackupDetail(sweepIndex, otherId).actions` looking for transitions whose `nextState ===
activeStateId`, rendering one row per matching `(otherState, action, probability, reward)` — pure
re-grouping of already-computed data, no new domain math (per the scoping doc's correction).

Wire into `viRightViewPill.js`'s `VI_RIGHT_VIEW_PILL_OPTIONS` as a conditionally-shown third button
(hidden via the same show/hide the pill already supports, gated on `known:full` quadrant AND
`simulationState.piMode === 'timeDependent'` — check both before calling `.show()` on the button,
or filter the rendered options in `refresh()`). Wire into `mainView.js`'s two resize functions
(`windowResized()`/`onPanelResize()`) alongside the existing `viEquationView`/`viChartView`
show/hide branching — `rightView === 'backward'` shows `ViBackwardView`, hides the other two.

## Non-goals for this pass

- No changes to the two partial-observability quadrants (Belief Iteration / PO Q-Learning) — π_t's
  UI (toggle/pager) still renders there since it's shared Policy π infrastructure, but Backward
  stays `known:full`-only, and no attempt is made to reconcile π_t with those quadrants' existing
  illustrative belief-scalar heuristic.
- No weighted-random distributions per timestep — each t-slot is a concrete action or the
  `'random'` (uniform) sentinel only, not an arbitrary per-timestep weight distribution (Stationary
  mode keeps its fuller weighted editor unchanged).
- Reviving `viLeftViewPill.js` — left as dead code, per decision #5 above.
