// Interactor for episodic POMDP belief Q-learning: runs `episodeCount` sampled episodes, each
// performing belief updates and incremental Q-updates. Reused for both Run (count 10) and
// Step (count 1) via different inputData.episodeCount — identical to RunQLInteractor's pattern.
class RunPomdpInteractor extends RunPomdpInputBoundary {
    constructor(graph, episodeGenerator, pomdpState, outputBoundary) {
        super();
        this.graph = graph;
        this.episodeGenerator = episodeGenerator;
        this.pomdpState = pomdpState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        if (!inputData || inputData.startStateId === undefined || inputData.startStateId === null) {
            this.outputBoundary.presentError('A start state is required to run POMDP learning');
            return;
        }
        const startNode = this.graph.getNodeById(inputData.startStateId);
        if (!startNode || startNode.type !== 'state') {
            this.outputBoundary.presentError('Start node must be a state node');
            return;
        }

        if (inputData.gamma !== undefined && inputData.gamma !== null && isFinite(inputData.gamma)) {
            this.pomdpState.gamma = inputData.gamma;
        }

        const count = Math.max(1, inputData.episodeCount || 1);
        for (let i = 0; i < count; i++) {
            this.episodeGenerator.generateEpisode(startNode.id, this.pomdpState);
        }

        this.outputBoundary.presentComplete({
            episodeCount: this.pomdpState.episodeCount,
            ranEpisodes: count
        });
    }
}
