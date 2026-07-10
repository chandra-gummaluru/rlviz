// Generates one episodic Q-learning rollout through the MDP graph and applies the incremental
// Q update for every observed transition. Mirrors ExpectationState's rollout-generation idea
// (sample from the start state through the graph's REAL transition probabilities), but layers a
// per-transition sample-average Q update on top instead of just recording returns.
//
// Environment sampling reuses TraceGenerator.selectRandomNextState(actionNode) directly (the same
// real-P weighted sampling Monte Carlo uses) rather than duplicating weighted-sampling logic.
class QLearningEpisodeGenerator {
    constructor(graph, traceGenerator) {
        this.graph = graph;
        this.traceGenerator = traceGenerator;
    }

    generateEpisode(startStateId, qLearningState) {
        const path = [];
        let stateId = startStateId;
        for (let depth = 0; depth < qLearningState.maxDepth; depth++) {
            const stateNode = this.graph.getNodeById(stateId);
            if (!stateNode || !stateNode.actions || !stateNode.actions.length) break; // terminal state
            const actionId = qLearningState.selectAction(stateId, stateNode.actions);
            const actionNode = this.graph.getNodeById(actionId);
            if (!actionNode || !actionNode.sas || !actionNode.sas.length) break; // terminal action
            const nextStateNode = this.traceGenerator.selectRandomNextState(actionNode); // REAL P, reused
            if (!nextStateNode) break;
            const transition = actionNode.sas.find(t => t.nextState === nextStateNode.id);
            const reward = transition ? transition.reward : 0;
            const nextActionIds = (this.graph.getNodeById(nextStateNode.id) || {}).actions || [];
            qLearningState.applyTransition(stateId, actionId, nextStateNode.id, reward, nextActionIds);
            path.push({ stateId, actionId, nextStateId: nextStateNode.id, reward });
            stateId = nextStateNode.id;
        }
        qLearningState.episodeCount++;
        qLearningState.lastEpisodePath = path;
        return path;
    }
}
