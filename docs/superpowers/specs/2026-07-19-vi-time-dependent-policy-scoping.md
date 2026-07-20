# Evaluate Redesign, Phase 6: Time-Dependent Policy (π_t) — Scoping

**This is a scoping document, not a spec ready for planning.** Per the roadmap, Phase 6 has never
had a design pass — this document lays out the real handoff content (which, like Phase 4's, turned
out to exist but not inside this repo's `docs/`), corrects a misattributed blocker in
`docs/superpowers/evaluate-redesign-phase-4-and-6.md`, and identifies concrete open questions that
need a product decision before a real spec/plan can be written. **No implementation should start
from this document alone.**

## Correction: the stated blocker is misattributed

`docs/superpowers/evaluate-redesign-phase-4-and-6.md:39-44` says Phase 6 is "**hard-blocked on
Phase 4 existing**," citing `docs/superpowers/specs/2026-07-17-vi-screen-split-design.md`.

Reading that citation directly (`vi-screen-split-design.md:15-20`), the actual sentence is:

> A cross-phase dependency surfaced by that research: **Phase 6's Backward Iteration view is
> hard-blocked on this phase existing** — `ValueIterationState` was deliberately migrated away
> from time-indexed backward induction toward synchronous-sweep-to-convergence, so there is
> currently no time-indexed Bellman machinery anywhere in the codebase to hang a Backward view on.

"**This phase**" is that document's own subject — **Phase 3b, the 52/48 screen split** — not Phase
4. Phase 3b is marked shipped in the roadmap recap. So the literal blocker as originally written
("Backward needs a left-pane view slot to exist") is **already resolved**; Phase 4 (ε convergence)
has nothing to do with time-indexing and was never a real dependency either way. The
`evaluate-redesign-phase-4-and-6.md` doc should be corrected (tracked as its own task, see below).

The second half of that sentence is the real, still-open blocker, and it's independent of both
Phase 3b and Phase 4: **there is no time-indexed Bellman machinery anywhere in the codebase.**
Confirmed by direct read of `src/main/domain/valueIterationState.js` (Phase 4's own research pass
covered this file in full): `history[k]` is one snapshot per **sweep** k (synchronous,
stationary-policy Bellman *optimality* backup), not per elapsed **timestep** t of a *given* policy.
There is no per-timestep policy storage anywhere in the domain layer.

## What "Backward" actually is (a second correction)

The original handoff's working prototype (`~/Downloads/handoff/RLViz Evaluate Prototype.dc.html`)
implements a "Backward" left-pane view (`eShowVIBack`, gated by `eViBackAvail: seqMode` — i.e. only
shown when the π_t toggle, "seqMode," is on). Reading its actual render logic
(`eViBack: !isVI ? [] : [0,1,2].map(s2 => {...})`), **it is not time-indexed backward induction at
all** — it's a pure re-grouping of the *same* per-sweep `V`/`Q`/backup data States already has,
organized by target state s′ ("for each s′, which (s,a) pairs lead into it") instead of by source
state s ("for each s, which actions/outcomes does it have"). This is presentation-tier work,
directly analogous to what our real `getBackupDetail(sweepIndex, stateId)` already returns, just
read and grouped from the opposite direction. **It could be built today, independent of π_t,
using only existing `ValueIterationState` data — it does not actually require time-indexed
machinery,** despite being gated behind the π_t toggle in the handoff's own prototype (likely just
to avoid an extra view button cluttering the pill when it isn't relevant, not a technical need).

This matters for scoping: the genuinely hard, still-missing piece is **not** the "Backward" view —
it's the actual time-varying policy machinery π_t as a whole concept needs (see below). A
"Backward" grouping view could, in principle, ship as a small standalone presentation-only addition
to the existing `[States | Tree | Chart]` pill whenever someone wants it, decoupled from the rest of
Phase 6. Whether to actually do that now or bundle it with Phase 6 as the handoff pairs them is an
open question (see "Open questions" below) — not decided here.

## The real handoff spec (§6 of `Handoff - Evaluate Updates.dc.html`, verbatim)

> The Policy π panel has a **Stationary | π_t (time-dep)** toggle. Stationary keeps the plain
> per-state rows with no time UI. π_t swaps in the **time pager** — mockup: `Policy Time-Dep
> Mock.dc.html` (option 1a, chosen over the states × time matrix):
> - **‹ t = k / max ›** pager + segment strip: yellow = current t, gold = timesteps whose action
>   differs from t=0; click a segment to jump, hover to preview that timestep on the graph. Panel
>   height is constant at any horizon.
> - One row per state below the pager, showing that timestep's action (click to cycle a₀ → a₁ →
>   random).
> - **Max steps** is a Parameters-panel slider that appears only in π_t mode — it is the shared
>   horizon (episodes run that many steps; the pager and scrubber end there).
> - Semantics: sampling draws aₜ from π_t(S₀); exact evaluation runs backward induction with the
>   correct elapsed-time index; the policy log stores/restores full sequences (shown as
>   `π_t: a₀a₁~…`).
> - Graph overlay: a badge shows **π at t = k · action** in π_t mode (grey **π · all t** when
>   stationary); π edge weights follow the pager/scrubber. The Iteration **Backward** view is only
>   offered in π_t mode.

`Policy Time-Dep Mock.dc.html`'s "option 1a" (the chosen design, over a rejected "1b: states × time
matrix" alternative) is a compact card: a `‹ t = k / max ›` pager row, a 7-segment strip below it
(gold-outlined segments mark timesteps whose action differs from t=0), then one row per state
showing that state's Deterministic/Random policy *at the current pager position* — the same
per-state row shape Policy mode already has today, just re-read at a specific t instead of always
t=0.

