# Values → Iteration: States View Redesign + Equation Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Values → Iteration States-view cards to match a reference mockup (labeled
treeView-style nodes, header+V, timeline pill collapse for old sweeps), and add a new right-pane
Equation view (Bellman header + an animated step-by-step Q-value calculation reveal + a focused
Q-table) that replaces the live MDP graph by default, toggleable back to Graph.

**Architecture:** Presentation-only changes across the existing DOM-over-canvas view layer
(`viBackupDiagram.js`, `viStatesView.js`, two new files `viEquationView.js`/`viRightViewPill.js`),
one small ViewModel field (`rightView`), one small additive pure function
(`ChartDataBuilders.buildQTableRowForState`), and wiring in `main.js`/`mainView.js`. No domain or
use-case changes — `ValueIterationState.getBackupDetail()`/`.getValues()` remain the only source
of the underlying numbers.

**Tech Stack:** Vanilla JS, p5.js, Canvas2D (`ctx.fillText`/`ctx.arc`), KaTeX (via a newly-promoted
shared helper), plain DOM (no framework). No build step, no automated test suite — verification is
manual/real-browser via vendored `playwright-core` against a local `http.server`.

## Global Constraints

- No change to `ValueIterationState`'s computation (`computeNextSweep`, `getBackupDetail`,
  `getValues`) anywhere in this plan — presentation-only, per every prior phase's convention.
- No change to Learning Iteration (`unknown:full`) — it has no States view, no left/right pills,
  none of this applies to it.
- Every new/changed color reference goes through `AppPalette.<ns>.<key>` (canvas) or
  `var(--<ns>-<key>)` (CSS) — never a hardcoded hex at a call site (per `CLAUDE.md`'s theming
  rules). `AppPalette.node.state` = light theme `#BDBDBD` / dark theme `text.subtle`;
  `AppPalette.node.action` = light theme `#424242` / dark theme `text.muted`;
  `AppPalette.valueIteration.best` = `#2EA043` (light) / `text.primary` (dark);
  `AppPalette.valueIteration.result` = `#19507A` (light) / `text.primary` (dark).
- Every new floating pill/DOM-overlay component follows the established one-file-per-component
  shape: `constructor(...)`, `.setup(topOffset)` or `.setup()`, `.updateBounds(...)`, `.refresh()`,
  `.show()`, `.hide()` — matching `viLeftViewPill.js`/`viChartView.js`/`viStatesView.js` exactly.
- `index.html` script load order matters (plain `<script>` tags, no module system): new files load
  in the existing per-layer blocks, in dependency order, per `CLAUDE.md`'s "Adding a New Use Case"
  section's stated convention.
- Verify every task via real browser testing (`playwright-core`, local `http.server` from the
  worktree root) — no automated test suite exists in this project.

---

### Task 1: Promote `renderKatex`/`latexEscapeText` to a shared `KatexRenderer` helper

**Files:**
- Create: `src/main/view/helpers/KatexRenderer.js`
- Modify: `src/main/view/rightPanel.js:12-25` (keep the two function names as thin delegating
  wrappers — safer than renaming every call site in a large file, equally DRY since the real
  logic now lives in one place)
- Modify: `src/main/use_case/valueIteration/viPresenter.js:1-11` (same delegation approach)
- Modify: `index.html` (one new script tag)

**Interfaces:**
- Produces: `KatexRenderer.render(latex, display = false)` → HTML string. `KatexRenderer.escapeText(value)`
  → escaped string safe inside a LaTeX `\text{}` block. Both pure, no state.

- [ ] **Step 1: Create the shared helper**

```js
// src/main/view/helpers/KatexRenderer.js
// Shared KaTeX-to-HTML rendering helper - a thin wrapper around katex.renderToString(), safe to
// call from any file that needs to inject real LaTeX-rendered HTML into a DOM element (NOT a
// canvas - see MathRenderer.js for the canvas-based renderer, which has a different, canvas-
// context-specific set of constraints that ruled it out for viBackupDiagram.js/viEquationView.js).
// Promoted out of rightPanel.js so viEquationView.js can reuse the exact same rendering without
// duplicating it.
const KatexRenderer = {
    // Render a LaTeX string directly to an HTML string via KaTeX.
    // display=true for block (display) math, false for inline.
    render(latex, display = false) {
        if (typeof katex === 'undefined') return `<span>${latex}</span>`;
        return katex.renderToString(latex, { throwOnError: false, displayMode: display });
    },

    // Escape user-controlled names for use inside LaTeX \text{} blocks.
    escapeText(value) {
        return String(value)
            .replace(/\\/g, '\\textbackslash{}')
            .replace(/[{}]/g, match => `\\${match}`)
            .replace(/_/g, '\\_')
            .replace(/%/g, '\\%')
            .replace(/&/g, '\\&')
            .replace(/#/g, '\\#')
            .replace(/\$/g, '\\$');
    }
};
```

- [ ] **Step 2: Delegate `rightPanel.js`'s local functions to it**

Read the current `src/main/view/rightPanel.js:10-25`:
```js
// Right panel displaying MDP information and node editing

// Render a LaTeX string directly to HTML via KaTeX.
// display=true for block (display) math, false for inline.
function renderKatex(latex, display = false) {
    if (typeof katex === 'undefined') return `<span>${latex}</span>`;
    return katex.renderToString(latex, { throwOnError: false, displayMode: display });
}

function latexEscapeText(value) {
    return String(value)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[{}]/g, match => `\\${match}`)
        .replace(/_/g, '\\_')
        .replace(/%/g, '\\%')
        .replace(/&/g, '\\&')
        .replace(/#/g, '\\#')
        .replace(/\$/g, '\\$');
}
```

Replace with:
```js
// Right panel displaying MDP information and node editing

// Thin delegates to the shared KatexRenderer helper (src/main/view/helpers/KatexRenderer.js) -
// kept as same-named local functions so every existing call site in this file is untouched.
function renderKatex(latex, display = false) {
    return KatexRenderer.render(latex, display);
}

function latexEscapeText(value) {
    return KatexRenderer.escapeText(value);
}
```

- [ ] **Step 3: Delegate `viPresenter.js`'s local function to it**

Read the current `src/main/use_case/valueIteration/viPresenter.js:1-11`:
```js
// Escape user-controlled names for use inside LaTeX \text{} blocks
function latexEscapeText(value) {
    return String(value)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[{}]/g, match => `\\${match}`)
        .replace(/_/g, '\\_')
        .replace(/%/g, '\\%')
        .replace(/&/g, '\\&')
        .replace(/#/g, '\\#')
        .replace(/\$/g, '\\$');
}
```

Replace with:
```js
// Escape user-controlled names for use inside LaTeX \text{} blocks - delegates to the shared
// KatexRenderer helper (src/main/view/helpers/KatexRenderer.js).
function latexEscapeText(value) {
    return KatexRenderer.escapeText(value);
}
```

- [ ] **Step 4: Add the script tag**

In `index.html`, in the "View Layer - Helpers" block, immediately after the existing
`MathRenderer.js` tag (currently line 263):
```html
    <script src="src/main/view/helpers/MathRenderer.js"></script>
    <script src="src/main/view/helpers/KatexRenderer.js"></script>
```

- [ ] **Step 5: Verify**

```bash
node --check src/main/view/helpers/KatexRenderer.js
node --check src/main/view/rightPanel.js
node --check src/main/use_case/valueIteration/viPresenter.js
```

Start `python3 -m http.server 8010` from the worktree root (reuse if already running), load the
app via `playwright-core`, build any small MDP, run Value Iteration, open the right panel's
"ACTION VALUES" section, and click a Q-table cell to trigger the existing explanation overlay —
confirm its LaTeX equation still renders correctly (unchanged output, since this task only moved
*where* the rendering logic lives, not what it produces) and zero console errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/view/helpers/KatexRenderer.js src/main/view/rightPanel.js \
        src/main/use_case/valueIteration/viPresenter.js index.html
