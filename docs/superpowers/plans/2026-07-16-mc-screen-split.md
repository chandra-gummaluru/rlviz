# Monte Carlo Screen Split (Phase 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Values → Monte Carlo's two mutually-exclusive full-canvas modes (grid / focused-run) with a persistent 52% left / 48% right split: left toggles Grid↔Chart via a new pill, right is a single always-visible MDP graph that highlights whichever run is selected.

**Architecture:** View/viewmodel-tier layout change only — no domain-layer changes. `ExpectationViewModel` gains `leftView`/`selectedRunIndex` state and a pure `splitWidths()` helper; `ExpectationView.draw()` always renders both panes instead of branching between grid-mode and a full-canvas focused mode; two new DOM/canvas components (`McLeftViewPill`, `ExpectationChartView`) are added following this codebase's existing floating-pill and self-contained-DOM-chart-panel conventions respectively.

**Tech Stack:** Vanilla JS, p5.js canvas rendering, Chart.js (already vendored, used identically by `chartDock.js`), plain DOM for floating chrome — no build step, no bundler, no automated test suite (browser + playwright-core manual verification only).

## Global Constraints

- **No domain layer changes.** `expectationState.js` is untouched — this phase is purely view/viewmodel layout and interaction, reusing existing domain data and `chartDataBuilders.js`'s existing pure data-shaping functions verbatim (no new chart math).
- **Left/right split ratio is fixed at 52%/48%** of the canvas width already handed to `ExpectationView` (`canvasW` argument to `draw()`/`resize()`) — not user-resizable, no drag handle. `mainView.js`'s `_valuesPaneWidths()` stays unchanged (still returns `{mc: canvasWidth, vi: canvasWidth}`); the split happens *inside* `ExpectationViewModel`/`ExpectationView`, given the same full width they already receive.
- **"Focused mode" (`vm.focusedRunIndex`, `_drawFocusedPanel()`, `enterFocusMode()`/`exitFocusMode()`, the "← All runs" back button, `Escape`-to-exit) is removed entirely**, not merely hidden. Its one useful behavior — rendering one rollout's path on a full/large graph rendering — is replaced by the new always-visible right-pane graph panel, keyed off a renamed `selectedRunIndex` field (`null` = no selection = bare graph).
- **Chart view is a fixed two-chart layout (Convergence on top, Histogram below), not user-configurable per-slot** like the bottom `ChartDock`'s two independently-pickable slots — this is a deliberate simplification for the new inline Chart view; no slot-type `<select>` is added.
- **`ChartDock` itself is not modified in its own rendering methods** — Iteration's own use of it (Phase 3b's concern) must be unaffected. Only its *visibility lifecycle* in `main.js` changes (hidden while Values → Monte Carlo is active, still shown while Values → Iteration is active).
- **The shared right-pane graph panel is implemented as private methods on `ExpectationView`** (`_drawGraphPanel`), not a separate file/class. It reuses `ExpectationView`'s own existing private rendering helpers (`_drawEdge`, `_drawNode`, `_drawTextLabels`, `_imageCache`) verbatim; splitting it into a separate file would require duplicating or awkwardly re-exposing all of those. (This deviates from the design spec's "New file: a shared-graph right-pane renderer (exact name TBD)" — that line was explicitly marked TBD/indicative, and this plan resolves it in favor of reuse over a new file, per this codebase's "reuse, don't reinvent" convention.)
- **The new `[Grid | Chart]` pill IS its own new file** (`mcLeftViewPill.js`), modeled directly on `treeViewPill.js` (same two-option DOM/CSS skeleton) — matching the existing one-file-per-floating-pill convention (`mcRunsPill.js`, `treeViewPill.js`, `zoomPill.js`, `estimatorPill.js` are all separate files).
- **Verification is manual, via a local server** (`python3 -m http.server 8010` from the worktree root) and a real headless-browser script (playwright-core, already vendored) driving real DOM mouse events (`mousedown`/`mouseup`/`click` — p5.js's own click handling binds native mouse events, not synthetic `.click()` alone works for canvas-space clicks routed through `mousePressed()`, but DOM buttons like the new pill's `<button>` elements do respond to `.click()`/dispatched `click` events). Check the browser console for zero errors and visually confirm both light and dark theme.

---

## Reference: current vs. new state (for the implementer's orientation)

