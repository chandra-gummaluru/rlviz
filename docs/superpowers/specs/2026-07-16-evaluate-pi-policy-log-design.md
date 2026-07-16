# Evaluate Redesign Phase 2: Evaluate π + Policy Log — Design

## Context

This is Phase 2 of the 7-phase Evaluate redesign (see
`docs/superpowers/specs/2026-07-16-evaluate-goal-card-design.md` for the full roadmap and Phase 1,
already shipped: the `Build | Policy | Monte Carlo | Iteration` toolbar split and the goal-card
intro). Phase 2 adds an **Evaluate π** button to the shared action-button cluster and a **Policy
log** panel that records exact evaluations of whatever policy is currently configured.

## Goal

Give the student a way to ask "exactly how good is the policy I just set up?" and get a real
number — distinct from both of this app's existing "evaluation" surfaces:

1. **Value Iteration (existing, unchanged by this phase)** computes **V\*** — the optimal value —
   via the Bellman *optimality* equation (`max_a` over all actions at every state). Policy-agnostic;
   answers "what's the best achievable outcome," not "how good is *my* policy."
2. **Monte Carlo (existing, unchanged)** *estimates* `E[G|S=S₀]` for the current policy by sampling
   rollouts and averaging — tracks the current policy, but only approximately (sampling noise).
3. **Evaluate π (new, this phase)** computes the **exact** value of the current policy via the
   Bellman *expectation* equation (`Σ_a π(a|s) · (...)`, no `max_a` — weighted by the policy's own
   configured action probabilities: deterministic → weight 1 on that action, weighted/random →
   the configured slider weights, uniform → 1/n). Exact, and tied to *this specific policy* — if
   it isn't optimal, this number is genuinely lower than VI's V\*, by design. This is the missing
   piece: an exact, per-policy number to compare against both VI's optimal bound and MC's noisy
   estimate of the same policy.

Confirmed with the user: `max_a` is explicitly NOT used anywhere in this computation — using it
would make Evaluate π mathematically identical to Value Iteration's V\*, defeating the purpose.
Value Iteration itself is unchanged by this phase. (The user may bring a follow-up design for a
`max_a`-hybrid variant separately later; out of scope here.)

## Domain layer

**New domain entity**: `src/main/domain/policyEvaluationState.js` (sibling to
`valueIterationState.js`/`expectationState.js`). Owns:

