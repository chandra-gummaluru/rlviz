// Presenter for SetImage use case
class SetImagePresenter extends SetImageOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
    }

    presentImageSet(node) {
        // Trigger redraw to show updated image
        console.log('Image set for node:', node.name);
    }

    presentError(message) {
        console.error('SetImage error:', message);
    }
}
