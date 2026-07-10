// Presenter for Q-learning (Learning Iteration). Thin: forwards completion/error to injected
// callbacks (same pattern as ExpectationPresenter), letting main.js decide the view refresh.
class QLPresenter extends QLOutputBoundary {
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
        console.error('[QLearning] Error:', message);
        if (this.onError) this.onError(message);
    }
}
