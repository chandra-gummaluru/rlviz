# Build/Policy "Graph | Tree" MDP Unroll View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating "Graph | Tree" pill to Build and Policy mode that swaps the canvas into a left-to-right unrolled search tree of the current MDP, rooted at the start node (s₀), with click-to-expand/collapse and hover-highlight of repeated states.

**Architecture:** A pure-JS layout helper (`TreeLayout`) turns the existing `Graph` domain object into a positioned, pathId-keyed tree structure on demand (no caching — recomputed each draw, same pattern other views in this codebase already use). A new view (`TreeView`) draws that structure and owns its own hit-testing (tree coordinates are synthetic, not the graph's real node positions, so `GeometricHelper`'s real-graph hit-testing does not apply here). A new pill (`TreeViewPill`) toggles between Graph and Tree, modeled directly on the existing `LearningTreeTogglePill`. Two small pieces of presentation-only state (`buildCanvasView`, `treeExpanded`) live on `CanvasViewModel`, following the exact pattern already established by `learningIterationCanvasView`.

**Tech Stack:** Vanilla JS, p5.js canvas rendering, no build step, no test framework (per `CLAUDE.md` — verification throughout this plan is manual/headless-browser, not unit tests).

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-07-11-build-tree-view-design.md` — every task below implements one part of it; read it once before starting Task 1.
- Tree view's root is the **existing** `viewModel.startNode` (s₀) — no new "initial state" concept, no new gesture. Right-click (already implemented) and the right panel's s₀ dropdown (already implemented) are the only ways to change it.
- Do **not** change the existing solid 3px amber start-node ring in Graph view.
- Do **not** add auto-default-start-node-on-creation behavior.
- Pill and Tree view are available in **both Build and Policy** mode (gate on `_isEditableMode()` / `mode === 'build' || mode === 'policy'`), not Values mode.
- `buildCanvasView` and `treeExpanded` are presentation-only — never read or written by `Graph.serialize()`/`deserialize()` (`src/main/domain/graphObj.js`).
- All colors via existing `AppPalette` tokens / `var(--...)` CSS custom properties — no hardcoded hex at any call site (this codebase's established rule, see `CLAUDE.md`'s Theming section).
- No automated test suite exists. Every task's verification step is a concrete manual/headless-browser check (`python3 -m http.server 8010` from the repo root + `playwright-core` if available), not a unit test. Check both light and dark theme where a task touches rendering.

---

### Task 1: Viewmodel/controller state — `buildCanvasView`, `treeExpanded`, reset-on-reroot

**Files:**
- Modify: `src/main/adapter/viewmodel/CanvasViewModel.js:50-57` (constructor, right after the existing `learningIterationCanvasView` field)
- Modify: `src/main/adapter/controller/CanvasController.js:679-681` (`setStartNode`), and near `src/main/adapter/controller/CanvasController.js:581-583` (`setLearningIterationCanvasView`, add a sibling method after it)

**Interfaces:**
- Produces: `canvasViewModel.buildCanvasView` (`'graph' | 'tree'`, default `'graph'`), `canvasViewModel.treeExpanded` (a `Set<string>` of pathIds), `canvasController.setBuildCanvasView(view)`, `canvasController.toggleTreeNodeExpanded(pathId)`. Later tasks (2-6) read/write these exact names.

- [ ] **Step 1: Add the two new fields to `CanvasViewModel`'s constructor**

In `src/main/adapter/viewmodel/CanvasViewModel.js`, immediately after the existing block:
```js
        // Learning Iteration (unknown:full quadrant) canvas view: 'graph' (flat MDP) or 'tree'
        // (episode search tree). Presentation-tier only, toggled by the floating Graph|Tree pill.
        this.learningIterationCanvasView = 'graph';
```
add:
```js

        // Build/Policy canvas view: 'graph' (normal editor) or 'tree' (the MDP unrolled into a
        // left-to-right search tree rooted at startNode). Presentation-tier only, toggled by the
        // floating Graph|Tree pill (Build/Policy only - unrelated to learningIterationCanvasView
        // above, which is Values -> Learning Iteration's own, separate Graph|Tree toggle).
        this.buildCanvasView = 'graph';

        // Set<pathId> of tree nodes the user has manually expanded beyond the default depth cap.
        // pathId format: "s0.a0.1" (state root, then alternating .a<actionIndex>/.<outcomeIndex>
        // segments) - a state can recur at multiple tree positions, so expansion is keyed by tree
        // position, not state id. Cleared whenever startNode changes (see setStartNode below).
        this.treeExpanded = new Set();
```

- [ ] **Step 2: Reset `treeExpanded` whenever the start node changes**

In `src/main/adapter/controller/CanvasController.js`, replace:
```js
    setStartNode(node) {
        this.viewModel.startNode = node;
    }
```
with:
```js
    setStartNode(node) {
        this.viewModel.startNode = node;
        // Re-rooting invalidates all prior tree-position expansion state (a pathId like
        // "s0.a0.1" is meaningless once the root itself changes).
        this.viewModel.treeExpanded.clear();
    }
```

- [ ] **Step 3: Add `setBuildCanvasView` and `toggleTreeNodeExpanded` controller methods**

In `src/main/adapter/controller/CanvasController.js`, immediately after the existing:
```js
    setLearningIterationCanvasView(view) {
        this.viewModel.learningIterationCanvasView = view === 'tree' ? 'tree' : 'graph';
    }
```
add:
```js

    setBuildCanvasView(view) {
        this.viewModel.buildCanvasView = view === 'tree' ? 'tree' : 'graph';
    }

    // Toggles one tree position's expansion (expand if collapsed, collapse if expanded).
    toggleTreeNodeExpanded(pathId) {
        const expanded = this.viewModel.treeExpanded;
        if (expanded.has(pathId)) {
            expanded.delete(pathId);
        } else {
            expanded.add(pathId);
        }
    }