git commit -m "Promote renderKatex/latexEscapeText to a shared KatexRenderer helper"
```

---

### Task 2: Rewrite `ViBackupDiagram` — treeView-style node labels + staged reveal

**Files:**
- Modify: `src/main/view/helpers/viBackupDiagram.js` (full rewrite)

**Interfaces:**
- Consumes: `ValueIterationState.getBackupDetail(sweepIndex, stateId)`'s existing shape
  (`{ actions: [{ actionId, actionName, qValue, transitions: [{ nextState, nextStateName,
  probability, reward, nextValue, term }] }], bestActionId, value }`); `ColorUtils.contrastText(fill)`.
- Produces: `ViBackupDiagram.draw(canvas, detail, priorValues, colors, stateName)` (static, full
  render) and `ViBackupDiagram.drawAnimated(canvas, detail, priorValues, colors, stateName)`
  (staged reveal, returns a `cancel()` function) — **both gain a new 5th `stateName` parameter**
  (the old version drew no state name at all — the exact bug being fixed). `colors` gains a new
  `state` key (`{ state, action, best, result }`, was `{ action, best, result }`).

- [ ] **Step 1: Replace the file**

```js
// src/main/view/helpers/viBackupDiagram.js
// Static Canvas2D renderer for a single state's backup diagram - state on the left, its actions
// in a middle column (Q-value label, best action highlighted/starred), each action's outcome
// next-states in a right column (one row per (action, transition) pair, NOT deduplicated by
// next-state). Node styling mirrors treeView.js's own _drawNode() convention exactly (circles,
// in-circle contrast-colored name labels, AppPalette.node.state/.node.action fill) - the 2026-07-17
// States view redesign's whole point was fixing the original version's total lack of node labels.
//
// Deliberately NOT mathRenderer-based (its failure-fallback path calls p5 GLOBAL functions that
// always draw to the MAIN canvas regardless of which ctx is passed - a real mismatch for a
// per-card canvas). Labels are plain ctx.fillText() instead. Deliberately NOT TreeLayout.js-based -
// that solves a harder, general recursive-unrolling problem; this is exactly one level deep with a
// small bounded fan-out, so a fixed three-column layout is simpler and sufficient.
const VBD_PADDING = 10;
const VBD_STATE_RADIUS = 16;
const VBD_ACTION_RADIUS = 11;
const VBD_REVEAL_ACTION_MS = 220;     // delay before each action's node+Q appears
const VBD_REVEAL_TRANSITION_MS = 140; // delay before each of that action's outcome nodes appears
const VBD_REVEAL_BEST_MS = 260;       // delay before the final best-action highlight pass

const ViBackupDiagram = {
    // canvas: an HTMLCanvasElement, already sized (see viStatesView.js's _buildDiagramCard()).
    // detail: ValueIterationState.getBackupDetail()'s exact return shape.
    // priorValues: { [stateId]: number } - the PRIOR sweep's V for every state (sweep 0's own init
    // values if this is sweep 0), used for the outcome labels.
    // colors: { state, action, best, result } - hex color strings. `state` fills both the state
    // node and every outcome node (outcomes ARE states); `action` fills non-best action nodes;
    // `best` highlights the best action's node/Q-label.
    // stateName: the state's display name (e.g. "S0") - drawn inside the state circle.
    draw(canvas, detail, priorValues, colors, stateName) {
        this._render(canvas, detail, priorValues, colors, stateName, Infinity);
    },

    // Same rendering, staged: reveals each action (with its own transitions) in order, then a
    // final best-action highlight pass, each stage separated by a short delay via setTimeout.
    // Returns a cancel() function - callers MUST invoke it before re-triggering an animation on
    // the same canvas (e.g. viStatesView.js's rebuildAll()), so an orphaned timer never draws onto
    // a canvas element that's already mid-replacement.
    drawAnimated(canvas, detail, priorValues, colors, stateName) {
        const events = this._buildRevealEvents(detail);
        let cancelled = false;
        const timers = [];

        const runStage = (stageIndex) => {
            if (cancelled) return;
            this._render(canvas, detail, priorValues, colors, stateName, stageIndex);
            if (stageIndex >= events.length) return;
            const evt = events[stageIndex];
            const delay = evt === 'best' ? VBD_REVEAL_BEST_MS
                : evt.type === 'action' ? VBD_REVEAL_ACTION_MS
                : VBD_REVEAL_TRANSITION_MS;
            timers.push(setTimeout(() => runStage(stageIndex + 1), delay));
        };
        runStage(0);

        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
        };
    },

    // Ordered reveal events: one 'action' event then N 'transition' events per action (in
    // detail.actions' own order), followed by a final 'best' marker for the highlight pass.
    _buildRevealEvents(detail) {
        const events = [];
        if (detail && detail.actions) {
            detail.actions.forEach(action => {
                events.push({ type: 'action', actionId: action.actionId });
                action.transitions.forEach(t => {
                    events.push({ type: 'transition', actionId: action.actionId, transition: t });
                });
            });
        }
        events.push('best');
        return events;
    },

    // revealCount: Infinity for the static draw() path; otherwise the number of _buildRevealEvents
    // entries revealed so far (0 = state only, events.length = everything incl. best-highlight).
    _render(canvas, detail, priorValues, colors, stateName, revealCount) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        if (!detail || !detail.actions || detail.actions.length === 0) {
            this._drawEmpty(ctx, w, h, colors);
            return;
        }

        const events = this._buildRevealEvents(detail);
        const bestRevealed = revealCount >= events.length;

        const stateX = VBD_PADDING + VBD_STATE_RADIUS;
        const stateY = h / 2;
        const actionX = w * 0.40;
        const transX = w * 0.68;

        const rows = [];
        detail.actions.forEach(action => action.transitions.forEach(t => rows.push({ action, transition: t })));
        const rowCount = Math.max(rows.length, 1);
        const rowH = (h - 2 * VBD_PADDING) / rowCount;

        let rowCursor = 0;
        const actionPositions = new Map();
        detail.actions.forEach(action => {
            const span = Math.max(action.transitions.length, 1);
            actionPositions.set(action.actionId, VBD_PADDING + (rowCursor + span / 2) * rowH);
            rowCursor += span;
        });

        // Walk events in the SAME order _buildRevealEvents() produced them, so `eventIdx`
        // matches exactly what drawAnimated()'s stage counter is counting.
        let eventIdx = 0;
        let rowIdx = 0;
        detail.actions.forEach(action => {
            const actionRevealed = eventIdx < revealCount;
            eventIdx += 1;
            const ay = actionPositions.get(action.actionId);
            const isBest = bestRevealed && action.actionId === detail.bestActionId;
            const fill = isBest ? colors.best : colors.action;

            if (actionRevealed) {
                ctx.strokeStyle = colors.action;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(stateX, stateY);
                ctx.lineTo(actionX, ay);
                ctx.stroke();

                this._circle(ctx, actionX, ay, VBD_ACTION_RADIUS, fill);
                this._label(ctx, actionX, ay, action.actionName, fill);

                ctx.fillStyle = isBest ? colors.best : colors.result;
                ctx.font = isBest ? 'bold 10px monospace' : '10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(`Q = ${action.qValue.toFixed(2)}${isBest ? ' ★' : ''}`,
                    actionX, ay - VBD_ACTION_RADIUS - 6);
            }

            action.transitions.forEach(t => {
                const transitionRevealed = eventIdx < revealCount;
                eventIdx += 1;
                const ty = VBD_PADDING + (rowIdx + 0.5) * rowH;
                rowIdx += 1;
                if (!transitionRevealed) return;

                ctx.strokeStyle = colors.action;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(actionX, ay);
                ctx.lineTo(transX, ty);
                ctx.stroke();

                ctx.save();
                ctx.setLineDash([4, 3]);
                this._circle(ctx, transX, ty, VBD_ACTION_RADIUS, colors.state, true);
                ctx.restore();
                this._label(ctx, transX, ty, t.nextStateName, colors.state);

                ctx.fillStyle = colors.result;
                ctx.font = '10px monospace';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const priorV = priorValues[t.nextState] ?? 0;
                ctx.fillText(`V ${priorV.toFixed(2)}`, transX + VBD_ACTION_RADIUS + 6, ty);
            });
        });

        // State node drawn last so it's never occluded by a line's stroke join (cosmetic only) -
        // always revealed, since stage 0 (before any action) already shows just the state.
        this._circle(ctx, stateX, stateY, VBD_STATE_RADIUS, colors.state);
        this._label(ctx, stateX, stateY, stateName, colors.state);

        if (rows.length > 0) {
            ctx.fillStyle = colors.result;
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.globalAlpha = 0.6;
            ctx.fillText('t = k−1', transX, h - 6);
            ctx.globalAlpha = 1;
        }
    },

    _circle(ctx, x, y, r, fill, dashed = false) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        if (dashed) {
            ctx.strokeStyle = ColorUtils.contrastText(fill);
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    },

    _label(ctx, x, y, name, fill) {
        ctx.fillStyle = ColorUtils.contrastText(fill);
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x, y);
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

