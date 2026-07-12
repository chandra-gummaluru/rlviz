# Build/Policy "Graph | Tree" Pill — v2 Design (Initial Layout, +-Expand, Reward/Probability Edges)

## Context

Follow-up to `docs/superpowers/specs/2026-07-11-build-tree-view-design.md` and the feature it shipped (branch `mdp-tree-view`, all 7 tasks + fixes merged). After using the shipped v1, feedback was: the default tree is too big/deep, expansion isn't discoverable, and edges rely on a text label instead of visual encoding. This doc describes the v2 changes; v1's Context/Non-Goals decisions (start node = existing s₀, no new gesture, solid ring unchanged, no auto-default, Build+Policy not Build-only) are unchanged and still apply — only the items below change.

## What's Changing

### 1. Default depth: 4 → 1

`TreeView._currentTree()`'s call to `TreeLayout.build(graph, startNode.id, treeExpanded, 4)` becomes `TreeLayout.build(graph, startNode.id, treeExpanded, 1)`. On first switch to Tree view (or immediately after re-rooting, since `treeExpanded` is already cleared on `setStartNode`), you see exactly 3 columns: **s₀ → its actions → the resulting s'** — nothing deeper until you explicitly expand.

### 2. Initial layout: thirds partition (first 3 columns only)

Today, `TreeLayout._assignPositions` gives every column (state, action, state, action, ...) the same fixed `LEVEL_SPACING` (110px) regardless of depth. In v2:

- **Columns 0, 1, 2** (root state, its actions, the resulting states — exactly what a `defaultDepth=1` tree shows before any expansion) are positioned so each occupies one third of the available canvas width, node centered in its third. "Available canvas width" = `windowWidth - RIGHT_PANEL_WIDTH` (the same "usable width" convention `mainView.js` already computes for Values mode, e.g. `mainView.js:177`'s `usableW` — NOT the raw canvas `width`, which extends underneath the right panel).
- **Columns 3+** (only reachable by manually expanding an s' node beyond the default view) keep today's fixed-`LEVEL_SPACING` behavior, continuing rightward from column 2's position — expansion does not re-partition the whole canvas; per the product decision, "whatever view you leave it as, it leaves it as that" (only re-rooting resets back to the fresh 3-column thirds view, via the existing `treeExpanded.clear()` on `setStartNode`).
- Vertical (slot) positioning is unchanged — same leaves-first-then-average-up algorithm, same `SLOT_SPACING`.

This requires `TreeView.draw()`/`_currentTree()` to know the usable width. Precedent already exists for this exact pattern: `ExpectationView.draw(usableW, usableH)` (Values mode) already receives canvas dimensions as parameters from `mainView.js`'s dispatch rather than computing them itself. `TreeView.draw()` adopts the same signature: `draw(usableW)` (height isn't needed for the thirds computation), with `mainView.js`'s dispatch branch passing `windowWidth - this.RIGHT_PANEL_WIDTH`. `drawChrome()` is unaffected (it doesn't need the width — the footer caption is left-anchored, the empty-state prompt already centers on `width/height`).

### 3. Expand affordance: "+" glyph, not dashed outline

Today, `TreeLayout.isCollapsed` nodes get a dashed outline (added in the v1 final-review fix pass) and clicking anywhere on the node toggles expansion. v2 replaces the dashed-outline cue with a small clickable **"+" badge** — a filled circle (~8px radius) with a "+" glyph, drawn at the node's bottom-right corner (offset by roughly the node's own radius/half-size, so it reads as "attached to" the node without overlapping its label). The underlying mechanism is **unchanged**: same `treeExpanded`/pathId toggle, same real-graph-structure-only reveal (no new nodes are ever created — "add new branches" means "reveal already-existing but currently-hidden branches of the real MDP", not authoring new hypothetical structure). `handleClick`'s hit-test target becomes the badge's small circle instead of the whole node body, so clicking the node body itself (away from the badge) no longer toggles expansion — only the badge does. `hasChildren === false` (true terminal) nodes get no badge at all.

