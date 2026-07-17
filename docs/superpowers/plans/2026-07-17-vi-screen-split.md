# Iteration Screen Split (Phase 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Values → Iteration a persistent 52%/48% left/right split — a new "States" view (per-sweep backup cards) on the left, the existing `ValueIterationView` graph translated/clipped into the right pane — for the three quadrants that run VI's real Bellman-sweep computation (Value Iteration, Belief Iteration, PO Q-Learning). Learning Iteration (P-unknown, real Q-learning) is untouched.

**Architecture:** View/viewmodel-tier layout and interaction only, reusing 3a's shared split-width math and DOM-overlay-over-canvas pattern. `ValueIterationViewModel` gains a hover/pin sweep-preview concept mirroring `ExpectationViewModel.hoveredRun`/`selectedRunIndex`/`highlightedRun`; `ValueIterationView` reads whichever sweep is being previewed instead of always the live one, while sweep-advance pulse animation stays keyed on the real live sweep so hovering an old generation never re-triggers it. A new DOM component, `ViStatesView` (mirroring `expectationChartView.js`'s pattern), renders the per-sweep cards. `mainView.js`'s existing VI draw dispatch gains one `translate`+clip wrapper around the unchanged `ValueIterationView.draw()` call.

**Tech Stack:** Vanilla JS, p5.js canvas rendering, plain DOM for the new States view — no build step, no bundler, no automated test suite (browser + playwright-core manual verification only).

## Global Constraints

- **No domain layer changes.** `valueIterationState.js` is untouched — `ValueIterationState.history[k].backupDetails` already has everything the States view needs via the existing `getBackupDetail(sweepIndex, stateId)` accessor.
- **Applies to exactly 3 of the 4 method-matrix quadrants**: `known:full` (Value Iteration), `known:partial` (Belief Iteration), `unknown:partial` (PO Q-Learning). `unknown:full` (Learning Iteration) is completely unaffected — it keeps its current full-canvas `LearningIterationView` + Graph/Tree toggle, untouched by any task in this plan. Every new piece of chrome added by this plan must be gated on `!_isLearningIterationActive()` (the existing helper in `main.js`, already used by `refreshLearningTreePill()` for exactly this same quadrant check) — reuse it, don't reintroduce a second way to ask "is this Learning Iteration."
- **The 52/48 split ratio is the exact same one 3a shipped**, reused via `ExpectationViewModel.splitWidths(canvasW)` directly — there must be exactly one `0.52` literal in the whole codebase. Do not duplicate the constant onto `ValueIterationViewModel` or anywhere else.
- **`ValueIterationView.draw()`'s own rendering logic does not change** for the split itself — no fit-transform, no synthetic layout math. The split is achieved entirely by wrapping the existing draw call in a `translate(leftW, 0)` + clip in `mainView.js`, exactly the same real graph coordinates/pan/zoom as today. The ONLY internal changes to `valueIterationView.js` in this plan are (a) reading a previewed-sweep index instead of always the live one, and (b) two screen-space-anchored UI elements (the "Set max sweeps..." placeholder and the explanation-overlay status strip) that need to know about the new left inset so they center within the right pane instead of the old full canvas.
- **Pan/zoom is not re-centered by this plan.** VI mode's keyboard shortcuts (including 'r' reset-zoom) are already fully disabled while `mode === 'values'` (`CanvasController.handleKeyPress()` early-returns), and there is no other absolute-recentering call active during VI today — panning/zooming in VI mode is pure incremental mouse-drag/wheel-delta accumulation, which composes correctly with a constant `leftW` screen-space shift with zero special-casing needed. This is a deliberate, low-risk simplification consistent with 3a's own "no fit-transform needed" framing, not an oversight.
- **Selection model matches 3a's grid exactly**: hover = transient preview, click = pin (click again to unpin), Play/Step/Skip always operate on the real live sweep regardless of what's pinned for preview.
- **Verification is manual, via a local server** (`python3 -m http.server 8010` from the worktree root) and a real headless-browser script (playwright-core, already vendored) driving real DOM mouse events for the new States view's hover/click, and `page.evaluate()` calls against the real domain/viewmodel objects to drive sweeps forward (mirroring how Phase 3a's own tasks verified MC's grid). Check the browser console for zero errors and visually confirm in both light and dark theme.

---

## Reference: current vs. new state (for the implementer's orientation)

| Concern | Today | After this plan |
|---|---|---|
| Values → Iteration canvas | Full width, no split, for all 4 quadrants | 52/48 split for `known:full`/`known:partial`/`unknown:partial`; `unknown:full` (Learning Iteration) unchanged |
| `ValueIterationView.draw()` | Reads `this.viState.currentSweepIndex` for both pulse-detection AND what to render | Pulse-detection stays on the live sweep; rendering reads `viViewModel.previewedSweepIndex ?? currentSweepIndex` |
| "Browse past sweeps" | Only via the DOM right panel's Q-table columns (`k=0..T`) | Also via the new States view's per-sweep cards, hover-previews/click-pins the shared graph |
| Placeholder / explanation status-strip centering | `windowWidth - panelWidth` (ignores any left inset) | `windowWidth - panelWidth - leftInset`, offset by `leftInset`, so it centers within the right pane once split |
| Bottom `ChartDock`, `ViSweepChip`, Learning-Iteration's Graph\|Tree pill | Unaffected by this phase | Still unaffected — this plan touches none of their own logic, only adds new chrome alongside |