- [ ] **Step 2: Verify**

```bash
node --check src/main/view/helpers/viBackupDiagram.js
```

`viStatesView.js`'s current call site (`ViBackupDiagram.draw(canvas, detail, priorValues, colors)`
in `_buildDiagramCard()`) will not compile against the NEW signature's meaning until Task 3 updates
it — that's expected and fixed in Task 3, not this task. This task's own verification is limited to
the syntax check above; do not attempt to browser-test this file in isolation.

- [ ] **Step 3: Commit**

```bash
git add src/main/view/helpers/viBackupDiagram.js
git commit -m "Rewrite ViBackupDiagram: treeView-style labeled nodes + staged reveal"
```

---

### Task 3: Rewrite `ViStatesView` — card header, timeline pills, active-state selection

**Files:**
- Modify: `src/main/view/viStatesView.js` (substantial rewrite)
- Modify: `style.css` (card header, dashed section, collapsed-pill, bigger canvas)

**Interfaces:**
- Consumes: `ValueIterationViewModel.activeStateId` (existing, previously-unused field),
  `.pinnedSweepIndex`/`.hoveredSweepIndex` (existing), `ViBackupDiagram.draw`/`.drawAnimated` (new
  5-arg signature from Task 2).
- Produces: clicking a state's card sets `activeStateId` + pins its sweep; clicking a
  non-current section's header toggles it collapsed/expanded.

- [ ] **Step 1: Replace `_buildSection`/`_buildCard`/`_buildDiagramCard` and add expansion state**

Read the current file in full first (`src/main/view/viStatesView.js`) to get exact context, then
apply these changes:

In the constructor, add two new fields after `this._renderedSweepCount = 0;`:
```js
        this._renderedSweepCount = 0;
        // Sweeps the user has explicitly clicked open (independent of which sweep is "live") -
        // the live sweep always shows expanded regardless of this set's contents; this set is
        // purely for re-opening older, otherwise-collapsed sweeps. Never cleared on refresh() -
        // only rebuildAll() (a full teardown) resets it, matching a theme toggle's own "start
        // clean" semantics.
        this._manuallyExpanded = new Set();
        // Sweep indices whose diagram cards have already played their staged reveal once - a
        // section that re-expands via its pill (already computed, already seen) renders instantly
        // via draw(), not drawAnimated(), so re-opening history doesn't replay the animation every
        // time.
        this._animatedSweeps = new Set();
        // Per-canvas cancel() handles from any in-flight drawAnimated() calls, so rebuildAll()
        // (theme toggle) can stop them before tearing down their canvases.
        this._revealCancels = [];
```

Replace `_buildSection(sweepIndex)` with:
```js
    _buildSection(sweepIndex) {
        const section = document.createElement('div');
        section.className = 'vi-states-view-section';
        section.dataset.sweepIndex = String(sweepIndex);

        const header = document.createElement('div');
        header.className = 'vi-states-view-section-header';
        header.textContent = `t = ${sweepIndex}`;
        section.appendChild(header);
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            // Only past (non-live) sections are collapsible - the live sweep always stays
            // expanded, matching "only the current sweep stays large" (see _applyExpansion()).
            if (sweepIndex === this.viState.currentSweepIndex) return;
            if (this._manuallyExpanded.has(sweepIndex)) {
                this._manuallyExpanded.delete(sweepIndex);
            } else {
                this._manuallyExpanded.add(sweepIndex);
            }
            this._applyExpansion();
        });

        const cards = document.createElement('div');
        cards.className = 'vi-states-view-cards';
        this.viState.stateIds.forEach(stateId => {
            cards.appendChild(this._buildCard(sweepIndex, stateId));
        });
        section.appendChild(cards);

        // Hover/leave still preview the sweep on the shared right pane (Phase 3b's own
        // convention), scoped to the header row only - individual card clicks (state selection)
        // are a separate, more specific interaction (see _buildDiagramCard()/_buildFlatCard()).
        header.addEventListener('mouseenter', () => {
            this.viViewModel.hoveredSweepIndex = sweepIndex;
            this._applyHighlight();
            if (typeof redraw === 'function') redraw();
        });
        header.addEventListener('mouseleave', () => {
            this.viViewModel.hoveredSweepIndex = null;
            this._applyHighlight();
            if (typeof redraw === 'function') redraw();
        });

        return section;
    }
```

(Note: the previous version's section-wide click-to-pin is now scoped to the header row for
collapse/expand instead. Pinning now happens via a card's own click - see the diagram/flat card
changes below - which also pins that card's sweep, preserving the "click pins a sweep" outcome
just moved to a more specific click target.)

Replace `_buildCard(sweepIndex, stateId)` (the quadrant dispatch) with:
```js
    // known:full (real Value Iteration) gets a rich per-state backup diagram; the other 3
    // quadrants (Belief Iteration, PO Q-Learning, Learning Iteration) keep the flat state:value
    // card - decided once per card, not per-frame, and Learning Iteration never reaches this
    // method at all (the whole States view is hidden for it).
    _buildCard(sweepIndex, stateId) {
        const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
        const card = quadrant === 'known:full'
            ? this._buildDiagramCard(sweepIndex, stateId)
            : this._buildFlatCard(sweepIndex, stateId);
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            const alreadyActive = this.viViewModel.activeStateId === stateId
                && this.viViewModel.pinnedSweepIndex === sweepIndex;
            this.viViewModel.activeStateId = alreadyActive ? null : stateId;
            this.viViewModel.pinnedSweepIndex = sweepIndex;
            this._applyHighlight();
            if (this.onActiveStateChanged) this.onActiveStateChanged();
            if (typeof redraw === 'function') redraw();
        });
        return card;
    }
```

Replace `_buildFlatCard(sweepIndex, stateId)`'s header comment reference only where it referenced
the old click target (no functional change needed here - the click listener now lives in
`_buildCard()` above, wrapping whatever this returns) - the method body itself is unchanged.

Replace `_buildDiagramCard(sweepIndex, stateId)` with:
```js
    _buildDiagramCard(sweepIndex, stateId) {
        const card = document.createElement('div');
        card.className = 'vi-states-view-card vi-states-view-card--diagram';

        const stateName = this.viState.stateNames[stateId] || `S${stateId}`;
        const header = document.createElement('div');
        header.className = 'vi-states-view-card-header';
        const nameEl = document.createElement('span');
        nameEl.textContent = stateName;
        const valueEl = document.createElement('span');
        header.appendChild(nameEl);
        header.appendChild(valueEl);
        card.appendChild(header);

        const canvas = document.createElement('canvas');
        // Fixed logical size (CSS controls display size via the card's own layout; the canvas's
        // pixel buffer is set to match at 1x - devicePixelRatio scaling is a nice-to-have not
        // needed for this diagram). Bigger than the original 220x96 - the redesign gives each
        // node room for an in-circle name label plus its own value/reward label.
        canvas.width = 260;
        canvas.height = 140;
        card.appendChild(canvas);

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        valueEl.textContent = `V = ${(detail ? detail.value : 0).toFixed(2)}`;

        const priorValues = sweepIndex > 0
            ? this.viState.getValues(sweepIndex - 1)
            : this.viState.getValues(0);
        const colors = {
            state: AppPalette.node.state,
            action: AppPalette.node.action,
            best: AppPalette.valueIteration.best,
            result: AppPalette.valueIteration.result
        };

        // Animate only the first time this sweep's cards are ever built (a freshly-expanded live
        // sweep); an already-seen sweep re-expanded via its pill renders instantly.
        if (!this._animatedSweeps.has(sweepIndex)) {
            const cancel = ViBackupDiagram.drawAnimated(canvas, detail, priorValues, colors, stateName);
            this._revealCancels.push(cancel);
        } else {
            ViBackupDiagram.draw(canvas, detail, priorValues, colors, stateName);
        }

        return card;
    }
```

In `refresh()`, immediately after the existing `this._renderedSweepCount = totalSweeps;` line, add:
```js
        this._renderedSweepCount = totalSweeps;
        // Every sweep strictly before the live one has now had its cards built at least once (the
        // loop above only builds NEW sections, so any sweep reached here already went through
        // _buildDiagramCard() previously) - mark them as "already animated" so a later pill
        // re-expand renders instantly rather than replaying the stage-in.
        for (let k = 0; k < totalSweeps - 1; k++) this._animatedSweeps.add(k);
```

