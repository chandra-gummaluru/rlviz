# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

RLViz is a web-based interactive graph editor and simulator for Markov Decision Processes (MDPs). It allows users to create state-action-state graphs, visualize MDP transition matrices, run animated Monte Carlo rollouts, and step through Value Iteration / manually-edited "Learning Iteration" — all with a theme-aware (light/dark) UI.

## Running the Application

This is a client-side p5.js application with no build step and no `package.json`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly also works, but a local server is recommended (avoids `file://` restrictions on `fetch`/module-like loading).

There is no bundler, no npm scripts, and **no automated test suite**. `test_schema/` holds example MDP graph JSON fixtures for manually exercising Import/Export, not a test runner. Verify changes by running the app in a browser and driving it manually (or with a headless-browser script, e.g. `playwright-core` against a local `http.server`) — check the browser console for errors and visually confirm the affected UI in both light and dark theme.

Since there's no module system, every source file is a plain `<script>` tag and load order in `index.html` matters: domain → use cases → theming/typography helpers → viewmodels → controller → remaining view helpers → view components → `app/main.js` last. When adding a new file, add its `<script>` tag in the matching position (see "Adding a New Use Case" below).

## Architecture

The codebase follows **Clean Architecture** with clear separation of concerns.

### Layer Structure

1. **Domain Layer** (`src/main/domain/`): Core entities with business logic, no framework dependencies.
   - `nodesObj.js`, `stateNodes.js`, `actionNodes.js`: MDP node entities
   - `edgeObj.js`, `graphObj.js`: Edges and the main graph aggregate (nodes, edges, text labels)
   - `command.js`, `commandHistory.js`: Command pattern for undo/redo
   - `simulationState.js`, `traceGenerator.js`: Trace-based simulation replay
   - `valueIterationState.js`: Bellman-backup computation/animation state, plus `manualOverrides` for the P-unknown editable Q-table
   - `expectationState.js`: Monte Carlo rollout generation and per-run/aggregate stats
   - `textLabel.js`, `viewportState.js`: Canvas text annotations and pan/zoom state

2. **Use Case Layer** (`src/main/use_case/`): Application logic, one folder per use case, following the Input-Interactor-Presenter pattern.
   - Standard use case shape: `*InputBoundary.js`, `*InputData.js`, `*Interactor.js`, `*OutputBoundary.js`, `*Presenter.js`
   - Graph editing: `createNode`, `createEdge`, `createTextLabel`, `deleteNode`, `moveNode`, `renameNode`, `resizeNode`, `setImage`, `renormalizeProbabilities`
   - Selection/interaction/view: `selectNode`, `nodeInteraction`, `zoom`, `setSpinningArrow`
   - Mode/undo-redo: `setMode` (build/policy/values), `setValuesSubView` (mc/vi), `undo`, `redo`
   - Import/export: `importGraph`, `serializeGraph`
   - Simulation (trace replay): `simulation/` — `play`, `pause`, `step`, `skip`, `reset` interactors + `simulationAnimator.js`
   - Value Iteration: `valueIteration/` — `runVI`, `viPlay`, `viPause`, `viStep`, `viSkip`, `viReset` + `viAnimator.js`
   - Monte Carlo: `expectation/` — `runExpectation`, `updateExpectationGamma`
   - Policy evaluation: `evaluatePolicy` — computes the exact value of whatever policy is currently configured (see "Evaluate π / Policy log" below)
   - `shared/AnimationUtils.js`: helpers shared across animator classes

