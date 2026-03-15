// Presenter for node interactions
class NodeInteractionPresenter extends NodeInteractionOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
        this.foundNode = null;
    }

    presentNodeFound(node) {
        // Store the found node for retrieval by caller
        this.foundNode = node;
    }

    presentNodeNotFound() {
        // No node found
        this.foundNode = null;
    }

    presentNodeMoved(node) {
        // Node position updated, will be rendered in next draw cycle
        // No additional view model updates needed
    }

    presentError(message) {
        console.error(`Node interaction error: ${message}`);
    }

    // Getter for found node (used by ViewModel)
    getFoundNode() {
        return this.foundNode;
    }
}
