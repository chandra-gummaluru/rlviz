// Interactor for initializing synchronous-sweep Value Iteration (sweep 0 only).
class RunVIInteractor extends RunVIInputBoundary {
    constructor(graph, viState, outputBoundary) {
        super();
        this.graph = graph;
        this.viState = viState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        if (!inputData || inputData.T === undefined || inputData.T === null || inputData.T < 0) {
            this.outputBoundary.presentError('T must be a non-negative integer');
            return;
        }

        const states = this.graph.nodes.filter(n => n.type === 'state');
        if (states.length === 0) {
            this.outputBoundary.presentError('No state nodes in graph');
            return;
        }

        // Fresh start: clear any prior state (including manual Q overrides), then seed sweep 0.
        this.viState.reset();
        this.viState.initialize(this.graph, inputData.T, inputData.gamma, inputData.epsilon, inputData.runMode);

        this.outputBoundary.presentInitialized();
    }
}
