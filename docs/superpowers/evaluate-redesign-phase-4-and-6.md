# Evaluate Redesign — Phase 4 and Phase 6

Reference extract from the 7-phase Evaluate redesign roadmap (see
`docs/superpowers/specs/2026-07-16-evaluate-goal-card-design.md` for the full roadmap and
`docs/superpowers/specs/2026-07-17-vi-screen-split-design.md` for the research pass that covered
these two phases alongside 3b). Written so Phase 4 and Phase 6 don't stay buried inside older
design docs written for a different phase.

**2026-07-19 update:** the "no further design detail exists" framing below turned out to be wrong
for both phases — the real spec was never missing, just not inside this repo's `docs/`. It lives in
the original external handoff at `~/Downloads/handoff/` (`Handoff - Evaluate Updates.dc.html` §5/§6,
plus a working prototype and a dedicated π_t mock). Both phases now have a design/scoping doc, a
plan, and a shipped implementation. See:
- `docs/superpowers/specs/2026-07-19-vi-epsilon-convergence-design.md` (Phase 4 design)
- `docs/superpowers/plans/2026-07-19-vi-epsilon-convergence.md` (Phase 4 plan, implemented)
- `docs/superpowers/specs/2026-07-19-vi-time-dependent-policy-scoping.md` (Phase 6 scoping — the
  five open questions it raised were resolved as explicit decisions, not left for a future pass)
- `docs/superpowers/plans/2026-07-19-vi-time-dependent-policy.md` (Phase 6 decisions + plan, implemented)
- `docs/superpowers/session-summary-2026-07-19-epsilon-and-pit.md` (narrative summary of both)
- `CLAUDE.md`'s own "Value Iteration..." and "Time-dependent policy (π_t)" sections now describe
  both as shipped architecture, same as every other completed phase

## Roadmap recap

1. Toolbar restructure + goal card — **shipped**
2. Evaluate π button + policy log — **shipped**
3. 52/48 screen split + overlays, split into:
   - 3a: Monte Carlo screen split — **shipped**
   - 3b: Iteration screen split — **shipped**
4. ε convergence stop condition for Iteration — **shipped** (2026-07-19)
5. Compare scene (full-canvas MC-vs-VI convergence chart, reached only from the goal card) — **not started**
6. Time-dependent policy (π_t) — **shipped** (2026-07-19, including the Backward view)

## Phase 4: ε convergence stop condition

Replaced "sweep"-count language in Iteration with a convergence-threshold (ε) stop condition. The
domain layer (`ValueIterationState.epsilon`/`.converged`, `VIAnimator`'s auto-stop) already had all
the real math before this phase started — it only needed an ε slider exposed in the UI and existing
copy (`viSweepChip.js`, `rightPanel.js`'s Parameters/Convergence sections, the `T =` tooltip, the
pre-init placeholder) reframed to lead with Δ-vs-ε instead of sweep counts. See
`docs/superpowers/specs/2026-07-19-vi-epsilon-convergence-design.md` for the full design (including
the exact handoff citation) and `docs/superpowers/plans/2026-07-19-vi-epsilon-convergence.md` for
the shipped file-by-file plan.

## Phase 6: Time-dependent policy (π_t)

A new Stationary/π_t toggle, a time-pager control, backward induction, and a horizon parameter —
i.e., reintroducing time-indexed policies/values (as opposed to today's single stationary
converged policy). Full scoping lives in
`docs/superpowers/specs/2026-07-19-vi-time-dependent-policy-scoping.md`, decisions + shipped plan
in `docs/superpowers/plans/2026-07-19-vi-time-dependent-policy.md`, architecture description in
`CLAUDE.md`'s "Time-dependent policy (π_t)" section. Summary:

- **Correction (this doc previously got this wrong):** Phase 6 was never actually "hard-blocked on
  Phase 4 existing" — `vi-screen-split-design.md`'s actual sentence blocks Phase 6 on "**this
  phase**" (its own subject, Phase 3b, already shipped), not Phase 4. Neither was ever a real
  dependency of Phase 6.
- **Second correction:** the handoff's own "Backward" left-pane view needs **none** of the
  time-indexed machinery the misattributed blocker implied — it's a pure re-grouping of
  already-existing per-sweep backup data (by target state s′ instead of source state s). Shipped as
  a third segment on the already-live `viRightViewPill.js` (`[Equation | Backward | Chart]`),
  gated to `known:full` + π_t active, rather than reviving the dead `viLeftViewPill.js` CLAUDE.md
  had described - decided over reviving that disabled mechanism as the lower-risk path.
- The real work was a time-indexed **policy representation** (`SimulationState.timeDependentPolicy`,
  additive alongside the existing stationary `policy`/`policyWeights`) plus new evaluation math
  (`PolicyEvaluationState.evaluateTimeIndexed()` - a genuinely different, finite-horizon backward
  induction, not a parameterized variant of the existing infinite-horizon epsilon-convergence
  evaluator) and time-aware sampling (`TraceGenerator.generate()`'s new `elapsedT` counter).
- The scoping doc's five open questions were each resolved as an explicit decision rather than left
  for a later pass: every multi-action state gets a time pager row (not just one); the toggle/pager
  work across all four modes/quadrants (shared Policy π infra) while Backward stays `known:full`-only;
  Evaluate π under π_t reports the finite-horizon V₀ and populates the Policy log's
  previously-always-em-dash "t" column with the horizon; the horizon ("Max steps") slider lives
  inside the Policy π section itself, not the shared Parameters block; Backward shipped bundled
  with the rest, not decoupled.

## Note on the 2026-07-17/18 "backward" work (a different thing from Phase 6's Backward view)

The 2026-07-17/18 sessions built a **backward-induction-*styled* animation** inside the existing
States view's per-state backup diagram (`viBackupDiagram.js`) — highlighting each outcome's
prior-sweep value, tweening it into the current state's action, revealing reward/probability, and
multiplying into the Q term. That was a **presentation-layer animation over the existing
synchronous-sweep VI** (see
`docs/superpowers/session-summary-2026-07-18-states-view-backward-reveal.md`), not Phase 6's real
time-indexed Backward Iteration view - it introduced no time-indexed domain machinery, π_t toggle,
or horizon parameter. Phase 6's actual **Backward** view (a `viRightViewPill.js` segment, described
above) is a separate, later (2026-07-19) piece of work that happens to share the word "backward" -
don't conflate the two when reading history.
