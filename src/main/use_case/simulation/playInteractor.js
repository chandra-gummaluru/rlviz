// Interactor for Play simulation action
class PlayInteractor extends PlayInputBoundary {
    constructor(simulationState, traceGenerator, outputBoundary, startNodeProvider) {
        super();
        this.simulationState = simulationState;
        this.animator = new SimulationAnimator(simulationState, traceGenerator, outputBoundary, startNodeProvider);
    }

    setTiming(timing) {
        this.animator.setTiming(timing);
    }

    execute(inputData) {
        if (!this.simulationState.replayInitialized) {
            this.runInitialization(inputData);
        } else if (!this.simulationState.isPlaying) {
            this.simulationState.play();
            this.continuousPlay();
        }
    }

    async runInitialization(inputData) {
        if (!this.animator.validateAndGenerateTrace()) return;

        await this.animator.animateInitialization(true);
        this.continuousPlay();
    }

    async continuousPlay() {
        while (this.simulationState.isPlaying && this.simulationState.canAdvance()) {
            const currentNode = this.simulationState.currentNode;
            const nextNode = this.simulationState.peekNext();
            await this.animator.animateTransition(currentNode, nextNode);
        }

        if (!this.simulationState.canAdvance()) {
            this.simulationState.pause();
            this.animator.outputBoundary.presentTraceEnd();
        }
    }
}
