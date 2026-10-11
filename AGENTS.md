# Repository Guidelines

These are the short, agent-agnostic guidelines for RLViz. `CLAUDE.md` holds the full architecture
reference (mode system, Values-mode method matrix, theming rules, design history pointers) and is
the source of truth when the two disagree.

## Project Structure & Module Organization

RLViz is a browser-based MDP graph editor and simulator. `index.html` loads plain JavaScript files in dependency order; `style.css` styles the DOM controls, and `libraries/` contains vendored dependencies and fonts. Code under `src/main/` follows four layers: `domain/` holds graph, simulation, and learning state; `use_case/` holds application operations (one folder per use case: `*InputData.js`, `*Interactor.js`, `*Presenter.js`); `adapter/` holds the controller and view models; `view/` draws the p5 canvas and HTML controls. `app/main.js` wires everything together and registers the mode-lifecycle hooks. `test_schema/` contains sample graph JSON, while `docs/superpowers/` records design history (`plans/` and `specs/`, dated).

## Build, Test, and Development Commands

There is no build step, package manager, or automated test command. Run `python3 -m http.server 8000` from the repository root, then open `http://localhost:8000`. A local server avoids browser restrictions on `file://` loading. Do not add a new source file without adding its `<script>` tag to `index.html` before code that uses it; keep `app/main.js` last.

## Coding Style & Architecture

Follow the surrounding JavaScript style: four-space indentation, `camelCase` methods and fields, and `PascalCase` constructors. Keep domain calculations in `domain/`, user actions in use-case interactors, and rendering in `view/`. Route input through `CanvasController`; controllers never mutate domain objects directly. Presentation-only state (`mode`, `valuesSubView`, `modelKnown`, `observability`, Q-learning state, the Policy log) lives on the viewmodel/domain-state layer and is excluded from graph import/export. For UI colors, add tokens to both themes in `src/main/view/helpers/AppPalette.js` and reference them as `AppPalette.<ns>.<key>` on canvas or `var(--<ns>-<key>)` in CSS; never hardcode a hex. No formatter or linter is configured.

## Values Mode: What Runs Where

The top-bar **Iteration** segment is a 2×2 matrix on (P known/unknown × observability), both set from the Parameters popover:

- **P known, Full** → Value Iteration (real Bellman backups; stop condition is the Infinite/Finite Time toggle, not epsilon).
- **P unknown, Full** → Learning Iteration (`qLearningState.js`): real episodic tabular Q-learning with ε-greedy/UCB/Softmax/Optimistic exploration. The agent never reads the real P; it learns P̂ = N(s,a,s′)/N(s,a), shown on canvas edges and in the panel's "Learned transition model" table. Play = continuous episodes, Step = one, Skip = 50, Max steps = episode cap.
- **Partial** (either P) → **In development** placeholder (`inDevelopmentCard.js`). The old POMDP code (`domain/pomdp*.js`, `use_case/pomdp/`, `RightPanel._renderPomdpPanel`) is deprecated and unreachable; don't build on it.

## Testing Guidelines

Verify changes in a browser, including the console and both light and dark themes. Exercise affected Build, Policy, Monte Carlo, and Iteration flows as relevant; a headless `playwright-core` script against the local server works well for this. For graph serialization, round-trip a `test_schema/*.json` fixture through Open and Save. For value-method work, check both known and unknown transition models and confirm the partial-observability placeholder still appears. There is no coverage target or test-file naming convention.

## Commits & Pull Requests

Recent commits use short, action-led subjects such as "Update README" and "Merge main (Infinite/Finite Time VI stop condition) into pomdps"; no prefix scheme is enforced. Keep commits focused. In a pull request, describe the behavior changed, manual checks performed, and any relevant issue or design document. Include screenshots or a short recording for visible canvas or panel changes. Do not commit `.DS_Store`.
