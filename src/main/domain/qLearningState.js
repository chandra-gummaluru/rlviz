// Domain entity for real episodic tabular Q-learning (the "Learning Iteration" / unknown:full
// quadrant of Values mode's 2x2 method matrix).
//
// This is a GENUINE learning algorithm, not the old manually-edited placeholder Q-table: it
// samples episodes through the graph's real transition model (via QLearningEpisodeGenerator +
// TraceGenerator) and incrementally refines a tabular Q estimate with each observed transition.
//
// Q/N/Ns are keyed GLOBALLY per-(s,a) / per-s, NOT per-tree-position: a state can recur at
// multiple depths/branches of the unrolled episode tree (cycles, revisits), but there is only
// one tabular estimate being learned. The tree (`root` + transitionCounts) is a *visualization*
// of rollout history layered on top, not a second copy of the learned data.
//
// PRESENTATION/SESSION-ONLY, EXCLUDED FROM GRAPH IMPORT/EXPORT. Constructed in main.js, attached
// only to canvasViewModel.qLearningState; graphObj.js's serialize()/deserialize() never read or
// write it (identical treatment to ValueIterationState.manualOverrides).
class QLearningState {
    constructor() {
        this.reset();
    }

    reset() {
        this.algorithm = 'epsilonGreedy';   // 'epsilonGreedy' | 'ucb' | 'optimistic'
        this.epsilon = 0.1;
        this.ucbC = 1.4;
        this.optimisticQ0 = 5;
        this.gamma = 0.9;
        this.maxDepth = 8;                  // fixed v1 episode-depth cap, not user-configurable

        this.Q = {};                        // "${s}:${a}" -> running-mean Q (visited pairs only)
        this.N = {};                        // "${s}:${a}" -> visit count
        this.Ns = {};                       // "${s}" -> total decisions made from s (UCB's N_parent)
        this.transitionCounts = {};         // "${s}:${a}:${s'}" -> count (tree outcome N=)
        this.transitionRewardSums = {};     // "${s}:${a}:${s'}" -> running reward sum

        this.root = null;                   // tree SHAPE only: { stateId, stateName, depth: 0 }
        this.episodeCount = 0;
        this.lastEpisodePath = null;
    }

    _key(stateId, actionId) {
        return `${stateId}:${actionId}`;
    }

    // Learned Q estimate for (s,a). Never-visited pairs default to the optimistic initial value
    // Q0 under the optimistic algorithm (which is exactly what drives its exploration), else 0.
    getQ(stateId, actionId) {
        const key = this._key(stateId, actionId);
        if (Object.prototype.hasOwnProperty.call(this.Q, key)) return this.Q[key];
        return this.algorithm === 'optimistic' ? this.optimisticQ0 : 0;
    }

    getN(stateId, actionId) {
        return this.N[this._key(stateId, actionId)] || 0;
    }

    getNs(stateId) {
        return this.Ns[stateId] || 0;
    }

    // Count of observed s -> a -> s' transitions (drives the tree outcome N= labels).
    getTransitionCount(stateId, actionId, nextStateId) {
        return this.transitionCounts[`${stateId}:${actionId}:${nextStateId}`] || 0;
    }

    // Mean observed reward for the s -> a -> s' transition (illustrative tree label only).
    getTransitionMeanReward(stateId, actionId, nextStateId) {
        const k = `${stateId}:${actionId}:${nextStateId}`;
        const c = this.transitionCounts[k] || 0;
        if (c === 0) return 0;
        return (this.transitionRewardSums[k] || 0) / c;
    }

    // Sets the tree root (shape only) once, idempotently.
    ensureRoot(stateId, stateName) {
        if (this.root) return;
        this.root = { stateId, stateName, depth: 0 };
    }

    // Sample-average tabular Q-learning update (step size 1/N(s,a) => a true running mean, NOT a
    // fixed-alpha exponential average). Also records the sampled transition for the tree.
    applyTransition(stateId, actionId, nextStateId, reward, nextActionIds) {
        // Bootstrapped target: reward + gamma * max_a' Q(s', a'); 0 if s' is terminal (no actions).
        let maxNext = 0;
        if (nextActionIds && nextActionIds.length) {
            maxNext = -Infinity;
            for (const a of nextActionIds) {
                const q = this.getQ(nextStateId, a);
                if (q > maxNext) maxNext = q;
            }
            if (maxNext === -Infinity) maxNext = 0;
        }
        const target = reward + this.gamma * maxNext;

        const key = this._key(stateId, actionId);
        const n = (this.N[key] || 0) + 1;
        this.N[key] = n;
        const prevQ = Object.prototype.hasOwnProperty.call(this.Q, key) ? this.Q[key] : 0;
        this.Q[key] = prevQ + (target - prevQ) / n;

        this.Ns[stateId] = (this.Ns[stateId] || 0) + 1;

        const tk = `${stateId}:${actionId}:${nextStateId}`;
        this.transitionCounts[tk] = (this.transitionCounts[tk] || 0) + 1;
        this.transitionRewardSums[tk] = (this.transitionRewardSums[tk] || 0) + reward;
    }

    // UCB bonus term for one action at a decision point: c * sqrt(ln(max(1,Ns))/max(1,N)). A
    // zero-visit action gets Infinity (must be tried first). Shared by selectAction and the
    // view's halo rendering so both agree on the same number.
    ucbBonus(stateId, actionId) {
        const n = this.getN(stateId, actionId);
        if (n === 0) return Infinity;
        const ns = this.getNs(stateId);
        return this.ucbC * Math.sqrt(Math.log(Math.max(1, ns)) / Math.max(1, n));
    }

    // argmax_a getQ(s,a), ties broken by first-encountered order in actionIds.
    greedyAction(stateId, actionIds) {
        if (!actionIds || actionIds.length === 0) return null;
        let best = actionIds[0];
        let bestQ = this.getQ(stateId, actionIds[0]);
        for (let i = 1; i < actionIds.length; i++) {
            const q = this.getQ(stateId, actionIds[i]);
            if (q > bestQ) { bestQ = q; best = actionIds[i]; }
        }
        return best;
    }

    // argmax_a [getQ(s,a) + bonus], ties broken by first-encountered order. Zero-visit actions
    // (Infinity bonus) are selected first. Used for UCB selection AND for the view's "did we
    // choose to explore?" comparison against greedyAction.
    ucbAction(stateId, actionIds) {
        if (!actionIds || actionIds.length === 0) return null;
        let best = actionIds[0];
        let bestScore = this.getQ(stateId, actionIds[0]) + this.ucbBonus(stateId, actionIds[0]);
        for (let i = 1; i < actionIds.length; i++) {
            const score = this.getQ(stateId, actionIds[i]) + this.ucbBonus(stateId, actionIds[i]);
            if (score > bestScore) { bestScore = score; best = actionIds[i]; }
        }
        return best;
    }

    // Behavior policy for the current algorithm. Returns an actionId from actionIds.
    selectAction(stateId, actionIds) {
        if (!actionIds || actionIds.length === 0) return null;

        if (this.algorithm === 'epsilonGreedy') {
            if (Math.random() < this.epsilon) {
                return actionIds[Math.floor(Math.random() * actionIds.length)];
            }
            return this.greedyAction(stateId, actionIds);
        }

        if (this.algorithm === 'ucb') {
            return this.ucbAction(stateId, actionIds);
        }

        // 'optimistic': pure greedy — the optimistic initial Q0 default itself drives exploration.
        return this.greedyAction(stateId, actionIds);
    }
}
