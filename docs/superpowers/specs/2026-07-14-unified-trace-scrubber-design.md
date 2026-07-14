# Unified Trace Scrubber + Steps Horizon — Design

## Context

Today, "how far along a trace/rollout you are" is shown three different, inconsistent ways:

- **Build/Policy mode**: a read-only "t" progress bar in the right panel's Parameters section (`RightPanel._renderTProgressBar()`), showing `SimulationState.getSimulationStats().stepCount` against a fixed nominal max of 20 — no user control over how long a trace can run (`TraceGenerator.generate()` is called with a hardcoded cap of 50 nodes, ≈25 transitions, from `SimulationAnimator.validateAndGenerateTrace()`).
- **Monte Carlo**: a floating, draggable timeline (`ExpectationScrubber`, full canvas width, bottom-anchored) showing plain numeric ticks (`t = 0..maxT`) with colored reward dots for a focused run, plus a separate "steps" slider in the right panel's Parameters section (`RightPanel._renderExpectationMaxStepsBar()`, range 1–100, default 100) controlling `expectationState.maxSteps`.
- **Value Iteration**: its own, conceptually different "sweeps toward convergence" stepping (a Bellman-backup iteration count, not a sampled state/action path) — a `T` input and `viSweepChip`. Untouched by this design.

This design replaces the first two with **one shared control**: a bottom-center scrubber + steps-horizon bar, used identically by Build, Policy, and Monte Carlo. VI keeps its own sweep UI exactly as it is.

## Component: `TraceScrubber`

New `src/main/view/traceScrubber.js`, replacing `src/main/view/expectationScrubber.js` (deleted). Mirrors `ExpectationScrubber`'s proven technical pattern — a floating DOM element (`document.body.appendChild`), `mount(x, y, w)` / `resize(x, y, w)` / `destroy()` lifecycle, pointer-capture dragging — but bottom-**center** rather than full-width, and with a materially different visual/interaction model:

```
< S0  a0  [S1]  a1  S2  a2  S3  a3  S4 ...  |  −  ⏱  steps=25  +  >
```

