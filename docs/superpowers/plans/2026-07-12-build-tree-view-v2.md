# Tree View v2 — Thirds Layout, +/−-Expand, Reward/Probability Edges — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the already-shipped Build/Policy tree view: default to exactly 3 columns (s₀ → actions → s') laid out in thirds of the canvas, replace whole-node click-to-expand with a small +/− badge, and replace outcome edges' always-visible text label with reward-color + probability-width encoding plus a hover-revealed `P(s'|s,a)` tooltip.

**Architecture:** All changes are contained to `src/main/view/helpers/TreeLayout.js` (pure layout/data) and `src/main/view/treeView.js` (rendering + hit-testing), plus one call-site edit in `src/main/view/mainView.js` (threading the usable canvas width into `TreeView.draw()`, matching the existing `ExpectationView.draw(usableW, usableH)` precedent). No new files, no viewmodel/controller changes — `buildCanvasView`/`treeExpanded` and their controller methods are unchanged from v1.

**Tech Stack:** Vanilla JS, p5.js canvas rendering, no build step, no test framework (per `CLAUDE.md` — verification is manual/headless-browser, not unit tests).

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-07-12-build-tree-view-v2-design.md` (and the unchanged parts of `docs/superpowers/specs/2026-07-11-build-tree-view-design.md`) — read both once before starting Task 1.
- Default tree depth is now **1** (was 4): s₀, its actions, and the resulting s' — nothing deeper without manual expansion.
- Columns 0-2 (root state, actions, resulting states) partition the **usable canvas width** (`windowWidth - RIGHT_PANEL_WIDTH`, NOT raw canvas `width`) into thirds. Columns beyond that (only reachable via manual expansion) use the existing fixed `LEVEL_SPACING`, continuing from column 2 — expansion never re-partitions the canvas. Only re-rooting (which already clears `treeExpanded`) resets back to the fresh thirds view.
- The "+/−" badge is the ONLY way to toggle expansion now — clicking a node's body (away from its badge) does nothing. Badges appear on every node with `hasChildren === true` (both collapsed and already-expanded ones) — "+" when collapsed, "−" when expanded — preserving v1's existing toggle-both-ways behavior, just moving the click target.
- Outcome edges (action → state) lose their always-visible `p 0.70 · +5` label; gain reward-sign color and probability-proportional width using this app's **existing, already-established** Action→State edge-width formula (`1 + 4 * probability`, from `mainView.js`'s own graph-edge drawing — NOT the `1 + 3p` formula, which is a different, State→Action-only convention for weighted policies). Hovering an outcome edge shows a `P(s' | s, a) = 0.XX` tooltip using real node names.
- State→action edges are completely unchanged (plain muted gray, no label, no hover).
- No automated test suite exists. Every task's verification step is manual/headless-browser (`python3 -m http.server 8010` + `playwright-core` if available), not a unit test. Check both light and dark theme wherever a task touches rendering.

---

### Task 1: `TreeLayout` — default depth 1, thirds-based layout for columns 0-2

**Files:**
- Modify: `src/main/view/helpers/TreeLayout.js`

**Interfaces:**
- Changes: `TreeLayout.build(graph, startStateId, expandedSet, defaultDepth = 1, usableWidth = 900)` — two changes to the signature: `defaultDepth`'s default is now `1` (was `4`), and a new `usableWidth` parameter (default `900`, a reasonable fallback matching a typical desktop window minus the right panel) is added and forwarded to `_assignPositions`.
- Changes: `TreeLayout._assignPositions(root, usableWidth)` — now takes `usableWidth` and computes columns 0-2's x-position from it; columns 3+ fall back to fixed `LEVEL_SPACING`.
- Unchanged: `TreeLayout.forEach`, the `TreeNode` shape (all fields from v1 stay the same).
- Later tasks (2-4) call `TreeLayout.build` with a real `usableWidth` value threaded from `mainView.js` — this task's default value is only a fallback for callers that don't supply one yet (there shouldn't be any after Task 2, but the default keeps this class self-contained/testable in isolation).

- [ ] **Step 1: Update `build`'s signature and default depth**

In `src/main/view/helpers/TreeLayout.js`, change:
```js
    static build(graph, startStateId, expandedSet, defaultDepth = 4) {
```
to:
```js
    static build(graph, startStateId, expandedSet, defaultDepth = 1, usableWidth = 900) {
```
And change the call to `_assignPositions` at the end of `build` from:
```js
        TreeLayout._assignPositions(root);
```
to:
```js
        TreeLayout._assignPositions(root, usableWidth);
```

- [ ] **Step 2: Rewrite `_assignPositions` to partition columns 0-2 into thirds**

Replace the entire `_assignPositions` method with:
```js
    // Leaves get sequential vertical slots in left-to-right traversal order; each internal node's
    // slot = mean of its children's slots (unchanged from v1 - same "leaves first, average up"
    // approach learningIterationView.js's _layoutTree uses).
    //
    // Horizontal (x) position differs by column in v2: columns 0-2 (root state, its actions, the
    // resulting states - exactly what a defaultDepth=1 tree shows before any expansion) partition
    // usableWidth into thirds, each node centered in its third. Columns 3+ (only reachable by
    // manually expanding past the default view) fall back to fixed LEVEL_SPACING, continuing on
    // from column 2's x position - expansion never re-partitions the canvas, only re-rooting
    // (which already clears treeExpanded) resets back to the fresh thirds view.
    static _assignPositions(root, usableWidth) {
        if (!root) return;
        let slotCounter = 0;
        const assignSlot = (node, level) => {
            node._level = level;
            if (!node.children || node.children.length === 0) {
                node._slot = slotCounter;
                slotCounter++;
            } else {
                node.children.forEach(c => assignSlot(c, level + 1));
                const slots = node.children.map(c => c._slot);
                node._slot = slots.reduce((a, b) => a + b, 0) / slots.length;
            }
        };
        assignSlot(root, 0);

        const thirdWidth = usableWidth / 3;
        const col2X = thirdWidth * 2.5; // center of the third third
        const xForLevel = (level) => {
            if (level <= 2) return thirdWidth * (level + 0.5);
            return col2X + (level - 2) * TreeLayout.LEVEL_SPACING;
        };

        TreeLayout.forEach(root, node => {
            node.x = xForLevel(node._level);
            node.y = node._slot * TreeLayout.SLOT_SPACING;
        });
    }
```

- [ ] **Step 3: Verify in browser**

Start a local server (`python3 -m http.server 8010` from the repo root; check if one's already running first) and load `http://localhost:8010/index.html`. In the console:
```js
const mk = (type, x, y) => {
    canvasController.interactors.createNode.execute(new CreateNodeInputData(type, x, y));
    return canvasViewModel.graph.nodes[canvasViewModel.graph.nodes.length - 1];
};
const s0 = mk('state', 100, 100);
const a0 = mk('action', 250, 100);
const s1 = mk('state', 400, 100);
const a1 = mk('action', 550, 100);
const s2 = mk('state', 700, 100);
canvasController.createEdge(s0.id, a0.id);
canvasController.createEdge(a0.id, s1.id, 1.0, 5);
canvasController.createEdge(s1.id, a1.id);
canvasController.createEdge(a1.id, s2.id, 1.0, 2);
canvasController.setStartNode(s0);

const tree = TreeLayout.build(canvasViewModel.graph, s0.id, canvasViewModel.treeExpanded, 1, 900);
tree.x                          // 150 (thirdWidth=300, level 0 -> 300*0.5)
tree.children[0].x              // 450 (level 1 -> 300*1.5)
tree.children[0].children[0].x  // 750 (level 2 -> 300*2.5)
tree.children[0].children[0].isCollapsed  // true - s1 has a real action (a1) not shown by default (depth 1 cap)
tree.children[0].children[0].children.length // 0 - confirms it's genuinely not expanded
```
Expected: every line matches. No console errors. (This step is pure-data verification — visual rendering is Task 2, since `TreeView` doesn't yet pass a real `usableWidth` through.)

- [ ] **Step 4: Commit**

```bash
git add src/main/view/helpers/TreeLayout.js
git commit -m "TreeLayout: default depth 1, thirds-based layout for columns 0-2"
```

---

### Task 2: Thread `usableWidth` from `mainView.js` into `TreeView`

**Files:**
- Modify: `src/main/view/treeView.js`
- Modify: `src/main/view/mainView.js:208-209`

**Interfaces:**
- Changes: `TreeView.draw(usableWidth)` — now takes the usable canvas width as a parameter (matching the existing `ExpectationView.draw(usableW, usableH)` precedent in this same codebase) and stores it for use by hit-testing/hover between draws.
- Changes: `TreeView._treeToScreen(x, y)` — was `_treeToScreen(node)` (read `node.x`/`node.y` internally); now takes plain `x`/`y` coordinates directly, so it can be reused for the badge-center and edge-midpoint math added in Tasks 3-4 (which need to convert arbitrary tree-local points, not just existing node objects, to screen space).
- All existing internal callers of `_treeToScreen(node)` are updated to `_treeToScreen(node.x, node.y)` in this same task.

- [ ] **Step 1: Store the usable width and use it in `_currentTree()`**

In `src/main/view/treeView.js`, add a field in the constructor:
```js
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
        this.hoveredStateId = null;
        this._usableWidth = 900; // corrected by the first real draw(usableWidth) call
    }
```
Change `_currentTree()` from:
```js
    _currentTree() {
        const startNode = this.viewModel.startNode;
        if (!startNode) return null;
        return TreeLayout.build(this.viewModel.graph, startNode.id, this.viewModel.treeExpanded, 4);
    }
```
to:
```js
    _currentTree() {
        const startNode = this.viewModel.startNode;
        if (!startNode) return null;
        return TreeLayout.build(this.viewModel.graph, startNode.id, this.viewModel.treeExpanded, 1, this._usableWidth);
    }
```

- [ ] **Step 2: Accept and store `usableWidth` in `draw()`**

Change:
```js
    draw() {
        const tree = this._currentTree();
        if (!tree) return;
```
to:
```js
    draw(usableWidth) {
        if (usableWidth) this._usableWidth = usableWidth;
        const tree = this._currentTree();
        if (!tree) return;
```
(The `if (usableWidth)` guard means an accidental no-arg call — e.g. from an old test script — keeps using whatever width was last set, rather than resetting to a wrong value.)

- [ ] **Step 3: Refactor `_treeToScreen` to take plain coordinates**

Change:
```js
    // Converts a tree-local (x, y) - as stored on TreeLayout nodes - into current screen
    // coordinates, applying the same anchor offset draw() uses plus the shared viewport pan/zoom.
    _treeToScreen(node) {
        const worldX = node.x + TREE_VIEW_ANCHOR_X;
        const worldY = node.y + TREE_VIEW_ANCHOR_Y;
        return this.viewModel.viewport.worldToScreen(worldX, worldY);
    }
```
to:
```js
    // Converts a tree-local (x, y) point into current screen coordinates, applying the same
    // anchor offset draw() uses plus the shared viewport pan/zoom. Takes plain coordinates (not a
    // TreeNode) so it can also convert badge-center / edge-midpoint points, not just node centers.
    _treeToScreen(x, y) {
        const worldX = x + TREE_VIEW_ANCHOR_X;
        const worldY = y + TREE_VIEW_ANCHOR_Y;
        return this.viewModel.viewport.worldToScreen(worldX, worldY);
    }
```
Then update the one existing call site, inside `_hitTest`:
```js
            const p = this._treeToScreen(node);
```
to:
```js
            const p = this._treeToScreen(node.x, node.y);
```

- [ ] **Step 4: Pass the real usable width from `mainView.js`**

In `src/main/view/mainView.js`, change:
```js
        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' && this.treeView) {
            this.treeView.draw();
        } else {
```
to:
```js
        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' && this.treeView) {
            this.treeView.draw(windowWidth - this.RIGHT_PANEL_WIDTH);
        } else {
```

- [ ] **Step 5: Verify in browser**

Reload the app (fresh page load so `main.js`'s real wiring is in effect). Build the same graph as Task 1's verification (or reuse it if the page is still loaded), set s₀, switch to Tree view. Confirm visually: the 3 default columns (s₀, its action, the resulting state) are spread across roughly the left, middle, and right thirds of the visible canvas area (not clustered close together at a fixed 110px spacing like before). Resize the browser window narrower/wider and switch away from and back to Tree view (or drag the right panel wider) — confirm the columns re-adjust to the new usable width on the next redraw. No console errors, both themes.

- [ ] **Step 6: Commit**

```bash
git add src/main/view/treeView.js src/main/view/mainView.js
git commit -m "Thread usable canvas width into TreeView, matching ExpectationView's draw(usableW) precedent"
```

---

### Task 3: Replace whole-node click-to-toggle with a +/− badge

**Files:**
- Modify: `src/main/view/treeView.js`
- Modify: `src/main/view/mainView.js` (the `mousePressed()` tree branch, added in v1 Task 5 and its follow-up fix — search for `hitTestNode`)

**Interfaces:**
- Removes: `TreeView.hitTestNode(screenX, screenY)` (renamed/replaced — its one caller in `mainView.js` is updated in this task).
- Adds: `TreeView.hitTestBadge(screenX, screenY) -> boolean` (public — same role `hitTestNode` played for `mainView.js`'s pan-vs-click decision, but checking against badges instead of whole node bodies).
- Adds: `TreeView._badgeCenter(node) -> {x, y}` (tree-local coordinates of a node's +/− badge, private).
- Changes: `TreeView.handleClick(screenX, screenY)` — now hit-tests against badges only (via a new private `_hitTestBadge`), not whole node bodies.
- Changes: `TreeView._drawNode(node)` — draws a small +/− badge on any node with `hasChildren === true`; the existing dashed-outline-when-collapsed styling is removed (the badge itself is now the sole visual cue).

- [ ] **Step 1: Add a badge-size constant and the `_badgeCenter` helper**

In `src/main/view/treeView.js`, add a new constant near the top, alongside the existing size constants:
```js
const TREE_VIEW_STATE_RADIUS = 24;
const TREE_VIEW_ACTION_HALF  = 16;
const TREE_VIEW_BADGE_RADIUS = 8;
```
Add a new method (place it near `_treeToScreen`, since it's coordinate-math like that method):
```js
    // Tree-local (x, y) of a node's +/- expand badge - bottom-right corner for both shapes, scaled
    // to each shape's own size so the badge always sits just outside the node's own boundary.
    _badgeCenter(node) {
        if (node.kind === 'state') {
            const off = TREE_VIEW_STATE_RADIUS * 0.75;
            return { x: node.x + off, y: node.y + off };
        }
        return { x: node.x + TREE_VIEW_ACTION_HALF, y: node.y + TREE_VIEW_ACTION_HALF };
    }
```

- [ ] **Step 2: Add `_hitTestBadge` (private) and `hitTestBadge` (public)**

Add these two methods near the existing `_hitTest`/`hitTestNode`:
```js
    // Returns the TreeNode whose +/- badge contains (screenX, screenY), or null. Only nodes with
    // hasChildren === true have a badge at all (terminal nodes get none).
    _hitTestBadge(screenX, screenY) {
        const tree = this._currentTree();
        if (!tree) return null;
        const zoom = this.viewModel.viewport.zoom;
        const badgeRadius = TREE_VIEW_BADGE_RADIUS * zoom;
        let hit = null;
        TreeLayout.forEach(tree, node => {
            if (!node.hasChildren) return;
            const center = this._badgeCenter(node);
            const p = this._treeToScreen(center.x, center.y);
            const dx = screenX - p.x, dy = screenY - p.y;
            if (dx * dx + dy * dy <= badgeRadius * badgeRadius) hit = node;
        });
        return hit;
    }

    // Public: whether (screenX, screenY) hits a node's expand/collapse badge - lets callers
    // (mainView.js) distinguish "clicked a badge" from "clicked empty tree-canvas space or a
    // node's plain body" without reaching into the private _hitTestBadge() directly.
    hitTestBadge(screenX, screenY) {
        return this._hitTestBadge(screenX, screenY) !== null;
    }
```
Remove the old `hitTestNode` method entirely (its one caller is updated in Step 4 below) - it hit-tested whole node bodies, which is no longer the click-to-toggle target.

- [ ] **Step 3: Update `handleClick` to use the badge hit-test**

Change:
```js
    // Public entry point for mainView.js's mousePressed(). Toggles expansion if the click hit a
    // node with real children (collapsed or already-expanded); no-ops on terminal nodes or empty
    // space. Always returns true so the caller knows Tree view fully owns this click.
    handleClick(screenX, screenY) {
        const node = this._hitTest(screenX, screenY);
        if (node && node.hasChildren) {
            this.viewModel.graph && this._toggle(node.pathId);
        }
        return true;
    }
```
to:
```js
    // Public entry point for mainView.js's mousePressed(). Toggles expansion if the click hit a
    // node's +/- badge (the ONLY way to toggle now - clicking a node's plain body does nothing).
    // Always returns true so the caller knows Tree view fully owns this click.
    handleClick(screenX, screenY) {
        const node = this._hitTestBadge(screenX, screenY);
        if (node) {
            this._toggle(node.pathId);
        }
        return true;
    }
```

- [ ] **Step 4: Update `mainView.js`'s pan-vs-click decision to use `hitTestBadge`**

In `src/main/view/mainView.js`, find the tree branch in `mousePressed()` (added in v1's Task 5 + follow-up fix, currently calling `this.treeView.hitTestNode(mouseX, mouseY)`). Change every reference from `hitTestNode` to `hitTestBadge`:
```js
        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' &&
            this.treeView && mouseButton !== RIGHT) {
            if (this.topBar) {
                this.topBar.closeAllDropdowns();
            }
            if (this.treeView.hitTestBadge(mouseX, mouseY)) {
                this.treeView.handleClick(mouseX, mouseY);
                redraw();
            } else {
                this.viewModel.viewport.isPanning = true;
                this.viewModel.viewport.panStartX = mouseX;
                this.viewModel.viewport.panStartY = mouseY;
                this.viewModel.viewport.panStartOffsetX = this.viewModel.viewport.panX;
                this.viewModel.viewport.panStartOffsetY = this.viewModel.viewport.panY;
                cursor('grab');
            }
            return;
        }
```
(Read the actual current code first to confirm the exact surrounding lines/field names before editing — this should match what v1's Task 5 fix already put there, just renaming the one method call.)

- [ ] **Step 5: Draw the +/− badge, remove the dashed-outline cue**

In `_drawNode`, remove the dashed-outline block:
```js
        // Collapsed-but-expandable nodes (real children exist but aren't shown, per the depth
        // cap) get a dashed outline instead of solid, as a cheap visual cue that clicking reveals
        // more of the tree - otherwise they look identical to true terminal nodes. Reuses the same
        // drawingContext.setLineDash() pattern valueIterationView.js already uses for its own
        // dashed partial-observability node strokes.
        if (node.isCollapsed) drawingContext.setLineDash([4, 3]);
```
and its matching reset line:
```js
        if (node.isCollapsed) drawingContext.setLineDash([]);
```
— the node's own stroke is now always solid, regardless of collapsed state. Then, at the end of `_drawNode` (after the existing `pop()` that closes the node-body drawing, but still inside the method), add the badge itself:
```js
        if (node.hasChildren) {
            const center = this._badgeCenter(node);
            push();
            fill(AppPalette.accent.cyan);
            stroke(ColorUtils.contrastText(AppPalette.accent.cyan));
            strokeWeight(1);
            circle(center.x, center.y, TREE_VIEW_BADGE_RADIUS * 2);
            noStroke();
            fill(ColorUtils.contrastText(AppPalette.accent.cyan));
            textAlign(CENTER, CENTER);
            textSize(11);
            textFont(Typography.sans());
            text(node.isCollapsed ? '+' : '−', center.x, center.y - 0.5);
            pop();
        }
```
(The `- 0.5` on the text's y-position is a small optical nudge some fonts need for a `+`/`−` glyph to look vertically centered in a small circle — adjust or remove if it looks off in your own verification pass.)

- [ ] **Step 6: Verify in browser**

Using the graph from Task 1/2's verification (deep enough to have a genuinely collapsed node), switch to Tree view. Confirm: nodes with real children show a small cyan circular badge at their bottom-right corner, with "+" on collapsed ones and "−" on the always-expanded root/action columns (0-2, since those are within the default depth-1 cap and start expanded, so they should show "−"). Click a badge: confirm it toggles (children appear/disappear, glyph flips). Click the SAME node's plain body (away from the badge): confirm nothing happens. Click completely empty canvas space and drag: confirm the tree pans (this exercises the `hitTestBadge`-vs-pan branch in `mainView.js`). Confirm terminal nodes (no real children) show no badge at all. No console errors, both themes.

- [ ] **Step 7: Commit**

```bash
git add src/main/view/treeView.js src/main/view/mainView.js
git commit -m "Replace whole-node click-to-toggle with a +/- expand badge"
```

---

### Task 4: Outcome edges — reward color + probability width, hover tooltip

**Files:**
- Modify: `src/main/view/treeView.js`
- Modify: `src/main/view/mainView.js` (the `mouseMoved()` tree branch — search for `handleMouseMove`)

**Interfaces:**
- Changes: `TreeView._drawEdge(parent, child)` — outcome edges (child.kind === 'state') drop their text label, gain reward-sign color and probability-proportional width; state→action edges (child.kind === 'action') are unchanged.
- Adds: `TreeView._distanceToSegment(px, py, x1, y1, x2, y2) -> number` (private, pure geometry helper).
- Adds: `TreeView._hitTestEdge(screenX, screenY) -> {stateNode, actionNode, childStateNode} | null` (private).
- Changes: `TreeView.handleMouseMove(screenX, screenY)` — now also checks for edge-hover (only when no node is hovered — the two are mutually exclusive) and tracks `this.hoveredEdge`.
- Adds: `TreeView._drawEdgeHoverTooltip()` (private, called from `draw()` alongside the existing `_drawHoverBadge`).

- [ ] **Step 1: Restyle outcome edges (no label, reward color, probability width)**

Read `_drawEdge` in full first, then replace it entirely:
```js
    _drawEdge(parent, child) {
        const isOutcomeEdge = child.kind === 'state' && child.incomingProbability !== undefined;

        push();
        if (isOutcomeEdge) {
            // Reward-sign color + probability-proportional width, reusing this app's EXISTING
            // Action->State edge-width formula (1 + 4*probability, from mainView.js's own graph
            // rendering) rather than inventing a new one - no default text label anymore, the
            // precise P(s'|s,a) value is revealed on hover instead (_drawEdgeHoverTooltip).
            const rewardColor = child.incomingReward >= 0 ? AppPalette.reward.positive : AppPalette.reward.negative;
            stroke(rewardColor);
            strokeWeight(1 + 4 * child.incomingProbability);
        } else {
            stroke(AppPalette.edge.default);
            strokeWeight(1.5);
        }
        line(parent.x, parent.y, child.x, child.y);
        pop();
    }
```
(This removes the entire old label-drawing block — the `pStr`/`rStr`/`textWidth` code — since outcome edges no longer show a default label at all.)

- [ ] **Step 2: Add the point-to-segment distance helper**

Add this method anywhere in the class (e.g. right before `_hitTest`):
```js
    // Shortest distance from point (px, py) to the line segment (x1,y1)-(x2,y2). Standard
    // projection-and-clamp formula.
    _distanceToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * dx, projY = y1 + t * dy;
        return Math.hypot(px - projX, py - projY);
    }
```

- [ ] **Step 3: Add `_hitTestEdge`**

Add this method near `_hitTestBadge`:
```js
    // Returns {stateNode, actionNode, childStateNode} for the outcome edge nearest (screenX,
    // screenY), if within TREE_VIEW_EDGE_HOVER_PX screen pixels - or null. Only outcome edges
    // (action -> state) are hoverable; state -> action edges have no probability to show.
    // Walks state/action pairs explicitly (rather than TreeLayout.forEach's generic node-at-a-time
    // traversal) because the tooltip needs the ORIGINATING state's name (the action's parent),
    // which a single node object doesn't carry a reference to.
    _hitTestEdge(screenX, screenY) {
        const tree = this._currentTree();
        if (!tree) return null;
        let hit = null;
        let bestDist = TREE_VIEW_EDGE_HOVER_PX;
        const walk = (stateNode) => {
            stateNode.children.forEach(actionNode => {
                const p1 = this._treeToScreen(actionNode.x, actionNode.y);
                actionNode.children.forEach(childStateNode => {
                    const p2 = this._treeToScreen(childStateNode.x, childStateNode.y);
                    const d = this._distanceToSegment(screenX, screenY, p1.x, p1.y, p2.x, p2.y);
                    if (d <= bestDist) {
                        bestDist = d;
                        hit = { stateNode, actionNode, childStateNode };
                    }
                    walk(childStateNode);
                });
            });
        };
        walk(tree);
        return hit;
    }
```
Add the new constant near the other size constants at the top of the file:
```js
const TREE_VIEW_EDGE_HOVER_PX = 6; // screen-pixel hover tolerance for edge hit-testing
```

- [ ] **Step 4: Update `handleMouseMove` to also track edge-hover**

Change:
```js
    // Public entry point for mainView.js's mouseMoved(). Returns true if the hovered state
    // changed (caller should redraw), following ExpectationView.handleMouseMove's convention.
    handleMouseMove(screenX, screenY) {
        const node = this._hitTest(screenX, screenY);
        const newHoveredStateId = (node && node.kind === 'state') ? node.stateId : null;
        const changed = newHoveredStateId !== this.hoveredStateId;
        this.hoveredStateId = newHoveredStateId;
        return changed;
    }
```
to:
```js
    // Public entry point for mainView.js's mouseMoved(). Returns true if either hover target
    // changed (caller should redraw), following ExpectationView.handleMouseMove's convention.
    // Node-hover (repeated-state ring + badge) and edge-hover (P(s'|s,a) tooltip) are mutually
    // exclusive per mouse position - edge-hover is only checked when no node is under the cursor.
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
Initialize the two new fields in the constructor, alongside `hoveredStateId`:
```js
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
        this.hoveredStateId = null;
        this.hoveredEdge = null;
        this._hoveredEdgeKey = null;
        this._usableWidth = 900;
    }
```

- [ ] **Step 5: Draw the tooltip**

Add a new method:
```js
    // "P(s' | s, a) = 0.XX" tooltip near the hovered outcome edge's midpoint, using real node
    // names. Drawn as part of the pannable content (inside draw()'s translate block, alongside
    // _drawHoverBadge) so it tracks the edge correctly when panning/zooming, unlike the
    // screen-fixed elements in drawChrome().
    _drawEdgeHoverTooltip() {
        if (!this.hoveredEdge) return;
        const { stateNode, actionNode, childStateNode } = this.hoveredEdge;
        const midX = (actionNode.x + childStateNode.x) / 2;
        const midY = (actionNode.y + childStateNode.y) / 2;
        const label = `P(${childStateNode.name} | ${stateNode.name}, ${actionNode.name}) = ${childStateNode.incomingProbability.toFixed(2)}`;

        push();
        textAlign(CENTER, CENTER);
        textSize(10);
        textFont(Typography.mono());
        const padding = 4;
        const labelW = textWidth(label);
        noStroke();
        fill(ColorUtils.applyAlpha(AppPalette.text.medium, 235));
        rect(midX - labelW / 2 - padding, midY - 8 - 7, labelW + padding * 2, 16, 4);
        fill(ColorUtils.contrastText(AppPalette.text.medium));
        text(label, midX, midY - 8);
        pop();
    }
```
Call it from `draw()`, right after the existing `this._drawHoverBadge(tree);` line, still inside the same `push()/translate()/pop()` block:
```js
        // Nodes second.
        TreeLayout.forEach(tree, node => this._drawNode(node));
        this._drawHoverBadge(tree);
        this._drawEdgeHoverTooltip();

        pop();
```

- [ ] **Step 6: Route `mouseMoved()` — confirm no change needed, verify it already calls `handleMouseMove`**

Read `src/main/view/mainView.js`'s `mouseMoved()` tree branch (added in v1 Task 6) — it should already call `this.treeView.handleMouseMove(mouseX, mouseY)` and `redraw()` on change. No code change should be needed here since `handleMouseMove`'s signature/return contract is unchanged (still `(screenX, screenY) -> boolean`) — this step is a read-and-confirm, not an edit. If you find the existing code doesn't already do this, stop and report rather than guessing.

- [ ] **Step 7: Verify in browser**

Using a graph with mixed positive/negative-reward outcomes and varied probabilities (e.g. one action with a 0.9/+5 outcome and a 0.1/-3 outcome), switch to Tree view. Confirm: outcome edges show NO text label by default; the 0.9-probability edge is visibly thicker than the 0.1 one; positive-reward edges are green, negative-reward edges are red. Hover directly over an outcome edge (not near either endpoint node): confirm a `P(s' | s, a) = 0.XX` tooltip appears with correct real names/probability; move the mouse off: confirm it disappears. Hover a node instead: confirm the existing repeated-state ring/badge (v1 Task 6) still works and the edge tooltip does NOT also show at the same time. Confirm state→action edges are still plain gray, no label, no hover behavior. No console errors, both themes.

- [ ] **Step 8: Commit**

```bash
git add src/main/view/treeView.js
git commit -m "Outcome edges: reward color + probability width, hover P(s'|s,a) tooltip"
```

---

### Task 5: Final integration pass

**Files:** none new; verification-only, touching no source files unless a regression is found (fix it in the file where the bug lives, note the fix in the commit message).

**Interfaces:** none new.

- [ ] **Step 1: Full regression pass**

Build a reasonably branchy graph (at least one state with 2+ actions, at least one action with 2+ probabilistic outcomes of mixed reward sign, at least one outcome state itself having further actions so there's something to expand). Set s₀. Run through:
1. Switch to Tree view: confirm exactly 3 columns by default, thirds-partitioned.
2. Expand via a badge: confirm a 4th+ column appears using fixed spacing (not re-partitioned), badge flips to "−".
3. Collapse it again via the badge: confirm it re-collapses, badge flips back to "+".
4. Hover a repeated state (if your test graph has a cycle) and a hovered edge, confirming both work independently and don't visually conflict.
5. Drag-pan on empty space; zoom via the zoom pill and mouse wheel; confirm badges/edges/tooltips all stay correctly aligned post-zoom (click a badge after zooming to confirm the badge hit-test is still zoom-scaled correctly).
6. Right-click a different state in Graph view to re-root; switch to Tree: confirm it resets to the fresh 3-column thirds view.
7. Switch to Policy mode: confirm the pill/tree view work identically there. Switch to Values mode: confirm the Build/Policy pill is absent and Learning Iteration's own separate Graph|Tree toggle is unaffected.
8. Confirm a `test_schema/*.json` import/export round-trip still excludes `buildCanvasView`/`treeExpanded` from the serialized JSON (unchanged from v1, but worth re-confirming after this round of edits touched the same files).
9. No console errors anywhere in this pass, both light and dark theme.

- [ ] **Step 2: Update the v1 spec's now-stale verification references, if any**

Skim `docs/superpowers/specs/2026-07-11-build-tree-view-design.md`'s own "Rendering" and "Verification" sections — they describe the v1 behavior (depth-4 default, dashed-outline collapse cue, always-visible edge label) that v2 supersedes. Do NOT rewrite that document (it's a historical record of what v1 shipped and why) — instead confirm `docs/superpowers/specs/2026-07-12-build-tree-view-v2-design.md` (already written and approved) correctly supersedes it, and that's sufficient; no edit needed to the v1 doc itself.

- [ ] **Step 3: Commit (only if Step 1 surfaced a fix)**

If the regression pass required any code fix, it should already be committed with its own descriptive message before this point. If nothing needed fixing, no commit is needed for this task.

---

## Self-Review Notes

- **Spec coverage:** every change in `docs/superpowers/specs/2026-07-12-build-tree-view-v2-design.md`'s "What's Changing" section (1-4) maps to a task: depth/layout → Task 1, width-threading → Task 2, badge → Task 3, edge styling/hover → Task 4. Non-goals (state→action edges unchanged, no re-partition on expand, no new node-creation, v1 node-hover unaffected) are explicitly preserved/verified in Tasks 3-5.
- **Placeholder scan:** no TBD/TODO; every step has complete, concrete code or a concrete verification script.
- **Type/name consistency:** `TreeLayout.build`'s new signature (`defaultDepth = 1, usableWidth = 900`) is used identically by `TreeView._currentTree()` (Task 2) and the Task 1 verification script. `_treeToScreen(x, y)`'s new signature (was `(node)`) is used consistently by `_hitTest` (updated in Task 2), `_hitTestBadge` (Task 3), and `_hitTestEdge` (Task 4) — no stray `_treeToScreen(node)` calls remain anywhere after Task 2. `hitTestNode` is fully removed and replaced by `hitTestBadge` everywhere (both the class definition and its one `mainView.js` caller) in Task 3 — no dangling reference to the old name.
