// Pure Upper Confidence Bound (UCB1) exploration policy. No state, no visual dependencies.
// getN(stateId, actionId) and getNs(stateId) are callbacks into QLearningState's visit counts.
const UCBPolicy = {
    // UCB bonus for one (s,a) pair: c * sqrt(ln(max(1,Ns)) / max(1,N)).
    // A zero-visit action returns Infinity so it is always tried before any visited action.
    bonus(stateId, actionId, getN, getNs, c) {
        const n = getN(stateId, actionId);
        if (n === 0) return Infinity;
        const ns = getNs(stateId);
        return c * Math.sqrt(Math.log(Math.max(1, ns)) / Math.max(1, n));
    },

    // argmax_a [getQ(s,a) + bonus(s,a)]; ties broken by first-encountered order.
    // Zero-visit actions (Infinity bonus) are selected before any visited action.
    selectAction(stateId, actionIds, getQ, getN, getNs, c) {
        if (!actionIds || actionIds.length === 0) return null;
        let best = actionIds[0];
        let bestScore = getQ(stateId, actionIds[0]) + UCBPolicy.bonus(stateId, actionIds[0], getN, getNs, c);
        for (let i = 1; i < actionIds.length; i++) {
            const score = getQ(stateId, actionIds[i]) + UCBPolicy.bonus(stateId, actionIds[i], getN, getNs, c);
            if (score > bestScore) { bestScore = score; best = actionIds[i]; }
        }
        return best;
    }
};