```

- [ ] **Step 4: Verify in browser**

Start a local server (`python3 -m http.server 8010` from the repo root; check if one is already running on that port first) and load `http://localhost:8010/index.html`. Open the browser console (or drive headlessly with `playwright-core` if available) and run:
```js
canvasViewModel.buildCanvasView            // 'graph'
canvasViewModel.treeExpanded               // Set {}
canvasController.setBuildCanvasView('tree');
canvasViewModel.buildCanvasView            // 'tree'
canvasController.toggleTreeNodeExpanded('s0.a0.0');
canvasViewModel.treeExpanded.has('s0.a0.0') // true
canvasController.toggleTreeNodeExpanded('s0.a0.0');
canvasViewModel.treeExpanded.has('s0.a0.0') // false
// build a state, set it as start node via the real interactor, confirm treeExpanded clears:
canvasController.interactors.createNode.execute(new CreateNodeInputData('state', 300, 300));
const s0 = canvasViewModel.graph.nodes[canvasViewModel.graph.nodes.length - 1];
canvasController.toggleTreeNodeExpanded('s0.a0.0');
canvasController.setStartNode(s0);
canvasViewModel.treeExpanded.size           // 0
```
Expected: every line matches the comment. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/adapter/viewmodel/CanvasViewModel.js src/main/adapter/controller/CanvasController.js
git commit -m "Add buildCanvasView/treeExpanded state for the Build/Policy tree view"
```

---

### Task 2: `TreeLayout` — pure-JS MDP-unroll + left-to-right positioning

**Files:**
- Create: `src/main/view/helpers/TreeLayout.js`
- Modify: `index.html:261` (add script tag right after `RolloutFormatter.js`)

**Interfaces:**
- Consumes: a `Graph` instance (`graph.getNodeById(id)`, `node.actions` for states, `node.sas` for actions — see `src/main/domain/graphObj.js`/`stateNodes.js`/`actionNodes.js`), a start state id, and `canvasViewModel.treeExpanded` (a `Set<string>`).
- Produces: `TreeLayout.build(graph, startStateId, expandedSet, defaultDepth) -> TreeNode | null` and `TreeLayout.forEach(treeNode, fn)`, where a `TreeNode` is:
  ```
  {
    kind: 'state' | 'action',
    pathId: string,                 // e.g. "s0", "s0.a0", "s0.a0.0"
    stateId: number | null,         // set when kind === 'state'
    actionId: number | null,        // set when kind === 'action'
    name: string,
    stateDepth: number,             // counts STATE hops only (actions inherit their parent state's depth)
    hasChildren: boolean,           // true if the underlying graph entity has real children
    isCollapsed: boolean,           // hasChildren && children.length === 0 (collapsed, not terminal)
    incomingProbability: number | undefined,  // set on state nodes reached via a transition
    incomingReward: number | undefined,       // set on state nodes reached via a transition
    children: TreeNode[],
    x: number, y: number            // tree-local coordinates, root at (0, 0)
  }
  ```
  Later tasks (3, 5, 6) consume this shape directly — the field names above are exact and must not drift.

- [ ] **Step 1: Write `TreeLayout.js`**

```js
// Pure JS, no p5 calls - unrolls the domain Graph into a search tree rooted at a given state,
// bounded by a default depth cap unless a node's pathId is in the caller-supplied expandedSet.
// A state can legitimately appear at multiple tree positions (this is the feature's whole point,
// per the design spec) - node identity in the tree is the pathId, not the state id.
class TreeLayout {
    // graph: the domain Graph. startStateId: root state id (may be null/undefined - returns
    // null). expandedSet: Set<pathId> of nodes whose children should be shown beyond
    // defaultDepth. defaultDepth: state-hop depth cap for the default (unexpanded) render.
    static build(graph, startStateId, expandedSet, defaultDepth = 4) {
        if (!startStateId || !graph) return null;
        const startNode = graph.getNodeById(startStateId);
        if (!startNode) return null;

        const buildState = (stateId, pathId, stateDepth) => {
            const stateNode = graph.getNodeById(stateId);
            const name = stateNode ? stateNode.name : `S${stateId}`;
            const actions = (stateNode && stateNode.actions) ? stateNode.actions : [];
            const node = {
                kind: 'state', pathId, stateId, actionId: null, name,
                stateDepth, hasChildren: actions.length > 0, isCollapsed: false,
                children: [], x: 0, y: 0
            };

            const withinDefault = stateDepth < defaultDepth;
            const manuallyExpanded = expandedSet.has(pathId);
            if (!node.hasChildren || !(withinDefault || manuallyExpanded)) {
                node.isCollapsed = node.hasChildren && node.children.length === 0;
                return node;
            }

            actions.forEach((actionId, ai) => {
                const actionPathId = `${pathId}.a${ai}`;
                const actionNode = graph.getNodeById(actionId);
                const aName = actionNode ? actionNode.name : `a${ai}`;
                const sas = (actionNode && actionNode.sas) ? actionNode.sas : [];
                const actionTreeNode = {
                    kind: 'action', pathId: actionPathId, stateId: null, actionId,
                    name: aName, stateDepth, hasChildren: sas.length > 0, isCollapsed: false,
                    children: [], x: 0, y: 0
                };

                const actionWithinDefault = stateDepth < defaultDepth;
                const actionManuallyExpanded = expandedSet.has(actionPathId);
                if (actionTreeNode.hasChildren && (actionWithinDefault || actionManuallyExpanded)) {
                    sas.forEach((transition, ti) => {
                        const childPathId = `${actionPathId}.${ti}`;
                        const childState = buildState(transition.nextState, childPathId, stateDepth + 1);
                        childState.incomingProbability = transition.probability;
                        childState.incomingReward = transition.reward;
                        actionTreeNode.children.push(childState);
                    });
                } else {
                    actionTreeNode.isCollapsed = actionTreeNode.hasChildren;
                }
                node.children.push(actionTreeNode);
            });
            node.isCollapsed = false; // state itself was expanded (has children now)
            return node;
        };

        const root = buildState(startStateId, 's0', 0);
        TreeLayout._assignPositions(root);
        return root;
    }