Add a new `_applyExpansion()` method, called from `refresh()` right after the existing
`this._applyHighlight();` line (add a call `this._applyExpansion();` there too):
```js
    // Toggles the collapsed/expanded CSS class per section: the live sweep is always expanded;
    // everything else follows _manuallyExpanded's membership. Independent of _applyHighlight()'s
    // own hover/pin class - a section can be expanded without being the hovered/pinned one.
    _applyExpansion() {
        if (!this._sectionsEl) return;
        const liveSweep = this.viState.currentSweepIndex;
        Array.from(this._sectionsEl.children).forEach(section => {
            const idx = Number(section.dataset.sweepIndex);
            const expanded = idx === liveSweep || this._manuallyExpanded.has(idx);
            section.classList.toggle('vi-states-view-section--collapsed', !expanded);
        });
    }
```

Update `rebuildAll()` to cancel in-flight reveals and reset the two new tracking sets before
rebuilding (replace the existing body):
```js
    rebuildAll() {
        if (!this.containerEl) return;
        this._revealCancels.forEach(cancel => cancel());
        this._revealCancels = [];
        this._animatedSweeps.clear();
        const scrollTop = this._sectionsEl.scrollTop;
        this._sectionsEl.innerHTML = '';
        this._renderedSweepCount = 0;
        this.refresh();
        this._sectionsEl.scrollTop = scrollTop;
    }
```

- [ ] **Step 2: CSS — dashed section wrapper, collapsed pill, card header**

In `style.css`, replace the existing `.vi-states-view-section` rule block (currently plain
`border: 1px solid ...`) with:
```css
.vi-states-view-section {
  border: 2px dashed var(--accent-teal);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.vi-states-view-section:last-child {
  margin-bottom: 0;
}

.vi-states-view-section--active {
  background: color-mix(in srgb, var(--accent-teal) 10%, transparent);
}

.vi-states-view-section-header {
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-teal);
  margin-bottom: 8px;
}

.vi-states-view-section--collapsed {
  padding-bottom: 0;
}

.vi-states-view-section--collapsed .vi-states-view-section-header {
  margin-bottom: 0;
  cursor: pointer;
}

.vi-states-view-section--collapsed .vi-states-view-cards {
  display: none;
}
```

(This removes the old `cursor: pointer`/border-color-based `--active` styling from the section
itself — pinning highlight now applies to the header, not the whole section box — and the old
`border: 1px solid var(--border-hairline...)` is replaced by the dashed teal border the redesign
calls for.)

Add a `.vi-states-view-section-header:hover` rule right after the block above:
```css
.vi-states-view-section--collapsed .vi-states-view-section-header:hover {
  color: var(--text-dark);
}
```

Replace the existing `.vi-states-view-card--diagram` and its `canvas` child rule with:
```css
.vi-states-view-card--diagram {
  display: flex;
  flex-direction: column;
  padding: 8px;
  cursor: pointer;
}

.vi-states-view-card--diagram canvas {
  display: block;
  width: 260px;
  height: 140px;
}

.vi-states-view-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dark);
  border-bottom: 1px solid var(--border-hairline, var(--border-light));
  padding-bottom: 4px;
  margin-bottom: 4px;
}

.vi-states-view-card-header span:last-child {
  color: var(--accent-teal);
  font-weight: 700;
}
```

Add `cursor: pointer` to the existing `.vi-states-view-card` rule (the flat card) too, so both
card kinds show the same affordance:
```css
.vi-states-view-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--surface-btn);
  font-family: var(--font-family-mono, var(--font-family));
  font-size: 11px;
  cursor: pointer;
}
```

- [ ] **Step 3: Verify**

```bash
node --check src/main/view/viStatesView.js
```

Real browser test (`playwright-core`, worktree root, reuse `http.server 8010` if running): build a
3-state MDP (per the pattern used in this session's prior task verifications — a state with 2
actions, one probabilistic), enter Values → Iteration with P known/full observability, run 4+
sweeps. Confirm:
- Only the live sweep's section is expanded (`.vi-states-view-section--collapsed` absent on the
  live one, present on all others).
- Clicking an older section's header expands it (`--collapsed` removed) without collapsing the
  live section; clicking it again re-collapses it.
- Clicking a state's card sets `valueIterationViewModel.activeStateId` to that state's id and
  `pinnedSweepIndex` to that card's sweep; clicking the same card again clears `activeStateId`
  back to `null` (leaving `pinnedSweepIndex` unchanged).
- A freshly-expanded (new) sweep's diagram cards visibly stage in over ~1s (screenshot at t=0ms
  and t=500ms after the sweep completes, confirm partial vs. full rendering); re-expanding an
  older, already-seen pill renders its cards instantly (no staging).
- `.vi-states-view-card-header` shows the state name + `V = X.XX`, no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/view/viStatesView.js style.css
git commit -m "Redesign States view: card header+V, dashed timeline pills, active-state click"
```

---

### Task 4: `ChartDataBuilders.buildQTableRowForState`

**Files:**
- Modify: `src/main/view/helpers/chartDataBuilders.js`

**Interfaces:**
- Produces: `ChartDataBuilders.buildQTableRowForState(valueIterationState, stateId, sweepIndex)` →
  `{ rows: [{ actionId, actionName, qValue, isBest }] }` — same per-action row shape
  `buildQTableData()` already produces, filtered to one state, at an explicit sweep index (unlike
  `buildQTableData()`, which is hardcoded to the latest sweep via `totalSweeps - 1`).

- [ ] **Step 1: Add the function**

Immediately after the existing `buildQTableData(valueIterationState) { ... },` method in
`src/main/view/helpers/chartDataBuilders.js`, add:
```js
    // Same per-action row shape buildQTableData() produces, but for exactly one state at an
    // explicit sweep index - powers viEquationView.js's focused Q-table, which needs a specific
    // (possibly non-live, hovered/pinned) sweep rather than always the latest one.
    buildQTableRowForState(valueIterationState, stateId, sweepIndex) {
        if (!valueIterationState || !valueIterationState.initialized) return { rows: [] };
        const actionQs = valueIterationState.getQValues(sweepIndex, stateId);
        const bestActionId = valueIterationState.getBestAction(sweepIndex, stateId);
        const rows = actionQs.map(aq => ({
            actionId: aq.actionId,
            actionName: aq.actionName,
            qValue: valueIterationState.getEffectiveQValue(stateId, aq.actionId, aq.qValue),
            isBest: aq.actionId === bestActionId
        }));
        return { rows };
    },
```

- [ ] **Step 2: Verify**

```bash
node --check src/main/view/helpers/chartDataBuilders.js
```

Browser console check: after running a couple of VI sweeps, `ChartDataBuilders.buildQTableRowForState(valueIterationState, <a real stateId>, 1)` returns a non-empty `rows` array whose shape
matches `buildQTableData(valueIterationState).rows[0].actions` (same keys per row).

- [ ] **Step 3: Commit**

```bash
git add src/main/view/helpers/chartDataBuilders.js
git commit -m "Add ChartDataBuilders.buildQTableRowForState for the new Equation pane"
```

---

### Task 5: `ViEquationView` — Bellman header, animated calculation reveal, focused Q-table

**Files:**
- Create: `src/main/view/viEquationView.js`
- Modify: `style.css` (new `.vi-equation-view*` rules)
- Modify: `index.html` (one new script tag)

**Interfaces:**
- Consumes: `ValueIterationViewModel.activeStateId`/`.previewedSweepIndex` (existing),
  `ValueIterationState.getBackupDetail`/`.getValues`/`.stateNames`/`.currentSweepIndex` (existing),
  `KatexRenderer.render`/`.escapeText` (Task 1), `ValuesMethodMatrix.resolve` (existing),
  `ChartDataBuilders.buildQTableRowForState` (Task 4).
- Produces: `ViEquationView` — same component shape as `ViChartView`/`ViStatesView`
  (`constructor(canvasViewModel, valueIterationState, valueIterationViewModel)`, `.setup()`,
  `.updateBounds(x, y, width, height)`, `.refresh()`, `.show()`, `.hide()`).

- [ ] **Step 1: Create the file**

```js
// src/main/view/viEquationView.js
// New right-pane view for Values -> Iteration's 3 split quadrants (2026-07-17 redesign): replaces
// the live MDP graph BY DEFAULT (see viRightViewPill.js for the toggle back to Graph). Shows the
// active state's (ValueIterationViewModel.activeStateId, set by clicking a card in the left
// pane's States view) Bellman equation header, an animated step-by-step reveal of how its Q-values
// were computed (highlight V -> show each outcome's reward -> show its transition probability ->
// tween/merge both into that action's Q -> highlight the best action), and a Q-table scoped to
// just that state's own actions.
//
// The reveal is a bespoke animation distinct from viBackupDiagram.js's simpler staged reveal (used
// by the left pane's diagram cards) - this view's whole point is showing the ARITHMETIC building
// up (reward and probability as separate visual elements converging into Q), not just nodes
// appearing one at a time. Driven by requestAnimationFrame + elapsed wall-clock time (Date.now()),
// not p5's own frame loop (this is a plain DOM/Canvas2D component, same family as
// viChartView.js/viStatesView.js, not a p5.js draw() participant).
const VEV_CANVAS_W = 420;
const VEV_CANVAS_H = 220;
const VEV_PADDING = 14;
const VEV_STATE_RADIUS = 18;
const VEV_ACTION_RADIUS = 13;

