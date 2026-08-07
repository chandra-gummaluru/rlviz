# Unified Trace Scrubber + Steps Horizon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Monte Carlo's `ExpectationScrubber` and Build/Policy's read-only "t" progress bar with one shared, bottom-center scrubber + steps-horizon control, used identically across Build, Policy, and Monte Carlo.

**Architecture:** A new dumb, callback-driven DOM component (`TraceScrubber`) owns only presentation/interaction (tick row, stepper arrows, horizon control, drag-to-scrub) — it knows nothing about `SimulationState` or `ExpectationState` directly. Build/Policy and Monte Carlo each feed it their own tick labels/position and react to its callbacks by mutating their own domain state, mirroring the existing callback pattern already used by `TreeViewPill`/`EstimatorPill` rather than `ExpectationScrubber`'s current tighter coupling to `expectationState`. Build/Policy's simulation gains a new `SimulationState.jumpToIndex()` capability so dragging the scrubber is instant (no phase-by-phase animation replay).

**Tech Stack:** Vanilla JS + p5.js, no build step, no automated test suite (manual/headless-browser verification only, per this repo's established convention).

## Global Constraints

- No automated test suite exists in this repo. Every task's verification step is manual/headless-browser (`python3 -m http.server` + `playwright-core` if available, with REAL `page.mouse.move`/`page.mouse.click`/`page.mouse.down`+`move`+`up` events for drag — this app's p5.js/DOM elements bind to native mouse events, not synthetic `.click()`). Check both light and dark theme wherever a task touches rendering.
- Value Iteration's sweep-stepping UI (`T` input, `viSweepChip`) is **completely untouched** by this plan.
- No reward-dot decoration anywhere — this is a deliberate simplification, removed even from Monte Carlo's existing behavior, not carried forward.
- Horizon changes do **not** retroactively regenerate an in-progress trace/rollout — they only take effect on the next Run, matching Monte Carlo's existing `maxSteps` behavior today (a plain assignment with no immediate side effect).
- Build/Policy's new `maxSteps` field means **transitions** (state→action→state = 1), matching Monte Carlo's existing `expectationState.maxSteps` semantic exactly, including the same `* 2 + 1` conversion to raw trace-node count when calling `TraceGenerator.generate()`.
- Build/Policy's new `maxSteps` defaults to **25** (chosen to reproduce today's existing hardcoded ~25-transition behavior, since `TraceGenerator.generate()` is currently called with a hardcoded cap of 50 raw nodes ≈ 25 transitions) — NOT Monte Carlo's default of 100. Same slider range as Monte Carlo (1–100) for a consistent feel.
- Stepper arrows (‹ ›) move exactly one tick at a time, including landing on action ticks (not skipping to the next state).

---

### Task 1: `TraceScrubber` component (presentational shell, no domain wiring)

**Files:**
- Create: `src/main/view/traceScrubber.js`
- Modify: `style.css` (add new `.trace-scrubber-*` rules; do NOT touch the existing `.scrubber2-*`/`.expectation-scrubber2` rules yet — those are removed in Task 4, once nothing references them)
- Modify: `index.html` (add the new script tag)