3. **Adapter Layer** (`src/main/adapter/`): Connects domain to view.
   - `controller/CanvasController.js`: Entry point for all user input; delegates to interactors. Owns a **mode-lifecycle hook table** (`registerModeLifecycle({onLeave, onEnter, onLeaveSubView, onEnterSubView})`, keyed by mode/sub-view name) so mode-transition side effects (starting/stopping animations, resetting VI/MC state, etc.) live in one place instead of scattered across the controller.
   - `viewmodel/CanvasViewModel.js`: Main view-state aggregator/coordinator; delegates to sub-viewmodels (`SelectionViewModel`, `ViewportViewModel`, `InteractionViewModel`) and exposes convenience getters/setters (`mode`, `valuesSubView`, `zoom`, ...). Also owns `dockState` (bottom chart dock), `modelKnown` (P known/unknown, presentation-only — never mutates the graph's real transition probabilities), and `observability` (`'full' | 'partial'`, presentation-only, drives the Values-mode 2×2 method matrix — see below).
   - `viewmodel/NodeViewModel.js`, `EdgeViewModel.js`: Per-entity presentation data (color, visibility, etc.)
   - `viewmodel/ValueIterationViewModel.js`, `ExpectationViewModel.js`: Presentation state/layout math for the Value Iteration and Monte Carlo sub-views (e.g. `ExpectationViewModel._computeFitTransform()` fits a rollout's graph into a mini-panel cell)

4. **View Layer** (`src/main/view/`): p5.js canvas rendering plus DOM chrome (top bar/panels/floating pills are real HTML elements layered over the canvas, not drawn on it).
   - `mainView.js`: Main canvas draw loop and low-level input handling; dispatches into `expectationView`/`valueIterationView` for the Values mode sub-views. `mouseWheel()` only zooms the canvas when the wheel event's actual target is the canvas element itself — wheel events over DOM chrome (right panel, chart dock, toolbar, pills) fall through to native browser scrolling instead. `_isEditableMode()` (`mode === 'build' || mode === 'policy'`) gates every Build-only rendering/interaction branch (simulation-visibility filtering, start-node ring, editor-focus fade, right-click set-start-node) — Policy's canvas is intentionally identical to Build's, see "Mode System" below.
   - `topBar.js`: Single merged ~40px top bar (replaces the old two-row menuBar.js/toolBar.js split) — logo, filename chip (New/Open/Save/Export PNG + MRU recent files, backed by `helpers/RecentFiles.js`; Import/Export JSON were removed as redundant with Open/Save), undo/redo icon buttons, **Build | Policy | Monte Carlo | Iteration** mode toggle, theme toggle, a **Parameters popover** (continuous animation-speed slider, Spinning Arrow toggle, P known/unknown, Full/Partial observability — all full-width segmented controls/sliders), and mode-dependent action buttons (Run/Step/Reset, +Renormalize in Build/Policy; Play/Step/Reset in Monte Carlo; Play/Step/Skip/Reset + T-input/checkboxes in VI). Build, Policy, and Monte Carlo all show the same Play/Step/Reset button set with matching ▶/⏸ icons — only Build/Policy's Run label and Renormalize differ from Monte Carlo's per-mode specifics. An **Evaluate π** button sits immediately after Renormalize and, unlike every other action button in this cluster, is always visible in all four modes (Build/Policy/Monte Carlo/Iteration) rather than being shown/hidden per-mode — it's only ever enabled/disabled, via `setEvaluatePolicyEnabled()`, gated on `modelKnown` (disabled whenever P is unknown, in both partial- and full-observability quadrants). See "Evaluate π / Policy log" below. Monte Carlo/Iteration are rendering-only entry points onto the same `mode === 'values'` state Build/Policy's own mode toggle already uses (Evaluate redesign Phase 1 — see `CanvasController.enterValuesScene()`), each landing on the matching `valuesSubView` (`'mc'` / `'vi'`) and gating the full-canvas `goalCard.js` overlay; the Iteration segment itself relabels to "Learning Iteration" (purple) when P is unknown, mirroring `iterationToggleBtn`'s own quadrant styling. The Values-mode Monte Carlo/Method sub-view switch itself lives in the floating `estimatorPill.js`, not here.
   - `toolPalette.js`: Floating top-left tool palette shown in **both** Build and Policy mode (Policy's canvas is fully editable, identical to Build's) — icon+label rows (select / add-state / add-action / add-text-label), each tinted with its tool's own accent color (state=cyan, action=purple, text=neutral gray) and a soft active-pill highlight.
   - `treeViewPill.js` + `treeView.js`: Floating top-right `[Graph | Tree]` pill in Build/Policy mode, plus the full-canvas view it toggles — unrolls the MDP into a left-to-right search tree rooted at the start node (s₀), with click-to-expand/collapse (depth-capped by default) and hover-highlight of repeated states. Presentation-only (`buildCanvasView`, `treeExpanded` on `CanvasViewModel`), unrelated to Learning Iteration's own algorithmic Graph|Tree toggle in Values mode. While a Build/Policy simulation is actively playing (`simulationState.replayInitialized`), Tree view switches from the static full unroll to a progressive reveal of the trace-so-far (`TreeView._drawTraceReveal()`) — mirroring Graph view's own reveal/highlight/spinning-arrow phases but resolved against tree pathIds instead of real graph positions (auto-expanding and auto-panning to follow the active node, via the shared `SpinningArrowGlyph` helper) — with badge/hover interaction disabled until Reset returns it to the static tree.
   - `estimatorPill.js`: Floating top-center pill in Values mode — `[Monte Carlo | <method>]` segmented switch (method label/accent resolved via `helpers/valuesMethodMatrix.js`) plus a small top-left badge chip that tracks whichever pane is currently active: "Monte Carlo" (orange) while on the MC pane, the resolved method title/accent while on the Method pane.
   - `goalCard.js`: Full-canvas overlay shown on entering Values mode via the top bar's Monte Carlo/Iteration segments (or via Reset, in either sub-view) unless muted for the session — states `V^π(S₀) = E[G | S=S₀]` before the user picks a scene. Presentation-only (`goalCardVisible`, `goalCardMuted` on `CanvasViewModel`); does not change the underlying `mode`/`valuesSubView` model, only gates a new entry path onto it (`CanvasController.enterValuesScene`). The Compare link is a disabled stub (a later phase).
   - `mcRunsPill.js`: Floating top-right pill in Values → Monte Carlo only — `runs` label + a `[16][32][64]` segmented switch for `expectationState.displayRuns`, replacing the right panel's old "Display Runs" dropdown. Hidden outside the MC sub-view.
   - `zoomPill.js`: Floating bottom-right `[−] [zoom%] [+]` control; kept in sync by every zoom entry point (wheel, pinch, keyboard shortcuts, this pill's own buttons).
   - `rightPanel.js` + `RightPanelBuilder.js`: Context-sensitive side panel (node/edge inspector, Build panel, Policy-mode panel, MC/Method panels, VI/MC controls); `RightPanelBuilder` holds small reusable DOM-factory helpers (badges, slider rows). The panel element itself is natively scrollable (`overflow-y: auto`) once content exceeds the viewport. This is the **one place Build and Policy mode intentionally differ** — everything else (canvas, top bar) is shared. Every mode's default (nothing-selected) panel also renders a shared **Policy log** section (`_renderPolicyLog()`) — see "Evaluate π / Policy log" below.
   - `expectationView.js` + `expectationScrubber.js`: Monte Carlo mini-panel grid and its custom shifting-timeline scrubber. `ExpectationView.step()` advances `currentT` by one tick without starting continuous playback (backs the MC Step button); `startPlay()`/`stopPlay()` back Play/Pause.
   - `valueIterationView.js`: Value Iteration / Learning Iteration / Belief Iteration / PO Q-Learning canvas rendering (V*/Q*/belief labels, Bellman backup animation, editable Q-table cells, dashed node stroke in partial-observability quadrants)
   - `chartDock.js`: Resizable bottom dock in Values mode with two chart slots (Convergence, Histogram, Q-table, MC-tree — see `helpers/chartDataBuilders.js` for the pure data-shaping functions)
   - `SimulationRenderer.js`, `rewardParticleSystem.js`: Build-mode reward-collection animation/VFX helpers (the reward particle flies to the right panel's Utility G value)
   - `helpers/AppPalette.js`: Theming — see below
   - `helpers/valuesMethodMatrix.js`: `ValuesMethodMatrix` — the central 2×2 lookup (`modelKnown × observability` → `{title, pillLabel, paletteNamespace, accent}`) for the four Values-mode quadrants: Value Iteration, Learning Iteration, Belief Iteration, PO Q-Learning. Also exposes `beliefFor(viState, stateId, colIdx)`, the shared illustrative belief-scalar heuristic used by the two partial-observability quadrants (see "Value Iteration / Learning Iteration" below).
   - `helpers/RecentFiles.js`: Pure `localStorage`-backed MRU list (capped at 8) backing the top bar's filename-chip recent-files entries.
   - `helpers/Typography.js`: Loads vendored fonts for both canvas (p5 `loadFont`) and DOM (`@font-face` in `style.css`)
   - `helpers/GeometricHelper.js`: Hit-testing and geometry
   - `helpers/MathRenderer.js`: KaTeX-backed math label rendering on canvas
   - `helpers/ColorUtils.js`: Color parsing/alpha helpers, plus `contrastText()` — picks readable light/dark label text against an arbitrary fill color instead of assuming
   - `helpers/EasingUtils.js`: Shared tween/easing functions for animation phases

5. **App Bootstrap** (`src/main/app/main.js`): Dependency injection — constructs every domain entity, interactor, presenter, and the controller; wires view callbacks; registers the mode-lifecycle hooks; sets up p5.js `preload()`/`setup()`/`draw()`.

### Theming (`AppPalette`)

`AppPalette.light` and `AppPalette.dark` are frozen token tables with identical namespaces (`text`, `surface`, `border`, `accent`, `node`, `edge`, `reward`, `valueIteration`, `learningIteration`, `partialObservability`, `simulation`, `expectation`, `brand`, ...). `partialObservability` is the one shared semantic color (derived from `accent.yellow`) for the two illustrative Belief Iteration / PO Q-Learning quadrants — unlike `valueIteration`/`learningIteration`, the observability axis isn't a known/unknown split. `AppPalette.setTheme('light' | 'dark')` reassigns the top-level namespace properties on the (intentionally unfrozen) `AppPalette` object and calls `applyPaletteCssVars()`, which mirrors every token onto CSS custom properties (`--text-dark`, `--surface-panel`, `--accent-orange`, ...) so canvas draw calls and `style.css` share one source of truth. Persisted via `localStorage` (`rlviz-theme`); **default is light** when there's no saved preference (`AppPalette.current` / the fallback in the bottom-of-file init both default to `'light'`, not `'dark'`); toggled from the top bar's theme button or `AppPalette.toggleTheme()`.

#### Custom `<input type="range">` sliders

Every slider in the app (γ, t, Monte Carlo steps, animation speed, transition-probability/policy-weight sliders) shares one global `input[type="range"]` treatment in `style.css`, fully hand-styled (`appearance: none`) rather than relying on browser defaults. Two non-obvious things about it:

- **Fill-gradient must account for thumb radius, not just raw percentage.** The filled/unfilled boundary is a `linear-gradient` on the input's own background, positioned via a `--fill` CSS custom property (a unitless 0–1 fraction, kept in sync from JS on render and on every `input` event — see `RightPanelBuilder.sliderRow`'s `syncFillPct()` for the canonical version). The gradient stop is computed as `calc(var(--thumb-d) / 2 + var(--fill) * (100% - var(--thumb-d)))`, matching the browser's own thumb-centering formula (`thumbRadius + fraction * (trackWidth - thumbDiameter)`). A naive `fill * 100%` boundary ignores the thumb's radius inset, so near either end of the range the boundary lands *inside* the thumb instead of at its center — visibly clipping one side of it (most noticeable at extreme values, e.g. 990/1000). `--thumb-d` must match whatever the thumb's actual `width`/`height` is for that slider variant.
- **CSS specificity trap when overriding size per-slider.** `.panel-param-row-slider` (the smaller γ/t/MC-steps variant) and `.menubar-speed-slider` (the animation-speed slider) both need a *smaller* thumb/track than the global default. A bare class selector (`.panel-param-row-slider { height: 14px }`) loses the cascade to `input[type="range"] { height: 20px }` — the compound `input[type="range"]` selector carries one more element-level specificity point than a single class, regardless of source order. The fix is to write the override as `input[type="range"].panel-param-row-slider { ... }` (also targeting the pseudo-elements the same way), not the class alone.

When adding a new color, add the key to **both** the `light` and `dark` tables (reuse existing values for `light` unless explicitly asked to change light mode), then reference it either as `AppPalette.<ns>.<key>` on canvas or `var(--<ns>-<key>)` in CSS — never hardcode a hex value at a call site. Text ramps (`text.black`, `text.dark`, ...) are literal colors drawn directly on the canvas, so the dark-theme ramp is inverted (light-on-dark) rather than reused from light theme. For any color that text gets drawn *on top of* (node fills, badges), use `ColorUtils.contrastText(fillColor)` rather than assuming white or black — fill colors vary by theme and by node state.

## Key Domain Concepts

### MDP Graph Structure

- **State Nodes**: Contain a list of available action IDs
- **Action Nodes**: Contain a list of transitions (SAS = State-Action-State), each with `nextState` (ID), `probability`, `reward`
- Probabilities should sum to 1.0 per action (enforced by the `renormalizeProbabilities` use case)
- **Graph** (`graphObj.js`) is the root aggregate managing all nodes, edges, and text labels

### Mode System

Three top-level modes, controlled by `setMode` (`SetModeInteractor.validModes = ['build', 'policy', 'values']`):

- **Build**: Unified editing + trace-based simulation in one canvas (formerly separate Editor/Simulate modes — merged since editing and running traces share the same graph context). Create/edit/delete nodes and edges, set the start node, run/step/reset a simulation trace, all in the same view.
- **Policy**: Same canvas as Build in every respect — fully editable (drag/resize/create/delete nodes and edges, right-click to set the start node, double-click to focus-edit), same top bar (Renormalize, Run/Step/Reset with identical labels), same floating tool palette. The **only** difference from Build is the right panel's default (nothing-selected) content: Policy mode shows a fuller Policy π editor (Deterministic/Random toggle, weighted-random sliders per action) where Build shows Utility G. Every Build-only guard in the controller/view layers checks `mode === 'build' || mode === 'policy'` (see `CanvasController._isEditableMode()` / `MainView._isEditableMode()`) rather than `mode === 'build'` alone.
- **Values**: Estimator mode with a `valuesSubView` of `'mc' | 'vi'` (controlled by `setValuesSubView`; the old `'split'` side-by-side sub-view was dropped — cross-method comparison now lives in the "Estimate vs exact" table and the convergence chart instead of a split canvas). `'vi'` is really a **2×2 method matrix** keyed on `(modelKnown, observability)` — see below.

Mode and sub-view transitions run through `CanvasController`'s mode-lifecycle hook table (`onLeave`/`onEnter`/`onLeaveSubView`/`onEnterSubView`, registered in `main.js`) rather than ad hoc `if` branches — add new per-mode setup/teardown there.

`viewModel.modelKnown` (P known/unknown) and `viewModel.observability` (full/partial) are both presentation-only flags, toggled from `topBar.js`'s Parameters popover, and are excluded from graph import/export. The discount-factor slider (`rightPanel.discountFactor`, rendered via `RightPanel._renderGammaSlider()`) appears in a "Parameters" section at the top of the Build/Policy panel and the Values → Method panel; Monte Carlo has its own "Parameters" section (`_renderExpectationGammaSlider()` + a Max Steps slider) driving `expectationState.gamma`/`.maxSteps`, since rollout discounting/horizon are logically distinct from the shared `discountFactor` used by Build/Value Iteration. Both the MC and Method panels also render an "Initial State" (s₀) section (`RightPanel.renderInitialStateSection()`, shared with the Build/Policy panel).

### Simulation System (trace replay, Build mode)

1. **Trace Generation**: `TraceGenerator` builds a random path from the start state, sampling actions via `selectActionForPolicy(stateNode, policy, policyWeights)` — deterministic match first, then weighted-if-present, then uniform fallback
2. **Replay State**: `SimulationState` drives a multi-phase animation (`idle` → `highlight` available edges → `transition` to the next node), revealing nodes/edges progressively; it also holds `SimulationState.policy` (a `stateId → actionId` map — a missing entry means "random") and `SimulationState.policyWeights` (`stateId → {actionId: rawWeight}`, for the weighted-random case), the single shared source of truth for Policy π, consumed by Build's simulation, Policy mode's own preview, and Monte Carlo's rollouts. `getPolicyMode(stateId)` returns `'deterministic' | 'weighted' | 'uniform'`.
3. **Spinning Arrow**: optional visual for probabilistic edge selection
4. **Policy π**: Policy mode's right panel (`RightPanel._renderPolicyModeSection()`) is the only place π is edited — a per-state Deterministic/Random toggle, an action-segment row when Deterministic, or one independent weighted slider per action when Random (normalized-at-sample-time, not normalized-on-write). The deterministic/weighted policy edge renders bold/width-proportional on canvas (`EdgeViewModel.policyEdgeProbability`, gated to Build/Policy mode).
5. **Steps / Utility G** (`RightPanel._renderStepsAndUtility()`): a nested Utility G row (formula left, value right, colored green/red by sign via `_applyRewardColor()`) and an always-visible contribution bar (`_renderContributionBar()`) — one block per non-zero reward step, width ∝ the discounted magnitude `|γᵗ·rₜ|`, opacity fading with `γᵗ`, plus a trailing gray block for the remaining episode tail. A "t" progress bar (div-based, not a native range input — see below) sits in the shared Parameters section instead of a standalone step count.

### Value Iteration / Learning Iteration / Belief Iteration / PO Q-Learning (Values → vi)

`ValueIterationState` runs the real Bellman-backup computation and animates it column by column. The right panel's title/equation/pill label/accent all resolve through `ValuesMethodMatrix.resolve(modelKnown, observability)`, covering four quadrants:

- `known:full` → **Value Iteration** (exact Bellman backup)
- `unknown:full` → **Learning Iteration** (P unknown — no algorithm runs; the student edits the Q-table directly)
- `known:partial` → **Belief Iteration** (illustrative only)
- `unknown:partial` → **PO Q-Learning** (illustrative only)

The two partial-observability quadrants are **illustrative, not real POMDP algorithms** — they reuse Value Iteration's real backward-induction numbers under a relabeled belief scalar (`ValuesMethodMatrix.beliefFor()`, a deterministic presentation-only heuristic derived from each column's V-value spread), not a real belief-state update. When P is unknown, displayed Q-values become directly editable regardless of the observability axis: `ValueIterationState.manualOverrides[`${stateId}:${actionId}`]` takes precedence over the computed value wherever a Q/V value is rendered (right-panel table and in-canvas labels). Overrides are presentation-layer only and are not included in graph import/export.

Values → Iteration's canvas is a persistent **52% left / 48% right split** (Phase 3b of the
Evaluate redesign roadmap — see `docs/superpowers/specs/2026-07-17-vi-screen-split-design.md`),
for the three quadrants that run `ValueIterationView`'s real Bellman-sweep computation (Value
Iteration, Belief Iteration, PO Q-Learning) — `unknown:full` (Learning Iteration) is unaffected
and keeps its own full-canvas Graph/Tree view. The left pane hosts a new **States** view
(`viStatesView.js`) — one section per computed sweep (`t = k`), each holding one per-state
backup card sourced directly from `ValueIterationState.getBackupDetail()`; hovering a section
previews that sweep's V/Q/policy on the shared right pane (`ValueIterationViewModel.hoveredSweepIndex`),
clicking pins it (`.pinnedSweepIndex`, click again to unpin) — the same hover/pin convention
`ExpectationViewModel.hoveredRun`/`selectedRunIndex` established for Monte Carlo's grid. The
right pane is the exact same `ValueIterationView.draw()` rendering as before this phase, just
translated and clipped into 48% of the canvas by `mainView.js`'s draw dispatch — no fit-transform
or internal rendering change, since VI already draws at real graph coordinates under the shared
pan/zoom viewport. Play/Step/Skip always advance the real live sweep regardless of what's pinned
for preview.

