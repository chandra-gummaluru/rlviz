# Evaluate Redesign Phase 2: Evaluate π + Policy Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an **Evaluate π** button (next to Renormalize, in every mode) that computes the exact
value of whatever policy is currently configured — via the Bellman *expectation* equation, no
`max_a` — and logs it to a new **Policy log** panel with hover-preview and click-to-restore.

**Architecture:** New domain entity `PolicyEvaluationState` owns both the log and the actual
fixed-policy Bellman-expectation algorithm (mirroring how `ValueIterationState` owns both its
history and its own Bellman-optimality algorithm). A new use case `evaluatePolicy` (mirroring
`runVI`'s exact file shape) is a thin orchestrator: validate → call the domain entity → append a
log entry → present. Small, additive changes to `CanvasController`/`InteractionViewModel`/
`EdgeViewModel` add hover-preview + restore-from-log. `topBar.js` gets one new always-visible,
modelKnown-gated button. `rightPanel.js` gets one new shared section rendered from all four modes'
existing panel-render methods.

**Tech Stack:** Vanilla JS, p5.js + DOM chrome, no build step, no test framework (per `CLAUDE.md`).

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-07-16-evaluate-pi-policy-log-design.md` —
  read it once before starting Task 1.
- **No `max_a` anywhere in `PolicyEvaluationState.evaluate()`** — this is the single most
  important constraint in this plan; using `max_a` would make this feature mathematically
  identical to (and redundant with) `ValueIterationState`, defeating its entire purpose. Every
  per-state backup must be a probability-weighted sum over the CURRENT policy's own action
  distribution (deterministic → 1.0 on the chosen action, weighted → normalized slider weights,
  uniform → 1/n), read via `simulationState.getPolicyMode()`/`.getPolicyAction()`/
  `._normalizedProbsForState()` — reuse these exactly, do not reimplement the weighting logic.
- No changes to `ValueIterationState`, its use cases, or its UI — Value Iteration is completely
  untouched by this phase.
- Evaluate π is disabled (not hidden) whenever `viewModel.modelKnown === false` — both P-unknown
  quadrants (Learning Iteration, PO Q-Learning). Enabled otherwise, in every mode.
- Evaluate π is always visible (never hidden) in Build, Policy, Monte Carlo, and Iteration alike —
  unlike Renormalize, which still hides in Values mode exactly as it does today; do not change
  Renormalize's own show/hide behavior.
- No new Parameters slider. `gamma` reuses `rightPanel.discountFactor` (same shared value
  Build/Policy/VI already read via `ensureVIInitialized()`'s own `rightPanel ? rightPanel.discountFactor : 0.9`
  pattern). `epsilon` defaults to `0.01` via the InputData constructor default, mirroring
  `RunVIInputData`'s own `epsilon = 0.01` default exactly — there is no existing epsilon slider in
  this app yet (that's a later phase), so do not add one.
- The button sits immediately after the existing Renormalize button in `topBar.js`'s creation
  order (matching the user's "next to Renormalize" request) — do NOT reorder the existing
  Run/Step/Reset/Renormalize buttons to match the external handoff's stated order; that reorder
  was not requested and risks an unrelated regression.
- Hovering a Policy log row must NEVER mutate `simulationState.policy`/`.policyWeights` (the real,
  live policy) — only a separate `previewPolicy`/`previewPolicyWeights` pair. Only clicking a row
  mutates the real policy.
- No automated test suite exists. Every task's verification step is a concrete manual/headless-
  browser check (`python3 -m http.server 8010` from the repo root; check if a server is already
  running on that port first). Check both light and dark theme.

---

### Task 1: `PolicyEvaluationState` — domain entity (log + fixed-policy Bellman expectation)

**Files:**
- Create: `src/main/domain/policyEvaluationState.js`
- Modify: `index.html` (script tag, alongside the other domain files — find where
  `valueIterationState.js`/`expectationState.js` are loaded and add this next to them)

**Interfaces:**
- Produces: `new PolicyEvaluationState()`, `policyEvaluationState.entries` (array, see shape
  below), `policyEvaluationState.evaluate(graph, simulationState, startStateId, gamma, epsilon = 0.01) ->
  { valueAtStart, valuesByState }` (pure computation, does NOT push to `entries`),
  `policyEvaluationState.addEntry({ valueAtStart, valuesByState, policySnapshot, policyWeightsSnapshot }) -> entry`
  (pushes a new, fully-formed entry — computes `label`/`id`/`isBest`, recomputes every other
  entry's `isBest` too), `policyEvaluationState.clear()`. Later tasks (2, 5) call all of these by
  these exact names.

- [ ] **Step 1: Write `policyEvaluationState.js`**

```js
// Domain entity: exact evaluation of a FIXED policy (not the optimal one Value Iteration
// computes). Owns both the log of past evaluations and the algorithm itself, mirroring
// ValueIterationState's own "owns history + owns the Bellman backup" shape.
//
// evaluate() iterates the Bellman EXPECTATION backup - V(s) = sum_a pi(a|s) * sum_s' P(s'|s,a) *
// [R + gamma*V(s')] - to convergence. There is NO max_a anywhere here: pi(a|s) comes from
// whatever the user actually configured (simulationState.policy/.policyWeights), via the SAME
// getPolicyMode()/_normalizedProbsForState() weighting logic Build/Policy mode's own simulation
// and canvas rendering already use - reused verbatim, not reimplemented. Using max_a here would
// make this identical to (and redundant with) ValueIterationState's V*.
class PolicyEvaluationState {
    constructor() {
        this.entries = [];
    }

    // Pure computation - does not mutate this.entries. startStateId is required to report
    // valueAtStart (unlike ValueIterationState, which reports every state and has no single
    // "start" concept baked into the algorithm itself).
    evaluate(graph, simulationState, startStateId, gamma, epsilon = 0.01) {
        const states = graph.nodes.filter(n => n.type === 'state');
        const stateIds = states.map(s => s.id);

        let V = {};
        stateIds.forEach(id => { V[id] = 0; });

        const MAX_SWEEPS = 500; // safety cap - well-behaved MDPs (gamma < 1) converge far sooner
        for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
            const V_next = {};
            let delta = 0;

            stateIds.forEach(stateId => {
                const stateNode = graph.getNodeById(stateId);
                const actions = (stateNode && stateNode.actions) ? stateNode.actions : [];
                if (actions.length === 0) {
                    V_next[stateId] = 0;
                    return;
                }

                const actionProbs = this._actionProbsForState(simulationState, stateId, actions);

                let value = 0;
                actions.forEach(actionId => {
                    const prob = actionProbs.get(Number(actionId)) ?? 0;
                    if (prob === 0) return;
                    const actionNode = graph.getNodeById(actionId);
                    const transitions = (actionNode && actionNode.sas) ? actionNode.sas : [];
                    let Q = 0;
                    transitions.forEach(({ nextState, probability, reward }) => {
                        const nextValue = V[nextState] ?? 0;
                        Q += probability * (reward + gamma * nextValue);
                    });
                    value += prob * Q;
                });

                V_next[stateId] = value;
                const d = Math.abs(value - (V[stateId] ?? 0));
                if (d > delta) delta = d;
            });

            V = V_next;
            if (delta < epsilon) break;
        }

        return { valueAtStart: V[startStateId] ?? 0, valuesByState: V };
    }

    // Map<actionId, probability> for one state, under the CURRENT policy - deterministic gets
    // 1.0 on the chosen action, weighted gets the normalized slider weights, uniform splits
    // evenly. Mirrors EdgeViewModel.policyEdgeProbability's own branching on getPolicyMode()
    // exactly, so canvas rendering and this evaluator never disagree about what the policy means.
    _actionProbsForState(simulationState, stateId, actions) {
        const policyMode = simulationState.getPolicyMode(stateId);
        if (policyMode === 'deterministic') {
            const chosen = simulationState.getPolicyAction(stateId);
            const probs = new Map();
            actions.forEach(a => probs.set(Number(a), Number(a) === Number(chosen) ? 1 : 0));
            return probs;
        }
        if (policyMode === 'weighted') {
            const probs = simulationState._normalizedProbsForState(stateId, actions);
            if (probs) return probs;
        }
        const uniform = new Map();
        actions.forEach(a => uniform.set(Number(a), 1 / actions.length));
        return uniform;
    }

    // Appends a fully-formed entry (label/id/isBest computed here) and returns it. Recomputes
    // isBest across ALL entries (not just the new one) since a new entry could tie-break or
    // simply not beat the existing best - only one entry is ever isBest at a time, ties keep
    // whichever was logged first.
    addEntry({ valueAtStart, valuesByState, policySnapshot, policyWeightsSnapshot }) {
        const entry = {
            id: this.entries.length + 1,
            label: `\\pi_{${this.entries.length + 1}}`,
            valueAtStart,
            valuesByState,
            policySnapshot,
            policyWeightsSnapshot,
            isBest: false
        };
        this.entries.push(entry);

        let bestIdx = 0;
        for (let i = 1; i < this.entries.length; i++) {
            if (this.entries[i].valueAtStart > this.entries[bestIdx].valueAtStart) bestIdx = i;
        }
        this.entries.forEach((e, i) => { e.isBest = (i === bestIdx); });

        return entry;
    }

    clear() {
        this.entries = [];
    }
}
```

- [ ] **Step 2: Register the script tag**

In `index.html`, find the line loading `src/main/domain/valueIterationState.js` (or
`expectationState.js`) and add immediately after it:
```html
    <script src="src/main/domain/policyEvaluationState.js"></script>
