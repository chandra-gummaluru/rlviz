# Values → Iteration: States View Redesign + Equation Pane — Design Spec

## Context

The Iteration States/Chart Enrichment follow-on (just shipped) added a per-state "backup
diagram" canvas to each States-view card in the `known:full` quadrant. Once exercised in a real
browser, the result was visually poor: no name label on the state or action circles (just
anonymous colored dots), the state's `V` value floats disconnected in the card's corner instead
of being attached to the state it describes, and the whole thing reads as an ambiguous tangle of
same-styled circles rather than a clear state → action → outcome hierarchy.

Separately, the user wants two things this project doesn't do today:

1. A visually louder, clearer per-state card — matching a reference mockup from the original
   design handoff prototype (dashed `t = k` section wrapper, one big card per state with a
   name+V header, treeView-style labeled circles) — plus a **timeline** behavior where only the
   live/current sweep stays expanded and older sweeps collapse into small clickable pills, so a
   long run doesn't turn into an endless scroll of full-size cards.
2. A real explanation, in the same visual language the rest of the app already uses for math (V*
   equation header, KaTeX rendering), of **how** a specific state's Q-values were computed — not
   just the final numbers. The existing "Q-cell explanation overlay" already animates exactly
   this (highlight state value → show each outcome's reward → show transition probability →
   combine/multiply → sum → highlight best action), but today it only fires from a right-panel
   Q-table cell click and draws anchored to real graph node positions on the shared canvas. The
   user wants this promoted to the *default* content of the right pane — replacing the live MDP
   graph there — driven by clicking a specific state's card in the redesigned left pane, with a
   toggle to bring the graph back when wanted.

This spec covers both: the States-view visual/timeline redesign (left pane) and a new Equation +
Q-table view (right pane), for all 3 split quadrants (Value Iteration, Belief Iteration, PO
Q-Learning — Learning Iteration is, as always, unaffected and keeps its own full-canvas Graph/Tree
view).

## Goals

- Every backup-diagram card clearly reads as state → actions (Q, best starred) → outcomes (prior
  sweep's V), with every node labeled by name, matching `treeView.js`'s established node styling
  (circles, in-circle contrast-colored name labels, `AppPalette.node.state`/`.node.action` fill).
- A card header (name + `V = X.XX`) sits above the diagram, not floating inside it.
- Long runs stay navigable: only the current sweep auto-expands; older sweeps collapse to a
  `t = k` pill you can click open (additively — clicking a pill doesn't force anything else
  closed). Applies to all 3 split quadrants, independent of whether a section's cards are the
  rich diagram (`known:full`) or the flat `state: value` card (the other 2).
- A newly-expanded sweep's diagrams reveal progressively (state → action → outcome) rather than
  popping in fully drawn.
- Clicking a specific state's card selects it as the "active state" and switches the right pane
  (by default) to that state's Bellman equation header, an animated step-by-step calculation
  reveal (reusing the existing explanation subsystem's phase choreography), and a Q-table scoped
  to just that state's actions.
- A small toggle switches the right pane back to the live graph view (today's behavior),
  independent of the left pane's own States/Chart toggle.
- Hovering/pinning a sweep updates whichever right-pane view is active: the Equation/Q-table's
  substituted numbers when in Equation view, or the graph's node labels when toggled to Graph
  view (unchanged from today).

## Non-goals

- No change to `ValueIterationState`'s actual computation (`computeNextSweep`,
  `getBackupDetail`) — this is presentation-only, same as every prior phase.
- No change to Learning Iteration (`unknown:full`) — untouched.
- The Equation pane's animated reveal is a *new, independent* implementation targeting a fixed
  DOM/canvas panel layout — it does not attempt to literally reuse the existing graph-anchored
  overlay's rendering code (which assumes real node x/y positions and draws on the shared p5
  canvas). It reuses that subsystem's *data and phase-timing conventions* (equation formatting,
  phase names/durations), not its rendering.
- No change to the Monte Carlo sub-view or its own Grid/Chart split.

## Architecture

### Left pane: `ViStatesView` + `ViBackupDiagram` rework

**Card layout.** Each state's card becomes:
```
┌──────────────────────────────────┐
│ S0                      V = 5.00 │  <- header row (flex, space-between)
│ ─────────────────────────────────│  <- divider (border-bottom)
│  [diagram canvas, ~260x140]      │
└──────────────────────────────────┘
```
DOM: `.vi-states-view-card--diagram` now contains a `.vi-states-view-card-header` (two spans:
name left, `V = X.XX` right, styled via existing `--text-*`/accent CSS vars — not baked into the
canvas) plus a `<canvas>` sized larger than before (260×140, up from 220×96, to give the diagram
room to breathe). The flat card (`_buildFlatCard`, other 3 quadrants... wait, other 2 quadrants
share this diagram gate but keep flat cards) is unchanged.

