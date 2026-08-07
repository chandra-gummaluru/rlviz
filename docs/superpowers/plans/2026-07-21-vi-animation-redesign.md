# Values → Iteration: Backup-Reveal Animation Redesign (handoff 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Source:** `~/Downloads/handoff 2/HANDOFF.md` + working prototype at
`~/Downloads/handoff 2/prototype/{Value Iteration Animation.dc.html, vi-app.js, vi-engine.js}`.
The prototype is the full behavioral spec (exact timings/choreography); this plan is the mapping
of that spec onto rlviz's real architecture, including everywhere the prototype's approach doesn't
translate 1:1 and what to build instead.

**Goal:** Replace the Values → Iteration left-pane per-state backup-reveal animation and right-pane
Explain/Chart content with the handoff's "Substitution" choreography: a real Bellman
**expectation** backup (already implemented), a ghost-subtree value marker, a DOM equation zone per
card that accumulates `Q(S,a) = …` with flying numbers substituting into dashed slots, an
expectation-combine phase, a redesigned multi-sweep Q-table + `V̂(S₀)` convergence chart, and a
plain-language narrator replacing the right pane's current diagram-based Equation view.

**Decisions locked in with the user (do not re-litigate):**
1. **Palette:** do NOT introduce the handoff's §5 new light-mode hex values. Drive every new visual
   through the existing `AppPalette.accent.*` namespace, which in dark mode already matches the
   handoff's colors almost exactly (see Phase 0). Light mode gets whatever `accent.*` already is.
2. **Right pane:** replace the current `viEquationView.js` diagram+reveal with the handoff's
   text-only narrator ("Explain"). Keep its existing scoped Q-table (cheap, useful, not
   contradicted by the handoff). Leave `viBackwardView.js` and the "Backward" pill option
   completely untouched — the handoff doesn't know about it, it's a real shipped feature.
3. **No Concept A/B toggle.** The prototype has an internal `equation` vs `substitution` concept
   switch; the handoff is titled "Substitution" and only specs that concept in depth. Ship
   **only** the substitution choreography — no user-facing toggle, no `_conceptA`-equivalent code.

**Explicit scope note:** the handoff's own "Affects" list (`HANDOFF.md` line 8-11) omits
`viEquationView.js`, `viRightViewPill.js`, and their `main.js`/`style.css` wiring — but §4 and §8
phase 5 clearly intend the Explain-view work. This plan's file list below is the corrected,
complete one.

**Architecture:** Presentation-layer only, plus one small domain addition (`pi` per action in
`backupDetails`). No changes to `ValueIterationState.computeNextSweep()`'s actual math. The single
largest structural change is **how the per-state reveal is driven** — see "Key architectural
change" below before starting Phase 2.