The prototype's `_polV(g, t, pi)` (JS, `RLViz Evaluate Prototype.dc.html:832-852`) is the working
reference for the backward-induction math: it walks `k = 0..t-1` from the *end* of the horizon
backward, and at each step indexes the policy by **elapsed time** `t - 1 - k` (since "k steps
already folded in, counting from the end" corresponds to elapsed time `t-1-k` in a forward walk) —
this is the exact trick a real implementation needs to reuse. Forward sampling
(`_sampleEp(pi, t):785-798`) is simpler — it just indexes `pi[i]` directly by the loop's own elapsed
step `i`, no reversal needed, since sampling walks forward from t=0.

## Why this is real, non-trivial domain-layer work (not just a new toggle)

Reading our actual current domain layer (`src/main/domain/simulationState.js`,
`src/main/domain/policyEvaluationState.js`):

- `SimulationState.policy` (`simulationState.js:43`) is a flat `stateId -> actionId | null` map —
  genuinely stationary, no time dimension. `getPolicyMode()`/`getPolicyAction()`
  (`:426-435`) and `policyWeights` (weighted-random case) are likewise time-independent.
  `EdgeViewModel.policyEdgeProbability`, Build/Policy's simulation, and Monte Carlo's rollouts all
  read this same flat map (per CLAUDE.md's own "Simulation System" section) — a time-indexed policy
  needs a parallel, clearly-scoped representation (e.g. `stateId -> actionId[]` indexed by elapsed
  t, only meaningful when a `Stationary|π_t` flag says so) that every one of those consumers needs
  to learn to read correctly, without breaking the stationary case they already handle.
- `PolicyEvaluationState.evaluate(graph, simulationState, startStateId, gamma, epsilon=0.01)`
  (`policyEvaluationState.js:19-61`) iterates the Bellman *expectation* backup **to ε-convergence**
  — a genuinely different mathematical object than the prototype's finite-horizon `_polV`. Our own
  Evaluate π is already more rigorous (infinite-horizon exact value of a stationary π) than the
  prototype's toy (finite-horizon-bounded `_polV`). A time-indexed policy has no well-defined
  "infinite-horizon converged value" in the same sense — it only has H well-defined actions — so
  evaluating it exactly is *inherently* horizon-bound, not epsilon-bound. This is a real semantic
  fork in what "Evaluate π" computes and reports, not an incremental parameter.
- Monte Carlo's own rollout sampling (`TraceGenerator`/`ExpectationState`, per CLAUDE.md's
  "Monte Carlo" section) selects actions via `selectActionForPolicy(stateNode, policy,
  policyWeights)` reading the same flat, time-independent map — sampling under π_t needs the
  episode's own elapsed-step counter threaded into that action-selection call, which today has no
  such counter at all (an episode is just a graph walk, unaware of "how many steps in am I").

None of this is a UI-only feature. The actual missing piece the roadmap's blocker sentence was
gesturing at — correctly, just mislabeled as "Backward" — is this policy-representation and
evaluation-math work, independent of any particular view.

## Open questions (need a product decision before a spec can be written)

1. **Which states get a time pager row?** The handoff's own demo MDP only has one multi-action
   decision state (S₀); its mock genuinely only had to show one interesting row. Real graphs in
   this app can have many multi-action states. Does π_t's per-timestep action apply independently
   to *every* multi-action state, or is there a simpler model worth considering first?
2. **Does π_t apply across all four Method quadrants, or only the two full-observability ones?**
   The handoff's spec text doesn't address partial observability (Belief Iteration / PO Q-Learning)
   at all. Given those two quadrants are already illustrative/non-real (per CLAUDE.md), it's
   unclear whether π_t should even be offered there, or gated to `known:full`/`unknown:full` only.
3. **What does "Evaluate π" compute and display when π_t is active?** A horizon-bound return
   (matching `_polV(...)[0]`, i.e. the finite-horizon value from t=0) is the closest match to the
   prototype, but this is a different quantity in kind from the existing epsilon-converged
   stationary V^π other Policy log rows show — worth an explicit decision on how the log
   communicates that difference (units, hover copy, the reserved "t" column at
   `rightPanel.js:1447` finally getting populated for these rows specifically).
4. **Where does the shared horizon ("Max steps") slider live?** The handoff says it's "a
   Parameters-panel slider that appears only in π_t mode... the shared horizon (episodes run that
   many steps)" — implying it unifies with Monte Carlo's *own*, already-shipped Max Steps slider
   (`RightPanel._renderExpectationGammaSlider()`'s neighbor, per CLAUDE.md's "Mode System"
   section). Does π_t reuse MC's existing horizon control directly, duplicate a separate one scoped
   to Policy π/Iteration, or something else? This is a real UI-ownership question, not just wiring.
5. **Ship "Backward" (the presentation-only re-grouping view) now, decoupled from the rest of
   Phase 6?** As established above, it needs no time-indexed machinery — it could be a small,
   independent addition to the existing `[States | Tree | Chart]` pill today. Worth a deliberate
   yes/no, not silently bundled into "Phase 6" scope by default just because the original handoff
   grouped them together.

## Non-goals for this document

- No implementation, no file-by-file plan — this is scoping only, per the roadmap's own "a full
  design pass is still needed before planning/implementation" framing (now updated: the design
  pass needs to resolve the five questions above, not start from zero).
- Not attempting to resolve the open questions unilaterally — they're product/pedagogy calls
  (how much of the real theory to expose vs. how much complexity a student should face), which
  should get their own brainstorm pass the way Phase 1's goal card or Phase 3b's screen split did.