```

- [ ] **Step 3: Verify in browser**

```bash
python3 -m http.server 8010
```
Open `http://localhost:8010/index.html`, console:
```js
const pes = new PolicyEvaluationState();
pes.entries                          // []

// Build a tiny 2-state, 2-action deterministic-policy graph:
const mk = (type, x, y) => {
    canvasController.interactors.createNode.execute(new CreateNodeInputData(type, x, y));
    return canvasViewModel.graph.nodes[canvasViewModel.graph.nodes.length - 1];
};
const s0 = mk('state', 100, 100);
const a0 = mk('action', 250, 100);
const a1 = mk('action', 250, 200);
const s1 = mk('state', 400, 100);
canvasController.createEdge(s0.id, a0.id);
canvasController.createEdge(s0.id, a1.id);
canvasController.createEdge(a0.id, s1.id, 1.0, 10);   // a0 -> s1, reward 10
canvasController.createEdge(a1.id, s1.id, 1.0, 0);    // a1 -> s1, reward 0
canvasController.createEdge(s1.id, mk('action', 550, 100).id); // s1 needs an action too (dead-ends otherwise)
canvasViewModel.simulationState.setPolicyAction(s0.id, a0.id); // deterministic: always take a0

const result = pes.evaluate(canvasViewModel.graph, canvasViewModel.simulationState, s0.id, 0.9, 0.01);
result.valueAtStart   // should be close to 10 (reward from a0, s1 has no further reward source here)
result.valuesByState[s0.id] === result.valueAtStart   // true

const entry1 = pes.addEntry({ valueAtStart: result.valueAtStart, valuesByState: result.valuesByState, policySnapshot: {...canvasViewModel.simulationState.policy}, policyWeightsSnapshot: {} });
entry1.label          // '\\pi_{1}'
entry1.isBest          // true

// Now switch the policy to always take a1 (reward 0) and evaluate again:
canvasViewModel.simulationState.setPolicyAction(s0.id, a1.id);
const result2 = pes.evaluate(canvasViewModel.graph, canvasViewModel.simulationState, s0.id, 0.9, 0.01);
const entry2 = pes.addEntry({ valueAtStart: result2.valueAtStart, valuesByState: result2.valuesByState, policySnapshot: {...canvasViewModel.simulationState.policy}, policyWeightsSnapshot: {} });
entry2.isBest          // false (a1's policy is worse - entry1 stays best)
pes.entries[0].isBest  // true (still entry1)
pes.clear();
pes.entries            // []
```
Expected: every line matches the comment. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/domain/policyEvaluationState.js index.html
git commit -m "Add PolicyEvaluationState: exact fixed-policy Bellman-expectation evaluator + log"
```

---

### Task 2: `evaluatePolicy` use case (mirrors `runVI`'s exact shape)

**Files:**
- Create: `src/main/use_case/evaluatePolicy/evaluatePolicyInputBoundary.js`
- Create: `src/main/use_case/evaluatePolicy/evaluatePolicyInputData.js`
- Create: `src/main/use_case/evaluatePolicy/evaluatePolicyInteractor.js`
- Create: `src/main/use_case/evaluatePolicy/evaluatePolicyOutputBoundary.js`
- Create: `src/main/use_case/evaluatePolicy/evaluatePolicyPresenter.js`
- Modify: `index.html` (5 script tags, in the use-case block, dependency order — InputBoundary/
  InputData/OutputBoundary before Interactor/Presenter, matching how `runVI`'s own 5 files are
  ordered in `index.html` today; find that block and add this one alongside it)

**Interfaces:**
- Consumes: `PolicyEvaluationState` (Task 1).
- Produces: `new EvaluatePolicyInteractor(graph, simulationState, policyEvaluationState, outputBoundary, startNodeProvider)`,
  `interactor.execute(new EvaluatePolicyInputData(gamma, epsilon))`,
  `EvaluatePolicyOutputBoundary.presentEvaluated(entry)` / `.presentError(message)`. Later tasks
  (3, 6) construct and wire these by these exact names.

Read `src/main/use_case/valueIteration/runVIInputBoundary.js`, `runVIInputData.js`,
`runVIInteractor.js`, `viOutputBoundary.js`, and `viPresenter.js` in full first — this task's files
mirror that shape as closely as the different domain concern allows.

- [ ] **Step 1: `evaluatePolicyInputBoundary.js`**

```js
// Input boundary for Evaluate Policy use case
class EvaluatePolicyInputBoundary {
    execute(inputData) { throw new Error('Not implemented'); }
}
```

- [ ] **Step 2: `evaluatePolicyInputData.js`**

```js
// Input data for Evaluate Policy use case. epsilon's default (0.01) matches RunVIInputData's own
// default exactly - there is no epsilon slider in this app yet (a later phase adds one to VI;
// this reuses the same fixed default rather than anticipating that slider).
class EvaluatePolicyInputData {
    constructor(gamma, epsilon = 0.01) {
        this.gamma = gamma;
        this.epsilon = epsilon;
    }
}
```

- [ ] **Step 3: `evaluatePolicyOutputBoundary.js`**

```js
// Output boundary interface for the Evaluate Policy use case
class EvaluatePolicyOutputBoundary {
    presentEvaluated(entry) { throw new Error('Not implemented'); }
    presentError(message) { throw new Error('Not implemented'); }
}
```

- [ ] **Step 4: `evaluatePolicyInteractor.js`**

```js
// Interactor for Evaluate Policy - thin, mirroring RunVIInteractor's own division of labor: no
// Bellman math here, that lives entirely on PolicyEvaluationState.evaluate(). This interactor's
// only job is validate -> call the domain entity -> snapshot the policy -> append a log entry ->
// present.
class EvaluatePolicyInteractor extends EvaluatePolicyInputBoundary {
    constructor(graph, simulationState, policyEvaluationState, outputBoundary, startNodeProvider) {
        super();
        this.graph = graph;
        this.simulationState = simulationState;
        this.policyEvaluationState = policyEvaluationState;
        this.outputBoundary = outputBoundary;
        this.startNodeProvider = startNodeProvider;
    }

