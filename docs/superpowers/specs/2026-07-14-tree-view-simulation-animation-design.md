# Tree View Simulation Animation — Design

## Problem

`TreeView` (`src/main/view/treeView.js`) is currently a purely static renderer: it draws the
full unrolled MDP tree and handles hover/expand-collapse, but has zero awareness of
`SimulationState`. The Run/Play button (`onPlay` in `src/main/app/main.js`) is wired to the same
`playInteractor` regardless of `buildCanvasView` — it has no branch for "we're in Tree view."

Today, clicking Run while in Tree view starts the normal `SimulationState`/`SimulationAnimator`
phase machine (`reveal` → `state_spinning_arrow`/`spinning_arrow` → `highlight` → `transition`)
exactly as Graph view does. `mainView.js`'s `draw()` correctly still calls `treeView.draw()`
instead of `drawNodes()/drawEdges()`, but immediately after that branch it unconditionally still
calls `drawSpinningArrow()`, `drawStateSpinningArrow()`, and `drawHighlightedEdgeTravelBall()`
(`mainView.js:220-227`). These read real graph node world-coordinates (via
`graph.getNodeById(id).x/.y`), which are meaningless in Tree view's synthetic `TreeLayout`
coordinate space — so today's bug is the Graph-view simulation overlay glyphs floating over the
tree at the wrong positions, instead of a tree-native animation.

## Goal

Give Tree view its own rendering of the *same* simulation (`SimulationState` stays the single
shared source of truth — no new domain/use-case logic) that:

1. Highlights the current node.
2. "Flashes" the available actions (or outcomes) being decided among.
3. Shows the existing spinning-arrow-with-flashing-probabilities decision animation.
4. Advances to the chosen action/outcome, and repeats.

This is a **view-layer-only** change: `SimulationState`, `SimulationAnimator`, and the Play/Step/
Reset interactors are unchanged. All new code lives in `treeView.js` (plus a small shared-helper
extraction from `mainView.js`, and one dispatch tweak in `mainView.js`/`main.js`).

## Non-goals

- No changes to trace generation, policy sampling, reward accounting, or any domain/use-case code.
- No changes to `TreeLayout`'s pathId scheme, thirds-columns-then-fixed-spacing layout, or the
  existing Browse-mode click-to-expand/hover-highlight behavior *while no simulation is active*.
- Monte Carlo / Values mode is untouched — this is Build/Policy's Tree view only.

## Architecture

Today `TreeView.draw()` always renders the full static tree. This adds a second mode:

```
draw() {
    if (simulationState.replayInitialized) {
        this._drawTraceReveal();   // NEW: progressive reveal, tree-positioned
    } else {
        this._drawStaticTree();    // EXISTING: full unrolled tree, unchanged
    }
}
```

`_drawTraceReveal()` mirrors Graph view's progressive-reveal convention (per user decision: full
static tree during Browse, progressive reveal during Play — not a dimmed-overlay-on-full-tree
approach) using the *same* `TreeLayout` structure Browse mode already builds, rather than a
separate bespoke layout. Reasoning: one layout/pathId data model, one set of draw/hit-test
helpers, and visual continuity between what the user was browsing and what starts animating.

### Trace → pathId mapping

A real state/action id is ambiguous in tree terms — it can occur at many tree positions. So
"node `state:7` is visited" doesn't say *which* pathId to reveal. `TreeView` computes a concrete
mapping once per draw (recomputed fresh each time, same "no cache" convention `_currentTree()`
already uses — MDP graphs here are small):

```
_traceStepToPathId(visited, graph) -> string[]   // pathId per index in simulationState.visited
```

Implementation walks `simulationState.visited` and the domain graph in lockstep: at each state,
`stateNode.actions.indexOf(nextVisitedActionId)` gives the child index `ai`, appending
`.a${ai}` to the running pathId; at each action, `actionNode.sas.findIndex(t => t.nextState ===
nextVisitedStateId)` gives outcome index `ti`, appending `.${ti}`. This works because
`TreeLayout.build()` already iterates `actions`/`sas` in this exact order when constructing
children — the same order the trace itself was generated against — so the two never desync by
construction, not by coincidence.

The resulting pathId array becomes the **auto-expanded-path set**: unioned with the user's
manual `viewModel.treeExpanded` and passed to `TreeLayout.build()`, so the tree grows exactly as
far as the live trace has gone, regardless of the normal depth cap. `TreeLayout.build()` itself
is unchanged — this is purely a different (larger) `expandedSet` argument.

### Visibility

