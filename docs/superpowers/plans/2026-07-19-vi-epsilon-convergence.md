# Evaluate Redesign, Phase 4: ε Convergence Stop Condition — Implementation Plan

Design doc: `docs/superpowers/specs/2026-07-19-vi-epsilon-convergence-design.md`. Read that first —
this plan assumes its line-number citations and design decisions (epsilon read once at VI-init
time, same as γ; T reframed as "safety cap" copy, not removed).

## Files touched

1. `src/main/view/rightPanel.js`
2. `src/main/app/main.js`
3. `src/main/view/viSweepChip.js`
4. `src/main/view/topBar.js`
5. `src/main/view/valueIterationView.js`
6. `src/main/view/viEquationView.js`

No domain-layer (`src/main/domain/`), interactor, or `index.html` changes — `RunVIInputData`/
`RunVIInteractor`/`ValueIterationState` already fully support epsilon end-to-end; this phase only
exposes it in the UI and reframes existing copy.

## Step 1 — `rightPanel.js`: epsilon slider

Add `this.viEpsilon = 0.01;` near the existing `this.discountFactor = RP_DEFAULT_DISCOUNT;`
(`:51`) field declaration.

Add a new method `_renderEpsilonSlider(parentDiv)`, copy-pasted structure from
`_renderGammaSlider()` (`:1141-1185`) with these substitutions:
- label text `'ε'` instead of `'γ'`
- `min='0.001' max='0.5' step='0.001'`
- backing field `this.viEpsilon` instead of `this.discountFactor`
- value display `this.viEpsilon.toFixed(3)` (3 decimals — `step=0.001` needs it, unlike γ's
  `toFixed(2)` at `step=0.01`)
- no `--gamma` modifier class — plain `.panel-param-row-slider` (default accent; no new CSS needed)
- same `change` handler pattern: `this.updateContent(); if (typeof redraw === 'function')
  redraw();`

Call `this._renderEpsilonSlider(paramsDiv)` directly after the existing
`this._renderGammaSlider(paramsDiv)` call at whichever of the three call sites (`:169, 259, 775`)
corresponds to the Method panel's real-VI-quadrant branch — confirm by reading the surrounding
`if (matrixKey === ...)` branching at each site; only add it where `known:full`/`known:partial`/
`unknown:partial`'s Method panel renders (the same branch `_renderGammaSlider` is already scoped
to at that call site), not to Build/Policy's or Monte Carlo's own gamma call sites.

Update the two copy sites:
- `:849-857` (Parameters block): replace the two lines with:
  ```js
  const capLine = createDiv(`<strong>Safety cap:</strong> stop after ${viState.T} iterations if not converged`);
  capLine.parent(paramsDiv);
  capLine.style('margin-bottom', '4px');

  const progressLine = createDiv(`<strong>Iteration:</strong> ${viState.currentSweepIndex}`);
  progressLine.parent(paramsDiv);
  progressLine.style('margin-bottom', '4px');
  ```
- `:868-872` (`perQuadrant` map inside the Convergence section): change to
  ```js
  const perQuadrant = {
      'known:partial':   'belief update',
      'unknown:partial': 'α = 0.1 · belief memory'
  };
  const line1Text = perQuadrant[matrixKey];
  if (line1Text) {
      const line1 = createDiv(line1Text);
      line1.parent(convDiv);
      line1.style('margin-bottom', '4px');
  }
  ```
  (`known:full` now renders no line1 at all — confirm this doesn't leave a visually empty gap;
  if it does, drop the surrounding `if` and just skip appending `line1` for that one key instead of
  conditionally creating it, same visual result either way.)
- `:1822` — `` `Explain: ${detail.stateName} at k=${detail.timestep}` `` (was `at sweep
  ${detail.timestep}`).

## Step 2 — `main.js`: wire epsilon into `ensureVIInitialized()`

`:818-823`:
```js
const ensureVIInitialized = () => {
    if (valueIterationState.initialized) return;
    const T = topBar ? topBar.getVIT() : 8;
    const gamma = rightPanel ? rightPanel.discountFactor : 0.9;
    const epsilon = rightPanel ? rightPanel.viEpsilon : 0.01;
    runVIInteractor.execute(new RunVIInputData(T, gamma, epsilon));
};
```

