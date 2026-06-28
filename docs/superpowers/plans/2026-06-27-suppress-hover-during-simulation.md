# Suppress Hover Panel During Active Simulation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent hover events from updating the right panel while an initialized simulation replay exists, except when hovering a node or edge that is currently visible on the canvas.

**Architecture:** Gate the hover display logic inside `RightPanel.updateContent()`. When a simulation replay has been initialized (`simState.replayInitialized === true`), treat `hoveredNode` and `hoveredEdge` as null for display purposes unless the hovered entity is currently visible (checked via `simState.isNodeVisible()` / `simState.isEdgeVisible()`). This intentionally follows canvas visibility rather than trace history, so outgoing nodes and edges revealed during a decision phase can be inspected before they are traversed. No new state is introduced — the check reads existing domain state through the already-accessible `this.viewModel.simulationState`.

**Behavior boundary:** Suppression applies whenever `replayInitialized` is true, including paused, stepped, skipped, and completed replays. It ends on simulation Reset or when leaving Simulate mode. Selected entities retain their existing higher panel priority; this change filters hover display only.

**Tech Stack:** Vanilla JavaScript ES6+, p5.js, no build step.

## Global Constraints

- No Node.js — use `python3` or browser console for syntax checking.
- No external libraries beyond those already loaded in `index.html`.
- Do not add comments unless the WHY is non-obvious.
- Follow existing code style: no trailing summaries, no extra blank lines.

---

### Task 1: Suppress hidden-entity hover in `RightPanel.updateContent()`

**Files:**
- Modify: `src/main/view/rightPanel.js:98-132`

**Interfaces:**
- Consumes: `this.viewModel.simulationState` (already present — accessed at line 195), `simState.replayInitialized` (bool), `simState.isNodeVisible(nodeId)` (bool), `simState.isEdgeVisible(fromId, toId)` (bool)
- Produces: `updateContent()` silently skips hover panels during an initialized simulation unless the hovered entity is currently visible

---

- [ ] **Step 1: Read the current `updateContent()` block**

Open `src/main/view/rightPanel.js` and locate `updateContent()` (starts at line 98). The relevant section is lines 109–131:

```javascript
const selectedNode = this.viewModel.selection.selectedNode;
const selectedEdge = this.viewModel.selection.selectedEdge;
const hoveredNode  = this.viewModel.interaction.hoveredNode;
const hoveredEdge  = this.viewModel.interaction.hoveredEdge;
const isSimulateMode = this.viewModel.interaction.mode === 'simulate';
const isVIMode = this.viewModel.interaction.mode === 'value_iteration';

if (isVIMode) {
    this.renderValueIterationPanel();
} else if (selectedNode) {
    this.renderNodePanel(selectedNode, { readOnly: false });
} else if (selectedEdge) {
    this.renderEdgePanel(selectedEdge);
} else if (hoveredNode) {
    this.renderNodePanel(hoveredNode, { readOnly: true });
} else if (hoveredEdge) {
    this.renderEdgePanel(hoveredEdge);
} else if (isSimulateMode) {
    this.renderSimulationPanel();
} else {
    this.renderMDPInfoPanel();
}
```

- [ ] **Step 2: Replace the local-variable block with the gated version**

Replace lines 109–131 (the `const selectedNode …` block through the closing `}`) with:

```javascript
const selectedNode = this.viewModel.selection.selectedNode;
const selectedEdge = this.viewModel.selection.selectedEdge;
const isSimulateMode = this.viewModel.interaction.mode === 'simulate';
const isVIMode = this.viewModel.interaction.mode === 'value_iteration';

const simState = this.viewModel.simulationState;
const simActive = isSimulateMode && simState && simState.replayInitialized;

const rawHoveredNode = this.viewModel.interaction.hoveredNode;
const rawHoveredEdge = this.viewModel.interaction.hoveredEdge;

const hoveredNode = simActive && rawHoveredNode
    ? (simState.isNodeVisible(rawHoveredNode.id) ? rawHoveredNode : null)
    : rawHoveredNode;
const hoveredEdge = simActive && rawHoveredEdge
    ? (simState.isEdgeVisible(rawHoveredEdge.getFromNode().id, rawHoveredEdge.getToNode().id) ? rawHoveredEdge : null)
    : rawHoveredEdge;

if (isVIMode) {
    this.renderValueIterationPanel();
} else if (selectedNode) {
    this.renderNodePanel(selectedNode, { readOnly: false });
} else if (selectedEdge) {
    this.renderEdgePanel(selectedEdge);
} else if (hoveredNode) {
    this.renderNodePanel(hoveredNode, { readOnly: true });
} else if (hoveredEdge) {
    this.renderEdgePanel(hoveredEdge);
} else if (isSimulateMode) {
    this.renderSimulationPanel();
} else {
    this.renderMDPInfoPanel();
}
```

**Why these variables:**
- `simActive` — true only in simulate mode once replay initialization completes; it remains true while paused and after completion, and becomes false when you reset or switch modes
- `rawHoveredNode`/`rawHoveredEdge` — keep the interaction state untouched; only filter at display time
- visibility checks match the state used by simulation rendering, including outgoing entities revealed before traversal
- `hoveredEdge` uses `getFromNode().id` / `getToNode().id`, matching the key created by `SimulationState.revealEdge()`
- selected entities remain unchanged and continue to take priority over hover and simulation content

- [ ] **Step 3: Verify syntax**

Start the local server with `python3 -m http.server 8000`, load `http://localhost:8000`, and confirm the full application loads without console errors. Do not use `test_load.html` for this check because it does not load `rightPanel.js`.

- [ ] **Step 4: Manual smoke test — hover suppressed during play**

1. Start the server: `python -m http.server 8000`
2. Open `http://localhost:8000` in a browser
3. Create at least 2 state nodes and 1 action node with edges forming a small MDP
4. Switch to Simulate mode, set a start node, press Play
5. While the simulation is playing, move the mouse over a node that is currently hidden
6. **Expected:** The right panel continues to show the simulation stats panel (not a node hover panel)
7. Move the mouse over a node that is currently visible
8. **Expected:** The right panel shows the read-only node panel for that node
9. During a decision reveal phase, hover an outgoing node and edge that are visible but have not been traversed
10. **Expected:** Their read-only panels appear because visibility, not trace history, controls hover

- [ ] **Step 5: Manual smoke test — hover resumes after reset**

1. Press Reset in the toolbar
2. Move the mouse over any node
3. **Expected:** Right panel shows the read-only hover panel normally (suppression is off after reset because `replayInitialized` is `false`)

- [ ] **Step 6: Manual smoke test — hover works normally in editor mode**

1. Switch to Editor mode
2. Hover over nodes and edges
3. **Expected:** Right panel updates as before — no regression

- [ ] **Step 7: Manual smoke test — replay lifecycle and priority**

1. Initialize a replay, then Pause and hover hidden and visible entities
2. **Expected:** Hidden entities remain suppressed and visible entities remain inspectable
3. Step or Skip to the end of the replay and repeat the hover checks
4. **Expected:** Suppression remains active until Reset
5. Select an entity, switch to Simulate mode with that selection still present, and initialize a replay
6. **Expected:** The selected entity panel retains its existing priority
7. Hover both an edge curve and its label
8. **Expected:** Both hit targets follow the same visibility rule
9. Switch to Editor mode without Reset
10. **Expected:** Normal hover display resumes because the visibility gate applies only in Simulate mode
