# Evaluate Redesign — Phase 4 and Phase 6 (not yet implemented)

Reference extract from the 7-phase Evaluate redesign roadmap (see
`docs/superpowers/specs/2026-07-16-evaluate-goal-card-design.md` for the full roadmap and
`docs/superpowers/specs/2026-07-17-vi-screen-split-design.md` for the research pass that covered
these two phases alongside 3b). Written so Phase 4 and Phase 6 don't stay buried inside older
design docs written for a different phase — nothing here has been implemented yet.

## Roadmap recap

1. Toolbar restructure + goal card — **shipped**
2. Evaluate π button + policy log — **shipped**
3. 52/48 screen split + overlays, split into:
   - 3a: Monte Carlo screen split — **shipped**
   - 3b: Iteration screen split — **shipped**
4. ε convergence stop condition for Iteration — **not started**
5. Compare scene (full-canvas MC-vs-VI convergence chart, reached only from the goal card) — **not started**
6. Time-dependent policy (π_t) — **not started**

## Phase 4: ε convergence stop condition

Replaces "sweep"-count language in Iteration with a convergence-threshold (ε) stop condition.

- Queued as the *next* phase after 3b at the time of writing (per `vi-screen-split-design.md`:
  "Phase 4 (ε convergence, queued next)").
- Expected to touch the right panel's Convergence section (`rightPanel.js`) and the bottom
  `ChartDock` — the same surface Phase 3b's screen split just finished landing, flagged
  explicitly in that design doc as "the shared surface for whoever picks up Phase 4 next."
- No further design detail exists yet beyond the one-line roadmap description in the goal-card
  design doc: **"ε convergence stop condition for Iteration, replacing 'sweep' language."** A full
  design pass (brainstorming → spec) is still needed before planning/implementation.

## Phase 6: Time-dependent policy (π_t)

A new Stationary/π_t toggle, a time-pager control, backward induction, and a horizon parameter —
i.e., reintroducing time-indexed policies/values (as opposed to today's single stationary
converged policy).

- **Hard-blocked on Phase 4 existing.** Per `vi-screen-split-design.md`'s Context section:
  `ValueIterationState` was deliberately migrated away from time-indexed backward induction toward
  synchronous-sweep-to-convergence (see the Phase 2 rewrite in
  `docs/superpowers/session-summary-2026-07-14.md`) — there is currently **no time-indexed Bellman
  machinery anywhere in the codebase** to hang a "Backward Iteration" view on. Phase 6 needs that
  machinery to exist first.
- The handoff's full left-pane view list is `[States | Backward | Tree | Chart]`; only **States**
  has shipped (Phase 3b). **Backward** is Phase 6's own view and cannot be built before Phase 6's
  domain-layer work lands.
- The Policy log (`docs/superpowers/specs/2026-07-16-evaluate-pi-policy-log-design.md`) already
  reserves a **"t" column** (em-dash placeholder today) specifically for Phase 6's time-dependent
  policy horizon — not populated by any phase shipped so far.
- No further design detail exists yet beyond the one-line roadmap description: **"Time-dependent
  policy (π_t) — a new Stationary/π_t toggle, time pager control, backward induction, and horizon
  parameter."** A full design pass is still needed before planning/implementation.

## Note on this session's "backward" work

This session (2026-07-17/18) built a **backward-induction-*styled* animation** inside the existing
States view's per-state backup diagram (`viBackupDiagram.js`) — highlighting each outcome's
prior-sweep value, tweening it into the current state's action, revealing reward/probability, and
multiplying into the Q term. This is a **presentation-layer animation over the existing
synchronous-sweep VI**, not Phase 6's real time-indexed Backward Iteration view — it doesn't
introduce any time-indexed domain machinery, a π_t toggle, or a horizon parameter. See
`docs/superpowers/session-summary-2026-07-18-states-view-backward-reveal.md` for what actually
shipped. Phase 6 remains fully unstarted.
