# Evaluate Redesign Phase 1: Toolbar Segments + Goal Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the top bar's single `Values` mode-toggle segment into two (`Monte Carlo` / `Iteration`), and gate entry into Values mode behind a full-canvas "goal card" overlay stating `V^π(S₀) = E[G | S = <start state>]`, matching Phase 1 of the external Evaluate redesign handoff.

**Architecture:** Presentation-tier only, no domain/use-case changes. `viewModel.mode`/`valuesSubView` keep their existing values (`'values'` / `'mc'|'vi'`) — the toolbar split and goal card are purely a new entry path onto the SAME internal state, not a new mode taxonomy. Two new presentation-only `CanvasViewModel` fields (`goalCardVisible`, `goalCardMuted`), one new `CanvasController` method that composes the existing `setMode`/`setValuesSubView` calls with goal-card gating, a new `GoalCard` view (DOM overlay, matching this codebase's floating-chrome convention), and small, additive edits to `topBar.js`/`main.js` to wire it all together.

**Tech Stack:** Vanilla JS, p5.js + DOM chrome, no build step, no test framework (per `CLAUDE.md` — verification is manual/headless-browser, not unit tests). KaTeX is already loaded (`libraries/katex/katex.min.js`); reuse `rightPanel.js`'s existing `renderKatex(latex, display)` helper (a plain top-level `function` declaration, safely callable from any other script in this document) rather than adding a second LaTeX-to-HTML path.

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-07-16-evaluate-goal-card-design.md` — read it once before starting Task 1. This plan covers Phase 1 of that document's 7-phase roadmap only.
- No `ValuesMethodMatrix` changes. The Iteration toolbar segment's label/color relabels via modelKnown only (ignoring the observability axis — Belief/PO Q-Learning stay handled exactly as today, via the Parameters popover, once already inside the Iteration sub-view).
- No auto-run on goal-card dismissal — dismissing lands the user in the idle (not-yet-run) sub-view, exactly as switching to Values mode does today.
- `goalCardMuted` is in-memory/session-only — not persisted to `localStorage`, not included in graph import/export (same tier as `buildCanvasView`/`treeExpanded`).
- The `⇄ Compare` link on the goal card is visible but disabled (Compare is Phase 5) — do not wire it to navigate anywhere.
- All colors via existing `AppPalette`/CSS-custom-property tokens (`--accent-orange`, `--accent-teal`, `--accent-purpleT`, `--surface-card2`, `--border-hairline`, ...) — no hardcoded hex at any content-color call site. The goal card's full-screen backdrop *scrim* (not content) may use a plain `rgba(0,0,0,alpha)` black overlay — scrims are conventionally theme-invariant even in themed design systems, unlike the card/content colors sitting on top of it.
- No automated test suite exists. Every task's verification step is a concrete manual/headless-browser check (`python3 -m http.server 8010` from the repo root; check if a server is already running on that port first), not a unit test. Check both light and dark theme.

---

### Task 1: `CanvasViewModel` fields + `CanvasController` scene-entry method

**Files:**
- Modify: `src/main/adapter/viewmodel/CanvasViewModel.js` (constructor, right after the existing `qLearningState` field)
- Modify: `src/main/adapter/controller/CanvasController.js` (new method, placed near `setValuesSubView`)

**Interfaces:**
- Produces: `canvasViewModel.goalCardVisible` (boolean, default `false`), `canvasViewModel.goalCardMuted` (boolean, default `false`), `canvasController.enterValuesScene(subView)` (calls `setMode('values')` + `setValuesSubView(subView)`, then shows the goal card unless muted), `canvasController.dismissGoalCard()`, `canvasController.muteGoalCard()`, `canvasController.showGoalCardIfNotMuted()` (used by Task 4's Reset hooks). Later tasks (2-4) call all of these by these exact names.

- [ ] **Step 1: Add the two new fields to `CanvasViewModel`'s constructor**

In `src/main/adapter/viewmodel/CanvasViewModel.js`, immediately after the existing:
```js
        // Real episodic Q-learning state for the Learning Iteration quadrant. Attached in main.js;
        // presentation/session-only, excluded from graph import/export (see QLearningState).
        this.qLearningState = null;
```
add:
```js

        // Evaluate redesign Phase 1: the full-canvas "goal card" shown on entering Values mode
        // (V^pi(S0) = E[G | S=S0]), gating direct entry into the Monte Carlo/Iteration sub-views.
        // Both fields are presentation-tier only, session-scoped (goalCardMuted is NOT persisted
        // to localStorage, unlike theme preference) - excluded from graph import/export, same
        // convention as buildCanvasView/treeExpanded above.
        this.goalCardVisible = false;
        // "don't ask again" for this session - once true, entering Values mode or clicking Reset
        // in Monte Carlo/Iteration no longer shows the card until the page reloads.
        this.goalCardMuted = false;
```

- [ ] **Step 2: Add `enterValuesScene`, `dismissGoalCard`, `muteGoalCard`, `showGoalCardIfNotMuted` to `CanvasController`**

In `src/main/adapter/controller/CanvasController.js`, immediately after the existing `setValuesSubView` method:
```js
    // Switches the sub-view shown within Values mode ('mc' | 'vi'). Does not itself change the
    // top-level mode - callers should call setMode('values') first if needed.
    setValuesSubView(subView) {
        const prevSubView = this.viewModel.valuesSubView;
        const isRealTransition = prevSubView !== subView;

        if (isRealTransition && this.modeLifecycle?.onLeaveSubView?.[prevSubView]) {
            this.modeLifecycle.onLeaveSubView[prevSubView](prevSubView, subView);
        }

        if (this.interactors.setValuesSubView) {
            const inputData = new SetValuesSubViewInputData(subView);
            this.interactors.setValuesSubView.execute(inputData);
        }

        if (isRealTransition && this.modeLifecycle?.onEnterSubView?.[subView]) {
            this.modeLifecycle.onEnterSubView[subView](subView, prevSubView);
        }
    }
```
add:
```js

    // Evaluate redesign Phase 1 entry point: the top bar's Monte Carlo/Iteration toolbar segments
    // (and the goal card's own scene buttons) both call this instead of setMode+setValuesSubView
    // directly, so the goal-card gate is applied uniformly in one place. Always composes the
    // existing setMode/setValuesSubView calls (both already no-op internally when there's no real
    // transition), then shows the goal card unless the user already muted it this session -
    // re-clicking the same already-active segment still re-shows the card, matching the handoff's
    // "picking either scene opens the goal card first" (an explicit re-entry action, not merely
    // "ensure this sub-view is active").
    enterValuesScene(subView) {
        this.setMode('values');
        this.setValuesSubView(subView);
        this.showGoalCardIfNotMuted();
    }

    showGoalCardIfNotMuted() {
        if (!this.viewModel.goalCardMuted) {
            this.viewModel.goalCardVisible = true;
        }
    }

    dismissGoalCard() {
        this.viewModel.goalCardVisible = false;
    }

    muteGoalCard() {
        this.viewModel.goalCardMuted = true;
        this.viewModel.goalCardVisible = false;
    }
```

- [ ] **Step 3: Verify in browser**

```bash
python3 -m http.server 8010
```
Open `http://localhost:8010/index.html`, open the console:
```js
canvasViewModel.goalCardVisible   // false
canvasViewModel.goalCardMuted     // false
canvasController.enterValuesScene('mc');
canvasViewModel.mode              // 'values'
canvasViewModel.valuesSubView     // 'mc'
canvasViewModel.goalCardVisible   // true
canvasController.dismissGoalCard();
canvasViewModel.goalCardVisible   // false
canvasController.enterValuesScene('vi');
canvasViewModel.goalCardVisible   // true (re-shows on a fresh scene-entry call)
canvasController.muteGoalCard();
canvasViewModel.goalCardVisible   // false
canvasViewModel.goalCardMuted     // true
canvasController.enterValuesScene('mc');
canvasViewModel.goalCardVisible   // false (muted - stays hidden)
```
Expected: every line matches the comment. No console errors. (No visual change yet - `goalCardVisible` isn't read by any view until Task 3.)

- [ ] **Step 4: Commit**

```bash
git add src/main/adapter/viewmodel/CanvasViewModel.js src/main/adapter/controller/CanvasController.js
git commit -m "Add goalCardVisible/goalCardMuted state and CanvasController.enterValuesScene"
```

---

### Task 2: Top bar — split `Values` into `Monte Carlo` / `Iteration` segments

**Files:**
- Modify: `src/main/view/topBar.js` (`_createModeToggle()`, `switchMode`)
- Modify: `style.css` (mode-toggle active-state color rules)

**Interfaces:**
- Consumes: `canvasController.enterValuesScene` (Task 1) — NOT called directly by `topBar.js` itself (per this codebase's convention, `topBar.js` only invokes `this.callbacks.*`; `main.js` wires the actual controller call, same pattern as every other top-bar action).
- Produces: `topBar.callbacks.onEnterValuesScene(subView)` (new callback, fired by both new buttons), `topBar.monteCarloToggleBtn`/`topBar.iterationToggleBtn` (replacing the old `topBar.valuesSlot`), `topBar.refreshModeToggle()` (re-applies the Iteration button's label/active-class based on `modelKnown` - called by Task 4's `onModelKnownToggle` wiring).

- [ ] **Step 1: Replace the single Values button with two buttons**

In `src/main/view/topBar.js`'s `_createModeToggle()`, change:
```js
        // Values toggle: top-level mode entry point only, symmetric with Build/Policy. Sub-view
        // selection (MC | Method) lives in the floating estimator pill, not here.
        this.valuesSlot = createButton('Values');
        this.valuesSlot.parent(track);
        this.valuesSlot.addClass('toolbar-toggle');
        this.valuesSlot.addClass('toolbar-toggle--values');
        this.valuesSlot.mousePressed(() => this.switchMode('values'));
    }
```
to:
```js
        // Monte Carlo / Iteration: Evaluate redesign Phase 1 replaces the single Values segment
        // with two visually-separate scene entry points. Both still drive the SAME internal
        // mode='values' + valuesSubView state as before (see CanvasController.enterValuesScene) -
        // this is a rendering-only split, not a new top-level mode. Sub-view switching WHILE
        // already in Values mode still lives in the floating estimator pill, unchanged; these
        // buttons are the "enter Values mode at this sub-view, with the goal-card gate" path.
        this.monteCarloToggleBtn = createButton('Monte Carlo');
        this.monteCarloToggleBtn.parent(track);
        this.monteCarloToggleBtn.addClass('toolbar-toggle');
        this.monteCarloToggleBtn.addClass('toolbar-toggle--mc');
        this.monteCarloToggleBtn.mousePressed(() => this.enterValuesScene('mc'));

        // Iteration's label/active-color relabel to "Learning Iteration" (purpleT) when P is
        // unknown, mirroring ValuesMethodMatrix's known:full/unknown:full split - see
        // refreshModeToggle() below. Only the modelKnown axis affects this button; observability
        // (Belief/PO Q-Learning) stays handled entirely inside the Iteration sub-view, as today.
        this.iterationToggleBtn = createButton('Iteration');
        this.iterationToggleBtn.parent(track);
        this.iterationToggleBtn.addClass('toolbar-toggle');
        this.iterationToggleBtn.addClass('toolbar-toggle--iteration');
        this.iterationToggleBtn.mousePressed(() => this.enterValuesScene('vi'));

        this.refreshModeToggle();
    }

    // Re-applies the Iteration button's label ("Iteration" / "Learning Iteration") and active-
    // state color class based on the current modelKnown flag. Called on setup and whenever
    // modelKnown toggles (main.js's onModelKnownToggle) so the button never goes stale.
    refreshModeToggle() {
        if (!this.iterationToggleBtn || !this.viewModel) return;
        const known = this.viewModel.modelKnown;
        this.iterationToggleBtn.html(known ? 'Iteration' : 'Learning Iteration');
        this.iterationToggleBtn.toggleClass('toolbar-toggle--iteration-unknown', !known);
    }

    // Public entry point for both new buttons - always shown via callback (not a direct
    // controller call), matching every other top-bar action in this file.
    enterValuesScene(subView) {
        this.currentMode = 'values';
        if (this.callbacks.onEnterValuesScene) {
            this.callbacks.onEnterValuesScene(subView);
        }
    }
```

**Note:** `this.viewModel` must already be available on `TopBar` for `refreshModeToggle()` to read `modelKnown` — read the current constructor/`setup()` signature first to confirm how `TopBar` receives the viewmodel (it already must, since `mcRunsPill`-style refresh methods elsewhere in this file read `this.viewModel.expectationState` similarly — search for an existing `this.viewModel.` read in `topBar.js` to confirm the exact property name before assuming `this.viewModel` is correct).

- [ ] **Step 2: Update CSS - two accent colors instead of one, replacing the old `--values` rule**

In `style.css`, change:
```css
/* Values toggle: plain segment, symmetric with Build/Policy. Sub-view selection (MC | Method)
   lives in the floating estimator pill, not here. */
.toolbar-toggle--values.toolbar-toggle--active {
  background-color: var(--accent-orange);
  color: var(--color-primary-contrast);
}
```
to:
```css
/* Monte Carlo / Iteration: Evaluate redesign Phase 1 replaces the single Values segment with two
   visually-separate scenes. Monte Carlo keeps the prior Values orange; Iteration uses VI's own
   existing teal (ValuesMethodMatrix's known:full accent), turning purpleT (Learning Iteration's
   accent) when P is unknown - matching the handoff's "Iteration ... becomes Learning Iteration,
   purple, when P unknown." Neither button carries .toolbar-toggle--active today (that class is
   reserved for whichever of Build/Policy is the CURRENT top-level mode) - these two are always
   rendered in their "available scene" color regardless of whether Values mode is presently
   active, since (per the design) they're entry points into a goal-card-gated flow, not a
   continuously-updated currently-selected-tab indicator the way Build/Policy's own active state is. */
.toolbar-toggle--mc {
  background-color: color-mix(in srgb, var(--accent-orange) 16%, transparent);
  color: var(--accent-orange);
}

.toolbar-toggle--iteration {
  background-color: color-mix(in srgb, var(--accent-teal) 16%, transparent);
  color: var(--accent-teal);
}

.toolbar-toggle--iteration-unknown {
  background-color: color-mix(in srgb, var(--accent-purpleT) 16%, transparent);
  color: var(--accent-purpleT);
}
```
(Read the actual current file at this location first - if `color-mix()` isn't already used elsewhere in `style.css`, confirm it's an acceptable pattern by checking for existing usage; it already appears at `style.css:125-126` per this codebase's own Policy-mode chip styling, so it's an established technique here, not a new dependency.)

**Note on `.toolbar-toggle--active`:** unlike Build/Policy (whose active state reflects `viewModel.mode`), Monte Carlo/Iteration are rendered as tinted "available scenes" at all times per the above - they do NOT need `.toolbar-toggle--active` toggled by `switchMode`/mode changes, since `switchMode` is no longer how they're entered (see Step 1 above; `enterValuesScene` bypasses `switchMode` entirely). If, after visual verification in Step 3 below, this reads as insufficiently indicating "Values mode is presently active on one of these two," escalate rather than guessing a fix - this is a legitimate design judgment call, not a bug.

- [ ] **Step 3: Verify in browser**

Reload the app fresh. Confirm: the top bar's mode toggle shows four segments, `Build | Policy | Monte Carlo | Iteration`, with Monte Carlo tinted orange and Iteration tinted teal at all times (not just when active). In the console:
```js
canvasViewModel.modelKnown = false;
topBar.refreshModeToggle();
// Confirm visually: Iteration button now reads "Learning Iteration" and is tinted purple.
canvasViewModel.modelKnown = true;
topBar.refreshModeToggle();
// Confirm visually: reverts to "Iteration", teal.
```
No console errors (clicking the new buttons at this point is expected to do nothing yet, since `onEnterValuesScene` isn't wired in `main.js` until Task 4 - that's fine for this task's verification). Check both light and dark theme.

- [ ] **Step 4: Commit**

```bash
git add src/main/view/topBar.js style.css
git commit -m "Split top bar's Values segment into Monte Carlo / Iteration"
```

---

### Task 3: `GoalCard` view — the full-canvas overlay

**Files:**
- Create: `src/main/view/goalCard.js`
- Modify: `style.css` (new `.goal-card*` rules)
- Modify: `index.html` (script tag)

**Interfaces:**
- Consumes: `renderKatex(latex, display)` (existing, `rightPanel.js`), `canvasViewModel.startNode`, `canvasViewModel.goalCardVisible`.
- Produces: `new GoalCard(callbacks, canvasViewModel)`, `goalCard.setup()`, `goalCard.refresh()` (re-renders content/visibility from current viewmodel state - called every draw tick like other floating chrome, or on-demand; decide based on Step 1's actual implementation and document which), `goalCard.show()`/`.hide()`. Callbacks: `onSelectScene(subView)` ('mc' | 'vi'), `onMuted()`.

- [ ] **Step 1: Write `goalCard.js`**

```js
// Full-canvas overlay shown on entering Values mode (unless muted this session) - states what
// the Monte Carlo/Iteration scenes are computing before the user picks one. DOM-based, matching
// this codebase's convention of floating chrome as real HTML elements layered over the canvas
// (see estimatorPill.js/treeViewPill.js), not p5 canvas drawing - needed here for KaTeX's own
// DOM-based rendering (renderKatex(), rightPanel.js) rather than the canvas-rasterizing
// MathRenderer path used elsewhere for in-canvas labels.
class GoalCard {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;
        this.overlayEl = null;
        this.equationEl = null;
    }

    setup() {
        if (this.overlayEl) return;

        const overlay = document.createElement('div');
        overlay.className = 'goal-card-overlay';
        document.body.appendChild(overlay);
        this.overlayEl = overlay;

        const card = document.createElement('div');
        card.className = 'goal-card';
        overlay.appendChild(card);

        const eyebrow = document.createElement('div');
        eyebrow.className = 'goal-card-eyebrow';
        eyebrow.textContent = 'Want to find';
        card.appendChild(eyebrow);

        const equation = document.createElement('div');
        equation.className = 'goal-card-equation';
        card.appendChild(equation);
        this.equationEl = equation;

        const scenes = document.createElement('div');
        scenes.className = 'goal-card-scenes';
        card.appendChild(scenes);

        const mcBtn = this._buildSceneButton('mc', '▶ Monte Carlo', 'sample & average', 'goal-card-scene--mc');
        const viBtn = this._buildSceneButton('vi', '▶ Iteration', 'exact backups', 'goal-card-scene--iteration');
        scenes.appendChild(mcBtn);
        scenes.appendChild(viBtn);

        const compareBtn = document.createElement('button');
        compareBtn.type = 'button';
        compareBtn.className = 'goal-card-compare';
        compareBtn.textContent = '⇄ Compare — watch both converge';
        compareBtn.disabled = true;
        compareBtn.title = 'Coming soon';
        card.appendChild(compareBtn);

        const footer = document.createElement('div');
        footer.className = 'goal-card-footer';
        const muteLink = document.createElement('span');
        muteLink.className = 'goal-card-mute';
        muteLink.textContent = "don't ask again";
        muteLink.title = "Don't show this again";
        muteLink.addEventListener('click', e => {
            e.stopPropagation();
            if (this.callbacks.onMuted) this.callbacks.onMuted();
        });
        footer.appendChild(muteLink);
        card.appendChild(footer);

        // Prevent clicks on the card itself (but not the backdrop) from bubbling to the canvas.
        card.addEventListener('mousedown', e => e.stopPropagation());
        overlay.addEventListener('mousedown', e => e.stopPropagation());

        this.refresh();
    }

    _buildSceneButton(subView, label, sublabel, extraClass) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `goal-card-scene ${extraClass}`;
        const labelEl = document.createElement('div');
        labelEl.className = 'goal-card-scene-label';
        labelEl.textContent = label;
        const subEl = document.createElement('div');
        subEl.className = 'goal-card-scene-sublabel';
        subEl.textContent = sublabel;
        btn.appendChild(labelEl);
        btn.appendChild(subEl);
        btn.addEventListener('click', e => {
            e.stopPropagation();
            if (this.callbacks.onSelectScene) this.callbacks.onSelectScene(subView);
        });
        return btn;
    }

    // Re-renders the equation (start-state name may have changed) and shows/hides the overlay
    // based on canvasViewModel.goalCardVisible. Cheap enough to call on every draw tick like
    // other floating chrome refreshes in this codebase (e.g. estimatorPill.refresh()) - call it
    // from mainView.js's draw() loop, gated so it only actually touches the DOM when the visible
    // state or start-node name has changed since the last call (avoid re-invoking KaTeX every
    // frame for no reason).
    refresh() {
        if (!this.overlayEl) return;

        const startNode = this.viewModel.startNode;
        const startName = startNode ? startNode.name : 'S₀';
        const equationKey = startName;
        if (this._lastEquationKey !== equationKey) {
            this._lastEquationKey = equationKey;
            this.equationEl.innerHTML = renderKatex(
                `V^{\\pi}(${this._latexEscapeName(startName)}) = E[\\,G \\mid S = ${this._latexEscapeName(startName)}\\,]`,
                true
            );
        }

        const visible = !!this.viewModel.goalCardVisible;
        this.overlayEl.style.display = visible ? 'flex' : 'none';
    }

    // Minimal LaTeX-safety for an arbitrary user-chosen node name (matches rightPanel.js's own
    // latexEscapeText() intent, reused here rather than duplicated verbatim since goalCard.js
    // loads after rightPanel.js - see index.html - so the function is already in scope).
    _latexEscapeName(name) {
        return typeof latexEscapeText === 'function' ? latexEscapeText(name) : String(name);
    }
}
```

Read `rightPanel.js`'s actual current `latexEscapeText` definition first to confirm it's a plain top-level `function` (not a class method) before relying on calling it bare as `latexEscapeText(name)` here - if it turns out to be a method on some object instead, adapt `_latexEscapeName` accordingly (e.g. `RightPanel.someStaticHelper(name)`) rather than guessing.

- [ ] **Step 2: Add CSS**

In `style.css`, add (a sensible location is near other floating-chrome rules, e.g. after `.tree-view-pill*` or `.learning-tree-pill*` blocks):
```css

/* ── Goal card (Evaluate redesign Phase 1) ───────────────────────────────── */

.goal-card-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
}

.goal-card {
  width: 420px;
  max-width: 90vw;
  box-sizing: border-box;
  background: var(--surface-card2, var(--bg-card));
  border: 1px solid var(--border-hairline, var(--border-light));
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  padding: 28px 32px;
  text-align: center;
  font-family: var(--font-family);
}

.goal-card-eyebrow {
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-lighter);
  font-weight: 600;
  margin-bottom: 10px;
}

.goal-card-equation {
  font-size: 20px;
  color: var(--text-dark);
  line-height: 1.6;
  margin-bottom: 22px;
}

.goal-card-scenes {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.goal-card-scene {
  flex: 1;
  padding: 14px 10px;
  border-radius: 9px;
  border: 1px solid var(--border-hairline, var(--border-light));
  background: var(--surface-btn);
  font-family: inherit;
  cursor: pointer;
}

.goal-card-scene--mc:hover {
  border-color: var(--accent-orange);
}

.goal-card-scene--iteration:hover {
  border-color: var(--accent-teal);
}

.goal-card-scene-label {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 3px;
}

.goal-card-scene--mc .goal-card-scene-label {
  color: var(--accent-orange);
}

.goal-card-scene--iteration .goal-card-scene-label {
  color: var(--accent-teal);
}

.goal-card-scene-sublabel {
  font-size: 10.5px;
  color: var(--text-lighter);
}

.goal-card-compare {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 14px;
  padding: 9px;
  border-radius: 9px;
  background: transparent;
  border: 1px dashed var(--border-hairline, var(--border-light));
  color: var(--text-lighter);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: not-allowed;
}

.goal-card-footer {
  display: flex;
  justify-content: flex-end;
}

.goal-card-mute {
  font-size: 11px;
  color: var(--text-lighter);
  cursor: pointer;
}

.goal-card-mute:hover {
  color: var(--text-dark);
}
```

- [ ] **Step 3: Register the script tag**

In `index.html`, add `goalCard.js` after `rightPanel.js` (so `renderKatex`/`latexEscapeText` are already defined by the time `goalCard.js`'s own top-level class body is parsed - though since both are only *called* at runtime inside methods, not at parse time, exact ordering relative to `rightPanel.js` is not strictly load-bearing, but keeping it directly after `rightPanel.js` documents the dependency clearly for future readers). Find the line loading `rightPanel.js` and add immediately after it:
```html
    <script src="src/main/view/goalCard.js"></script>
```

- [ ] **Step 4: Verify in browser**

```bash
python3 -m http.server 8010
```
Open the app fresh. In the console:
```js
mainView.goalCard = new GoalCard({
    onSelectScene: (sv) => console.log('selected', sv),
    onMuted: () => console.log('muted')
}, canvasViewModel);
mainView.goalCard.setup();
canvasController.enterValuesScene('mc');   // from Task 1
mainView.goalCard.refresh();
```
Confirm visually: a centered card overlay appears with "Want to find" / the KaTeX-rendered equation (confirm it reads real math, not raw LaTeX source text - if it shows literal backslashes, KaTeX failed to render and something needs investigating before proceeding), two scene buttons (Monte Carlo orange-tinted hover, Iteration teal-tinted hover), a disabled/greyed Compare button, and a "don't ask again" link bottom-right. Click "▶ Monte Carlo" - confirm the console logs `selected mc`. Click "don't ask again" - confirm it logs `muted`. Build a graph, set a start node with a real name (not the default), re-run `mainView.goalCard.refresh()` - confirm the equation updates to use that name. Check both light and dark theme. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/view/goalCard.js style.css index.html
git commit -m "Add GoalCard: full-canvas Evaluate-entry overlay"
```

---

### Task 4: Wire it all together in `main.js`

**Files:**
- Modify: `src/main/app/main.js`

**Interfaces:**
- Consumes: `GoalCard` (Task 3), `canvasController.enterValuesScene`/`dismissGoalCard`/`muteGoalCard`/`showGoalCardIfNotMuted` (Task 1), `topBar.refreshModeToggle` (Task 2).
- Produces: `mainView.goalCard` (real instance, replacing Task 3's console stand-in), goal card refreshed every draw tick, wired into the existing Reset flows for both Monte Carlo and Iteration.

- [ ] **Step 1: Construct `GoalCard` and wire its callbacks**

In `src/main/app/main.js`, find where other floating chrome (e.g. `treeViewPill`, `estimatorPill`) is constructed in `setup()` and add:
```js
    mainView.goalCard = new GoalCard({
        onSelectScene: (subView) => {
            canvasController.enterValuesScene(subView);
            // enterValuesScene may re-show the card (goalCardMuted still false) - but the user
            // just explicitly chose a scene from the card itself, so dismiss it regardless of the
            // mute flag; only an actual future re-entry (toolbar click, Reset) should re-trigger it.
            canvasController.dismissGoalCard();
            if (topBar) topBar.refreshValuesSubView(subView);
            if (estimatorPill) estimatorPill.refresh();
            redraw();
        },
        onMuted: () => {
            canvasController.muteGoalCard();
            redraw();
        }
    }, canvasViewModel);
    mainView.goalCard.setup();
```
Read the actual current `setup()` structure first to place this in a sensible spot alongside the other floating-chrome construction (order relative to other pills does not matter functionally, since the goal card is a highest-`z-index` full-screen overlay, not a positioned pill needing `updateBounds()`).

- [ ] **Step 2: Wire the top bar's new callback**

Find `topBar = new TopBar({ ... })`'s callback object (the one already passing `onModeChange`, `onPlay`, etc.) and add:
```js
        onEnterValuesScene: (subView) => {
            canvasController.enterValuesScene(subView);
            if (topBar) topBar.refreshValuesSubView(subView);
            if (estimatorPill) estimatorPill.refresh();
            redraw();
        },
```

- [ ] **Step 3: Refresh the goal card every draw tick**

In `mainView.js`'s `draw()` (or wherever other floating chrome refreshes each frame - check whether `estimatorPill.refresh()` is called every draw tick or only on-demand from specific callbacks first, and match whichever convention is actually used, since the plan's Task 3 left this decision open), add a call to `mainView.goalCard.refresh()`. If existing floating chrome is refreshed on-demand only (not every frame), prefer that same on-demand approach here instead - call `mainView.goalCard.refresh()` from every place that already calls `canvasController.enterValuesScene`/`dismissGoalCard`/`muteGoalCard` (Steps 1-2 above, plus Step 4 below) rather than adding a new per-frame call. Pick whichever matches this codebase's existing convention and document which you picked in your commit message.

- [ ] **Step 4: Re-show the goal card on Reset (unless muted), for both Monte Carlo and Iteration**

In `onVIReset` (`src/main/app/main.js`), after the existing body, add a call to re-show the card - but only when Reset is meaningfully "starting over" (i.e., not the Learning-Iteration-specific early-return branch, which is a fundamentally different reset path). Read the current function first:
```js
const onVIReset = () => {
    if (_isLearningIterationActive()) {
        canvasController.resetQLearning();
        ensureQLRoot();
        _afterQLChange();
        return;
    }
    if (!viResetInteractor) return;
    viResetInteractor.execute(new VIResetInputData());
    refreshVIButtons();
};
```
Change the non-early-return branch to also re-show the card:
```js
const onVIReset = () => {
    if (_isLearningIterationActive()) {
        canvasController.resetQLearning();
        ensureQLRoot();
        _afterQLChange();
        canvasController.showGoalCardIfNotMuted();
        if (mainView && mainView.goalCard) mainView.goalCard.refresh();
        return;
    }
    if (!viResetInteractor) return;
    viResetInteractor.execute(new VIResetInputData());
    refreshVIButtons();
    canvasController.showGoalCardIfNotMuted();
    if (mainView && mainView.goalCard) mainView.goalCard.refresh();
};
```
(Both branches get it - Reset re-shows the card regardless of which VI-quadrant reset path fired, matching the handoff's "Reset ... re-shows the goal card unless muted" with no quadrant carve-out.)

And in `topBar.callbacks.onExpectationReset` (also in `main.js`):
```js
        topBar.callbacks.onExpectationReset = () => {
            _runExpectationBatch();
            if (mainView && mainView.chartDock) mainView.chartDock.refresh();
            rightPanel.updateContent();
            redraw();
        };
```
change to:
```js
        topBar.callbacks.onExpectationReset = () => {
            _runExpectationBatch();
            if (mainView && mainView.chartDock) mainView.chartDock.refresh();
            rightPanel.updateContent();
            canvasController.showGoalCardIfNotMuted();
            if (mainView && mainView.goalCard) mainView.goalCard.refresh();
            redraw();
        };
```

- [ ] **Step 5: Wire `onModelKnownToggle` to refresh the top bar's Iteration label**

In `onModelKnownToggle` (`src/main/app/main.js`), after the existing `if (topBar) topBar.refreshParameters();` line, add:
```js
    if (topBar) topBar.refreshModeToggle();
```

- [ ] **Step 6: Verify in browser**

Reload the app fresh (so all real `main.js` wiring is in effect). Build a small graph, set a named start node (not the default). Click the top bar's **Monte Carlo** segment - confirm: mode switches to Values, sub-view to `mc`, and the goal card appears with the correct equation. Click **▶ Monte Carlo** on the card - confirm it dismisses and the normal Monte Carlo sub-view is now interactive (idle, not auto-run). Click **Reset** (Monte Carlo's own Reset button) - confirm the goal card re-appears. Click the card's "don't ask again" - confirm it dismisses; click **Reset** again - confirm the card does NOT reappear this time. Reload the page (clears the session mute) and repeat the same flow for **Iteration**/VI's Reset button - confirm equivalent behavior. Toggle P known/unknown via the Parameters popover while NOT in Values mode - confirm the top bar's Iteration segment's label/color updates immediately (per Task 2's Step 3, already verified there via direct state manipulation; this step re-confirms it fires from the REAL toggle UI, not just direct state assignment). Check both light and dark theme. No console errors anywhere in this pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/app/main.js
git commit -m "Wire GoalCard into Monte Carlo/Iteration entry and Reset flows"
```

---

### Task 5: Final integration pass, CLAUDE.md

**Files:** none new; verification-only, touching no source files unless a regression is found (fix it in the file where the bug lives, note the fix in the commit message).

- [ ] **Step 1: Full regression pass**

Run through: Build mode (confirm nothing changed - Renormalize, Run/Step/Reset, tool palette, tree pill all unaffected) → Policy mode (same check) → click Monte Carlo from the top bar → goal card → dismiss into MC → run some episodes → Reset → confirm card reappears → dismiss → switch to Iteration via the top bar (not the estimator pill) → confirm goal card appears again for Iteration → dismiss → run VI → Reset → confirm card reappears → toggle P unknown via Parameters, confirm the Iteration button in the top bar (visible even while still IN Values mode, since Build/Policy/Monte Carlo/Iteration are all shown at all times per the mode-toggle track) relabels to "Learning Iteration"/purple correctly → switch to Values mode via the OLD path too if anything still exists (there shouldn't be an old path left, confirm the previous single `Values` button is completely gone, not just hidden) → confirm the estimator pill's own MC/Method switch (unaffected, Task 1's design constraint) still works for changing sub-view without re-showing the goal card (since that's a DIFFERENT entry path than `enterValuesScene`) → switch to Values mode via `canvasController.setMode('values')` directly in the console (simulating some other future caller that bypasses `enterValuesScene`) and confirm this does NOT show the goal card (only `enterValuesScene`/Reset do - direct `setMode` calls are intentionally not gated, matching Task 1's design). Confirm a `test_schema/*.json` import/export round-trip does not include `goalCardVisible`/`goalCardMuted` in the exported JSON:
```js
canvasController.importGraph(/* contents of a test_schema/*.json fixture */);
const json = canvasController.exportGraph(true);
/goalCardVisible|goalCardMuted/i.test(json)   // false
```
No console errors throughout. Both light and dark theme.

- [ ] **Step 2: Update `CLAUDE.md`**

Add a short bullet to `CLAUDE.md`'s View Layer file listing (immediately after the existing `estimatorPill.js` bullet, matching the documentation convention every other floating-chrome component in this file already follows):
```markdown
   - `goalCard.js`: Full-canvas overlay shown on entering Values mode via the top bar's Monte Carlo/Iteration segments (or via Reset, in either sub-view) unless muted for the session — states `V^π(S₀) = E[G | S=S₀]` before the user picks a scene. Presentation-only (`goalCardVisible`, `goalCardMuted` on `CanvasViewModel`); does not change the underlying `mode`/`valuesSubView` model, only gates a new entry path onto it (`CanvasController.enterValuesScene`). The Compare link is a disabled stub (a later phase).
```
Also update the Mode Toggle mention in `topBar.js`'s own CLAUDE.md bullet (search for "Build | Policy | Values" in this file) to read `Build | Policy | Monte Carlo | Iteration`, and note that Monte Carlo/Iteration are rendering-only entry points onto the same `mode==='values'` state Build/Policy's own mode toggle already uses.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document GoalCard and the Monte Carlo/Iteration toolbar split in CLAUDE.md"
```

(If Step 1 surfaced any regression requiring a code fix, that fix should already be committed separately, before this documentation commit, with its own descriptive message.)

---

## Self-Review Notes

- **Spec coverage:** design doc's "Key architecture decision" → Task 1 (no mode-model change, `enterValuesScene` composes existing calls) + Task 2 (toolbar renders 4 segments without introducing a 4th `mode` value); "Goal card" section → Tasks 3-4 (content, dismissal, mute, Reset re-trigger, no auto-run, disabled Compare stub); "Non-goals" → explicitly not touched anywhere in this plan (no `ValuesMethodMatrix` changes, no Compare wiring, no persistence).
- **Placeholder scan:** no TBD/TODO. Task 2/Step 1 and Task 4/Step 3 each contain one explicit "read the actual current file first, confirm X, adapt if needed" instruction rather than a placeholder - these are deliberate adaptation points (this codebase's `topBar.js`/`main.js` are large, actively-evolving files touched by many prior plans in this same repo; the exact current property name for the viewmodel reference or the exact per-frame-vs-on-demand refresh convention could not be verified with full certainty from outside a live read at plan-writing time), not missing design decisions - the plan states the fallback/verification approach for each.
- **Type/name consistency:** `enterValuesScene(subView)` / `dismissGoalCard()` / `muteGoalCard()` / `showGoalCardIfNotMuted()` (Task 1) are called by identical names in Tasks 2 (topBar callback), 3 (verification only, not called directly), and 4 (main.js wiring). `GoalCard`'s constructor signature `(callbacks, canvasViewModel)` and its `onSelectScene`/`onMuted` callback names (Task 3) are used identically in Task 4's real wiring. `topBar.refreshModeToggle()` (Task 2) is called by that exact name from Task 4/Step 5.
