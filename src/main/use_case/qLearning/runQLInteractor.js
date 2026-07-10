// Interactor for episodic Q-learning: runs `episodeCount` sampled episodes, each incrementally
// updating the tabular Q estimate. Reused for both Run (count 10) and Step (count 1) — the only
// difference is the count the controller passes, so no separate step interactor exists.
class RunQLInteractor extends RunQLInputBoundary {
    constructor(graph, episodeGenerator, qLearningState, outputBoundary) {
        super();
        this.graph = graph;
        this.episodeGenerator = episodeGenerator;
        this.qLearningState = qLearningState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        if (!inputData || inputData.startStateId === undefined || inputData.startStateId === null) {
            this.outputBoundary.presentError('A start state is required to run learning');
            return;
        }
        const startNode = this.graph.getNodeById(inputData.startStateId);
        if (!startNode || startNode.type !== 'state') {
            this.outputBoundary.presentError('Start node must be a state node');
            return;
        }

        if (inputData.gamma !== undefined && inputData.gamma !== null && isFinite(inputData.gamma)) {
            this.qLearningState.gamma = inputData.gamma;
        }
        this.qLearningState.ensureRoot(startNode.id, startNode.name);

        const count = Math.max(1, inputData.episodeCount || 1);
        for (let i = 0; i < count; i++) {
            this.episodeGenerator.generateEpisode(startNode.id, this.qLearningState);
        }

        this.outputBoundary.presentComplete({
            episodeCount: this.qLearningState.episodeCount,
            ranEpisodes: count
        });
    }
}