| Concern | Today | After this plan |
|---|---|---|
| Canvas layout | Single mode: grid (default) OR one focused run, full width | Persistent 52%/48% split: left = Grid or Chart; right = always-visible shared graph |
| `ExpectationViewModel.focusedRunIndex` | Entering focus = full-canvas takeover | Renamed `selectedRunIndex`; selecting a run just highlights it on the right pane, no takeover |
| `ExpectationViewModel.leftView` | Doesn't exist | New: `'grid' \| 'chart'`, default `'grid'` |
| Scrubber ticks | Numeric in grid mode, real trace names in focused mode | Always numeric (focused mode's named ticks no longer apply anywhere) |
| Bottom `ChartDock` | Shown in Values mode regardless of sub-view | Shown only for Values → Iteration; hidden for Values → Monte Carlo |
| Convergence/Histogram charts | Only in `ChartDock`'s slots | Also available inline in MC's left pane via new `ExpectationChartView`, reusing the same `ChartDataBuilders` functions |

---

### Task 1: `ExpectationViewModel` — rename + add split-aware layout state

**Files:**
- Modify: `src/main/adapter/viewmodel/ExpectationViewModel.js`

**Interfaces:**
- Produces: `ExpectationViewModel.selectedRunIndex` (replaces `focusedRunIndex`, same default `null`), `ExpectationViewModel.leftView` (new, default `'grid'`), `ExpectationViewModel.splitWidths(canvasW)` → `{ leftW, rightW }`.
- Consumes: nothing new (same constructor, same existing fields otherwise).

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

Run: `cat -n src/main/adapter/viewmodel/ExpectationViewModel.js`

(Already read in full during planning — reproduced here for the implementer's own verification before editing, since exact line numbers matter for a clean diff.)

- [ ] **Step 2: Rename `focusedRunIndex` → `selectedRunIndex` in the constructor**

Change:
```js
        this.isPlaying = false;
        this.focusedRunIndex = null;
```
to:
```js
        this.isPlaying = false;
        // Which mini-panel/rollout is pinned as "selected" - highlights its path on the shared
        // right-pane graph panel (expectationView.js's _drawGraphPanel). Renamed from the old
        // focusedRunIndex: selecting a run no longer triggers a full-canvas takeover (that
        // "focused mode" concept was removed - see the MC screen split plan), it just drives
        // which run's path the always-visible right pane highlights.
        this.selectedRunIndex = null;
        // 'grid' (default) or 'chart' - which view the LEFT 52% pane currently shows. Presentation
        // only, mirrors buildCanvasView/valuesSubView's own presentation-state convention.
        this.leftView = 'grid';
```

- [ ] **Step 3: Add `splitWidths()`**

Add as a new method (placement: right after `computeLayout()`, before `_computeFitTransform()`):
```js
    // Fixed 52%/48% left/right split of whatever full canvas width ExpectationView already
    // receives (mainView.js's _valuesPaneWidths() keeps handing MC the FULL usable width - this
    // is where the actual split happens, internally, per the Phase 3a design). Not user-resizable
    // in this phase - no drag handle.
    splitWidths(canvasW) {
        const leftW = Math.floor(canvasW * 0.52);
        return { leftW, rightW: canvasW - leftW };
    }
```

- [ ] **Step 4: Update the `highlightedRun` getter**

Change:
```js
    get highlightedRun() {
        return this.focusedRunIndex !== null ? this.focusedRunIndex : this.hoveredRun;
    }
```
to:
```js
    get highlightedRun() {
        return this.selectedRunIndex !== null ? this.selectedRunIndex : this.hoveredRun;
    }
```

- [ ] **Step 5: Grep the whole codebase for any remaining `focusedRunIndex` references**

Run: `grep -rn "focusedRunIndex" src/`

Expected: matches only in `src/main/view/expectationView.js` and `src/main/view/rightPanel.js` (both fixed in Tasks 2 and 6 — do not fix them in this task, just confirm the count so later tasks know exactly how many call sites remain).

- [ ] **Step 6: Manual verification — no console errors from this file alone**

This file has no rendering/interaction of its own; verification is deferred to Task 2 (which will immediately break if this file has a syntax error, since `ExpectationView` reads these fields). Run a quick Node syntax check instead:

Run: `node --check src/main/adapter/viewmodel/ExpectationViewModel.js`
Expected: no output (exit code 0).

- [ ] **Step 7: Commit**

```bash
git add src/main/adapter/viewmodel/ExpectationViewModel.js
git commit -m "Rename ExpectationViewModel.focusedRunIndex to selectedRunIndex, add leftView + splitWidths()"
```

---

### Task 2: `ExpectationView` — remove focused mode, implement the always-on split

**Files:**
- Modify: `src/main/view/expectationView.js`

**Interfaces:**
- Consumes: `ExpectationViewModel.selectedRunIndex`, `.leftView`, `.splitWidths(canvasW)` (Task 1).
- Produces: `ExpectationView.setExpectationChartView(view)` (new setter, mirrors the existing `setChartDock(chartDock)` pattern) — Task 4/5's `ExpectationChartView` instance is wired in via this. `ExpectationView.selectRun(index)` (new, replaces `enterFocusMode`). `ExpectationView._drawGraphPanel(leftW, rightW, canvasH)` (new private method, the shared right-pane renderer per this plan's Global Constraints).

This task removes: `_drawFocusedPanel()`, `enterFocusMode()`, `exitFocusMode()`, `_createBackButton()`, `_removeBackButton()`, the `_backBtn` field, and the `Escape`-to-exit branch of `handleKey()`.

- [ ] **Step 1: Constructor — add the chart-view slot**

Change:
```js
        this._rightPanel = null;
        this._chartDock = null;
        this.onPlaybackStateChange = null;
        this._topOffset = 40; // corrected immediately by resize(), matches the top bar's height
        this._imageCache = new Map();
        this._backBtn = null;
    }

    setRightPanel(rightPanel) {
        this._rightPanel = rightPanel;
    }

    setChartDock(chartDock) {
        this._chartDock = chartDock;
    }

    _notifyDataChanged() {
        if (this._rightPanel) this._rightPanel.updateExpectationData();
        if (this._chartDock) this._chartDock.refresh();
    }
```
to:
```js
        this._rightPanel = null;
        this._chartDock = null;
        this._expectationChartView = null;
        this.onPlaybackStateChange = null;
        this._topOffset = 40; // corrected immediately by resize(), matches the top bar's height
        this._imageCache = new Map();
    }

    setRightPanel(rightPanel) {
        this._rightPanel = rightPanel;
    }

    setChartDock(chartDock) {
        this._chartDock = chartDock;
    }

    // The new inline Chart view for the left pane (Phase 3a) - a sibling DOM component, not a
    // p5-canvas overlay, so it needs its own bounds kept in sync on resize() (see below) and its
    // own refresh() call alongside rightPanel/chartDock whenever the underlying data changes.
    setExpectationChartView(view) {
        this._expectationChartView = view;
    }

    _notifyDataChanged() {
        if (this._rightPanel) this._rightPanel.updateExpectationData();
        if (this._chartDock) this._chartDock.refresh();
        if (this._expectationChartView) this._expectationChartView.refresh();
    }
```

- [ ] **Step 2: Rewrite `draw()` to always render the split**

Replace the entire `draw(canvasW, canvasH)` method body (currently lines 47-184) with:
```js
    draw(canvasW, canvasH) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;

        background(AppPalette.surface.canvas);

        if (!state.computed || !this.viewModel.startNode) {
            this._drawEmptyPrompt(canvasW, canvasH);
            return;
        }

        this._ensureImagesLoaded();

        const { leftW, rightW } = vm.splitWidths(canvasW);

        if (vm.leftView === 'grid') {
            this._drawGrid(leftW, canvasH);
        } else {
            // Chart view (ExpectationChartView, a DOM component) renders over this region
            // instead - just clear the canvas-space behind it so nothing from a previous
            // grid-mode frame lingers visible at the pane's edges.
            noStroke();
            fill(AppPalette.surface.canvas);
            rect(0, 0, leftW, canvasH);
        }

        push();
        stroke(AppPalette.border.medium);
        strokeWeight(1);
        line(leftW, EXPECTATION_TOP_CLEARANCE, leftW, canvasH);
        pop();

        this._drawGraphPanel(leftW, rightW, canvasH);
    }

    // Episode mini-panel grid, budgeted to the left pane's width (leftW) instead of the full
    // canvas - this is exactly today's pre-split grid-mode rendering, just parameterized.
    _drawGrid(leftW, canvasH) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;

        if (vm.layoutStale) {
            vm.computeLayout(leftW, canvasH - EXPECTATION_TOP_CLEARANCE, state.displayRuns, this.graph, EXPECTATION_TOP_CLEARANCE);
        }
        if (!vm.panelLayout) {
            this._drawEmptyPrompt(leftW, canvasH);
            return;
        }

        const { panels, fitTransform } = vm.panelLayout;
        if (!fitTransform) {
            this._drawEmptyPrompt(leftW, canvasH);
            return;
        }

        const { offsetX, offsetY, fitScale } = fitTransform;
        const currentT = state.currentT;
        const runColors = AppPalette.expectation.runColors;

        const displaySlice = state.getDisplaySlice();
        const hoveredRun = vm.hoveredRun;
        const selectedRun = vm.selectedRunIndex;
        for (let i = 0; i < displaySlice.length; i++) {
            const panel = panels[i];
            if (!panel) continue;
            const rollout = displaySlice[i];
            const runColor = runColors[i % runColors.length];
            const isHovered = hoveredRun === i;
            const isSelected = selectedRun === i;

            drawingContext.save();
            drawingContext.beginPath();
            drawingContext.rect(panel.x, panel.y, panel.w, panel.h);
            drawingContext.clip();

            // Draw panel background
            fill(isHovered ? AppPalette.surface.hoverCard : AppPalette.surface.card);
            noStroke();
            rect(panel.x, panel.y, panel.w, panel.h, 9);

            push();
            translate(panel.x + offsetX, panel.y + offsetY);
            scale(fitScale);

            // Draw all edges dim
            for (const edge of this.graph.edges) {
                const from = edge.getFromNode();
                const to = edge.getToNode();
                this._drawEdge(from, to, AppPalette.node.state, EXPECTATION_DIM_ALPHA);
            }

            // Draw all nodes dim
            for (const node of this.graph.nodes) {
                this._drawNode(node, AppPalette.node.state, EXPECTATION_DIM_ALPHA, fitScale);
            }

            // Draw text labels
            this._drawTextLabels(fitScale);

            // Highlight visited nodes and edges
            const effectiveT = Math.min(currentT, rollout.numSteps);
            const visitedSlice = rollout.trace.slice(0, 2 * effectiveT + 1);

            // Visited edges
            for (let k = 0; k + 1 < visitedSlice.length; k++) {
                const fromEntry = visitedSlice[k];
                const toEntry = visitedSlice[k + 1];
                const fromNode = this.graph.getNodeById(fromEntry.id);
                const toNode = this.graph.getNodeById(toEntry.id);
                if (fromNode && toNode) {
                    this._drawEdge(fromNode, toNode, runColor, 255);
                }
            }

            // Visited nodes
            for (const entry of visitedSlice) {
                const node = this.graph.getNodeById(entry.id);
                if (node) {
                    this._drawNode(node, runColor, 255, fitScale);
                }
            }

            pop();
            drawingContext.restore();

            // Panel label (screen space, after restore): "#NN" muted mono (left) + "G = x.xx"
            // mono, green/red by sign (right)
            const utility = state._getUtility(rollout, currentT);
            noStroke();
            textSize(10);
            textFont(Typography.mono());

            textAlign(LEFT, TOP);
            fill(AppPalette.text.placeholder);
            text(`#${String(i + 1).padStart(2, '0')}`, panel.x + 4, panel.y + 3);

            textAlign(RIGHT, TOP);
            fill(utility >= 0 ? AppPalette.reward.positive : AppPalette.reward.negative);
            text(`G = ${utility.toFixed(2)}`, panel.x + panel.w - 4, panel.y + 3);

            // Third line: trajectory-so-far readout (e.g. "S0 →Hun→ S1 (+5.00)"), a supplementary
            // readout below the #NN/G= row - skipped on short panels so it doesn't crowd the
            // mini-graph render underneath.
            if (panel.h > 90) {
                const trajectory = RolloutFormatter.formatTrajectory(this.graph, rollout, currentT);
                if (trajectory) {
                    textSize(9);
                    textFont(Typography.mono());
                    textAlign(LEFT, TOP);
                    fill(AppPalette.text.secondary);
                    const maxWidthPx = panel.w - 8;
                    text(this._truncateToWidth(trajectory, maxWidthPx), panel.x + 4, panel.y + 15);
                }
            }

            // Panel border - color reflects hover OR selection; stroke weight never changes so
            // the border doesn't visually "jump" in thickness.
            noFill();
            stroke((isHovered || isSelected) ? AppPalette.accent.orange : AppPalette.border.medium);
            strokeWeight(1);
            rect(panel.x, panel.y, panel.w, panel.h, 9);
        }
    }

    // Shared right-pane graph panel (48% of canvasW, always visible regardless of leftView).
    // Bare graph when nothing is selected; the selected run's visited-so-far path (synced to the
    // shared scrubber's currentT) is highlighted otherwise. Replaces the old full-canvas
    // "focused mode" (_drawFocusedPanel) - same rendering approach, just always-on and pane-
    // scoped instead of a modal takeover.
    _drawGraphPanel(leftW, rightW, canvasH) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;

        const availH = canvasH - EXPECTATION_TOP_CLEARANCE;
        const fitTransform = vm._computeFitTransform(this.graph, rightW, availH);
        if (!fitTransform) return;

        const { offsetX, offsetY, fitScale } = fitTransform;

        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(leftW, EXPECTATION_TOP_CLEARANCE, rightW, availH);
        drawingContext.clip();

        fill(AppPalette.surface.card);
        noStroke();
        rect(leftW, EXPECTATION_TOP_CLEARANCE, rightW, availH);

        push();
        translate(leftW + offsetX, EXPECTATION_TOP_CLEARANCE + offsetY);
        scale(fitScale);

        for (const edge of this.graph.edges) {
            this._drawEdge(edge.getFromNode(), edge.getToNode(), AppPalette.node.state, EXPECTATION_DIM_ALPHA);
        }
        for (const node of this.graph.nodes) {
            this._drawNode(node, AppPalette.node.state, EXPECTATION_DIM_ALPHA, fitScale);
        }

        if (vm.selectedRunIndex !== null) {
            const rollout = state.getDisplaySlice()[vm.selectedRunIndex];
            if (rollout) {
                const runColor = AppPalette.expectation.runColors[vm.selectedRunIndex % AppPalette.expectation.runColors.length];
                const currentT = state.currentT;
                const effectiveT = Math.min(currentT, rollout.numSteps);
                const visitedSlice = rollout.trace.slice(0, 2 * effectiveT + 1);
                for (let k = 0; k + 1 < visitedSlice.length; k++) {
                    const fromNode = this.graph.getNodeById(visitedSlice[k].id);
                    const toNode = this.graph.getNodeById(visitedSlice[k + 1].id);
                    if (fromNode && toNode) this._drawEdge(fromNode, toNode, runColor, 255);
                }
                for (const entry of visitedSlice) {
                    const node = this.graph.getNodeById(entry.id);
                    if (node) this._drawNode(node, runColor, 255, fitScale);
                }
            }
        }

        this._drawTextLabels(fitScale);

        pop();
        drawingContext.restore();

        noFill();
        stroke(AppPalette.border.medium);
        strokeWeight(1);
        rect(leftW, EXPECTATION_TOP_CLEARANCE, rightW, availH);

        if (vm.selectedRunIndex !== null) {
            const rollout = state.getDisplaySlice()[vm.selectedRunIndex];
            if (rollout) {
                const utility = state._getUtility(rollout, state.currentT);
                noStroke();
                fill(AppPalette.accent.yellow);
                textSize(13);
                textAlign(LEFT, TOP);
                textFont(Typography.mono());
                text(`Run ${String(vm.selectedRunIndex + 1).padStart(2, '0')} · G = ${utility.toFixed(2)}`, leftW + 12, EXPECTATION_TOP_CLEARANCE + 10);
            }
        }
    }