### Monte Carlo (Values → mc)

`ExpectationState` generates and stores multiple rollouts from the start state. Values → Monte Carlo's canvas is a persistent **52% left / 48% right split** (Phase 3a of the Evaluate redesign roadmap — see `docs/superpowers/specs/2026-07-16-mc-screen-split-design.md`), not the old mutually-exclusive grid/focused-run modes: the left pane toggles between **Grid** (today's mini-panel grid — `ExpectationViewModel.computeLayout()` lays rollouts into a grid of 16/32/64 panels and computes one shared fit-transform for rendering each rollout's graph into its mini-panel) and **Chart** (`expectationChartView.js` — Convergence + Histogram rendered inline via the same `chartDataBuilders.js` pure functions the bottom `ChartDock` uses, replacing that dock for Monte Carlo specifically; `ChartDock` itself still serves Values → Iteration unchanged) via the floating `[Grid | Chart]` pill (`mcLeftViewPill.js`). The right pane (`ExpectationView._drawGraphPanel()`) is a single always-visible rendering of the MDP graph — bare when nothing is selected, or with the selected run's visited-so-far path highlighted (`ExpectationViewModel.selectedRunIndex`, set by clicking a mini-panel; clicking the same panel again deselects). `expectationScrubber.js` drives a shared `currentT` across both panes. `ExpectationState.getPerStateMeans()` aggregates already-collected rollout data per visited state, feeding the MC column of the "Estimate vs exact" table.