- **Tick row**: one tick per entry in the underlying trace (alternating state/action), each labeled with the real node's display name (`S0`, `a0`, `S1`, ...). The current position is highlighted (matches the mockup's gold-highlighted `S1`).
- **Left/right stepper arrows**: move exactly one tick at a time — including stopping on action ticks, not just states (confirmed: this lets you inspect an action node's own info at each stop, not only resulting states).
- **Dragging**: jumps instantly to any tick, no animation replay (see "Instant jump" below).
- **No reward-dot decoration** — removed entirely, including from Monte Carlo's existing focused-run behavior (a deliberate simplification, not carried over from `ExpectationScrubber`).
- **Horizon control** (`− ⏱ steps=N +`): sets the trace/rollout length cap. Replaces MC's existing `_renderExpectationMaxStepsBar()` right-panel slider and introduces the same capability for Build/Policy, which has never had a user-adjustable cap before.

### Tick source per consumer

- **Build/Policy**: `SimulationState.visited` (the real, already-generated trace) — always a single definite path, so ticks are always state/action-labeled.
- **Monte Carlo, single-run focus view**: the focused rollout's real trace — same labeled-tick treatment.
- **Monte Carlo, grid view** (multiple rollouts shown at once, no single focused run): there is no one canonical path to label ticks with, so ticks fall back to plain numeric labels (`t=0, 1, 2...`), exactly like today — only switching to state/action labels once a run is focused/pinned. This mirrors the existing precedent that reward-dot decoration (before its removal) was also focus-view-only, not a grid-view feature.

### Horizon semantics

The control shows/edits a `maxSteps` value in **transitions** (state→action→state = 1 transition), matching Monte Carlo's existing semantic (`expectationState.maxSteps`, already used as `maxSteps * 2 + 1` raw nodes when calling `TraceGenerator.generate()`). Changing the value does **not** retroactively regenerate an in-progress trace/rollout — it takes effect on the next Run, exactly matching Monte Carlo's existing behavior today (`state.maxSteps = steps` is a plain assignment with no immediate side effect).

Build/Policy gains a parallel `SimulationState.maxSteps` field (new), consumed by `SimulationAnimator.validateAndGenerateTrace()` in place of the hardcoded `50`:

```js
// before:
const visited = this.traceGenerator.generate(startNode, 50, ...);
// after:
const visited = this.traceGenerator.generate(startNode, this.simulationState.maxSteps * 2 + 1, ...);
```

Default: **25** (transitions) — chosen to reproduce today's existing effective trace-length behavior (the old hardcoded `50` nodes ≈ 25 transitions), rather than silently jumping to Monte Carlo's much larger default of 100. Same slider range as MC's existing control (1–100) for a consistent feel, per the explicit instruction that Build/Policy's steps concept should work "like Monte Carlo's."

## Instant jump (Build/Policy only)

Monte Carlo rollouts are precomputed data — its scrubber already supports jumping to any `t` instantly, no change needed there.

Build/Policy's simulation is a live, multi-phase **animated** state machine (`SimulationAnimator.animateTransition()` — reveal, decision pause, spinning arrow, camera pan, etc.), driven one hop at a time via `SimulationState.advance()`. There is no existing way to jump directly to an arbitrary trace index. This design adds one:

```js
// New method on SimulationState
jumpToIndex(targetIndex) {
    // Clamp to valid range, set currentIndex/currentNode directly (no phase animation),
    // recompute visibleNodeIds/visibleEdgeIds/totalReward/stepCount/rewardHistory from
    // scratch by walking `visited[0..targetIndex]` rather than replaying advance() calls -
    // reward accumulation must be recomputed, not incrementally replayed, since jumping
    // backward must also un-accumulate rewards past the new position.
}
```

`phase` is set to `'idle'` and `isPlaying` to `false` on jump, matching the existing "settled" state `advance()` leaves things in between animated steps.

## What's removed

- `src/main/view/expectationScrubber.js` (replaced by `traceScrubber.js`).
- `RightPanel._renderTProgressBar()` and its two call sites (`renderBuildPanel()`, `renderPolicyModePanel()`) — the new scrubber's tick highlight is the position indicator now.
- `RightPanel._renderExpectationMaxStepsBar()` and its call site — the new scrubber's horizon control replaces it.
- Reward-dot rendering (previously `ExpectationScrubber.setRolloutForRewardDots()` and the `scrubber2-reward-dot` styling) — dropped entirely per the "no reward dots, same for Monte Carlo" decision.

## Wiring

`TraceScrubber` is constructed once in `main.js` (mirroring every other floating pill/chip: `zoomPill`, `mcRunsPill`, `viSweepChip`) and shown/hidden via the existing mode-lifecycle hook table (`registerModeLifecycle`) — visible in `build`, `policy`, and Values→`mc`; hidden in Values→`vi` and whenever no trace/rollout exists yet (mirroring the existing "press Run to start" placeholder convention already used elsewhere, e.g. VI's own pre-run state). Positioned bottom-center over the canvas, width sized to its own content (not full-canvas-width like today's `ExpectationScrubber`), recentered on resize the same way other pills recompute their bounds via `updateBounds()`.

## Non-Goals

- Value Iteration's sweep stepping/UI is completely untouched.
- No change to Monte Carlo's mini-panel grid layout, the `mcRunsPill` runs-count selector, or the chart dock.
- No change to Build/Policy's Utility G display or contribution-bar (`_renderStepsAndUtility()` keeps rendering those — only the "t" progress bar sub-piece is removed from `renderBuildPanel()`/`renderPolicyModePanel()`).
- No retroactive trace regeneration when the horizon value changes mid-trace — takes effect on the next Run only, matching existing MC behavior.

## Verification

No automated test suite in this repo — verify via `python3 -m http.server` + manual/headless-browser interaction, both light and dark theme:

1. Build a small graph, set s₀, click Run in Build mode: confirm the new bottom-center scrubber appears with state/action-labeled ticks, current position highlighted, and a `steps=N` horizon control.
2. Drag the scrubber to an arbitrary tick: confirm the Tree/Graph view instantly reflects that position (no animation replay), Utility G and the contribution bar update to match, and stepping forward/backward from that new position with Play/Step continues correctly.
3. Click the left/right stepper arrows: confirm each click moves exactly one tick, including stopping on action ticks.
4. Adjust the horizon control, click Run again: confirm the new trace respects the new max-transitions cap. Confirm adjusting it mid-trace does NOT change the current trace's length.
5. Repeat in Policy mode: confirm identical behavior.
6. In Monte Carlo: confirm the old scrubber/Max-Steps-slider are gone, the new shared scrubber appears instead, grid view shows plain numeric ticks, and focusing/pinning a single run switches its ticks to state/action labels with no reward dots.
7. Confirm Value Iteration is completely unaffected — its own T input/sweep chip still work as before, no bottom scrubber appears there.
8. No console errors throughout; both themes.