```

- [ ] **Step 3: Delete `_drawFocusedPanel()` entirely**

Remove the whole method (originally lines 560-618, now shifted — locate by its `_drawFocusedPanel(canvasW, canvasH) {` signature) — its logic has been folded into `_drawGraphPanel()` above.

- [ ] **Step 4: Rewrite `handleClick()` — grid-only hit-testing, toggle-select instead of enter-focus**

Change:
```js
    handleClick(mx, my) {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        if (!state.computed) return;

        if (vm.focusedRunIndex !== null) {
            return;
        }

        const { panels } = vm.panelLayout || { panels: [] };
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
                this.enterFocusMode(i);
                return;
            }
        }
    }
```
to:
```js
    handleClick(mx, my) {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        if (!state.computed || vm.leftView !== 'grid') return;

        const { panels } = vm.panelLayout || { panels: [] };
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
                // Clicking an already-selected panel deselects it (toggle), matching this
                // codebase's other click-to-select-or-clear conventions.
                this.selectRun(vm.selectedRunIndex === i ? null : i);
                return;
            }
        }
    }

    // Sets which rollout's path the shared right-pane graph panel highlights. index === null
    // clears the selection (bare graph). Replaces the old enterFocusMode(index) - no longer
    // triggers any canvas mode switch, just updates which run is highlighted.
    selectRun(index) {
        const vm = this.expectationViewModel;
        vm.selectedRunIndex = index;
        this._notifyDataChanged();
        if (typeof redraw === 'function') redraw();
    }