    // Leaves get sequential vertical slots in left-to-right traversal order; each internal node's
    // slot = mean of its children's slots (same "leaves first, average up" approach already used
    // by src/main/view/learningIterationView.js's _layoutTree, adapted for a left-to-right tree:
    // "level" here increments per node regardless of state/action - actions get their own column
    // between state columns - while stateDepth above only counts state hops, matching the spec's
    // "~4 state levels" depth-cap wording.
    static _assignPositions(root) {
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

        TreeLayout.forEach(root, node => {
            node.x = node._level * TreeLayout.LEVEL_SPACING;
            node.y = node._slot * TreeLayout.SLOT_SPACING;
        });
    }

    static forEach(node, fn) {
        if (!node) return;
        fn(node);
        node.children.forEach(c => TreeLayout.forEach(c, fn));
    }
}

TreeLayout.LEVEL_SPACING = 110; // horizontal gap between adjacent tree columns (state<->action)
TreeLayout.SLOT_SPACING  = 64;  // vertical gap between adjacent sibling leaves
```

- [ ] **Step 2: Register the script tag**

In `index.html`, change:
```html
    <script src="src/main/view/helpers/RolloutFormatter.js"></script>
```
to:
```html
    <script src="src/main/view/helpers/RolloutFormatter.js"></script>
    <script src="src/main/view/helpers/TreeLayout.js"></script>
```

- [ ] **Step 3: Verify in browser**

Start the local server if not already running, load the app, and in the console:
```js
// Build a small graph with a cycle so the "same state at multiple tree positions" case is real:
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
canvasController.createEdge(a0.id, s0.id, 0.3, -1);   // cycle back to s0
canvasController.createEdge(s1.id, a1.id);
canvasController.createEdge(a1.id, s0.id, 1.0, 2);    // s1 also leads back to s0
canvasController.setStartNode(s0);

const tree = TreeLayout.build(canvasViewModel.graph, s0.id, canvasViewModel.treeExpanded, 4);
tree.pathId                 // 's0'
tree.kind                   // 'state'
tree.children.length        // 1 (one action, a0)
tree.children[0].pathId     // 's0.a0'
tree.children[0].children.length // 2 (two outcomes: back to s0, and s1)
let count = 0;
TreeLayout.forEach(tree, n => { if (n.kind === 'state' && n.stateId === s0.id) count++; });
count                        // > 1 - s0 appears at multiple tree positions (root + at least one recurrence)
```
Expected: every line matches. No console errors. (This step is pure-data verification — no rendering yet, that's Task 3.)

- [ ] **Step 4: Commit**

```bash
git add src/main/view/helpers/TreeLayout.js index.html
git commit -m "Add TreeLayout: pure-JS MDP unroll + left-to-right tree positioning"
```

---

### Task 3: `TreeView` rendering — draw the tree, dispatch from `mainView.js`

**Files:**
- Create: `src/main/view/treeView.js`
- Modify: `src/main/view/mainView.js:171-201` (`draw()`, insert the Build/Policy tree-view branch)
- Modify: `index.html:275` (add script tag right after `learningIterationView.js`)

**Interfaces:**
- Consumes: `TreeLayout.build`/`TreeLayout.forEach` (Task 2), `canvasViewModel.graph`, `canvasViewModel.startNode`, `canvasViewModel.viewport` (for `worldToScreen`/pan/zoom — same object `mainView.js` already uses), `AppPalette.node.state`/`.action`, `AppPalette.reward.positive`/`.negative`, `AppPalette.text.*`, `ColorUtils`, `Typography`.
- Produces: `new TreeView(canvasViewModel)`, `treeView.draw()` (draws at the current pan/zoom, called from inside `mainView.js`'s existing `push()/translate()/scale()` block — does not manage its own transform). No click handling yet (Task 5) or hover (Task 6) — this task is render-only, so the tree is visible but static.

- [ ] **Step 1: Write `treeView.js` (render-only; layout + drawing, no interaction yet)**

```js
// Renders the Build/Policy "Tree" view: the MDP unrolled left-to-right from startNode, via
// TreeLayout. Draws inside mainView.js's existing pan/zoom transform - does not push/translate/
// scale itself. Click/hover interaction is added in later tasks (this file grows to own them).
const TREE_VIEW_STATE_RADIUS = 24;
const TREE_VIEW_ACTION_HALF  = 16;
const TREE_VIEW_ANCHOR_X     = 80;
const TREE_VIEW_ANCHOR_Y     = 80;

