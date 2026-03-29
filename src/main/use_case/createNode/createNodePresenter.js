// Presenter for node creation
class CreateNodePresenter extends CreateNodeOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
    }

    presentNodeCreated(node) {
        // Node is already added to graph, no additional view model updates needed
        // The node will be rendered in the next draw cycle
    }

    presentError(message) {
        console.error(`Create node error: ${message}`);
        alert(`Error creating node: ${message}`);
    }
}
