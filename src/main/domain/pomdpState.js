// Domain entity for real episodic belief-state Q-learning (the "PO Q-Learning" / unknown:partial
// quadrant of Values mode's 2x2 method matrix).
//
// Maintains a Bayesian belief distribution b(s) over states, updated after each sampled transition
// via a noisy auto-derived observation model O(o|s'). Action selection uses the same exploration
// policies as QLearningState (EpsilonGreedyPolicy / UCBPolicy / SoftmaxPolicy), but feeds them
// belief-weighted Q-values instead of per-state lookups — zero changes to those policy files.
//
// Q-updates use the true state (internally available from simulation), while the agent's action
// selection path only ever sees belief-weighted Q. The two partial-observability quadrants that
// run a real Bellman sweep (Belief Iteration, known:partial) are unrelated to this class.
//
// PRESENTATION/SESSION-ONLY, EXCLUDED FROM GRAPH IMPORT/EXPORT — identical treatment to
// QLearningState and ValueIterationState.manualOverrides.
class PomdpState {
    constructor() {
        this.reset();
    }

    reset() {
        this.algorithm = 'epsilonGreedy';   // 'epsilonGreedy' | 'ucb' | 'softmax' | 'optimistic'
        this.epsilon = 0.1;
        this.ucbC = 1.4;
        this.optimisticQ0 = 5;
        this.softmaxTau = 1.0;
        this.gamma = 0.9;
        this.maxDepth = 8;
        this.observationNoise = 0.1;        // p: P(observe wrong state); range [0, 0.5]

        this.Q = {};                        // "${s}:${a}" -> running-mean Q
        this.N = {};                        // "${s}:${a}" -> visit count
        this.Ns = {};                       // "${s}" -> total decisions from s

        this.belief = {};                   // stateId -> probability (normalized)
        this.beliefHistory = [];            // [{ t, belief: {...} }] for last episode's steps

        this.episodeCount = 0;
        this.lastEpisodePath = null;
    }

    _key(stateId, actionId) {
        return `${stateId}:${actionId}`;
    }

    // Learned Q estimate for (s,a). Never-visited pairs default to optimisticQ0 under
    // the optimistic algorithm (drives exploration), else 0 — identical to QLearningState.
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

    // Reset belief to uniform over stateIds and clear the episode's belief snapshots.
    // Called at the start of each episode by PomdpEpisodeGenerator.
    initBelief(stateIds) {
        this.belief = {};
        this.beliefHistory = [];
        if (!stateIds || !stateIds.length) return;
        const p = 1 / stateIds.length;
        for (const id of stateIds) this.belief[id] = p;
    }

    // O(observation | trueStateId) under the auto-derived noise model:
    //   correct observation with prob (1 - p); uniform confusion across |S|-1 others with prob p.
    observationProb(observation, trueStateId, numStates) {
        if (observation === trueStateId) return 1 - this.observationNoise;
        return numStates > 1 ? this.observationNoise / (numStates - 1) : 0;
    }

    // Sample one observation from O(·|trueStateId). Returns trueStateId with prob (1-p);
    // else a uniformly random other state ID.
    sampleObservation(trueStateId, allStateIds) {
        if (Math.random() >= this.observationNoise) return trueStateId;
        const others = allStateIds.filter(id => id !== trueStateId);
        if (!others.length) return trueStateId;
        return others[Math.floor(Math.random() * others.length)];
    }

    // Bayes belief update: b'(s') ∝ O(o|s') * Σ_s b(s) * P(s'|s, actionIdx)
    // getTransitionProb(fromStateId, toStateId) returns P(toStateId | fromStateId, chosen actionIdx).
    // Reverts to uniform if the total normalizer is zero (degenerate model).
    beliefUpdate(observation, allStateIds, getTransitionProb) {
        const newBelief = {};
        let total = 0;
        for (const sPrime of allStateIds) {
            const obsP = this.observationProb(observation, sPrime, allStateIds.length);
            let transSum = 0;
            for (const s of allStateIds) {
                transSum += (this.belief[s] || 0) * getTransitionProb(s, sPrime);
            }
            newBelief[sPrime] = obsP * transSum;
            total += newBelief[sPrime];
        }
        if (total > 0) {
            for (const id of allStateIds) newBelief[id] /= total;
        } else {
            const p = 1 / allStateIds.length;
            for (const id of allStateIds) newBelief[id] = p;
        }
        this.belief = newBelief;
    }

    // Belief-weighted Q-value for an action: Σ_s b(s) * Q(s, actionId).
    // This is the bridge between the belief distribution and the existing stateless policies.
    beliefWeightedQ(actionId) {
        let val = 0;
        for (const [sId, bS] of Object.entries(this.belief)) {
            val += bS * this.getQ(sId, actionId);
        }
        return val;
    }

    // Sample-average Q-update on the TRUE state (internally available from simulation).
    // Identical formula to QLearningState.applyTransition — no belief involved here.
    applyTransition(stateId, actionId, nextStateId, reward, nextActionIds) {
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
    }

    // Greedy action using belief-weighted Q — used by the right-panel Q-table for display.
    greedyAction(stateId, actionIds) {
        if (!actionIds || actionIds.length === 0) return null;
        return EpsilonGreedyPolicy.greedyAction(null, actionIds,
            (_, a) => this.beliefWeightedQ(a));
    }

    // Action selection via the active policy, fed belief-weighted Q values.
    // The stateId argument to each policy is null — policies accept it for interface
    // compatibility but the getQ callback ignores it, returning beliefWeightedQ(a) instead.
    selectAction(actionIds) {
        if (!actionIds || actionIds.length === 0) return null;
        const getQ = (_, a) => this.beliefWeightedQ(a);

        if (this.algorithm === 'epsilonGreedy') {
            return EpsilonGreedyPolicy.selectAction(null, actionIds, getQ, this.epsilon);
        }
        if (this.algorithm === 'ucb') {
            // Belief-weighted visit counts as a proxy for per-action N in the POMDP setting.
            const getN = (_, a) => {
                let n = 0;
                for (const [sId, bS] of Object.entries(this.belief)) {
                    n += bS * this.getN(sId, a);
                }
                return n;
            };
            const getNs = _ => {
                let total = 0;
                for (const [sId, bS] of Object.entries(this.belief)) {
                    total += bS * this.getNs(sId);
                }
                return total;
            };
            return UCBPolicy.selectAction(null, actionIds, getQ, getN, getNs, this.ucbC);
        }
        if (this.algorithm === 'softmax') {
            return SoftmaxPolicy.selectAction(null, actionIds, getQ, this.softmaxTau);
        }
        // 'optimistic': greedy over belief-weighted Q; optimisticQ0 default drives exploration.
        return EpsilonGreedyPolicy.greedyAction(null, actionIds, getQ);
    }
}
