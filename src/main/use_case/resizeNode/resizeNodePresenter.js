// Presenter for node resize
class ResizeNodePresenter extends ResizeNodeOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
    }

    presentNodeResized(node) {
        // Node size updated, will be rendered in next draw cycle
        // No additional view model updates needed
    }

    presentError(message) {
        console.error(`Resize node error: ${message}`);
    }
}