    execute(inputData) {
        const startNode = this.startNodeProvider();
        if (!startNode) {
            this.outputBoundary.presentError('Please select a start node first');
            return;
        }

        const result = this.policyEvaluationState.evaluate(
            this.graph, this.simulationState, startNode.id, inputData.gamma, inputData.epsilon
        );

        // Deep-ish snapshot: policy is flat {stateId: actionId} (safe to shallow-copy);
        // policyWeights is one level nested ({stateId: {actionId: weight}}) so each state's inner
        // object needs its own copy too, or a later live edit would silently mutate this "frozen"
        // snapshot through the shared reference.
        const policySnapshot = { ...this.simulationState.policy };
        const policyWeightsSnapshot = {};
        Object.entries(this.simulationState.policyWeights).forEach(([stateId, weights]) => {
            policyWeightsSnapshot[stateId] = { ...weights };
        });

        const entry = this.policyEvaluationState.addEntry({
            valueAtStart: result.valueAtStart,
            valuesByState: result.valuesByState,
            policySnapshot,
            policyWeightsSnapshot
        });

        this.outputBoundary.presentEvaluated(entry);
    }
}
```

- [ ] **Step 5: `evaluatePolicyPresenter.js`**

Read `src/main/use_case/valueIteration/viPresenter.js` first to match its constructor/callback
convention exactly (it likely takes a `redrawCallback` or similar and/or holds a reference the
controller sets up in `main.js` — do not guess the shape, copy the established pattern). A
reasonable shape consistent with this codebase's other presenters:
```js
// Presenter for Evaluate Policy - triggers whatever UI refresh main.js wires up (right panel's
// Policy log section) whenever a new entry lands, same role viPresenter.js plays for VI's own
// sweep-complete event.
class EvaluatePolicyPresenter extends EvaluatePolicyOutputBoundary {
    constructor(onEvaluated, onError) {
        super();
        this.onEvaluated = onEvaluated;
        this.onError = onError;
    }

