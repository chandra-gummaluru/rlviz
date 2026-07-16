# Evaluate Redesign Phase 3a: Monte Carlo Screen Split — Design

## Context

This is Phase 3a of the 7-phase Evaluate redesign (see
`docs/superpowers/specs/2026-07-16-evaluate-goal-card-design.md` for the roadmap; Phases 1
[toolbar segments + goal card] and 2 [Evaluate π + policy log] are shipped). Phase 3 ("52/48
screen split + overlays") was flagged as large enough to need its own decomposition — it's split
into **3a: Monte Carlo's screen split** (this document) and **3b: Iteration's screen split**
(separate, later spec). The two share a right-side graph panel and view-pill placement
conceptually, but are independently large enough to design/plan/ship one at a time.

## Current state (research summary)

Today, Values → Monte Carlo's canvas has exactly two mutually-exclusive, full-width modes, never
a split:
- **Grid mode** (default): `ExpectationView.draw()` tiles the whole canvas into a grid of
  mini-panels (16/32/64, via `ExpectationViewModel.computeLayout()`), each independently rendering
  the entire graph at a shared fit-scale with that rollout's path highlighted.
- **Focused mode** (`vm.focusedRunIndex !== null`, entered by clicking a mini-panel or a chart-dock
  element): `_drawFocusedPanel()` replaces the *entire* canvas with one big rendering of that
  single rollout, plus a "← All runs" back button. Exiting returns to grid mode.

The right DOM panel (`rightPanel.js`'s `renderExpectationPanel()`) already has Parameters, Initial
State, Policy summary, Estimate/Episodes stats, a "Selected Run" inspector (shown when a run is
focused/hovered), and (as of Phase 2) the shared Policy log. The bottom `ChartDock` offers two
slots, each togglable between `convergence`/`histogram`, fed by MC's own data. `mcRunsPill.js`
already offers exactly `[16][32][64]`.

## Goal

Replace the two mutually-exclusive full-canvas modes with a persistent **52% left / 48% right**
split:
- **Left (52%)**: toggles between **Grid** (today's mini-panel grid, resized) and **Chart**
  (today's convergence + histogram, moved inline) via a new `[Grid | Chart]` pill.
- **Right (48%, new)**: a single, always-visible rendering of the MDP graph — not mini-panels, not
  a per-run full takeover. Selecting a run (from the Grid) highlights that run's visited path on
  this shared graph, synced to the existing scrubber's `currentT`. With no run selected, it shows
  the bare graph structure.

"Focused mode" is removed entirely — its role (see one specific rollout's path on a full rendering
of the graph) is replaced by the always-visible shared right panel, which is a strict improvement
(no modal full-canvas takeover, no back button needed).

## Layout

- Canvas width for Values → Monte Carlo splits: `leftW = usableWidth * 0.52`,
  `rightW = usableWidth * 0.48` (constants, not user-resizable in this phase — no drag handle;
  that could be a future refinement, not requested here).
- Left pane hosts whichever of Grid/Chart is currently selected (`ExpectationViewModel` gains a
  `leftView: 'grid' | 'chart'` field, presentation-only, default `'grid'`).
- Right pane hosts the new shared-graph renderer (a new, focused view — see "New: shared graph
  panel" below).
- The `[Grid | Chart]` pill sits top-right of the LEFT pane specifically (not the whole canvas),
  styled like `mcRunsPill.js`/`estimatorPill.js`'s existing floating-pill conventions.
- The existing `[16][32][64]` runs pill, the shared `TraceScrubber`, and the right DOM panel are
  unaffected by this split — they continue to float/dock exactly where they already do; only the
  CANVAS content changes shape.

## Grid view (left, when selected)

Reuses `ExpectationView`'s existing grid-mode rendering and `ExpectationViewModel.computeLayout()`
verbatim, just budgeted against the left pane's width (52% of usable width) instead of the full
canvas. Clicking or hovering a mini-panel sets a `selectedRunIndex` (replacing today's
`focusedRunIndex`'s role, but no longer triggering a full-canvas mode switch — see "Run selection"
below).

## Chart view (left, when selected)

Moves today's `ChartDock`'s convergence + histogram content inline into the left pane, replacing
the bottom dock **for the Monte Carlo sub-view specifically**. `ChartDock` itself is not deleted —
Iteration's own use of it (Phase 3b's concern) is untouched; this phase only stops MC from routing
through it, in favor of the new inline Chart view showing the same two chart types (reusing
`chartDataBuilders.js`'s existing pure data-shaping functions — no new chart math, just a new
render target).

## New: shared graph panel (right)

A new view (naming TBD in the implementation plan — e.g. `expectationGraphView.js`) that renders
the MDP graph **once**, full-scale within the right 48% pane, using the same node/edge drawing
conventions Build/Policy's own graph rendering already uses (reuse, don't reinvent). Behavior:
- **No run selected**: bare graph, no highlighting — same node/edge colors as an idle Build-mode
  graph.
- **A run selected** (via clicking/hovering a Grid card): that rollout's visited edges/nodes are
  highlighted along the graph, synced to the shared scrubber's `currentT` (i.e., as the scrubber
  moves, the highlighted-so-far portion of that run's path updates) — this is the direct
  replacement for what `_drawFocusedPanel()` used to show on a full canvas.
- Switching to Chart view in the left pane does NOT hide the right graph panel — the split stays
  52/48 regardless of which left view is active.

## Non-goals (explicitly deferred, not part of 3a)

- **Tree view** (a third `[Grid | Tree | Chart]` pill option showing the MDP unrolled with
  occupancy N× badges) — deferred to a follow-up (3a-ii or folded into a later pass), since it's a
  new component from scratch and not needed to validate the core split.
- **Occupancy N× badges** on the shared graph — same underlying "how many rollouts touched this
  node" computation the deferred Tree view would need; deferred alongside it rather than building
  the counting logic twice.
- **Node sparklines** (per-state estimate settling over time) and **convergence popovers** on node
  hover — both only lightly described in the handoff and not actually implemented even in the
  reference prototype (a single stray unimplemented comment). Deferred until there's a real design
  to build against.
- **"Hovering a state card fades the graph to its neighborhood"** — part of the same underspecified
  cluster as the two items above; deferred even though it could cheaply reuse Build mode's existing
  `editorFocusNode`/`editorFocusNodeIds` fade mechanism, to keep this phase's scope consistent
  (all three deferred together, not cherry-picked by cost).
- **Iteration's own screen split** — Phase 3b, separate spec, separate plan.
- Any change to `expectationState.js`'s domain data/rollout generation, `chartDataBuilders.js`'s
  data-shaping logic, or `mcRunsPill.js`'s runs-count values — all reused as-is.

## Summary of touched/new files (indicative — exact list decided in the implementation plan)

- `src/main/adapter/viewmodel/ExpectationViewModel.js`: add `leftView`, `selectedRunIndex`
  (replacing `focusedRunIndex`'s role), split-aware layout math.
- `src/main/view/expectationView.js`: remove `_drawFocusedPanel()` and its entry/exit plumbing;
  adapt grid-mode rendering to the left-pane width budget; dispatch between Grid/Chart for the
  left pane.
- New file: a shared-graph right-pane renderer (exact name TBD).
- New file: a `[Grid | Chart]` pill (exact name TBD, modeled on `mcRunsPill.js`).
- `src/main/view/mainView.js`: route Values → Monte Carlo's draw call through the new split layout
  instead of `ExpectationView.draw(usableW, usableH)`'s current full-width call.
- `src/main/view/chartDock.js` / `main.js`: stop routing MC through the bottom dock; confirm
  Iteration's own dock usage is unaffected.
- `src/main/view/rightPanel.js`: likely no change (the DOM right panel is unaffected by the canvas
  split) — confirm during planning.

No domain layer changes (`expectationState.js` untouched) — this phase is view/viewmodel-tier
layout and interaction, reusing existing domain data and chart-building logic throughout.