### Evaluate π / Policy log (Build, Policy, Monte Carlo, Iteration — all four modes)

`PolicyEvaluationState` (`src/main/domain/policyEvaluationState.js`) is a third, deliberately
separate way to get a "value" out of the current MDP, alongside Value Iteration and Monte Carlo —
easy to conflate with either if you haven't read its own doc comment first:

- **Value Iteration's V\*** — the *optimal* value, via the Bellman *optimality* equation (`max_a`
  over actions in every backup). Policy-agnostic: it solves for the best possible policy, so it
  never looks at whatever π is currently configured.
- **Monte Carlo's E[G] estimate** — an *approximate*, current-policy-specific value, obtained by
  sampling rollouts under whichever policy π is currently configured and averaging the discounted
  return.
- **Evaluate π's V^π** — an *exact*, current-policy-specific value, obtained via the Bellman
  *expectation* equation (`sum_a pi(a|s) * ...` — no `max_a` anywhere) iterated to convergence for
  the SAME fixed π Monte Carlo is sampling, just computed exactly instead of sampled.

`PolicyEvaluationState.evaluate(graph, simulationState, startStateId, gamma, epsilon)` reuses
`SimulationState.getPolicyMode()` / `.getPolicyAction()` / `._normalizedProbsForState()` verbatim —
the same weighting logic `EdgeViewModel.policyEdgeProbability` and Build/Policy's own simulation
already use — so the evaluator and the canvas rendering can never disagree about what "the current
policy" means. It also owns `entries` (the **Policy log** — one shared list across all four modes,
not per-mode) via `addEntry()`/`clear()`. `topBar.js`'s always-visible, `modelKnown`-gated
**Evaluate π** button calls the `evaluatePolicy` use case, which appends a new log entry every
click; `rightPanel.js`'s **Policy log** section (rendered from all four modes' default panels)
lists every past entry (labeled `\pi_1`, `\pi_2`, ...), star-marking whichever is currently best.
Hovering a row previews that entry's policy on the canvas via `CanvasController.setPolicyPreview()`
/`clearPolicyPreview()` (a `previewPolicy`/`previewPolicyWeights` pair on `InteractionViewModel`,
never touching the real, live `simulationState.policy`); clicking a row calls
`restorePolicyFromLog()`, which does overwrite the real policy for good. Both
`policyEvaluationState.entries` and the preview pair are presentation-only and excluded from graph
import/export, same as `manualOverrides`/`modelKnown`/`observability`. Reset (in any mode) never
clears the log — only `rightPanel.js`'s "clear" link does (`CanvasController.clearPolicyLog()`);
the log is a cross-run record, not tied to any one simulation's/VI-run's lifecycle.