## Step 3 — `viSweepChip.js`: reframe `refresh()`

`:46-73`, replace the body text assignments only (bounds/layout/class-toggle logic unchanged):
```js
refresh() {
    if (!this.textEl || !this.containerEl) return;
    const vi = this.viewModel.valueIterationState;
    this.containerEl.classList.remove('vi-sweep-chip--converged', 'vi-sweep-chip--unconverged');

    if (!vi || !vi.initialized) {
        this.textEl.textContent = 'press Run to start';
        return;
    }

    const k = vi.currentSweepIndex;

    if (vi.converged) {
        this.textEl.textContent = `✓ Δ < ${vi.epsilon.toFixed(3)}`;
        this.containerEl.classList.add('vi-sweep-chip--converged');
        return;
    }

    if (k === 0) {
        this.textEl.textContent = 'k=0 · π = init';
        return;
    }

    const d = vi.getDelta(k);
    this.textEl.textContent = `Δ = ${(d ?? 0).toFixed(4)} vs ε = ${vi.epsilon.toFixed(3)}`;
    this.containerEl.classList.add('vi-sweep-chip--unconverged');
}
```
Update the file's top comment block (`:1-7`) to match the new copy instead of describing the old
`sweep k / T` strings.

## Step 4 — `topBar.js`: T-input tooltip

`:607`: `'Safety cap — Iteration stops here even if it has not converged'` (was `'Max sweeps before
giving up'`).

## Step 5 — `valueIterationView.js`: pre-init placeholder

`:198`: `'Set ε (convergence threshold) and click Run to start Value Iteration'` (was `'Set max
sweeps (T) and click Run to start Value Iteration'`).

## Step 6 — `viEquationView.js`: reveal caption

`:371`: `'t = k−1 (prior iteration)'` (was `'t = k−1 (prior sweep)'`).

## Verification

Run the app locally (`python3 -m http.server 8000`), open `test_schema/ROB311NoIMG.json` (or any
fixture), and for **each** of `known:full`, `known:partial`, `unknown:partial` (toggle via the
Parameters popover's P known/unknown × Full/Partial observability axes):

1. Enter Values → Iteration. Confirm the pre-init canvas placeholder reads the new ε copy, not
   "max sweeps."
2. Open the Method panel's Parameters section — confirm both γ and the new ε slider render, ε
   defaults to `0.010`, dragging it updates the live value display and `--fill`.
3. Click Run/Play. Confirm:
   - `viSweepChip.js`'s floating chip shows `k=0 · π = init` at the very start, then `Δ = ... vs ε
     = ...` while unconverged, then `✓ Δ < ...` once converged — no literal word "sweep" anywhere.
   - The right panel's Parameters block shows "Safety cap: stop after N iterations if not
     converged" and a live "Iteration: k" line.
   - The Convergence section's copy reads correctly per quadrant (no line1 for `known:full`,
     "belief update" for `known:partial`, "α = 0.1 · belief memory" for `unknown:partial`), and its
     Δ-vs-ε line still turns green with a ✓ on convergence exactly as before.
4. Set ε to a much larger value (e.g. `0.4`) via the slider, click Reset, click Run again — confirm
   the run now converges in fewer iterations (or immediately) and the chip/Convergence section
   reflect the new ε, confirming the value is actually threaded through `RunVIInputData` and not
   stuck at the old default.
5. Click into a per-state backup card's "Explain" popover (known:full only) — confirm its header
   reads "Explain: `<state>` at k=N", not "at sweep N".
6. Repeat steps 1–3 in dark theme; confirm no contrast/visibility regressions on the new slider row
   or reframed copy.
7. Confirm `unknown:full` (Learning Iteration) is completely unaffected — no ε slider, no changed
   copy, Play/Step/Reset behave exactly as before (per the design doc's Non-goals).
8. Check the browser console for errors throughout.

Since there's no automated test suite for this repo (per `CLAUDE.md`), this manual pass is the
verification bar — no unit tests to add.