**Tech Stack:** Vanilla JS, p5.js, Canvas2D (`ctx.fillText`/`ctx.arc`, raw contexts — not
`mathRenderer`), plain DOM, KaTeX (`KatexRenderer`, already promoted). No build step, no automated
tests — verify manually in a real browser (`python3 -m http.server 8000`), both themes, both
`runMode` values (`expectation` and `optimal` — see Phase 2's own note), all three split quadrants
that reach the diagram cards, plus a fast smoke pass on the two non-diagram quadrants (Belief
Iteration, PO Q-Learning) and Learning Iteration to confirm they're genuinely untouched.

---

## Key architectural change: who drives the reveal

**Today:** `ViBackupDiagram.drawAnimated()` (`src/main/view/helpers/viBackupDiagram.js`) is fully
self-contained — an internal `moveIndex` + `requestAnimationFrame` loop walks a flat list of
`{type, action, transition, key, baseDuration}` moves (`_buildMoves()`) and draws **everything**,
including the live arithmetic (`reward`, `sum`, `probability`, `term`), as text directly on its own
`<canvas>` via `_workspaceText()`. There is no DOM equation area in a card at all today —
`ViStatesView._buildDiagramCard()` builds only a header (name + value) and a `<canvas>`.

**Target (per the prototype's actual split):** `BackupDiagram` (canvas) is a **passive visual
tree** — nodes, edges, the ghost-subtree value marker at rest, edge flares/highlights, and the
*persistent* per-transition term once landed (the "scoreboard" on the label lane). It is also the
**flying-number source**: every quantity that gets highlighted flies *from* a point on this canvas.
The **live substitution arithmetic** — the accumulating `Q(S,a) = ` line, the dashed `P(...)·(r +
γ·Vₜ(s′))` template with slot boxes, numbers filling slots, the collapse to a term, the term flying
up into the accumulation — lives in a **new DOM equation zone** per card
(`vi-engine.js`'s `eqZone`/`accLine`/`workLine`, built with plain styled `<span>` tokens + CSS
transitions), which the diagram's canvas has no knowledge of.

**Chosen integration (a judgment call, not asked of the user — low risk, least invasive):** rather
than splitting responsibility between `viStatesView.js` and `viBackupDiagram.js` (which is how the
prototype splits it, because the prototype's `StatesView` owns the async reveal loop directly),
keep `ViBackupDiagram` as the **single owner of a card's entire animated content**, matching its
current role exactly — just widen what it owns from "one canvas" to "one canvas + one DOM equation
zone element". Concretely:
- `ViStatesView._buildDiagramCard()` creates a new `<div class="vi-backup-diagram-eqzone">` between
  the header and the canvas (prototype puts `eqZone` above the diagram; keep that order) and passes
  it into `ViBackupDiagram.drawAnimated(...)` as a new parameter.
- `ViBackupDiagram.drawAnimated()` is rewritten from a rAF+`moveIndex` state machine into an
  **async function built on a ported `Timeline` class** (see Phase 0), matching `vi-engine.js`'s
  own `Timeline`/`_conceptB` structure almost verbatim, adapted to: (a) call `this._renderFrame(...)`
  (the existing canvas render path, extended per Phase 2) instead of `diagram.render(vis)`, and
  (b) own creation/mutation of tokens inside the passed-in `eqZoneEl` instead of `vi-engine.js`'s
  module-level `tok()`/`sub()`/`writeIn()`/`countUp()`/`hl()` helpers, which get ported alongside it.
- The **outer contract stays identical**: `drawAnimated()` still returns `{cancel, pause, resume}`,
  and `ViStatesView`'s existing `_activeReveal`/`pauseActiveReveal()`/`resumeActiveReveal()`/
  `clearStepMode()`/`hasActiveReveal()`/step-mode plumbing needs **no changes** — only what happens
  *inside* `drawAnimated()` changes. This is the thing that makes this a tractable rewrite instead
  of a full re-architecture: `viStatesView.js`'s 1000+ lines of reveal-sequencing/pause/scroll/flash
  bookkeeping survive almost untouched (see Phase 3 for the actual deltas it does need).
- The flying-chip mechanism stays where it is today (`ViStatesView._flyPriorValue()`, a
  `position:fixed` overlay + CSS `left`/`top` transition) — `ViBackupDiagram` calls
  `onFlyValue({...})` exactly as it does now; only the *content* of what flies changes (ghost-tree
  SVG replica instead of plain text — Phase 2) and a few new fly call sites are added for the
  reward/probability/π/Q flights the current code doesn't have at all yet (those currently animate
  in-place inside the canvas via `_workspaceText`, since there was no DOM destination to fly to).

---

## Phase 0 — Shared Timeline helper + palette color audit

**Files:**
- Create: `src/main/view/helpers/RevealTimeline.js`
- Modify: `index.html` (one new `<script>` tag, in the `helpers/` block, before
  `viBackupDiagram.js`)

**Interfaces:**
- `class RevealTimeline` — ported from `vi-engine.js`'s `Timeline` (lines ~460-488) verbatim in
  behavior: `constructor(getSpeedScale)`, `cancel()`, `pause()`, `resume()`, `async wait(ms)`,
  `async tween(ms, onTick)`. `getSpeedScale` is a **live** callback (same "re-read every frame, not
  snapshotted" convention `viBackupDiagram.js`'s current `drawAnimated()` already uses) so a
  mid-reveal animation-speed slider change takes effect immediately, matching the existing app
  convention (do NOT regress this — it's a real, tested behavior today).
- Also port `easeInOut` (already exists as `EasingUtils.easeInOut` — reuse it, don't duplicate).

- [ ] **Step 1: Port `Timeline` → `RevealTimeline`**
  - Same `cancel()`/`pause()`/`resume()`/`wait()`/`tween()` semantics as `vi-engine.js`'s
    `Timeline` class. `wait()` polls via `requestAnimationFrame` (mirror the prototype's
    `nextFrame()` helper — `requestAnimationFrame` raced against a 50ms `setTimeout` fallback, for
    tabs where rAF throttles when unfocused) rather than a plain `setTimeout`, so `pause()`
    mid-`wait()` genuinely freezes (matches `viBackupDiagram.js`'s current pause semantics, which
    must not regress).
  - Unlike the prototype (single global `Timeline` per reveal), this must support **N concurrent
    instances** cleanly (each card's own reveal) — the prototype only ever animates one card at a
    time (`liveQueue`/`currentTl`), which `viStatesView.js` also enforces today (`_activeReveal` is
    a singleton) — so this is already satisfied by the existing call pattern; just don't add any
    module-level mutable state to `RevealTimeline` itself.

**Palette color audit — confirms Decision 1 requires near-zero new tokens:**

| Handoff dark hex | `AppPalette.accent.*` (dark) | Exact match? |
|---|---|---|
| cyan π `#58C4DD` | `accent.cyan` = `#58C4DD` | ✅ |
| teal term/V `#5CD0B3` | `accent.teal` = `#5CD0B3` | ✅ |
| orange action/highlight `#F0AC5F` | `accent.orange` = `#F0AC5F` | ✅ |
| yellow live/current `#F5D76E` | `accent.yellow` = `#F5D76E` | ✅ |
| edge gray `#6b6b74` | `accent.edgeGray` = `#6b6b74` | ✅ |
| value-green `#4CAF50` | — (no exact key; `accent.green` = `#83C167`, a *different* green used for reward/success) | ⚠️ see below |

- [ ] **Step 2: Fix the one real inconsistency — the hardcoded triangle/ghost-tree color.**
  `viBackupDiagram.js`'s `VBD_TRIANGLE_COLOR = '#4CAF50'` (line 47) and
  `style.css`'s `.vi-states-view-fly-value { color: #4CAF50; }` (line 3285) are **already**
  hardcoded, theme-independent hexes — a pre-existing violation of `CLAUDE.md`'s "never hardcode a
  hex value at a call site" rule, not something this redesign introduces. Per Decision 1 (reuse
  existing tokens) and the handoff §3's own rule ("value-green/red/gray-zero, colored by sign"),
  replace both call sites with **sign-based** coloring through existing tokens:
  `AppPalette.accent.green` (positive), `AppPalette.accent.red` (negative),
  `AppPalette.text.muted` (zero) — i.e. the *same* sign→color mapping the ghost-subtree marker
  itself needs (Phase 2), applied consistently instead of one fixed hex everywhere. Remove
  `VBD_TRIANGLE_COLOR` as a module constant; remove the hardcoded `color: #4CAF50` from
  `.vi-states-view-fly-value` (style per-flight via inline style, same as `.vi-states-view-fly-value`
  already does for `left`/`top`).
  - No other new `AppPalette` keys are needed for this redesign — every other color the handoff
    calls for already exists under `accent.*`.

---

## Phase 1 — Domain: `pi` per action in `backupDetails`

**Files:** `src/main/domain/valueIterationState.js`

**Current gap:** `computeNextSweep()` (lines 110-211) already computes the Bellman **expectation**
backup correctly (`runMode === 'expectation'`, the default and only mode reachable via the normal
UI) and already resolves `actionProbs` via `simulationState.actionProbsForState(...)` — but it
never stores each action's resolved `π(a|s)` into `actionDetails`. The handoff's target shape
(`HANDOFF.md` §1) is `actions: [{actionId, actionName, pi, qValue, transitions: [...]}]` — `pi` is
required by the new expectation-combine choreography (Phase 2) and the Explain narrator (Phase 5)
to label π on state→action edges and in the narrator's "5 · average over actions" beat.

- [ ] **Step 1: Compute `actionProbs` before the per-action loop, not after.**
  Currently `actionProbs` is computed once, inside the `else` (expectation) branch, *after*
  `actionQs`/`actionDetails` are already built (lines 175-185). Move the
  `simulationState.actionProbsForState(stateId, stateNode.actions)` call up so it's available
  while building `actionDetails`, then set `pi: this.runMode === 'optimal' ? null :
  (actionProbs.get(Number(actionId)) ?? 0)` on each `actionDetails` push (mirrors the prototype's
  `pi` field exactly, `null` in `optimal` mode since there's no π there — see Phase 2's `optimal`
  handling note).
- [ ] **Step 2: Verify `Values → Iteration`'s existing consumers still see the same numbers.**
  `getEffectiveQValue`, `getValues`, `getBestAction`, `getBackupDetail`'s return shape gains one new
  field (`pi`) per action entry — purely additive, no existing consumer reads/breaks on it. Grep for
  every `.actions.forEach`/`.actions.map` over `getBackupDetail()` output
  (`viBackupDiagram.js`, `viChartView.js`, `viEquationView.js`, `chartDataBuilders.js`) to confirm
  none destructure the array positionally in a way a new key could disturb (all use property
  access — should be a no-op check, not a real risk, but confirm before moving on).
- [ ] **Step 3: Confirm §9's correctness check still holds.** Re-derive the ROB311NoIMG.json,
  γ=0.9, uniform π, sweep t=1 numbers from `HANDOFF.md` §9 by hand against `computeNextSweep()`'s
  actual formula (`Q = Σ P·(r + γ·V_prev)`, `V = Σ π·Q`) — this is pure sanity-checking of the
  handoff's own arithmetic against the *already-correct* implementation, not a code change. If they
  disagree, the bug is almost certainly in the walkthrough math, not the code (this backup was
  already shipped and is exercised by existing manual QA) — but confirm before treating the
  handoff's other numeric claims as gospel later.

---

## Phase 2 — `ViBackupDiagram` rewrite

**Files:** `src/main/view/helpers/viBackupDiagram.js` (major rewrite), reads
`src/main/view/helpers/RevealTimeline.js` (Phase 0)

This is the largest single file change. Break it into sub-tasks; each maps to one piece of the
handoff's §2/§3 spec and one piece of `vi-engine.js`'s `BackupDiagram`/`_conceptB`/`_transIntro`/
`_treeChipHTML`.

- [ ] **Step 1: Ghost-subtree value marker (§3), replacing `_drawPriorValueTriangle()`.**
  Port `vi-engine.js`'s `BackupDiagram._triangle()` (lines 416-452) verbatim, adapted to this
  file's plain-`ctx` drawing convention (it already is plain `ctx` in the prototype, so this is a
  near-literal port): up to 3 actions as 1px lines at `rgba(139,139,150,.5)` + 2px dots at the same
  alpha, up to 2 outcomes per action as 1px lines at `rgba(139,139,150,.22)` + 1.4px dots at the
  same alpha, terminal states (no actions) get a fading linear-gradient tail instead. Value text at
  the end, colored by sign via the Phase-0-fixed token mapping (`accent.green`/`accent.red`/
  `text.muted`). Needs the diagram's own `graph`/`this.graph.byId` lookup for the outcome's own
  action list — `ViBackupDiagram` doesn't currently hold a graph reference; thread one through (a
  new param on `draw()`/`drawSkeleton()`/`drawAnimated()`, populated by `viStatesView.js` from
  `this.viewModel.graph`, matching how `images`/`colors`/`priorValues` are already threaded in as
  plain data rather than a live object reference).
  - Also port `_treeChipHTML()` (lines 1122-1136) as `ViBackupDiagram._treeChipSVG(stateId,
    value, graph)` — the small inline-SVG replica used as the flying chip's body. `ViStatesView.
    _flyPriorValue()` (currently builds a plain-text `.vi-states-view-fly-value` chip) needs to set
    `chip.innerHTML = ViBackupDiagram._treeChipSVG(...)` instead of `chip.textContent =
    value.toFixed(2)`.
- [ ] **Step 2: Edge flare + halo (§2 beat 3), state→action branch persistence (§2's own note).**
  - Port the halo effect exactly (`vi-engine.js` lines 320-327): under the specific
    action→outcome edge being consumed, an extra stroke pass at `rgba(240,172,95,.22)` (or the
    theme-appropriate `accent.orange` at 22% alpha via `ColorUtils.applyAlpha`), width
    `12 + 4×probability`, drawn *underneath* the normal edge stroke.
  - Fix the state→action edge highlight to stay solid for **the whole action's computation**, not
    just the sub-phases of whichever transition is currently active. Today
    `isActionEdgeHighlighted` (line 419) gates on `activeMove.key` falling inside the action's
    key range *and* `EDGE_HIGHLIGHT_PHASES.has(activeMove.phase)` — since that phase set excludes
    `highlight`/`flyIn`/`rewardReveal` etc., the edge currently blinks off between each
    transition's own sub-beats. Replace with a `vis.qActionId`-style flag (mirroring the
    prototype's own naming) set for the action's entire span of moves (from its first transition's
    first move through its own `actionDone` move), independent of per-transition phase — this is
    the literal fix for the handoff's "stays highlighted (2.5px, orange) for that action's entire
    computation."
- [ ] **Step 3: Reward "lane lights" ring before the fly (§2 beat 2).**
  Add a short ring-highlight sub-beat before the reward fly: stroke the label-lane backplate in
  the reward's own color (`_rewardColor()`, already exists) for ~280ms before the value flies —
  today the reward just fades in in place with no separate "lane lights up first" beat.
- [ ] **Step 4: Replace `_renderActiveTransition()`'s in-canvas arithmetic text with DOM-slot
  targeting.** This is the core of the architectural change described above. Delete
  `_workspaceText()` and the `travel`/`rewardReveal`/`add`/`probReveal`/`multiply` phases' text
  rendering (lines 616-671) — that arithmetic no longer happens on canvas. In their place,
  `drawAnimated()`'s new async body (built on `RevealTimeline`, replacing the `tick()`/`moveIndex`
  state machine) drives, **per transition**, in this order (mirroring `_conceptB`/`_transIntro`
  in `vi-engine.js` lines 1099-1120 and 1303-1399, adapted to this file's existing
  `onHighlightPrior`/`onFlyValue`/`onStepPause` callback contract which `ViStatesView` already
  consumes):
    1. `highlight` (350ms): flash the outcome's card in the prior sweep (`onHighlightPrior`,
       unchanged), render the ghost-subtree marker at rest.
    2. Build the DOM slot template in `eqZoneEl`'s `workLine` (`P(S,a,s′) · ( r + γ·Vₜ(s′) )` with
       dashed slot `<span>`s for `P(...)`, `r`, `Vₜ(s′)` — the probability slot is always the full
       function form `P(Bud, wait, Death)`, never bare `p`, per handoff §2's explicit callout).
    3. `fly value` (480ms): fly the ghost-tree SVG chip from the prior card to the diagram's
       triangle anchor (`onFlyValue`, now carrying `_treeChipSVG` content instead of plain text),
       landing/parking there permanently (`vis.landedTrees`-equivalent — the marker stays visible
       for the rest of this card, not hidden again). γ substitutes quietly (no fly — just a text
       swap in the slot) immediately after.
    4. `reward` (280ms ring + 420ms fly): ring the label lane (Step 3), fly the reward value from
       the label lane into the DOM `r` slot.
    5. `probability` (280ms flare + 420ms fly): flare the specific edge (Step 2's halo), fly the
       probability into the DOM `P(...)` slot.
    6. Collapse: inner parens → `p × sum` → teal term, entirely inside `workLine` (DOM text swaps,
       no canvas involvement) — port the `vi-engine.js` `_conceptB` collapse sequence (lines
       1370-1382) verbatim.
    7. Term flies from `workLine` up into `accLine` (the accumulating `Q(S,a) = … + …` line) —
       port lines 1383-1398 verbatim (a `fly()` from the term token's `getBoundingClientRect()` to
       the newly-appended `accLine` term token's rect).
    8. Once landed, the diagram's own **persistent** term display on the label lane (today's
       `hasArrived` branch, lines 523-532) stays exactly as-is — that's the canvas-side
       "scoreboard," unaffected by the DOM slot mechanics above.
  - `onFlyValue`'s signature needs to grow beyond its current single use (value-to-triangle) to
    cover reward/probability/π/Q flights too — either widen it to a generic
    `onFly({ kind, fromCanvasPoint, toDomEl, value, color, durationMs })` that `ViStatesView`
    dispatches on, or (simpler, less invasive) have `ViBackupDiagram` itself own the fly-chip
    creation now that it also owns `eqZoneEl` (it already has `canvas.getBoundingClientRect()`-style
    page-point math via the pattern `viStatesView.js`'s `_flyPriorValue()` uses) — **recommended**:
    give `ViBackupDiagram` its own small `_fly(fromPagePoint, toEl, text, durationMs, color, html)`
    helper (a near-literal port of `vi-engine.js`'s `FlyOverlay.fly()`, lines 528-543) using a
    **shared, lazily-created** `position:fixed` overlay div at module scope (mirroring
    `viStatesView.js`'s own `_ensureFlyOverlay()` convention, just owned here instead since this
    file now owns all the flights that originate/land within a card). This keeps `ViStatesView`'s
    existing `onHighlightPrior`/`onFlyValue` callbacks doing only what they already do (flash/fly
    the **value**, which is the one flight whose destination — the diagram's own triangle anchor —
    lives outside `eqZoneEl` and needs `ViStatesView`'s page-coordinate help via
    `priorValuePoint()`-equivalent lookups), while every *other* new flight (reward/probability/
    π/Q, all of which fly *within or into* this card's own DOM, no cross-card lookup needed) is
    self-contained inside `viBackupDiagram.js`.
- [ ] **Step 5: Q count-up + π-labeled expectation-combine.**
  - Q resolution becomes an actual count-up tween (`RevealTimeline.tween`, ~380-550ms — reuse the
    prototype's `countUp()` pattern, lines 522-525) instead of a discrete on/off text swap.
  - After all actions resolve, add the **expectation-combine phase** (entirely new — does not
    exist in the current file at all): symbolic `V_{t+1}(S) = π(a|S)·Q(S,a) + …` written into
    `accLine` (or a fresh line below it), then per action: π flies in from its state→action edge
    label (cyan, `accent.cyan`, shown **only** during this phase — draw it via `edgeText()`-style
    rotated-parallel label, Phase 2 Step 6) into the DOM combine line, then Q flies in from its
    parked chip. Final `V` counts up in yellow (`accent.yellow`); card then collapses to its pill
    (existing `_collapseCardToPill()` in `viStatesView.js`, unchanged trigger point).
  - **`runMode === 'optimal'` handling (not covered by the handoff/prototype at all — the
    prototype hardcodes uniform-π expectation, no optimality mode exists there):** this diagram
    quadrant (`known:full`) is reachable in `optimal` mode via the "Find Optimal π" flow
    (`findOptimalCard.js`), which the handoff's own scope doesn't address. Per `pi: null` in
    `optimal` mode (Phase 1), skip the π-fly/expectation-combine visuals entirely when
    `this.runMode === 'optimal'` (thread `runMode` through the same way `gamma` already is) and
    instead play a **simpler existing-style** "select the best action" beat: highlight/star
    `detail.bestActionId`'s node and Q value (this already works today via `bestRevealed`/`best`
    move — keep that path as the `optimal`-mode ending in place of the new combine phase). Do not
    silently drop or crash on `optimal` mode — verify this explicitly in the QA pass (Phase 6).
- [ ] **Step 6: Rotated-parallel edge labels for π.**
  Port `edgeText()` (`vi-engine.js` lines 42-51) as a small addition to this file (or, if broadly
  useful, to `helpers/GeometricHelper.js` — prefer keeping it local to this file first since
  nothing else needs it yet; promote later only if a second caller appears) — draws text rotated to
  match the edge's own angle, flipped 180° if that would render upside-down, offset perpendicular
  by a signed `perp` pixel amount. Used only for the π label in Step 5 (the current file already
  has an established row-label-lane convention for reward/term; π reuses the *edge* itself, not a
  lane, since it must sit on the state→action edge specifically, matching the handoff §2's own
  distinction between "row label lane" (reward/term) and "on the state→action edges" (π)).
- [ ] **Step 7: Keep `draw()`/`drawSkeleton()`/`_settledState()` working with the new state shape.**
  These three (unanimated: instant full-resolve, instant full-unresolved, and the shared
  "settled" state object) must still render a coherent frame without ever running the
  `RevealTimeline` — `draw()` needs to render the ghost-subtree markers, persistent terms, and
  (if `pi != null`) resting π labels all in their final state in one pass, no DOM `eqZoneEl`
  mutation needed (a settled card's `eqZoneEl` should just be cleared/hidden — confirm with
  Phase 3 whether the settled/pill state shows the DOM equation zone at all, since the collapsed
  pill CSS already hides the canvas; the equation zone should collapse the same way).

---

## Phase 3 — `ViStatesView` integration deltas

**Files:** `src/main/view/viStatesView.js`, `style.css`

Most of this file's ~1130 lines (pause/resume/step/scroll/flash/pill-collapse bookkeeping) need
**no changes** per the architectural choice in Phase 2 — the `drawAnimated()` contract is
preserved. The real deltas:

- [ ] **Step 1: Add the DOM equation zone to `_buildDiagramCard()`.**
  Insert `<div class="vi-backup-diagram-eqzone">` between the existing header and `<canvas>`
  (matches prototype ordering — `eqZone` above the diagram canvas). Pass it into
  `ViBackupDiagram.drawAnimated(...)`/`.draw(...)`/`.drawSkeleton(...)` as a new parameter
  alongside `canvas`. Add matching CSS (new rules, mirroring `.vi-equation-view-*`'s existing
  typography conventions — mono for numbers, `STIX Two Text` italic for symbols, matching
  `vi-engine.js`'s `MATH`/`MONO` font stacks which already exist as `AppPalette.typography.math`/
  `.mono`).
- [ ] **Step 2: `t = 0` init section as a compact pill row, not diagram cards (§6).**
  Today sweep 0 renders through the same `_buildCard()`/`_buildDiagramCard()` path as every other
  sweep, hitting `ViBackupDiagram._drawEmpty()` (since `backupDetails[id].actions = []` at init) —
  a full-size "no actions" diagram card per state. The handoff wants sweep 0 to be the flat pill
  row (`name  V = 0.00`) that later sweeps' fly-value animations source from. Special-case
  `sweepIndex === 0` in `_buildCard()` (known:full quadrant included) to always use
  `_buildFlatCard()`'s existing flat-pill rendering (already correct for the 3 non-diagram
  quadrants) instead of `_buildDiagramCard()`, regardless of quadrant. Confirm
  `ViStatesView._flyPriorValue()`/`_flashCard()`/`priorValuePoint()`-equivalent lookups (Phase 2
  Step 4) still find sweep-0 cards correctly via `_findCard()` — they use
  `.vi-states-view-card[data-state-id="…"]`, which both flat and diagram cards already set, so
  this should be a no-op for that lookup path, just confirm.
- [ ] **Step 3: Fix `job.canvas` references now that a job carries `eqZoneEl` too.**
  `_drawJobStatic()`, `_prepareLiveSection()`'s skeleton draw, `_cancelActiveReveal()`'s snap-to-
  resolved, and `_cancelCurrentCardOnly()` all call `ViBackupDiagram.draw()`/`drawSkeleton()` with
  a fixed positional-arg list — thread the new `eqZoneEl` through every one of these call sites
  (grep `ViBackupDiagram\.(draw|drawSkeleton|drawAnimated)` in this file — 4 call sites today).
- [ ] **Step 4: `redrawStaticCards()` / theme rebuild.**
  `AppPalette` color changes are picked up by `rebuildAll()` today by fully re-rendering every
  diagram canvas from scratch. The new DOM equation zone's colors are plain CSS (`var(--accent-*)`
  or inline styles set from `AppPalette` at token-creation time, matching this file's existing
  convention of resolving `AppPalette.*` once at card-build time, not living CSS custom properties)
  — confirm a theme toggle mid-reveal doesn't leave stale-colored DOM tokens behind; if it does,
  `rebuildAll()`'s existing full-teardown-and-rebuild already covers this for anything not
  currently mid-animation (matches the existing caveat for diagram canvases).

---

## Phase 4 — `ViChartView` Q-table + convergence chart redesign

**Files:** `src/main/view/viChartView.js`, `src/main/view/helpers/chartDataBuilders.js`

Current `viChartView.js` shows only the **latest** sweep's Q-table (`ChartDataBuilders.
buildQTableData()`, hardcoded to `totalSweeps - 1`) and a Convergence chart built from
`buildConvergenceData()` (already close to what's needed for the line chart, minus the
growing-fraction-of-a-segment progress mechanic). The handoff §4 wants a genuinely different table
(per-sweep columns) and a different chart (fractional-progress line, dashed `V*` asymptote already
present via `vStar`).

- [ ] **Step 1: New builder — `ChartDataBuilders.buildQTableColumns(valueIterationState)`.**
  Returns `{ columns: [0..k], rows: [{stateId, stateName, actions: [{actionId, actionName}]}],
  cellsByColumn: { [t]: { [stateId]: { [actionId]: {qValue, isBest} } } } }` — one entry per sweep
  0..`currentSweepIndex`, `t=0` all-zero, greedy action per column starred+teal (reuse
  `getBestAction`/`getEffectiveQValue`, unchanged). Pure function, no DOM — matches this file's
  existing convention exactly.
- [ ] **Step 2: Rewrite `ViChartView._renderQTable()`.**
  Header row `t = 0, t = 1, …` (lowercase per handoff, current column headers may already be `t =`
  — confirm casing), current/last column yellow. Only the last two expanded; older collapse behind
  a clickable `⋯ n` header cell (`◂` to re-collapse when expanded) — port
  `vi-engine.js`'s `ChartPanel._renderTable()` collapse logic (lines 596-627) directly, it's
  already DOM-table-shaped like this file's own table, not canvas. Older (non-current) columns at
  55% opacity (`t=0` also dimmed once `k>0`, matching the prototype's own special-case).
- [ ] **Step 3: One-shot row fill + source highlight choreography.**
  Needs a new hook: as each state's left-pane card *finishes* its reveal (today,
  `ViStatesView._revealOneCard()`'s `finish()` calls `this.onRevealProgress()` — a generic
  "something changed" signal with no state-id payload), `ViChartView` needs to know **which**
  state just finished so it can fill that one row in one shot (no count-up) and outline it yellow,
  plus outline the `t−1` cells of its successor states green for ~1s (port
  `ChartPanel.highlightFill()`, lines 686-702, verbatim — it's already DOM-only). Extend
  `ViStatesView`'s constructor `onRevealProgress` callback to optionally pass `{stateId, detail}`
  on a card-finish (not on a mid-reveal step-pause), and wire a new `viPresenter.js` hook
  (`setChartView` already exists — reuse it) so `main.js` connects
  `viStatesView.onCardFinished = (stateId, detail) => viChartView.highlightFill(stateId, detail)`
  the same way `onActiveStateChanged` is already wired for the Equation/Backward panes today.
- [ ] **Step 4: `V̂(S₀)` line chart — growing-fraction-of-a-segment progress.**
  Current `_renderConvergence()` draws the whole VI history line at once (Chart.js, no partial-
  segment progress) plus MC overlay + policy-log curves — **keep all of that** (MC/policy-log
  overlay is a real, separate feature `PolicyChartOverlay.js` owns, unrelated to this redesign; do
  not regress it). Add: a `progress` state (`k − 1 + doneCount/stateCount`, mirroring
  `ChartPanel._renderChart()`'s `p`/`full`/`frac` logic, lines 710-778) that clips the **VI-history
  dataset only** to a partial final segment as each state's card finishes (reuse the Step 3 hook).
  Chart.js doesn't natively support "grow a line's last segment fractionally" the way raw Canvas2D
  does — implement by recomputing the `viValues` dataset's data array each tick to end at an
  interpolated point (`ys[full] + (ys[full+1]-ys[full])*frac`) instead of the full history, i.e.
  `data: viValues.slice(0, full+1).map(...).concat([{x: full+frac, y: interpolatedY}])`, redrawn
  (`this._convergenceChartInstance` destroy+recreate or `.update()`) on each Step-3 tick. Confirm
  this doesn't visibly fight the existing `animation: false` Chart.js option (it shouldn't — we're
  driving the data array ourselves, not asking Chart.js to animate).
- [ ] **Step 5: Confirm scope — applies to all 3 split quadrants, not just `known:full`.**
  Per `viChartView.js`'s own existing header comment, this chart already serves Belief Iteration
  and PO Q-Learning too (unlike the diagram cards, which are `known:full`-only). The Step 3
  "one-shot fill" hook needs a sensible no-op/full-fill fallback for the 2 non-diagram quadrants,
  since their left-pane cards are flat (no staged per-state reveal to key off of) — confirm
  `onCardFinished` still fires per-state for flat cards today (check `_revealOneCard()`'s
  job-less/flat-card branch, which calls `finish()` synchronously — should already produce one
  event per state, just all in near-immediate succession rather than staggered).

---

## Phase 5 — Explain view (right-pane narrator)

**Files:** `src/main/view/viEquationView.js` (major rewrite — becomes the narrator), `main.js`,
`viRightViewPill.js`, `style.css`

Per Decision 2: replace the diagram+reveal content, keep the scoped Q-table, leave Backward alone.

- [ ] **Step 1: Strip the diagram/canvas reveal engine out of `viEquationView.js`.**
  Remove `_startReveal`/`_cancelReveal`/`_computePhase`/`_renderFrame`/`_circle`/`_label`/the
  `<canvas>` element and its own independent 4-phase timing constants (`VEV_PHASE_*`) — this
  view's own bespoke Bellman-diagram animation is fully superseded by the left pane's now much
  richer per-card reveal (Phase 2); duplicating a second, simpler animation next to it was the old
  design's tradeoff, not the new one's.
- [ ] **Step 2: New narrator markup + `setBeat(beat, info)`.**
  Port `vi-app.js`'s `EquationView` class (lines 8-64) near-verbatim: a step label (mono,
  uppercase, min-height so layout doesn't jump), one large sentence (24px sans, `text-wrap:
  balance`), a formula footnote (mono). Exact copy per beat (`value`/`reward`/`probability`/`q`/
  `pi`/`v`, plus an idle state) — reuse the prototype's literal English copy and color-coding
  (`em()` inline-colored spans), substituting `AppPalette.accent.*` for the prototype's raw hexes.
  `_idle()` state: "Press Run or Step to walk through one Bellman backup at a time." (or this
  repo's existing idle-state copy/placeholder convention — check `_renderPlaceholder()`'s current
  "Click a state's card to see its calculation." copy and decide which idle message is more
  correct now that the narrator, not just the Q-table, is idle — likely keep a variant of the
  existing copy since clicking a card is still the entry point here, unlike the prototype where
  Run/Step alone drives it).
  - **Add `runMode === 'optimal'` copy** (not in the prototype at all, since it never runs
    optimality — see Phase 2 Step 5's note): a simple "picks the best action" narration for the
    `select_best`-equivalent beat instead of the π/combine copy, when `pi == null` on the active
    action.
- [ ] **Step 3: Wire the beat feed.**
  The narrator's `onBeat` calls need to come from the **same** reveal that's animating the active
  left-pane card — not a second, independent animation. `ViBackupDiagram.drawAnimated()` (Phase 2)
  needs an `onBeat(beat, info)` callback parameter (mirroring `vi-engine.js`'s own `onBeat` calls
  scattered through `_transIntro`/`_conceptB`, e.g. `{s, a, sp, v}` for the `value` beat,
  `{s, a, sp, r}` for `reward`, etc. — port the exact `info` shapes from `_conceptB`'s call sites,
  lines 1359/1364/1405/1419 and `_transIntro`'s line 1114). Thread it through
  `ViStatesView._revealOneCard()`'s existing `beginAnimation()` call into `drawAnimated(...)`,
  **but only fire the narrator for whichever card is `ValueIterationViewModel.activeStateId`** —
  the left pane can have many cards revealing in principle (though today it's always sequential/one
  at a time per `_activeReveal`), so gate `onBeat` calls in `main.js`'s wiring: only forward to
  `viEquationView.setBeat(...)` when the revealing card's `stateId === viViewModel.activeStateId`
  (falls back to idle otherwise) — matches the existing `activeStateId`-gates-the-right-pane
  convention `viEquationView.refresh()` already uses today.
- [ ] **Step 4: Keep the Q-table (`_renderQTable`/`buildQTableRowForState`) exactly as-is** — no
  changes needed, it already scopes correctly to the active state + previewed sweep.
- [ ] **Step 5: Rename the pill option? No — keep the internal key `'equation'`, relabel only the
  button text.** Changing `ValueIterationViewModel.rightView`'s string value from `'equation'` to
  `'explain'` would touch `main.js`, `mainView.js`'s draw dispatch, `viRightViewPill.js`'s options
  array, and anywhere `rightView === 'equation'` is checked — purely cosmetic churn for a value
  that's never user-visible (only the button label is). In `viRightViewPill.js`
  (`VI_RIGHT_VIEW_PILL_OPTIONS`), change only `{ key: 'equation', label: 'Equation' }` →
  `{ key: 'equation', label: 'Explain' }`. Leave every `'equation'` string key untouched throughout
  the codebase.

---

## Phase 6 — Wiring, cleanup, verification

**Files:** `index.html`, `main.js`, plus a full manual QA pass.

- [ ] **Step 1: `index.html` script order.** Add `RevealTimeline.js` to the `helpers/` block
  before `viBackupDiagram.js` (which now depends on it). No other new files this plan introduces
  (everything else is a rewrite of an existing file).
- [ ] **Step 2: `main.js` wiring deltas.**
  - Thread `graph`/`runMode`/`onBeat` into the `ViBackupDiagram.drawAnimated(...)` call inside
    `ViStatesView` (Phase 2/3's new params).
  - Wire `viStatesView.onCardFinished` → `viChartView.highlightFill(...)` (Phase 4 Step 3).
  - Gate `onBeat` → `viEquationView.setBeat(...)` on `activeStateId` match (Phase 5 Step 3).
  - Confirm `getVIRevealSpeedScale` (already computed at line 1649) is the single speed-scale
    source for: the card reveal (`RevealTimeline`), the chart's fractional-progress ticks, and the
    narrator (which has no independent timing of its own once Phase 5 Step 1 removes
    `VEV_PHASE_*` — it's purely reactive to beats, no separate clock needed).
- [ ] **Step 3: Full manual verification matrix** (`python3 -m http.server 8000`, both themes):
  - `known:full`, `runMode = 'expectation'` (default entry): Play, Step, Skip, Pause/Resume
    mid-reveal, Reset, at both 1× and a fast/slow speed-slider setting — confirm the ghost-subtree
    marker, edge flare/halo, DOM slot substitution, expectation-combine, and pill-collapse all play
    correctly and the animation-speed slider affects them live.
  - `known:full`, `runMode = 'optimal'` via "Find Optimal π": confirm the simplified best-action
    ending (Phase 2 Step 5) plays with no π/combine visuals and no crash, and the narrator (Phase 5
    Step 2's new copy) doesn't show stale π/combine language.
  - Sweep 0: confirm it renders as the flat pill row, and later sweeps' value-flights correctly
    source their `from` position from a sweep-0 pill card.
  - Chart pane: multi-column Q-table with `⋯` collapse/expand, one-shot row fill + green source
    highlight, `V̂(S₀)` line's fractional-segment growth mid-sweep, `V*` dashed asymptote, existing
    MC-overlay/policy-log curves still present and unbroken.
  - Explain pane: narrator text updates in sync with the left pane's active card, Q-table still
    scoped correctly, idle state when nothing is active.
  - `known:partial` (Belief Iteration) / `unknown:partial` (PO Q-Learning): flat cards unaffected,
    Chart pane's one-shot-fill fallback (Phase 4 Step 5) doesn't error.
  - `unknown:full` (Learning Iteration): confirm zero visual/behavioral change — it has no States
    view at all, untouched by this entire plan.
  - Theme toggle mid-reveal and at rest: confirm `rebuildAll()`'s existing rebuild-on-toggle covers
    the new DOM equation zone's colors too (Phase 3 Step 4).
  - Resize the window / left-right split ratio: confirm the DOM equation zone reflows sanely
    inside a diagram card at both narrow and wide left-pane widths (mirrors existing
    `_sizeDiagramCanvas()` responsiveness).

---

## Explicit open questions carried forward (not blocking, but should be confirmed during
implementation rather than assumed silently)

1. **Optimal-mode narrator/combine copy** (Phases 2/5) is this plan's own invention, not in the
   handoff or prototype — reasonable default, but worth a quick gut-check against
   `findOptimalCard.js`'s existing UX once built, since that flow has its own established voice.
2. **DOM equation zone height/reflow** at the diagram card's existing fixed 310px canvas height
   (`VI_STATES_DIAGRAM_HEIGHT`) — the equation zone adds vertical space above it; confirm the card
   height budget (and the `t=310px` canvas CSS sync comment in `viStatesView.js`) doesn't need
   adjusting once real content is in the zone, since the prototype's own cards are unconstrained-
   height (`min-height` DOM), unlike rlviz's fixed-height canvas convention.
3. **`ViChartView`'s "current column yellow, older 55% opacity" vs `t=0`'s existing separate
   dimming rule** — confirm exact opacity/interaction once both are live side by side; the
   prototype's own rule (`if (t === 0) { ...; if (k > 0) td.style.opacity = '0.55'; }`) is a special
   case worth preserving exactly, not re-deriving.