**Node styling** (`ViBackupDiagram.draw()` rewritten): mirrors `treeView.js`'s `_drawNode()`
convention exactly —
- State node: circle, radius `VBD_STATE_RADIUS = 16`, fill `colors.state` (→
  `AppPalette.node.state`), name drawn inside via `ColorUtils.contrastText(colors.state)`.
- Action node: circle, radius `VBD_ACTION_RADIUS = 11`, fill `colors.action` (→
  `AppPalette.node.action`) normally, or `colors.best` (→ `AppPalette.valueIteration.best`) when
  it's the best action — name (`a0`/`a1`, i.e. `action.actionName`) drawn inside via
  `ColorUtils.contrastText()` against whichever fill applies. `Q = X.XX` (` ★` suffix for best)
  drawn as a small label above the node, same position convention as today.
- Outcome node (prior-sweep snapshot): circle, radius `VBD_ACTION_RADIUS`, fill `colors.state`,
  but **dashed stroke** (`ctx.setLineDash([4, 3])`) instead of solid — signaling "this is a
  snapshot from the previous sweep," matching the existing dashed-node convention this app
  already uses for partial-observability nodes. Name drawn inside (contrast color); `V X.XX`
  label to the right (as today); a small `t = k-1` caption centered below the whole outcome
  column (not per-node — one caption per card, since every outcome shares the same prior sweep).