- `entries`: an array of log rows, each
  `{ id, label, policySnapshot, policyWeightsSnapshot, valueAtStart, valuesByState, isBest }` —
  `policySnapshot`/`policyWeightsSnapshot` are deep copies of `simulationState.policy`/
  `.policyWeights` at evaluation time (so later edits to the live policy don't retroactively change
  a logged entry), `valuesByState` is every state's V^π (needed for the hover-preview and for a
  future per-state breakdown), `valueAtStart` is V^π(S₀) specifically (the log's headline number),
  `isBest` is recomputed on every new entry (highest `valueAtStart` across all entries so far wins
  the ★; ties keep the earliest).
- `evaluate(graph, simulationState, gamma, epsilon)`: the actual algorithm. Iterates the Bellman
  **expectation** backup — `V(s) = Σ_a π(a|s) Σ_{s'} P(s'|s,a) · [R(s,a,s') + γV(s')]` — sweep by
  sweep, using `simulationState.getPolicyMode(stateId)`/`.policyWeights`/`._normalizedProbsForState`
  (already-existing logic, reused verbatim — no new weighting math) to resolve each state's action
  distribution, until the max per-state change across a sweep drops below `epsilon` — the same
  stop-condition *shape* `ValueIterationState` already uses, just with the expectation operator
  substituted for the optimality operator. Returns `{ valueAtStart, valuesByState }`; does not
  mutate `entries` itself (the interactor does that, so `evaluate()` stays a pure computation
  the way `ValueIterationState`'s own backup step is a comparably pure computation).
- `clear()`: empties `entries` (backs the log panel's "clear" link).
- `restore(pathId)` is NOT on this entity — restoring a policy means writing back into
  `simulationState.policy`/`.policyWeights`, which the controller does directly (see below); this
  entity only stores what to restore, it doesn't perform the restoration itself.

## New use case: `evaluatePolicy`

`src/main/use_case/evaluatePolicy/`, following this codebase's standard shape (modeled directly on
`runVI`'s files — read `src/main/use_case/valueIteration/runVI*.js` before implementing):

- `evaluatePolicyInputBoundary.js` — `execute(inputData)` interface only.
- `evaluatePolicyInputData.js` — `constructor(gamma, epsilon = 0.01)`. `gamma` reuses the same
  shared discount-factor value Build/Policy/VI already read from `rightPanel.discountFactor`;
  `epsilon` reuses VI's own convergence-tolerance slider value (no new slider introduced by this
  phase — confirm at plan-writing time whether to read VI's existing `epsilon` state directly or
  thread a fixed sane default; this is a plan-level decision, not re-litigated here).
- `evaluatePolicyInteractor.js` — thin, mirroring `RunVIInteractor`'s shape exactly: constructor
  `(graph, simulationState, policyEvaluationState, outputBoundary)`; `execute(inputData)` validates
  a start node is set (same check `onPlay` already makes), calls
  `policyEvaluationState.evaluate(graph, simulationState, inputData.gamma, inputData.epsilon)`,
  builds a new log entry from the result plus a fresh policy snapshot, determines `isBest`, appends
  to `policyEvaluationState.entries`, calls `outputBoundary.presentEvaluated(entry)`. No Bellman
  math in the interactor itself — identical division of labor to `RunVIInteractor`/
  `ValueIterationState.initialize()`.
- `evaluatePolicyOutputBoundary.js` — `presentEvaluated(entry)`, `presentError(message)`.
- `evaluatePolicyPresenter.js` — implements the above, triggers a right-panel refresh so the new
  log row renders immediately (same role `viPresenter.js` plays for VI's own sweep-complete event).

## UI

- **Button**: added to the shared Run/Step/Reset/Renormalize action cluster, positioned between
  Reset and Renormalize (matching the handoff's exact order and the user's original "next to
  Renormalize" request). Present in Build, Policy, Monte Carlo, and Iteration alike — same
  cluster, same slot, every mode (per Phase 1's own established convention for that cluster).
- **Enablement**: disabled whenever `viewModel.modelKnown === false` (both P-unknown quadrants —
  Learning Iteration and PO Q-Learning) — "exact" evaluation requires known P; enabled otherwise,
  regardless of current mode/observability.
- **Policy log panel**: new right-panel section, appended in all four modes' panels (Build's below
  Utility G, Policy's below the π editor, Monte Carlo/Iteration's below their existing Estimate/
  Q-table sections) — same panel content in every mode, since the log itself is mode-independent.
  Columns: **π** (label, e.g. `π₁`, `π₂`, ...) | **t** (em-dash placeholder — reserved for Phase 6's
  time-dependent policy horizon, not populated by this phase) | **avg E[G]** (the entry's
  `valueAtStart`, with a ★ suffix on whichever entry is currently `isBest`). A **"clear"** link
  empties the log.
- **Hover a row**: presentation-only preview — lights that entry's policy on the graph (which
  action each state would take under `policySnapshot`/`policyWeightsSnapshot`) via a new
  presentation-only `interaction.previewPolicy`/`.previewPolicyWeights` pair (consumed by the
  existing policy-edge rendering, `EdgeViewModel.policyEdgeProbability`, which needs a small
  addition to prefer the preview pair over the live `simulationState.policy` when a preview is
  active) — does NOT mutate `simulationState.policy` itself. Clearing hover reverts to showing the
  live policy.
- **Click a row**: restores that policy for real — copies `policySnapshot`/`policyWeightsSnapshot`
  into `simulationState.policy`/`.policyWeights` (a `CanvasController.restorePolicyFromLog(entry)`
  method, direct assignment, no new interactor needed since this is a straightforward state write
  mirroring how `setPolicyAction`/`setPolicyWeight` already mutate the same fields), then refreshes
  the Policy π editor / canvas / right panel so the restored policy is reflected everywhere.

## Non-goals (this phase)

- No π_t / time-dependent policy support in the log (Phase 6) — stationary policies only; the "t"
  column is a placeholder, not populated yet.
- No change to `ValueIterationState`'s own optimal-value computation or to Value Iteration's
  existing UI/behavior.
- No `max_a` anywhere in `PolicyEvaluationState.evaluate()` — confirmed explicitly with the user.
- No new Parameters slider — `gamma`/`epsilon` are reused from existing shared state, not
  duplicated.

## Summary of touched/new files

- `src/main/domain/policyEvaluationState.js` (new)
- `src/main/use_case/evaluatePolicy/` (new directory, 5 files per the standard shape above)
- `src/main/adapter/controller/CanvasController.js`: `restorePolicyFromLog(entry)`, plus wiring the
  new interactor
- `src/main/adapter/viewmodel/InteractionViewModel.js` (or wherever `hoveredNode`/`hoveredEdge`
  live): `previewPolicy`/`previewPolicyWeights` fields
- `src/main/adapter/viewmodel/EdgeViewModel.js`: `policyEdgeProbability` prefers the preview pair
  when set
- `src/main/view/topBar.js`: new Evaluate π button, enablement wiring
- `src/main/view/rightPanel.js`: new Policy log section (shared render helper called from all four
  modes' panel-render methods), hover/click handlers
- `src/main/app/main.js`: construct `policyEvaluationState`, the new interactor/presenter, wire the
  button callback and enablement refresh (piggybacking on the existing `onModelKnownToggle` hook)
- `index.html`: new script tags for the domain file and the five use-case files

No changes to `ValueIterationState`, `ExpectationState`, or any existing use case.
