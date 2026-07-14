# Tree View Simulation Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Build/Policy Tree view its own tree-positioned rendering of the live simulation
(highlight current node → flash candidate actions/outcomes → spinning-arrow-with-flashing-
probabilities → travel to the chosen one → repeat), replacing today's bug where Graph view's
simulation overlays (spinning arrow, travel ball) draw at the wrong (real graph) coordinates on
top of the tree.

**Architecture:** All new code lives in the view layer — `src/main/view/treeView.js` gains a
second draw mode (`_drawTraceReveal()`) alongside its existing static full-tree renderer, reusing
`TreeLayout`'s existing pathId scheme (auto-expanded along the live trace) rather than a separate
layout. A small shared helper (`SpinningArrowGlyph`) is extracted from `mainView.js` so both Graph
and Tree view draw the identical arrow glyph. `SimulationState`/`SimulationAnimator`/interactors
are untouched — Tree view reads the same shared simulation state Graph view already does.

**Tech Stack:** Vanilla JS, p5.js canvas rendering, no build step, no test framework (per
`CLAUDE.md` — verification is manual/headless-browser, not unit tests).

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-07-14-tree-view-simulation-animation-design.md`
  — every task below implements one part of it; read it once before starting Task 1.
- No domain, use-case, or `CanvasController` changes. `onPlay`/`onStep`/`onSkip`/`onReset` in
  `src/main/app/main.js` are untouched — the Run/Step/Reset buttons already work correctly; only
  what gets *drawn* while `buildCanvasView === 'tree'` changes.
- No staggered pop-in/scale-in animation for newly-revealed tree nodes (Graph view has one via
  `MV_REVEAL_NODE_STAGGER`/`MV_REVEAL_NODE_DUR`) — Tree view's reveal is a plain appear/disappear.
  This is a deliberate scope cut (YAGNI): the user's request was "highlight → flash → spin →
  move," which a binary reveal already satisfies; staggered easing is Graph view polish, not a
  requirement here.
- Tree-native spinning-arrow probability labels must match Graph view's existing text **exactly**,
  including its pre-existing quirk that `drawStateSpinningArrow()` always shows uniform `1/n`
  labels rather than the (possibly weighted) `edge.probability` value actually stored on
  `spinningArrowEdges` — this plan mirrors Graph view byte-for-byte here, it does not fix that
  quirk (out of scope; not something the user asked for).
- All colors via existing `AppPalette` tokens (`AppPalette.node.activeInitial`,
  `AppPalette.simulation.travelBall`/`.spinLabelHighlight`/`.spinLabelBackground`, etc.) — no
  hardcoded hex at any new call site, matching this codebase's established rule.
- No automated test suite exists. Every task's verification step is a concrete manual/headless-
  browser check (`python3 -m http.server 8010` from the repo root + `playwright-core` if
  available), not a unit test. Check both light and dark theme where a task touches rendering.
- Work happens in the `unified-workspace-5a` worktree (branch `tree-view-scrubber`), which already
  has all prior Tree view work (v1, v2, edge-hover) merged in.

---

### Task 1: Extract `SpinningArrowGlyph` — shared arrow-glyph drawing helper

**Files:**
- Create: `src/main/view/helpers/SpinningArrowGlyph.js`
- Modify: `src/main/view/mainView.js` (remove `_drawArrowPolygon`/`drawSpinningArrowGlyph`, update
  their 2 call sites)
- Modify: `index.html` (add script tag)

**Interfaces:**
- Produces: `SpinningArrowGlyph.draw(nodeSize)` — a static method, pure drawing (no position
  setup), identical output to today's `MainView.drawSpinningArrowGlyph(nodeSize)`. Callers
  `push()`/`translate()`/`rotate()` to the node's center + arrow angle, call `SpinningArrowGlyph
  .draw(nodeSize)`, then `pop()`. Later tasks (Task 5) call this from `treeView.js`.

This is a pure refactor — no behavior change. Read `src/main/view/mainView.js`'s
`_drawArrowPolygon` (starts at the comment `// Draw a shaft+head arrow polygon...`) and
`drawSpinningArrowGlyph` methods in full before starting, to confirm your local copy matches the
code quoted below (this codebase evolves — if it doesn't match, use what's actually there instead
of the plan's quoted snapshot).

- [ ] **Step 1: Write `SpinningArrowGlyph.js`**

```js
// Shared shaft+head spinning-arrow glyph, used by both Graph view (mainView.js) and Tree view
// (treeView.js) for the simulation's action/outcome-decision animation. Pure drawing - no
// position/rotation setup; callers push()/translate()/rotate() to the node's center + arrow
// angle before calling draw(), then pop().
class SpinningArrowGlyph {
    // Draw a shaft+head arrow polygon in local (already-translated/rotated) coordinates.
    // tipY = -length (up), head spans [-shaftLength..-length], shaft spans [tailY..-shaftLength].
    static _drawArrowPolygon(length, shaftLength, shaftWidth, headWidth, opts = {}) {
        const { fillColor, strokeColor, strokeWt, scaleFactor, tailY = 0 } = opts;
        const tipY    = -length;
        const headY   = -shaftLength; // where shaft meets head
        const halfS   = shaftWidth / 2;
        const halfH   = headWidth  / 2;

        push();
        if (scaleFactor && scaleFactor !== 1) scale(scaleFactor);
        if (fillColor)   fill(fillColor);   else noFill();
        if (strokeColor) { stroke(strokeColor); strokeWeight(strokeWt || 1.5); } else noStroke();

        beginShape();
        vertex(0,      tipY);   // tip
        vertex( halfH, headY);  // right head corner
        vertex( halfS, headY);  // right shaft top
        vertex( halfS, tailY);  // right shaft bottom
        vertex(-halfS, tailY);  // left shaft bottom
        vertex(-halfS, headY);  // left shaft top
        vertex(-halfH, headY);  // left head corner
        endShape(CLOSE);
        pop();
    }

    // Full spinning-arrow glyph scaled to nodeSize so tip lands at the node circumference.
    // Call inside push()/translate()/rotate() ... pop() with origin at the node center. nodeSize
    // is a RADIUS (matches this app's node.size convention - see nodesObj.js/stateNodes.js).
    static draw(nodeSize) {
        const s          = nodeSize / 32;
        const length     = nodeSize;
        const shaftLen   = Math.max(4, Math.round(18 * s));
        const shaftWidth = Math.max(3, Math.round(5  * s));
        const headWidth  = Math.max(9, Math.round(17 * s));

        SpinningArrowGlyph._drawArrowPolygon(length, shaftLen, shaftWidth, headWidth, {
            fillColor: color(0, 0, 0, 120),
            strokeColor: null,
            scaleFactor: 1.12,
            tailY: 0
        });

        SpinningArrowGlyph._drawArrowPolygon(length, shaftLen, shaftWidth, headWidth, {
            fillColor: color(255, 87, 34),
            strokeColor: color(20, 20, 20, 220),
            strokeWt: 1.5,
            scaleFactor: 1,
            tailY: 0
        });

        fill(255, 255, 255, 230);
        stroke(20, 20, 20, 180);
        strokeWeight(1);
        circle(0, 0, 6);
    }
}
```

- [ ] **Step 2: Register the script tag**

In `index.html`, change:
```html
    <script src="src/main/view/helpers/EasingUtils.js"></script>
```
to:
```html
    <script src="src/main/view/helpers/EasingUtils.js"></script>
    <script src="src/main/view/helpers/SpinningArrowGlyph.js"></script>
```

- [ ] **Step 3: Remove the extracted methods from `mainView.js`, update call sites**

In `src/main/view/mainView.js`, delete the entire `_drawArrowPolygon` method and the entire
`drawSpinningArrowGlyph` method (the block from the `// Draw a shaft+head arrow polygon...`
comment through the closing `}` of `drawSpinningArrowGlyph`, i.e. everything now in
`SpinningArrowGlyph.js` above).

Then, in `drawSpinningArrow()`, change:
```js
        push();
        translate(actionNode.x, actionNode.y);
        rotate(arrowAngle);
        this.drawSpinningArrowGlyph(actionNode.size);
        pop();
```
to:
```js
        push();
        translate(actionNode.x, actionNode.y);
        rotate(arrowAngle);
        SpinningArrowGlyph.draw(actionNode.size);
        pop();
```

And in `drawStateSpinningArrow()`, change:
```js
        push();
        translate(stateNode.x, stateNode.y);
        rotate(arrowAngle);
        this.drawSpinningArrowGlyph(stateNode.size);
        pop();
```
to:
```js
        push();
        translate(stateNode.x, stateNode.y);
        rotate(arrowAngle);
        SpinningArrowGlyph.draw(stateNode.size);
        pop();
```

- [ ] **Step 4: Verify in browser**

```bash
python3 -m http.server 8010
```
Open `http://localhost:8010/index.html`. Build a small graph (a state with 2+ actions, one action
with 2+ probabilistic outcomes), set it as start node, stay in **Graph** view (default), click
Run. Confirm the spinning-arrow animation (rotating arrow + probability flash boxes) looks
pixel-identical to before this change, both at the state-decision step and the action-decision
step. Confirm no console errors (a typo in the extraction would show as `SpinningArrowGlyph is not
defined` or similar). Check both light and dark theme.

- [ ] **Step 5: Commit**

```bash
git add src/main/view/helpers/SpinningArrowGlyph.js src/main/view/mainView.js index.html
git commit -m "Extract SpinningArrowGlyph: shared arrow-glyph helper for Graph and Tree view"
```

---

### Task 2: Stop Graph-view simulation overlays from bleeding into Tree view

**Files:**
- Modify: `src/main/view/mainView.js` (`draw()`)

**Interfaces:** none new — this is the literal bug fix. Later tasks (5-7) add Tree view's own
replacement overlays; this task only stops the wrong ones from drawing.

- [ ] **Step 1: Gate the three overlay draw calls**

In `src/main/view/mainView.js`'s `draw()`, find:
```js
        // Draw spinning arrow if in spinning arrow phase (action node) or state_spinning_arrow (state node)
        if (this.viewModel.simulationState) {
            const _phase = this.viewModel.simulationState.phase;
            if (_phase === 'spinning_arrow') this.drawSpinningArrow();
            if (_phase === 'state_spinning_arrow') this.drawStateSpinningArrow();
        }

        // Draw travel ball during edge_highlight phase
        this.drawHighlightedEdgeTravelBall();

        pop();
```
Replace with:
```js
        // Draw spinning arrow if in spinning arrow phase (action node) or state_spinning_arrow
        // (state node). Gated on NOT being in Tree view - these read real graph node world-
        // coordinates (graph.getNodeById(id).x/.y), which are meaningless in Tree view's synthetic
        // TreeLayout coordinate space. Tree view draws its own tree-positioned equivalents from
        // inside treeView.draw() instead (see treeView.js's _drawTraceReveal(), added in Task 5-6
        // of docs/superpowers/plans/2026-07-14-tree-view-simulation-animation.md).
        const _inTreeView = this._isEditableMode() && this.viewModel.buildCanvasView === 'tree';
        if (!_inTreeView && this.viewModel.simulationState) {
            const _phase = this.viewModel.simulationState.phase;
            if (_phase === 'spinning_arrow') this.drawSpinningArrow();
            if (_phase === 'state_spinning_arrow') this.drawStateSpinningArrow();
        }

        // Draw travel ball during edge_highlight phase
        if (!_inTreeView) this.drawHighlightedEdgeTravelBall();

        pop();
```

- [ ] **Step 2: Verify in browser**

Using the same small graph as Task 1 (state with 2+ actions, one action with 2+ probabilistic
outcomes), set start node, switch to **Tree** view (top-right pill), click Run. Confirm: no
spinning-arrow glyph or travel-ball artifact appears anywhere over the tree at any point during
the run (previously these would float at the wrong, real-graph-derived positions). The tree itself
still shows the full static unroll throughout the run at this point in the plan — that's expected;
Tree view doesn't yet have its own reveal/animation (Tasks 3-8 add that). Switch back to **Graph**
view, click Run again — confirm the spinning arrow/travel ball still appear exactly as before
(regression check on the un-gated path). No console errors, both themes.

- [ ] **Step 3: Commit**

```bash
git add src/main/view/mainView.js
git commit -m "Stop Graph-view simulation overlays from drawing over Tree view"
```

---

### Task 3: Trace → pathId mapping

**Files:**
- Modify: `src/main/view/treeView.js`

**Interfaces:**
- Produces: `TreeView._traceStepToPathId(visited, graph) -> string[]` — a pathId per index of
  `simulationState.visited`, truncated at the first index where a match can't be found. Later
  tasks (4-7) call this to resolve trace positions to `TreeLayout` pathIds.

- [ ] **Step 1: Add `_traceStepToPathId` to the `TreeView` class**

Add this method anywhere in the class (e.g. right after `_currentTree()`):

```js
    // Maps each index of simulationState.visited to its exact pathId in the full unrolled tree,
    // by walking the trace and the domain graph in lockstep - TreeLayout.build() iterates
    // graph.actions/.sas in this exact same order when constructing children, so the two never
    // desync by construction (both ultimately read the same arrays off the same graph). Returns a
    // pathId array parallel to `visited`, truncated at the first index where a match can't be
    // found (defensive - should never happen with a well-formed trace, but must not crash
    // rendering if it somehow did).
    _traceStepToPathId(visited, graph) {
        if (!visited || visited.length === 0) return [];
        const pathIds = ['s0'];
        for (let i = 1; i < visited.length; i++) {
            const prevEntry = visited[i - 1];
            const entry = visited[i];
            const prevPathId = pathIds[i - 1];

            if (entry.type === 'action') {
                const stateNodeInGraph = graph.getNodeById(prevEntry.id);
                const ai = (stateNodeInGraph && stateNodeInGraph.actions)
                    ? stateNodeInGraph.actions.indexOf(entry.id) : -1;
                if (ai < 0) break;
                pathIds.push(`${prevPathId}.a${ai}`);
            } else {
                const actionNodeInGraph = graph.getNodeById(prevEntry.id);
                const ti = (actionNodeInGraph && actionNodeInGraph.sas)
                    ? actionNodeInGraph.sas.findIndex(t => t.nextState === entry.id) : -1;
                if (ti < 0) break;
                pathIds.push(`${prevPathId}.${ti}`);
            }
        }
        return pathIds;
    }
```

- [ ] **Step 2: Verify in browser**

```bash
python3 -m http.server 8010
```
Open `http://localhost:8010/index.html`, and in the console build a graph with a cycle (same
shape as prior Tree view plans' verification graph):
```js
const mk = (type, x, y) => {
    canvasController.interactors.createNode.execute(new CreateNodeInputData(type, x, y));
    return canvasViewModel.graph.nodes[canvasViewModel.graph.nodes.length - 1];
};
const s0 = mk('state', 100, 100);
const a0 = mk('action', 250, 100);
const s1 = mk('state', 400, 100);
const a1 = mk('action', 550, 100);
canvasController.createEdge(s0.id, a0.id);
canvasController.createEdge(a0.id, s1.id, 0.7, 5);
canvasController.createEdge(a0.id, s0.id, 0.3, -1);
canvasController.createEdge(s1.id, a1.id);
canvasController.createEdge(a1.id, s0.id, 1.0, 2);
canvasController.setStartNode(s0);
```
Switch to Build mode, click Run, let it play to completion (or click Reset then Step repeatedly to
avoid timing issues), then in the console:
```js
const visited = canvasViewModel.simulationState.visited;
const pathIds = mainView.treeView._traceStepToPathId(visited, canvasViewModel.graph);
pathIds.length === visited.length   // true - no early break, every step matched
pathIds[0]                          // 's0'
pathIds[1]                          // 's0.a0'
pathIds[2]                          // 's0.a0.0' or 's0.a0.1' depending which outcome was sampled
```
Expected: `pathIds.length === visited.length`, and each entry follows the `.a<index>`/`.<index>`
pattern. No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/view/treeView.js
git commit -m "Add TreeView._traceStepToPathId: map trace steps to tree pathIds"
```

---

### Task 4: Progressive-reveal core rendering (`_drawTraceReveal`)

**Files:**
- Modify: `src/main/view/treeView.js`

**Interfaces:**
- Consumes: `_traceStepToPathId` (Task 3), `TreeLayout.build`/`.forEach` (existing).
- Produces: `TreeView._isSimulating() -> boolean`, `TreeView._drawStaticTree(tree)` (existing
  static-tree drawing, extracted unchanged), `TreeView._drawTraceReveal(tree, simState)` (new),
  `TreeView._drawNode(node, opts)` — signature changed from `_drawNode(node)` to accept an options
  object `{isCurrent, showBadge}` (both default according to existing behavior when omitted).
  Later tasks (5-7) call `_drawTraceReveal` and extend it.

- [ ] **Step 1: Add `_isSimulating()`**

Add near the top of the `TreeView` class (e.g. right after the constructor):
```js
    _isSimulating() {
        const simState = this.viewModel.simulationState;
        return !!(simState && simState.replayInitialized);
    }
```

- [ ] **Step 2: Auto-expand the tree along the live trace**

Change `_currentTree()` from:
```js
    _currentTree() {
        const startNode = this.viewModel.startNode;
        if (!startNode) return null;
        return TreeLayout.build(this.viewModel.graph, startNode.id, this.viewModel.treeExpanded, 1, this._usableWidth);
    }
```
to:
```js
    // During an active simulation, the tree must auto-expand past the user's manual treeExpanded
    // set to cover however far the live trace has gone - the trace can run deeper (up to
    // simulationState.maxSteps transitions) than the default depth-1 cap or anything the user
    // happened to click open. Recomputed fresh each call (no cache), same convention every other
    // TreeLayout consumer here already follows.
    _expandedSetForCurrentDraw() {
        if (!this._isSimulating()) return this.viewModel.treeExpanded;
        const simState = this.viewModel.simulationState;
        const pathIds = this._traceStepToPathId(simState.visited, this.viewModel.graph);
        const bound = Math.min(simState.currentIndex, pathIds.length - 1);
        const expanded = new Set(this.viewModel.treeExpanded);
        for (let i = 0; i <= bound; i++) expanded.add(pathIds[i]);
        return expanded;
    }

    _currentTree() {
        const startNode = this.viewModel.startNode;
        if (!startNode) return null;
        const expandedSet = this._expandedSetForCurrentDraw();
        return TreeLayout.build(this.viewModel.graph, startNode.id, expandedSet, 1, this._usableWidth);
    }
```

- [ ] **Step 3: Split `draw()` into static vs. trace-reveal dispatch**

Change:
```js
    draw(usableWidth) {
        if (usableWidth) this._usableWidth = Math.max(300, usableWidth - TREE_VIEW_ANCHOR_X);
        const tree = this._currentTree();
        if (!tree) return;

        push();
        translate(TREE_VIEW_ANCHOR_X, TREE_VIEW_ANCHOR_Y);

        // Edges first (so nodes draw on top of their own incoming edge).
        TreeLayout.forEach(tree, node => {
            node.children.forEach(child => this._drawEdge(node, child));
        });
        // Nodes second.
        TreeLayout.forEach(tree, node => this._drawNode(node));
        this._drawHoverBadge(tree);

        pop();
    }
```
to:
```js
    draw(usableWidth) {
        if (usableWidth) this._usableWidth = Math.max(300, usableWidth - TREE_VIEW_ANCHOR_X);
        const tree = this._currentTree();
        if (!tree) return;

        push();
        translate(TREE_VIEW_ANCHOR_X, TREE_VIEW_ANCHOR_Y);

        if (this._isSimulating()) {
            this._drawTraceReveal(tree, this.viewModel.simulationState);
        } else {
            this._drawStaticTree(tree);
        }

        pop();
    }

    // Full unrolled tree, all branches, hover ring + badges - the existing v1/v2 Browse-mode
    // behavior, extracted unchanged into its own method now that draw() also has a second mode.
    _drawStaticTree(tree) {
        // Edges first (so nodes draw on top of their own incoming edge).
        TreeLayout.forEach(tree, node => {
            node.children.forEach(child => this._drawEdge(node, child));
        });
        // Nodes second.
        TreeLayout.forEach(tree, node => this._drawNode(node));
        this._drawHoverBadge(tree);
    }
```

- [ ] **Step 4: Add `_buildPathIdMap` and `_drawTraceReveal`**

Add these two methods after `_drawStaticTree`:
```js
    // Builds a pathId -> TreeNode lookup map for one tree (used by _drawTraceReveal to resolve
    // trace-position pathIds back to the tree nodes/positions to render).
    _buildPathIdMap(tree) {
        const map = new Map();
        TreeLayout.forEach(tree, node => map.set(node.pathId, node));
        return map;
    }

    // Progressive reveal, tree-positioned: mirrors Graph view's own progressive-reveal convention
    // (mainView.js's drawNodes()/drawEdges(), gated by simulationState.isNodeVisible/isEdgeVisible)
    // but resolved against tree pathIds instead of real graph node world-positions. Committed trace
    // steps (pathIds[0..currentIndex]) always draw; the "frontier fan" - the current tree node's
    // full set of real children (all actions of a state, or all outcomes of an action) - draws
    // only the subset simState still has revealed, exactly matching SimulationAnimator's
    // reveal-then-narrow-to-chosen flow. No ambiguity from a real id recurring elsewhere in the
    // general tree, since only the current frontier node's own direct children are ever checked -
    // never a global id scan.
    _drawTraceReveal(tree, simState) {
        const pathIds = this._traceStepToPathId(simState.visited, this.viewModel.graph);
        const pathMap = this._buildPathIdMap(tree);
        const ci = Math.min(simState.currentIndex, pathIds.length - 1);
        if (ci < 0) return;

        // Committed edges: consecutive committed pathIds, drawn as plain traversed edges.
        for (let i = 1; i <= ci; i++) {
            const parent = pathMap.get(pathIds[i - 1]);
            const child = pathMap.get(pathIds[i]);
            if (parent && child) this._drawEdge(parent, child);
        }

        // Frontier fan edges: current node's real children still marked visible by simState.
        const current = pathMap.get(pathIds[ci]);
        if (current) {
            current.children.forEach(child => {
                const realChildId = child.kind === 'state' ? child.stateId : child.actionId;
                const realParentId = current.kind === 'state' ? current.stateId : current.actionId;
                if (simState.isEdgeVisible(realParentId, realChildId)) {
                    this._drawEdge(current, child);
                }
            });
        }

        // Committed nodes (current one highlighted).
        for (let i = 0; i <= ci; i++) {
            const node = pathMap.get(pathIds[i]);
            if (node) this._drawNode(node, { isCurrent: i === ci, showBadge: false });
        }

        // Frontier fan nodes.
        if (current) {
            current.children.forEach(child => {
                const realChildId = child.kind === 'state' ? child.stateId : child.actionId;
                if (simState.isNodeVisible(realChildId)) {
                    this._drawNode(child, { isCurrent: false, showBadge: false });
                }
            });
        }
    }
```

- [ ] **Step 5: Thread `opts` through `_drawNode`, add the current-node highlight fill, gate the
  badge and hover ring**

Read the existing `_drawNode(node)` method in full first. Change its signature and body:

Change:
```js
    _drawNode(node) {
        const isHoveredState = node.kind === 'state' && this.hoveredStateId !== null &&
            node.stateId === this.hoveredStateId;
```
to:
```js
    _drawNode(node, opts = {}) {
        const { isCurrent = false, showBadge = true } = opts;
        const isHoveredState = !this._isSimulating() && node.kind === 'state' &&
            this.hoveredStateId !== null && node.stateId === this.hoveredStateId;
```

Change:
```js
        push();
        fill(ColorUtils.applyAlpha(node.kind === 'state' ? AppPalette.node.state : AppPalette.node.action, 220));
        stroke(AppPalette.text.medium);
        strokeWeight(2);
        circle(node.x, node.y, halfSize * 2);
        pop();
```
to:
```js
        push();
        const baseFill = isCurrent
            ? AppPalette.node.activeInitial
            : (node.kind === 'state' ? AppPalette.node.state : AppPalette.node.action);
        fill(ColorUtils.applyAlpha(baseFill, 220));
        stroke(AppPalette.text.medium);
        strokeWeight(2);
        circle(node.x, node.y, halfSize * 2);
        pop();
```

Change:
```js
        if (node.hasChildren) {
            const center = this._badgeCenter(node);
```
to:
```js
        if (showBadge && node.hasChildren) {
            const center = this._badgeCenter(node);
```

- [ ] **Step 6: Verify in browser**

Using the same cyclic test graph as Task 3 (s0/a0/s1/a1, s0 with a 0.7/+5 and 0.3/-1 outcome under
a0), set start node, switch to **Tree** view, click Run (or Step repeatedly for a controlled
pace). Confirm, at each moment:
- Only the trace-so-far is drawn — NOT the full tree (compare against switching to Graph view or
  looking at the tree before clicking Run, which should show the full unroll).
- During the `reveal` phase at a state decision, ALL of that state's actions briefly appear (the
  "flash"), narrowing down to just the chosen one shortly after.
- The current node (wherever `simulationState.currentNode` is) is filled orange
  (`AppPalette.node.activeInitial`), distinct from the normal cyan/purple state/action fill.
- No +/- badges appear anywhere while the simulation is active.
- Click Reset. Confirm the tree reverts to the full static unroll, badges reappear, and hovering
  a state shows the normal yellow ring again (hover was untouched by this task, but confirm the
  `!this._isSimulating()` guard didn't break it in the non-simulating case).
- Build a graph deep enough to exceed the depth-1 default (e.g. add a 3rd state/action pair
  chained off `s1`/`a1`), run the simulation through that depth — confirm the tree auto-expands to
  show it without any manual badge clicks.

No console errors, both themes.

- [ ] **Step 7: Commit**

```bash
git add src/main/view/treeView.js
git commit -m "Add TreeView progressive-reveal rendering during active simulation"
```

---

### Task 5: Tree-native spinning arrow (state and action decisions)

**Files:**
- Modify: `src/main/view/treeView.js`

**Interfaces:**
- Consumes: `SpinningArrowGlyph.draw` (Task 1).
- Produces: `TreeView._drawTreeStateSpinningArrow(current, simState)`,
  `TreeView._drawTreeSpinningArrow(current, simState)` — called from `_drawTraceReveal` (Task 4).

- [ ] **Step 1: Add the two spinning-arrow methods**

Add these to the `TreeView` class (e.g. after `_drawTraceReveal`):
```js
    // Tree-positioned analogue of mainView.js's drawStateSpinningArrow() - same simState fields
    // and glyph, resolved against the current tree node's position/children instead of the real
    // graph's pinned positions. Matches Graph view's existing probability-label text verbatim,
    // including its pre-existing uniform-1/n-only quirk (see this plan's Global Constraints) -
    // not a place to "fix" that, out of scope here.
    _drawTreeStateSpinningArrow(current, simState) {
        const edges = simState.spinningArrowEdges;
        if (!edges || edges.length === 0) return;

        const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();
        const highlightedEdge = edges[highlightedEdgeIndex];

        let arrowAngle = 0;
        if (highlightedEdge) {
            const targetAction = current.children.find(c => c.actionId === highlightedEdge.targetId);
            if (targetAction) {
                arrowAngle = atan2(targetAction.y - current.y, targetAction.x - current.x) + PI / 2;
            }
        }

        push();
        translate(current.x, current.y);
        rotate(arrowAngle);
        SpinningArrowGlyph.draw(TREE_VIEW_STATE_RADIUS);
        pop();

        const n = edges.length;
        edges.forEach((edge, index) => {
            const actionNode = current.children.find(c => c.actionId === edge.targetId);
            if (!actionNode) return;

            const midX = (current.x + actionNode.x) / 2;
            const midY = (current.y + actionNode.y) / 2;
            const isHighlighted = (index === highlightedEdgeIndex);
            const probLabel = `p = ${(1 / n).toFixed(2)}`;
            this._drawSpinLabel(midX, midY, probLabel, isHighlighted);
        });
    }

    // Tree-positioned analogue of mainView.js's drawSpinningArrow() (action-node decision among
    // outcome states) - same simState fields/glyph, resolved against tree positions.
    _drawTreeSpinningArrow(current, simState) {
        const actionNodeInGraph = this.viewModel.graph.getNodeById(current.actionId);
        if (!actionNodeInGraph || !actionNodeInGraph.sas || actionNodeInGraph.sas.length === 0) return;

        const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();
        const highlightedTransition = actionNodeInGraph.sas[highlightedEdgeIndex];

        let arrowAngle = 0;
        if (highlightedTransition) {
            const targetState = current.children.find(c => c.stateId === highlightedTransition.nextState);
            if (targetState) {
                arrowAngle = atan2(targetState.y - current.y, targetState.x - current.x) + PI / 2;
            }
        }

        push();
        translate(current.x, current.y);
        rotate(arrowAngle);
        SpinningArrowGlyph.draw(TREE_VIEW_ACTION_HALF);
        pop();

        actionNodeInGraph.sas.forEach((transition, index) => {
            const targetState = current.children.find(c => c.stateId === transition.nextState);
            if (!targetState) return;

            const midX = (current.x + targetState.x) / 2;
            const midY = (current.y + targetState.y) / 2;
            const isHighlighted = (index === highlightedEdgeIndex);
            const probLabel = `p = ${transition.probability.toFixed(2)}`;
            this._drawSpinLabel(midX, midY, probLabel, isHighlighted);
        });
    }

    // Shared probability-label chip for both spinning-arrow variants above - a small rect behind
    // KaTeX-rendered text via the app's existing mathRenderer global (set up in main.js), matching
    // Graph view's own label styling exactly, just at Tree view's smaller scale.
    _drawSpinLabel(midX, midY, probLabel, isHighlighted) {
        push();
        noStroke();
        if (isHighlighted) {
            fill(ColorUtils.applyAlpha(AppPalette.simulation.spinLabelHighlight, 220));
        } else {
            fill(ColorUtils.applyAlpha(AppPalette.simulation.spinLabelBackground, 60));
        }
        rect(midX - 22, midY - 9, 44, 18, 4);
        pop();

        mathRenderer.draw(drawingContext, probLabel, midX, midY, {
            color: isHighlighted ? AppPalette.text.black : AppPalette.edge.label,
            em: isHighlighted ? 11 : 9,
            alpha: isHighlighted ? 255 : 80
        });
    }
```

- [ ] **Step 2: Call the new methods from `_drawTraceReveal`**

In `_drawTraceReveal` (Task 4), after the "Frontier fan nodes" block, add:
```js
        if (current) {
            if (simState.phase === 'state_spinning_arrow') this._drawTreeStateSpinningArrow(current, simState);
            if (simState.phase === 'spinning_arrow') this._drawTreeSpinningArrow(current, simState);
        }
```

- [ ] **Step 3: Verify in browser**

Using the cyclic test graph (or a fresh one with a state that has 2+ actions so the state-level
spinning arrow has something to show — note it only runs when that state's policy is NOT
deterministic, i.e. `simulationState.policy[stateId] === undefined`, the default), switch to Tree
view, click Run. Confirm: at a state decision point, a rotating arrow appears centered on the
current (orange) state node, sweeping through its action children with flashing `p = 0.XX` labels,
landing on the chosen action; at the action decision point, the same happens among the action's
outcome states, with REAL (non-uniform) probabilities shown. No console errors, both themes.

- [ ] **Step 4: Commit**

```bash
git add src/main/view/treeView.js
git commit -m "Add tree-native spinning-arrow rendering for state/action decisions"
```

---

### Task 6: Tree-native travel ball

**Files:**
- Modify: `src/main/view/treeView.js`

**Interfaces:**
- Produces: `TreeView._drawTreeTravelBall(fromNode, toNode, simState)` — called from
  `_drawTraceReveal` (Task 4) during the `'highlight'` phase.

- [ ] **Step 1: Add `_drawTreeTravelBall`**

Add this method to the `TreeView` class (e.g. after `_drawTreeSpinningArrow`):
```js
    // Tree-positioned analogue of SimulationRenderer.drawTravelBall() - always a straight lerp,
    // no bidirectional-edge curve case (unlike Graph view, a tree position's "reverse" edge is a
    // distinct pathId - never the literal same two tree nodes traversed in both directions).
    _drawTreeTravelBall(fromNode, toNode, simState) {
        const elapsed = Date.now() - simState.phaseStartTime;
        const t = EasingUtils.easeInOut(Math.min(1, elapsed / simState.phaseDuration));

        const dx = toNode.x - fromNode.x, dy = toNode.y - fromNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const nx = dx / dist, ny = dy / dist;
        const fromHalf = fromNode.kind === 'state' ? TREE_VIEW_STATE_RADIUS : TREE_VIEW_ACTION_HALF;
        const toHalf = toNode.kind === 'state' ? TREE_VIEW_STATE_RADIUS : TREE_VIEW_ACTION_HALF;

        const ballX = lerp(fromNode.x + nx * fromHalf, toNode.x - nx * toHalf, t);
        const ballY = lerp(fromNode.y + ny * fromHalf, toNode.y - ny * toHalf, t);

        const r = 7;
        noStroke();
        fill(ColorUtils.applyAlpha(AppPalette.simulation.travelBall, 230));
        circle(ballX, ballY, r * 2);
        noFill();
        stroke(ColorUtils.applyAlpha(AppPalette.simulation.travelBall, Math.round(120 * (1 - t))));
        strokeWeight(2);
        circle(ballX, ballY, r * 3);
        drawingContext.setLineDash([]);
    }
```

- [ ] **Step 2: Call it from `_drawTraceReveal`**

In `_drawTraceReveal` (Task 4/5), after the spinning-arrow calls added in Task 5, add:
```js
        if (simState.phase === 'highlight' && current && ci + 1 < pathIds.length) {
            const nextNode = pathMap.get(pathIds[ci + 1]);
            if (nextNode) this._drawTreeTravelBall(current, nextNode, simState);
        }
```

- [ ] **Step 3: Verify in browser**

Switch to Tree view, click Run. Confirm a small gold ball travels smoothly from the current node
to the next committed node during the brief `highlight` phase right before each advance, matching
Graph view's own travel-ball look (color, ring fade), just following the tree's edges instead of
the graph's. No console errors, both themes.

- [ ] **Step 4: Commit**

```bash
git add src/main/view/treeView.js
git commit -m "Add tree-native travel-ball rendering for the highlight phase"
```

---

### Task 7: Camera auto-follow

**Files:**
- Modify: `src/main/view/treeView.js`

**Interfaces:**
- Produces: `TreeView._followCamera(current, simState)` — called from `_drawTraceReveal`.

- [ ] **Step 1: Add `_followCamera`**

Add this method to the `TreeView` class (e.g. after `_drawTreeTravelBall`):
```js
    // Auto-pans the viewport so the active node stays visible as the trace advances - the tree
    // can grow far wider than the canvas (up to simulationState.maxSteps transitions). Lerped over
    // the SAME 'transition' phase clock SimulationAnimator already drives (phaseStartTime/
    // phaseDuration), reusing an already-ticking clock rather than adding new timing constants.
    // This is new behavior specific to Tree view, not a mirror of an existing Graph view camera
    // pan - Graph view's own 'transition' phase is a timing pause only, since its nodes are
    // already pinned/user-arranged and never need to be followed.
    _followCamera(current, simState) {
        if (simState.phase !== 'transition' || !current) return;
        const viewport = this.viewModel.viewport;
        const targetScreenX = (this._usableWidth + TREE_VIEW_ANCHOR_X) * 0.4;
        const targetScreenY = height / 2;
        const activeWorldX = current.x + TREE_VIEW_ANCHOR_X;
        const activeWorldY = current.y + TREE_VIEW_ANCHOR_Y;
        const targetPanX = targetScreenX - activeWorldX * viewport.zoom;
        const targetPanY = targetScreenY - activeWorldY * viewport.zoom;

        const elapsed = Date.now() - simState.phaseStartTime;
        const t = EasingUtils.easeInOut(Math.min(1, elapsed / simState.phaseDuration));
        viewport.panX = lerp(viewport.panX, targetPanX, t);
        viewport.panY = lerp(viewport.panY, targetPanY, t);
    }
```

- [ ] **Step 2: Call it from `_drawTraceReveal`**

In `_drawTraceReveal`, at the very end of the method (after the travel-ball call added in Task 6),
add:
```js
        this._followCamera(current, simState);
```

- [ ] **Step 3: Verify in browser**

Build a chain long enough to run off the default view (5+ sequential state/action pairs — e.g.
extend the cyclic test graph with 3 more state/action pairs after `s1`/`a1`, all with probability
1.0 so the trace is deterministic and easy to follow), set start node, switch to Tree view, click
Run. Confirm the viewport smoothly pans rightward as the trace advances, keeping the active
(orange) node roughly in view rather than running off the right edge. Confirm zooming in/out via
the zoom pill still works normally during this (camera-follow and zoom aren't mutually exclusive —
follow just recomputes its pan target using the current zoom each phase). No console errors, both
themes.

- [ ] **Step 4: Commit**

```bash
git add src/main/view/treeView.js
git commit -m "Add camera auto-follow for the active node during Tree view simulation"
```

---

### Task 8: Interaction gating, final regression pass, docs

**Files:**
- Modify: `src/main/view/treeView.js` (`hitTestBadge`, `handleClick`, `handleMouseMove`)
- Modify: `CLAUDE.md` (repo root of this worktree)

**Interfaces:**
- Changes: `TreeView.hitTestBadge`, `.handleClick`, `.handleMouseMove` all early-return/no-op while
  `_isSimulating()` is true. No `mainView.js` changes needed — `mousePressed()`'s existing tree
  branch already calls `hitTestBadge` to decide "click a badge" vs. "arm panning," so gating
  `hitTestBadge` to always return `false` during simulation makes that branch naturally fall
  through to panning, with no separate check needed there.

- [ ] **Step 1: Gate `hitTestBadge`**

Change:
```js
    hitTestBadge(screenX, screenY) {
        return this._hitTestBadge(screenX, screenY) !== null;
    }
```
to:
```js
    hitTestBadge(screenX, screenY) {
        if (this._isSimulating()) return false;
        return this._hitTestBadge(screenX, screenY) !== null;
    }
```

- [ ] **Step 2: Gate `handleClick`**

Change:
```js
    handleClick(screenX, screenY) {
        const node = this._hitTestBadge(screenX, screenY);
        if (node) {
            this._toggle(node.pathId);
        }
        return true;
    }
```
to:
```js
    handleClick(screenX, screenY) {
        if (this._isSimulating()) return true;
        const node = this._hitTestBadge(screenX, screenY);
        if (node) {
            this._toggle(node.pathId);
        }
        return true;
    }
```

- [ ] **Step 3: Gate `handleMouseMove`, clearing any stale hover**

Change:
```js
    handleMouseMove(screenX, screenY) {
        const node = this._hitTest(screenX, screenY);
        const newHoveredStateId = (node && node.kind === 'state') ? node.stateId : null;

        const edgeHit = newHoveredStateId === null ? this._hitTestEdge(screenX, screenY) : null;
        const newHoveredEdgeKey = edgeHit ? edgeHit.childStateNode.pathId : null;

        const changed = (newHoveredStateId !== this.hoveredStateId) ||
            (newHoveredEdgeKey !== this._hoveredEdgeKey);

        this.hoveredStateId = newHoveredStateId;
        this.hoveredEdge = edgeHit;
        this._hoveredEdgeKey = newHoveredEdgeKey;
        return changed;
    }
```
to:
```js
    handleMouseMove(screenX, screenY) {
        if (this._isSimulating()) {
            // Clear any hover state left over from before Play started - returns true exactly
            // once (the frame that actually clears something), so the caller redraws to remove a
            // lingering ring/tooltip, then false on subsequent calls (no wasted redraws).
            const hadHover = this.hoveredStateId !== null || this.hoveredEdge !== null;
            this.hoveredStateId = null;
            this.hoveredEdge = null;
            this._hoveredEdgeKey = null;
            return hadHover;
        }

        const node = this._hitTest(screenX, screenY);
        const newHoveredStateId = (node && node.kind === 'state') ? node.stateId : null;

        const edgeHit = newHoveredStateId === null ? this._hitTestEdge(screenX, screenY) : null;
        const newHoveredEdgeKey = edgeHit ? edgeHit.childStateNode.pathId : null;

        const changed = (newHoveredStateId !== this.hoveredStateId) ||
            (newHoveredEdgeKey !== this._hoveredEdgeKey);

        this.hoveredStateId = newHoveredStateId;
        this.hoveredEdge = edgeHit;
        this._hoveredEdgeKey = newHoveredEdgeKey;
        return changed;
    }
```

- [ ] **Step 4: Full regression pass**

Using a reasonably branchy graph (at least one state with 2+ actions, one action with 2+
probabilistic outcomes of mixed reward sign, a chain deep enough to require auto-expansion, and a
cycle back to an earlier state), run through:

1. **Interaction gating**: switch to Tree view, click Run. While it's playing, click where a
   badge would be and hover over nodes — confirm nothing happens (no expand/collapse, no hover
   ring, no edge tooltip). Click Reset. Confirm badges and hover both work again immediately.
2. **Reset**: confirm Reset always returns Tree view to the full static unroll (not stuck
   mid-reveal).
3. **Mid-run view switch**: start Play in Tree view, switch to the Graph pill mid-run — confirm
   Graph view's own reveal/spinning-arrow/travel-ball still work exactly as before (Task 2's gate
   only suppresses them while `buildCanvasView === 'tree'`). Switch back to Tree — confirm it
   picks up rendering the current trace position correctly (no stale/frozen frame), since
   `_drawTraceReveal` recomputes everything fresh from `simulationState` on every call.
4. **Policy mode**: repeat the Run-in-Tree-view check in Policy mode — confirm it works
   identically (Tree view/pill are already shared between Build and Policy).
5. **Both themes**: repeat a full Run in Tree view in dark theme (`AppPalette.setTheme('dark')`),
   confirm all new visuals (current-node fill, spinning arrow, travel ball, spin labels) remain
   legible.
6. **No console errors** throughout every step above.

- [ ] **Step 5: Update `CLAUDE.md`**

In this worktree's `CLAUDE.md`, find the existing bullet (in the View Layer file listing):
```markdown
   - `treeViewPill.js` + `treeView.js`: Floating top-right `[Graph | Tree]` pill in Build/Policy mode, plus the full-canvas view it toggles — unrolls the MDP into a left-to-right search tree rooted at the start node (s₀), with click-to-expand/collapse (depth-capped by default) and hover-highlight of repeated states. Presentation-only (`buildCanvasView`, `treeExpanded` on `CanvasViewModel`), unrelated to Learning Iteration's own algorithmic Graph|Tree toggle in Values mode.
```
Replace it with:
```markdown
   - `treeViewPill.js` + `treeView.js`: Floating top-right `[Graph | Tree]` pill in Build/Policy mode, plus the full-canvas view it toggles — unrolls the MDP into a left-to-right search tree rooted at the start node (s₀), with click-to-expand/collapse (depth-capped by default) and hover-highlight of repeated states. Presentation-only (`buildCanvasView`, `treeExpanded` on `CanvasViewModel`), unrelated to Learning Iteration's own algorithmic Graph|Tree toggle in Values mode. While a Build/Policy simulation is actively playing (`simulationState.replayInitialized`), Tree view switches from the static full unroll to a progressive reveal of the trace-so-far (`TreeView._drawTraceReveal()`) — mirroring Graph view's own reveal/highlight/spinning-arrow phases but resolved against tree pathIds instead of real graph positions (auto-expanding and auto-panning to follow the active node, via the shared `SpinningArrowGlyph` helper) — with badge/hover interaction disabled until Reset returns it to the static tree.
```

- [ ] **Step 6: Commit**

```bash
git add src/main/view/treeView.js CLAUDE.md
git commit -m "Gate Tree view interaction during simulation; document tree simulation animation"
```

---

## Self-Review Notes

- **Spec coverage:** design doc's Architecture section → Tasks 3-4 (pathId mapping, dispatch,
  visibility); Spinning arrow/travel ball section → Tasks 1, 5, 6; Camera follow → Task 7;
  Interaction gating → Task 8; Reset/mode-switch behavior → Task 8's regression pass (verified,
  not additional code, per the design doc's own "no new reset logic needed" conclusion).
- **Placeholder scan:** no TBD/TODO; every step has complete, concrete code or a concrete
  verification script.
- **Type/name consistency:** `_traceStepToPathId(visited, graph)` (Task 3) is called identically
  in `_expandedSetForCurrentDraw()` and `_drawTraceReveal()` (Task 4). `_drawNode(node, opts)`'s
  new `{isCurrent, showBadge}` shape (Task 4) is used identically by `_drawStaticTree()`'s
  (unchanged) callers and `_drawTraceReveal()`'s new callers. `SpinningArrowGlyph.draw(nodeSize)`
  (Task 1) is called with the same signature from both `mainView.js` (existing, updated call
  sites) and `treeView.js` (Task 5, new call sites). `current`/`pathMap`/`pathIds`/`ci` — the
  local variables `_drawTraceReveal` computes in Task 4 — are consumed by name in Tasks 5-7's
  additions to that same method; no renaming across tasks.