    presentEvaluated(entry) {
        if (this.onEvaluated) this.onEvaluated(entry);
    }

    presentError(message) {
        if (this.onError) this.onError(message);
    }
}
```
(If `viPresenter.js`'s actual constructor shape differs meaningfully from this guess - e.g. it
takes a full output-model object instead of two callbacks - adapt this file to match that same
convention instead, for consistency across the codebase's presenters.)

- [ ] **Step 6: Register the 5 script tags**

In `index.html`, find the use-case block (where `runVI*.js`'s 5 files are loaded) and add:
```html
    <script src="src/main/use_case/evaluatePolicy/evaluatePolicyInputBoundary.js"></script>
    <script src="src/main/use_case/evaluatePolicy/evaluatePolicyInputData.js"></script>
    <script src="src/main/use_case/evaluatePolicy/evaluatePolicyOutputBoundary.js"></script>
    <script src="src/main/use_case/evaluatePolicy/evaluatePolicyInteractor.js"></script>
    <script src="src/main/use_case/evaluatePolicy/evaluatePolicyPresenter.js"></script>
```

- [ ] **Step 7: Verify in browser**

Reuse Task 1's test graph. Console:
```js
let lastEntry = null, lastError = null;
const presenter = new EvaluatePolicyPresenter(
    (entry) => { lastEntry = entry; },
    (msg) => { lastError = msg; }
);
const pes2 = new PolicyEvaluationState();
const interactor = new EvaluatePolicyInteractor(
    canvasViewModel.graph, canvasViewModel.simulationState, pes2, presenter,
    () => canvasViewModel.startNode
);

// No start node set yet on a fresh viewModel.startNode (if already set from Task 1's testing,
// clear it first): canvasViewModel.startNode = null;
interactor.execute(new EvaluatePolicyInputData(0.9));
lastError    // 'Please select a start node first' (if startNode was null)

canvasViewModel.startNode = s0;   // reuse Task 1's s0
interactor.execute(new EvaluatePolicyInputData(0.9));
lastEntry.label       // '\\pi_{1}'
pes2.entries.length   // 1
```
Expected: every line matches. No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/main/use_case/evaluatePolicy/ index.html
git commit -m "Add evaluatePolicy use case (mirrors runVI's shape)"
```

---

### Task 3: Hover-preview + restore-from-log plumbing (viewmodel/controller)

**Files:**
- Modify: `src/main/adapter/viewmodel/InteractionViewModel.js` (constructor, `reset()`)
- Modify: `src/main/adapter/viewmodel/EdgeViewModel.js` (`policyEdgeProbability`)
- Modify: `src/main/adapter/controller/CanvasController.js` (new method)

**Interfaces:**
- Produces: `interaction.previewPolicy`/`.previewPolicyWeights` (both `null` by default),
  `canvasController.setPolicyPreview(policySnapshot, policyWeightsSnapshot)`,
  `canvasController.clearPolicyPreview()`, `canvasController.restorePolicyFromLog(entry)`. Later
  tasks (5, 6) call all of these by these exact names.

- [ ] **Step 1: Add preview fields to `InteractionViewModel`**

In `src/main/adapter/viewmodel/InteractionViewModel.js`, change:
```js
        // Hover state
        this.hoveredNode = null;
        this.hoveredEdge = null;
```
to:
```js
        // Hover state
        this.hoveredNode = null;
        this.hoveredEdge = null;

        // Policy log hover-preview (Evaluate pi Phase 2): when hovering a Policy log row, this
        // holds that row's SNAPSHOTTED policy/policyWeights so EdgeViewModel.policyEdgeProbability
        // can render it on the graph WITHOUT touching the real, live simulationState.policy -
        // only clicking a row (CanvasController.restorePolicyFromLog) mutates the real policy.
        this.previewPolicy = null;
        this.previewPolicyWeights = null;
```
And in `reset()`, change:
```js
        this.hoveredNode = null;
        this.hoveredEdge = null;
        this.clearEditorFocus();
```
to:
```js
        this.hoveredNode = null;
        this.hoveredEdge = null;
        this.previewPolicy = null;
        this.previewPolicyWeights = null;
        this.clearEditorFocus();
```

- [ ] **Step 2: Make `EdgeViewModel.policyEdgeProbability` preview-aware**

Read the current method in full first (quoted below from this plan's own research - confirm it
still matches before editing):
```js
    get policyEdgeProbability() {
        if (this.interactionViewModel.mode !== 'build' && this.interactionViewModel.mode !== 'policy') return null;
        if (!this.simulationState) return null;
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();
        if (from.type !== 'state' || to.type !== 'action') return null;

        const policyMode = this.simulationState.getPolicyMode(from.id);
        if (policyMode === 'deterministic') {
            return this.simulationState.getPolicyAction(from.id) === to.id ? 1.0 : null;
        }
        if (policyMode === 'weighted') {
            const probs = this.simulationState._normalizedProbsForState(from.id, from.actions || []);
            if (!probs) return null;
            return probs.get(Number(to.id)) ?? null;
        }
        return null;
    }
```
Change it to prefer the preview pair when one is active:
```js
    get policyEdgeProbability() {
        if (this.interactionViewModel.mode !== 'build' && this.interactionViewModel.mode !== 'policy') return null;
        if (!this.simulationState) return null;
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();
        if (from.type !== 'state' || to.type !== 'action') return null;

        // Policy log hover-preview takes priority over the live policy - reads the same
        // getPolicyMode()-shaped logic but against the SNAPSHOT, not simulationState itself.
        const previewPolicy = this.interactionViewModel.previewPolicy;
        if (previewPolicy) {
            const previewWeights = this.interactionViewModel.previewPolicyWeights || {};
            const deterministicAction = previewPolicy[from.id];
            if (deterministicAction !== undefined && deterministicAction !== null) {
                return Number(deterministicAction) === Number(to.id) ? 1.0 : null;
            }
            const weights = previewWeights[from.id];
            if (weights) {
                const actions = from.actions || [];
                const sum = actions.reduce((s, a) => s + (weights[a] ?? 0), 0);
                if (sum <= 0) return null;
                return (weights[to.id] ?? 0) / sum;
            }
            return null; // previewed state has no explicit policy entry - uniform, nothing to highlight
        }

        const policyMode = this.simulationState.getPolicyMode(from.id);
        if (policyMode === 'deterministic') {
            return this.simulationState.getPolicyAction(from.id) === to.id ? 1.0 : null;
        }
        if (policyMode === 'weighted') {
            const probs = this.simulationState._normalizedProbsForState(from.id, from.actions || []);
            if (!probs) return null;
            return probs.get(Number(to.id)) ?? null;
        }
        return null;
    }
```