**Interfaces:**
- Produces: `class TraceScrubber` with constructor `(callbacks)` where `callbacks = { onScrub(index, isFinal), onMaxStepsChange(newValue) }` (both optional, called only if provided — mirrors `TreeViewPill`'s `callbacks.onSelectView` convention of guarding with `if (this.callbacks.xyz)`). Public methods: `mount(x, y, w)`, `resize(x, y, w)`, `destroy()`, `show()`, `hide()`, `setTicks(labels)` (labels: `Array<string>`, one per tick), `setPosition(index)` (highlights tick `index`, recenters the shifting view on it), `setMaxSteps(value)` (updates the horizon readout only — does not itself fire `onMaxStepsChange`, since this method is used to *reflect* state changes from outside, not just user-driven ones).
- Consumes: nothing from earlier tasks (first task).

- [ ] **Step 1: Add the CSS**

Read `style.css` around line 1544–1656 first (the existing `.expectation-scrubber2`/`.scrubber2-*` block) to see the pattern this borrows layout ideas from — do not edit that block. Add this new block immediately after it (i.e., after line 1655, before the `/* ── Floating Build-mode tool palette ─...` comment):

```css
/* ── Unified trace scrubber (Build/Policy/MC) ────────────────────────── */

.trace-scrubber {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--border-hairline, var(--border-light));
  background: var(--surface-card2, var(--bg-card));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  z-index: 10;
}

.trace-scrubber-arrow {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--text-medium);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.trace-scrubber-arrow:hover { color: var(--text-dark); }
.trace-scrubber-arrow:disabled { opacity: 0.3; cursor: default; }

.trace-scrubber-track {
  position: relative;
  width: 320px;
  height: 24px;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}

.trace-scrubber-track:active { cursor: grabbing; }

.trace-scrubber-ticks {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  will-change: transform;
}

.trace-scrubber-tick {
  position: absolute;
  top: 0;
  height: 100%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  pointer-events: none;
}

.trace-scrubber-tick--active {
  color: var(--text-dark);
  font-weight: 700;
  background: var(--accent-yellow-soft, rgba(245, 215, 110, 0.35));
  border-radius: 4px;
}

.trace-scrubber-fade {
  position: absolute;
  top: 0;
  height: 100%;
  width: 20px;
  pointer-events: none;
  z-index: 1;
}

.trace-scrubber-fade--left {
  left: 0;
  background: linear-gradient(to right, var(--surface-card2, var(--bg-card)), transparent);
}

.trace-scrubber-fade--right {
  right: 0;
  background: linear-gradient(to left, var(--surface-card2, var(--bg-card)), transparent);
}

.trace-scrubber-divider {
  width: 1px;
  height: 18px;
  background: var(--border-hairline, var(--border-light));
  flex-shrink: 0;
}

.trace-scrubber-horizon {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.trace-scrubber-horizon-btn {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border-hairline, var(--border-light));
  border-radius: 4px;
  background: transparent;
  color: var(--text-medium);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
}

.trace-scrubber-horizon-btn:hover { color: var(--text-dark); }

.trace-scrubber-horizon-value {
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 11px;
  color: var(--text-dark);
  white-space: nowrap;
}
```

- [ ] **Step 2: Write `traceScrubber.js`**

Create `src/main/view/traceScrubber.js`:

```js
// Unified bottom-center scrubber + steps-horizon control, shared by Build, Policy, and Monte
// Carlo (Value Iteration keeps its own separate sweep-stepping UI, untouched). Deliberately dumb
// and callback-driven - unlike the ExpectationScrubber it replaces, this component knows nothing
// about SimulationState or ExpectationState directly. Each consumer (mainView.js for Build/
// Policy, expectationView.js for Monte Carlo) feeds it tick labels/position via setTicks()/
// setPosition() and reacts to its callbacks by mutating its own domain state - mirroring the
// callback pattern already used by TreeViewPill/EstimatorPill in this codebase.
class TraceScrubber {
    static TICK_PX = 44;
    static MIN_MAX_STEPS = 1;
    static MAX_MAX_STEPS = 100;

    constructor(callbacks = {}) {
        this.callbacks = callbacks;

        this.containerEl = null;
        this.trackEl = null;
        this.ticksEl = null;
        this.leftArrowEl = null;
        this.rightArrowEl = null;
        this.horizonValueEl = null;

        this._ticks = [];
        this._currentIndex = 0;
        this._maxSteps = 25;
        this._width = 0;

        this._dragging = false;
        this._dragStartX = 0;
        this._dragStartIndex = 0;
        this._rafHandle = null;

        this._boundMove = this._onPointerMove.bind(this);
        this._boundUp = this._onPointerUp.bind(this);
    }

    mount(x, y, w) {
        this.destroy();
        this._width = w;

        const container = document.createElement('div');
        container.className = 'trace-scrubber';
        document.body.appendChild(container);
        this.containerEl = container;

        const leftArrow = document.createElement('button');
        leftArrow.type = 'button';
        leftArrow.className = 'trace-scrubber-arrow';
        leftArrow.textContent = '‹';
        leftArrow.addEventListener('mousedown', e => e.stopPropagation());
        leftArrow.addEventListener('click', e => {
            e.stopPropagation();
            this._scrubTo(this._currentIndex - 1, true);
        });
        container.appendChild(leftArrow);
        this.leftArrowEl = leftArrow;

        const track = document.createElement('div');
        track.className = 'trace-scrubber-track';
        container.appendChild(track);
        this.trackEl = track;

        const ticks = document.createElement('div');
        ticks.className = 'trace-scrubber-ticks';
        track.appendChild(ticks);
        this.ticksEl = ticks;

        const fadeLeft = document.createElement('div');
        fadeLeft.className = 'trace-scrubber-fade trace-scrubber-fade--left';
        track.appendChild(fadeLeft);

        const fadeRight = document.createElement('div');
        fadeRight.className = 'trace-scrubber-fade trace-scrubber-fade--right';
        track.appendChild(fadeRight);

        track.addEventListener('pointerdown', e => this._onPointerDown(e));

        const rightArrow = document.createElement('button');
        rightArrow.type = 'button';
        rightArrow.className = 'trace-scrubber-arrow';
        rightArrow.textContent = '›';
        rightArrow.addEventListener('mousedown', e => e.stopPropagation());
        rightArrow.addEventListener('click', e => {
            e.stopPropagation();
            this._scrubTo(this._currentIndex + 1, true);
        });
        container.appendChild(rightArrow);
        this.rightArrowEl = rightArrow;

        const divider = document.createElement('div');
        divider.className = 'trace-scrubber-divider';
        container.appendChild(divider);

        const horizon = document.createElement('div');
        horizon.className = 'trace-scrubber-horizon';
        container.appendChild(horizon);

        const minusBtn = document.createElement('button');
        minusBtn.type = 'button';
        minusBtn.className = 'trace-scrubber-horizon-btn';
        minusBtn.textContent = '−';
        minusBtn.addEventListener('mousedown', e => e.stopPropagation());
        minusBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._adjustMaxSteps(-1);
        });
        horizon.appendChild(minusBtn);

        const icon = document.createElement('span');
        icon.textContent = '⏱';
        horizon.appendChild(icon);

        const value = document.createElement('span');
        value.className = 'trace-scrubber-horizon-value';
        horizon.appendChild(value);
        this.horizonValueEl = value;

        const plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'trace-scrubber-horizon-btn';
        plusBtn.textContent = '+';
        plusBtn.addEventListener('mousedown', e => e.stopPropagation());
        plusBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._adjustMaxSteps(1);
        });
        horizon.appendChild(plusBtn);

        this._renderTicks();
        this._updateHorizonLabel();
    }

    resize(x, y, w) {
        this._width = w;
    }

    setTicks(labels) {
        this._ticks = labels || [];
        this._currentIndex = Math.max(0, Math.min(this._ticks.length - 1, this._currentIndex));
        this._renderTicks();
    }

    setPosition(index) {
        this._currentIndex = Math.max(0, Math.min(this._ticks.length - 1, index));
        this._applyPosition();
    }

    setMaxSteps(value) {
        this._maxSteps = value;
        this._updateHorizonLabel();
    }

    show() {
        if (this.containerEl) this.containerEl.style.display = '';
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }

    destroy() {
        if (this.containerEl) this.containerEl.remove();
        cancelAnimationFrame(this._rafHandle);
        this.containerEl = null;
        this.trackEl = null;
        this.ticksEl = null;
    }

    _renderTicks() {
        if (!this.ticksEl) return;
        this.ticksEl.innerHTML = '';
        this._ticks.forEach((label, i) => {
            const tick = document.createElement('div');
            tick.className = 'trace-scrubber-tick';
            tick.style.left = (i * TraceScrubber.TICK_PX) + 'px';
            tick.textContent = label;
            this.ticksEl.appendChild(tick);
        });
        this._applyPosition();
    }

    _applyPosition() {
        if (!this.ticksEl || !this.trackEl) return;
        const trackWidth = this.trackEl.clientWidth || 320;
        const centerX = trackWidth / 2;
        const offset = centerX - this._currentIndex * TraceScrubber.TICK_PX;
        this.ticksEl.style.transform = `translateX(${offset}px)`;

        Array.from(this.ticksEl.children).forEach((el, i) => {
            el.classList.toggle('trace-scrubber-tick--active', i === this._currentIndex);
        });

        if (this.leftArrowEl) this.leftArrowEl.disabled = this._currentIndex <= 0;
        if (this.rightArrowEl) this.rightArrowEl.disabled = this._currentIndex >= this._ticks.length - 1;
    }

    _scrubTo(index, isFinal) {
        const clamped = Math.max(0, Math.min(this._ticks.length - 1, index));
        if (clamped === this._currentIndex && isFinal) return;
        this._currentIndex = clamped;
        this._applyPosition();
        if (this.callbacks.onScrub) this.callbacks.onScrub(clamped, isFinal);
    }

    _adjustMaxSteps(delta) {
        const next = Math.max(TraceScrubber.MIN_MAX_STEPS, Math.min(TraceScrubber.MAX_MAX_STEPS, this._maxSteps + delta));
        if (next === this._maxSteps) return;
        this._maxSteps = next;
        this._updateHorizonLabel();
        if (this.callbacks.onMaxStepsChange) this.callbacks.onMaxStepsChange(next);
    }

    _updateHorizonLabel() {
        if (this.horizonValueEl) this.horizonValueEl.textContent = `steps=${this._maxSteps}`;
    }

    _onPointerDown(e) {
        this._dragging = true;
        this._dragStartX = e.clientX;
        this._dragStartIndex = this._currentIndex;
        this.trackEl.setPointerCapture(e.pointerId);
        this.trackEl.addEventListener('pointermove', this._boundMove);
        this.trackEl.addEventListener('pointerup', this._boundUp);
        this.trackEl.addEventListener('pointercancel', this._boundUp);
    }

    _onPointerMove(e) {
        if (!this._dragging) return;
        const raw = this._rawIndexFromEvent(e);
        cancelAnimationFrame(this._rafHandle);
        this._rafHandle = requestAnimationFrame(() => this._scrubTo(Math.round(raw), false));
    }

    _onPointerUp(e) {
        if (!this._dragging) return;
        this._dragging = false;
        this.trackEl.removeEventListener('pointermove', this._boundMove);
        this.trackEl.removeEventListener('pointerup', this._boundUp);
        this.trackEl.removeEventListener('pointercancel', this._boundUp);

        const raw = this._rawIndexFromEvent(e);
        cancelAnimationFrame(this._rafHandle);
        this._scrubTo(Math.round(raw), true);
    }

    _rawIndexFromEvent(e) {
        const dx = e.clientX - this._dragStartX;
        const raw = this._dragStartIndex - dx / TraceScrubber.TICK_PX;
        return Math.max(0, Math.min(this._ticks.length - 1, raw));
    }
}
```

- [ ] **Step 3: Add the script tag**

In `index.html`, find the existing `<script src="src/main/view/expectationScrubber.js"></script>` tag (around line 279) and add the new tag directly after it (both will exist side by side until Task 4 removes the old one):

```html
    <script src="src/main/view/expectationScrubber.js"></script>
    <script src="src/main/view/traceScrubber.js"></script>
```

- [ ] **Step 4: Verify in browser**

No automated test suite — verify with a real browser. Start `python3 -m http.server` from the repo root (pick a free port) and drive it with `playwright-core`/Chromium or manual interaction:

1. Open the console and confirm `new TraceScrubber({}).mount(0, 0, 800)` (run directly via `page.evaluate`) appends a `.trace-scrubber` element to `document.body`, bottom-center, with visible `‹`/`›` arrows and a `− ⏱ steps=25 +` horizon control.
2. Call `.setTicks(['S0','a0','S1','a1','S2'])` then `.setPosition(2)`: confirm the "S1" tick is highlighted and horizontally centered under the track.
3. Drag the track left/right with real `page.mouse.down`/`move`/`up` events: confirm the highlighted tick follows the drag and settles on the nearest tick on release.
4. Click the `›`/`‹` arrows: confirm position moves exactly one tick per click and disables at each end.
5. Click `+`/`-`: confirm the `steps=N` label updates and clamps at 1 and 100.
6. No console errors, both light and dark theme (toggle via `AppPalette.setTheme(...)`).

- [ ] **Step 5: Commit**

```bash
git add src/main/view/traceScrubber.js style.css index.html
git commit -m "Add TraceScrubber: unified bottom-center scrubber + steps-horizon component"
```

---

### Task 2: Domain support — `SimulationState.maxSteps` + `jumpToIndex()`

**Files:**
- Modify: `src/main/domain/simulationState.js`
- Modify: `src/main/use_case/simulation/simulationAnimator.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `SimulationState.maxSteps` (new field, default `25`), `SimulationState.jumpToIndex(targetIndex, graph)` (new method — recomputes `currentIndex`/`currentNode`/visible nodes+edges/`totalReward`/`stepCount`/`rewardHistory` from scratch by walking `visited[0..targetIndex]`, looking up each transition's real reward via `graph.getNodeById(...).sas`, mirroring `SimulationAnimator.getNodeFromGraph()`'s own lookup pattern since `createVisitedEntry()` doesn't store reward on the trace entry itself).

- [ ] **Step 1: Add `maxSteps` field**

In `src/main/domain/simulationState.js`, find the constructor's "Simulation statistics" block (currently ends with `this.currentOutcomeProbs = [];` before the "Policy settings" comment). Add directly after it:

```js
        // User-configurable trace-length cap, in TRANSITIONS (state->action->state = 1) - matches
        // expectationState.maxSteps's semantic exactly (Monte Carlo's own equivalent "steps"
        // parameter), including the same *2+1 conversion to raw trace-node count when calling
        // TraceGenerator.generate(). Default 25 reproduces this app's prior hardcoded ~25-
        // transition behavior (TraceGenerator.generate() used to always be called with a fixed
        // cap of 50 raw nodes) rather than silently jumping to Monte Carlo's much larger default
        // of 100.
        this.maxSteps = 25;
```

- [ ] **Step 2: Add `jumpToIndex()`**

In the same file, add this method right after `advance()` (before `canAdvance()`):

```js
    // Instantly jump to an arbitrary trace position, bypassing the normal phase-by-phase
    // animation (reveal/decision/transition/camera) that advance() drives via SimulationAnimator -
    // used by TraceScrubber's drag-to-scrub and stepper-arrow interactions. Recomputes reward/
    // visibility state from scratch rather than incrementally replaying advance()/addReward()
    // calls, since jumping BACKWARD must also un-accumulate reward/visibility past the new
    // position, not just stop adding to it. `graph` is required to look up each transition's real
    // reward (mirrors SimulationAnimator.getNodeFromGraph()'s own sas.find() lookup - the trace
    // entries themselves don't carry reward, see TraceGenerator.createVisitedEntry()).
    jumpToIndex(targetIndex, graph) {
        if (this.visited.length === 0) return;
        const clamped = Math.max(0, Math.min(this.visited.length - 1, targetIndex));

        this.currentIndex = clamped;
        this.currentNode = this.visited[clamped];
        this.phase = 'idle';
        this.isPlaying = false;
        this.phaseStartTime = 0;
        this.phaseDuration = 0;

        this.clearVisualState();
        this.totalReward = 0;
        this.stepCount = 0;
        this.rewardHistory = [];
        this.pendingReward = 0;
        this.pendingRewardActionNodeId = null;

        for (let i = 0; i <= clamped; i++) {
            this.revealNode(this.visited[i].id);
            if (i > 0) this.revealEdge(this.visited[i - 1].id, this.visited[i].id);

            if (i > 0 && this.visited[i - 1].type === 'action' && this.visited[i].type === 'state') {
                const actionNodeInGraph = graph ? graph.getNodeById(this.visited[i - 1].id) : null;
                const transition = actionNodeInGraph
                    ? actionNodeInGraph.sas.find(t => t.nextState === this.visited[i].id)
                    : null;
                const reward = transition ? transition.reward : 0;
                this.totalReward += reward;
                this.stepCount++;
                this.rewardHistory.push(reward);
            }
        }
    }
```

- [ ] **Step 3: `reset()` also resets `maxSteps`? No — leave it.**

Read `reset()` in the same file. Do NOT add `this.maxSteps = 25;` there — `maxSteps` is a user-configured preference that should survive a Reset click (mirroring `expectationState.maxSteps`, which likewise isn't touched by Monte Carlo's own reset). No code change needed for this step; it's a deliberate no-op, noted so the next task's reviewer doesn't flag it as a missed spot.

- [ ] **Step 4: Use `maxSteps` in trace generation**

In `src/main/use_case/simulation/simulationAnimator.js`, find `validateAndGenerateTrace()`:

```js
    validateAndGenerateTrace() {
        const startNode = this.startNodeProvider();

        if (!startNode) {
            this.outputBoundary.presentError('Please select a start node first (double-click a state node)');
            return false;
        }

        if (startNode.type !== 'state') {
            this.outputBoundary.presentError('Starting node must be a state node');
            return false;
        }

        const visited = this.traceGenerator.generate(startNode, 50, this.simulationState.policy, this.simulationState.policyWeights);
        this.simulationState.setTrace(visited);
        return true;
    }
```

Change the `generate()` call to use the configurable cap, converting transitions to raw node count the same way `runExpectationInteractor.js` already does for Monte Carlo (`maxSteps * 2 + 1`):

```js
        const rawNodeCap = this.simulationState.maxSteps * 2 + 1;
        const visited = this.traceGenerator.generate(startNode, rawNodeCap, this.simulationState.policy, this.simulationState.policyWeights);
        this.simulationState.setTrace(visited);
        return true;
```

- [ ] **Step 5: Verify in browser**

1. Open the app, build a small graph with a state that has 2+ actions and at least one cycle (so a trace can run several transitions). Set s₀.
2. Via the console: `simulationState.maxSteps = 3; ` then click Play (or call the existing Play flow) — confirm the generated trace stops at 3 transitions (7 raw nodes: S,A,S,A,S,A,S) rather than the old default of ~25.
3. Via the console, after a trace exists: call `simulationState.jumpToIndex(0, canvasController.viewModel.graph)` then inspect `simulationState.totalReward`/`stepCount`/`rewardHistory` — confirm they're all reset to zero/empty (position 0 = before any transition). Call `jumpToIndex(4, canvasController.viewModel.graph)` (or the trace's actual last valid index) and confirm `totalReward` matches the sum of the real transition rewards up to that point (cross-check against the graph's actual edge rewards).
4. Confirm calling `jumpToIndex` does not throw when `graph` is passed correctly, and that `visibleNodeIds`/`visibleEdgeIds` contain exactly the nodes/edges up to the jumped-to index (not the whole trace).
5. No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/domain/simulationState.js src/main/use_case/simulation/simulationAnimator.js
git commit -m "SimulationState: add configurable maxSteps and instant jumpToIndex()"
```

---

### Task 3: Wire `TraceScrubber` into Build/Policy

**Files:**
- Modify: `src/main/app/main.js`
- Modify: `src/main/use_case/simulation/simulationPresenter.js`
- Modify: `src/main/adapter/controller/CanvasController.js`
- Modify: `src/main/view/mainView.js`
- Modify: `src/main/view/rightPanel.js`

**Interfaces:**
- Consumes: `TraceScrubber` (Task 1), `SimulationState.maxSteps`/`jumpToIndex()` (Task 2).
- Produces: `CanvasController.jumpSimulationToIndex(index)` (new thin method, mirrors the existing `setBuildCanvasView`/`toggleTreeNodeExpanded` convention of a direct domain-mutating controller method with no full interactor), `SimulationPresenter.setTraceScrubber(traceScrubber)` (new setter, mirrors the existing `setTopBar()` convention), a global `traceScrubber` instance assigned to `mainView.traceScrubber` (mirrors `zoomPill`).

- [ ] **Step 1: Add `jumpSimulationToIndex` to `CanvasController`**

Read `src/main/adapter/controller/CanvasController.js` around `setBuildCanvasView`/`toggleTreeNodeExpanded` (search for `toggleTreeNodeExpanded`) to confirm current line numbers, then add this method directly after `toggleTreeNodeExpanded`'s closing brace:

```js
    // Instantly jumps the active Build/Policy simulation to an arbitrary trace position (used by
    // TraceScrubber's drag-to-scrub and stepper-arrow interactions) - bypasses the normal phase-
    // by-phase animation advance() drives. No-op if no trace exists yet.
    jumpSimulationToIndex(index) {
        const simState = this.viewModel.simulationState;
        if (!simState || !simState.replayInitialized) return;
        simState.jumpToIndex(index, this.viewModel.graph);
    }
```

- [ ] **Step 2: Add `setTraceScrubber` to `SimulationPresenter`, wire ticks/position updates**

Read `src/main/use_case/simulation/simulationPresenter.js` in full first. Add a setter mirroring `setTopBar`:

```js
    setTraceScrubber(traceScrubber) {
        this.traceScrubber = traceScrubber;
    }
```

Add a small private helper for building tick labels from the current trace (place it near the bottom of the class, e.g. right before the closing brace):

```js
    // Builds one tick label per trace entry ("S0", "a0", "S1", ...) from SimulationState.visited.
    _buildTickLabels() {
        return this.viewModel.simulationState.visited.map(entry => entry.name);
    }
```

Now wire it into the two lifecycle points that already exist:

In `presentInitializationComplete()` (called once, when a freshly generated trace's init animation finishes — this is when tick LABELS need to be (re)built, since a brand new trace now exists):

```js
    presentInitializationComplete() {
        if (this.viewModel.interaction.mode !== 'build' && this.viewModel.interaction.mode !== 'policy') return;
        const isPlaying = this.viewModel.simulationState.isPlaying;
        const canAdvance = this.viewModel.simulationState.canAdvance();
        if (this.topBar) this.topBar.updateButtonStates(isPlaying, canAdvance);
        if (this.traceScrubber) {
            this.traceScrubber.setTicks(this._buildTickLabels());
            this.traceScrubber.setPosition(this.viewModel.simulationState.currentIndex);
            this.traceScrubber.setMaxSteps(this.viewModel.simulationState.maxSteps);
        }
        redraw();
    }
```

In `presentRoundComplete()` (called after every completed step — this is when the POSITION needs to update, ticks are unchanged since the trace itself doesn't change mid-run):

```js
    presentRoundComplete(currentNode) {
        const isPlaying = this.viewModel.simulationState.isPlaying;
        const canAdvance = this.viewModel.simulationState.canAdvance();
        if (this.topBar) this.topBar.updateButtonStates(isPlaying, canAdvance);
        if (this.traceScrubber) this.traceScrubber.setPosition(this.viewModel.simulationState.currentIndex);
        redraw();
    }
```

- [ ] **Step 3: Construct `TraceScrubber` and wire it in `main.js`**

Read `src/main/app/main.js` around lines 806–840 (the `zoomPill`/`toolPalette` construction block) and around lines 913–919 (`simulationPresenter` construction) to confirm current line numbers. Add a global declaration alongside the other pill globals (search for `let zoomPill;` around line 102):

```js
let traceScrubber;
```

Right after the `zoomPill.updateBounds(mainView.RIGHT_PANEL_WIDTH); zoomPill.show();` block (around line 840), add:

```js
    traceScrubber = new TraceScrubber({
        onScrub: (index, isFinal) => {
            canvasController.jumpSimulationToIndex(index);
            if (rightPanel) rightPanel.updateContent();
            if (topBar) topBar.updateButtonStates(simulationState.isPlaying, simulationState.canAdvance());
            redraw();
        },
        onMaxStepsChange: (value) => {
            simulationState.maxSteps = value;
        }
    });
    traceScrubber.mount(0, 0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
    traceScrubber.hide();
    mainView.traceScrubber = traceScrubber;
```

Right after `simulationPresenter.setTopBar(topBar);` (around line 915), add:

```js
    simulationPresenter.setTraceScrubber(traceScrubber);
```

- [ ] **Step 4: Show/hide `traceScrubber` via the mode-lifecycle hooks**

In `src/main/app/main.js`, find the `onEnter.build`/`onEnter.policy` hooks (search for `onEnter: {`, around line 391–407) and add `traceScrubber` show/updateBounds calls alongside the existing `zoomPill`/`treeViewPill` ones:

```js
        build: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.show();
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (treeViewPill) {
                treeViewPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                treeViewPill.show();
            }
            if (traceScrubber) {
                traceScrubber.resize(0, 0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                traceScrubber.show();
            }
        },
        policy: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.show();
            if (mainView && mainView.zoomPill) mainView.zoomPill.show();
            if (treeViewPill) {
                treeViewPill.updateBounds(0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                treeViewPill.show();
            }
            if (traceScrubber) {
                traceScrubber.resize(0, 0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
                traceScrubber.show();
            }
        },
```

Find the `onLeave.build`/`onLeave.policy` hooks (search for `onLeave: {`, around line 378–390) and add a hide call to both:

```js
        build: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.hide();
            if (treeViewPill) treeViewPill.hide();
            if (traceScrubber) traceScrubber.hide();
            canvasController.setBuildCanvasView('graph');
        },
        policy: () => {
            if (mainView && mainView.toolPalette) mainView.toolPalette.hide();
            if (treeViewPill) treeViewPill.hide();
            if (traceScrubber) traceScrubber.hide();
            canvasController.setBuildCanvasView('graph');
        }
```

Read the `onLeave.values` hook (search for `values: () => {`, around line 363) — no change needed there (`traceScrubber` is already hidden via `onLeave.build`/`onLeave.policy` before Values mode is ever entered, since you can only reach Values mode by first leaving Build or Policy — confirm this is true by checking `SetModeInteractor.validModes` / the mode-switch flow, and note in your task report if you find a path that reaches Values mode without going through one of those two leave-hooks first).

- [ ] **Step 5: Hide `traceScrubber` until a trace exists; show it once one does**

`onEnter.build`/`onEnter.policy` above unconditionally show `traceScrubber`, but there's no trace yet the first time you enter Build mode (before ever clicking Run/Play/Step). Read `mainView.js`'s `_isEditableMode()` and confirm whether the scrubber should render an empty/placeholder state or truly stay hidden until `simulationState.replayInitialized` is true. The simplest, lowest-risk choice (matching this repo's existing "press Run to start" convention used elsewhere, e.g. Value Iteration's pre-run placeholder) is: keep the scrubber hidden immediately after `onEnter.build`/`onEnter.policy` if no trace exists yet, and let `SimulationPresenter.presentInitializationComplete()` (Step 2 above, which already calls `traceScrubber.setTicks(...)`) also call `traceScrubber.show()` at that point. Update `presentInitializationComplete()` (from Step 2) to add this:

```js
        if (this.traceScrubber) {
            this.traceScrubber.setTicks(this._buildTickLabels());
            this.traceScrubber.setPosition(this.viewModel.simulationState.currentIndex);
            this.traceScrubber.setMaxSteps(this.viewModel.simulationState.maxSteps);
            this.traceScrubber.show();
        }
```

And change `onEnter.build`/`onEnter.policy` (Step 4 above) to NOT unconditionally show it — only `resize()` there, and let `presentInitializationComplete()` be the sole place that calls `.show()`:

```js
            if (traceScrubber) {
                traceScrubber.resize(0, 0, windowWidth - mainView.RIGHT_PANEL_WIDTH);
            }
```

(Apply this same adjusted block to both `build` and `policy` in `onEnter`.)

- [ ] **Step 6: Remove the old right-panel "t" progress bar**

In `src/main/view/rightPanel.js`, find `renderBuildPanel()` and `renderPolicyModePanel()` (search for `this._renderTProgressBar(paramsDiv);` — two call sites). Remove that one line from each:

```js
    renderBuildPanel() {
        this.createSection('Parameters', () => {
            const paramsDiv = createDiv();
            paramsDiv.parent(this.contentContainer);
            paramsDiv.addClass('panel-section-content');
            this._renderGammaSlider(paramsDiv);
        });

        this.renderInitialStateSection();
        this._renderStepsAndUtility();
    }
```

```js
    renderPolicyModePanel() {
        this.createSection('Parameters', () => {
            const paramsDiv = createDiv();
            paramsDiv.parent(this.contentContainer);
            paramsDiv.addClass('panel-section-content');
            this._renderGammaSlider(paramsDiv);
        });

        this.renderInitialStateSection();
        // ... (rest of the method unchanged)
```

Delete the now-unused `_renderTProgressBar()` method entirely (search for `_renderTProgressBar(parentDiv) {` through its closing brace).

- [ ] **Step 7: Verify in browser**

1. Load the app in Build mode: confirm the bottom-center scrubber is NOT visible yet (no trace exists).
2. Set s₀, click Play or Step: confirm the scrubber appears with state/action-labeled ticks and the current position highlighted, and the right panel's Parameters section no longer shows a "t" bar.
3. Drag the scrubber to an earlier tick: confirm the canvas instantly reflects that position (nodes/edges visible up to that point, no replay animation), and the right panel's Utility G / contribution bar update to match (cross-check the displayed total against the real sum of rewards up to that tick).
4. Click the stepper arrows: confirm one-tick-at-a-time movement, including stopping on action ticks.
5. Click Play/Step again from a scrubbed-to position: confirm it resumes correctly from there (not from the trace's actual end).
6. Adjust the horizon (`+`/`-`), click Reset then Play again: confirm the newly generated trace's length reflects the new steps cap.
7. Switch to Policy mode: confirm identical behavior.
8. Switch to Values mode and back to Build: confirm the scrubber correctly hides in Values and reappears (still showing the same trace) back in Build.
9. No console errors, both themes.

- [ ] **Step 8: Commit**

```bash
git add src/main/app/main.js src/main/use_case/simulation/simulationPresenter.js src/main/adapter/controller/CanvasController.js src/main/view/mainView.js src/main/view/rightPanel.js
git commit -m "Wire TraceScrubber into Build/Policy simulation, remove old t progress bar"
```

---

### Task 4: Wire `TraceScrubber` into Monte Carlo, remove `ExpectationScrubber`

**Files:**
- Modify: `src/main/view/expectationView.js`
- Modify: `src/main/view/rightPanel.js`
- Delete: `src/main/view/expectationScrubber.js`
- Modify: `index.html` (remove the deleted file's script tag)
- Modify: `style.css` (remove the old `.scrubber2-*`/`.expectation-scrubber2` rules)

**Interfaces:**
- Consumes: `TraceScrubber` (Task 1).
- Produces: nothing new for later tasks (last wiring task before final regression).

- [ ] **Step 1: Read the current integration points**

Read `src/main/view/expectationView.js` in full, paying particular attention to: `setupScrubber()`, `updateScrubberMax()`, `_syncScrubber()`, `_advance()`/wherever `currentT` changes, `enterFocusMode()`/`exitFocusMode()` (wherever `focusedRunIndex` is set/cleared — search for `setRolloutForRewardDots`), `resize()`, and the constructor's `_removeScrubber()`/destroy path. Also read `RightPanel._renderExpectationMaxStepsBar()` (already quoted in this plan's earlier reading) and its one call site inside `renderExpectationPanel()`.

- [ ] **Step 2: Build a tick-label helper for Monte Carlo**

In `expectationView.js`, add a private method (place it near `_syncScrubber`):

```js
    // Grid view (no single focused run) has no one canonical path to label ticks with, so it
    // falls back to plain numeric labels ("0","1","2"...) - matching today's existing behavior.
    // Focus view (one pinned/hovered run) labels ticks with that rollout's real state/action
    // names, mirroring Build/Policy's trace-based ticks exactly.
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

        // focusedRollout.trace is produced by TraceGenerator.generate() (confirmed by reading
        // runExpectationInteractor.js:35: `const trace = this.traceGenerator.generate(...)`) - the
        // exact same {id, type, name, meta} shape SimulationState.visited uses for Build/Policy,
        // and rollouts.push({ trace, rewards, utilities, numSteps }) confirms `.trace` is the
        // field name. No shape mismatch - this mapping is correct as written.
        return focusedRollout.trace.map(entry => entry.name);
    }
```

- [ ] **Step 3: Replace `ExpectationScrubber` with `TraceScrubber` in `expectationView.js`**

Replace the `setupScrubber()` method's body (constructing `new ExpectationScrubber(...)`) with:

```js
    setupScrubber(canvasW, canvasH, topOffset) {
        this._removeScrubber();
        this._topOffset = topOffset;

        this._scrubber = mainView.traceScrubber;
        this._scrubberCallbacks = {
            onScrub: (index, isFinal) => {
                this.stopPlay();
                this.expectationState.currentT = index;
                if (typeof redraw === 'function') redraw();
                this._notifyDataChanged();
            },
            onMaxStepsChange: (value) => {
                this.expectationState.maxSteps = value;
            }
        };
        this._scrubber.callbacks = this._scrubberCallbacks;
        this._scrubber.resize(0, 0, canvasW);
        this._scrubber.show();
        this._scrubber.setTicks(this._buildScrubberTicks());
        this._scrubber.setPosition(this.expectationState.currentT);
        this._scrubber.setMaxSteps(this.expectationState.maxSteps);
    }
```

Note this REUSES the single shared `mainView.traceScrubber` instance (constructed once in `main.js`, Task 3) rather than constructing a private one — the whole point of the shared component. `_removeScrubber()` should now just hide it and clear the local reference, not destroy the shared instance:

```js
    _removeScrubber() {
        if (this._scrubber) {
            this._scrubber.hide();
        }
        this._scrubber = null;
        this._scrubberCallbacks = null;
    }
```

Update `_syncScrubber()`:

```js
    _syncScrubber() {
        if (this._scrubber) {
            this._scrubber.setPosition(this.expectationState.currentT);
        }
    }
```

Update `updateScrubberMax()`:

```js
    updateScrubberMax() {
        if (!this._scrubber) return;
        this._scrubber.setTicks(this._buildScrubberTicks());
        this._scrubber.setPosition(0);
    }
```

Find wherever `enterFocusMode()`/`exitFocusMode()` (or equivalent) currently call `this._scrubber.setRolloutForRewardDots(...)` (there are three call sites per this plan's earlier research: lines ~396, ~456, ~467 as of this plan's writing — confirm current line numbers by reading the file) and replace each with a call to rebuild ticks instead, since focusing/unfocusing a run changes which trace the ticks should reflect:

```js
        if (this._scrubber) this._scrubber.setTicks(this._buildScrubberTicks());
```

Find `resize()`'s existing `this._scrubber.resize(0, y, canvasW);` call and confirm it still makes sense with the new shared-instance model (it should — `resize()`'s signature on `TraceScrubber` is unchanged from `ExpectationScrubber`'s).

Remove the top-of-file `const EXPECTATION_SCRUBBER_H = ExpectationScrubber.HEIGHT_PX;` line (that static field doesn't exist on `TraceScrubber`, and the new component doesn't need a canvas-height offset since it's a small floating pill, not a full-width dock strip) — check every place `EXPECTATION_SCRUBBER_H` was used (the `y` calculation in `setupScrubber()`/`resize()`) and simplify those since the new scrubber positions itself via CSS (`bottom: 16px`), not a JS-computed y-offset — `mount`/`resize`'s `y` parameter can just be passed as `0` throughout (unused by `TraceScrubber` today, kept only for signature parity with the old component's convention).

- [ ] **Step 4: Remove Monte Carlo's old Max Steps slider**

In `src/main/view/rightPanel.js`, find `renderExpectationPanel()` and remove its call to `_renderExpectationMaxStepsBar(...)` (leave the gamma slider call and everything else in that method untouched). Delete the `_renderExpectationMaxStepsBar()` method entirely.

- [ ] **Step 5: Delete `expectationScrubber.js` and its references**

Delete `src/main/view/expectationScrubber.js`.

In `index.html`, remove the line `<script src="src/main/view/expectationScrubber.js"></script>` (the `traceScrubber.js` tag added in Task 1 stays).

In `style.css`, remove the entire `/* ── Expectation mode ─...` block added lines 1544–1655 (the `.expectation-scrubber2`/`.scrubber2-*` rules) — confirm via `grep -n "scrubber2\|expectation-scrubber2" style.css` that nothing references these classes anywhere else in the codebase before deleting (there shouldn't be, since Step 3 removed the only consumer).

- [ ] **Step 6: Verify in browser**

1. Go to Values → Monte Carlo, run a batch of rollouts (any display-runs count): confirm the SAME bottom-center scrubber from Build/Policy now appears here too, showing plain numeric ticks (grid view, no run focused).
2. Focus/pin a single run: confirm the ticks switch to that rollout's real state/action labels, matching the labeled style Build/Policy uses.
3. Drag the scrubber / use stepper arrows: confirm all mini-panels (grid view) or the focused run's detail view update correctly, matching today's existing scrubbing behavior functionally (just via the new component).
4. Adjust the horizon control: confirm it updates `expectationState.maxSteps`, and confirm the right panel's Parameters section no longer shows the old separate Max Steps slider.
5. Un-focus the run (back to grid view): confirm ticks revert to plain numeric labels.
6. Confirm no reward-dot markers appear anywhere (removed).
7. Switch to Values → VI: confirm the shared scrubber is hidden there and VI's own T input/sweep chip are completely unaffected.
8. No console errors, both themes.

- [ ] **Step 7: Commit**

```bash
git add src/main/view/expectationView.js src/main/view/rightPanel.js index.html style.css
git rm src/main/view/expectationScrubber.js
git commit -m "Monte Carlo: replace ExpectationScrubber with the shared TraceScrubber, remove old Max Steps slider"
```

---

### Task 5: Final integration pass

**Files:** none new; verification-only, touching no source files unless a regression is found (fix it in the file where the bug lives, note the fix in the commit message).

**Interfaces:** none new.

- [ ] **Step 1: Full regression pass**

Build a graph exercising every touched path: a state with 2+ actions, mixed-reward-sign outcomes, and at least one cycle. Set s₀.

1. **Build mode**: Run a simulation, confirm the scrubber appears with correct ticks, drag to several positions (forward and backward), confirm instant jump with no animation replay, confirm Utility G/contribution bar stay correct at every scrubbed position. Adjust the steps horizon, Reset, Run again: confirm the new trace respects the new cap.
2. **Policy mode**: repeat the same checks — identical behavior to Build.
3. **Monte Carlo**: run a batch, confirm the scrubber appears with numeric ticks in grid view; focus a run, confirm labeled ticks; drag/step; confirm the horizon control correctly drives `expectationState.maxSteps` and a subsequent Run respects it; confirm the "Estimate vs exact" panel and chart dock (Convergence/Histogram) still read the correct `currentT` after using the new scrubber (these weren't touched directly, but verify they still work given the scrubber underneath changed).
4. **Value Iteration**: confirm completely unaffected — its own T input, sweep chip, Play/Step/Skip all work exactly as before, and the new bottom scrubber never appears there.
5. **Cross-mode transitions**: Build → Values(MC) → Build: confirm the scrubber correctly hides/reshows and still reflects the Build trace correctly (not stale Monte Carlo state). Build → Policy → Build: confirm no stale scrubber state leaks across the switch.
6. **Import/export round-trip**: confirm a `test_schema/*.json` fixture still imports/exports correctly and that neither `simulationState.maxSteps` nor any new scrubber state leaks into or is expected in the exported JSON (this is presentation/session state, not part of the MDP definition).
7. No console errors anywhere in this pass, both light and dark theme.

- [ ] **Step 2: Commit (only if Step 1 surfaced a fix)**

If the regression pass required any code fix, it should already be committed with its own descriptive message before this point. If nothing needed fixing, no commit is needed for this task.

---

## Self-Review Notes

- **Spec coverage:** design doc's "Component: TraceScrubber" section (tick model, stepper arrows, horizon control, no reward dots) → Task 1. "Tick source per consumer" (Build/Policy always labeled, MC grid-vs-focus fallback) → Tasks 3 & 4. "Horizon semantics" (transitions, `*2+1` conversion, default 25, no retroactive regen) → Tasks 2 & 3. "Instant jump" → Task 2. "What's removed" (old scrubber, old t-bar, old Max Steps slider, reward dots) → Tasks 3 & 4. "Wiring" (mode-lifecycle show/hide) → Task 3. "Non-Goals" (VI untouched) → verified explicitly in Task 5.
- **Placeholder scan:** no TBD/TODO. Task 4's rollout-shape assumption (`.trace` array of `{name}`-bearing entries) was verified against `runExpectationInteractor.js:35,43` while writing this plan — `trace = this.traceGenerator.generate(...)` (the exact same generator Build/Policy uses) and `rollouts.push({ trace, rewards, utilities, numSteps })` confirm both the shape and field name directly, no hedging language left in the task text.
- **Type/name consistency:** `TraceScrubber`'s public API (`mount`, `resize`, `destroy`, `show`, `hide`, `setTicks`, `setPosition`, `setMaxSteps`, callbacks `onScrub`/`onMaxStepsChange`) defined in Task 1 is used identically (same method names/argument order) in both Task 3 (Build/Policy) and Task 4 (Monte Carlo) — no drift. `SimulationState.jumpToIndex(targetIndex, graph)` (Task 2) is called identically from `CanvasController.jumpSimulationToIndex(index)` (Task 3) using `this.viewModel.graph` as the second argument.
