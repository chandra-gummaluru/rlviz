# Iteration Screen Split Follow-On: Backup Diagrams + Chart View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Values → Iteration's static "States" label chip with a real `[States | Chart]` toggle pill anchored to the right (MDP) pane; add a Q-table + Convergence `ViChartView` for the "Chart" option (all 3 split quadrants); give `known:full`'s States-view cards a real per-state backup diagram (state → actions with Q-values → outcome next-states, best action starred) instead of a flat value.

**Architecture:** View/viewmodel-tier only, reusing existing domain data (`ValueIterationState.getBackupDetail()`) and existing chart-building functions (`ChartDataBuilders`) throughout. A new floating pill (`viLeftViewPill.js`) mirrors `mcLeftViewPill.js` exactly; a new DOM chart component (`viChartView.js`) mirrors `expectationChartView.js` exactly; a new small Canvas2D rendering module (`viBackupDiagram.js`) draws the per-card diagram onto a dedicated `<canvas>` per card, using plain `fillText()` labels (not `mathRenderer`, to sidestep its main-canvas-only fallback path) and a fixed three-column layout (not `TreeLayout.js`'s general recursive algorithm, which solves a harder, unrelated problem).

**Tech Stack:** Vanilla JS, plain Canvas2D (`CanvasRenderingContext2D`, not p5) for the backup diagram, Chart.js + DOM `<table>` for the chart view — no build step, no bundler, no automated test suite (browser + playwright-core manual verification only).

## Global Constraints

- **Backup diagrams are `known:full`-only.** The other 3 quadrants (`known:partial`, `unknown:partial`, `unknown:full`/Learning Iteration) keep today's flat `state: value` card unconditionally. This is a single branch decided once per card build (`quadrant === 'known:full'`), not a per-frame check.
- **The `[States | Chart]` pill and `ViChartView` apply to all 3 split quadrants** (`known:full`/`known:partial`/`unknown:partial`) — Learning Iteration (`unknown:full`) gets neither; its own existing chrome (Graph/Tree pill, full-canvas rendering) is completely untouched by every task in this plan.
- **No domain layer changes.** `valueIterationState.js` is untouched — `getBackupDetail()`, `ChartDataBuilders.buildQTableData()`/`.buildConvergenceData()` already exist and already return everything needed.
- **The backup diagram does not use `mathRenderer.draw()`.** Its "ready" (cached-image) path is canvas-context-agnostic, but its 2-plus-failures fallback path calls p5 global functions that always draw to the MAIN canvas regardless of which `ctx` was passed — a real mismatch if it ever fires while rendering into a card's own canvas. The diagram draws its own labels via plain `ctx.fillText()` (monospace font) instead. This is a deliberate scope decision from the design spec, not an oversight — do not "fix" it by attempting to make `mathRenderer` fully context-safe in this plan; that would be a separate, broader change.
- **`ChartDock` itself (`chartDock.js`) is not modified.** Its visibility lifecycle for the 3 split quadrants changes (hidden, mirroring how Monte Carlo already stopped using it in Phase 3a); Learning Iteration's own existing relationship with `ChartDock` is untouched.
- **The backup diagram is static — no animation/tweening.** It's a historical snapshot of an already-computed sweep, not a live simulation step.
- **Verification is manual, via a local server** (`python3 -m http.server 8010` from the worktree root) and a real headless-browser script (playwright-core, already vendored) — build a small MDP with a state that has 2+ actions and at least one action with 2+ probabilistic outcomes (so the backup diagram has something interesting to show: multiple actions, multiple transitions per action), run a couple of real sweeps via `page.evaluate()` calls against the domain objects, and visually/structurally confirm the diagram. Check for zero console errors in both themes.

---

### Task 1: `ValueIterationViewModel` — add `leftView`

**Files:**
- Modify: `src/main/adapter/viewmodel/ValueIterationViewModel.js`

**Interfaces:**
- Produces: `ValueIterationViewModel.leftView` (`'states' | 'chart'`, default `'states'`), mirroring `ExpectationViewModel.leftView` exactly.

- [ ] **Step 1: Add the field to `reset()`**

Find:
```js
        this.hoveredSweepIndex = null;
        this.pinnedSweepIndex = null;
    }
```
Replace with:
```js
        this.hoveredSweepIndex = null;
        this.pinnedSweepIndex = null;
        // 'states' (default) or 'chart' - which view the left pane currently shows, for the 3
        // split quadrants (Phase 3b's own screen split). Presentation only, mirrors
        // ExpectationViewModel.leftView's exact shape/convention.
        this.leftView = 'states';
    }
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/main/adapter/viewmodel/ValueIterationViewModel.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/main/adapter/viewmodel/ValueIterationViewModel.js
git commit -m "Add leftView field to ValueIterationViewModel for the States|Chart toggle"
```

---

### Task 2: `ViLeftViewPill` — new `[States | Chart]` pill

**Files:**
- Create: `src/main/view/viLeftViewPill.js`
- Modify: `style.css`
- Modify: `index.html`

**Interfaces:**
- Produces: `ViLeftViewPill` class — `constructor(callbacks, canvasViewModel)`, `.setup(topOffset)`, `.updateBounds(x, width)`, `.refresh()`, `.show()`, `.hide()`. `callbacks.onSelectLeftView(key)` fired on click (`key` is `'states'` or `'chart'`).
- Consumes: `canvasViewModel.valueIterationViewModel.leftView` (Task 1).

- [ ] **Step 1: Create `src/main/view/viLeftViewPill.js`**

```js
// Floating pill, top-right of the RIGHT (MDP graph) pane specifically, in Values -> Iteration's
// 3 split quadrants: a [States | Chart] segmented switch for valueIterationViewModel.leftView.
// Modeled directly on mcLeftViewPill.js (same DOM/CSS skeleton, same "anchored to the pane it
// doesn't control" cosmetic placement) - kept as a separate file rather than a shared
// parameterized component, matching this codebase's one-file-per-floating-pill convention.
const VI_LEFT_VIEW_PILL_OPTIONS = [
    { key: 'states', label: 'States' },
    { key: 'chart',  label: 'Chart' }
];

class ViLeftViewPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        // +64, matching mcLeftViewPill.js's own fix for the identical estimatorPill/mcRunsPill
        // row collision - this pill anchors to the same top-right corner those do.
        this._topOffset = topOffset + 64;

        const container = document.createElement('div');
        container.className = 'vi-left-view-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const track = document.createElement('div');
        track.className = 'vi-left-view-pill-track';
        container.appendChild(track);

        VI_LEFT_VIEW_PILL_OPTIONS.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'vi-left-view-pill-btn';
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
        this.hide();
    }

    // x, width: the RIGHT pane's bounds (leftW, rightW from splitWidths()) - right-edge anchored
    // within that region, same convention as mcLeftViewPill.js.
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
        const current = this.viewModel.valueIterationViewModel ? this.viewModel.valueIterationViewModel.leftView : 'states';
        Object.entries(this.buttons).forEach(([key, btn]) => {
            btn.classList.toggle('vi-left-view-pill-btn--active', key === current);
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

Add this block immediately after the existing `.mc-left-view-pill-btn--active:hover` rule (search for that selector to find the insertion point):
```css
/* ── Iteration [States | Chart] pill (Phase 3b follow-on) ────────────────── */

.vi-left-view-pill {
  position: absolute;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
}

.vi-left-view-pill-track {
  display: flex;
  gap: 2px;
  background: var(--surface-card2, var(--bg-card));
  border: 1px solid var(--border-hairline, var(--border-light));
  border-radius: 8px;
  padding: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.vi-left-view-pill-btn {
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

.vi-left-view-pill-btn:hover {
  background: var(--surface-hover, var(--bg-dark-hover));
}

.vi-left-view-pill-btn--active {
  background: var(--accent-teal);
  color: var(--color-primary-contrast, var(--text-white));
}

.vi-left-view-pill-btn--active:hover {
  background: var(--accent-teal);
}
```
(`--accent-teal` matches Value Iteration's own established accent color, per `AppPalette.valueIteration`/`ValuesMethodMatrix`'s `known:full` entry.)

- [ ] **Step 3: Add the script tag to `index.html`**

Insert immediately after the `mcLeftViewPill.js` line:
```html
    <script src="src/main/view/mcLeftViewPill.js"></script>
    <script src="src/main/view/viLeftViewPill.js"></script>
```

- [ ] **Step 4: Syntax check**

Run: `node --check src/main/view/viLeftViewPill.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/main/view/viLeftViewPill.js style.css index.html
git commit -m "Add ViLeftViewPill: new [States | Chart] pill for Iteration's right pane"
```

(Not wired to `main.js` yet — that's Task 6. Safe to commit unwired.)

---

### Task 3: `viStatesView.js` — remove the static label chip

**Files:**
- Modify: `src/main/view/viStatesView.js`

**Interfaces:**
- Removes: `ViStatesView._labelChipEl` and all its usages (replaced by `ViLeftViewPill`, Task 2).

- [ ] **Step 1: Remove chip creation from `setup()`**

Find:
```js
    setup() {
        if (this.containerEl) return;

        const chip = document.createElement('div');
        chip.className = 'vi-states-view-chip';
        chip.textContent = 'States';
        document.body.appendChild(chip);
        this._labelChipEl = chip;

        const container = document.createElement('div');
```
Replace with:
```js
    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
```

- [ ] **Step 2: Remove the `_labelChipEl` field**

Find:
```js
        this.containerEl = null;
        this._labelChipEl = null;
        this._sectionsEl = null;
```
Replace with:
```js
        this.containerEl = null;
        this._sectionsEl = null;
```

- [ ] **Step 3: Remove chip positioning from `_applyLayout()`**

Find:
```js
    // x, y, width, height: the left pane's full box, same convention as
    // expectationChartView.js's updateBounds(). The label chip is positioned independently,
    // right-edge-anchored within the same x/width (matching mcLeftViewPill.js's own
    // right-edge-anchor convention), dropped a full row below the pane's top to clear
    // estimatorPill's own row (see _applyLayout()'s own comment for why).
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
        if (this._labelChipEl) {
            this._labelChipEl.style.left = (x + width - 12) + 'px';
            // +64 (not +12) - `y` is the pane's own top edge (mainView.TOP_BARS_HEIGHT), flush
            // against the topbar's bottom edge, so a small +12 inset still lands within
            // estimatorPill's own row (topOffset+24, ~35px tall) - the LEFT pane's right edge
            // (this chip's anchor) sits close enough to estimatorPill's centered position that
            // sharing a row visibly overlaps both, the same collision mcLeftViewPill.js hit
            // against estimatorPill in Phase 3a (fixed there the same way: drop to a second row
            // that clears it regardless of window width).
            this._labelChipEl.style.top = (y + 64) + 'px';
            this._labelChipEl.style.transform = 'translateX(-100%)';
        }
    }
```
Replace with:
```js
    // x, y, width, height: the left pane's full box, same convention as
    // expectationChartView.js's updateBounds(). No independent chip to position anymore - the
    // [States|Chart] toggle is now a real pill (viLeftViewPill.js) anchored to the RIGHT pane
    // instead, positioned by main.js directly.
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
```

- [ ] **Step 4: Remove chip show/hide**

Find:
```js
    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        if (this._labelChipEl) this._labelChipEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
        if (this._labelChipEl) this._labelChipEl.style.display = 'none';
    }
```
Replace with:
```js
    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
```

- [ ] **Step 5: Syntax check**

Run: `node --check src/main/view/viStatesView.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/main/view/viStatesView.js
git commit -m "Remove ViStatesView's static label chip, replaced by ViLeftViewPill"
```

(The `.vi-states-view-chip` CSS rule in `style.css` is now dead — leave it in place, matching this codebase's existing convention of not proactively pruning unrelated dead CSS in the same task that stops using it. `main.js`'s references to `viStatesView`'s old chip behavior don't exist — Task 3b never referenced the chip directly from `main.js`, only `viStatesView.js` itself did — so no `main.js` change is needed here.)

---

### Task 4: `ViChartView` — new Q-table + Convergence chart for Iteration's left pane

**Files:**
- Create: `src/main/view/viChartView.js`
- Modify: `style.css`
- Modify: `index.html`

**Interfaces:**
- Produces: `ViChartView` class — `constructor(canvasViewModel, valueIterationState, expectationState)`, `.setup()`, `.updateBounds(x, y, width, height)`, `.refresh()`, `.show()`, `.hide()`.
- Consumes: `ChartDataBuilders.buildQTableData(valueIterationState)`, `.buildConvergenceData(expectationState, valueIterationState)` (both existing).

- [ ] **Step 1: Create `src/main/view/viChartView.js`**

```js
// Inline Q-table + Convergence charts for Iteration's left pane "Chart" view (Phase 3b
// follow-on) - a real DOM component (like expectationChartView.js, not a p5-canvas overlay),
// layered over the canvas region mainView.js's VI draw dispatch leaves for the left pane when
// leftView === 'chart'. Fixed layout (Q-table on top, Convergence below), matching
// ExpectationChartView's own established simplification (no per-slot picker). Reuses
// ChartDataBuilders' existing pure functions verbatim - no new chart math here, only a new
// render target. Applies to all 3 split quadrants (unlike the States view's backup diagram,
// which is known:full-only) - Q-table and convergence data are equally real for Belief
// Iteration and PO Q-Learning.
class ViChartView {
    constructor(canvasViewModel, valueIterationState, expectationState) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.expectationState = expectationState;

        this.containerEl = null;
        this._qtableBodyEl = null;
        this._convergenceBodyEl = null;
        this._convergenceChartInstance = null;
        this._bounds = null;
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'vi-chart-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const qtableSlot = document.createElement('div');
        qtableSlot.className = 'vi-chart-view-slot';
        const qtableCaption = document.createElement('span');
        qtableCaption.className = 'vi-chart-view-caption';
        qtableCaption.textContent = 'Greedy action ★';
        qtableSlot.appendChild(qtableCaption);
        const qtableBody = document.createElement('div');
        qtableBody.className = 'vi-chart-view-body';
        qtableSlot.appendChild(qtableBody);
        container.appendChild(qtableSlot);
        this._qtableBodyEl = qtableBody;

        const convergenceSlot = document.createElement('div');
        convergenceSlot.className = 'vi-chart-view-slot';
        const convergenceCaption = document.createElement('span');
        convergenceCaption.className = 'vi-chart-view-caption';
        convergenceCaption.textContent = 'V̂(S₀) vs V*';
        convergenceSlot.appendChild(convergenceCaption);
        const convergenceBody = document.createElement('div');
        convergenceBody.className = 'vi-chart-view-body';
        convergenceSlot.appendChild(convergenceBody);
        container.appendChild(convergenceSlot);
        this._convergenceBodyEl = convergenceBody;

        this.hide();
    }

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
        this._renderQTable();
        this._renderConvergence();
    }

    _renderQTable() {
        const body = this._qtableBodyEl;
        if (!body) return;
        body.innerHTML = '';

        const { rows } = ChartDataBuilders.buildQTableData(this.viState);
        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'chart-dock-empty';
            empty.textContent = 'Run Value Iteration to populate.';
            body.appendChild(empty);
            return;
        }

        const table = document.createElement('table');
        table.className = 'chart-dock-qtable';
        rows.forEach(row => {
            row.actions.forEach((a, ai) => {
                const tr = document.createElement('tr');
                if (ai === 0) {
                    const tdS = document.createElement('td');
                    tdS.textContent = row.stateName;
                    tdS.rowSpan = row.actions.length;
                    tdS.className = 'chart-dock-qtable-state';
                    tr.appendChild(tdS);
                }
                const tdA = document.createElement('td');
                tdA.textContent = a.actionName;
                tr.appendChild(tdA);
                const tdQ = document.createElement('td');
                tdQ.textContent = a.qValue.toFixed(2) + (a.isBest ? ' ★' : '');
                if (a.isBest) tdQ.classList.add('chart-dock-qtable-best');
                tr.appendChild(tdQ);
                table.appendChild(tr);
            });
        });
        body.appendChild(table);
    }

    _renderConvergence() {
        const body = this._convergenceBodyEl;
        if (!body) return;
        if (this._convergenceChartInstance) {
            this._convergenceChartInstance.destroy();
            this._convergenceChartInstance = null;
        }
        body.innerHTML = '';
        if (typeof Chart === 'undefined') return;

        const { mcMeans, mcSEs, viValues, vStar } = ChartDataBuilders.buildConvergenceData(
            this.expectationState, this.viState);

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        const maxLen = Math.max(mcMeans.length, viValues.length, 1);

        const datasets = [];
        if (mcMeans.length > 0 && mcSEs.length === mcMeans.length) {
            datasets.push({
                label: 'E[G] − SE',
                data: mcMeans.map((y, x) => ({ x, y: y - (mcSEs[x] || 0) })),
                borderColor: 'transparent', pointRadius: 0, fill: false
            });
            datasets.push({
                label: 'E[G] ± SE',
                data: mcMeans.map((y, x) => ({ x, y: y + (mcSEs[x] || 0) })),
                borderColor: 'transparent', pointRadius: 0, fill: '-1',
                backgroundColor: ColorUtils.applyAlpha(AppPalette.accent.orange, 35)
            });
        }
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

        this._convergenceChartInstance = new Chart(canvas.getContext('2d'), {
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

Add this block immediately after the `.expectation-chart-view-body` rule:
```css
/* ── Iteration inline Chart view: Q-table + Convergence (Phase 3b follow-on) ─────────────── */

.vi-chart-view {
  position: fixed;
  z-index: 8;
  background: var(--surface-canvas);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
}

.vi-chart-view-slot {
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-hairline, var(--border-light));
}

.vi-chart-view-slot:first-child {
  border-top: none;
}

.vi-chart-view-caption {
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 10px;
  color: var(--text-muted);
  padding: 6px 8px 2px;
  flex-shrink: 0;
}

.vi-chart-view-body {
  flex: 1;
  min-height: 0;
  padding: 0 8px 8px;
  position: relative;
  overflow-y: auto;
}
```
(`flex: 0 0 220px` + the container's own `overflow-y: auto` mirrors `ExpectationChartView`'s own scrollable-when-both-slots-don't-fit fix; the Q-table slot's own `.vi-chart-view-body { overflow-y: auto }` additionally lets a long Q-table scroll within its own 220px slot rather than being clipped, since `.chart-dock-qtable` has no row cap.)

- [ ] **Step 3: Add the script tag to `index.html`**

Insert immediately after the `viStatesView.js` line (or wherever it currently is; search for it):
```html
    <script src="src/main/view/viStatesView.js"></script>
    <script src="src/main/view/viChartView.js"></script>
```

- [ ] **Step 4: Syntax check**

Run: `node --check src/main/view/viChartView.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/main/view/viChartView.js style.css index.html
git commit -m "Add ViChartView: inline Q-table + Convergence for Iteration's Chart left-pane view"
```

---

### Task 5: `viBackupDiagram.js` — new backup-diagram renderer; wire into `known:full` cards

**Files:**
- Create: `src/main/view/helpers/viBackupDiagram.js`
- Modify: `src/main/view/viStatesView.js`
- Modify: `style.css`
- Modify: `index.html`

**Interfaces:**
- Produces: `ViBackupDiagram.draw(canvas, detail, priorValues, colors)` — a static function (not a class; this is pure rendering with no persistent state), where `detail` is `ValueIterationState.getBackupDetail(sweepIndex, stateId)`'s return shape, `priorValues` is `{ [stateId]: number }` (the PRIOR sweep's V for every state, needed for the next-state labels), and `colors` is `{ action, best, result }` (hex strings).
- Consumes: `ValueIterationState.getBackupDetail()`, `.getValues()` (both existing).

- [ ] **Step 1: Create `src/main/view/helpers/viBackupDiagram.js`**

```js
// Static Canvas2D renderer for a single state's backup diagram (Phase 3b follow-on) - state on
// the left, its actions in a middle column (each with a Q-value label, best action highlighted/
// starred), each action's outcome next-states in a right column (one row per (action,
// transition) pair, NOT deduplicated by next-state - the same next-state reached by two
// different actions is two genuinely different transitions worth showing separately).
//
// Deliberately NOT mathRenderer-based (see the design spec's own note: mathRenderer.draw()'s
// failure-fallback path calls p5 GLOBAL functions that always draw to the MAIN canvas
// regardless of which ctx is passed - a real mismatch for a per-card canvas). Labels are plain
// ctx.fillText() instead. Deliberately NOT TreeLayout.js-based - that solves a harder, general
// recursive-unrolling problem; this is exactly one level deep with a small bounded fan-out, so a
// fixed three-column layout is simpler and sufficient.
const ViBackupDiagram = {
    // canvas: an HTMLCanvasElement, already sized (width/height set by the caller to match its
    // CSS display size, including devicePixelRatio scaling - see viStatesView.js's _buildCard()
    // for how this is set up).
    // detail: { actions: [{ actionId, actionName, qValue, transitions: [{ nextState,
    //   nextStateName, probability, reward, nextValue, term }] }], bestActionId, value } - the
    // exact shape ValueIterationState.getBackupDetail() already returns.
    // priorValues: { [stateId]: number } - the PRIOR sweep's V for every state (sweep 0's own
    // init values if this is sweep 0), used for the next-state labels.
    // colors: { action, best, result } - hex color strings.
    draw(canvas, detail, priorValues, colors) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        if (!detail || !detail.actions || detail.actions.length === 0) {
            this._drawEmpty(ctx, w, h, colors);
            return;
        }

        const PADDING = 8;
        const stateX = PADDING + 14;
        const stateY = h / 2;
        const actionX = w * 0.42;
        const transX = w - PADDING - 14;

        // Flatten (action, transition) pairs in order - this is the right column's row list.
        const rows = [];
        detail.actions.forEach(action => {
            action.transitions.forEach(t => rows.push({ action, transition: t }));
        });
        const rowCount = Math.max(rows.length, 1);
        const rowH = (h - 2 * PADDING) / rowCount;

        // Action column: one row per action, vertically centered within its own transitions'
        // combined span (so the state->action line points at the visual middle of that action's
        // fanned-out transitions, matching the reference layout).
        let rowCursor = 0;
        const actionPositions = new Map();
        detail.actions.forEach(action => {
            const span = Math.max(action.transitions.length, 1);
            const centerRow = rowCursor + span / 2;
            actionPositions.set(action.actionId, PADDING + centerRow * rowH);
            rowCursor += span;
        });

        ctx.strokeStyle = colors.action;
        ctx.lineWidth = 1;
        ctx.font = '11px monospace';
        ctx.textBaseline = 'middle';

        // Lines: state -> each action; each action -> its own transition rows.
        detail.actions.forEach(action => {
            const ay = actionPositions.get(action.actionId);
            ctx.beginPath();
            ctx.moveTo(stateX, stateY);
            ctx.lineTo(actionX, ay);
            ctx.stroke();
        });
        rows.forEach((row, i) => {
            const ay = actionPositions.get(row.action.actionId);
            const ty = PADDING + (i + 0.5) * rowH;
            ctx.beginPath();
            ctx.moveTo(actionX, ay);
            ctx.lineTo(transX, ty);
            ctx.stroke();
        });

        // State node + V label.
        this._circle(ctx, stateX, stateY, 14, colors.action);
        ctx.fillStyle = colors.result;
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`V = ${detail.value.toFixed(2)}`, PADDING, PADDING - 2);

        // Action nodes + Q labels (best action highlighted + starred).
        detail.actions.forEach(action => {
            const ay = actionPositions.get(action.actionId);
            const isBest = action.actionId === detail.bestActionId;
            this._circle(ctx, actionX, ay, 10, isBest ? colors.best : colors.action);
            ctx.fillStyle = isBest ? colors.best : colors.action;
            ctx.font = isBest ? 'bold 11px monospace' : '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`Q = ${action.qValue.toFixed(2)}${isBest ? ' ★' : ''}`, actionX, ay - 16);
        });

        // Next-state nodes + their prior-sweep V.
        rows.forEach((row, i) => {
            const ty = PADDING + (i + 0.5) * rowH;
            this._circle(ctx, transX, ty, 10, colors.action);
            ctx.fillStyle = colors.result;
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            const priorV = priorValues[row.transition.nextState] ?? 0;
            ctx.fillText(`${row.transition.nextStateName} V ${priorV.toFixed(2)}`, transX + 14, ty);
        });
    },

    _circle(ctx, x, y, r, color) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    },

    _drawEmpty(ctx, w, h, colors) {
        ctx.fillStyle = colors.action;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('no actions', w / 2, h / 2);
    }
};
```

- [ ] **Step 2: Wire into `viStatesView.js`'s `_buildCard()` for `known:full` only**

Find:
```js
    _buildCard(sweepIndex, stateId) {
        const card = document.createElement('div');
        card.className = 'vi-states-view-card';

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        const name = this.viState.stateNames[stateId] || `S${stateId}`;
        const value = detail ? detail.value : 0;

        const nameEl = document.createElement('span');
        nameEl.className = 'vi-states-view-card-name';
        nameEl.textContent = name;
        card.appendChild(nameEl);

        const valueEl = document.createElement('span');
        valueEl.className = 'vi-states-view-card-value';
        valueEl.textContent = value.toFixed(2);
        card.appendChild(valueEl);

        return card;
    }
```
Replace with:
```js
    // known:full (real Value Iteration) gets a rich per-state backup diagram; the other 3
    // quadrants (Belief Iteration, PO Q-Learning, Learning Iteration) keep the flat state:value
    // card - decided once per card, not per-frame, and Learning Iteration never reaches this
    // method at all (the whole States view is hidden for it).
    _buildCard(sweepIndex, stateId) {
        const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
        return quadrant === 'known:full'
            ? this._buildDiagramCard(sweepIndex, stateId)
            : this._buildFlatCard(sweepIndex, stateId);
    }

    _buildFlatCard(sweepIndex, stateId) {
        const card = document.createElement('div');
        card.className = 'vi-states-view-card';

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        const name = this.viState.stateNames[stateId] || `S${stateId}`;
        const value = detail ? detail.value : 0;

        const nameEl = document.createElement('span');
        nameEl.className = 'vi-states-view-card-name';
        nameEl.textContent = name;
        card.appendChild(nameEl);

        const valueEl = document.createElement('span');
        valueEl.className = 'vi-states-view-card-value';
        valueEl.textContent = value.toFixed(2);
        card.appendChild(valueEl);

        return card;
    }

    _buildDiagramCard(sweepIndex, stateId) {
        const card = document.createElement('div');
        card.className = 'vi-states-view-card vi-states-view-card--diagram';

        const canvas = document.createElement('canvas');
        // Fixed logical size (CSS controls display size via the card's own layout; the canvas's
        // pixel buffer is set to match at 1x - devicePixelRatio scaling is a nice-to-have not
        // needed for this static, small diagram).
        canvas.width = 220;
        canvas.height = 96;
        card.appendChild(canvas);

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        const priorValues = sweepIndex > 0
            ? this.viState.getValues(sweepIndex - 1)
            : this.viState.getValues(0);
        const colors = {
            action: AppPalette.valueIteration.actionBlue,
            best: AppPalette.valueIteration.best,
            result: AppPalette.valueIteration.result
        };
        ViBackupDiagram.draw(canvas, detail, priorValues, colors);

        return card;
    }
```

- [ ] **Step 3: Add CSS to `style.css`**

Add this block immediately after the existing `.vi-states-view-card-value` rule (search for it):
```css
.vi-states-view-card--diagram {
  padding: 4px;
}

.vi-states-view-card--diagram canvas {
  display: block;
  width: 220px;
  height: 96px;
}
```

- [ ] **Step 4: Add the script tag to `index.html`**

`viBackupDiagram.js` is a helper (like `chartDataBuilders.js`/`valuesMethodMatrix.js`), so it must load BEFORE `viStatesView.js`, which now depends on it. Find the `helpers/` script block (search for `RolloutFormatter.js` or `valuesMethodMatrix.js` for the right neighborhood) and add:
```html
    <script src="src/main/view/helpers/viBackupDiagram.js"></script>
```
immediately before the existing `viStatesView.js` script tag.

- [ ] **Step 5: Syntax check**

Run: `node --check src/main/view/helpers/viBackupDiagram.js && node --check src/main/view/viStatesView.js`
Expected: no output.

- [ ] **Step 6: Browser verification**

Start the server (from the worktree root): `python3 -m http.server 8010`

Using playwright-core (run from the worktree root), build an MDP with a state that has 2 actions, one of which has 2 probabilistic outcomes (e.g., `s0 -> a0 -> {s1: 0.5, s2: 0.5}`, `s0 -> a1 -> {s2: 1.0}`), set a start node, enter Values → Iteration with P known / full observability (`known:full`), run 2 real sweeps via `page.evaluate()` calls (`valueIterationState.initialize(...)`/`.computeNextSweep(...)` or via the real `ensureVIInitialized`/Play flow), and confirm via `page.evaluate()`:
- `document.querySelectorAll('.vi-states-view-card--diagram canvas').length` matches the expected state × sweep count.
- Each canvas's 2D context actually drew something (e.g., check `canvas.toDataURL()` differs from a blank canvas's, or simpler: confirm no console errors and that `ViBackupDiagram.draw` was called with a real, non-null `detail` for at least one card by wrapping/spying if convenient, or just visually confirm via a screenshot).
- Switch to P unknown / full observability (Learning Iteration) — confirm the whole States view (and thus every diagram) is hidden, matching existing Phase 3b behavior, unaffected by this task.
- Switch to P known / partial observability (Belbelief Iteration) — confirm cards show the FLAT value (no canvas), not a diagram.
- Zero console errors, both themes.

- [ ] **Step 7: Commit**

```bash
git add src/main/view/helpers/viBackupDiagram.js src/main/view/viStatesView.js style.css index.html
git commit -m "Add ViBackupDiagram: per-state backup diagram for known:full's States view cards"
```

---

### Task 6: `main.js` wiring — construct pill + chart view; toggle logic; hide `ChartDock` for the 3 split quadrants

**Files:**
- Modify: `src/main/app/main.js`

**Interfaces:**
- Consumes: `ViLeftViewPill` (Task 2), `ViChartView` (Task 4), `_isLearningIterationActive()` (existing), `mainView._viSplitWidths()` (existing, Phase 3b).

- [ ] **Step 1: Construct `viLeftViewPill` and `viChartView`**

Find the existing `viStatesView` construction (search for `const viStatesView = new ViStatesView(`) and add immediately after its `mainView.viStatesView = viStatesView;` line:
```js
    const viLeftViewPill = new ViLeftViewPill({
        onSelectLeftView: (key) => {
            valueIterationViewModel.leftView = key;
            viLeftViewPill.refresh();
            setUpVISplitChrome();
            if (typeof redraw === 'function') redraw();
        }
    }, canvasViewModel);
    mainView.viLeftViewPill = viLeftViewPill;

    const viChartView = new ViChartView(canvasViewModel, valueIterationState, expectationState);
    mainView.viChartView = viChartView;
```

- [ ] **Step 2: Call `.setup()` during app bootstrap**

Find where `viStatesView.setup();` is called and add immediately after:
```js
    viLeftViewPill.setup(mainView.TOP_BARS_HEIGHT);
    viChartView.setup();
```

- [ ] **Step 3: Rewrite `setUpVISplitChrome()` to manage the pill, States view, and Chart view together**

Find:
```js
function setUpVISplitChrome() {
    if (!mainView || !mainView.viStatesView) return;
    const panelW = rightPanel ? rightPanel.getWidth() : 272;
    const canvasW = windowWidth - panelW;
    const canvasH = windowHeight - mainView.TOP_BARS_HEIGHT - mainView.getDockHeight();
    const viSplit = mainView._viSplitWidths(canvasW);

    if (viSplit) {
        // +56 clears estimatorPill's top-left "Value Iteration"/"Monte Carlo" method badge
        // (values-method-badge, topOffset+24, ~24px tall) - same inset Phase 3a's
        // ExpectationChartView already applies for MC's identical badge-overlap case.
        const topInset = 56;
        mainView.viStatesView.updateBounds(0, mainView.TOP_BARS_HEIGHT + topInset, viSplit.leftW, canvasH - topInset);
        mainView.viStatesView.show();
    } else {
        mainView.viStatesView.hide();
    }
}
```
Replace with:
```js
function setUpVISplitChrome() {
    if (!mainView || !mainView.viStatesView) return;
    const panelW = rightPanel ? rightPanel.getWidth() : 272;
    const canvasW = windowWidth - panelW;
    const canvasH = windowHeight - mainView.TOP_BARS_HEIGHT - mainView.getDockHeight();
    const viSplit = mainView._viSplitWidths(canvasW);
    // +56 clears estimatorPill's top-left "Value Iteration"/"Monte Carlo" method badge
    // (values-method-badge, topOffset+24, ~24px tall) - same inset Phase 3a's
    // ExpectationChartView already applies for MC's identical badge-overlap case.
    const topInset = 56;

    if (viSplit) {
        const showChart = valueIterationViewModel.leftView === 'chart';
        mainView.viStatesView.updateBounds(0, mainView.TOP_BARS_HEIGHT + topInset, viSplit.leftW, canvasH - topInset);
        mainView.viChartView.updateBounds(0, mainView.TOP_BARS_HEIGHT + topInset, viSplit.leftW, canvasH - topInset);
        if (showChart) {
            mainView.viStatesView.hide();
            mainView.viChartView.show();
        } else {
            mainView.viChartView.hide();
            mainView.viStatesView.show();
        }
        if (mainView.viLeftViewPill) {
            mainView.viLeftViewPill.updateBounds(viSplit.leftW, viSplit.rightW);
            mainView.viLeftViewPill.show();
            mainView.viLeftViewPill.refresh();
        }
    } else {
        mainView.viStatesView.hide();
        mainView.viChartView.hide();
        if (mainView.viLeftViewPill) mainView.viLeftViewPill.hide();
    }
}
```

- [ ] **Step 4: Hide `ChartDock` for the 3 split quadrants at both existing show-call sites**

Find (inside `onEnter.values`'s `vi` branch):
```js
            } else if (sv === 'vi') {
                if (mainView && mainView.chartDock) {
                    mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.chartDock.show();
                }
                if (mainView && mainView.zoomPill) mainView.zoomPill.show();
```
Replace with:
```js
            } else if (sv === 'vi') {
                // ChartDock now only shows for Learning Iteration (the 3 split quadrants get
                // their own inline ViChartView instead) - mirrors exactly how Phase 3a already
                // stopped routing Monte Carlo through ChartDock.
                if (mainView && mainView.chartDock) {
                    if (_isLearningIterationActive()) {
                        mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                        mainView.chartDock.show();
                    } else {
                        mainView.chartDock.hide();
                    }
                }
                if (mainView && mainView.zoomPill) mainView.zoomPill.show();
```

Find (inside `onEnterSubView.vi`):
```js
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
```
Replace with:
```js
        vi: () => {
            // VI has no other "run on enter" behavior - starts via explicit Play click
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (mainView && mainView.estimatorPill) mainView.estimatorPill.refresh();
            if (mainView && mainView.mcRunsPill) mainView.mcRunsPill.hide();
            if (mainView && mainView.mcLeftViewPill) mainView.mcLeftViewPill.hide();
            if (mainView && mainView.expectationChartView) mainView.expectationChartView.hide();
            // ChartDock now only shows for Learning Iteration - see the identical comment in the
            // cold-entry values() hook's vi branch above.
            if (mainView && mainView.chartDock) {
                if (_isLearningIterationActive()) {
                    mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                    mainView.chartDock.show();
                } else {
                    mainView.chartDock.hide();
                }
            }
```

- [ ] **Step 5: Re-sync `ChartDock` visibility immediately on the model-known/observability toggles**

Find (in `onModelKnownToggle`):
```js
    if (canvasViewModel.mode === 'values' && canvasViewModel.valuesSubView === 'vi') {
        refreshVIButtons();
        setUpVISplitChrome();
    }
    redraw();
};

const onObservabilityToggle = (value) => {
```
Replace with:
```js
    if (canvasViewModel.mode === 'values' && canvasViewModel.valuesSubView === 'vi') {
        refreshVIButtons();
        setUpVISplitChrome();
        if (mainView && mainView.chartDock) {
            if (_isLearningIterationActive()) {
                mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.chartDock.show();
            } else {
                mainView.chartDock.hide();
            }
        }
    }
    redraw();
};

const onObservabilityToggle = (value) => {
```

Find the near-identical block at the end of `onObservabilityToggle`:
```js
    if (canvasViewModel.mode === 'values' && canvasViewModel.valuesSubView === 'vi') {
        refreshVIButtons();
        setUpVISplitChrome();
    }
    redraw();
};
```
(this is the SECOND occurrence of this exact snippet in the file — the first was just handled above, inside `onModelKnownToggle`; this one is inside `onObservabilityToggle`) — replace with the identical addition:
```js
    if (canvasViewModel.mode === 'values' && canvasViewModel.valuesSubView === 'vi') {
        refreshVIButtons();
        setUpVISplitChrome();
        if (mainView && mainView.chartDock) {
            if (_isLearningIterationActive()) {
                mainView.chartDock.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.chartDock.show();
            } else {
                mainView.chartDock.hide();
            }
        }
    }
    redraw();
};
```

- [ ] **Step 6: Hide the new pill/chart view when leaving Values mode entirely, and on `mc` sub-view entry**

Find the `onLeave.values` hook (it already hides `viStatesView`) and add two more lines alongside it:
```js
            if (mainView && mainView.viStatesView) mainView.viStatesView.hide();
            if (mainView && mainView.viLeftViewPill) mainView.viLeftViewPill.hide();
            if (mainView && mainView.viChartView) mainView.viChartView.hide();
```

Find `onEnterSubView.mc` (it already hides `viStatesView`) and add the same two lines there:
```js
            if (mainView && mainView.viStatesView) mainView.viStatesView.hide();
            if (mainView && mainView.viLeftViewPill) mainView.viLeftViewPill.hide();
            if (mainView && mainView.viChartView) mainView.viChartView.hide();
```

- [ ] **Step 7: Syntax check**

Run: `node --check src/main/app/main.js`
Expected: no output.

- [ ] **Step 8: Browser verification — full toggle/quadrant matrix**

Using playwright-core (from the worktree root):
1. Build a small MDP (as in Task 5's verification), set a start node.
2. Enter Values → Iteration, P known / full observability. Confirm: the `[States | Chart]` pill shows top-right of the RIGHT pane, `ChartDock` is hidden, the States view (with real diagrams) shows in the left pane.
3. Click "Chart" on the pill. Confirm: the States view hides, `ViChartView` shows with a real Q-table (after running a sweep) and a Convergence chart; `ChartDock` stays hidden.
4. Click "States" again. Confirm it reverts correctly.
5. Toggle P known → P unknown (Learning Iteration). Confirm: the pill, States view, and Chart view all hide immediately; `ChartDock` shows again (matching its pre-this-plan behavior for Learning Iteration).
6. Toggle back to P known. Confirm everything reappears correctly, with `leftView` restored to whatever it was last set to.
7. Toggle Full → Partial observability (Belief Iteration) while P known. Confirm: the split/pill/chart still work, but States-view cards show the FLAT value (no diagram) — confirming Task 5's quadrant gating holds through this toggle path too, not just fresh mode entry.
8. Switch to Monte Carlo and back to Iteration. Confirm no cross-contamination between MC's and VI's chrome (mirroring Phase 3b's own already-verified matrix).
9. Resize the window. Confirm all bounds update correctly.
10. Zero console errors throughout, both themes.

- [ ] **Step 9: Commit**

```bash
git add src/main/app/main.js
git commit -m "Wire ViLeftViewPill + ViChartView into main.js; hide ChartDock for the 3 split quadrants"
```

---

### Task 7: Final regression pass, `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full regression pass (playwright-core, from the worktree root)**

Re-run Task 6's own verification once more against the final combined state, plus specifically check:
1. **Explanation overlay coexistence** (unchanged from Phase 3b, but worth re-confirming nothing in this follow-on disturbed it): click a revealed Q-table cell in the right DOM panel — the canvas fan-out overlay still works, independent of the States-view diagrams.
2. **A long run** (10+ sweeps): confirm the States view (now rendering real canvases per card) doesn't visibly lag or leak memory across many `refresh()` calls during continuous Play — canvases are only created once per `_buildSection()` call (append-only, per Phase 3b's existing `refresh()` design), not recreated every tick.
3. **Belief Iteration / PO Q-Learning**: confirm the Chart view's Q-table and Convergence chart both render correctly for these two quadrants too (per the design spec, these are NOT restricted to `known:full`).
4. Zero console errors, both themes, one full pass through the whole matrix in Task 6 Step 8 once more after all tasks are combined.

- [ ] **Step 2: Update `CLAUDE.md`**

In the `### Value Iteration / Learning Iteration / Belief Iteration / PO Q-Learning (Values → vi)` section, add a new paragraph after the Phase 3b paragraph already there (the one ending "...Play/Step/Skip always advance the real live sweep regardless of what's pinned for preview." — and after the "Known follow-up" paragraph that follows it):
```
A follow-on to Phase 3b replaced the States view's static label with a real
**`[States | Chart]`** toggle (`ValueIterationViewModel.leftView`, `viLeftViewPill.js` —
anchored to the right/MDP pane, mirroring `mcLeftViewPill.js`'s identical cosmetic placement).
The **Chart** option (`viChartView.js`) shows a Q-table and the same Convergence chart
`ExpectationChartView` builds for Monte Carlo, reusing `ChartDataBuilders` verbatim — available
for all 3 split quadrants. Once a real sweep is showing here, `ChartDock` stops appearing for
these 3 quadrants (mirroring how Phase 3a already stopped routing Monte Carlo through it);
Learning Iteration's own relationship with `ChartDock` is unchanged. Separately, **only**
`known:full` (real Value Iteration) gets a per-state backup diagram in its States-view cards
(`viBackupDiagram.js` — state → actions with Q-values → outcome next-states with their prior
sweep's V, best action starred/highlighted), drawn via a small dedicated `<canvas>` per card
using plain Canvas2D calls (not `mathRenderer`, whose failure-fallback path is main-canvas-only;
not SVG; not `TreeLayout.js`, which solves a different, harder layout problem) — the other 3
quadrants keep the flat `state: value` card.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Final regression pass for the Iteration States/Chart enrichment follow-on; update CLAUDE.md"
```

---

## Self-Review Notes

- **Spec coverage:** real `[States|Chart]` pill anchored to the MDP/right pane ✓ (Task 2); `ViChartView` with Q-table + Convergence, all 3 split quadrants ✓ (Task 4); `ChartDock` hidden for those 3 quadrants once the inline chart exists, Learning Iteration untouched ✓ (Task 6); backup diagrams, `known:full`-only, static, not SVG/mathRenderer/TreeLayout ✓ (Task 5); toggle re-syncs immediately on the model-known/observability toggles, not just fresh mode entry ✓ (Task 6 Step 5, mirroring the existing `setUpVISplitChrome()` precedent from Phase 3b).
- **Placeholder scan:** none found — every step has complete code or an exact search-and-verify instruction.
- **Type/name consistency check:** `leftView` used identically across Tasks 1, 2, 6; `ViLeftViewPill`'s `callbacks.onSelectLeftView` matches between Task 2's class body and Task 6's construction call; `ViChartView`'s constructor signature `(canvasViewModel, valueIterationState, expectationState)` matches exactly between Task 4's class definition and Task 6's construction call; `ViBackupDiagram.draw(canvas, detail, priorValues, colors)`'s signature matches between Task 5's module definition and its call site in `viStatesView.js`.
- **Known, deliberate deviations from generic reuse** (explained inline in Global Constraints and Task 5's own header comment): the backup diagram avoids `mathRenderer`/SVG/`TreeLayout.js` for concrete, stated reasons, not because reuse wasn't considered.
- **Cross-task file touch confirmation:** Task 3 (chip removal) and Task 5 (diagram wiring) both touch `viStatesView.js`, in that order — Task 5's `_buildCard()` replacement in Step 2 assumes Task 3's chip-removal changes (a different part of the file) are already in place; no overlap in the actual lines touched.
