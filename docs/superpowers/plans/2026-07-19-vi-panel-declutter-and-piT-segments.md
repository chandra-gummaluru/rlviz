# Method Panel Declutter + π_t Segmented-Button Selector — Implementation Plan

Follow-up to the Phase 4/6 work in `docs/superpowers/evaluate-redesign-phase-4-and-6.md`. Two
independent UI changes to the right panel, decided via clarifying questions in-session (no new
design doc — small enough to plan directly):

1. **π_t's per-state action selector** (Policy π section, π_t mode) should visually match
   Stationary's segmented-button row instead of today's single click-to-cycle text, plus a
   "Random" segment (π_t supports the `'random'` sentinel per timestep; Stationary handles Random
   via a separate toggle instead, so it needs its own segment here).
2. **The Values → Iteration Method panel** (`known:full`/`known:partial`/`unknown:partial`) is
   decluttered to just: title header with a right-aligned ε-convergence stop-condition badge →
   Parameters (γ, ε) → Initial State → Iteration → Convergence → Policy log. Removed: the Bellman/
   update-equation KaTeX block, the partial-quadrants' "Belief Update"/"PO Q-Learning Update"
   equation subheader, and the "Action Values" Q-table section (that detail already lives in the
   canvas's Equation/Chart views post the screen-split redesign).

## Decisions resolved in-session

- π_t segmented buttons include a **Random** segment (not concrete-actions-only) — confirmed.
- "Right aligned" refers to the **Method panel's title header row**: the ε-convergence stop
  condition (Δ vs ε), rendered as compact inline LaTeX, sits right-aligned on the same line as the
  panel title (e.g. "Value Iteration"), not below it — confirmed, this is unrelated to the π_t
  selector.
- Declutter scope is **all three real-Bellman quadrants** (`known:full`, `known:partial`,
  `unknown:partial`). `unknown:full` (Learning Iteration) is untouched — separate subsystem with
  its own title/table inside `_renderLearningIterationPanel`.
- The Policy log section stays (confirmed: "include the policy as well").
- The Explain-popover branch (`_renderExplanationPanel`, entered when a backup-diagram card's
  "Explain" popover is open) keeps its own "Action Values" table — it's a distinct feature that
  needs the table to highlight which cell is being explained, not the default Method panel view
  this declutter targets.

## Files touched

1. `src/main/domain/simulationState.js`
2. `src/main/adapter/controller/CanvasController.js`
3. `src/main/view/rightPanel.js`
4. `style.css`

No `index.html` changes (no new files).

## Step 1 — `simulationState.js`: direct π_t set method

Add `setTimeDependentAction(stateId, t, value)` right before `getTimeDependentAction()` (near
`:558`). Unlike `cycleTimeDependentAction`, this sets a specific value directly (concrete
`actionId` or the `'random'` sentinel) — needed because segmented buttons pick a specific value on
click, they don't cycle:

```js
setTimeDependentAction(stateId, t, value) {
    if (!this.timeDependentPolicy[stateId]) {
        this.timeDependentPolicy[stateId] = Array(this.piHorizon).fill('random');
    }
    const seq = this.timeDependentPolicy[stateId];
    const idx = Math.max(0, Math.min(seq.length - 1, t));
    seq[idx] = value;
}
```

`cycleTimeDependentAction` stays (no longer called from the panel after Step 3, but harmless to
leave — not part of this plan's removal scope).

## Step 2 — `CanvasController.js`: passthrough

Add next to `cycleTimeDependentAction` (`:686-688`):

```js
setTimeDependentAction(stateId, t, value) {
    this.viewModel.simulationState.setTimeDependentAction(stateId, t, value);
}
```

## Step 3 — `rightPanel.js`: π_t segmented-button selector

New method `_renderPiTActionSegments(row, stateNode, actions, currentAction, t)`, modeled on
`_renderPolicyActionSegments` (`:235-253`) with one addition — a trailing "Random" segment:

```js
_renderPiTActionSegments(row, stateNode, actions, currentAction, t) {
    const segRow = createDiv();
    segRow.parent(row);
    segRow.addClass('policy-segmented-row');

    actions.forEach(actionId => {
        const actionNode = this.viewModel.graph.nodes.find(n => n.type === 'action' && n.id === actionId);
        if (!actionNode) return;
        const btn = createButton(actionNode.name);
        btn.parent(segRow);
        btn.addClass('policy-segmented-btn');
        if (Number(currentAction) === Number(actionId)) btn.addClass('policy-segmented-btn--active');
        btn.mousePressed(() => {
            this.controller.setTimeDependentAction(stateNode.id, t, actionId);
            this.updateContent();
            redraw();
        });
    });

    const randomBtn = createButton('Random');
    randomBtn.parent(segRow);
    randomBtn.addClass('policy-segmented-btn');
    if (currentAction === 'random' || currentAction === null) randomBtn.addClass('policy-segmented-btn--active');
    randomBtn.mousePressed(() => {
        this.controller.setTimeDependentAction(stateNode.id, t, 'random');
        this.updateContent();
        redraw();
    });
}
```

In `_renderTimeDependentPolicySection`'s per-state loop (`:519-550`), replace the
`.policy-pit-action-display` block with a call to the new method:

```js
const current = simulationState.getTimeDependentAction(stateNode.id, cursor);
this._renderPiTActionSegments(row, stateNode, actions, current, cursor);
```

(Drops the old `actionNode`/`display` lookup entirely — segmented buttons render their own
per-action labels directly, no need to resolve "current" to a display string first.)

Update the trailing hint (`:552-556`) from "click a state's action to cycle it at this timestep"
to "click an action to set it at this timestep · gold segments differ from t=0".

## Step 4 — `rightPanel.js`: `renderValueIterationPanel()` restructure

Current order (`:943-1104`): Parameters → Initial State → [unknown:full early-return] →
[explanation early-return] → title → equation-subheader (partial only) → equation → untitled
safety-cap/iteration text → Convergence section → "Action Values" title + Q-table → Policy log.

New order: **title+status header** → Parameters → Initial State → [unknown:full early-return] →
[explanation early-return, unchanged] → **Iteration section** → Convergence section (unchanged
content) → Policy log. Equation block, equation subheader, and Action Values table removed.

4a. Compute `matrixEntry`/`matrixKey` at the top of the function (currently computed at `:997-999`,
after the early-return branches) — move up next to `liKey` (`:951`) so the header can use them
before Parameters renders:

```js
const observability = this.viewModel.observability;
const matrixEntry = ValuesMethodMatrix.resolve(modelKnown, observability);
const matrixKey = ValuesMethodMatrix.key(modelKnown, observability);
```

Remove the old `:997-999` computation (now redundant).

4b. Insert a new header call right before the existing `Parameters` `createSection` (`:957`), gated
to the three real-Bellman quadrants (Learning Iteration renders its own title inside
`_renderLearningIterationPanel`, untouched):

```js
if (liKey !== 'unknown:full') this._renderMethodPanelHeader(matrixEntry, viState);
```

New method:

```js
// Header row for the three real-Bellman quadrants: title top-left, and the ε-convergence stop
// condition (Δ vs ε) as compact inline LaTeX, right-aligned on the same line. Replaces the old
// separate title/equation/Action-Values blocks - that detail now lives in the canvas's
// Equation/Chart views instead of being duplicated here.
_renderMethodPanelHeader(matrixEntry, viState) {
    const headerRow = createDiv();
    headerRow.parent(this.contentContainer);
    headerRow.addClass('panel-title-row');

    const title = createDiv(matrixEntry.title);
    title.parent(headerRow);
    title.addClass('panel-title');

    if (!viState || !viState.initialized) return;

    const status = createDiv();
    status.parent(headerRow);
    status.addClass('panel-title-row-status');

    const delta = viState.getDelta(viState.currentSweepIndex);
    if (viState.converged) {
        status.elt.innerHTML = renderKatex('\\Delta < \\epsilon');
        status.style('color', 'var(--reward-positive)');
    } else if (delta === null) {
        status.elt.innerHTML = renderKatex('k = 0');
    } else {
        status.elt.innerHTML = renderKatex('\\Delta \\geq \\epsilon');
        status.style('color', 'var(--accent-yellow)');
    }
}
```

4c. Delete the old title/equation-subheader/equation block (`:1001-1027`) — superseded by 4b.

4d. Replace the untitled safety-cap/iteration `paramsDiv` (`:1029-1043`) with a named "Iteration"
section:

```js
if (viState && viState.initialized) {
    this.createSection('Iteration', () => {
        const iterDiv = createDiv();
        iterDiv.parent(this.contentContainer);
        iterDiv.addClass('panel-section-content');

        const capLine = createDiv(`<strong>Safety cap:</strong> stop after ${viState.T} iterations if not converged`);
        capLine.parent(iterDiv);
        capLine.style('margin-bottom', '4px');

        const progressLine = createDiv(`<strong>Iteration:</strong> ${viState.currentSweepIndex}`);
        progressLine.parent(iterDiv);
        progressLine.style('margin-bottom', '4px');
    });
}
```

4e. Convergence section (`:1048-1078`) — leave content/logic exactly as-is, just now follows the
new Iteration section instead of following the removed equation block directly.

4f. Delete the "Action Values" title + Q-table block (`:1080-1101`), including the
`!viState.initialized` "Press Play, Step, or Skip to compute Q-values." hint — the canvas's own
pre-init placeholder already covers this (Phase 4).

4g. `_renderPolicyLog()` call (`:1103`) stays, unchanged, at the end.

**Untouched:** `unknown:full` branch (`_renderLearningIterationPanel`, `:969-973`) and the
explanation-mode branch (`:976-990`, including its own "Action Values" table) — both keep their
current content exactly as today.

## Step 5 — `style.css`

Add near `.panel-title` (`:635-644`):

```css
.panel-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 15px;
}

.panel-title-row .panel-title {
  margin-bottom: 0;
}

.panel-title-row-status {
  font-size: 14px;
  white-space: nowrap;
}
```

Remove the now-dead `.policy-pit-action-display` rule (`:1205-1209`) — no longer referenced after
Step 3.

## Verification

Run the app locally (`python3 -m http.server 8000`), open `test_schema/ROB311NoIMG.json`:

1. **π_t selector**: Policy mode → Policy π → toggle to π_t. Confirm each multi-action state's row
   now shows a segmented button row (one button per action + a trailing "Random" button, visually
   identical styling to Stationary's Deterministic segments) instead of the old single clickable
   text. Click each segment; confirm it sets that exact value at the pager's current t (no
   cycling), the active segment highlights correctly, and the differs-from-t0 strip above still
   reacts correctly. Confirm Random selection round-trips (select Random, move pager, come back —
   still shows Random active).
2. **Method panel header**: for each of `known:full`, `known:partial`, `unknown:partial` — confirm
   the title renders top-left with the Δ-vs-ε status right-aligned on the same row, reads `k = 0`
   before any iterations, updates to `Δ ≥ ε` (yellow) mid-run, and `Δ < ε` (green) on convergence.
   Confirm no equation block or "Action Values" table renders anywhere in the default panel view.
3. **Section order**: confirm the panel reads top-to-bottom as Header → Parameters (γ, ε) →
   Initial State → Iteration (safety cap + current iteration) → Convergence → Policy log, with no
   leftover empty gaps where the equation/table used to be.
4. Confirm `unknown:full` (Learning Iteration) is completely unaffected — its own title, algorithm
   toggle, and "Learned Q-values" table render exactly as before.
5. Confirm the Explain popover (`known:full`, click Explain on a backup diagram card) still shows
   its own "Action Values" table unchanged.
6. Repeat 1-3 in dark theme; check contrast on the new header row and segmented buttons.
7. Check the browser console for errors throughout.

No automated test suite exists for this repo — this manual pass is the verification bar.
