# Evaluate Redesign Phase 3b: Iteration Screen Split — Design

## Context

This is Phase 3b of the 7-phase Evaluate redesign (see
`docs/superpowers/specs/2026-07-16-evaluate-goal-card-design.md` for the roadmap). Phase 3
("52/48 screen split + overlays") was split into **3a: Monte Carlo's screen split** (shipped) and
**3b: Iteration's screen split** (this document) — the two share a right-side graph panel and
view-pill placement conceptually, but are independently large enough to design/plan/ship one at a
time, exactly as 3a's own spec anticipated.

Three phases (3b, 4 — ε convergence stop condition, and 6 — time-dependent policy π_t) were
researched together via a parallel multi-agent design pass before this document was written;
that pass's findings are the primary source for this spec's "Current state" section (independently
verified against the real, current codebase, not the original external handoff alone). A
cross-phase dependency surfaced by that research: **Phase 6's Backward Iteration view is
hard-blocked on this phase existing** — `ValueIterationState` was deliberately migrated away from
time-indexed backward induction toward synchronous-sweep-to-convergence, so there is currently no
time-indexed Bellman machinery anywhere in the codebase to hang a Backward view on. This document
does not attempt to build anything Backward-view-related; it only lands the split itself.

## Current state (research summary)

Today, Values → Iteration's canvas is NOT split — `mainView.js`'s `_valuesPaneWidths()` returns
`{ mc: canvasWidth, vi: canvasWidth }`; both sub-views get the full canvas width. This is the
exact seam Phase 3a already used for `mc` and that this phase extends to `vi`.

