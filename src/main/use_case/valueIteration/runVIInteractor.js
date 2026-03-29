// Interactor for initializing and running Value Iteration computation
class RunVIInteractor extends RunVIInputBoundary {
    constructor(graph, viState, viViewModel, outputBoundary) {
        super();
        this.graph = graph;
        this.viState = viState;
        this.viViewModel = viViewModel;
        this.outputBoundary = outputBoundary;
        this.animator = new VIAnimator(viState, viViewModel, outputBoundary);
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

        // Compute layout
        const canvasWidth = windowWidth - 300; // right panel width
        const canvasHeight = windowHeight - 90; // menu + toolbar
        this.viViewModel.reset();
        this.viViewModel.computeLayout(this.viState, canvasWidth, canvasHeight);
    }
}
