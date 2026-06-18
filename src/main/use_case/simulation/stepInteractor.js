
class StepInteractor extends StepInputBoundary {
    constructor(simulationState, traceGenerator, outputBoundary, startNodeProvider) {
        super();
        this.simulationState = simulationState;
        this.traceGenerator = traceGenerator;
        this.animator = new SimulationAnimator(simulationState, traceGenerator, outputBoundary, startNodeProvider);
    }

    setTiming(timing) {
        this.animator.setTiming(timing);
    }

    execute(inputData) {
        if (!this.simulationState.replayInitialized) {
            this.runInitialization();
        } else {
            this.stepWithAnimation();
        }
    }

    async runInitialization() {
        if (!this.animator.validateAndGenerateTrace()) return;

        await this.animator.animateInitialization(false);
        this.updateProbabilitiesForCurrentNode();
    }

    async stepWithAnimation() {
        if (this.simulationState.isPlaying) {
            this.simulationState.pause();
        }

        if (!this.simulationState.canAdvance()) {
            this.animator.outputBoundary.presentTraceEnd();
            return;
        }

        const currentNode = this.simulationState.currentNode;
        const nextNode = this.simulationState.peekNext();
        await this.animator.animateTransition(currentNode, nextNode);

        if (!this.simulationState.canAdvance()) {
            this.animator.outputBoundary.presentTraceEnd();
        }
    }

    updateProbabilitiesForCurrentNode() {
        const currentNode = this.simulationState.currentNode;
        const nodeInGraph = this.animator.getNodeFromGraph(currentNode.id);
        if (!nodeInGraph) return;

        if (currentNode.type === 'state') {
            this.simulationState.setDecisionProbs(nodeInGraph, this.traceGenerator.graph);
        } else if (currentNode.type === 'action') {
            this.simulationState.setOutcomeProbs(nodeInGraph, this.traceGenerator.graph);
        }
    }
}
