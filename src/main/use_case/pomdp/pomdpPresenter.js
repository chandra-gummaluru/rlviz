// Presenter for POMDP (PO Q-Learning). Thin: forwards completion/error to injected callbacks,
// letting main.js decide the view refresh — identical pattern to QLPresenter.
class PomdpPresenter extends PomdpOutputBoundary {
    constructor(canvasViewModel) {
        super();
        this.viewModel = canvasViewModel;
        this.onComplete = null;
        this.onError = null;
    }

    presentComplete(response) {
        if (this.onComplete) this.onComplete(response);
    }

    presentError(message) {
        console.error('[POMDP] Error:', message);
        if (this.onError) this.onError(message);
    }
}
