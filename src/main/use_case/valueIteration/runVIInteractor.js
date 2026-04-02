// Interactor for initializing and running Value Iteration computation
class RunVIInteractor extends RunVIInputBoundary {
    constructor(graph, viState, outputBoundary) {
        super();
        this.graph = graph;
        this.viState = viState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        if (!inputData || !inputData.T || inputData.T < 0) {
            this.outputBoundary.presentError('T must be a positive integer');
            return;
        }

        const states = this.graph.nodes.filter(n => n.type === 'state');
        if (states.length === 0) {
            this.outputBoundary.presentError('No state nodes in graph');
            return;
        }

        // Compute full history upfront
        this.viState.reset();
        this.viState.computeHistory(this.graph, inputData.T, inputData.gamma);

        // Signal presenter to compute layout (presenter has ViewModel access)
        this.outputBoundary.presentLayoutNeeded(inputData.canvasWidth, inputData.canvasHeight);
    }
}
