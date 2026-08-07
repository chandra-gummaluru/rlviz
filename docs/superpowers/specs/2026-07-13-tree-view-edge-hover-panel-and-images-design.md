# Tree View: Edge-Hover → Right Panel, State Images — Design

## Context

Follow-up to the `mdp-tree-view` branch's v1 and v2 rounds (`docs/superpowers/specs/2026-07-11-build-tree-view-design.md`, `docs/superpowers/specs/2026-07-12-build-tree-view-v2-design.md`), which built the Build/Policy "Graph | Tree" pill and its thirds-layout/badge/reward-edge refinements. This round is two small, independent changes to the same `treeView.js`:

1. Hovering an outcome edge (action → state) currently shows an on-canvas `P(s' | s, a) = 0.XX` tooltip (added in v2 Task 4). That moves into the right panel instead, reusing Build mode's real edge inspector verbatim rather than a second, separately-styled implementation.
2. Tree state nodes currently render as a plain color-filled circle with the state's name centered inside. They gain the same uploaded-image support Build mode's own state nodes already have (`mainView.js`'s `drawNodes()`), with the name moving to sit above the node when an image is shown — matching Build mode's own image/label convention exactly.

Action nodes stay on the canvas exactly as they are today — this round does not touch action-node rendering, only outcome-edge hover behavior and state-node image rendering.

## 1. Edge-hover → right panel

### Mechanism

`TreeView` already computes `hoveredEdge = {stateNode, actionNode, childStateNode}` in `handleMouseMove()` (v2 Task 4) whenever the cursor is over an outcome edge. Every tree node carries the real graph id it was unrolled from (`stateNode.stateId`, `actionNode.actionId`, `childStateNode.stateId`) — so the real `EdgeObj` connecting the action to the outcome state can be looked up directly:

```js
const realEdge = this.viewModel.graph.edges.find(e =>
    e.getFromNode().id === actionNode.actionId && e.getToNode().id === childStateNode.stateId);
```

That real `EdgeObj` is assigned to `viewModel.interaction.hoveredEdge` — the exact same field Graph view's own `CanvasController.handleMouseMove()` already writes to drive the right panel. `RightPanel.updateContent()` already prioritizes `hoveredEdge` (below `selectedNode`/`selectedEdge`, above the mode's default panel) and calls the existing `renderEdgePanel(edge)` — unmodified. This guarantees the tree's edge-hover panel is pixel-identical to Build mode's, by construction, not by re-implementing the layout.

When the tree hover moves off the edge (to empty space, a node, or nothing), `interaction.hoveredEdge` is set back to `null`.

The on-canvas `_drawEdgeHoverTooltip()` method and its call site are removed — replaced, not duplicated.

### Two correctness requirements this depends on

- **`mainView.js`'s tree branch of `mouseMoved()`** must call `rightPanel.updateContent()` whenever `treeView.handleMouseMove()` reports a change — mirroring the existing Graph-view branch a few lines below it (`if (hoverChanged && this.rightPanel) this.rightPanel.updateContent();`). Today the tree branch only calls `redraw()` (for the canvas); it needs the same panel-refresh call Graph view's branch already makes.
- **Stale Graph-view selection must not shadow the new hover.** `RightPanel.updateContent()`'s precedence is `selectedNode > selectedEdge > hoveredNode > hoveredEdge > mode default`. If the user had a node or edge selected in Graph view and then switches to Tree view without deselecting, that stale selection would outrank the new tree-edge-hover and the feature would silently never appear. `CanvasController.setBuildCanvasView('tree')` therefore also calls `this.viewModel.selection.clearSelection()` when switching *into* tree view — mirroring the existing precedent of `setStartNode()` clearing `treeExpanded` for the same category of reason (a view/root transition invalidating state that belonged to the old context). Switching *out* of tree view (`setBuildCanvasView('graph')`) does not need a symmetric clear — Graph view's own `handleMouseMove` will overwrite `hoveredNode`/`hoveredEdge` on the very next mouse move, and Graph view never reads `treeExpanded`-equivalent tree-only state.