### 4. Outcome edges: reward color + probability width, no default label

Today, every outcome edge (action → next state) always shows a mono `p 0.70 · +5` text label. v2:

- **Removes** the always-visible label entirely for outcome edges.
- **Color**: `AppPalette.reward.positive` (reward ≥ 0) or `.negative` (reward < 0) — replacing the current muted `AppPalette.edge.default`.
- **Width**: `1 + 3 * probability` px, the exact formula this app's Policy mode already uses for its own weighted-policy edges (`EdgeViewModel.policyEdgeProbability` → edge stroke weight, per `CLAUDE.md`'s documented convention) — reused verbatim for consistency, not reinvented.
- **Hover**: hovering an outcome edge shows a tooltip-style label with the precise conditional-probability notation: `P(s' | s, a) = 0.70`, substituting real display names, e.g. `P(S2 | S0, A1) = 0.70` — matching the Bellman-equation notation convention already used in Value Iteration's own on-canvas labels (`V^k(s) = max_a Σ P(s'|s,a)[R + γV(s')]`), rather than the literal `P(s', a, s)` argument order, for mathematical correctness and app-wide notational consistency. The label disappears when the mouse moves off the edge.

State→action edges (structural, no probability/reward) are **unchanged** — plain muted gray, no label, no hover behavior.

This requires a new hit-testing capability: `TreeView` currently only hit-tests nodes (circles/boxes). Hover must now also detect proximity to an edge (a line segment between two node centers) to know when to show the `P(s'|s,a)` tooltip. This is additive to the existing node-hover (repeated-state ring + badge, v1's Task 6) — hovering a node still does that; hovering an edge does this; the two are mutually exclusive per mouse-move (whichever the cursor is actually over).

## Non-Goals (v2-specific, in addition to v1's existing Non-Goals list)

- No change to state→action edges' appearance.
- No re-partitioning of the canvas on expansion beyond the initial 3 columns — only re-rooting resets to the fresh thirds layout.
- No new node-creation capability — the "+" glyph only reveals existing graph structure, exactly like today's click-to-expand.
- No change to the v1 Task 6 node-hover behavior (repeated-state ring + count badge) — this is genuinely additive (edge-hover is a new, separate interaction), not a replacement.

## Verification

No automated test suite in this repo — verify via `python3 -m http.server` + manual/headless-browser interaction, in both light and dark theme:

1. Build a graph with a state that has 2+ actions, each with 2+ probabilistic outcomes (mixed positive/negative rewards), and at least one of those outcome states itself having further actions (to test expansion beyond the default view). Set s₀.
2. Switch to Tree view: confirm exactly 3 columns render (s₀, its actions, the resulting states), each column visually centered within its third of the usable canvas width (not the v1 fixed-pixel spacing).
3. Confirm outcome edges show no text label by default, are colored by reward sign, and vary in stroke width proportional to their probability (a 0.9-probability edge visibly thicker than a 0.1-probability edge).
4. Hover an outcome edge: confirm a `P(s' | s, a) = 0.XX` tooltip appears with correct real node names and probability; move off, confirm it disappears.
5. Confirm a "+" badge appears at the bottom-right of any node with real hidden children; clicking the badge expands it (reveals a 4th column at fixed spacing, not re-partitioned thirds); clicking the badge again collapses it. Confirm clicking the node body itself (away from the badge) does NOT toggle expansion.
6. Confirm terminal nodes (no real children) show no badge.
7. Right-click a different state in Graph view to re-root, switch to Tree: confirm it resets to the fresh 3-column thirds view (not still showing whatever expansion state existed before).
8. Confirm v1's node-hover (repeated-state ring + count badge) still works correctly and independently from the new edge-hover tooltip.
9. Resize the browser window (changing `windowWidth`) and/or resize the right panel: confirm the 3-column thirds layout adapts to the new usable width on the next tree redraw.
10. No console errors throughout; both themes.