### Estimate vs exact (Values mode, both sub-views)

`RightPanel._renderEstimateVsExact()` renders a per-state comparison table (`MC | <method short label>`) after whichever panel (MC or Method) already rendered above it — this is where cross-method comparison lives now that the split canvas view is gone. In the two partial-observability quadrants a hint line clarifies that the "exact" column is really VI's real numbers under an illustrative belief label, not a true POMDP solution.

### Command Pattern

Structural edit operations (create, delete, rename, resize) go through `CommandHistory` (default 50-level undo stack); each command implements `execute()`/`undo()`. Move (dragging a node/text label) is deliberately **not** undo-able — `MoveNodeInteractor`'s `updateMove`/`finishMove` mutate position directly, no command created (per-pixel drag ticks would be noisy on the undo stack).

`resizeNode` (use case + `ResizeNodeCommand`) handles both node radius resize and **text label font-size resize** — `ResizeNodeInputData` carries either `nodeId` or `textLabelId` (mirroring `MoveNodeInputData`'s entity-agnostic shape; use `ResizeNodeInputData.forTextLabel(id, oldSize, newSize)`), and the interactor dispatches to `ResizeNodeCommand` or `ResizeTextLabelCommand` accordingly. Text labels resize by dragging their bottom-right corner (`GeometricHelper.isClickOnTextLabelCorner()`, mirroring `isClickOnNodeEdge()`'s "near the boundary" hit-test but for a rectangular bounding box); a selected text label draws a visible bounding-box outline + corner handle (`MainView._drawTextLabelHitBox()`) using the exact same geometry the hit-test uses, so the visible handle is always exactly where dragging resizes instead of moves. Font size is clamped to `[8, 72]`.