const VEV_PHASE_HIGHLIGHT_MS = 600;
const VEV_PHASE_REWARDS_MS = 600;
const VEV_PHASE_PROBS_SHOW_MS = 250;
const VEV_PHASE_PROBS_TWEEN_MS = 500;
const VEV_PHASE_PROBS_SETTLE_MS = 150;
const VEV_PHASE_PROBS_MS = VEV_PHASE_PROBS_SHOW_MS + VEV_PHASE_PROBS_TWEEN_MS + VEV_PHASE_PROBS_SETTLE_MS;
const VEV_PHASE_BEST_MS = 600;
const VEV_TOTAL_MS = VEV_PHASE_HIGHLIGHT_MS + VEV_PHASE_REWARDS_MS + VEV_PHASE_PROBS_MS + VEV_PHASE_BEST_MS;

class ViEquationView {
    constructor(canvasViewModel, valueIterationState, valueIterationViewModel) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.viViewModel = valueIterationViewModel;

        this.containerEl = null;
        this._headerEl = null;
        this._canvas = null;
        this._qtableBodyEl = null;
        this._bounds = null;

        this._rafHandle = null;
        this._lastKey = null; // `${stateId}:${sweepIndex}` last rendered/animated, for replay-vs-hold
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'vi-equation-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const header = document.createElement('div');
        header.className = 'vi-equation-view-header';
        container.appendChild(header);
        this._headerEl = header;

        const canvas = document.createElement('canvas');
        canvas.width = VEV_CANVAS_W;
        canvas.height = VEV_CANVAS_H;
        canvas.className = 'vi-equation-view-canvas';
        container.appendChild(canvas);
        this._canvas = canvas;

        const caption = document.createElement('span');
        caption.className = 'vi-chart-view-caption';
        caption.textContent = 'This state’s actions';
        container.appendChild(caption);

        const qtableBody = document.createElement('div');
        qtableBody.className = 'vi-equation-view-qtable';
        container.appendChild(qtableBody);
        this._qtableBodyEl = qtableBody;

        this.hide();
    }

    // x, y, width, height: the right pane's full box, same convention as viChartView.js's
    // updateBounds().
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

    // Re-renders whenever the active state or previewed sweep changes; safe to call on every VI
    // lifecycle event the same way ViStatesView/ViChartView's own refresh() hooks already are.
    refresh() {
        if (!this.containerEl || this.containerEl.style.display === 'none') return;
        const stateId = this.viViewModel.activeStateId;
        if (stateId === null || stateId === undefined) {
            this._renderPlaceholder();
            return;
        }

        const sweepIndex = this.viViewModel.previewedSweepIndex ?? this.viState.currentSweepIndex;
        const key = `${stateId}:${sweepIndex}`;
        const forceReplay = key !== this._lastKey;
        this._lastKey = key;

        const stateName = this.viState.stateNames[stateId] || `S${stateId}`;
        this._headerEl.innerHTML = KatexRenderer.render(this._formatHeader(stateName, sweepIndex), true);

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        const priorValues = sweepIndex > 0 ? this.viState.getValues(sweepIndex - 1) : this.viState.getValues(0);
        const colors = {
            state: AppPalette.node.state,
            action: AppPalette.node.action,
            best: AppPalette.valueIteration.best,
            result: AppPalette.valueIteration.result
        };

        this._cancelReveal();
        if (forceReplay) {
            this._startReveal(detail, priorValues, colors, stateName);
        } else {
            this._renderFrame(detail, priorValues, colors, stateName, VEV_TOTAL_MS);
        }

        const { rows } = ChartDataBuilders.buildQTableRowForState(this.viState, stateId, sweepIndex);
        this._renderQTable(rows);
    }

    _renderPlaceholder() {
        this._cancelReveal();
        this._lastKey = null;
        this._headerEl.innerHTML = '';
        const ctx = this._canvas.getContext('2d');
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._qtableBodyEl.innerHTML =
            '<div class="chart-dock-empty">Click a state’s card to see its calculation.</div>';
    }

    _renderQTable(rows) {
        this._qtableBodyEl.innerHTML = '';
        if (!rows || rows.length === 0) {
            this._qtableBodyEl.innerHTML = '<div class="chart-dock-empty">no actions</div>';
            return;
        }
        const table = document.createElement('table');
        table.className = 'chart-dock-qtable';
        rows.forEach(a => {
            const tr = document.createElement('tr');
            const tdA = document.createElement('td');
            tdA.textContent = a.actionName;
            tr.appendChild(tdA);
            const tdQ = document.createElement('td');
            tdQ.textContent = a.qValue.toFixed(2) + (a.isBest ? ' ★' : '');
            if (a.isBest) tdQ.classList.add('chart-dock-qtable-best');
            tr.appendChild(tdQ);
            table.appendChild(tr);
        });
        this._qtableBodyEl.appendChild(table);
    }

    _formatHeader(stateName, sweepIndex) {
        const s = KatexRenderer.escapeText(stateName);
        const accentNs = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability).paletteNamespace;
        const accent = (AppPalette[accentNs] && AppPalette[accentNs].result) || AppPalette.text.medium;
        return `V^{${sweepIndex}}(\\text{${s}}) = \\max_a \\sum_{s'} P(s'|s,a)\\bigl[R + \\gamma \\textcolor{${accent}}{V^{${sweepIndex - 1}}(s')}\\bigr]`;
    }

    // --- Reveal engine ---

    _startReveal(detail, priorValues, colors, stateName) {
        const startTime = Date.now();
        const tick = () => {
            const elapsed = Math.min(Date.now() - startTime, VEV_TOTAL_MS);
            this._renderFrame(detail, priorValues, colors, stateName, elapsed);
            if (elapsed < VEV_TOTAL_MS) {
                this._rafHandle = requestAnimationFrame(tick);
            } else {
                this._rafHandle = null;
            }
        };
        tick();
    }

    _cancelReveal() {
        if (this._rafHandle) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = null;
        }
    }

    _computePhase(elapsedMs) {
        const t1 = VEV_PHASE_HIGHLIGHT_MS;
        const t2 = t1 + VEV_PHASE_REWARDS_MS;
        const t3 = t2 + VEV_PHASE_PROBS_MS;
        const t4 = t3 + VEV_PHASE_BEST_MS;
        if (elapsedMs < t1) return { phase: 'highlight_value', localT: elapsedMs / t1 };
        if (elapsedMs < t2) return { phase: 'show_rewards', localT: (elapsedMs - t1) / VEV_PHASE_REWARDS_MS };
        if (elapsedMs < t3) {
            const local = elapsedMs - t2;
            if (local < VEV_PHASE_PROBS_SHOW_MS) {
                return { phase: 'show_probabilities', sub: 'show', localT: local / VEV_PHASE_PROBS_SHOW_MS };
            }
            if (local < VEV_PHASE_PROBS_SHOW_MS + VEV_PHASE_PROBS_TWEEN_MS) {
                return {
                    phase: 'show_probabilities', sub: 'tween',
                    localT: (local - VEV_PHASE_PROBS_SHOW_MS) / VEV_PHASE_PROBS_TWEEN_MS
                };
            }
            return { phase: 'show_probabilities', sub: 'settle', localT: 1 };
        }
        if (elapsedMs < t4) return { phase: 'select_best', localT: (elapsedMs - t3) / VEV_PHASE_BEST_MS };
        return { phase: 'done', localT: 1 };
    }

    _renderFrame(detail, priorValues, colors, stateName, elapsedMs) {
        const ctx = this._canvas.getContext('2d');
        const w = this._canvas.width, h = this._canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (!detail || !detail.actions || detail.actions.length === 0) {
            ctx.fillStyle = colors.action;
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('no actions', w / 2, h / 2);
            return;
        }

        const info = this._computePhase(elapsedMs);
        const stateX = VEV_PADDING + VEV_STATE_RADIUS;
        const stateY = h / 2;
        const actionX = w * 0.42;
        const transX = w * 0.75;

        const rows = [];
        detail.actions.forEach(action => action.transitions.forEach(t => rows.push({ action, transition: t })));
        const rowCount = Math.max(rows.length, 1);
        const rowH = (h - 2 * VEV_PADDING) / rowCount;

        let rowCursor = 0;
        const actionPositions = new Map();
        detail.actions.forEach(action => {
            const span = Math.max(action.transitions.length, 1);
            actionPositions.set(action.actionId, VEV_PADDING + (rowCursor + span / 2) * rowH);
            rowCursor += span;
        });

        const showRewards = info.phase !== 'highlight_value';
        const showProbs = info.phase === 'show_probabilities' || info.phase === 'select_best' || info.phase === 'done';
        const tweening = info.phase === 'show_probabilities' && info.sub === 'tween';
        const tweenT = tweening ? EasingUtils.easeInOut(info.localT)
            : (info.phase === 'select_best' || info.phase === 'done'
                || (info.phase === 'show_probabilities' && info.sub === 'settle') ? 1 : 0);
        const qRevealed = info.phase === 'select_best' || info.phase === 'done';
        const bestRevealed = info.phase === 'done' || (info.phase === 'select_best' && info.localT > 0.3);

        const pulse = info.phase === 'highlight_value' ? Math.sin(info.localT * Math.PI) * 3 : 0;
        this._circle(ctx, stateX, stateY, VEV_STATE_RADIUS + pulse, colors.state);
        this._label(ctx, stateX, stateY, stateName, colors.state);

        let rowIdx = 0;
        detail.actions.forEach(action => {
            const ay = actionPositions.get(action.actionId);
            const isBest = action.actionId === detail.bestActionId;
            const dim = bestRevealed && !isBest;
            ctx.globalAlpha = dim ? 0.4 : 1;

            ctx.strokeStyle = colors.action;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(stateX, stateY);
            ctx.lineTo(actionX, ay);
            ctx.stroke();
            const actionFill = (bestRevealed && isBest) ? colors.best : colors.action;
            this._circle(ctx, actionX, ay, VEV_ACTION_RADIUS, actionFill);
            this._label(ctx, actionX, ay, action.actionName, actionFill);

            if (qRevealed) {
                ctx.fillStyle = (bestRevealed && isBest) ? colors.best : colors.result;
                ctx.font = (bestRevealed && isBest) ? 'bold 12px monospace' : '11px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(`Q = ${action.qValue.toFixed(2)}${(bestRevealed && isBest) ? ' ★' : ''}`,
                    actionX, ay - VEV_ACTION_RADIUS - 10);
            }

            action.transitions.forEach(t => {
                const ty = VEV_PADDING + (rowIdx + 0.5) * rowH;
                rowIdx += 1;

                ctx.strokeStyle = colors.action;
                ctx.beginPath();
                ctx.moveTo(actionX, ay);
                ctx.lineTo(transX, ty);
                ctx.stroke();

                ctx.save();
                ctx.setLineDash([4, 3]);
                this._circle(ctx, transX, ty, VEV_ACTION_RADIUS, colors.state, true);
                ctx.restore();
                this._label(ctx, transX, ty, t.nextStateName, colors.state);

                if (showRewards) {
                    const originX = transX + VEV_ACTION_RADIUS + 10;
                    const rOriginY = ty - 7;
                    const pOriginY = ty + 7;
                    const qAnchorX = actionX;
                    const qAnchorY = ay - VEV_ACTION_RADIUS - 10;

                    const rX = originX + (qAnchorX - originX) * tweenT;
                    const rY = rOriginY + (qAnchorY - rOriginY) * tweenT;
                    const fadeOut = tweenT > 0.6 ? Math.max(0, 1 - (tweenT - 0.6) / 0.4) : 1;

                    ctx.globalAlpha = (dim ? 0.4 : 1) * fadeOut;
                    ctx.fillStyle = colors.result;
                    ctx.font = '9px monospace';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`R=${t.reward.toFixed(2)}`, rX, rY);

                    if (showProbs) {
                        const pX = originX + (qAnchorX - originX) * tweenT;
                        const pY = pOriginY + (qAnchorY - pOriginY) * tweenT;
                        ctx.fillText(`P=${t.probability.toFixed(2)}`, pX, pY);
                    }
                    ctx.globalAlpha = dim ? 0.4 : 1;
                }
            });
            ctx.globalAlpha = 1;
        });

        if (rows.length > 0) {
            ctx.fillStyle = colors.result;
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.globalAlpha = 0.6;
            ctx.fillText('t = k−1 (prior sweep)', transX, h - 8);
            ctx.globalAlpha = 1;
        }
    }

    _circle(ctx, x, y, r, fill, dashed = false) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        if (dashed) {
            ctx.strokeStyle = ColorUtils.contrastText(fill);
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    _label(ctx, x, y, name, fill) {
        ctx.fillStyle = ColorUtils.contrastText(fill);
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x, y);
    }

    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
        this._cancelReveal();
    }
}
```

- [ ] **Step 2: CSS**

In `style.css`, after the existing `.vi-chart-view-body` rule block, add:
```css
/* ── Iteration right-pane Equation view (2026-07-17 redesign) ────────────── */

