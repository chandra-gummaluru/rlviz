// Presenter for edge creation
class CreateEdgePresenter extends CreateEdgeOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
    }

    presentEdgeCreated(edge) {
        // Edge is already added to graph, no additional view model updates needed
        // The edge will be rendered in the next draw cycle
    }

    presentError(message) {
        console.error(`Create edge error: ${message}`);
        alert(`Error creating edge: ${message}`);
    }
}
