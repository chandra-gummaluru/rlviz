// Pure ε-greedy exploration policy. No state, no visual dependencies.
// All Q-values are accessed via callback so this file is fully decoupled from QLearningState's
// internal key format and storage structure.
const EpsilonGreedyPolicy = {
    // argmax_a getQ(stateId, a) over actionIds; ties broken by first-encountered order.
    greedyAction(stateId, actionIds, getQ) {
        if (!actionIds || actionIds.length === 0) return null;
        let best = actionIds[0];
        let bestQ = getQ(stateId, actionIds[0]);
        for (let i = 1; i < actionIds.length; i++) {
            const q = getQ(stateId, actionIds[i]);
            if (q > bestQ) { bestQ = q; best = actionIds[i]; }
        }
        return best;
    },

    // With probability epsilon pick a uniformly random action; else pick greedyAction.
    selectAction(stateId, actionIds, getQ, epsilon) {
        if (!actionIds || actionIds.length === 0) return null;
        if (Math.random() < epsilon) {
            return actionIds[Math.floor(Math.random() * actionIds.length)];
        }
        return EpsilonGreedyPolicy.greedyAction(stateId, actionIds, getQ);
    }
};
