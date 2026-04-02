// Presenter for SetImage use case
class SetImagePresenter extends SetImageOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
    }

    presentImageSet(node) {
        // Trigger redraw to show updated image
    }

    presentError(message) {
        console.error('SetImage error:', message);
    }
}
