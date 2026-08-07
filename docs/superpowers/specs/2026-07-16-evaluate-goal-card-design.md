# Evaluate Redesign, Phase 1: Toolbar Segments + Goal Card — Design

## Context

An external design handoff (`~/Downloads/handoff/`, principally `Handoff - Evaluate Updates.dc.html`
and its companion prototype `RLViz Evaluate Prototype.dc.html`) specifies a substantial redesign
of RLViz's Values mode. The full handoff covers seven roughly-independent pieces:

1. **Toolbar restructure + goal card** (this phase) — `Build | Policy | Values` becomes
   `Build | Policy | Monte Carlo | Iteration` in the mode toggle; picking either of the last two
   shows a "goal card" (the E[G | S=S₀] equation) before landing in that sub-view.
2. **Evaluate π button + policy log** — a new toolbar button, in the same Run/Step/Reset/
   Renormalize cluster, that computes exact V^π(S₀) for whatever policy is currently configured
   and logs it.
3. **52/48 screen split + overlays** for the Monte Carlo/Iteration scenes (occupancy badges,
   backup-label heat, node sparklines, convergence popovers).
4. **ε convergence stop condition** for Iteration, replacing "sweep" language.
5. **Compare scene** — a full-canvas MC-vs-VI convergence chart, reached only from the goal card.
6. **Time-dependent policy (π_t)** — a new Stationary/π_t toggle, time pager control, backward
   induction, and horizon parameter.

Each later phase gets its own design pass when work reaches it. **This document covers Phase 1
only**: the toolbar's visual segment split and the goal card intro screen.

## Goal

