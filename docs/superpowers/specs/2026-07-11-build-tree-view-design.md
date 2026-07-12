# Build/Policy Mode: "Graph | Tree" Pill — Design

## Context

Source design handoff: `~/Downloads/design_handoff_unified_workspace 5/README.md` ("RLViz — Tree Search View (Build mode)"), a focused single-feature spec distinct from the earlier "Unified Workspace 5a" handoff this branch's other work implemented. It answers "what does my MDP look like as a decision tree?" by unrolling the built graph into a search tree rooted at the start state — the same structure Monte Carlo rollouts and Q-learning traverse, but read/expanded by hand rather than sampled.

This branch (`mdp-tree-view`) was created off `unified-workspace-5a`'s current state specifically to hold this feature.

Two decisions were made explicitly during brainstorming, both deviating from the source handoff's literal text — recorded here so the deviation is traceable, not silently rediscovered later:

1. **"Initial state" = the existing start node (s₀), not a new concept.** The handoff describes a separate "initial state" marked by a dashed yellow ring, set by "clicking any state." The app already has a start-node (s₀) concept — set via right-click (`CanvasController.setStartNode`, `src/main/adapter/controller/CanvasController.js:679-681`, invoked from `MainView.mousePressed()`'s right-click branch, `src/main/view/mainView.js:972-984`) or the right panel's s₀ dropdown (`RightPanel.renderInitialStateSection()`, `src/main/view/rightPanel.js:184-234`) — shown today via a **solid** 3px amber outline (`AppPalette.node.startRing`, `src/main/view/mainView.js:398-408`), gated to `_isEditableMode()`. Left-click on a state is already fully committed (select, drag-arm, and conditionally edge-creation when a compatible node is already selected — `CanvasController._handleNodeClick`, `src/main/adapter/controller/CanvasController.js:768-808`), so repurposing it for "set root" would collide with existing behavior. **Decision: Tree view roots at the existing `startNode`; no new gesture, no new field.** "Clicking any state" in the handoff is satisfied by the existing right-click.
2. **Keep the existing solid amber ring; do not add the handoff's dashed-ring style.** No visual change to Graph view's start-node marker.
3. **No auto-default on first state creation.** The handoff says "first state created is the default [initial state]." Today nothing auto-sets s₀ on node creation, and this feature does not add that — s₀ stays unset until the user explicitly sets it (right-click or dropdown), matching current behavior. Tree view shows a prompt instead of a tree until s₀ is set.
4. **Pill (and Tree view) is available in both Build and Policy mode**, not Build-only as the handoff states. Policy's canvas is Build's canvas in every other respect (per `CLAUDE.md`'s Mode System section — "Policy: Same canvas as Build in every respect... every Build-only guard... checks `mode === 'build' || mode === 'policy'`"), and the existing floating tool palette already extends to Policy on that same basis. The new pill follows the same `_isEditableMode()` gate rather than a Build-only one.

## State Model

Presentation-only, added to `CanvasViewModel`/`InteractionViewModel` alongside the existing `mode`/`learningIterationCanvasView`-style flags. Never touches `Graph.serialize()`/`deserialize()` (`src/main/domain/graphObj.js`) — matches the existing exclusion of `startNode`, `manualOverrides`, `learningIterationCanvasView`, etc.

```
buildCanvasView: 'graph' | 'tree'   // default 'graph'
treeExpanded: Set<pathId>            // pathId = "s0.a0.1" style — a state can recur across
                                      // branches, so expansion state is keyed by tree position,
                                      // not state id
```

Reset (`treeExpanded` cleared, `buildCanvasView` left as whatever it was) whenever `startNode` changes — re-rooting invalidates prior expansion state, matching the handoff's "Tree view re-roots accordingly and resets expansion."

## Pill

New `src/main/view/treeViewPill.js`, modeled directly on `src/main/view/learningTreeTogglePill.js` (near-identical existing feature: same `[Graph | Tree]` two-segment structure, same DOM/CSS skeleton — container + label + track + two buttons with an `--active` class toggle, same `updateBounds(x, width)` right-edge-anchoring convention). Deliberately a **separate file**, not a shared/parameterized component with `learningTreeTogglePill.js`: different gating condition, different backing state, and the two pills can never be visible at the same time (one is Build/Policy-only, the other Values→Learning-Iteration-only), so sharing would add indirection without real benefit.

- Visibility gate: `_isEditableMode()` (`mode === 'build' || mode === 'policy'`), mirroring the tool palette's own gate.
- Wired into the mode-lifecycle hook table in `main.js` the same way `refreshLearningTreePill()` wires its pill — shown/hidden/refreshed on entering/leaving Build/Policy, not ad hoc.

## Rendering

New `src/main/view/treeView.js`, dispatched from `mainView.js`'s Build/Policy draw branch when `buildCanvasView === 'tree'` — a full-bleed swap over the canvas (same dot-grid background as Graph view), replacing only the canvas content. Tool palette and right panel are unaffected (tool palette specifically stays visible per the handoff, even though it has no effect on a read-only tree).

- **Layout**: left→right node-link tree, rooted at `startNode`. Each level = one hop (state → action → next state → ...).
- **States**: circles, same fill/stroke/color convention as Graph view's state nodes. The same underlying state can legitimately appear at multiple tree positions (no dedup) — this is the core teaching point per the handoff, so node identity in the tree is the **pathId**, not the state id.
- **Actions**: explicit rounded-square nodes between a state and its outcomes (matching Build's own action-node shape/size, and the same shape now used by Value Iteration's main graph after a recent fix — one consistent action-node vocabulary app-wide). Never collapsed into an edge label.
- **Outcome edges**: one edge per (action → next state), mono label `p 0.8 · +5` — probability in muted text, reward green (`AppPalette.reward.positive`) or red (`AppPalette.reward.negative`) by sign, reusing the existing reward-color convention from Build's own edge labels.
- **Terminal states** (no outgoing actions) end their branch with no special marker beyond the existing "state with no actions" look.
- **Depth cap**: 4 state levels rendered by default. Subtrees beyond the cap start collapsed.
- **Expand/collapse**: click a state or action node to toggle its pathId in `treeExpanded` (expanding reveals its children; re-click collapses). Applies to any node with children, not just the depth-cap boundary — lets a user selectively drill into one branch without expanding siblings.
- **Hover-highlight** (from the handoff's "optional, recommended" section — included in v1, not deferred, since the tree already indexes nodes by underlying state id for expand/collapse bookkeeping, so highlighting every copy of a hovered state is cheap): hovering a state in the tree highlights every tree position sharing that state id, plus the corresponding node back in Graph view, with a small count badge (e.g. "S₂ — 2×").
- **Zoom/pan**: reuses the existing viewport transform / zoom pill, same as Graph view — the tree scales like the graph.
- **Footer caption**: bottom-left, mono, muted — "the MDP unrolled from S₀ (initial state) · circles = states · squares = actions".
- **Theming**: all colors via existing `AppPalette` tokens / `var(--...)` CSS custom properties — no hardcoded hex, works in both themes by construction (same discipline as every other view in this codebase).

## Non-Goals

- Not available in Values mode. Learning Iteration's own Graph|Tree toggle (`learningTreeTogglePill.js`, `src/main/view/learningIterationView.js`) is a visually-consistent but entirely separate feature — an algorithm-driven, incrementally-sampled visit-tree (N=/Q= labels, UCB halos), not a deterministic unroll of the whole MDP. No code sharing beyond "looks like the same design language."
- No new gesture for setting the tree's root — reuses right-click / the s₀ dropdown exactly as they exist today (see Context, decision 1).
- No auto-default start node on first state creation (see Context, decision 3).
- No change to the existing solid start-node ring style (see Context, decision 2).

## Verification

No automated test suite in this repo (per `CLAUDE.md`) — verify via `python3 -m http.server` + manual/headless-browser interaction, in both light and dark theme:

1. Build a small graph with at least one cycle or a state reachable via two different paths (to exercise the "same state, multiple tree positions" case) and a terminal state. Set s₀ via right-click.
2. Confirm the Graph|Tree pill appears in Build mode, and in Policy mode, but not in Values mode.
3. Click Tree: confirm a left-to-right tree rooted at s₀, correct state/action shapes, correct `p · reward` edge labels, sign-colored rewards, depth-4 default cap with collapsed deeper subtrees.
4. Click a boundary/collapsed node: confirm it expands; click again: confirm it collapses. Confirm expansion state is independent per branch (expanding one doesn't expand siblings).
5. Hover a state that appears more than once in the tree: confirm all its copies highlight, plus the corresponding Graph-view node, with a count badge.
6. Switch back to Graph, right-click a different state to change s₀, switch to Tree: confirm it re-roots and expansion state has reset.
7. Zoom/pan in Tree view: confirms the same viewport controls work.
8. No console errors throughout; confirm colors render correctly in both themes.