Tree view's own separate node-hover behavior (the repeated-state ring + "S2 — 2×" count badge, v1 Task 6) is untouched — it does not write to `interaction.hoveredNode`, stays purely a canvas-drawn effect, and is not routed to the right panel. Only edge-hover changes.

### Non-goals

- Hovering a **state→action** edge (structural, no probability/reward) is unaffected — it was never hoverable in the tree (v2 Task 4 scoped hit-testing to outcome edges only) and stays that way.
- No change to click/selection behavior in Tree view — the "+/−" badge is still the only click target (v2 Task 3); this is a hover-only feature.
- No change to Graph view's own edge-hover behavior.

## 2. State images in Tree view

### Mechanism

`TreeView._drawNode(node)` looks up the real graph node for any `node.kind === 'state'` tree node (`this.viewModel.graph.getNodeById(node.stateId)`) and, if `.image` is set, draws it exactly the way `mainView.js`'s `drawNodes()` already draws Build-mode state images:

- Circular-clip via `drawingContext.arc(...)` + `.clip()`, radius `TREE_VIEW_STATE_RADIUS * 0.8` (mirrors Build's `node.size * 0.8`).
- Image drawn centered, sized `TREE_VIEW_STATE_RADIUS * 1.6` (mirrors Build's `node.size * 1.6`).
- Lazy-loaded and cached on the **real graph node** (`node._imageObj`, the same field/convention Build mode's `drawNodes()` already uses) — not on the ephemeral `TreeNode`. Multiple tree positions unrolled from the same state (a repeated state) share one cached `p5.Image`, and if the user already visited Build mode this session, Tree view reuses the image Build mode already decoded, for free.
- Name moves to sit above the node (fixed offset above the circle, e.g. `node.y - TREE_VIEW_STATE_RADIUS - 8` — the same vertical offset already used by `_drawHoverBadge`'s label), instead of centered inside it, when an image is present. Nodes without an image keep today's plain-circle-with-centered-name rendering unchanged.
- Action nodes are unaffected — only state nodes carry images in this app today.

### Interaction with the existing hover badge

`_drawHoverBadge` already draws a "S2 — 2×" label above the shallowest copy of a hovered repeated state, at the same `y - TREE_VIEW_STATE_RADIUS - 8` offset the new image-mode name label now also uses. If that specific node has an image (name already pushed above), the hover badge is pushed one further step up (e.g. an additional ~14px) so the two labels stack instead of overlapping. This only affects the rare combination of "hovering a repeated state that also has an uploaded image."

### Non-goals

- No change to action-node rendering (they never carried images).
- No change to Build mode's own image upload/removal UI (`RightPanel`'s Image section) — Tree view only *displays* whatever image is already set on the real node.
- No change to image caching/loading for Graph view — the cache field is shared by reuse, not duplicated logic.

## Verification

No automated test suite in this repo — verify via `python3 -m http.server` + manual/headless-browser interaction, both light and dark theme:

1. Build a graph with a state that has an uploaded image and at least one action with 2+ mixed-reward-sign outcomes. Set s₀, switch to Tree view.
2. Confirm the imaged state renders its image circle-clipped inside the node, with its name above the node instead of centered inside it. Confirm a state with no image still renders the plain circle + centered name.
3. Hover an outcome edge: confirm the right panel switches to the Connection + Transition view (matching Build mode's own edge panel exactly — same fields, same reward coloring), and confirm no on-canvas tooltip appears. Move off the edge: confirm the panel reverts to the mode's default (Utility G / Policy π).
4. In Graph view, select a node or edge (so `selection.selectedNode`/`selectedEdge` is set), then switch to Tree view: confirm the stale selection no longer shadows the panel, and hovering a tree edge correctly shows its info.
5. Hover a repeated state that also has an image: confirm the "S2 — 2×" badge and the image's name label don't overlap.
6. Confirm hovering a state node still shows the existing ring + badge behavior unchanged, and does not affect the right panel.
7. No console errors throughout; both themes.