Given the pathId array, visibility for `_drawTraceReveal()` becomes index-based, not id-based:
a tree node is visible if its pathId is one of the first `N` entries, where `N` derives from
`simulationState.currentIndex` and `.phase` (during `reveal`, one extra "fan" of sibling
pathIds — all of the current state's actions, or all of the current action's outcomes — becomes
temporarily visible alongside the committed path, exactly matching
`SimulationAnimator.animateTransition()`'s Phase 1 reveal-then-narrow behavior). This deliberately
does NOT reuse `simulationState.isNodeVisible(realId)` directly (that flag is per real-id, and
would incorrectly reveal every tree occurrence of a recurring state at once) — it's a parallel,
pathId-keyed visibility check derived from the same underlying trace data.

### Spinning arrow / travel ball

`mainView.js`'s `drawSpinningArrowGlyph(nodeSize)` (the shaft+head polygon) is already
self-contained and reusable as-is. `drawSpinningArrow()`/`drawStateSpinningArrow()`/
`SimulationRenderer.drawTravelBall()`, however, resolve node positions via
`graph.getNodeById(id).x/.y` — Graph view's real, pinned positions. Tree view needs the same
phase-driven angle/highlight/probability-label logic, but resolved against tree-local (pathId)
positions instead.

Rather than duplicating that logic, extract the position lookup as a small injected resolver:
- Move `drawSpinningArrowGlyph`/`_drawArrowPolygon` to a shared helper
  (`src/main/view/helpers/SpinningArrowGlyph.js`) — pure drawing, no position lookup, already
  parameterized by `nodeSize`, trivially shareable.
- Add tree-side equivalents in `treeView.js` (`_drawTreeSpinningArrow()` /
  `_drawTreeStateSpinningArrow()` / `_drawTreeTravelBall()`) that read the *same*
  `simulationState` fields (`spinningArrowEdges`, `getHighlightedEdgeByArrow()`, `phase`,
  `highlightedEdge`) but resolve `x`/`y`/angle from the current tree node's position (via the
  pathId mapping above) rather than `graph.getNodeById(...)`. These call the shared glyph helper
  for the actual drawing, so the visual (arrow shape, colors, probability label styling) is
  identical to Graph view's, just correctly positioned.
- `mainView.js`'s existing calls to `drawSpinningArrow()`/`drawStateSpinningArrow()`/
  `drawHighlightedEdgeTravelBall()` become gated on `buildCanvasView !== 'tree'` (today they're
  unconditional — this is the actual line that causes the current bug), and `treeView.js`'s new
  tree-side equivalents are called instead when `buildCanvasView === 'tree'`.

### Camera follow

Per user decision, the viewport auto-pans to keep the active node visible as the trace advances
(mirroring Graph view's own `'transition'` / `CAMERA_TRANSITION` phase), rather than requiring
manual panning. Implementation: when `_drawTraceReveal()` detects the current trace step's pathId
changed since the last draw, it computes that pathId's tree-local position and lerps
`viewModel.viewport.panX/panY` toward centering it, over the same `transition` phase window
`SimulationAnimator` already drives (`simulationState.phaseStartTime`/`phaseDuration` when
`phase === 'transition'`) — no new timing constants, reusing the existing phase clock.

### Interaction gating

Per user decision, Browse-mode interactions (badge click-to-expand/collapse, hover-highlight ring)
are disabled while `simulationState.replayInitialized` is true — `treeView.handleClick()` and
`.handleMouseMove()` both early-return in that state. Re-enabled the instant `replayInitialized`
goes false again (Reset, or leaving Build/Policy mode entirely, which already resets
`buildCanvasView` to `'graph'` via the existing `onLeave` lifecycle hook — no change needed there).

### Reset / mode-switch behavior

- **Reset**: `simulationState.replayInitialized` goes false (existing `ResetInteractor` behavior,
  unchanged) → `TreeView.draw()`'s branch naturally falls back to `_drawStaticTree()`, showing the
  full tree again. No new reset logic needed in Tree view itself.
- **Switching Graph ⇄ Tree pill mid-simulation**: since `_drawTraceReveal()` is fully derived
  (stateless) from `simulationState` + `TreeLayout` on every draw — no independent trace/position
  state cached on `TreeView` across frames other than the pan-follow lerp — switching to Tree view
  mid-run immediately renders the reveal-so-far correctly; switching back to Graph view works
  exactly as it does today (untouched code path).
- **Policy mode**: gets this for free — Tree view/pill are already shared identically between
  Build and Policy (`_isEditableMode()`), and Policy's simulation is the same `SimulationState`.

## Summary of touched files

- `src/main/view/treeView.js`: add `_drawTraceReveal()`, `_traceStepToPathId()`, tree-side
  spinning-arrow/travel-ball drawing, pan-follow, and interaction gating.
- `src/main/view/mainView.js`: gate the three existing overlay draw calls on
  `buildCanvasView !== 'tree'`; call the new tree-side equivalents otherwise.
- `src/main/view/helpers/SpinningArrowGlyph.js` (new): extracted, shared glyph-drawing helper.
- `index.html`: one new `<script>` tag for the extracted helper.

No domain, use-case, or `CanvasController` changes.