## Import/Export Format

Two export modes:

1. **Full export** (`includePositions=true`): node positions, edges, text labels — reimportable
2. **MDP export** (`includePositions=false`): transition matrices `P[s][a][s']` and rewards `R[s][a][s']` only

`Graph.serialize()`/`Graph.deserialize()` in `src/main/domain/graphObj.js` are the entry points. Example exports live in `test_schema/`. The top bar's filename menu no longer has standalone "Import JSON"/"Export JSON" entries (removed as redundant) — **Open…**/**Save** call `canvasController.importGraph()`/`exportGraph()` the same way; only **Export PNG** remains as a separate menu item.

## File Organization Patterns

- Use cases follow strict naming: `{action}{Entity}*` (e.g. `createNode`, `deleteNode`, `moveNode`); each is self-contained in its own directory
- View models expose read-only presentation state to views
- Controllers never directly modify domain objects — always go through interactors
- Presentation-only state that doesn't belong to the domain (mode, sub-view, `modelKnown`, `observability`, manual Q overrides, dock state, Policy π's derived Deterministic/Random toggle, the Policy log's entries/preview pair) lives on the viewmodel/domain-state layer, clearly commented as presentation-tier, and is excluded from serialization unless explicitly decided otherwise

## Common Workflows

### Adding a New Use Case