```

- [ ] **Step 5: Rewrite `handleMouseMove()` — drop the focused-mode early return**

Change:
```js
    handleMouseMove(mx, my) {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        const prevHovered = vm.hoveredRun;

        if (!state.computed || vm.focusedRunIndex !== null) {
            vm.hoveredRun = null;
            return prevHovered !== null;
        }

        const { panels } = vm.panelLayout || { panels: [] };
```
to:
```js
    handleMouseMove(mx, my) {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        const prevHovered = vm.hoveredRun;

        if (!state.computed || vm.leftView !== 'grid') {
            vm.hoveredRun = null;
            return prevHovered !== null;
        }

        const { panels } = vm.panelLayout || { panels: [] };
```
(the rest of the method body is unchanged).

- [ ] **Step 6: Simplify `_buildScrubberTicks()` and `_scrubberIndexForCurrentT()` — always numeric**

Change:
```js
    _buildScrubberTicks() {
        const vm = this.expectationViewModel;
        const focusedRollout = vm.focusedRunIndex !== null
            ? this.expectationState.getDisplaySlice()[vm.focusedRunIndex]
            : null;

        if (!focusedRollout) {
            const maxT = this.expectationState.maxT || 0;
            const ticks = [];
            for (let t = 0; t <= maxT; t++) ticks.push(String(t));
            return ticks;
        }

        // focusedRollout.trace is produced by TraceGenerator.generate() - the exact same
        // {id, type, name} shape SimulationState.visited uses for Build/Policy (confirmed by
        // reading runExpectationInteractor.js/traceGenerator.js), and
        // rollouts.push({ trace, rewards, utilities, numSteps }) confirms `.trace` is the field
        // name.
        return focusedRollout.trace.map(entry => entry.name);
    }

    // Focus-view ticks are one per RAW trace node (state AND action alternating, 2*numSteps+1
    // entries - see _buildScrubberTicks()), while currentT is in TRANSITIONS (0..maxT). Grid
    // view's plain numeric ticks are already 1:1 with currentT (no conversion needed there).
    // Converts currentT -> the correct scrubber tick index for whichever view is showing.
    _scrubberIndexForCurrentT() {
        const vm = this.expectationViewModel;
        return vm.focusedRunIndex !== null
            ? this.expectationState.currentT * 2
            : this.expectationState.currentT;
    }
```
to:
```js
    // The shared right-pane graph panel (not a full-canvas "focused" takeover) has no canonical
    // single path to label ticks with even when a run is selected, since the left pane's own
    // grid/chart view is what the scrubber really scrubs - so ticks are always plain numeric
    // ("0","1","2"...), regardless of selection. (Before the MC screen split, "focused mode"
    // used real trace-name ticks; that mode no longer exists.)
    _buildScrubberTicks() {
        const maxT = this.expectationState.maxT || 0;
        const ticks = [];
        for (let t = 0; t <= maxT; t++) ticks.push(String(t));
        return ticks;
    }

    _scrubberIndexForCurrentT() {
        return this.expectationState.currentT;
    }
```

- [ ] **Step 7: Simplify the scrubber's `onScrub` callback in `setupScrubber()`**

Change:
```js
            onScrub: (index, isFinal) => {
                this.stopPlay();
                const vm = this.expectationViewModel;
                this.expectationState.currentT = vm.focusedRunIndex !== null ? Math.floor(index / 2) : index;
                if (typeof redraw === 'function') redraw();
                this._notifyDataChanged();
            },
```
to:
```js
            onScrub: (index, isFinal) => {
                this.stopPlay();
                this.expectationState.currentT = index;
                if (typeof redraw === 'function') redraw();
                this._notifyDataChanged();
            },
```

- [ ] **Step 8: Delete `enterFocusMode()`, `exitFocusMode()`, `_createBackButton()`, `_removeBackButton()`**

Remove all four methods entirely (their bodies are no longer reachable from anywhere after Steps 4/6).

- [ ] **Step 9: Simplify `handleKey()`**

Change:
```js
    handleKey(key) {
        if (key === 'Escape') this.exitFocusMode();
    }
```
to:
```js
    // No-op: "focused mode" (and its Escape-to-exit) no longer exists after the MC screen split
    // - kept as a method (rather than removed) because main.js's global keyPressed() calls it
    // unconditionally while Values -> Monte Carlo is active.
    handleKey(key) {}
```

- [ ] **Step 10: Update `teardown()`**

Change:
```js
    teardown() {
        this.stopPlay();
        this.exitFocusMode();
        this._removeScrubber();
        this._imageCache.clear();
    }
```
to:
```js
    teardown() {
        this.stopPlay();
        this._removeScrubber();
        this._imageCache.clear();
    }
```

- [ ] **Step 11: Update `resize()` to reposition the new chart view's DOM bounds**

Change:
```js
    resize(canvasW, canvasH, topOffset) {
        this._topOffset = topOffset;
        if (this._scrubber) {
            this._scrubber.resize(0, 0, canvasW);
            this._positionScrubberAboveDock();
        }
        this.expectationViewModel.invalidateLayout();
    }
```
to:
```js
    resize(canvasW, canvasH, topOffset) {
        this._topOffset = topOffset;
        if (this._scrubber) {
            this._scrubber.resize(0, 0, canvasW);
            this._positionScrubberAboveDock();
        }
        this.expectationViewModel.invalidateLayout();
        if (this._expectationChartView) {
            const { leftW } = this.expectationViewModel.splitWidths(canvasW);
            this._expectationChartView.updateBounds(0, topOffset, leftW, canvasH);
        }
    }
```

- [ ] **Step 12: Grep to confirm no dangling references remain in this file**

Run: `grep -n "focusedRunIndex\|_drawFocusedPanel\|enterFocusMode\|exitFocusMode\|_createBackButton\|_removeBackButton\|_backBtn\|expectation-back-btn" src/main/view/expectationView.js`

Expected: no output. (The `.expectation-back-btn` CSS class in `style.css` is now dead — leave the CSS rule in place; removing unused CSS is out of scope for this task and not requested.)

- [ ] **Step 13: Browser verification**

Start the server (from the worktree root): `python3 -m http.server 8010`

Using a Node script with `playwright-core` (already vendored — run it from the worktree root so module resolution works), drive:
1. Load `http://localhost:8010`, build a small MDP (one state with a start node, one action, 2+ probabilistic outcomes), or use a `test_schema/*.json` fixture via Open.
2. Switch to Values → Monte Carlo (top bar's "Monte Carlo" segment, or via the goal card).
3. Assert: the canvas shows a visible vertical divider roughly 52% across, mini-panels on the left, and a single graph rendering on the right — both panes visible simultaneously (no full-canvas takeover of either).
4. Click a mini-panel on the left. Assert: that panel's border turns the hover/selected accent color, AND the right pane now shows that run's path highlighted (not a full-canvas replacement — the left grid must still be visible).
5. Click the same mini-panel again. Assert: the right pane's highlight clears (back to bare graph), left grid unaffected.
6. Advance the scrubber (Step button or drag). Assert: the right pane's highlighted path extends to match, and the console shows zero errors.
7. Check both light and dark theme (toggle via the top bar) — confirm the divider line and right-pane card background are visible and readable in both.

- [ ] **Step 14: Commit**

```bash
git add src/main/view/expectationView.js
git commit -m "Replace MC focused mode with an always-on 52/48 split (grid left, shared graph panel right)"
```

---

### Task 3: `McLeftViewPill` — new `[Grid | Chart]` floating pill

**Files:**
- Create: `src/main/view/mcLeftViewPill.js`
- Modify: `style.css` (new CSS block)
- Modify: `index.html` (one new `<script>` tag)

**Interfaces:**
- Consumes: `canvasViewModel.expectationViewModel.leftView` (Task 1; already-wired sibling-state convention — `canvasViewModel.expectationViewModel = expectationViewModel` already exists in `main.js`).
- Produces: `McLeftViewPill` class — `constructor(callbacks, canvasViewModel)`, `.setup(topOffset)`, `.updateBounds(x, width)`, `.refresh()`, `.show()`, `.hide()`. `callbacks.onSelectLeftView(key)` fired on click, where `key` is `'grid'` or `'chart'`.

- [ ] **Step 1: Create `src/main/view/mcLeftViewPill.js`**

```js
// Floating pill, top-right of the LEFT 52% pane specifically (not the whole canvas) in Values ->
// Monte Carlo: a [Grid | Chart] segmented switch for expectationViewModel.leftView. Modeled
// directly on treeViewPill.js (same two-option DOM/CSS skeleton) - kept as a separate file rather
// than a shared parameterized component, matching this codebase's one-file-per-floating-pill
// convention (mcRunsPill.js, treeViewPill.js, zoomPill.js are all separate files too).
const MC_LEFT_VIEW_PILL_OPTIONS = [
    { key: 'grid',  label: 'Grid' },
    { key: 'chart', label: 'Chart' }
];

class McLeftViewPill {
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
        container.className = 'mc-left-view-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const track = document.createElement('div');
        track.className = 'mc-left-view-pill-track';
        container.appendChild(track);

        MC_LEFT_VIEW_PILL_OPTIONS.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mc-left-view-pill-btn';
            btn.textContent = opt.label;
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (this.callbacks.onSelectLeftView) this.callbacks.onSelectLeftView(opt.key);
            });
            track.appendChild(btn);
            this.buttons[opt.key] = btn;
        });

        this.refresh();
    }

    // x, width: the LEFT PANE's bounds specifically (leftW from ExpectationViewModel.splitWidths),
    // not the full canvas - right-edge anchored within that narrower region, same convention as
    // every other floating pill in this codebase.
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
        const current = this.viewModel.expectationViewModel ? this.viewModel.expectationViewModel.leftView : 'grid';
        Object.entries(this.buttons).forEach(([key, btn]) => {
            btn.classList.toggle('mc-left-view-pill-btn--active', key === current);
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

- [ ] **Step 2: Add CSS to `style.css`**

Add this block immediately after the existing `.tree-view-pill-btn--active` rule (search for that selector to find the insertion point):
```css
/* ── MC left-pane [Grid | Chart] pill (Phase 3a) ─────────────────────────── */

.mc-left-view-pill {
  position: absolute;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
}

.mc-left-view-pill-track {
  display: flex;
  gap: 2px;
  background: var(--surface-card2, var(--bg-card));
  border: 1px solid var(--border-hairline, var(--border-light));
  border-radius: 8px;
  padding: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.mc-left-view-pill-btn {
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

.mc-left-view-pill-btn:hover {
  background: var(--surface-hover, var(--bg-dark-hover));
}

.mc-left-view-pill-btn--active {
  background: var(--accent-orange);
  color: var(--color-primary-contrast, var(--text-white));
}
```
(`--accent-orange` matches this codebase's existing convention of orange = Monte Carlo's accent color throughout `estimatorPill.js`/`mcRunsPill.js`.)

- [ ] **Step 3: Add the script tag to `index.html`**

Insert immediately after the `mcRunsPill.js` line:
```html
    <script src="src/main/view/mcRunsPill.js"></script>
    <script src="src/main/view/mcLeftViewPill.js"></script>
```

- [ ] **Step 4: Syntax check**

Run: `node --check src/main/view/mcLeftViewPill.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/main/view/mcLeftViewPill.js style.css index.html
git commit -m "Add McLeftViewPill: new [Grid | Chart] floating pill for MC's left pane"
```

(This pill isn't wired to `main.js` yet — that's Task 5. It's safe to commit unwired since nothing constructs it until then, matching this plan's per-task incremental-commit style.)

---

### Task 4: `ExpectationChartView` — inline Convergence + Histogram for the left pane

**Files:**
- Create: `src/main/view/expectationChartView.js`
- Modify: `style.css` (new CSS block)
- Modify: `index.html` (one new `<script>` tag)

**Interfaces:**
- Consumes: `ChartDataBuilders.buildConvergenceData(expectationState, valueIterationState)`, `ChartDataBuilders.buildHistogramData(expectationState, t)` (both existing, unchanged, from `src/main/view/helpers/chartDataBuilders.js`), `ExpectationViewModel.highlightedRun` (Task 1), global `Chart` (Chart.js, already vendored and used by `chartDock.js` the same way).
- Produces: `ExpectationChartView` class — `constructor(canvasViewModel, expectationState, expectationViewModel, valueIterationState)` (same 4 args as `ChartDock`, for symmetry/reuse), `.setup()`, `.updateBounds(x, y, width, height)`, `.refresh()`, `.show()`, `.hide()`.

- [ ] **Step 1: Create `src/main/view/expectationChartView.js`**

```js
// Inline Convergence + Histogram charts for the MC left pane's "Chart" view (Phase 3a) - a real
// DOM component (like ChartDock, not a p5-canvas overlay), layered over the canvas region
// ExpectationView.draw() intentionally leaves blank while leftView === 'chart'. Deliberately NOT
// user-configurable per-slot like ChartDock's two independently-pickable slots: this view always
// shows Convergence on top, Histogram below - a simpler fixed layout for this phase. Reuses
// ChartDataBuilders' existing pure data-shaping functions verbatim - no new chart math here,
// only a new render target.
class ExpectationChartView {
    constructor(canvasViewModel, expectationState, expectationViewModel, valueIterationState) {
        this.viewModel = canvasViewModel;
        this.expectationState = expectationState;
        this.expectationViewModel = expectationViewModel;
        this.valueIterationState = valueIterationState;

        this.containerEl = null;
        this._slotBodyEls = [null, null];
        this._chartInstances = [null, null];
        this._bounds = null;
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'expectation-chart-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const labels = ['V̂(S₀) vs V*', 'Return distribution'];
        for (let i = 0; i < 2; i++) {
            const slot = document.createElement('div');
            slot.className = 'expectation-chart-view-slot';

            const caption = document.createElement('span');
            caption.className = 'expectation-chart-view-caption';
            caption.textContent = labels[i];
            slot.appendChild(caption);

            const body = document.createElement('div');
            body.className = 'expectation-chart-view-body';
            slot.appendChild(body);
            this._slotBodyEls[i] = body;

            container.appendChild(slot);
        }

        this.hide();
    }

    // x, y, width, height: the LEFT PANE's full box (leftW from ExpectationViewModel.splitWidths,
    // topOffset..canvasH vertically) - a full rectangle, not edge-anchored like the segmented
    // pills, since this component occupies the whole pane rather than floating at one corner.
    updateBounds(x, y, width, height) {
        this._bounds = { x, y, width, height };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        const { x, y, width, height } = this._bounds;
        this.containerEl.style.left = x + 'px';
        this.containerEl.style.top = y + 'px';
        this.containerEl.style.width = width + 'px';
        this.containerEl.style.height = height + 'px';
    }

    refresh() {
        if (!this.containerEl || this.containerEl.style.display === 'none') return;
        this._renderConvergence();
        this._renderHistogram();
    }

    _renderConvergence() {
        const body = this._slotBodyEls[0];
        if (!body) return;
        if (this._chartInstances[0]) {
            this._chartInstances[0].destroy();
            this._chartInstances[0] = null;
        }
        body.innerHTML = '';
        if (typeof Chart === 'undefined') return;

        const { mcMeans, viValues, vStar } = ChartDataBuilders.buildConvergenceData(
            this.expectationState, this.valueIterationState);

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        const maxLen = Math.max(mcMeans.length, viValues.length, 1);

        const datasets = [];
        if (viValues.length > 0) {
            const methodEntry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);
            datasets.push({
                label: `V (${methodEntry.pillLabel})`,
                data: viValues.map((y, x) => ({ x, y })),
                borderColor: AppPalette.accent[methodEntry.accent],
                borderWidth: 2, pointRadius: 0, tension: 0
            });
        }
        if (mcMeans.length > 0) {
            datasets.push({
                label: 'E[G] (MC)',
                data: mcMeans.map((y, x) => ({ x, y })),
                borderColor: AppPalette.accent.orange,
                borderWidth: 1.5, pointRadius: 1, tension: 0.3
            });
        }
        if (vStar !== null) {
            datasets.push({
                label: 'V*',
                data: [{ x: 0, y: vStar }, { x: maxLen - 1, y: vStar }],
                borderColor: AppPalette.text.muted,
                borderDash: [4, 4], borderWidth: 1, pointRadius: 0
            });
        }

        const highlightedRun = this.expectationViewModel ? this.expectationViewModel.highlightedRun : null;
        if (highlightedRun !== null) {
            const allY = [...viValues, ...mcMeans, vStar].filter(v => typeof v === 'number' && isFinite(v));
            if (allY.length > 0) {
                const yMin = Math.min(...allY);
                const yMax = Math.max(...allY);
                const t = this.expectationState.currentT;
                datasets.push({
                    label: `ep ${highlightedRun + 1}`,
                    data: [{ x: t, y: yMin }, { x: t, y: yMax }],
                    borderColor: AppPalette.accent.yellow,
                    borderDash: [3, 3], borderWidth: 1.5, pointRadius: 0
                });
            }
        }

        this._chartInstances[0] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { type: 'linear', ticks: { font: { size: 9 }, color: AppPalette.text.muted, stepSize: 1 }, grid: { color: AppPalette.border.chartGrid } },
                    y: { ticks: { font: { size: 9 }, color: AppPalette.text.muted }, grid: { color: AppPalette.border.chartGrid } }
                }
            }
        });
    }

    _renderHistogram() {
        const body = this._slotBodyEls[1];
        if (!body) return;
        if (this._chartInstances[1]) {
            this._chartInstances[1].destroy();
            this._chartInstances[1] = null;
        }
        body.innerHTML = '';
        if (typeof Chart === 'undefined') return;

        const t = this.expectationState.currentT;
        const { bins, counts, runIndexByBin } = ChartDataBuilders.buildHistogramData(this.expectationState, t);
        if (bins.length === 0) return;

        const highlightedRun = this.expectationViewModel ? this.expectationViewModel.highlightedRun : null;
        let highlightedBinIdx = null;
        if (highlightedRun !== null && runIndexByBin) {
            for (let i = 0; i < runIndexByBin.length; i++) {
                if (runIndexByBin[i].includes(highlightedRun)) { highlightedBinIdx = i; break; }
            }
        }

        const bgColors = bins.map((_, i) => {
            if (highlightedBinIdx !== null) {
                return i === highlightedBinIdx ? AppPalette.accent.yellow : ColorUtils.applyAlpha(AppPalette.text.muted, 40);
            }
            return i < bins.length / 2 ? AppPalette.accent.red : AppPalette.accent.orange;
        });

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        this._chartInstances[1] = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: bins.map(b => b.label),
                datasets: [{ data: counts, backgroundColor: bgColors }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { font: { size: 8 }, color: AppPalette.text.muted }, grid: { display: false } },
                    y: { ticks: { font: { size: 9 }, color: AppPalette.text.muted }, grid: { color: AppPalette.border.chartGrid }, beginAtZero: true }
                }
            }
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

