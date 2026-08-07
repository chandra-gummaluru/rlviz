# Evaluate Redesign, Phase 4: ε Convergence Stop Condition — Design

## Context

Phase 4 of the 7-phase Evaluate redesign roadmap (see `docs/superpowers/specs/2026-07-16-evaluate-goal-card-design.md` for the roadmap recap). Previously tracked only as a one-line bullet in
`docs/superpowers/evaluate-redesign-phase-4-and-6.md` ("ε convergence stop condition for
Iteration, replacing 'sweep' language") with a note that "no further design detail exists yet."

That note was wrong — the real design exists, just not inside this repo's own `docs/`. The
original external handoff at `~/Downloads/handoff/` (`Handoff - Evaluate Updates.dc.html`, §5,
plus the interactive prototype `RLViz Evaluate Prototype.dc.html`) has the actual spec and working
reference math. This document folds that handoff content together with a direct read of the
current codebase (`valueIterationState.js`, `viSweepChip.js`, `rightPanel.js`, `topBar.js`,
`chartDock.js`, `valueIterationView.js`) so the plan can cite real line numbers instead of
re-deriving anything.

## Handoff spec (verbatim reference, §5 of `Handoff - Evaluate Updates.dc.html`)

> Chip at the top of the Iteration panel: **Stop condition: convergence** · `‖V_t+1 − V_t‖ < ε` ·
> live Δ, green ✓ once met. No "sweep" language anywhere in the UI.
>
> **ε is a parameter** in the right-panel Parameters section (slider 0.001–0.5, default 0.01),
> shown only in Iteration. Every convergence readout (chip, header, inspector note) reads this ε.

The companion prototype's JS (`_sweeps()`/`_polV()` plus the `eEps` slider) confirms the numeric
range (`min=0.001 max=0.5 step=0.001`, default `0.01`) and the max-norm delta formula
(`Math.max(...nv.map((v,i) => Math.abs(v - prev[i])))`) — this is exactly what
`ValueIterationState.computeNextSweep()` already computes (see below), so no new math is needed,
only exposing what's already there.

**One honest gap in the prototype, noted so it isn't copied by accident:** the prototype's own
Run/Step loop still advances by a fixed horizon slider (`eT`, 1–20) and never actually halts early
on convergence — the ε chip there is a readout layered on top of a still-bounded loop, not a real
stopping condition. Our actual codebase is *already ahead* of the prototype here (see next
section) — `VIAnimator.continuousPlay()` already stops at convergence for real. This phase does
not need to (and must not) regress that to match the prototype's simplified behavior.

## Current codebase state (already built, verified by direct read)

`src/main/domain/valueIterationState.js` already has essentially the entire domain-layer half of
this feature:

- `epsilon` field (`:18`, default `0.01`), `converged`/`convergedAtSweep` (`:31-32`, sticky — once
  latched by `delta < epsilon`, `:166-169`, never un-latches on later floating-point noise).
- `computeNextSweep()` (`:92-172`) computes the max-norm delta every sweep (`:154-159`) — the exact
  same formula the handoff prototype uses.
- `canAdvance()` (`:179-181`): `T` is explicitly documented as "MAX SWEEPS CAP... not an exact
  horizon" — already a safety net, not a target count.
- `getButtonEnablement()` (`:191-196`): Play already stops once `converged` (`canPlay = ... &&
  !this.converged`); Step/Skip are deliberately *not* gated by convergence (`:183-189`'s own
  comment: "stepping past convergence just re-confirms the fixed point").
- `VIAnimator.continuousPlay()` (`viAnimator.js:87-111`) already auto-stops "at the T cap OR at
  convergence."

**What's actually missing** — confirmed by grep, not assumed:

1. **Epsilon is not user-configurable anywhere.** `RunVIInputData` (`runVIInputData.js:3-6`)
   already accepts an `epsilon` param (`default 0.01`), but `main.js:818-823`'s
   `ensureVIInitialized()` calls `new RunVIInputData(T, gamma)` — epsilon is never passed, so it's
   silently always `0.01`. There is no epsilon slider/input anywhere in the UI.
2. **"Sweep" language is pervasive**, contra the handoff's "no sweep language anywhere in the UI":
   - `viSweepChip.js:52,66,71` — "press Run to start" (fine) but `sweep 0 / ${T} · π = init` and
     `sweep ${k} / ${T} · Δ = ...` for the two non-converged states.
   - `rightPanel.js:850` — `<strong>Max sweeps (T):</strong> ${viState.T}`.
   - `rightPanel.js:854` — `<strong>Sweep:</strong> ${k} / ${T}`.
   - `rightPanel.js:869-870` — Convergence section's per-quadrant copy: `max ${T} sweeps` /
     `belief update · max ${T} sweeps`.
   - `rightPanel.js:1822` — the backup-diagram/equation "Explain" header: `` `Explain:
     ${detail.stateName} at sweep ${detail.timestep}` ``.
   - `topBar.js:607` — the `T =` input's tooltip: `'Max sweeps before giving up'`.
   - `valueIterationView.js:198` — pre-init canvas placeholder: `'Set max sweeps (T) and click Run
     to start Value Iteration'`.
   - `viEquationView.js:371` — reveal-diagram caption: `'t = k−1 (prior sweep)'`.
   - `chartDock.js` (`sweephistory` slot type, `:10,18,186,195`) — **left alone, out of scope**:
     per CLAUDE.md, `ChartDock` no longer appears at all for the three real-VI quadrants since
     Phase 3b shipped (only Learning Iteration/`unknown:full` still uses it, and LI has no sweeps —
     it's episodic Q-learning). This slot type appears to already be unreachable dead UI in the
     current routing; touching it is unrelated scope creep for this phase.
   - **Left alone, deliberately**: Q-table column headers (`rightPanel.js:1534`, `` `k=${colIdx}`
     ``) and the code comment/variable names (`sweepIndex`, `currentSweepIndex`, `totalSweeps`,
     `hoveredSweepIndex`, `pinnedSweepIndex`, ...). The handoff's complaint is about the *word*
     "sweep" as user-facing copy; `k=0`, `k=1`, ... is standard Bellman-iteration notation (matches
     the `V^k(s)` equation already rendered above the table) and isn't "sweep language" in the
     sense the spec means. Internal variable/method names are implementation detail, not UI text —
     renaming them is unrelated churn for zero user-visible benefit.

## Design decisions

### 1. Epsilon slider: same pattern as γ, same precedent for "changes don't retroact"

Add an ε slider to the Method panel's Parameters section (`rightPanel.js`), directly below the
existing γ slider, using the exact same row markup/fill-pattern as `_renderGammaSlider()`
(`rightPanel.js:1141-1185`) — range `0.001`–`0.5`, step `0.001`, default `0.01`, matching the
handoff's slider spec exactly.

Shown only for the three quadrants that run real `ValueIterationState` sweeps — `known:full`,
`known:partial`, `unknown:partial` — mirroring exactly how `_renderGammaSlider` itself is already
gated per-quadrant in the Method panel (`unknown:full`/Learning Iteration renders a completely
different Parameters block, its own ε-greedy/UCB/Optimistic hyperparameter chip, not this slider).

**Stored on `rightPanel` as `this.viEpsilon`** (default `0.01`), read once by
`ensureVIInitialized()` — exactly the existing precedent for γ: `main.js:821`'s
`const gamma = rightPanel ? rightPanel.discountFactor : 0.9;` is read once at VI-init time and
never retroactively pushed into an in-progress run if the slider moves later. There is no
`onGammaChange` wired into a live VI run today, and epsilon should behave identically — this
sidesteps a genuinely hard question for free: what should happen to a `converged: true` sticky
flag if epsilon changes mid-run and the new, smaller epsilon would "un-converge" the same delta?
Answer: nothing happens until Reset + Run again, same as changing γ mid-run today. This is a
default worth remembering as an explicit decision, not an oversight: it keeps a single VI run's
results self-consistent (you can't get partway through a run under one ε, nudge the slider, and
have history retroactively reinterpreted), at the cost of the slider having no visible effect until
next Reset — acceptable since Reset is one click and this mirrors γ's existing, already-shipped
behavior exactly.

### 2. Wire epsilon through `ensureVIInitialized()`

`main.js:818-823`:
```js
const ensureVIInitialized = () => {
    if (valueIterationState.initialized) return;
    const T = topBar ? topBar.getVIT() : 8;
    const gamma = rightPanel ? rightPanel.discountFactor : 0.9;
    const epsilon = rightPanel ? rightPanel.viEpsilon : 0.01;
    runVIInteractor.execute(new RunVIInputData(T, gamma, epsilon));
};
```
No interactor/domain-layer change needed — `RunVIInteractor`/`RunVIInputData` already accept and
forward `epsilon` to `valueIterationState.initialize()`.

### 3. Reframe the copy (convergence-first, T as a secondary safety cap)

Per the handoff's exact chip wording, reframe `viSweepChip.js` to lead with Δ-vs-ε, never the word
"sweep":

- Pre-init (`!vi.initialized`): unchanged, `'press Run to start'`.
- `k === 0` (init only, no delta yet): `` `k=0 · π = init` `` (drop "sweep", keep the `k=` index
  notation already used consistently by the Q-table headers).
- Unconverged: `` `Δ = ${d.toFixed(4)} vs ε = ${vi.epsilon.toFixed(3)}` `` — states the live
  comparison directly instead of a bare delta number, so the chip alone explains what's being
  checked without requiring the reader to already know what ε means.
- Converged (unchanged in substance, already good): `` `✓ Δ < ${vi.epsilon.toFixed(2)}` ``, but
  bump precision to `.toFixed(3)` to match the slider's `step=0.001` granularity — `toFixed(2)`
  today can't distinguish `ε = 0.01` from `ε = 0.015`.

`rightPanel.js`'s Parameters block (`:849-857`): replace the two raw "Max sweeps (T)"/"Sweep: k/T"
lines with a single reframed line that keeps T's real meaning (a safety cap, not a target) explicit
without using the word "sweep": `` `<strong>Safety cap:</strong> stop after ${T} iterations if not
converged` ``, plus a live `` `<strong>Iteration:</strong> ${k}` `` progress line (no `/T`
suffix — the cap is stated once above, repeating it as a fraction on every line is exactly the
"sweep-count-first" framing the handoff is moving away from).

Convergence section (`:868-872`)'s per-quadrant `perQuadrant` copy: drop the `max ${T} sweeps`
suffix entirely (T's cap is already stated once in the Parameters block above, restating it here
under a "Convergence" heading undercuts the "convergence, not sweep-count, is the stop condition"
framing) — `known:full` needs no line-1 caption at all now (the section title "Convergence" plus
the Δ-vs-ε line below already says everything); `known:partial` keeps `'belief update'` alone;
`unknown:partial` keeps `'α = 0.1 · belief memory'` unchanged (it was never sweep-language).

`rightPanel.js:1822`'s Explain header: `` `Explain: ${detail.stateName} at k=${detail.timestep}` ``
— matches the Q-table's own `k=` column-header convention instead of "at sweep N".

`topBar.js:607`'s `T =` input tooltip: `'Safety cap — Iteration stops here even if it has not
converged'` (states what T *is* — an upper bound — without calling the thing it bounds a "sweep").

`valueIterationView.js:198`'s pre-init placeholder: `'Set ε (convergence threshold) and click Run
to start Value Iteration'` — the placeholder should point at the parameter that actually matters
pedagogically (ε), not the safety-net T, now that ε is the headline stop condition.

`viEquationView.js:371`'s reveal caption: `'t = k−1 (prior iteration)'`.

## Non-goals

- No change to `ValueIterationState`'s math, sticky-convergence semantics, or `canAdvance()`/
  `getButtonEnablement()` gating — all already correct and already shipped.
- No change to `chartDock.js`'s `sweephistory` slot — appears already unreachable in the current
  routing (see above); a separate cleanup, not this phase's scope.
- No change to internal variable/method names (`sweepIndex`, `totalSweeps`, `hoveredSweepIndex`,
  ...) or the Q-table's `k=` column headers — not user-facing "sweep language" in the sense the
  handoff means.
- No change to `unknown:full` (Learning Iteration) — it has no sweep/epsilon concept at all
  (episodic Q-learning), untouched by this phase, exactly as CLAUDE.md already documents for every
  other VI-adjacent phase.