Rendering dispatches per quadrant (`ValuesMethodMatrix.key(modelKnown, observability)`), not
uniformly:
- `known:full` (Value Iteration), `known:partial` (Belief Iteration), and `unknown:partial` (PO
  Q-Learning) all render via `ValueIterationView.draw()` — state nodes at their REAL graph
  positions under the same pan/zoom viewport Build/Policy uses (not a synthetic fit-transform like
  Monte Carlo's mini-panels), heat-tinted by `|V(s)|/max|V|`, with policy-highlighted
  state→action→state edges, plus an optional "explanation overlay" (a multi-phase Bellman-backup
  fan-out animation) anchored to one state when a Q-table cell is clicked.
- `unknown:full` (Learning Iteration) renders via a separate, already more advanced subsystem,
  `LearningIterationView` — real episodic Q-learning with its OWN pre-existing Graph/Tree canvas
  toggle. This has diverged well beyond a simple "P unknown, edit the Q-table" description and
  doesn't fit this phase's 52/48 concept cleanly — it is explicitly out of scope (see Non-goals).

`ValueIterationState.history[k]` already stores everything a "per-state backup card" needs, one
full snapshot per sweep: `V`, `Q`, `policy`, and `backupDetails` (`stateId -> {actions,
bestActionId, value}`) — computed once in `computeNextSweep()` and never discarded.
`getBackupDetail(sweepIndex, stateId)` is the exact accessor; no domain-layer change is needed to
list every past generation's backup detail chronologically.

`ValueIterationViewModel` only tracks `activeStateId`/`backupDetail`/explanation-tween state
today — no concept yet of "hover this sweep to preview it," the way `ExpectationViewModel` already
has `hoveredRun`/`selectedRunIndex`/`highlightedRun` for Monte Carlo's grid.

Today's only way to "browse all generations" lives entirely in the DOM right panel:
`RightPanel._renderQTable()` renders one table with columns `k=0..T` and rows `state×action`;
clicking a revealed cell (P known) fires `onVICellClick` → sets
`valueIterationViewModel.explanationDetail`, which `ValueIterationView.draw()` renders as the
canvas fan-out overlay. `chartDock.js` additionally offers two VI-specific chart types (`qtable`,
`sweephistory`) in the same 2-slot bottom dock Monte Carlo used to share — Monte Carlo's Phase 3a
already stopped routing through `ChartDock` in favor of its own inline `ExpectationChartView`;
Iteration's own `ChartDock` usage is completely unaffected by that change and remains completely
unaffected by this phase too (see Non-goals — no Chart view is built for Iteration's left pane in
this pass).

Critically, `mainView.js`'s `draw()` dispatch for `subView === 'vi'` has **no canvas-level mouse
hit-testing at all** — unlike Build/Policy or Monte Carlo's mini-panel grid, all VI interaction
happens through the DOM right panel and the top bar's Play/Step/Skip/T-input. This makes 3b a
much smaller lift than 3a's own MC grid work: a rendering/layout change with no new hit-testing
logic to invent, since the new interactive surface (the States view) is itself real DOM.

3a's shipped pattern this phase mirrors directly: a fixed, non-resizable 52/48 split computed
once and shared (not duplicated) between sub-views; a floating DOM label/pill anchored to the
left pane's own bounds; a DOM component layered over the canvas for content that's fundamentally
list-shaped (the States view, mirroring `ExpectationChartView`), keeping genuinely graphical
content (the shared right-pane graph) as p5 draw calls; and a mode-lifecycle
`onEnterSubView`/`onLeaveSubView` hook table in `main.js` coordinating show/hide/position of all
the new pieces.

## Goal

Give Values → Iteration a persistent **52% left / 48% right split**, for the three quadrants that
run `ValueIterationView`'s synchronous-sweep computation:
- **Left (52%)**: a new **States** view — one section per computed sweep (`t = 0, 1, 2, ...`),
  chronological top-to-bottom, each holding one per-state backup card built from
  `ValueIterationState.getBackupDetail()`. New sweeps auto-scroll into view as they're computed.
- **Right (48%, shared with 3a's split geometry)**: the existing `ValueIterationView` rendering,
  translated and clipped into the right pane instead of the full canvas — otherwise pixel-for-
  pixel identical to what renders today.

## Layout

- Canvas width for Values → Iteration splits: reuses `ExpectationViewModel.splitWidths(canvasW)`
  directly (not a second 0.52/0.52 constant redefined elsewhere) — the exact same 52/48 fixed
  ratio Phase 3a already validated, kept as one shared source of truth so the two sub-views'
  splits can never drift apart from each other. (Exact placement of this shared helper — staying
  on `ExpectationViewModel` and read cross-viewmodel, or hoisted to a small shared module both
  viewmodels depend on — is a decision for the implementation plan, not this design; either way,
  there must be exactly one 0.52 literal in the codebase, not two.)
- Left pane hosts the new States view; right pane hosts `ValueIterationView.draw()`, translated by
  `leftW` and clipped to `rightW` — no fit-transform math needed here, unlike Monte Carlo's
  mini-panels, since VI already renders in real graph coordinates under the same pan/zoom viewport
  Build/Policy uses.
- A static, non-interactive label chip reading "States" sits top-right of the left pane (matching
  `estimatorPill.js`'s existing non-interactive badge-chip precedent), rather than a real
  segmented `[States | Backward | Tree | Chart]` pill — there is no second left-view option to
  switch to yet, so a real pill would have nothing to do. Promoting this to a real pill is future
  work, once Backward (Phase 6, itself gated on this phase) or Chart actually ship.
- This split applies only to `known:full`, `known:partial`, and `unknown:partial`.
  `unknown:full` (Learning Iteration) is entirely unaffected — its current full-canvas Graph/Tree
  view is untouched by this phase (see Non-goals).

## States view (left pane)

One section per sweep computed so far (`k = 0` through `currentSweepIndex`), rendered
chronologically with the newest at the bottom. Each section contains one card per state, sourced
directly from `ValueIterationState.getBackupDetail(k, stateId)` — no new domain computation. New
sections appear as `computeNextSweep()` advances the real computation; the view auto-scrolls to
keep the newest section in view only when a genuinely new sweep is added (not on every intra-sweep
animation frame — Play's continuous ticking must not fight the user for scroll position mid-sweep).

**Selection model**, matching Monte Carlo's grid exactly (`ExpectationViewModel.highlightedRun`'s
convention, applied to sweeps instead of runs):
- Hovering a generation section previews that sweep's numbers on the shared right-pane graph —
  transient, reverts the moment the mouse leaves.
- Clicking a generation section pins it (clicking the same section again unpins); a pinned
  preview persists until explicitly unpinned or a different section is clicked.
- Play/Step/Skip always operate on the real, live sweep computation regardless of what's
  currently pinned for preview — pinning is a display-only concern, exactly like Monte Carlo's
  `selectedRunIndex` never gates or redirects Play/Step there.

The existing Q-table-cell → canvas explanation-overlay interaction (click a revealed cell in
`RightPanel._renderQTable()`, see the Bellman-backup fan-out animation) is untouched and continues
to coexist alongside the new States view — this phase is purely additive there, not a replacement.

## Shared right pane

Reuses `ValueIterationView.draw()` verbatim. The only change is where and how much of the canvas
it's given: today it receives the full canvas width; after this phase, while `known:full` /
`known:partial` / `unknown:partial` is active, it receives `rightW` (48% of canvas width),
translated by `leftW`. No node-position math, fit-transform, or rendering logic inside
`ValueIterationView` itself needs to change — pan/zoom, heat-tinting, policy-edge highlighting,
and the Q-table-cell explanation overlay all continue to work exactly as they do today, just
within a narrower drawing region.

Switching between which sweep is hovered/pinned in the States view does not change what
`ValueIterationView.draw()` fundamentally shows (it always shows the real graph) — it changes
*which sweep's* `V`/`Q`/heat values are read for that render, the same way Monte Carlo's
`selectedRunIndex` changes which rollout's path is highlighted on its own shared right pane
without changing the rendering approach itself.

## Non-goals (explicitly deferred, not part of 3b)

- **Backward, Tree, and Chart left-pane views** — the handoff's full
  `[States | Backward | Tree | Chart]` view list is a lot for one phase; only States ships now.
  Backward in particular cannot exist yet regardless of scope choice (see Context) since it needs
  Phase 6's time-dependent policy machinery, which doesn't exist. Tree is deferred the same way
  3a deferred Monte Carlo's own Tree view. Chart is deferred since Iteration's existing
  `ChartDock` usage (Q-table, sweep-history chart types) already covers overlapping ground and
  isn't part of this phase's scope.
- **A real segmented view-pill** — a static label chip suffices until a second left-view option
  ships (see Layout).
- **Learning Iteration's own screen split** — structurally different (episode-based, not
  generation-based) content; explicitly scoped out, tracked as a named follow-up decision, not
  silently dropped.
- **Any new right-pane overlay richness** — node sparklines, convergence popovers,
  hover-fade-to-neighborhood, a dedicated V^(k-1)→V^k transition-label overlay (today's existing
  heat-tint/pulse-ring stays as-is), and occupancy N× badges (a Monte Carlo-only concept to begin
  with) are all out of scope, mirroring the same cluster 3a deferred for its own right pane.
- **A resizable drag handle for the split** — stays a fixed constant, per 3a's own precedent.
- **Retiring the Q-table-cell explanation-overlay entry point** — both it and the new States view
  coexist; nothing existing is removed.
- **Any `ValueIterationState`/domain-layer change** — this phase is view/viewmodel-tier layout and
  a new presentation-only selection concept, reusing existing domain data throughout.

## Summary of touched/new files (indicative — exact list decided in the implementation plan)

- New file: `src/main/view/viStatesView.js` — the States view, modeled directly on
  `src/main/view/expectationChartView.js`'s overlay-over-canvas DOM pattern.
- `src/main/adapter/viewmodel/ValueIterationViewModel.js`: add a hovered/pinned sweep-index
  concept (naming and exact shape decided in the implementation plan, following
  `ExpectationViewModel.hoveredRun`/`selectedRunIndex`/`highlightedRun`'s precedent).
- `src/main/view/valueIterationView.js`: confirm `draw()` can be called with a translated origin
  and clipped width/height without internal changes; read whichever sweep index the new
  hover/pin state resolves to (falling back to `currentSweepIndex` when nothing is
  hovered/pinned), instead of always reading `currentSweepIndex` directly.
- `src/main/view/mainView.js`: route Values → Iteration's draw call through the new split layout,
  the same way `mainView.js` already routes Monte Carlo's.
- `src/main/app/main.js`: construct/wire the new States view; extend the mode-lifecycle hooks
  (`onEnterSubView.vi`/`onLeaveSubView.vi`) to show/hide/position it, mirroring how Monte Carlo's
  equivalents were wired in Phase 3a.
- `style.css`: new `.vi-states-view*` rules, mirroring `.expectation-chart-view*`'s existing
  structure.
- `src/main/view/rightPanel.js`, `src/main/view/chartDock.js`: confirm-only — this phase is not
  expected to require changes here, but Phase 4 (ε convergence, queued next) is expected to touch
  the same right-panel Convergence section shortly after, so the implementation plan should note
  the shared surface for whoever picks up Phase 4 next.

No domain-layer changes (`valueIterationState.js` untouched) — this phase is view/viewmodel-tier
layout and interaction, reusing existing domain data throughout, exactly like Phase 3a was.
