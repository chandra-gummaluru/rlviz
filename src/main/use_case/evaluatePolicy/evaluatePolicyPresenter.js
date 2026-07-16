// Presenter for Evaluate Policy - mirrors VIPresenter's real, established convention exactly
// (constructor(canvasViewModel) holding a live viewModel reference, plus null-initialized sibling
// UI slots wired in later via setXxx() setters from main.js, not two ad hoc callbacks): main.js
// constructs `viPresenter = new VIPresenter(canvasViewModel)` then calls
// `.setTopBar(topBar)` / `.setRightPanel(rightPanel)` / `.setChartDock(...)` / `.setSweepChip(...)`
// once those siblings exist. This presenter only needs the right panel's "Policy log" section
// (Task 5) refreshed on a new entry, so it exposes just `setRightPanel()`. Error reporting mirrors
// the same `viewModel.lastOperationError = message` convention used by VIPresenter,
// CreateEdgePresenter, SimulationPresenter, SerializeGraphPresenter, and ImportGraphPresenter -
// the actual shared error-presentation pattern across this codebase's presenters, not a one-off
// callback.
class EvaluatePolicyPresenter extends EvaluatePolicyOutputBoundary {
    constructor(canvasViewModel) {
        super();
        this.viewModel = canvasViewModel;
        this.rightPanel = null;
    }

    setRightPanel(rightPanel) { this.rightPanel = rightPanel; }

    presentEvaluated(entry) {
        this._updateRightPanel();
        this._redraw();
    }

    presentError(message) {
        this.viewModel.lastOperationError = message;
        this._redraw();
    }

    // --- Internal helpers (mirroring VIPresenter's own _redraw()/_updateRightPanel() names) ---

    _redraw() {
        if (typeof redraw === 'function') redraw();
    }

    _updateRightPanel() {
        if (this.rightPanel) this.rightPanel.updateContent();
    }
}