- [ ] **Step 3: Add the three `CanvasController` methods**

Read the current `setPolicyAction`/`setPolicyWeight` methods first (near
`CanvasController.js:660-673` per this plan's own research) to place these consistently nearby:
```js
    // Policy log hover-preview (Evaluate pi Phase 2) - sets/clears the preview pair
    // EdgeViewModel.policyEdgeProbability reads, WITHOUT touching the real simulationState.policy.
    setPolicyPreview(policySnapshot, policyWeightsSnapshot) {
        this.viewModel.interaction.previewPolicy = policySnapshot;
        this.viewModel.interaction.previewPolicyWeights = policyWeightsSnapshot;
    }

    clearPolicyPreview() {
        this.viewModel.interaction.previewPolicy = null;
        this.viewModel.interaction.previewPolicyWeights = null;
    }

    // Restores a Policy log entry's snapshotted policy for REAL - overwrites the live
    // simulationState.policy/.policyWeights (shallow-copying the snapshot again so later edits to
    // the live policy don't retroactively mutate the log entry itself, mirroring
    // EvaluatePolicyInteractor's own snapshot-on-log discipline).
    restorePolicyFromLog(entry) {
        this.viewModel.simulationState.policy = { ...entry.policySnapshot };
        const weights = {};
        Object.entries(entry.policyWeightsSnapshot).forEach(([stateId, w]) => {
            weights[stateId] = { ...w };
        });
        this.viewModel.simulationState.policyWeights = weights;
    }
```

- [ ] **Step 4: Verify in browser**

Reuse Task 1's test graph (s0 with a0/a1, deterministic policy). Console:
```js
canvasViewModel.interaction.previewPolicy       // null
canvasController.setPolicyPreview({ [s0.id]: a1.id }, {});
canvasViewModel.interaction.previewPolicy[s0.id] === a1.id   // true
// Build an EdgeViewModel for the s0->a1 edge and confirm policyEdgeProbability reads the preview:
const s0a1Edge = canvasViewModel.graph.edges.find(e => e.getFromNode().id === s0.id && e.getToNode().id === a1.id);
canvasViewModel.createEdgeViewModel(s0a1Edge).policyEdgeProbability   // 1.0
canvasController.clearPolicyPreview();
canvasViewModel.interaction.previewPolicy       // null
// Now confirm restore works:
canvasViewModel.simulationState.setPolicyAction(s0.id, a0.id);
const fakeEntry = { policySnapshot: { [s0.id]: a1.id }, policyWeightsSnapshot: {} };
canvasController.restorePolicyFromLog(fakeEntry);
canvasViewModel.simulationState.getPolicyAction(s0.id) === a1.id   // true (restored)
```
Expected: every line matches. No console errors. Check both light and dark theme (no visual
change expected yet from this task alone - this is plumbing only, Task 5 wires the actual hover/
click UI that calls these methods).

- [ ] **Step 5: Commit**

```bash
git add src/main/adapter/viewmodel/InteractionViewModel.js src/main/adapter/viewmodel/EdgeViewModel.js src/main/adapter/controller/CanvasController.js
git commit -m "Add policy-preview and restore-from-log plumbing to viewmodel/controller"
```

---

### Task 4: `topBar.js` — Evaluate π button

**Files:**
- Modify: `src/main/view/topBar.js`

**Interfaces:**
- Produces: `topBar.evaluatePiBtn`, `topBar.setEvaluatePolicyEnabled(enabled)`,
  `topBar.callbacks.onEvaluatePolicy()` (new callback, fired on click). Later task (6) wires this
  callback and calls `setEvaluatePolicyEnabled` from `main.js`.

- [ ] **Step 1: Create the button, positioned right after Renormalize**

Read the current button-creation block first (near `topBar.js:560-565` per this plan's own
research: `renormalizeBtn` created first, then `playPauseBtn`/`stepBtn`/`rerunBtn`). Insert
immediately after the `renormalizeBtn` creation line:
```js
        this.renormalizeBtn = this._createBtn('⟳ Renormalize', () => this.callbacks.onRenormalize(), 'toolbar-btn--renormalize');
```
add:
```js

        // Evaluate pi: unlike every other button in this cluster, this one is ALWAYS visible in
        // all four modes (Build/Policy/Monte Carlo/Iteration) - it's never hidden by setMode()'s
        // per-mode show/hide dance the way playPauseBtn/renormalizeBtn etc. are, only ever
        // enabled/disabled via setEvaluatePolicyEnabled() (see main.js's onModelKnownToggle
        // wiring). Shown once here at creation time and never hidden again.
        this.evaluatePiBtn = this._createBtn('Evaluate π', () => this.callbacks.onEvaluatePolicy(), 'toolbar-btn--evaluate-pi');
        this.evaluatePiBtn.show();
```

- [ ] **Step 2: Add `setEvaluatePolicyEnabled`**

Add near the existing `setPlayPauseEnabled`/`setStepEnabled` methods (`topBar.js:784-796` per this
plan's own research):
```js
    setEvaluatePolicyEnabled(enabled) {
        if (this.evaluatePiBtn) {
            if (enabled) this.evaluatePiBtn.removeAttribute('disabled');
            else this.evaluatePiBtn.attribute('disabled', '');
        }
    }
```

- [ ] **Step 3: Verify in browser**

Reload the app. Confirm the "Evaluate π" button is visible next to Renormalize in Build mode.
Switch to Policy mode - confirm still visible. Switch to Values mode (Monte Carlo, then
Iteration via the top bar) - confirm it's STILL visible in both (unlike Renormalize, which
disappears in Values mode - confirm that regression didn't happen, Renormalize should still hide
exactly as before). In the console:
```js
topBar.setEvaluatePolicyEnabled(false);
// Confirm visually: button looks disabled/greyed, not clickable.
topBar.setEvaluatePolicyEnabled(true);
// Confirm visually: button looks normal/clickable again.
```
No console errors (clicking it is expected to do nothing yet - `onEvaluatePolicy` isn't wired
until Task 6). Both themes.

- [ ] **Step 4: Commit**

```bash
git add src/main/view/topBar.js
git commit -m "Add Evaluate pi button to topBar.js, always visible, modelKnown-gated"
```

---

### Task 5: `rightPanel.js` — Policy log section

**Files:**
- Modify: `src/main/view/rightPanel.js`

**Interfaces:**
- Consumes: `canvasController.setPolicyPreview`/`.clearPolicyPreview`/`.restorePolicyFromLog`
  (Task 3), `policyEvaluationState` (Task 1 — the RightPanel instance needs a reference to it;
  read `RightPanel`'s constructor first to see how it already receives sibling state like
  `valueIterationState`/`expectationState`, and add `policyEvaluationState` the same way, since
  `main.js` constructs `RightPanel` and would need to pass it in — note this dependency for
  Task 6, which does that wiring).
- Produces: `RightPanel._renderPolicyLog()` (shared section-render method), called from
  `renderBuildPanel()`, `renderPolicyModePanel()`, `renderValueIterationPanel()`, and
  `renderExpectationPanel()`.

- [ ] **Step 1: Confirm how `RightPanel` receives sibling domain state, and thread through `policyEvaluationState`**

Read `RightPanel`'s constructor (`rightPanel.js:50` per this plan's own research) and confirm how
it already receives e.g. `valueIterationState`/`expectationState` (constructor parameters, or set
as properties after construction by `main.js`). Add `policyEvaluationState` the same way,
following whichever exact pattern those two already use — do not invent a different wiring
convention for this one field.

