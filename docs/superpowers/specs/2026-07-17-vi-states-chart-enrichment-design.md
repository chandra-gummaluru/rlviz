# Iteration Screen Split Follow-On: Backup Diagrams + Chart View — Design

## Context

Phase 3b (`docs/superpowers/specs/2026-07-17-vi-screen-split-design.md`, shipped) gave Values →
Iteration a persistent 52%/48% split for the three quadrants that run `ValueIterationView`'s real
Bellman-sweep computation (Value Iteration, Belief Iteration, PO Q-Learning — collectively "the
3 split quadrants"; Learning Iteration, the 4th quadrant, is untouched by 3b and by this
document). The left pane's **States** view currently shows one section per computed sweep
(`t = k`), each with a flat `state: value` row per state.

This document covers three follow-on enhancements to that same left pane, requested after seeing
a reference screenshot of the original design handoff's prototype:

1. **Richer per-state cards** — for `known:full` (real Value Iteration) specifically, each
   state's card becomes a small backup diagram (state → its actions with Q-values → each
   action's outcome next-states with their prior-sweep V, best action starred), instead of a flat
   number. The other 3 quadrants (Belief Iteration, PO Q-Learning, Learning Iteration) keep
   today's flat card — explicitly out of scope for now, not silently degraded.
2. **A real `[States | Chart]` toggle pill** (replacing the current static "States" label chip),
   anchored to the right (MDP) pane's bounds — same cosmetic-placement convention Monte Carlo's
   `mcLeftViewPill` already uses (visually on the graph side, functionally controlling the left
   pane). Applies to all 3 split quadrants.
3. **A new inline Chart view** for the left pane's "Chart" option — Q-table on top, Convergence
   (V̂(S₀) vs V*, with Monte Carlo's own estimate overlaid if it's been run) on the bottom.
   Applies to all 3 split quadrants. Once this exists, the bottom `ChartDock` stops showing for
   these 3 quadrants specifically — mirroring exactly how Phase 3a already stopped routing Monte
   Carlo through `ChartDock` in favor of its own inline `ExpectationChartView`. Learning
   Iteration's own relationship with `ChartDock` (whatever it is today) is untouched.

## Current state (research summary)

`ValueIterationState.getBackupDetail(sweepIndex, stateId)` already returns everything a backup
diagram needs, per state per sweep: `{ actions: [{ actionId, actionName, qValue, transitions: [{
nextState, nextStateName, probability, reward, nextValue, term }] }], bestActionId, value }` — no
domain-layer change is needed for either the diagram or the chart view.

`ChartDataBuilders.buildQTableData(valueIterationState)` and `.buildConvergenceData(expectationState,
valueIterationState)` (both existing, in `src/main/view/helpers/chartDataBuilders.js`) already
produce exactly the shapes the new Chart view needs — the same functions `chartDock.js`'s
`_renderQTable()` and `_renderConvergence()` already consume, and the same `buildConvergenceData()`
`expectationChartView.js` already calls for Monte Carlo's own convergence chart.

`viStatesView.js` (Phase 3b) is a DOM component; each state's card today is two `<span>`s (name,
value) inside a flex row. The new backup diagram needs real 2D drawing (circles, lines, labels) —
a `<canvas>` element per card is the natural fit, not SVG (matching the explicit "not SVG"
direction) and not a second p5 sketch instance (this app runs p5 in global mode with exactly one
canvas; spinning up per-card p5 instances would be a much larger architectural change for no
real benefit here).

**One real technical wrinkle, resolved below rather than left implicit:** `MathRenderer.draw(ctx,
...)` (`src/main/view/helpers/MathRenderer.js`) is mostly canvas-context-agnostic — its "ready"
path (cached KaTeX image) draws via `ctx.drawImage(...)`, which works on any 2D context, not just
the main canvas's. But its two-or-more-failures fallback path (`_drawPlainText`) calls p5 GLOBAL
functions (`fill()`, `text()`, etc.), which always draw to the MAIN canvas regardless of what
`ctx` was passed — a real mismatch if it ever fires while rendering into a mini-card's own
canvas. Rather than depend on a rarely-exercised, effectively-untested cross-canvas edge case,
the backup diagram renderer draws its own labels ("Q = 3.80", "V = 3.80") via plain
`ctx.fillText()` (monospace font, sized/styled to match the rest of the app's numeric labels)
instead of `mathRenderer.draw()`. This trades a small amount of visual polish (no KaTeX
typesetting) for full correctness and zero async-loading complexity in a place that's rendering
many small, simple, single-line labels — not the multi-term equations `mathRenderer` exists for
elsewhere in this codebase.

## Goal

Bring the Iteration left pane's content up to the richness shown in the original design handoff's
prototype, scoped down to what's concretely buildable and valuable now:
- `known:full` gets real per-state backup diagrams in its States view.
- All 3 split quadrants get a real `[States | Chart]` toggle, with Chart showing Q-table +
  Convergence.

## `[States | Chart]` pill

Replaces the current static, non-interactive "States" label chip (`viStatesView.js`'s
`_labelChipEl`) with a real two-option segmented pill, modeled directly on `mcLeftViewPill.js`
(same DOM/CSS shape: a `<div>` track with two `<button>`s, an `--active` class toggled by a
`leftView`-style viewmodel field). Anchored to the **right (MDP) pane's** bounds via
`updateBounds(x, width)` — `x = leftW`, `width = rightW` — the same cosmetic placement `mcLeftViewPill`
already uses (it visually floats over the graph side, but its clicks still change what the LEFT
pane shows). `ValueIterationViewModel` gains a `leftView: 'states' | 'chart'` field (default
`'states'`), mirroring `ExpectationViewModel.leftView` exactly.

## Backup diagram (States view cards, `known:full` only)

Each state's card, for every computed sweep, renders via a dedicated `<canvas>` element instead
of a flat text row:
- The state (left, circle + name label).
- Its actions (middle column, one per action, each a small diamond/rounded shape + `Q = x.xx`
  label; the best action — `detail.bestActionId` — gets a highlighted stroke/fill and a star,
  matching the reference screenshot).
- Each action's outcome next-states (right column, one row per `(action, transition)` pair, in
  the same order `detail.actions[].transitions[]` already lists them — NOT deduplicated by
  next-state, since the same next-state reached by two different actions is two genuinely
  different transitions worth showing separately, matching the reference screenshot's own S2
  appearing twice). Each next-state row shows that state's OWN `V` from the PRIOR sweep
  (`getBackupDetail(sweepIndex - 1, transition.nextState).value`, or the sweep-0 initial V if
  `sweepIndex === 0`) — the number that was actually read to compute this backup, matching the
  screenshot's own `t = 0` sub-label under the outcome box.
