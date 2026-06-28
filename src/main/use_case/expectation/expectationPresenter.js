class ExpectationPresenter extends ExpectationOutputBoundary {
    constructor(canvasViewModel, expectationViewModel) {
        super();
        this.viewModel = canvasViewModel;
        this.expectationViewModel = expectationViewModel;
        this.onComplete = null;
        this.onError = null;
    }

    presentComplete(response) {
        this.expectationViewModel.lastResponse = response;
        if (this.onComplete) this.onComplete(response);
    }

    presentError(message) {
        this.expectationViewModel.lastError = message;
        if (this.onError) this.onError(message);
    }
}