1. Create `src/main/use_case/{useCaseName}/` with `{useCaseName}InputBoundary.js`, `InputData.js`, `Interactor.js`, `OutputBoundary.js`, `Presenter.js`
2. Add `<script>` tags to `index.html` in the use-case block, in dependency order (domain already loaded above use cases; interactors before anything that constructs them)
3. Wire up in `main.js`: construct the interactor + presenter, inject into `CanvasController`
4. Add a method to `CanvasController.js` that builds the `InputData` and calls the interactor

### Modifying Graph Serialization

Edit `Graph.serialize()`/`Graph.deserialize()` in `src/main/domain/graphObj.js`. Re-check both export modes and re-run an import/export round trip against a `test_schema/*.json` fixture.

### Working with Animation Phases

Simulation phases live in `SimulationState`, orchestrated by `SimulationPresenter`; Value Iteration's column-sweep animation lives in `ValueIterationState`/`viAnimator.js`. Adjust `phaseDuration`-style values in the relevant interactor/animator, not in the view.

### Past design decisions

`docs/superpowers/plans/` and `docs/superpowers/specs/` contain dated planning docs for major past changes (e.g. the dark-theme "Values mode" redesign, the original Monte Carlo/"expectation mode" design) — check there for the reasoning behind existing architecture before re-deriving it from scratch.

### Where to save new plans

When writing a new implementation plan for this repo, save it to `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`, matching the existing docs above.