---

### Task 1: `ValueIterationViewModel` — hover/pin sweep-preview state

**Files:**
- Modify: `src/main/adapter/viewmodel/ValueIterationViewModel.js`

**Interfaces:**
- Produces: `ValueIterationViewModel.hoveredSweepIndex` (default `null`), `.pinnedSweepIndex` (default `null`), `.previewedSweepIndex` getter (`pinnedSweepIndex !== null ? pinnedSweepIndex : hoveredSweepIndex`, mirroring `ExpectationViewModel.highlightedRun`'s exact shape — note this getter does NOT itself fall back to the live sweep; that fallback happens at the read site in `valueIterationView.js`, Task 2, exactly like `ExpectationViewModel.highlightedRun` never mentions "current" anything either).
- Consumes: nothing new.

- [ ] **Step 1: Add the new fields to `reset()`**

Change:
```js
    reset() {
        this.activeStateId = null;
        this.backupDetail = null;   // transient backup-diagram detail (explanation card)

        // Explanation state (a clicked Q-cell's step-through backup diagram)
        this.explanationDetail = null;
        this.explanationStepIndex = 0;
        this.explanationTweenKey = null;
    }
```
to:
```js
    reset() {
        this.activeStateId = null;
        this.backupDetail = null;   // transient backup-diagram detail (explanation card)

        // Explanation state (a clicked Q-cell's step-through backup diagram)
        this.explanationDetail = null;
        this.explanationStepIndex = 0;
        this.explanationTweenKey = null;

        // Which sweep the new States view (Phase 3b) is hovering/pinning for preview on the
        // shared right-pane graph - same hover-transient/click-pinned convention as
        // ExpectationViewModel.hoveredRun/selectedRunIndex. null = nothing previewed, the graph
        // shows the real live sweep (valueIterationState.currentSweepIndex).
        this.hoveredSweepIndex = null;
        this.pinnedSweepIndex = null;
    }
```

- [ ] **Step 2: Add the `previewedSweepIndex` getter**

Add as a new method, placed after `reset()`:
```js
    // Pinned wins over hovered, for the States view's own card-highlighting and for
    // valueIterationView.js's rendering (see Task 2) - mirrors
    // ExpectationViewModel.highlightedRun exactly. null means nothing is being previewed; the
    // caller falls back to the real live sweep itself (this getter deliberately does not know
    // about currentSweepIndex - ValueIterationViewModel has no reference to ValueIterationState).
    get previewedSweepIndex() {
        return this.pinnedSweepIndex !== null ? this.pinnedSweepIndex : this.hoveredSweepIndex;
    }
```

- [ ] **Step 3: Syntax check**

Run: `node --check src/main/adapter/viewmodel/ValueIterationViewModel.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/main/adapter/viewmodel/ValueIterationViewModel.js
git commit -m "Add hover/pin sweep-preview state to ValueIterationViewModel"
```

---

### Task 2: `ValueIterationView` — read the previewed sweep; left-inset-aware placeholder/status-strip

**Files:**
- Modify: `src/main/view/valueIterationView.js`

**Interfaces:**
- Consumes: `ValueIterationViewModel.previewedSweepIndex` (Task 1); a new `layout.getLeftInset()` accessor (constructor-injected, wired for real in Task 6, defaulting to `() => 0` here so this task is independently testable/committable).

- [ ] **Step 1: Add `getLeftInset` to the constructor's default fallback layout**

Change:
```js
        this.layout = layout || { getPanelWidth: () => 272, getTopOffset: () => 40, getBottomOffset: () => 40 };
```
to:
```js
        this.layout = layout || { getPanelWidth: () => 272, getTopOffset: () => 40, getBottomOffset: () => 40, getLeftInset: () => 0 };
```

- [ ] **Step 2: Separate pulse-detection (live sweep) from rendering (previewed sweep) in `draw()`**

Change:
```js
        const sweep = this.viState.currentSweepIndex;

        // Pulse all nodes when the sweep index advances (the per-sweep "beat").
        this._detectSweepPulse(sweep, stateNodes);

        // Edges (policy-highlighted state->action->state chains) behind the nodes.
        this._drawPolicyGraph(stateNodes, sweep, graph);
```
to:
```js
        const liveSweep = this.viState.currentSweepIndex;

        // Pulse all nodes when the REAL sweep advances - keyed on the live sweep specifically
        // (not the previewed one below), so hovering an old generation in the States view never
        // re-triggers this pulse; it's a "new computation happened" signal, not a "you're looking
        // at a different sweep now" one.
        this._detectSweepPulse(liveSweep, stateNodes);

        // Which sweep's V/Q/policy actually gets rendered - the States view's hovered/pinned
        // sweep if one is set (Phase 3b), otherwise the real live sweep, exactly as before.
        const sweep = this.viViewModel.previewedSweepIndex ?? liveSweep;

        // Edges (policy-highlighted state->action->state chains) behind the nodes.
        this._drawPolicyGraph(stateNodes, sweep, graph);
```

- [ ] **Step 3: Left-inset-aware placeholder**

Change:
```js
    _drawPlaceholder() {
        push();
        fill(120);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(18);
        textFont(Typography.sans());
        text('Set max sweeps (T) and click Run to start Value Iteration',
            (windowWidth - this.layout.getPanelWidth()) / 2, (windowHeight - this.layout.getTopOffset()) / 2);
        pop();
    }
```
to:
```js
    _drawPlaceholder() {
        push();
        fill(120);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(18);
        textFont(Typography.sans());
        const leftInset = this.layout.getLeftInset();
        const usableW = windowWidth - this.layout.getPanelWidth() - leftInset;
        text('Set max sweeps (T) and click Run to start Value Iteration',
            leftInset + usableW / 2, (windowHeight - this.layout.getTopOffset()) / 2);
        pop();
    }
```

- [ ] **Step 4: Left-inset-aware explanation status strip**

Change:
```js
    /** Fixed screen-space status strip showing the current animation phase */
    _drawStatusStrip(detail) {
        const text = this._getStatusText(detail);
        if (!text) return;

        const canvasW = windowWidth - this.layout.getPanelWidth();
        const x = 16;
        const y = windowHeight - this.layout.getBottomOffset();
        const w = Math.min(canvasW - 32, 620);
        const h = 34;
```
to:
```js
    /** Fixed screen-space status strip showing the current animation phase */
    _drawStatusStrip(detail) {
        const text = this._getStatusText(detail);
        if (!text) return;

        const leftInset = this.layout.getLeftInset();
        const canvasW = windowWidth - this.layout.getPanelWidth() - leftInset;
        const x = 16 + leftInset;
        const y = windowHeight - this.layout.getBottomOffset();
        const w = Math.min(canvasW - 32, 620);
        const h = 34;
```

- [ ] **Step 5: Syntax check**

Run: `node --check src/main/view/valueIterationView.js`
Expected: no output.

- [ ] **Step 6: Browser verification**

Start the server (from the worktree root): `python3 -m http.server 8010`

Using playwright-core (run from the worktree root), build a small MDP (one state with a self-loop action, 2+ probabilistic outcomes), set a start node, enter Values → Iteration (P known, full observability, i.e. `known:full`), run a couple of sweeps, then in the page context directly set `mainView.valueIterationViewModel.hoveredSweepIndex = 0` (an old sweep) and confirm via a subsequent screenshot or by reading `mainView.valueIterationView.viState.getValues(0)` vs what's rendered that the graph's V-labels/heat now reflect sweep 0's values, not the current live sweep. Clear it back to `null` and confirm the graph reverts to the live sweep's values. Confirm zero console errors.

- [ ] **Step 7: Commit**

```bash
git add src/main/view/valueIterationView.js
git commit -m "ValueIterationView reads the previewed sweep for rendering; left-inset-aware placeholder/status-strip"
```

---

### Task 3: `ViStatesView` — new States view (left pane)

**Files:**
- Create: `src/main/view/viStatesView.js`
- Modify: `style.css` (new CSS block)
- Modify: `index.html` (one new `<script>` tag)

**Interfaces:**
- Produces: `ViStatesView` class — `constructor(canvasViewModel, valueIterationState, valueIterationViewModel)`, `.setup()`, `.updateBounds(x, y, width, height)`, `.refresh()`, `.show()`, `.hide()`.
- Consumes: `ValueIterationState.history`/`.currentSweepIndex`/`.stateIds`/`.stateNames`/`.getBackupDetail(sweepIndex, stateId)` (existing, unchanged), `ValueIterationViewModel.hoveredSweepIndex`/`.pinnedSweepIndex` (Task 1, mutated directly by this component's own event handlers — same "the view owns hover/pin mutation directly" convention `ExpectationView.selectRun()` uses, not a callbacks-object indirection).

- [ ] **Step 1: Create `src/main/view/viStatesView.js`**

```js
// New States view for the Iteration left pane (Phase 3b) - a real DOM component (like
// expectationChartView.js, not a p5-canvas overlay), layered over the canvas region
// mainView.js's VI draw dispatch leaves for the left pane. One section per computed sweep
// (k = 0..currentSweepIndex), newest at the bottom, each holding one card per state built
// straight from ValueIterationState.getBackupDetail() - no new domain computation. Hovering a
// section previews that sweep on the shared right-pane graph (transient); clicking pins it
// (click again to unpin) - same convention ExpectationViewModel.hoveredRun/selectedRunIndex
// established for Monte Carlo's grid, applied here to sweeps instead of runs.
class ViStatesView {
    constructor(canvasViewModel, valueIterationState, valueIterationViewModel) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.viViewModel = valueIterationViewModel;

        this.containerEl = null;
        this._labelChipEl = null;
        this._sectionsEl = null;
        this._bounds = null;
        this._renderedSweepCount = 0;
    }

    setup() {
        if (this.containerEl) return;

        const chip = document.createElement('div');
        chip.className = 'vi-states-view-chip';
        chip.textContent = 'States';
        document.body.appendChild(chip);
        this._labelChipEl = chip;

        const container = document.createElement('div');
        container.className = 'vi-states-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const sections = document.createElement('div');
        sections.className = 'vi-states-view-sections';
        container.appendChild(sections);
        this._sectionsEl = sections;

        this.hide();
    }

    // x, y, width, height: the left pane's full box, same convention as
    // expectationChartView.js's updateBounds(). The label chip is positioned independently,
    // right-edge-anchored within the same x/width (matching mcLeftViewPill.js's own
    // right-edge-anchor convention), 12px inset from the pane's top.
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
            this._labelChipEl.style.top = (y - 32) + 'px';
            this._labelChipEl.style.transform = 'translateX(-100%)';
        }
    }

    // Rebuilds only the sections that don't exist yet (new sweeps since the last refresh), and
    // re-applies the hovered/pinned highlight class to every existing section - avoids tearing
    // down and rebuilding the whole scrollable list (and losing scroll position) on every redraw
    // during continuous Play.
    refresh() {
        if (!this.containerEl || this.containerEl.style.display === 'none') return;
        if (!this.viState || !this.viState.initialized) {
            this._sectionsEl.innerHTML = '';
            this._renderedSweepCount = 0;
            return;
        }

        const totalSweeps = this.viState.totalSweeps;
        if (totalSweeps < this._renderedSweepCount) {
            // A Reset happened (history shrank) - rebuild from scratch.
            this._sectionsEl.innerHTML = '';
            this._renderedSweepCount = 0;
        }

        let addedNew = false;
        for (let k = this._renderedSweepCount; k < totalSweeps; k++) {
            this._sectionsEl.appendChild(this._buildSection(k));
            addedNew = true;
        }
        this._renderedSweepCount = totalSweeps;

        this._applyHighlight();

        // Auto-scroll only when a genuinely new sweep was added, not on every refresh() call
        // (Play's continuous ticking calls refresh() far more often than sweeps actually
        // advance) - keeps the newest section in view without fighting the user for scroll
        // position mid-sweep.
        if (addedNew) {
            this._sectionsEl.scrollTop = this._sectionsEl.scrollHeight;
        }
    }

    _buildSection(sweepIndex) {
        const section = document.createElement('div');
        section.className = 'vi-states-view-section';
        section.dataset.sweepIndex = String(sweepIndex);

        const header = document.createElement('div');
        header.className = 'vi-states-view-section-header';
        header.textContent = `t = ${sweepIndex}`;
        section.appendChild(header);

        const cards = document.createElement('div');
        cards.className = 'vi-states-view-cards';
        this.viState.stateIds.forEach(stateId => {
            cards.appendChild(this._buildCard(sweepIndex, stateId));
        });
        section.appendChild(cards);

        section.addEventListener('mouseenter', () => {
            this.viViewModel.hoveredSweepIndex = sweepIndex;
            this._applyHighlight();
            if (typeof redraw === 'function') redraw();
        });
        section.addEventListener('mouseleave', () => {
            this.viViewModel.hoveredSweepIndex = null;
            this._applyHighlight();
            if (typeof redraw === 'function') redraw();
        });
        section.addEventListener('click', () => {
            this.viViewModel.pinnedSweepIndex =
                this.viViewModel.pinnedSweepIndex === sweepIndex ? null : sweepIndex;
            this._applyHighlight();
            if (typeof redraw === 'function') redraw();
        });

        return section;
    }

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

    // Toggles the active-highlight class on whichever section matches previewedSweepIndex - a
    // plain class list scan rather than a full rebuild, since sections themselves never change
    // once appended (only which one is marked "active" does).
    _applyHighlight() {
        if (!this._sectionsEl) return;
        const previewed = this.viViewModel.previewedSweepIndex;
        Array.from(this._sectionsEl.children).forEach(section => {
            const isActive = previewed !== null && Number(section.dataset.sweepIndex) === previewed;
            section.classList.toggle('vi-states-view-section--active', isActive);
        });
    }

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
}
```

- [ ] **Step 2: Add CSS to `style.css`**

Add this block immediately after the existing `.expectation-chart-view-body` rule (search for that selector to find the insertion point — keep the new rules near the other overlay-DOM-component rules since they're structurally analogous):
```css
/* ── Iteration left-pane States view (Phase 3b) ──────────────────────────── */

.vi-states-view-chip {
  position: fixed;
  z-index: 10;
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border: 1px solid var(--accent-teal);
  border-radius: var(--radius-btn, 6px);
  background: var(--surface-card2, var(--bg-card));
  color: var(--accent-teal);
  display: none;
}

.vi-states-view {
  position: fixed;
  z-index: 8;
  background: var(--surface-canvas);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.vi-states-view-sections {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.vi-states-view-section {
  border: 1px solid var(--border-hairline, var(--border-light));
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
  cursor: pointer;
}

.vi-states-view-section:last-child {
  margin-bottom: 0;
}

.vi-states-view-section--active {
  border-color: var(--accent-teal);
  background: color-mix(in srgb, var(--accent-teal) 10%, transparent);
}

.vi-states-view-section-header {
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.vi-states-view-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.vi-states-view-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--surface-btn);
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 11px;
}

.vi-states-view-card-name {
  color: var(--text-muted);
}

.vi-states-view-card-value {
  color: var(--text-dark);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
```
(`--accent-teal` matches this codebase's existing convention of teal = Value Iteration's own accent, per `AppPalette.valueIteration`/`ValuesMethodMatrix`'s `known:full` entry.)

- [ ] **Step 3: Add the script tag to `index.html`**

Insert immediately after the `expectationChartView.js` line:
```html
    <script src="src/main/view/expectationChartView.js"></script>
    <script src="src/main/view/viStatesView.js"></script>
```

- [ ] **Step 4: Syntax check**

Run: `node --check src/main/view/viStatesView.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/main/view/viStatesView.js style.css index.html
git commit -m "Add ViStatesView: new per-sweep States view for Iteration's left pane"
```

(Not wired to `main.js` yet — that's Task 6. Safe to commit unwired, matching Phase 3a's own per-task commit style.)

---

### Task 4: `mainView.js` — split the VI draw dispatch; wire resize

**Files:**
- Modify: `src/main/view/mainView.js`

**Interfaces:**
- Consumes: `ExpectationViewModel.splitWidths(canvasW)` (existing, from Phase 3a — accessed via `mainView.expectationView.expectationViewModel.splitWidths(...)`, the same access path Phase 3a's own resize wiring already uses), `_isLearningIterationActive()` (existing global function defined in `main.js`, safe to call from `mainView.js` at draw/resize call time since `main.js` has finished loading and defining it by the time the app is actually running — same precedented pattern as `expectationView.js`'s own reference to the `mainView` global).

- [ ] **Step 1: Wrap the VI draw call in a translate + clip when the split applies**

Find (in `draw()`):
```js
            } else if (subView === 'vi' && this.valueIterationView) {
                push();
                // Fixed screen-space shift (applied before pan/zoom, so it isn't affected by
                // zoom scale) to clear the floating estimator pill.
                translate(0, MV_VALUES_PILL_CLEARANCE);
                translate(this.viewModel.viewport.panX, this.viewModel.viewport.panY);
                scale(this.viewModel.viewport.zoom);
                // The unknown:full quadrant (Learning Iteration) is a genuinely separate
                // subsystem (real episodic Q-learning + search tree), not VI's rendering.
                const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
                if (quadrant === 'unknown:full' && this.learningIterationView) {
                    this.learningIterationView.draw();
                } else {
                    this.valueIterationView.draw();
                }
                pop();
            }
```
Replace with:
```js
            } else if (subView === 'vi' && this.valueIterationView) {
                const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
                const isSplit = quadrant !== 'unknown:full';
                const leftW = isSplit && this.expectationView
                    ? this.expectationView.expectationViewModel.splitWidths(usableW).leftW
                    : 0;

                push();
                if (isSplit) {
                    drawingContext.save();
                    drawingContext.beginPath();
                    drawingContext.rect(leftW, 0, usableW - leftW, usableH);
                    drawingContext.clip();
                }
                // Fixed screen-space shift (applied before pan/zoom, so it isn't affected by
                // zoom scale) to clear the floating estimator pill, plus the left pane's width
                // when the split applies (Phase 3b) - shifts the whole pan/zoom'd graph into the
                // right 48% instead of the full canvas. Pan/zoom itself is untouched: it's pure
                // incremental drag/wheel-delta accumulation with no absolute-recentering call
                // active in VI mode (keyboard shortcuts, including 'r' reset-zoom, are already
                // fully disabled while mode === 'values'), so it composes correctly with this
                // constant shift with no special-casing needed.
                translate(leftW, MV_VALUES_PILL_CLEARANCE);
                translate(this.viewModel.viewport.panX, this.viewModel.viewport.panY);
                scale(this.viewModel.viewport.zoom);
                // The unknown:full quadrant (Learning Iteration) is a genuinely separate
                // subsystem (real episodic Q-learning + search tree), not VI's rendering - never
                // split, drawn full-width exactly as today (isSplit is false there, leftW is 0).
                if (quadrant === 'unknown:full' && this.learningIterationView) {
                    this.learningIterationView.draw();
                } else {
                    this.valueIterationView.draw();
                }
                if (isSplit) drawingContext.restore();
                pop();
            }
```

- [ ] **Step 2: Add a shared helper for computing VI's split geometry, reused by resize**

Add this new method near `_valuesPaneWidths()` (search for that method to find a sensible placement):
```js
    // Returns { leftW, rightW } for Values -> Iteration's split (Phase 3b), or null if the
    // current quadrant doesn't split (Learning Iteration). Shared by the draw dispatch above and
    // the resize handlers below so they can never disagree about the split geometry.
    _viSplitWidths(usableW) {
        if (!this.expectationView) return null;
        const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
        if (quadrant === 'unknown:full') return null;
        return this.expectationView.expectationViewModel.splitWidths(usableW);
    }
```

- [ ] **Step 3: Simplify Step 1's draw-dispatch to reuse this helper**

Change the block just added in Step 1:
```js
                const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
                const isSplit = quadrant !== 'unknown:full';
                const leftW = isSplit && this.expectationView
                    ? this.expectationView.expectationViewModel.splitWidths(usableW).leftW
                    : 0;
```
to:
```js
                const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
                const viSplit = this._viSplitWidths(usableW);
                const isSplit = viSplit !== null;
                const leftW = isSplit ? viSplit.leftW : 0;
```

- [ ] **Step 4: Wire `ViStatesView`'s bounds into `windowResized()` and `onPanelResize()`**

Find (in `windowResized()`):
```js
        if (this.expectationView && this.viewModel.interaction.mode === 'values'
            && this.viewModel.valuesSubView === 'mc') {
            this.expectationView.resize(paneWidths.mc, valuesHeight, this.TOP_BARS_HEIGHT);
            if (this.mcLeftViewPill) {
                const { leftW, rightW } = this.expectationView.expectationViewModel.splitWidths(paneWidths.mc);
                this.mcLeftViewPill.updateBounds(leftW, rightW);
            }
        }
```
Add immediately after this block (still inside `windowResized()`):
```js
        if (this.viStatesView && this.viewModel.interaction.mode === 'values'
            && this.viewModel.valuesSubView === 'vi') {
            const viSplit = this._viSplitWidths(paneWidths.vi);
            if (viSplit) {
                this.viStatesView.updateBounds(0, this.TOP_BARS_HEIGHT, viSplit.leftW, valuesHeight);
                this.viStatesView.show();
            } else {
                this.viStatesView.hide();
            }
        }
```
There is a SECOND, near-identical block later in the same file, inside `onPanelResize(newPanelWidth) {` (the exact same 4-line `expectationView.resize(...)`/`mcLeftViewPill` body) — apply the identical addition there too, so both resize entry points stay in sync, mirroring how every MC pill's bounds are already kept in sync at both call sites.

- [ ] **Step 5: Syntax check**

Run: `node --check src/main/view/mainView.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/main/view/mainView.js
git commit -m "Split VI's draw dispatch into the 52/48 layout; wire ViStatesView bounds into resize"
```

(`this.viStatesView` doesn't exist as a `mainView` property yet — that's assigned in Task 6. This task's own browser verification is deferred to Task 6, once the whole chain is wired end-to-end; committing here matches every other task's own "safe to commit unwired" precedent, and `node --check` alone confirms this task's code is syntactically sound.)

---

### Task 5: `main.js` — construct `ViStatesView`; wire lifecycle hooks; `getLeftInset`

**Files:**
- Modify: `src/main/app/main.js`

**Interfaces:**
- Consumes: `ViStatesView` (Task 3), `mainView._viSplitWidths()` (Task 4), `_isLearningIterationActive()` (existing).

- [ ] **Step 1: Construct `viStatesView`**

Find the existing `ValueIterationView` construction (search for `const valueIterationView = new ValueIterationView(canvasViewModel, {`) and add immediately after its closing `mainView.valueIterationView = valueIterationView;` line:
```js
    const viStatesView = new ViStatesView(canvasViewModel, valueIterationState, valueIterationViewModel);
    mainView.viStatesView = viStatesView;
```

- [ ] **Step 2: Call `.setup()` during app bootstrap**

Find where `viSweepChip.setup(...)` is called (search for `viSweepChip.setup(mainView.TOP_BARS_HEIGHT);`) and add immediately after:
```js
    viStatesView.setup();
```

- [ ] **Step 3: Wire `getLeftInset` into `ValueIterationView`'s constructor options**

Find:
```js
    const valueIterationView = new ValueIterationView(canvasViewModel, {
        getPanelWidth: () => rightPanel.getWidth(),
        getTopOffset: () => mainView.TOP_BARS_HEIGHT,
        getBottomOffset: () => topBar.getHeight()
    });
```
Replace with:
```js
    const valueIterationView = new ValueIterationView(canvasViewModel, {
        getPanelWidth: () => rightPanel.getWidth(),
        getTopOffset: () => mainView.TOP_BARS_HEIGHT,
        getBottomOffset: () => topBar.getHeight(),
        getLeftInset: () => {
            const canvasW = windowWidth - rightPanel.getWidth();
            const viSplit = mainView._viSplitWidths(canvasW);
            return viSplit ? viSplit.leftW : 0;
        }
    });
```

- [ ] **Step 4: Add a `setUpVISplitChrome()` helper, mirroring `setUpMCSplitChrome()`**

Add this new function right after `setUpMCSplitChrome()`'s own closing brace (search for that function to find the insertion point):
```js
// Positions/shows Phase 3b's own chrome (the States view + its label chip) - called from both
// the cold-entry values() hook and onEnterSubView.vi, mirroring setUpMCSplitChrome()'s own
// two-call-site pattern. No-ops (and hides the States view) for Learning Iteration, which never
// splits.
function setUpVISplitChrome() {
    if (!mainView || !mainView.viStatesView) return;
    const panelW = rightPanel ? rightPanel.getWidth() : 272;
    const canvasW = windowWidth - panelW;
    const canvasH = windowHeight - mainView.TOP_BARS_HEIGHT - mainView.getDockHeight();
    const viSplit = mainView._viSplitWidths(canvasW);

    if (viSplit) {
        mainView.viStatesView.updateBounds(0, mainView.TOP_BARS_HEIGHT, viSplit.leftW, canvasH);
        mainView.viStatesView.show();
    } else {
        mainView.viStatesView.hide();
    }
}
```

- [ ] **Step 5: Call it from the cold-entry `values()` hook's `vi` branch**

Find (inside `onEnter.values`):
```js
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
```
Replace with:
```js
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
                setUpVISplitChrome();
            }
```

- [ ] **Step 6: Call it from `onEnterSubView.vi`**

Find:
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
            if (mainView && mainView.viSweepChip) {
                mainView.viSweepChip.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                mainView.viSweepChip.show();
                mainView.viSweepChip.refresh();
            }
            refreshLearningTreePill();
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
            setUpVISplitChrome();
        }
```

- [ ] **Step 7: Hide the States view when leaving Values mode entirely, and on `mc` sub-view entry**

Find the `onLeave.values` hook (it already hides `mcLeftViewPill`/`expectationChartView`/etc.) and add one more line alongside the existing `viSweepChip.hide()` line:
```js
            if (mainView && mainView.viSweepChip) mainView.viSweepChip.hide();
            if (mainView && mainView.viStatesView) mainView.viStatesView.hide();
```

Find `onEnterSubView.mc` (it already hides `viSweepChip`/`chartDock`/etc. when entering MC) and add one more line there too, alongside the existing `if (learningTreePill) learningTreePill.hide();` line:
```js
            if (learningTreePill) learningTreePill.hide();
            if (mainView && mainView.viStatesView) mainView.viStatesView.hide();
```

- [ ] **Step 8: Refresh the States view whenever the sweep computation advances**

Find `refreshVIButtons()` (search for `function refreshVIButtons`) and the three sweep-advancing handlers it's called alongside (`onVIPlay`/`onVIStep`/`onVISkip` — search for `refreshVIButtons();` call sites) — for EACH call site that triggers a real sweep advance (Play tick, Step, Skip; not Reset, which is handled separately below), add a call to refresh the States view immediately after. Since the exact structure of `viPresenter.js`'s callback wiring may have multiple call sites, the concrete rule is: **anywhere `viState.computeNextSweep(...)` or `viAnimator`'s tick logic runs and then calls `rightPanel.updateContent()`/`refreshVIButtons()`/redraw, add `if (mainView && mainView.viStatesView) mainView.viStatesView.refresh();` alongside it.** Locate these call sites by searching `main.js` for `refreshVIButtons()` and add the line at each.

Also find wherever VI's Reset handler runs (search for `onVIReset` or similar in `main.js`/`viPresenter.js`'s wiring) and ensure the States view is refreshed there too, so a Reset (which shrinks `history` back down) correctly rebuilds from scratch (already handled internally by `ViStatesView.refresh()`'s own `totalSweeps < this._renderedSweepCount` shrink-detection from Task 3 — this step only needs to make sure `.refresh()` actually gets CALLED after Reset, not skipped).

- [ ] **Step 9: Syntax check**

Run: `node --check src/main/app/main.js`
Expected: no output.

- [ ] **Step 10: Browser verification — full sub-view/quadrant switching matrix**

Using playwright-core (from the worktree root):
1. Build a small MDP (2+ states, one with a probabilistic self-loop-ish action), set a start node.
2. Enter Values → Iteration with P known / full observability (`known:full`). Confirm: the States view is visible on the left (with the "States" label chip top-right of it), the graph renders in the right 48% only (not bleeding into the left pane), `chartDock`/`viSweepChip` still show exactly as before.
3. Click Run/Step a few times. Confirm: new `t = k` sections appear in the States view, auto-scrolling into view; each section's cards show real per-state values matching `viState.getBackupDetail(k, stateId).value`.
4. Hover an older section. Confirm: the right-pane graph's V-labels/heat immediately reflect that older sweep's values (not the live one), and the section gets a visible highlight. Move the mouse away — confirm it reverts to the live sweep.
5. Click a section to pin it, then click Step again. Confirm: the pinned sweep's preview persists (the graph keeps showing the pinned sweep, not the new live one) while the States view still gains the new section underneath.
6. Click the same pinned section again to unpin. Confirm the graph reverts to showing the live sweep.
7. Switch to P unknown / full observability (`unknown:full`, Learning Iteration). Confirm: the States view and its label chip are both hidden, the canvas reverts to Learning Iteration's own full-width Graph/Tree view exactly as before this plan.
8. Switch back to `known:full`. Confirm the split and States view reappear correctly, with all previously-computed sweeps still in the list (data isn't cleared by a same-mode sub-view switch, matching existing MC/VI persistence conventions).
9. Switch to Values → Monte Carlo, then back to Values → Iteration. Confirm no stale chrome from either sub-view leaks into the other (MC's `mcLeftViewPill`/`expectationChartView` stay hidden while in VI; `viStatesView` stays hidden while in MC).
10. Resize the browser window while the States view is showing. Confirm its bounds update to match the new split geometry (no stale/clipped position).
11. Check both light and dark theme. Confirm zero console errors throughout.

- [ ] **Step 11: Commit**

```bash
git add src/main/app/main.js
git commit -m "Wire ViStatesView into main.js: construction, lifecycle hooks, getLeftInset"
```

---

### Task 6: Final regression pass, `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- None new — this task is verification + documentation only.

- [ ] **Step 1: Full regression pass (playwright-core, from the worktree root)**

In addition to re-running Task 5's own verification script once more against the final combined state, specifically also check:
1. **Explanation overlay coexistence**: with P known, click a revealed Q-table cell in the right DOM panel (`RightPanel._renderQTable()`). Confirm the canvas fan-out explanation overlay still appears correctly, positioned within the right pane (not shifted/clipped wrong), and that hovering/pinning a States-view section while the explanation overlay is showing doesn't break either interaction.
2. **Belief Iteration / PO Q-Learning quadrants** (`known:partial`, `unknown:partial`): confirm the split, States view, and sweep-preview hover/pin all work identically to `known:full` — these two quadrants reuse the exact same `ValueIterationView`/`ValueIterationState` under the hood, so the same code paths apply; specifically confirm the illustrative belief-scalar labels (`_beliefFor()`) still render correctly within the clipped right pane.
3. **Play (continuous) while the States view is open**: confirm sections append correctly at the animation's own beat/pause timing without visual jank, and that the auto-scroll-only-on-new-sweep logic (Task 3) doesn't fight the user if they manually scroll up mid-Play to review an old section.
4. **Zero console errors**, both light and dark theme, one full pass through the whole matrix in Step 10 of Task 5 once more after all tasks are combined.

- [ ] **Step 2: Update `CLAUDE.md`**

In the `### Value Iteration / Learning Iteration / Belief Iteration / PO Q-Learning (Values → vi)` section, add a new paragraph after the existing "Overrides are presentation-layer only..." paragraph:
```
Values → Iteration's canvas is a persistent **52% left / 48% right split** (Phase 3b of the
Evaluate redesign roadmap — see `docs/superpowers/specs/2026-07-17-vi-screen-split-design.md`),
for the three quadrants that run `ValueIterationView`'s real Bellman-sweep computation (Value
Iteration, Belief Iteration, PO Q-Learning) — `unknown:full` (Learning Iteration) is unaffected
and keeps its own full-canvas Graph/Tree view. The left pane hosts a new **States** view
(`viStatesView.js`) — one section per computed sweep (`t = k`), each holding one per-state
backup card sourced directly from `ValueIterationState.getBackupDetail()`; hovering a section
previews that sweep's V/Q/policy on the shared right pane (`ValueIterationViewModel.hoveredSweepIndex`),
clicking pins it (`.pinnedSweepIndex`, click again to unpin) — the same hover/pin convention
`ExpectationViewModel.hoveredRun`/`selectedRunIndex` established for Monte Carlo's grid. The
right pane is the exact same `ValueIterationView.draw()` rendering as before this phase, just
translated and clipped into 48% of the canvas by `mainView.js`'s draw dispatch — no fit-transform
or internal rendering change, since VI already draws at real graph coordinates under the shared
pan/zoom viewport. Play/Step/Skip always advance the real live sweep regardless of what's pinned
for preview.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Final regression pass for Phase 3b (Iteration screen split); update CLAUDE.md"
```

---

## Self-Review Notes

- **Spec coverage:** 52/48 split for the 3 real-VI quadrants ✓ (Task 4's draw-dispatch wrap); States view with per-sweep backup cards ✓ (Task 3); hover-preview/click-pin selection model matching 3a ✓ (Tasks 1-3); Play/Step/Skip unaffected by pinning ✓ (Task 2 keeps pulse-detection on the live sweep, rendering only reads the preview — Play/Step/Skip themselves never read `previewedSweepIndex` anywhere in this plan, they only ever call `computeNextSweep()`/mutate `currentSweepIndex`); Learning Iteration untouched ✓ (every new call gated on `_viSplitWidths()`/`_isLearningIterationActive()` returning null/true respectively); static label chip (not a real pill) ✓ (Task 3's `.vi-states-view-chip`); explanation-overlay coexistence ✓ (Task 6's regression pass, no removal anywhere in this plan); shared 52/48 constant, not duplicated ✓ (every task reads `ExpectationViewModel.splitWidths()` via `mainView._viSplitWidths()`, never redefines 0.52).
- **Placeholder scan:** none found — every step has complete, copy-pasteable code, or an exact search-and-verify instruction for Task 5's Step 8 (the one step that couldn't be given verbatim before/after code, since it depends on `viPresenter.js`'s exact existing call-site count/shape, which needs to be read fresh at implementation time — this is flagged as a concrete, bounded search task with a precise rule for what to change, not a vague "handle it" placeholder).
- **Type/name consistency check:** `hoveredSweepIndex`/`pinnedSweepIndex`/`previewedSweepIndex` used identically across Tasks 1, 2, 3, 6; `ViStatesView`'s constructor signature `(canvasViewModel, valueIterationState, valueIterationViewModel)` matches exactly between Task 3's class definition and Task 5's construction call; `mainView.viStatesView`/`mainView._viSplitWidths()` names consistent across Tasks 4 and 5; `setUpVISplitChrome()` matches `setUpMCSplitChrome()`'s established naming/shape exactly.
- **Known, deliberate scope decisions** (both explained inline in Global Constraints): no pan/zoom re-centering logic added (keyboard shortcuts already fully disabled in Values mode; incremental drag/wheel already composes correctly with a constant shift); the static label chip is folded directly into `ViStatesView` rather than a separate file, since it's a single non-interactive element too small to justify its own component (unlike `McLeftViewPill`, which is a real interactive segmented control).
- **Real internal change to `valueIterationView.js` flagged upfront, not hidden**: the design spec said "confirm `draw()` can be called with a translated origin and clipped width/height without internal changes" — research during planning found this is ALMOST true (the core rendering needs zero changes) but two screen-space-anchored UI elements (placeholder, explanation status strip) DO need a new `getLeftInset()` awareness (Task 2) to center correctly within the narrower right pane. This is called out explicitly rather than silently patched in, since it's a real (if small) deviation from the spec's own framing.