class TreeView {
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
    }

    // Builds the current tree (recomputed every draw - same "no cache" convention already used
    // by ExpectationViewModel.computeLayout() elsewhere in this codebase; MDP graphs in this app
    // are small enough that this is cheap).
    _currentTree() {
        const startNode = this.viewModel.startNode;
        if (!startNode) return null;
        return TreeLayout.build(this.viewModel.graph, startNode.id, this.viewModel.treeExpanded, 4);
    }

    draw() {
        const tree = this._currentTree();
        if (!tree) {
            this._drawEmptyPrompt();
            return;
        }

        push();
        translate(TREE_VIEW_ANCHOR_X, TREE_VIEW_ANCHOR_Y);

        // Edges first (so nodes draw on top of their own incoming edge).
        TreeLayout.forEach(tree, node => {
            node.children.forEach(child => this._drawEdge(node, child));
        });
        // Nodes second.
        TreeLayout.forEach(tree, node => this._drawNode(node));

        pop();

        this._drawFooterCaption();
    }

    _drawEmptyPrompt() {
        push();
        fill(AppPalette.text.muted);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(14);
        textFont(Typography.sans());
        text('Right-click a state to set the start node (s₀) first.', width / 2, height / 2);
        pop();
    }

    _drawEdge(parent, child) {
        push();
        stroke(AppPalette.edge.default);
        strokeWeight(1.5);
        line(parent.x, parent.y, child.x, child.y);
        pop();

        // Outcome edges (action -> state) carry a "p 0.8 . +5" label; plain state->action edges
        // (child.kind === 'action') don't have a probability/reward to show.
        if (child.kind === 'state' && child.incomingProbability !== undefined) {
            const midX = (parent.x + child.x) / 2;
            const midY = (parent.y + child.y) / 2;
            push();
            textAlign(CENTER, CENTER);
            textSize(9);
            textFont(Typography.mono());
            noStroke();
            const pStr = `p ${child.incomingProbability.toFixed(2).replace(/0+$/, '').replace(/\.$/, '.0')} · `;
            const rewardColor = child.incomingReward >= 0 ? AppPalette.reward.positive : AppPalette.reward.negative;
            const rStr = (child.incomingReward >= 0 ? '+' : '') + child.incomingReward.toFixed(0);
            const pWidth = textWidth(pStr);
            fill(AppPalette.text.muted);
            text(pStr, midX - pWidth / 2, midY - 8);
            fill(rewardColor);
            text(rStr, midX - pWidth / 2 + pWidth + textWidth(rStr) / 2, midY - 8);
            pop();
        }
    }

    _drawNode(node) {
        push();
        if (node.kind === 'state') {
            fill(ColorUtils.applyAlpha(AppPalette.node.state, 220));
            stroke(AppPalette.text.medium);
            strokeWeight(2);
            circle(node.x, node.y, TREE_VIEW_STATE_RADIUS * 2);
        } else {
            fill(ColorUtils.applyAlpha(AppPalette.node.action, 220));
            stroke(AppPalette.text.medium);
            strokeWeight(2);
            rect(node.x - TREE_VIEW_ACTION_HALF, node.y - TREE_VIEW_ACTION_HALF,
                TREE_VIEW_ACTION_HALF * 2, TREE_VIEW_ACTION_HALF * 2, 6);
        }
        noStroke();
        fill(ColorUtils.contrastText(node.kind === 'state' ? AppPalette.node.state : AppPalette.node.action));
        textAlign(CENTER, CENTER);
        textSize(10);
        textFont(Typography.sans());
        text(node.name, node.x, node.y);
        pop();
    }

    _drawFooterCaption() {
        push();
        fill(AppPalette.text.muted);
        noStroke();
        textAlign(LEFT, BOTTOM);
        textSize(10);
        textFont(Typography.mono());
        text('the MDP unrolled from S₀ (initial state) · circles = states · squares = actions',
            16, height - 12);
        pop();
    }
}
```

- [ ] **Step 2: Dispatch from `mainView.js`'s `draw()`**

In `src/main/view/mainView.js`, the `draw()` method currently goes straight from the `mode === 'values'` early-return into the Build/Policy rendering block:
```js
        // Apply zoom and pan transformations
        push();
        translate(this.viewModel.viewport.panX, this.viewModel.viewport.panY);
        scale(this.viewModel.viewport.zoom);

        this.drawEdges();
        this.drawNodes();
        this.drawTextLabels();
```
Change it to branch on `buildCanvasView` when in an editable mode:
```js
        // Apply zoom and pan transformations
        push();
        translate(this.viewModel.viewport.panX, this.viewModel.viewport.panY);
        scale(this.viewModel.viewport.zoom);

        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' && this.treeView) {
            this.treeView.draw();
        } else {
            this.drawEdges();
            this.drawNodes();
            this.drawTextLabels();
        }
```
(Everything below this block — spinning arrow, travel ball, `pop()`, messages, right-panel refresh — stays exactly as-is; Tree view intentionally skips the simulation-animation overlays, which don't apply to a static tree.)

- [ ] **Step 3: Register the script tag and wire `mainView.treeView` (temporary direct construction — full lifecycle/pill wiring is Task 4)**

In `index.html`, change:
```html
    <script src="src/main/view/learningIterationView.js"></script>
```
to:
```html
    <script src="src/main/view/learningIterationView.js"></script>
    <script src="src/main/view/treeView.js"></script>
```

This task does not yet wire `mainView.treeView` in `main.js` (that happens naturally as part of Task 4's pill wiring, which needs to set `mainView.treeView` anyway to hook up its callback). For this task's own verification, construct it directly from the console instead of editing `main.js` twice.

- [ ] **Step 4: Verify in browser**

```js
mainView.treeView = new TreeView(canvasViewModel);   // stand-in for Task 4's real wiring
// Reuse the graph built in Task 2's verification step (s0/a0/s1/a1 with a cycle), or rebuild it.
canvasController.setBuildCanvasView('tree');
redraw();
```
Take a screenshot (or visually confirm if driving a real browser) and confirm: a left-to-right tree appears (not the normal graph), rooted at s0 (a circle), with a0 (a rounded square) as its child, edges labeled `p 0.70 · +5` / `p 0.30 · -1` in the right colors (green for +5, red for -1), s0 appearing again as a', further along (since it's a cycle target), and the footer caption at the bottom-left. Switch back:
```js
canvasController.setBuildCanvasView('graph');
redraw();
```
Confirm the normal editable graph reappears unchanged. Check both light and dark theme (`AppPalette.setTheme('dark')` / `'light'`). No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/view/treeView.js src/main/view/mainView.js index.html
git commit -m "Add TreeView rendering, dispatched from Build/Policy draw()"
```