- [ ] **Step 2: Write `_renderPolicyLog()`**

Add this method near `_renderEstimateVsExact()` (`rightPanel.js:1344` per this plan's own
research) — read that method first for this file's established row-building/styling conventions
(font sizes, `panel-section-content` class usage, etc.) and match them:
```js
    // Shared "Policy log" section, appended in all four modes' panels (Build/Policy/Monte Carlo/
    // Iteration) - the log is mode-independent, so this renders identically everywhere it's
    // called from. Hovering a row previews that entry's policy on the graph (via
    // CanvasController.setPolicyPreview - does NOT touch the real, live policy); clicking a row
    // restores it for real (CanvasController.restorePolicyFromLog).
    _renderPolicyLog() {
        this.createSection('Policy log', () => {
            const container = createDiv();
            container.parent(this.contentContainer);
            container.addClass('panel-section-content');

            const header = createDiv();
            header.parent(container);
            header.style('display', 'flex');
            header.style('justify-content', 'space-between');
            header.style('align-items', 'baseline');
            header.style('margin-bottom', '6px');

            const clearLink = createSpan('clear');
            clearLink.parent(header);
            clearLink.addClass('panel-link-muted');
            clearLink.mousePressed(() => {
                this.controller.clearPolicyLog();
                this.updateContent();
            });

            const entries = this.viewModel.policyEvaluationState
                ? this.viewModel.policyEvaluationState.entries
                : [];

            if (entries.length === 0) {
                const empty = createDiv('Click Evaluate π to log the current policy\'s exact value.');
                empty.parent(container);
                empty.addClass('panel-muted-note');
                return;
            }

            entries.forEach(entry => {
                const row = createDiv();
                row.parent(container);
                row.addClass('policy-log-row');

                const label = createDiv();
                label.parent(row);
                label.addClass('policy-log-row-label');
                label.elt.innerHTML = renderKatex(entry.label);

                const tCol = createDiv('—');
                tCol.parent(row);
                tCol.addClass('policy-log-row-t');

                const valueCol = createDiv(entry.valueAtStart.toFixed(2) + (entry.isBest ? ' ★' : ''));
                valueCol.parent(row);
                valueCol.addClass('policy-log-row-value');
                if (entry.isBest) valueCol.addClass('policy-log-row-value--best');

                row.mouseOver(() => {
                    this.controller.setPolicyPreview(entry.policySnapshot, entry.policyWeightsSnapshot);
                    if (typeof redraw === 'function') redraw();
                });
                row.mouseOut(() => {
                    this.controller.clearPolicyPreview();
                    if (typeof redraw === 'function') redraw();
                });
                row.mousePressed(() => {
                    this.controller.restorePolicyFromLog(entry);
                    this.updateContent();
                    if (typeof redraw === 'function') redraw();
                });
            });
        });
    }
```