.vi-equation-view {
  position: fixed;
  z-index: 8;
  background: var(--surface-canvas);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

.vi-equation-view-header {
  flex: 0 0 auto;
  padding: 8px;
  font-size: 15px;
  text-align: center;
}

.vi-equation-view-canvas {
  display: block;
  width: 100%;
  max-width: 420px;
  height: 220px;
  margin: 0 auto;
}

.vi-equation-view-qtable {
  flex: 1;
  min-height: 0;
  padding: 4px 8px;
}
```

- [ ] **Step 3: Script tag**

In `index.html`, immediately after the existing `viChartView.js` tag (currently line 296):
```html
    <script src="src/main/view/viChartView.js"></script>
    <script src="src/main/view/viEquationView.js"></script>
```

- [ ] **Step 4: Verify**

```bash
node --check src/main/view/viEquationView.js
```

This file cannot be meaningfully browser-tested standalone (it isn't constructed/wired anywhere
yet — that's Task 7). Limit this task's verification to the syntax check above.

- [ ] **Step 5: Commit**

```bash
git add src/main/view/viEquationView.js style.css index.html
git commit -m "Add ViEquationView: Bellman header + animated Q-value reveal + focused Q-table"
```

---

### Task 6: `ViRightViewPill` + `ValueIterationViewModel.rightView`

**Files:**
- Create: `src/main/view/viRightViewPill.js`
- Modify: `src/main/adapter/viewmodel/ValueIterationViewModel.js`
- Modify: `style.css` (new `.vi-right-view-pill*` rules)
- Modify: `index.html` (one new script tag)

**Interfaces:**
- Produces: `ValueIterationViewModel.rightView` — `'equation'` (default) | `'graph'`, living in
  the constructor (not `reset()` — same reasoning as `leftView`'s own placement, confirmed in the
  prior follow-on's final review: a VI Reset must not silently flip this and desync the pill).
  `ViRightViewPill` — same shape as `ViLeftViewPill`.

- [ ] **Step 1: Add `rightView` to the ViewModel**

In `src/main/adapter/viewmodel/ValueIterationViewModel.js`, in the constructor (which currently
sets `this.leftView = 'states';` before calling `this.reset()`), add `rightView` right after it:
```js
    constructor() {
        // 'states' (default) or 'chart' - which view the left pane currently shows, for the 3
        // split quadrants (Phase 3b's own screen split). Presentation only, mirrors
        // ExpectationViewModel.leftView's exact shape/convention - lives here, not in reset(), so
        // a VI Reset/Initialize (which calls reset()) doesn't silently flip the left pane back to
        // States while the DOM/pill are still showing Chart.
        this.leftView = 'states';
        // 'equation' (default) or 'graph' - which view the RIGHT pane currently shows, for the
        // same 3 split quadrants (2026-07-17 redesign). Same constructor-not-reset() placement as
        // leftView, for the identical reset-desync reason.
        this.rightView = 'equation';
        this.reset();
    }
```

- [ ] **Step 2: Create the pill**

```js
// src/main/view/viRightViewPill.js
// Floating pill, top-left of the RIGHT (MDP graph) pane specifically, in Values -> Iteration's
// 3 split quadrants: a [Equation | Graph] segmented switch for valueIterationViewModel.rightView
// (2026-07-17 redesign). Modeled directly on viLeftViewPill.js (same DOM/CSS skeleton), anchored
// to the opposite (left) edge of the right pane so the two pills sit on the two facing inner
// edges of the split rather than stacking on one side.
const VI_RIGHT_VIEW_PILL_OPTIONS = [
    { key: 'equation', label: 'Equation' },
    { key: 'graph',    label: 'Graph' }
];

class ViRightViewPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        // Same +64 row-collision fix viLeftViewPill.js/mcLeftViewPill.js already established for
        // the estimatorPill/mcRunsPill row this shares vertical space with.
        this._topOffset = topOffset + 64;

        const container = document.createElement('div');
        container.className = 'vi-right-view-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const track = document.createElement('div');
        track.className = 'vi-right-view-pill-track';
        container.appendChild(track);

        VI_RIGHT_VIEW_PILL_OPTIONS.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'vi-right-view-pill-btn';
            btn.textContent = opt.label;
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (this.callbacks.onSelectRightView) this.callbacks.onSelectRightView(opt.key);
            });
            track.appendChild(btn);
            this.buttons[opt.key] = btn;
        });

        this.refresh();
        this.hide();
    }

    // x, width: the RIGHT pane's own bounds - LEFT-edge anchored within that region (opposite of
    // viLeftViewPill.js's right-edge anchor within the same region), so the two pills sit on the
    // two facing inner edges of the split.
    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        this.containerEl.style.left = (this._bounds.x + 12) + 'px';
    }

    refresh() {
        if (!this.containerEl) return;
        const current = this.viewModel.valueIterationViewModel ? this.viewModel.valueIterationViewModel.rightView : 'equation';
        Object.entries(this.buttons).forEach(([key, btn]) => {
            btn.classList.toggle('vi-right-view-pill-btn--active', key === current);
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

- [ ] **Step 3: CSS**

In `style.css`, immediately after the existing `.vi-left-view-pill-btn--active:hover` rule block,
add:
```css
/* ── Iteration [Equation | Graph] pill (2026-07-17 redesign) ─────────────── */

.vi-right-view-pill {
  position: absolute;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
}

.vi-right-view-pill-track {
  display: flex;
  gap: 2px;
  background: var(--surface-card2, var(--bg-card));
  border: 1px solid var(--border-hairline, var(--border-light));
  border-radius: 8px;
  padding: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.vi-right-view-pill-btn {
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

.vi-right-view-pill-btn:hover {
  background: var(--surface-hover, var(--bg-dark-hover));
}

.vi-right-view-pill-btn--active {
  background: var(--accent-teal);
  color: var(--color-primary-contrast, var(--text-white));
}

.vi-right-view-pill-btn--active:hover {
  background: var(--accent-teal);
}
```

- [ ] **Step 4: Script tag**

In `index.html`, immediately after the existing `viLeftViewPill.js` tag (currently line 280):
```html
    <script src="src/main/view/viLeftViewPill.js"></script>
    <script src="src/main/view/viRightViewPill.js"></script>
```

- [ ] **Step 5: Verify**

```bash
node --check src/main/adapter/viewmodel/ValueIterationViewModel.js
node --check src/main/view/viRightViewPill.js
```

Browser console check: `new ValueIterationViewModel().rightView === 'equation'`. This file (like
Task 5's) cannot be meaningfully browser-tested for real interaction until Task 7 wires it in.

- [ ] **Step 6: Commit**

```bash
git add src/main/view/viRightViewPill.js src/main/adapter/viewmodel/ValueIterationViewModel.js \
        style.css index.html
git commit -m "Add ViRightViewPill + ValueIterationViewModel.rightView"
```

---

### Task 7: Wire it all into `main.js`/`mainView.js`

**Files:**
- Modify: `src/main/app/main.js`
- Modify: `src/main/view/mainView.js`
- Modify: `src/main/use_case/valueIteration/viPresenter.js`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: `rightView === 'equation'` (default) hides the live graph and shows `viEquationView`;
  `rightView === 'graph'` shows the graph exactly as before this whole redesign and hides
  `viEquationView`. `VIPresenter.setEquationView()`/`._refreshEquationView()` (mirrors
  `setStatesView`/`setChartView`'s existing shape exactly).

- [ ] **Step 1: Construct `viRightViewPill`/`viEquationView` in `main.js`**

Immediately after the existing block that constructs `viChartView` and calls
`viPresenter.setChartView(viChartView);` (from the prior follow-on), add:
```js
    const viRightViewPill = new ViRightViewPill({
        onSelectRightView: (key) => {
            valueIterationViewModel.rightView = key;
            viRightViewPill.refresh();
            setUpVISplitChrome();
            if (typeof redraw === 'function') redraw();
        }
    }, canvasViewModel);
    mainView.viRightViewPill = viRightViewPill;

    const viEquationView = new ViEquationView(canvasViewModel, valueIterationState, valueIterationViewModel);
    mainView.viEquationView = viEquationView;
    viRightViewPill.setup(mainView.TOP_BARS_HEIGHT);
    viEquationView.setup();

    viPresenter.setEquationView(viEquationView);
```

- [ ] **Step 2: `VIPresenter` gains the third refresh hook**

In `src/main/use_case/valueIteration/viPresenter.js`, add `this.equationView = null;` right after
the existing `this.chartView = null;` in the constructor, and `setEquationView(equationView) {
this.equationView = equationView; }` right after the existing `setChartView(chartView) { ... }`.

Add `this._refreshEquationView();` immediately after every existing `this._refreshChartView();`
call (there are 4: `presentInitialized`, `presentSweepComplete`, `presentComplete`,
`presentReset`).

Add the helper right after the existing `_refreshChartView()` method:
```js
    // The Equation right-pane view - refresh() itself is a no-op while hidden (rightView ===
    // 'graph', or a non-split quadrant/mode) or while nothing is selected (activeStateId ===
    // null), so this is safe to call on every lifecycle event the same way the other two
    // refresh hooks already are.
    _refreshEquationView() {
        if (this.equationView) this.equationView.refresh();
    }
```

- [ ] **Step 3: Rewrite `setUpVISplitChrome()` to also branch on `rightView`**

Find `setUpVISplitChrome()` in `main.js` (already branches on `leftView` per the prior follow-on).
Add a second, independent branch right after the existing `leftView`-driven show/hide block, before
the function's closing brace:
```js
        const showGraph = valueIterationViewModel.rightView === 'graph';
        if (showGraph) {
            viEquationView.hide();
        } else {
            viEquationView.updateBounds(viSplit.leftW, mainView.TOP_BARS_HEIGHT, viSplit.rightW,
                windowHeight - mainView.TOP_BARS_HEIGHT - mainView.getDockHeight());
            viEquationView.show();
        }
        viRightViewPill.updateBounds(viSplit.leftW, viSplit.rightW);
        viRightViewPill.show();
```

(This assumes `setUpVISplitChrome()` already has `viSplit` in scope from computing `leftW`/
`rightW` for the existing `leftView` branch — it does, per the prior follow-on's own
implementation. If the existing variable name differs, use whatever that function already calls
its split-widths result — do not recompute it a second time.)

- [ ] **Step 4: Gate the live graph draw in `mainView.js`**

Find `mainView.js`'s VI draw dispatch (the block that calls `valueIterationView.draw()` when the
split applies — inside the `translate(leftW, ...)` + `drawingContext.save()/.clip()` block from
Phase 3b). Wrap the existing `this.valueIterationView.draw(...)` call:
```js
        if (this.viewModel.valueIterationViewModel.rightView !== 'equation') {
            this.valueIterationView.draw(rightW, /* ...whatever args this call already passes... */);
        }
```

(Read the exact existing call signature/surrounding code first — this step only adds the
conditional wrapper around the pre-existing call, it does not change the call itself.)

- [ ] **Step 5: Re-sync on quadrant toggles**

Find `onModelKnownToggle`/`onObservabilityToggle` in `main.js` (already call `setUpVISplitChrome()`
per the prior follow-on) — no change needed here IF they already call the whole
`setUpVISplitChrome()` function (which Step 3 already extended to cover `rightView` too). Verify
this is the case; if either toggle handler calls some narrower helper instead, add a
`setUpVISplitChrome()` call there too.

- [ ] **Step 6: Resize handlers**

In `mainView.js`'s `windowResized()` and `onPanelResize()` (already patched once this session for
`viLeftViewPill`/`viChartView`'s bounds), add equivalent updates for `viRightViewPill`/
`viEquationView`, mirroring the existing pattern exactly (including the `leftView === 'chart'`-
style branch, now also checking `rightView === 'graph'` to decide whether `viEquationView` should
be shown or hidden after the resize).

- [ ] **Step 7: Theme change**

In `main.js`'s `AppPalette._onThemeChange`, add a rebuild call for the equation view, right after
the existing `if (mainView.viChartView) mainView.viChartView.refresh();` line:
```js
        // ViEquationView's canvas also bakes AppPalette colors into raster pixels (the reveal's
        // node/line colors) - refresh() re-renders the current frame (held, non-replaying) with
        // the new palette.
        if (mainView.viEquationView) mainView.viEquationView.refresh();
```

- [ ] **Step 8: Hide new components alongside the existing ones**

Find every existing `viStatesView.hide()` call in `main.js` (in `onLeave.values` and
`onEnterSubView.mc`) and add `viRightViewPill.hide(); viEquationView.hide();` alongside each.

- [ ] **Step 9: Full verification matrix**

```bash
node --check src/main/app/main.js
node --check src/main/view/mainView.js
node --check src/main/use_case/valueIteration/viPresenter.js
```

Real browser test (`playwright-core`, worktree root, `http.server 8010`), building the same test
MDP this session's prior tasks used:
1. Enter Values → Iteration, P known/full (known:full). Confirm: `.vi-equation-view` visible by
   default, `.vi-left-view-pill`/`.vi-right-view-pill` both visible, the live p5 graph canvas
   region is NOT drawing (no errors from `valueIterationView.draw()` being skipped).
2. Run 2+ sweeps, click a state's card in the States view. Confirm the Equation pane's header
   renders real LaTeX (`.vi-equation-view-header` contains real KaTeX-rendered markup, not raw
   text), the canvas reveal plays through all 4 phases over ~2.7s (screenshot at t=0, t=1500,
   t=3000ms showing progressively more content, ending with the best action starred/highlighted
   and non-best actions dimmed), and the Q-table below shows this state's real per-action values.
3. Click `[Graph]` on the right-view pill. Confirm `viEquationView` hides, the live graph
   reappears and renders correctly (unchanged from pre-redesign behavior).
4. Click `[Equation]` again. Confirm it comes back, still showing the same active state
   (`activeStateId` untouched by the toggle).
5. Toggle P known → unknown (Learning Iteration). Confirm `.vi-equation-view`/`.vi-right-view-pill`
   both hide (Learning Iteration is unaffected by any of this).
6. Toggle back to P known, then to partial observability (Belief Iteration). Confirm the Equation
   pane still works (flat-card quadrant, but the Equation pane and its reveal are NOT gated to
   known:full — only the left pane's rich diagram cards are).
7. Resize the window. Confirm `viRightViewPill`/`viEquationView` bounds update correctly (mirroring
   Task 6's own prior-session resize-bug fix pattern).
8. Zero console errors, both light and dark theme, across the whole sequence above.

- [ ] **Step 10: Commit**

```bash
git add src/main/app/main.js src/main/view/mainView.js src/main/use_case/valueIteration/viPresenter.js
git commit -m "Wire ViRightViewPill + ViEquationView into main.js/mainView.js"
```

---

### Task 8: Final regression pass, `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full regression pass**

Re-run Task 7's own verification once more against the final combined state, plus specifically:
1. A long run (6+ sweeps): confirm only the live sweep stays expanded throughout, older ones
   collapse automatically as the live pointer advances, and manually-reopened old pills stay open
   across further sweeps (don't get force-closed by the live pointer moving further still).
2. Belief Iteration / PO Q-Learning: confirm the Equation pane's reveal and Q-table both work
   correctly for these two quadrants too (flat left-pane cards, but a fully working right pane).
3. Switch Values sub-view MC ↔ VI while the Equation pane is active; confirm no stray DOM bleeds
   across, and returning to VI restores whichever `rightView` was last set.
4. Confirm the existing Q-table-cell explanation overlay (from Phase 3b, unrelated to this
   redesign) still works when `rightView === 'graph'` — this task's changes must not have broken
   that older feature's own click-to-explain flow.

- [ ] **Step 2: Update `CLAUDE.md`**

In the `### Value Iteration / Learning Iteration / Belief Iteration / PO Q-Learning (Values → vi)`
section, add a new paragraph after the existing "Known follow-up (not yet fixed)" paragraph (and
after the paragraph describing the `[States | Chart]` toggle / backup diagram from the immediately
prior follow-on):
```
A further redesign (2026-07-17) reworked both panes again. Left pane: each state's card now shows
a header (name + `V = X.XX`) above its diagram, whose nodes are labeled in `treeView.js`'s own
visual language (`ViBackupDiagram`'s `state`/`action`/`best` colors mirror `AppPalette.node.state`/
`.node.action`/`.valueIteration.best` exactly) instead of the original anonymous circles. Each
`t = k` section now gets a dashed-border wrapper; only the live sweep stays expanded, older ones
collapse to a clickable `t = k` pill (`ViStatesView._manuallyExpanded`) - a freshly-expanded
sweep's cards stage in via `ViBackupDiagram.drawAnimated()` rather than popping in fully drawn.
Clicking an individual state's card sets `ValueIterationViewModel.activeStateId` and pins that
sweep, driving the right pane below. Right pane: a new `[Equation | Graph]` toggle
(`viRightViewPill.js`, mirroring `viLeftViewPill.js`'s placement on the opposite inner edge of the
split) defaults to **Equation** (`viEquationView.js`) - the active state's Bellman equation header
plus an animated, 4-phase reveal of its Q-value calculation (highlight V → show each outcome's
reward → show its probability, tweening both into that action's Q → highlight the best action) and
a Q-table scoped to just that state - replacing the live MDP graph there by default; toggling to
**Graph** restores exactly today's `ValueIterationView.draw()` rendering, unchanged.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Final regression pass for the States view redesign + Equation pane; update CLAUDE.md"
```

---

## Self-Review Notes

- **Spec coverage:** treeView-style labeled circles + header/V ✓ (Task 2/3); dashed `t=k` sections,
  only-live-expanded, clickable pills ✓ (Task 3); per-card staged reveal on first expansion only ✓
  (Task 2/3); `activeStateId` click wiring ✓ (Task 3); Equation pane replacing the graph by default
  with a toggle back ✓ (Task 6/7); bespoke 4-phase reward/probability reveal ✓ (Task 5); focused
  Q-table ✓ (Task 4/5); hover/pin driving the Equation pane's numbers when active, the graph's
  labels when toggled to Graph ✓ (Task 5's `refresh()` reads `previewedSweepIndex`; Task 7 leaves
  the graph's own existing hover/pin rendering completely untouched when `rightView === 'graph'`);
  applies to all 3 split quadrants, Learning Iteration unaffected ✓ (Task 7 Step 8, Task 8 Step 1).
- **Placeholder scan:** Task 7's Steps 4/5/6 reference "the existing call/pattern" rather than
  reproducing large pre-existing surrounding code verbatim (mainView.js's VI draw dispatch and the
  two resize handlers are large, already-established blocks from two prior phases) - each still
  states the EXACT change to make and why, which is the plan's actual deliverable; reproducing
  their full existing bodies here would risk the plan going stale against the real file rather than
  being clearer.
- **Type/name consistency:** `ViBackupDiagram.draw`/`.drawAnimated`'s new `stateName` 5th parameter
  and `colors.state` key are used identically in both its own file (Task 2) and every call site
  (Task 3's `_buildDiagramCard`, Task 5's `viEquationView.js` - note: Task 5 does NOT call
  `ViBackupDiagram` at all, per the user's explicit choice to build a bespoke reveal instead: its
  own `_circle`/`_label` are local, deliberately-duplicated small helpers, not a shared import,
  since the two views' reveal choreography is genuinely different). `activeStateId`/`rightView`/
  `leftView` field names match between `ValueIterationViewModel` (Tasks 3/6) and every reader
  (`viStatesView.js`, `viEquationView.js`, `main.js`, `mainView.js`). `KatexRenderer.render`/
  `.escapeText` signatures match between Task 1's definition and Task 5's call sites.
- **Cross-task file touch confirmation:** Task 2 and Task 3 both touch the
  `ViBackupDiagram`/`viStatesView.js` pair in dependency order (Task 2's new signature first, Task
  3's call site update second) - matches the prior follow-on's own established task-ordering
  convention for this exact file pair.