---

### Task 4: `TreeViewPill` + `main.js` wiring/lifecycle hooks

**Files:**
- Create: `src/main/view/treeViewPill.js`
- Modify: `style.css` (new `.tree-view-pill*` rules, mirroring `.learning-tree-pill*` at `style.css:1809-1853`)
- Modify: `src/main/app/main.js` (construct the pill + `TreeView`, wire lifecycle hooks)
- Modify: `index.html:269` (add script tag right after `learningTreeTogglePill.js`)

**Interfaces:**
- Consumes: `TreeView` (Task 3), `canvasController.setBuildCanvasView` (Task 1).
- Produces: `mainView.treeView` (a real `TreeView` instance, replacing Task 3's console stand-in), `mainView.treeViewPill`, both shown/hidden via the mode-lifecycle hook table exactly like `toolPalette`/`zoomPill` already are.

- [ ] **Step 1: Write `treeViewPill.js`**

```js
// Floating, top-right Build/Policy control: a [Graph | Tree] segmented switch for
// canvasViewModel.buildCanvasView. Modeled directly on LearningTreeTogglePill (same DOM/CSS
// skeleton, same two-option shape) - kept as a SEPARATE file/class rather than a shared
// parameterized component: different gate (_isEditableMode() vs. the unknown:full quadrant),
// different backing state (buildCanvasView vs. learningIterationCanvasView), and the two pills
// can never be visible at the same time (Build/Policy vs. Values -> Learning Iteration), so
// sharing would add indirection without real benefit.
const TREE_VIEW_PILL_OPTIONS = [
    { key: 'graph', label: 'Graph' },
    { key: 'tree',  label: 'Tree' }
];

class TreeViewPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        this._topOffset = topOffset + 12;

        const container = document.createElement('div');
        container.className = 'tree-view-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const label = document.createElement('span');
        label.className = 'tree-view-pill-label';
        label.textContent = 'view';
        container.appendChild(label);

        const track = document.createElement('div');
        track.className = 'tree-view-pill-track';
        container.appendChild(track);

        TREE_VIEW_PILL_OPTIONS.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tree-view-pill-btn';
            btn.textContent = opt.label;
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (this.callbacks.onSelectView) this.callbacks.onSelectView(opt.key);
            });
            track.appendChild(btn);
            this.buttons[opt.key] = btn;
        });

        this.refresh();
    }

    // x, width: the canvas region (same bounds convention as every other floating pill in this
    // codebase) - right-edge anchored.
    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        this.containerEl.style.left = (this._bounds.x + this._bounds.width - 12) + 'px';
        this.containerEl.style.transform = 'translateX(-100%)';
    }

    refresh() {
        if (!this.containerEl) return;
        const current = this.viewModel.buildCanvasView || 'graph';
        Object.entries(this.buttons).forEach(([key, btn]) => {
            btn.classList.toggle('tree-view-pill-btn--active', key === current);
        });
    }

    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
```

- [ ] **Step 2: Add CSS**

In `style.css`, immediately after the existing `.learning-tree-pill-btn--active` rule (around line 1853), add:
```css

/* ── Build/Policy Graph|Tree pill ─────────────────────────────────────── */

.tree-view-pill {
  position: absolute;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tree-view-pill-label {
  font-size: 10px;
  color: var(--text-lighter);
}

.tree-view-pill-track {
  display: flex;
  gap: 2px;
  background: var(--surface-card2, var(--bg-card));
  border: 1px solid var(--border-hairline, var(--border-light));
  border-radius: 8px;
  padding: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.tree-view-pill-btn {
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-family);
  font-size: 10px;
  font-weight: 600;
  padding: 3px 10px;
  cursor: pointer;
}

.tree-view-pill-btn:hover {
  background: var(--surface-hover, var(--bg-dark-hover));
}

.tree-view-pill-btn--active {
  background: var(--accent-cyan);
  color: var(--color-primary-contrast, var(--text-white));
}
```

- [ ] **Step 3: Register the script tag**

In `index.html`, change:
```html
    <script src="src/main/view/learningTreeTogglePill.js"></script>
```
to:
```html
    <script src="src/main/view/learningTreeTogglePill.js"></script>
    <script src="src/main/view/treeViewPill.js"></script>
```

- [ ] **Step 4: Construct `TreeView` and `TreeViewPill` in `main.js`**

In `src/main/app/main.js`, immediately after the existing block that constructs `learningTreePill` (right after `learningTreePill.hide();`, before `AppPalette._onThemeChange = ...`):
```js
    learningTreePill.hide();

    // Full-canvas tree unroll for Build/Policy mode.
    mainView.treeView = new TreeView(canvasViewModel);
    treeViewPill = new TreeViewPill({
        onSelectView: (view) => {
            canvasController.setBuildCanvasView(view);
            treeViewPill.refresh();
            redraw();
        }
    }, canvasViewModel);
    treeViewPill.setup(mainView.TOP_BARS_HEIGHT);
    treeViewPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
    mainView.treeViewPill = treeViewPill;
    treeViewPill.hide();
```
And declare the module-level variable alongside the existing `let learningTreePill;` (around line 106):
```js
let learningTreePill;
let treeViewPill;
```

- [ ] **Step 5: Wire show/hide into the mode-lifecycle hook table**

In `src/main/app/main.js`'s `canvasController.registerModeLifecycle({...})` call:

In `onLeave.build` and `onLeave.policy` (currently identical bodies that just hide the tool palette), add hiding the tree pill and resetting to Graph view so re-entering always starts fresh:
```js
        build: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.hide();
            if (treeViewPill) treeViewPill.hide();
            canvasController.setBuildCanvasView('graph');
        },
        policy: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.hide();
            if (treeViewPill) treeViewPill.hide();
            canvasController.setBuildCanvasView('graph');
        }
```
In `onEnter.build` and `onEnter.policy` (currently identical bodies that show the tool palette and zoom pill), add showing the tree pill:
```js
        build: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.show();
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (treeViewPill) {
                treeViewPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                treeViewPill.show();
            }
        },
        policy: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.show();
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (treeViewPill) {
                treeViewPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                treeViewPill.show();
            }
        }
```

- [ ] **Step 6: Verify in browser**

Reload the app fresh (so the real `main.js` wiring is in effect, not Task 3's console stand-in). In the console:
```js
mainView.treeViewPill.containerEl.style.display   // '' (visible - default mode is Build)
document.querySelectorAll('.tree-view-pill-btn').length  // 2
```
Then, driving the actual UI (click, not console calls, to exercise the real event listeners): click the "Tree" segment of the new pill (top-right of the canvas) — confirm the canvas swaps to the tree (build a small graph with s0 set first, per Task 3's verification graph, if starting from a blank session). Click "Graph" — confirm it swaps back. Switch to Policy mode (top bar) — confirm the pill is still visible and still works. Switch to Values mode — confirm the pill disappears (and doesn't reappear when moving between Values sub-views). Switch back to Build — confirm the pill reappears and `buildCanvasView` reset to `'graph'` (per the `onLeave` reset). No console errors, both themes.

- [ ] **Step 7: Commit**

```bash
git add src/main/view/treeViewPill.js style.css src/main/app/main.js index.html
git commit -m "Add TreeViewPill and wire Build/Policy Graph|Tree lifecycle"
```

---

### Task 5: Click-to-expand/collapse

**Files:**
- Modify: `src/main/view/treeView.js` (add hit-testing + a public click handler)
- Modify: `src/main/view/mainView.js:965-970` and the top of `mouseMoved()`/`mouseDragged()` (route clicks to `TreeView` when in tree view, bypassing normal graph click/pan handling)

**Interfaces:**
- Consumes: `canvasController.toggleTreeNodeExpanded(pathId)` (Task 1), `TreeLayout.forEach` (Task 2).
- Produces: `treeView.handleClick(screenX, screenY) -> boolean` (returns whether it hit something, so `mainView.js` knows whether to still fall through to other click handling like closing dropdowns — it should always return early regardless, but the boolean is useful for the verification step and for Task 6's hover reuse of the same hit-test).
- Also produces: `treeView._hitTest(screenX, screenY) -> TreeNode | null`, a private helper Task 6 (hover) reuses.

- [ ] **Step 1: Add hit-testing and click handling to `treeView.js`**

Add these methods to the `TreeView` class (after `draw()`):
```js
    // Converts a tree-local (x, y) - as stored on TreeLayout nodes - into current screen
    // coordinates, applying the same anchor offset draw() uses plus the shared viewport pan/zoom.
    _treeToScreen(node) {
        const worldX = node.x + TREE_VIEW_ANCHOR_X;
        const worldY = node.y + TREE_VIEW_ANCHOR_Y;
        return this.viewModel.viewport.worldToScreen(worldX, worldY);
    }

    // Returns the topmost TreeNode whose on-screen shape contains (screenX, screenY), or null.
    _hitTest(screenX, screenY) {
        const tree = this._currentTree();
        if (!tree) return null;
        const zoom = this.viewModel.viewport.zoom;
        let hit = null;
        TreeLayout.forEach(tree, node => {
            const p = this._treeToScreen(node);
            const halfSize = (node.kind === 'state' ? TREE_VIEW_STATE_RADIUS : TREE_VIEW_ACTION_HALF) * zoom;
            const dx = screenX - p.x, dy = screenY - p.y;
            if (node.kind === 'state') {
                if (dx * dx + dy * dy <= halfSize * halfSize) hit = node;
            } else {
                if (Math.abs(dx) <= halfSize && Math.abs(dy) <= halfSize) hit = node;
            }
        });
        return hit;
    }

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

    _toggle(pathId) {
        // Controller is reached via the global canvasController (same convention every other
        // view in this codebase uses for controller access - e.g. mainView.js's this.controller).
        canvasController.toggleTreeNodeExpanded(pathId);
    }
```

- [ ] **Step 2: Route mouse events in `mainView.js`**

At the very top of `mousePressed()` (`src/main/view/mainView.js:965`), immediately after the canvas-bounds check, insert:
```js
    mousePressed() {
        // In p5.js, mouseX and mouseY are canvas-relative (0 to width, 0 to height)
        // Only handle clicks within the canvas bounds
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        // Tree view owns its own synthetic layout (not the graph's real node positions), so it
        // fully bypasses GeometricHelper-based hit-testing, panning, and edge/node click logic
        // below. Right-click (set s0) and zoom still work normally - only plain left-click on the
        // canvas routes here.
        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' &&
            this.treeView && mouseButton !== RIGHT) {
            this.treeView.handleClick(mouseX, mouseY);
            redraw();
            return;
        }

        // Right-click in build/policy mode: set start node (s₀)
```
(The existing right-click branch stays completely unchanged immediately below this new block — right-click still works in Tree view exactly as it does in Graph view, since re-rooting is defined to happen via that existing mechanism regardless of which view is showing, per the spec.)

- [ ] **Step 3: Verify in browser**

Build the same small graph as Task 2/3's verification (s0/a0/s1/a1 with a cycle, depth cap 4 means everything in this tiny graph renders fully expanded by default — to actually test expand/collapse, build a slightly deeper chain, e.g. 5+ sequential states, so the 5th level starts collapsed). Switch to Tree view. In the console, confirm the collapsed boundary exists:
```js
const tree = TreeLayout.build(canvasViewModel.graph, canvasViewModel.startNode.id, canvasViewModel.treeExpanded, 4);
let collapsedPathId = null;
TreeLayout.forEach(tree, n => { if (n.isCollapsed) collapsedPathId = n.pathId; });
collapsedPathId   // some pathId, not null - confirms the test graph is deep enough
```
Then, driving the real UI, click that collapsed node's on-screen position (compute it via `mainView.treeView._treeToScreen(...)` on the matching node object, or just visually locate the rightmost/deepest visible node and click it) — confirm its children appear. Click it again — confirm they disappear. Click a *different* branch's collapsed node — confirm expanding it does not collapse the first one (independent per-branch state). Click on a terminal node (no actions) — confirm nothing happens (no error, no visual change). No console errors, both themes.

- [ ] **Step 4: Commit**

```bash
git add src/main/view/treeView.js src/main/view/mainView.js
git commit -m "Add click-to-expand/collapse in tree view"
```

---

### Task 6: Hover-highlight (all copies of a hovered state + count badge)

**Files:**
- Modify: `src/main/view/treeView.js` (hover state tracking, badge rendering, integrate into `_drawNode`)
- Modify: `src/main/view/mainView.js` (route `mouseMoved()` to tree view when active)

**Interfaces:**
- Consumes: `treeView._hitTest` (Task 5).
- Produces: `treeView.handleMouseMove(screenX, screenY) -> boolean` (returns whether the hover target changed, so `mainView.js` knows whether to `redraw()` — same convention `ExpectationView.handleMouseMove` already uses elsewhere in this codebase).

Note on scope (recorded in the design spec's Context section): the source handoff also mentions highlighting "the original graph node" on hover. Since Tree view is a full-canvas swap (Graph view is not simultaneously visible — an explicit, already-approved design decision), that part doesn't apply; this task implements the "highlight all copies in the tree + count badge" part only.

- [ ] **Step 1: Add hover state and highlight rendering to `treeView.js`**

Add a field in the constructor:
```js
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
        this.hoveredStateId = null;
    }
```

Add a public hover handler (after `handleClick`):
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

Modify `_drawNode` to draw a highlight ring on every copy of the hovered state, and modify `draw()` to show the count badge once, near the first (root-most) copy. Replace the existing `_drawNode` method with:
```js
    _drawNode(node) {
        const isHoveredState = node.kind === 'state' && this.hoveredStateId !== null &&
            node.stateId === this.hoveredStateId;

        if (isHoveredState) {
            push();
            noFill();
            stroke(AppPalette.accent.yellow);
            strokeWeight(3);
            circle(node.x, node.y, (TREE_VIEW_STATE_RADIUS + 5) * 2);
            pop();
        }

        push();
        if (node.kind === 'state') {
            fill(ColorUtils.applyAlpha(AppPalette.node.state, 220));
            stroke(AppPalette.text.medium);
            strokeWeight(2);
            circle(node.x, node.y, TREE_VIEW_STATE_RADIUS * 2);
        } else {
            fill(ColorUtils.applyAlpha(AppPalette.node.action, 220));
            stroke(AppPalette.text.medium);
            strokeWeight(2);
            rect(node.x - TREE_VIEW_ACTION_HALF, node.y - TREE_VIEW_ACTION_HALF,
                TREE_VIEW_ACTION_HALF * 2, TREE_VIEW_ACTION_HALF * 2, 6);
        }
        noStroke();
        fill(ColorUtils.contrastText(node.kind === 'state' ? AppPalette.node.state : AppPalette.node.action));
        textAlign(CENTER, CENTER);
        textSize(10);
        textFont(Typography.sans());
        text(node.name, node.x, node.y);
        pop();
    }

    // Small "S2 - 2x" badge drawn once, above the FIRST (shallowest) copy of the hovered state.
    _drawHoverBadge(tree) {
        if (this.hoveredStateId === null) return;
        const copies = [];
        TreeLayout.forEach(tree, node => {
            if (node.kind === 'state' && node.stateId === this.hoveredStateId) copies.push(node);
        });
        if (copies.length === 0) return;
        copies.sort((a, b) => a.stateDepth - b.stateDepth);
        const first = copies[0];

        push();
        textAlign(CENTER, BOTTOM);
        textSize(10);
        textFont(Typography.mono());
        fill(AppPalette.accent.yellow);
        noStroke();
        text(`${first.name} — ${copies.length}× in tree`, first.x, first.y - TREE_VIEW_STATE_RADIUS - 8);
        pop();
    }
```

Update `draw()` to call the badge renderer inside the same translated block, right after drawing nodes:
```js
        // Edges first (so nodes draw on top of their own incoming edge).
        TreeLayout.forEach(tree, node => {
            node.children.forEach(child => this._drawEdge(node, child));
        });
        // Nodes second.
        TreeLayout.forEach(tree, node => this._drawNode(node));
        this._drawHoverBadge(tree);

        pop();
```

- [ ] **Step 2: Route `mouseMoved()` in `mainView.js`**

Find `mouseMoved()` in `src/main/view/mainView.js` and add a tree-view branch at the top, before its existing body:
```js
    mouseMoved() {
        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' && this.treeView) {
            const changed = this.treeView.handleMouseMove(mouseX, mouseY);
            if (changed) redraw();
            return;
        }

        // ... existing body unchanged below this point
```

- [ ] **Step 3: Verify in browser**

Using the cyclic test graph from Task 2/3 (where s0 appears at multiple tree positions), switch to Tree view. Move the mouse over any copy of s0 in the tree (compute its screen position via `mainView.treeView._treeToScreen(...)` for precision, or visually hover in a real driven browser) — confirm ALL copies of s0 get a yellow ring, and a badge reading "S0 — N× in tree" appears above the shallowest copy. Move the mouse off all nodes — confirm the rings and badge disappear. Hover a state that appears only once — confirm it still rings (with "…— 1× in tree") without erroring. No console errors, both themes.

- [ ] **Step 4: Commit**

```bash
git add src/main/view/treeView.js src/main/view/mainView.js
git commit -m "Add hover-highlight for repeated states in tree view"
```

---

### Task 7: Final integration pass — re-root reset, zoom/pan, full regression

**Files:** none new; this task is verification-only, touching no source files unless a regression is found (in which case fix it in the file where the bug lives, following this codebase's existing conventions, and note the fix in the commit message).

**Interfaces:** none new.

- [ ] **Step 1: Re-root reset**

In Graph view, right-click a *different* state than the current s₀ to change the start node. Switch to Tree view — confirm it now roots at the new state, and any previously-expanded pathIds from the old root no longer apply (per Task 1's `treeExpanded.clear()` in `setStartNode` — the tree should render at its default depth-cap state, not still "remembering" old expansion clicks, since old pathIds like `"s0.a0.1"` are meaningless under a different root anyway even if they happened to collide by string).

- [ ] **Step 2: Zoom/pan**

In Tree view, use the existing zoom pill (bottom-right −/%/+) to zoom in and out — confirm the tree scales correctly (nodes, edges, and hit-testing all stay aligned — click a node after zooming to confirm `_hitTest`'s `zoom`-scaled radius still works correctly at non-1.0 zoom levels). Use the mouse wheel over the canvas to zoom — confirm the same.

- [ ] **Step 3: Full regression pass**

Run through: Build mode (create/edit graph, confirm Tree pill present, confirm normal Graph-view editing — node creation, edge creation, drag, resize, delete, undo/redo — is completely unaffected when `buildCanvasView === 'graph'`) → Policy mode (confirm Tree pill present and working, confirm Policy's own right-panel content — the π editor — is unaffected) → Values mode (confirm the Build/Policy tree pill is absent, confirm Values' own Learning Iteration Graph|Tree pill is unaffected/still works correctly on its own) → back to Build (confirm `buildCanvasView` reset to `'graph'` per the `onLeave` hook, Tree pill shows "Graph" as active). Confirm no console errors throughout. Confirm a `test_schema/*.json` import/export round-trip does not include `buildCanvasView` or `treeExpanded` in the exported JSON (grep the exported string, matching this codebase's established pattern for verifying presentation-only state stays out of serialization — same check used for `manualOverrides`/`qLearningState` earlier in this project):
```js
canvasController.importGraph(/* contents of a test_schema/*.json fixture */);
const json = canvasController.exportGraph(true);
/buildCanvasView|treeExpanded/i.test(json)   // false
```

- [ ] **Step 4: Update `CLAUDE.md`**

Add a short mention of the new pill to `CLAUDE.md`'s View Layer file listing, immediately after the existing `toolPalette.js` bullet (to match the documentation convention every other pill in this file already follows — see the `mcRunsPill.js`/`learningTreeTogglePill.js` bullets as precedent):
```markdown
   - `treeViewPill.js` + `treeView.js`: Floating top-right `[Graph | Tree]` pill in Build/Policy mode, plus the full-canvas view it toggles — unrolls the MDP into a left-to-right search tree rooted at the start node (s₀), with click-to-expand/collapse (depth-capped by default) and hover-highlight of repeated states. Presentation-only (`buildCanvasView`, `treeExpanded` on `CanvasViewModel`), unrelated to Learning Iteration's own algorithmic Graph|Tree toggle in Values mode.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the Build/Policy tree view in CLAUDE.md"
```

(If Step 3 surfaced any regression requiring a code fix, that fix should already be committed separately, before this documentation commit, with its own descriptive message.)

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-11-build-tree-view-design.md` maps to a task — state model → Task 1, pill → Task 4, rendering/layout → Tasks 2-3, expand/collapse → Task 5, hover-highlight → Task 6, non-goals (no new gesture, no ring change, no auto-default, Build+Policy not Build-only) → enforced throughout via Global Constraints and explicitly checked in Task 7.
- **Placeholder scan:** no TBD/TODO; every step has complete, concrete code or a concrete verification script.
- **Type/name consistency:** `buildCanvasView`, `treeExpanded`, `setBuildCanvasView`, `toggleTreeNodeExpanded`, `TreeLayout.build`/`.forEach`, `TreeView`/`treeView.draw()`/`.handleClick()`/`.handleMouseMove()`/`._hitTest()`/`._treeToScreen()`, `TreeViewPill`/`treeViewPill` — checked for consistent naming across all 7 tasks; a `TreeNode`'s field names (`kind`, `pathId`, `stateId`, `actionId`, `hasChildren`, `isCollapsed`, `children`, `x`, `y`) are defined once in Task 2 and used identically in Tasks 3, 5, 6.