Note: `this.controller.clearPolicyLog()` is a new one-line `CanvasController` method
(`this.viewModel.policyEvaluationState.clear();`) not listed in Task 3 - add it now, in this same
task, right next to the other Task 3 methods (it belongs with them logically, this task just
happens to be the first consumer).

- [ ] **Step 3: Call `_renderPolicyLog()` from all four panel-render methods**

In `renderBuildPanel()` (`rightPanel.js:172-182`), change:
```js
    renderBuildPanel() {
        this.createSection('Parameters', () => {
            ...
        });

        this.renderInitialStateSection();
        this._renderStepsAndUtility();
    }
```
to:
```js
    renderBuildPanel() {
        this.createSection('Parameters', () => {
            ...
        });

        this.renderInitialStateSection();
        this._renderStepsAndUtility();
        this._renderPolicyLog();
    }
```
Apply the same one-line addition (call `this._renderPolicyLog();` as the last line of the method
body) to `renderPolicyModePanel()`, `renderValueIterationPanel()`, and `renderExpectationPanel()`.
Read each method's current end first to confirm the exact insertion point.

- [ ] **Step 4: Add CSS**

In `style.css`, add (near other panel-section/muted-note styles - search for an existing
`.panel-muted-note`-like class first; if one already exists, reuse it instead of adding a
duplicate):
```css

/* Policy log (Evaluate pi Phase 2) */

.policy-log-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0 12px;
  align-items: baseline;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.policy-log-row:hover {
  background: var(--surface-hover, var(--bg-dark-hover));
}

.policy-log-row-t {
  color: var(--text-lighter);
  text-align: center;
}

.policy-log-row-value {
  text-align: right;
  font-weight: 600;
  color: var(--text-dark);
}

.policy-log-row-value--best {
  color: var(--accent-yellow);
}
```

- [ ] **Step 5: Verify in browser**

Reuse Task 1's test graph. In Build mode, scroll the right panel — confirm a "Policy log"
section appears below Utility G, showing "Click Evaluate π to log the current policy's exact
value." Switch to Policy mode - confirm the section also appears there, below the π editor.
Manually seed an entry via console (`canvasViewModel.policyEvaluationState.addEntry({...})` with
made-up numbers) and call `rightPanel.updateContent()` - confirm a row renders with the π label
(KaTeX-rendered subscript, not raw `\pi_{1}` text - if it shows literal LaTeX source, KaTeX failed
and needs investigating before proceeding), a "—" in the t column, and the value with a ★ if
`isBest`. Hover the row - confirm `canvasController.setPolicyPreview` gets called (check via a
temporary console.log or breakpoint, or just confirm `canvasViewModel.interaction.previewPolicy`
becomes non-null while hovering and null again after moving the mouse away). Click the row -
confirm `canvasViewModel.simulationState.policy` gets overwritten to match the entry's snapshot.
Click "clear" - confirm the log empties and the empty-state message reappears. Check both Values
sub-views (Monte Carlo, Iteration) show the same section too. Both themes. No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/view/rightPanel.js style.css
git commit -m "Add Policy log section to rightPanel.js, shared across all four modes"
```

---

### Task 6: Wire it all together in `main.js`

**Files:**
- Modify: `src/main/app/main.js`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: `policyEvaluationState` (module-level, real instance), `evaluatePolicyInteractor`,
  `evaluatePolicyPresenter`, `topBar.callbacks.onEvaluatePolicy` wired, `rightPanel`'s
  `policyEvaluationState` reference wired, `onModelKnownToggle`/`onObservabilityToggle` extended
  to call `topBar.setEvaluatePolicyEnabled`.

- [ ] **Step 1: Construct `policyEvaluationState`, the interactor, and the presenter**

Find where `valueIterationState`/`viPresenter` are constructed (module-level `let`/`const`
declarations plus their instantiation in `setup()`) and add, following the exact same pattern:
```js
let policyEvaluationState;
let evaluatePolicyInteractor;
```
and, in `setup()` (near where `valueIterationState = new ValueIterationState();` /
`runVIInteractor = new RunVIInteractor(...)` are set up):
```js
    policyEvaluationState = new PolicyEvaluationState();
    canvasViewModel.policyEvaluationState = policyEvaluationState;

    const evaluatePolicyPresenter = new EvaluatePolicyPresenter(
        (entry) => {
            if (rightPanel) rightPanel.updateContent();
            redraw();
        },
        (message) => {
            alert(message);
        }
    );
    evaluatePolicyInteractor = new EvaluatePolicyInteractor(
        graph, simulationState, policyEvaluationState, evaluatePolicyPresenter,
        () => canvasViewModel.startNode
    );
```
(Adapt the presenter's constructor call to whatever Task 2/Step 5 actually settled on if it ended
up differing from the two-callback guess there — this call site must match that file's real
constructor signature.)

- [ ] **Step 2: Wire `rightPanel`'s `policyEvaluationState` reference**

Wherever `rightPanel = new RightPanel(...)` is constructed, thread `policyEvaluationState` through
using whatever mechanism Task 5/Step 1 established (constructor param, or a property set right
after construction like `rightPanel.policyEvaluationState = policyEvaluationState;`).

- [ ] **Step 3: Add `onEvaluatePolicy` and wire the topBar callback**

Near the other simple action handlers (`onRenormalize`, etc.):
```js
const onEvaluatePolicy = () => {
    if (!evaluatePolicyInteractor) return;
    const gamma = rightPanel ? rightPanel.discountFactor : 0.9;
    evaluatePolicyInteractor.execute(new EvaluatePolicyInputData(gamma));
};
```
Add `onEvaluatePolicy: onEvaluatePolicy,` to the `new TopBar({...})` callbacks object, alongside
`onRenormalize`.

- [ ] **Step 4: Gate enablement on `modelKnown`**

In `onModelKnownToggle` (`main.js:229` per this plan's own research), after the existing
`if (topBar) topBar.refreshParameters();` line, add:
```js
    if (topBar) topBar.setEvaluatePolicyEnabled(canvasViewModel.modelKnown);