Give Build/Policy/Values mode-switching a new entry point that visually separates Monte Carlo
and Iteration (matching the handoff's `Build | Policy | Monte Carlo | Iteration` toolbar), and
gate entry to either with a goal-card overlay stating what's being computed
(`V^π(S₀) = E[G | S = <start state name>]`), before the user lands in that sub-view.

## Key architecture decision: cosmetic split, not a real mode-model change

The handoff's prototype (itself an Evaluate-only mockup with no real Build/Policy) renders four
visually equal toolbar segments. Promoting `mc`/`iteration` to real top-level `mode` values in
this codebase would ripple through every `mode === 'values'` guard in `CanvasController.js`,
`mainView.js`, `rightPanel.js`, `SetModeInteractor.validModes`, and the `main.js` mode-lifecycle
hook table — a large, risky refactor for zero user-visible benefit, since the goal is the visual
segment split and the goal-card gate, not a different internal mode taxonomy.

Instead: `viewModel.mode` stays `'build' | 'policy' | 'values'`, and `viewModel.valuesSubView`
stays `'mc' | 'vi'` exactly as today. `topBar.js`'s mode toggle changes only its **rendering**:
the current single `Values` button (`_createModeToggle()`, `src/main/view/topBar.js:240-244`) is
replaced by two buttons, `Monte Carlo` and `Iteration`, each of which — when clicked — sets
`mode = 'values'` **and** the corresponding `valuesSubView` in one action (rather than requiring
a separate click on the existing floating `estimatorPill.js` MC/Method switch, which stays exactly
as-is for switching sub-views *after* already being in Values mode). The Iteration segment's own
label text still resolves through the existing `ValuesMethodMatrix` (showing "Learning Iteration"
when P is unknown), matching how in-canvas badges already relabel today — this phase does not
change `ValuesMethodMatrix` at all.

## Goal card

A full-canvas overlay, shown when entering Values mode via either new toolbar segment (unless
muted — see below), blocking interaction with the canvas underneath until dismissed:

- **Presentation-only state**, on `CanvasViewModel` (same tier as `buildCanvasView`/`treeExpanded`):
  - `goalCardMuted` (boolean, default `false`) — "don't ask again" for the session. Not persisted
    across page reloads (no localStorage) and not included in graph import/export, matching every
    other presentation-only flag in this codebase.
  - `goalCardVisible` (boolean, default `false`) — whether the overlay is currently shown.
- **Trigger**: clicking the toolbar's `Monte Carlo` or `Iteration` segment sets
  `mode = 'values'` + the matching `valuesSubView`, and shows the goal card
  (`goalCardVisible = true`) unless `goalCardMuted` is true. Clicking **Reset** while already in
  Values mode also re-shows the goal card (matching the handoff's "Reset ... re-shows the goal
  card unless muted"), for both Monte Carlo's and Iteration's own Reset buttons.
- **Content**, matching the handoff's prototype almost verbatim:
  - Eyebrow label: "Want to find"
  - Equation (KaTeX via the existing `mathRenderer`/`MathRenderer.js`, this codebase's established
    math-rendering path — not a raw Unicode string): `V^π(S₀) = E[G | S = S₀]`, where `S₀` is
    replaced by the actual start node's real name (`viewModel.startNode.name`), matching the
    handoff's "a named MDP reads *E[ G | S = Bud ]*". If no start node is set, render the literal
    fallback `S₀` (matching what `TreeView`'s own empty-state prompt already does for a similar
    "no start node yet" case).
  - Two scene buttons, `▶ Monte Carlo` / `▶ Iteration`: each dismisses the card
    (`goalCardVisible = false`) and ensures `valuesSubView` matches the button clicked (in case the
    user picked, e.g., Iteration's card but then clicks the Monte Carlo button on the card itself —
    unlikely given the two are already in sync from the triggering toolbar click, but the card's
    own buttons are the authoritative "which scene did they actually choose" action).
  - **No auto-run**: dismissing the card lands the user in the (idle, not-yet-run) Monte Carlo or
    Iteration sub-view exactly as switching to Values mode does today — the user still clicks
    Run/Step themselves. This deliberately narrows the handoff's "dismiss the card and run that
    scene immediately," since auto-running a simulation the instant a modal closes is a bigger,
    separate behavioral change than this phase's stated goal (the toolbar split + intro screen),
    and is easy to add later without touching anything else built in this phase.
  - `⇄ Compare` link: rendered, but disabled (visibly greyed, non-interactive, with a tooltip
    along the lines of "Coming soon") — Compare itself is Phase 5, out of scope here. Keeping the
    link visible (not omitting it) matches the handoff's layout and avoids reflowing the card
    later.
  - `don't ask again`: sets `goalCardMuted = true` and dismisses the card without navigating
    anywhere (matching the handoff: it "mutes the card for the session," it is not itself a scene
    choice).
- **Dismissal always lands the user in the idle Values view** they picked — no card ever
  auto-advances into Compare or anywhere else than Monte Carlo/Iteration, since Compare doesn't
  exist yet in this codebase.

## Non-goals (this phase)

- No `ValuesMethodMatrix` changes.
- No changes to `estimatorPill.js`'s existing MC/Method switch (still the only way to change
  sub-view *while already in* Values mode without leaving/re-entering).
- No Evaluate π button, no policy log, no 52/48 screen split, no ε stop condition, no Compare
  scene, no time-dependent policy — all later phases.
- No auto-run on goal-card dismissal (see above).
- `goalCardMuted` is session-only (in-memory), not persisted to `localStorage` the way theme
  preference is — resets on page reload, matching how e.g. `buildCanvasView` also resets rather
  than persisting.

## Summary of touched files

- `src/main/adapter/viewmodel/CanvasViewModel.js`: add `goalCardMuted`, `goalCardVisible`.
- `src/main/adapter/controller/CanvasController.js`: a small method to enter Values mode with a
  specific sub-view + goal-card gating in one call (used by both the new toolbar buttons and the
  goal card's own scene buttons), and to re-show the card on Reset.
- `src/main/view/topBar.js`: replace the single `Values` toggle button with two buttons
  (`Monte Carlo`, `Iteration`); Iteration's label resolves via `ValuesMethodMatrix` for the
  Learning Iteration case.
- A new view file for the goal card overlay (DOM-based, matching this codebase's convention of
  floating chrome as real HTML elements over the canvas, not p5 canvas drawing — see
  `estimatorPill.js`/`treeViewPill.js` for the established pattern) — exact name decided in the
  implementation plan.
- `src/main/app/main.js`: construct the goal card, wire callbacks, hook into the Reset flow for
  both Monte Carlo and Iteration.
- `index.html`: one new script tag.

No domain or use-case layer changes — this is presentation/adapter-tier only, consistent with how
`buildCanvasView`/`treeExpanded`/`dockState` are already handled.
