// Presenter for Log Optimal Policy - mirrors EvaluatePolicyPresenter exactly (same
// constructor(canvasViewModel) + setRightPanel() shape, same lastOperationError error convention).
class LogOptimalPolicyPresenter extends LogOptimalPolicyOutputBoundary {
    constructor(canvasViewModel) {
        super();
        this.viewModel = canvasViewModel;
        this.rightPanel = null;
    }

    setRightPanel(rightPanel) { this.rightPanel = rightPanel; }

    presentLogged(entry) {
        this._updateRightPanel();
        this._redraw();
    }

    presentError(message) {
        this.viewModel.lastOperationError = message;
        this._redraw();
    }

    _redraw() {
        if (typeof redraw === 'function') redraw();
    }

    _updateRightPanel() {
        if (this.rightPanel) this.rightPanel.updateContent();
    }
}