- A `V = x.xx` summary at the top of the card (the state's own resulting value this sweep —
  already what today's flat card shows, kept as the card's header instead of its only content).

Rendered via plain Canvas2D (`ctx.beginPath()/arc()/moveTo()/lineTo()/stroke()/fillText()`), sized
to fit within the existing card layout, with a fixed/deterministic layout algorithm (not
`TreeLayout.js`'s more general recursive positioning, which solves a different, harder problem —
laying out an arbitrarily-deep, arbitrarily-wide unrolled search tree across the whole canvas).
This diagram is exactly one level deep with a small, bounded number of actions/transitions per
state, so a direct three-column layout (state column / actions column / next-states column, each
vertically distributed) is enough — no shared layout engine needed. Static (no animation, no
tweening) — this is a historical snapshot of an already-computed sweep, not a live simulation
step.

Scope: **`known:full` only.** The other 3 quadrants keep today's flat `state: value` card
unconditionally — no visual branching inside the card-building code beyond "is this
`known:full`," decided once per card build, not per-frame.

## Chart view (`ViChartView`)

New file, mirroring `expectationChartView.js`'s exact shape: two fixed, non-configurable stacked
slots (no per-slot `<select>`, matching `ExpectationChartView`'s own established simplification).
Top slot: Q-table, via `ChartDataBuilders.buildQTableData(valueIterationState)` rendered as a DOM
`<table>` (reusing `chartDock.js`'s own `_renderQTable()` table-building approach as a close model,
not a literal shared function — `chartDock.js` itself stays untouched). Bottom slot: Convergence,
via `ChartDataBuilders.buildConvergenceData(expectationState, valueIterationState)` rendered as a
Chart.js line chart — the exact same call `expectationChartView.js`'s own top chart already makes,
so VI's and MC's convergence charts show identical, already-validated data.

Applies to all 3 split quadrants (not `known:full`-only, unlike the backup diagram) — Q-table and
convergence data are equally real for Belief Iteration and PO Q-Learning (they reuse VI's real
numbers under an illustrative label, per `ValuesMethodMatrix`), so there's no reason to withhold
the Chart option from them.

Once `ViChartView` exists, `ChartDock` stops showing whenever one of the 3 split quadrants is
active in Values → Iteration — mirroring exactly how Phase 3a already stopped routing Monte Carlo
through `ChartDock`. This only touches the existing quadrant-gated show/hide calls already present
in `main.js`'s VI lifecycle hooks (`onEnter.values`'s `vi` branch, `onEnterSubView.vi`, the
model-known/observability toggle handlers) — no change to `chartDock.js` itself, and no change to
whatever Learning Iteration's own current relationship with `ChartDock` is.

## Non-goals (explicitly deferred, not part of this follow-on)

- Backup diagrams for Belief Iteration, PO Q-Learning, or Learning Iteration — explicitly left as
  today's flat card, open for future design work, not silently approximated.
- Any animation/tweening in the backup diagram — static snapshots only.
- Any `ValueIterationState`/domain-layer change — both new pieces read already-computed data.
- Any change to `chartDock.js` itself, or to Learning Iteration's existing behavior/relationship
  with `ChartDock`.
- A resizable drag handle for the split (unchanged from Phase 3b — still a fixed constant).
- Reworking `mathRenderer.draw()`'s cross-canvas fallback limitation itself — worked around here
  (by not using it for these labels), not fixed at the source, since fixing it generally would be
  a separate, broader change affecting every existing caller.

## Summary of touched/new files (indicative — exact list decided in the implementation plan)

- `src/main/adapter/viewmodel/ValueIterationViewModel.js`: add `leftView` field.
- `src/main/view/viStatesView.js`: replace the static label chip with a real toggle pill (or
  extract the pill into its own file mirroring `mcLeftViewPill.js` — decided at plan time); add
  the `known:full`-gated backup-diagram card renderer.
- New file: a small Canvas2D backup-diagram rendering helper (exact name TBD at plan time), kept
  separate from `viStatesView.js`'s own DOM-building code so the layout/drawing math is testable
  and readable independent of the section/scroll machinery.
- New file: `src/main/view/viChartView.js`, mirroring `expectationChartView.js`.
- `src/main/app/main.js`: construct/wire the pill (if extracted) and `ViChartView`; extend the
  existing VI lifecycle hooks to hide `ChartDock` for the 3 split quadrants.
- `style.css`: new CSS for the pill (if a new file) and the chart view, mirroring
  `.mc-left-view-pill*`/`.expectation-chart-view*`.

No domain layer changes (`valueIterationState.js` untouched) — this is view/viewmodel-tier layout
and a new presentation-only rendering helper, reusing existing domain data throughout.
