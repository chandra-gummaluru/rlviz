// Interactor for Q-learning Reset — clears all learned Q/N/tree data back to a fresh root.
class QLResetInteractor extends QLResetInputBoundary {
    constructor(qLearningState, outputBoundary) {
        super();
        this.qLearningState = qLearningState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        this.qLearningState.reset();
        this.outputBoundary.presentComplete({ episodeCount: 0, ranEpisodes: 0, reset: true });
    }
}