```
Also call `topBar.setEvaluatePolicyEnabled(canvasViewModel.modelKnown)` once during initial
`setup()` (right after `policyEvaluationState`/`evaluatePolicyInteractor` construction), so the
button's enabled state is correct on first load, not just after the first toggle.

- [ ] **Step 5: Verify in browser**

Reload the app fresh. Build a small graph (state with 2 actions, deterministic policy set via
Policy mode), set a start node. Click **Evaluate π** in Build mode — confirm a new row appears in
the Policy log (both in Build's own panel, and if you switch to Policy/Monte Carlo/Iteration, the
same entry is there too, since it's one shared log). Change the policy (pick the other action in
Policy mode), click **Evaluate π** again — confirm a second row appears, and whichever has the
higher value gets the ★. Hover each row — confirm the graph's policy edges visually shift to
preview that row's policy (bold/highlighted edge moves to the previewed action), reverting when
you stop hovering. Click a row — confirm the Policy π editor and canvas actually update to that
policy for real. Toggle P unknown via the Parameters popover — confirm the Evaluate π button
becomes disabled (greyed, unclickable) in every mode; toggle back to P known — confirm it
re-enables. Check both light and dark theme. No console errors anywhere in this pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/app/main.js
git commit -m "Wire Evaluate pi button and Policy log into main.js"
```

---

### Task 7: Final integration pass, CLAUDE.md

**Files:** none new; verification-only, touching no source files unless a regression is found
(fix it in the file where the bug lives, note the fix in the commit message).

- [ ] **Step 1: Full regression pass**

Run through: Build mode (confirm Renormalize/Run/Step/Reset all still work unchanged, tool
palette/tree pill unaffected) → Policy mode (confirm the π editor still works, policy log
appears below it) → Monte Carlo (confirm MC's own Run/Step/Reset unaffected, Evaluate π still
works and logs alongside MC's estimate) → Iteration (same check for VI) → confirm switching
between all four modes never loses log entries (it's one shared `policyEvaluationState`, not
per-mode) → confirm Reset (in any mode) does NOT clear the policy log (only "clear" does — the
log is a cross-run record, not tied to any one simulation's lifecycle; if this plan's earlier
tasks accidentally wired log-clearing into any Reset handler, that's a regression to fix) →
confirm import/export round-trip excludes the log and preview fields:
```js
canvasController.importGraph(/* contents of a test_schema/*.json fixture */);
const json = canvasController.exportGraph(true);
/policyEvaluationState|previewPolicy|policySnapshot/i.test(json)   // false
```
No console errors throughout. Both themes.

- [ ] **Step 2: Update `CLAUDE.md`**

Add a short mention to `CLAUDE.md`'s View Layer / Use Case Layer listings, matching the existing
documentation convention:
- Under Use Case Layer's bullet list (alongside `runVI`, `runExpectation`, etc.): add
  `evaluatePolicy` to the list.
- Under View Layer (`topBar.js`'s own bullet, or a new short bullet near it): mention the
  always-visible, modelKnown-gated Evaluate π button and its role.
- A short new paragraph (or extend the existing "Value Iteration ..." / "Monte Carlo ..." headed
  sections) explaining `PolicyEvaluationState`'s distinct role from `ValueIterationState`
  (fixed-policy expectation vs. optimal-policy optimality) and from `ExpectationState` (exact vs.
  sampled) — this distinction is exactly the thing worth writing down for a future reader, since
  it's easy to conflate three different "evaluate the policy" concepts in this app.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document PolicyEvaluationState and Evaluate pi in CLAUDE.md"
```

(If Step 1 surfaced any regression requiring a code fix, that fix should already be committed
separately, before this documentation commit, with its own descriptive message.)

---

## Self-Review Notes

- **Spec coverage:** design doc's "Domain layer" → Task 1; "New use case: evaluatePolicy" → Task 2;
  "UI" (button, log panel, hover-preview, click-restore) → Tasks 3-5; enablement/visibility rules
  → Tasks 4/6; "Non-goals" (no π_t, no VI changes, no max_a, no new slider) → enforced throughout
  and explicitly re-checked in Task 7's regression pass.
- **Placeholder scan:** no TBD/TODO. Two deliberate "read the actual file first, adapt if needed"
  points (Task 2/Step 5's presenter shape, Task 5/Step 1's sibling-state wiring convention) are
  explicit adaptation instructions with a concrete fallback, not missing decisions — this codebase
  has multiple existing presenters/constructors to pattern-match against, and guessing the wrong
  one wrong would be worse than reading first.
- **Type/name consistency:** `PolicyEvaluationState.evaluate()`'s return shape
  `{ valueAtStart, valuesByState }` (Task 1) is consumed identically by `EvaluatePolicyInteractor`
  (Task 2) and referenced identically in Task 1's own verification script.
  `addEntry({ valueAtStart, valuesByState, policySnapshot, policyWeightsSnapshot })`'s parameter
  names (Task 1) match exactly what `EvaluatePolicyInteractor.execute()` passes (Task 2).
  `previewPolicy`/`previewPolicyWeights` (Task 3) are used with identical names in
  `EdgeViewModel.policyEdgeProbability` (Task 3) and `RightPanel._renderPolicyLog()`'s hover
  handlers (Task 5). `setPolicyPreview`/`clearPolicyPreview`/`restorePolicyFromLog`/`clearPolicyLog`
  (Task 3) are called by these exact names from Task 5's row handlers. `evaluatePiBtn`/
  `setEvaluatePolicyEnabled`/`onEvaluatePolicy` (Task 4) are wired by these exact names in Task 6.
