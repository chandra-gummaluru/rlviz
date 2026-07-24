// Pure Boltzmann (softmax) exploration policy. No state, no visual dependencies.
// Temperature tau controls explore/exploit: high tau → near-uniform; low tau → near-greedy.
// Uses the max-Q shift trick for numerical stability (avoids exp overflow on large Q-values).
const SoftmaxPolicy = {
    // Returns a Map<actionId, probability> over actionIds under the Boltzmann distribution.
    probabilities(stateId, actionIds, getQ, tau) {
        if (!actionIds || actionIds.length === 0) return new Map();
        const t = Math.max(tau, 1e-6);  // guard against tau=0 (would be division by zero)
        const qs = actionIds.map(a => getQ(stateId, a));
        const maxQ = Math.max(...qs);
        const exps = qs.map(q => Math.exp((q - maxQ) / t));
        const sum = exps.reduce((s, e) => s + e, 0);
        const result = new Map();
        actionIds.forEach((a, i) => result.set(a, exps[i] / sum));
        return result;
    },

    // Sample one action according to the Boltzmann distribution.
    selectAction(stateId, actionIds, getQ, tau) {
        if (!actionIds || actionIds.length === 0) return null;
        const probs = SoftmaxPolicy.probabilities(stateId, actionIds, getQ, tau);
        let r = Math.random();
        for (const [actionId, p] of probs) {
            r -= p;
            if (r <= 0) return actionId;
        }
        return actionIds[actionIds.length - 1];  // floating-point safety fallback
    }
};
