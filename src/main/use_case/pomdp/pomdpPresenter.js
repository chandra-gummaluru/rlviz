// DEPRECATED — partial observability is IN DEVELOPMENT. This file is kept but is no longer
// reachable from the UI (inDevelopmentCard.js is shown instead; main.js's VI handlers no-op while
// observability === 'partial'). See CLAUDE.md "Partial observability (in development)".
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
