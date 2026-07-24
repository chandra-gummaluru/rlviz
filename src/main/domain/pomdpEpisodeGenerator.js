// Generates one episodic POMDP rollout and applies incremental Q-updates for each transition.
// Mirrors QLearningEpisodeGenerator but adds a Bayesian belief update step after each sampled
// transition — the agent selects actions using belief-weighted Q while the Q-update uses the
// true (internally known) state.
//
// Action indexing for the belief update: since the agent selects an action node from the TRUE
// state's action list, the same abstract "action index" k is applied across all states in the
// belief — P(s'|s, actionIdx_k) = probability of the k-th action of state s leading to s'.
// States with fewer than k actions contribute 0 probability to the transition sum.
class PomdpEpisodeGenerator {
    constructor(graph, traceGenerator) {
        this.graph = graph;
        this.traceGenerator = traceGenerator;
    }

    generateEpisode(startStateId, pomdpState) {
        const allStateIds = this.graph.nodes.filter(n => n.type === 'state').map(n => n.id);

        pomdpState.initBelief(allStateIds);

        const path = [];
        let trueStateId = startStateId;

        for (let depth = 0; depth < pomdpState.maxDepth; depth++) {
            const stateNode = this.graph.getNodeById(trueStateId);
            if (!stateNode || !stateNode.actions || !stateNode.actions.length) break;

            // Select action using belief-weighted Q (agent never sees true state)
            const actionId = pomdpState.selectAction(stateNode.actions);
            const actionNode = this.graph.getNodeById(actionId);
            if (!actionNode || !actionNode.sas || !actionNode.sas.length) break;

            // Action index in the true state's action list — used for cross-state belief update
            const actionIdx = stateNode.actions.indexOf(actionId);

            // Sample true next state from real P (same helper as MC and QL)
            const nextStateNode = this.traceGenerator.selectRandomNextState(actionNode);
            if (!nextStateNode) break;

            const transition = actionNode.sas.find(t => t.nextState === nextStateNode.id);
            const reward = transition ? transition.reward : 0;
            const nextActionIds = (this.graph.getNodeById(nextStateNode.id) || {}).actions || [];

            // Sample observation from O(·|trueNextState)
            const observation = pomdpState.sampleObservation(nextStateNode.id, allStateIds);

            // Transition probability callback for Bayes update:
            // P(toStateId | fromStateId, actionIdx) via the k-th action of fromState.
            const getTransitionProb = (fromSId, toSId) => {
                const fromNode = this.graph.getNodeById(fromSId);
                if (!fromNode || !fromNode.actions || actionIdx >= fromNode.actions.length) return 0;
                const fromActionNode = this.graph.getNodeById(fromNode.actions[actionIdx]);
                if (!fromActionNode) return 0;
                const t = fromActionNode.sas && fromActionNode.sas.find(s => s.nextState === toSId);
                return t ? t.probability : 0;
            };

            // Bayes belief update based on observation
            pomdpState.beliefUpdate(observation, allStateIds, getTransitionProb);

            // Q-update on true state (agent can't do this in reality; here for educational accuracy)
            pomdpState.applyTransition(trueStateId, actionId, nextStateNode.id, reward, nextActionIds);

            // Snapshot belief AFTER update for the States view to render
            pomdpState.beliefHistory.push({ t: depth, belief: { ...pomdpState.belief } });

            path.push({ stateId: trueStateId, actionId, nextStateId: nextStateNode.id, reward, observation });
            trueStateId = nextStateNode.id;
        }

        pomdpState.episodeCount++;
        pomdpState.lastEpisodePath = path;
        return path;
    }
}