- Colors param shape changes from `{action, best, result}` to `{state, action, best, result}` (new
  `state` key) — call site (`viStatesView.js`'s `_buildDiagramCard`) updated to pass
  `AppPalette.node.state` alongside the existing three.

**Reveal animation.** New `ViBackupDiagram.drawAnimated(canvas, detail, priorValues, colors,
onFrame)` — a staged version of `draw()` driven by `setTimeout`-chained steps, reusing this
project's established phase-timing scale (~150-250ms per step, matching
`viAnimOptions.getBeatMs()`'s range elsewhere in this codebase):
1. State node + `V` header fade in.
2. For each action, in order: draw the state→action line, then the action node + `Q = ...`
   label.
3. For each of that action's transitions, in order: draw the action→outcome line, then the
   outcome node + its `V`/`t=k-1` label.
4. Best-action highlight (ring/color swap) as the final step.

`_buildDiagramCard()` calls `drawAnimated()` instead of `draw()` **only** when the card belongs to
a sweep that just became expanded for the first time (tracked via a `Set` of sweep indices already
animated, on `ViStatesView`, so re-scrolling past an already-revealed card doesn't replay it);
`draw()` (instant, no staging) is used for every other render (re-expanding an already-seen pill,
a resize-triggered `rebuildAll()`, theme change).

### Left pane: timeline (sections, pills)

**New state on `ViStatesView`:** `this._manuallyExpanded = new Set()` — sweep indices the user has
explicitly clicked open. A section is expanded iff `sweepIndex === liveSweepIndex ||
this._manuallyExpanded.has(sweepIndex)`, where `liveSweepIndex` is `this.viState.currentSweepIndex`
(matching the "the live sweep is always shown large" invariant). The live section itself is not
individually collapsible by click — only past/manually-expanded sections toggle via their pill.

**Section DOM.** `.vi-states-view-section` gains `border: 2px dashed var(--vi-accent-color, ...)`
(the quadrant's own accent token — `AppPalette.valueIteration.accent`-equivalent CSS var already
used elsewhere for this quadrant's chrome), `border-radius: 8px`, and `padding: 12px`. The
existing `t = k` header div (currently plain text, `header.textContent = \`t = ${sweepIndex}\``)
becomes the section's always-visible top row regardless of collapsed state — styled
`font-size: 12px`, the accent color, `padding-bottom: 8px` when expanded. When collapsed
(`.vi-states-view-section--collapsed` class on the section), the `.vi-states-view-cards` child is
set to `display: none` via that class's CSS (cards stay in the DOM, cheap toggle, no rebuild) and
the section's own height collapses to just the header row (`padding-bottom: 0`, no cards to show);
the header row becomes clickable (`cursor: pointer`) in this state. Clicking the header row toggles
`_manuallyExpanded`'s membership for that sweep index and re-applies visibility. `refresh()`'s
existing append-only section-building logic is unchanged; only a new `_applyExpansion()` pass
(called after every `refresh()`, mirroring the existing `_applyHighlight()` pass) toggles the
`--collapsed` class per section based on `sweepIndex === liveSweepIndex ||
this._manuallyExpanded.has(sweepIndex)`.

**Card-level click (state selection).** Within an *expanded* section, clicking an individual
state's card (not the section's own pill-header) sets `this.viViewModel.activeStateId = stateId`
(reusing the existing, previously-unused `ValueIterationViewModel.activeStateId` field) **and**
pins that card's sweep (`pinnedSweepIndex = sweepIndex`, same existing pin mechanism) — a single
click both selects the state and pins its sweep for the right pane. Re-clicking the same
already-active card's state clears `activeStateId` back to `null` (right pane falls back to
whatever it shows when nothing is selected — see below) but leaves the sweep pin as-is (pinning
and active-state selection are two independent toggles, matching how `pinnedSweepIndex` already
behaves independently of hover today).

### Right pane: `ViEquationView` (new) + `viRightViewPill` (new)

**New ViewModel field:** `ValueIterationViewModel.rightView` — `'equation'` (default) | `'graph'`,
same shape/convention as `leftView`, living in the constructor (not `reset()` — same reasoning as
the `leftView` fix from the prior follow-on's final review: a VI Reset must not silently flip this
back and desync the pill).

**`viRightViewPill.js`** — a `[Equation | Graph]` segmented pill, structurally a near-duplicate of
`viLeftViewPill.js`/`mcLeftViewPill.js` (same `constructor(callbacks, canvasViewModel)`,
`.setup(topOffset)`, `.updateBounds()`, `.refresh()`, `.show()`/`.hide()` shape), anchored to the
**left edge of the right pane** (mirroring `viLeftViewPill`'s anchor to the right pane's own left
edge — the two pills sit on the two facing inner edges of the split, not stacked on one side).

**`viEquationView.js`** — a new DOM component (same family as `viChartView.js`/`viStatesView.js`),
shown in the right pane when `rightView === 'equation'` (the default), containing:
1. **Equation header** — the existing `VIPresenter._formatEquationHeader(stateName, sweepIndex)`
   LaTeX string, rendered via KaTeX. `renderKatex()` (currently a file-local function in
   `rightPanel.js`) is promoted to `src/main/view/helpers/KatexRenderer.js` as
   `KatexRenderer.render(latex, display = false)` (identical body — a thin wrapper around
   `katex.renderToString`), with `rightPanel.js`'s own call sites updated to the new name and its
   local `renderKatex`/`latexEscapeText` functions removed in favor of the shared helper (
   `latexEscapeText` moves alongside it as `KatexRenderer.escapeText()`, since `viPresenter.js`
   already has its own private copy of the same escaping logic that can now also delegate to it).
   A new `<script>` tag for `KatexRenderer.js` is added to `index.html` in the theming/typography
   helpers block (alongside `MathRenderer.js`), before `rightPanel.js` and before the new
   `viEquationView.js`.
2. **Animated calculation reveal** — a new, small phase-state machine *local to this view*
   (`this._revealPhaseIndex`, `this._revealTimer`), rendering into this view's own fixed-layout
   `<canvas>` (420×220, sized to the panel, not anchored to real graph coordinates) via plain
   `ctx` calls — not `mathRenderer`, not the existing graph-anchored overlay code. Exactly 4 phases,
   each holding for `VEV_PHASE_MS = 600`ms before advancing (`setTimeout`-chained, matching this
   codebase's existing beat-timing order of magnitude):
   1. `highlight_value` — the active state's node pulses (radius +2px, ring highlight), its prior
      sweep's `V` label enlarges briefly.
   2. `show_rewards` — for every action, every transition's outcome node + reward label
      (`R = X.XX`) fades in beside its line.
   3. `show_probabilities` — each transition's probability label (`P = 0.XX`) fades in next to its
      reward label, then both animate (a 300ms linear position tween) toward the action node,
      converging into that action's `Q = X.XX` label (replacing the individual reward/probability
      labels once merged).
   4. `select_best` — the best action's node gets `colors.best`'s ring highlight and its `Q` label
      gains the `★` suffix (matching the diagram cards' own convention); all other actions dim to
      60% opacity.
   Replays automatically (restarting at phase 1) whenever `activeStateId` or the previewed sweep
   changes; holds on phase 4 indefinitely once complete (no looping).
3. **Focused Q-table** — a new pure helper, `ChartDataBuilders.buildQTableRowForState(viState,
   stateId)` (returns the same per-action row shape `buildQTableData` already produces, filtered
   to one state — a small, additive change to that existing pure function file, not a rewrite),
   rendered as a small table below the reveal canvas, reusing the exact `chart-dock-qtable*` CSS
   classes `viChartView.js`'s own Q-table slot already uses.

**When nothing is active** (`activeStateId === null`): the equation view shows a neutral
placeholder ("Click a state's card to see its calculation" or similar), matching this
codebase's existing empty-state convention (e.g. `chart-dock-empty`).

**Graph view (`rightView === 'graph'`):** unchanged — this is exactly today's
`ValueIterationView.draw()` rendering, still translated/clipped into the right pane by
`mainView.js`'s existing dispatch. Toggling `rightView` back to `'graph'` simply shows the p5
canvas region and hides `viEquationView`'s container (mirroring how `leftView` toggling
shows/hides `viStatesView`/`viChartView` today). Hover/pin sweep preview continues to drive this
graph's node labels exactly as it does today, unchanged, whenever this is the active right view.

### Wiring (`main.js`, `mainView.js`)

- Construct `viEquationView`/`viRightViewPill` alongside the existing `viLeftViewPill`/
  `viChartView` construction block; `.setup()` at the same call site (after `viChartView.setup()`,
  same TDZ-avoidance reasoning already documented there).
- `setUpVISplitChrome()` (already branches on `leftView`) gains a second, independent branch on
  `rightView`: hide/show `viEquationView` vs. letting the p5 canvas draw dispatch render the graph
  region (the graph region itself needs a visibility gate too — likely a boolean read by
  `mainView.js`'s VI draw dispatch, e.g. skip calling `valueIterationView.draw()` while
  `rightView === 'equation'`, since the right pane's screen-space is now occupied by a DOM
  overlay).
- `VIPresenter`'s existing per-sweep refresh hooks (`_refreshStatesView`, `_refreshChartView`) gain
  a third: `_refreshEquationView()` (same null-guarded, no-op-while-hidden shape) — since
  `viEquationView`'s reveal is driven by `activeStateId`/`previewedSweepIndex`, not sweep
  completion directly, this refresh mainly matters for keeping the Q-table numbers current if the
  active state is being re-computed live during Play.
- `onModelKnownToggle`/`onObservabilityToggle` (already re-sync `ChartDock`/left-pane chrome
  immediately) gain the same immediate re-sync for the right-pane toggle/view.
- Resize handlers (`windowResized()`/`onPanelResize()`, already patched once this session for the
  left pane's pill/chart bounds) gain equivalent bounds updates for `viRightViewPill`/
  `viEquationView`.
- `AppPalette._onThemeChange` gains a rebuild call for `viEquationView` (its reveal canvas bakes
  colors the same way `viBackupDiagram`'s cards do) — same pattern as the two existing entries
  there.

## Data flow

No new domain computation. `ValueIterationState.getBackupDetail(sweepIndex, stateId)` remains the
single source of truth for both the left pane's diagram cards and the right pane's equation/reveal/
Q-table — this spec only adds new *renderings* of that same data, plus two new small
presentation-only ViewModel fields (`rightView`, and reuse of the existing `activeStateId`) and one
small additive pure-function (`buildQTableRowForState`).

## Testing / Verification

No automated test suite (per project convention). Verification is manual/real-browser
(`playwright-core` against a local `http.server`), covering:
- Card visual correctness in both themes (node labels present, V header attached, dashed outcome
  nodes, best-action highlight) — screenshot comparison against the reference mockup's layout
  intent, not pixel-identical matching.
- Timeline behavior: run 4+ sweeps, confirm only the live sweep is expanded, older ones are pills;
  click a pill open, click it closed; confirm across all 3 split quadrants.
- Reveal animation: confirm a freshly-expanded sweep's cards stage in progressively; confirm
  re-expanding an already-seen pill does *not* replay the stage-in (renders instantly).
- Right pane: click a state's card, confirm the equation header, reveal animation, and focused
  Q-table all show that state's real numbers; toggle to Graph and back; confirm hover/pin still
  drives the graph's node labels in Graph view and the equation/Q-table's numbers in Equation view.
- Full regression matrix from the prior follow-on's Task 6/7 (quadrant toggles, MC↔VI switches,
  resize, zero console errors both themes) re-run once more against the combined state.