- [ ] **Step 2: Add CSS to `style.css`**

Add this block immediately after the existing `.chart-dock-empty` rule (search for `.chart-dock-empty` to find the insertion point — keep it near the other chart-dock rules since it's visually/structurally analogous):
```css
/* ── MC left-pane inline Chart view (Phase 3a) ───────────────────────────── */

.expectation-chart-view {
  position: fixed;
  z-index: 8;
  background: var(--surface-canvas);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.expectation-chart-view-slot {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-hairline, var(--border-light));
}

.expectation-chart-view-slot:first-child {
  border-top: none;
}

.expectation-chart-view-caption {
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 10px;
  color: var(--text-muted);
  padding: 6px 8px 2px;
  flex-shrink: 0;
}

.expectation-chart-view-body {
  flex: 1;
  min-height: 0;
  padding: 0 8px 8px;
  position: relative;
}
```
(`z-index: 8` — below every floating pill (`z-index: 10`) and below `ChartDock` (`z-index: 15`, though `ChartDock` is hidden during MC per Task 5 so they never actually overlap in practice) but above the raw p5 canvas, which has no explicit z-index/is the base layer.)

- [ ] **Step 3: Add the script tag to `index.html`**

Insert immediately after the `expectationView.js` line:
```html
    <script src="src/main/view/expectationView.js"></script>
    <script src="src/main/view/expectationChartView.js"></script>
```

- [ ] **Step 4: Syntax check**

Run: `node --check src/main/view/expectationChartView.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/main/view/expectationChartView.js style.css index.html
git commit -m "Add ExpectationChartView: inline Convergence + Histogram for MC's Chart left-pane view"
```

(Also unwired until Task 5, same rationale as Task 3.)

---

### Task 5: Wire everything together in `main.js`

**Files:**
- Modify: `src/main/app/main.js`

**Interfaces:**
- Consumes: `McLeftViewPill` (Task 3), `ExpectationChartView` (Task 4), `ExpectationView.setExpectationChartView()` (Task 2), `ExpectationViewModel.leftView`/`.splitWidths()` (Task 1).

- [ ] **Step 1: Construct `expectationChartView` and `mcLeftViewPill`**

Find the existing `mcRunsPill` construction (around line 935: `mcRunsPill = new McRunsPill({}, canvasViewModel);` … `mainView.mcRunsPill = mcRunsPill;`) and add immediately after it:
```js
    const mcLeftViewPill = new McLeftViewPill({
        onSelectLeftView: (key) => {
            expectationViewModel.leftView = key;
            mcLeftViewPill.refresh();
            if (mainView && mainView.expectationChartView) {
                if (key === 'chart') mainView.expectationChartView.show();
                else mainView.expectationChartView.hide();
            }
            if (typeof redraw === 'function') redraw();
        }
    }, canvasViewModel);
    mainView.mcLeftViewPill = mcLeftViewPill;
```

Find the existing `ExpectationView` construction (around line 1212-1217: `const expectationView = new ExpectationView(...); mainView.expectationView = expectationView;`) and add immediately after it:
```js
    const expectationChartView = new ExpectationChartView(
        canvasViewModel, expectationState, expectationViewModel, valueIterationState);
    mainView.expectationChartView = expectationChartView;
    expectationView.setExpectationChartView(expectationChartView);
```

- [ ] **Step 2: Call `.setup()` for both new components during app setup**

Find where `mcRunsPill.setup(...)` and `chartDock.setup()` are called (search for `.setup(` calls in the `setup()` function near where `mainView.setup()` runs) and add:
```js
    mcLeftViewPill.setup(mainView.TOP_BARS_HEIGHT);
    expectationChartView.setup();
```
(Match the exact surrounding call style/placement of the other pill `.setup()` calls — they're all called once, during the same app-bootstrap `setup()` phase.)

- [ ] **Step 2b: Fix `onDisplayRunsChange` — a call site this plan's original research missed**

Task 1 already renamed `ExpectationViewModel.focusedRunIndex` to `selectedRunIndex`, and Task 2 deletes `ExpectationView.exitFocusMode()` entirely (folding "focused mode" into the always-visible right pane). There is one more call site neither of those tasks' briefs mentioned, in the `onDisplayRunsChange` handler (search for `const onDisplayRunsChange = (displayRuns) => {`):
```js
    const onDisplayRunsChange = (displayRuns) => {
        expectationState.displayRuns = displayRuns;
        if (expectationViewModel.focusedRunIndex !== null && expectationViewModel.focusedRunIndex >= displayRuns) {
            if (expectationView) expectationView.exitFocusMode();
        }
        expectationViewModel.invalidateLayout();
        rightPanel.updateContent();
        if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.refresh();
        redraw();
    };
```
Replace the guard with the `selectedRunIndex`-based equivalent — clearing the selection (instead of exiting a takeover mode that no longer exists) when the run count shrinks below the currently selected index:
```js
    const onDisplayRunsChange = (displayRuns) => {
        expectationState.displayRuns = displayRuns;
        if (expectationViewModel.selectedRunIndex !== null && expectationViewModel.selectedRunIndex >= displayRuns) {
            expectationViewModel.selectedRunIndex = null;
        }
        expectationViewModel.invalidateLayout();
        rightPanel.updateContent();
        if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.refresh();
        redraw();
    };
```

- [ ] **Step 3: Update the `values` cold-entry hook — stop unconditionally showing `chartDock`**

Find (in the `onEnter` object registered via `canvasController.registerModeLifecycle(...)`):
```js
        values: () => {
            if (mainView && mainView.chartDock) {
                mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.chartDock.show();
            }
            if (mainView && mainView.estimatorPill) {
                mainView.estimatorPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.estimatorPill.show();
                mainView.estimatorPill.refresh();
            }
            const sv = canvasViewModel.valuesSubView;
            if (sv === 'mc') {
                enterMCSubView();
                if (mainView && mainView.zoomPill) mainView.zoomPill.hide();
                if (mainView && mainView.viSweepChip) mainView.viSweepChip.hide();
                if (mainView && mainView.mcRunsPill) {
                    mainView.mcRunsPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.mcRunsPill.show();
                    mainView.mcRunsPill.refresh();
                }
            } else if (sv === 'vi') {
                if (mainView && mainView.zoomPill) mainView.zoomPill.show();
                if (mainView && mainView.viSweepChip) {
                    mainView.viSweepChip.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.viSweepChip.show();
                    mainView.viSweepChip.refresh();
                }
                refreshLearningTreePill();
            }
        }
```
Replace with:
```js
        values: () => {
            if (mainView && mainView.estimatorPill) {
                mainView.estimatorPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.estimatorPill.show();
                mainView.estimatorPill.refresh();
            }
            const sv = canvasViewModel.valuesSubView;
            if (sv === 'mc') {
                enterMCSubView();
                if (mainView && mainView.zoomPill) mainView.zoomPill.hide();
                if (mainView && mainView.viSweepChip) mainView.viSweepChip.hide();
                // Chart view (Phase 3a's inline Convergence/Histogram) replaces the bottom dock
                // for Monte Carlo specifically - the dock stays hidden here, unlike the vi branch
                // below which still shows it (Iteration's own screen split is Phase 3b, unstarted).
                if (mainView && mainView.chartDock) mainView.chartDock.hide();
                if (mainView && mainView.mcRunsPill) {
                    mainView.mcRunsPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.mcRunsPill.show();
                    mainView.mcRunsPill.refresh();
                }
                setUpMCSplitChrome();
            } else if (sv === 'vi') {
                if (mainView && mainView.chartDock) {
                    mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.chartDock.show();
                }
                if (mainView && mainView.zoomPill) mainView.zoomPill.show();
                if (mainView && mainView.viSweepChip) {
                    mainView.viSweepChip.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.viSweepChip.show();
                    mainView.viSweepChip.refresh();
                }
                refreshLearningTreePill();
            }
        }
```

- [ ] **Step 4: Update `onEnterSubView.mc` / `onEnterSubView.vi`**

Find:
```js
    onEnterSubView: {
        mc: () => {
            enterMCSubView();
            if (mainView && mainView.zoomPill) mainView.zoomPill.hide();
            if (mainView && mainView.estimatorPill) mainView.estimatorPill.refresh();
            if (mainView && mainView.viSweepChip) mainView.viSweepChip.hide();
            if (learningTreePill) learningTreePill.hide();
            if (mainView && mainView.mcRunsPill) {
                mainView.mcRunsPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.mcRunsPill.show();
                mainView.mcRunsPill.refresh();
            }
        },
        vi: () => {
            // VI has no other "run on enter" behavior - starts via explicit Play click
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (mainView && mainView.estimatorPill) mainView.estimatorPill.refresh();
            if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.hide();
            if (mainView && mainView.viSweepChip) {
                mainView.viSweepChip.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.viSweepChip.show();
                mainView.viSweepChip.refresh();
            }
            refreshLearningTreePill();
        }
    },
```
Replace with:
```js
    onEnterSubView: {
        mc: () => {
            enterMCSubView();
            if (mainView && mainView.zoomPill) mainView.zoomPill.hide();
            if (mainView && mainView.estimatorPill) mainView.estimatorPill.refresh();
            if (mainView && mainView.viSweepChip) mainView.viSweepChip.hide();
            if (learningTreePill) learningTreePill.hide();
            if (mainView && mainView.chartDock) mainView.chartDock.hide();
            if (mainView && mainView.mcRunsPill) {
                mainView.mcRunsPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.mcRunsPill.show();
                mainView.mcRunsPill.refresh();
            }
            setUpMCSplitChrome();
        },
        vi: () => {
            // VI has no other "run on enter" behavior - starts via explicit Play click
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (mainView && mainView.estimatorPill) mainView.estimatorPill.refresh();
            if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.hide();
            if (mainView && mainView.mcLeftViewPill) mainView.mcLeftViewPill.hide();
            if (mainView && mainView.expectationChartView) mainView.expectationChartView.hide();
            if (mainView && mainView.chartDock) {
                mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.chartDock.show();
            }
            if (mainView && mainView.viSweepChip) {
                mainView.viSweepChip.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.viSweepChip.show();
                mainView.viSweepChip.refresh();
            }
            refreshLearningTreePill();
        }
    },
```

- [ ] **Step 5: Add the `setUpMCSplitChrome()` helper**

Add this new function near `enterMCSubView()`/`leaveMCSubView()` (same section of `main.js`, right after `leaveMCSubView()`'s closing brace):
```js
// Positions/shows the Phase 3a split's own chrome (the [Grid|Chart] pill + the inline chart
// view's bounds) - called from both the cold-entry values() hook and onEnterSubView.mc, since
// both paths need this and the geometry math is identical either way.
function setUpMCSplitChrome() {
    if (!mainView) return;
    const panelW = rightPanel ? rightPanel.getWidth() : 272;
    const fullCanvasW = windowWidth - panelW;
    const canvasW = mainView._valuesPaneWidths(fullCanvasW).mc;
    const topOffset = mainView.TOP_BARS_HEIGHT;
    const canvasH = windowHeight - topOffset - mainView.getDockHeight();
    const { leftW } = expectationViewModel.splitWidths(canvasW);

    if (mainView.mcLeftViewPill) {
        mainView.mcLeftViewPill.updateBounds(0, leftW);
        mainView.mcLeftViewPill.show();
        mainView.mcLeftViewPill.refresh();
    }
    if (mainView.expectationChartView) {
        mainView.expectationChartView.updateBounds(0, topOffset, leftW, canvasH);
        if (expectationViewModel.leftView === 'chart') mainView.expectationChartView.show();
        else mainView.expectationChartView.hide();
    }
}
```

- [ ] **Step 6: Hide the new chrome when leaving Values mode entirely**

Find the `onLeave.values` hook (search for `values: () => {` inside the `onLeave:` object — it currently hides `chartDock`/`estimatorPill`/`mcRunsPill`/`viSweepChip`/`learningTreePill`) and add two more hides alongside the existing `mcRunsPill.hide()` line:
```js
            if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.hide();
            if (mainView && mainView.mcLeftViewPill) mainView.mcLeftViewPill.hide();
            if (mainView && mainView.expectationChartView) mainView.expectationChartView.hide();
```

- [ ] **Step 7: Grep to confirm nothing was missed**

Run: `grep -n "mainView.chartDock" src/main/app/main.js`

Manually confirm each remaining call site is intentional per this task's design (`onLeave.values` hides it — unaffected by this task; `onEnter.values`'s `vi` branch and `onEnterSubView.vi` show it; `onEnter.values`'s `mc` branch and `onEnterSubView.mc` hide it; `main.js`'s dock-drag-resize callback, `onDockResize`, is in `mainView.js` not `main.js` and is unaffected since dragging can only happen while the dock is actually visible, i.e. only in `vi`).

- [ ] **Step 8: Browser verification — full sub-view switching matrix**

Using the same playwright-core setup as Task 2:
1. Load the app, build/import a small MDP, set a start node.
2. Enter Values → Monte Carlo. Assert: `chart-dock` element has `display: none` (or is absent from the visible layout), the `[Grid|Chart]` pill is visible top-right of the left pane, `mcRunsPill` is visible, the split canvas renders as in Task 2's verification.
3. Click "Chart" on the new pill. Assert: the left pane's canvas region goes blank/background-only, and the `expectation-chart-view` DOM element becomes visible showing two stacked charts (Convergence on top, Histogram below) sized to the left pane; the right pane's shared graph panel is still visible and unaffected.
4. Click "Grid" again. Assert: the chart view DOM hides, the mini-panel grid reappears.
5. Switch to Values → Iteration (top bar). Assert: `chart-dock` becomes visible again (Iteration's own dock usage, unaffected by this phase), the `[Grid|Chart]` pill and inline chart view are hidden.
6. Switch back to Values → Monte Carlo. Assert: whichever `leftView` was last selected (grid or chart) is restored correctly, `chart-dock` is hidden again.
7. Leave Values mode entirely (switch to Build). Re-enter Values mode cold (not via sub-view switch, e.g. via Reset or the goal card) into Monte Carlo. Assert: same correct chart-dock-hidden / split-chrome-visible state as step 2.
8. Resize the browser window while in Values → Monte Carlo (in both Grid and Chart left-view states). Assert: the divider, right pane, and (if in Chart view) the inline chart view's DOM box all resize/reposition to match the new 52/48 split with zero console errors.
9. Check both light and dark theme.

- [ ] **Step 9: Commit**

```bash
git add src/main/app/main.js
git commit -m "Wire McLeftViewPill + ExpectationChartView into main.js; hide ChartDock during MC"
```

---

### Task 6: `rightPanel.js` rename, full regression pass, `CLAUDE.md`

**Files:**
- Modify: `src/main/view/rightPanel.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `ExpectationViewModel.selectedRunIndex` (Task 1).

- [ ] **Step 1: Rename `focusedRunIndex` → `selectedRunIndex` in `_renderSelectedRunSection`**

Find (around line 2198-2202, per the "Only rendered while a mini-panel card is focused" comment):
```js
    // Only rendered while a mini-panel card is focused (expectationViewModel.focusedRunIndex !==
    // ...
    _renderSelectedRunSection(parent, state, t) {
        const vm = this.viewModel.expectationViewModel;
        if (!vm || vm.focusedRunIndex === null || vm.focusedRunIndex === undefined) return;

        const focusedIdx = vm.focusedRunIndex;
```
Replace with (renaming the field only — leave the section's rendered title/UI copy, local variable names inside the method body, and all downstream logic untouched, since selection semantics are unchanged, only which action sets the field changed):
```js
    // Rendered whenever a mini-panel card is selected (expectationViewModel.selectedRunIndex !==
    // null) - selection now persists alongside the always-visible grid (Phase 3a's screen split
    // removed the old full-canvas "focused mode"; selecting a run just highlights it on the
    // shared right-pane graph panel instead).
    _renderSelectedRunSection(parent, state, t) {
        const vm = this.viewModel.expectationViewModel;
        if (!vm || vm.selectedRunIndex === null || vm.selectedRunIndex === undefined) return;

        const focusedIdx = vm.selectedRunIndex;
```
(`focusedIdx` as a local variable name inside the method body is fine to leave as-is — it's private to this method and renaming it is optional churn; leave it to minimize diff noise, per YAGNI.)

- [ ] **Step 2: Grep the whole codebase one more time to confirm the rename is complete everywhere**

Run: `grep -rn "focusedRunIndex" src/ style.css index.html`

Expected: no output at all.

- [ ] **Step 3: Syntax check**

Run: `node --check src/main/view/rightPanel.js`
Expected: no output.

- [ ] **Step 4: Full regression pass (playwright-core, from the worktree root)**

In addition to re-running Task 2 and Task 5's own verification scripts once more against the final combined state, specifically also check:
1. **Selected Run panel**: with a run selected (clicked) in the left grid, the right DOM panel's "Selected Run" section appears with that run's trajectory/G value; deselecting (click again) makes it disappear.
2. **Estimate vs exact table**: still renders correctly below the MC panel content (unaffected by this phase — confirm no exception thrown, since it reads `expectationState`/`valueIterationState` directly, not the renamed field).
3. **Policy log** (`_renderPolicyLog()`, from Phase 2): still renders in the MC panel's default view, hover-preview/click-restore still work — confirm this phase didn't disturb it (it's appended after `_renderMcStatsSections()`/`_renderSelectedRunSection`, unrelated call sites).
4. **Play/Step/Reset** in Monte Carlo: Play advances the scrubber and both panes update live; Reset returns `currentT` to 0 and `selectedRunIndex`/`hoveredRun` to a sensible cleared state (confirm by re-reading `expectationState.resetData()`/`leaveMCSubView()` — if `selectedRunIndex` isn't cleared on Reset today, that's fine and matches the old `focusedRunIndex`'s behavior, which also wasn't cleared by Reset — do not introduce new clearing behavior not present before, per YAGNI; only flag it as a note if it seems surprising).
5. **`[16][32][64]` runs pill**: switching run counts still triggers a full grid relayout at the new (left-pane-budgeted) width — confirm the grid doesn't render with stale/full-canvas-width panel positions after a run-count change.
6. Zero console errors across the entire pass; both light and dark theme spot-checked at least once each.

- [ ] **Step 5: Update `CLAUDE.md`**

In the `### Monte Carlo (Values → mc)` section, replace:
```
`ExpectationState` generates and stores multiple rollouts from the start state. `ExpectationViewModel.computeLayout()` lays rollouts into a grid (16/32/64 panels) and computes one shared fit-transform for rendering each rollout's graph into its mini-panel; `expectationScrubber.js` drives a shared `currentT` across all panels. `ExpectationState.getPerStateMeans()` aggregates already-collected rollout data per visited state, feeding the MC column of the "Estimate vs exact" table.
```
with:
```
`ExpectationState` generates and stores multiple rollouts from the start state. Values → Monte Carlo's canvas is a persistent **52% left / 48% right split** (Phase 3a of the Evaluate redesign roadmap — see `docs/superpowers/specs/2026-07-16-mc-screen-split-design.md`), not the old mutually-exclusive grid/focused-run modes: the left pane toggles between **Grid** (today's mini-panel grid — `ExpectationViewModel.computeLayout()` lays rollouts into a grid of 16/32/64 panels and computes one shared fit-transform for rendering each rollout's graph into its mini-panel) and **Chart** (`expectationChartView.js` — Convergence + Histogram rendered inline via the same `chartDataBuilders.js` pure functions the bottom `ChartDock` uses, replacing that dock for Monte Carlo specifically; `ChartDock` itself still serves Values → Iteration unchanged) via the floating `[Grid | Chart]` pill (`mcLeftViewPill.js`). The right pane (`ExpectationView._drawGraphPanel()`) is a single always-visible rendering of the MDP graph — bare when nothing is selected, or with the selected run's visited-so-far path highlighted (`ExpectationViewModel.selectedRunIndex`, set by clicking a mini-panel; clicking the same panel again deselects). `expectationScrubber.js` drives a shared `currentT` across both panes. `ExpectationState.getPerStateMeans()` aggregates already-collected rollout data per visited state, feeding the MC column of the "Estimate vs exact" table.
```

- [ ] **Step 6: Commit**

```bash
git add src/main/view/rightPanel.js CLAUDE.md
git commit -m "Rename rightPanel's focusedRunIndex read to selectedRunIndex; update CLAUDE.md for the MC screen split; final regression pass"
```

---

## Self-Review Notes

- **Spec coverage:** 52/48 split ✓ (Task 1's `splitWidths`, Task 2's `draw()`); Grid view reused/resized ✓ (Task 2's `_drawGrid`); Chart view inline, replacing the dock for MC ✓ (Task 4, Task 5 Steps 3-4); shared right-pane graph panel with selection-synced highlighting ✓ (Task 2's `_drawGraphPanel`); `[Grid|Chart]` pill top-right of the left pane ✓ (Task 3); non-goals (Tree view, occupancy badges, sparklines, convergence popovers, state-card hover-fade, Iteration's own split) — none implemented, confirmed absent from every task above; `rightPanel.js` — confirmed a real (small) change was needed after all (Task 6's rename), correcting the design spec's own "likely no change" placeholder.
- **Placeholder scan:** none found — every step above has complete, copy-pasteable code or an exact grep/command, no "TBD"/"similar to Task N" left in.
- **Type/name consistency check:** `selectedRunIndex` used identically across Tasks 1, 2, 5 (chart-view highlight), and 6; `leftView` used identically across Tasks 1, 2, 3, 5; `ExpectationChartView`'s constructor signature `(canvasViewModel, expectationState, expectationViewModel, valueIterationState)` matches exactly between Task 4's class definition and Task 5's construction call; `McLeftViewPill`'s `callbacks.onSelectLeftView` name matches between Task 3's class body and Task 5's construction call; `setExpectationChartView`/`mainView.expectationChartView`/`mainView.mcLeftViewPill` field names consistent across Tasks 2, 3, 4, 5.
- **Known, deliberate deviations from the design spec** (both explained inline in the Global Constraints section above): the shared graph panel is a private method group on `ExpectationView`, not a new file; the new Chart view has a fixed (not per-slot-configurable) Convergence-then-Histogram layout.
- **Pre-existing behavior deliberately preserved, not "fixed"**: Reset not clearing `selectedRunIndex`/`hoveredRun` (Task 6 Step 4, item 4) — matches the old `focusedRunIndex`'s behavior exactly; not introduced or changed by this plan.
