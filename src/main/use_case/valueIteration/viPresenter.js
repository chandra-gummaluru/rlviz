// Presenter for Value Iteration — translates state changes to ViewModel updates
class VIPresenter extends VIOutputBoundary {
    constructor(canvasViewModel) {
        super();
        this.viewModel = canvasViewModel;
        this.toolBar = null;
    }

    get viViewModel() {
        return this.viewModel.valueIterationViewModel;
    }

    setToolBar(toolBar) {
        this.toolBar = toolBar;
    }

    presentLayoutNeeded(canvasWidth, canvasHeight) {
        if (this.viViewModel) {
            const viState = this.viewModel.valueIterationState;
            this.viViewModel.reset();
            this.viViewModel.computeLayout(viState, canvasWidth, canvasHeight);
        }
        this._redraw();
    }

    presentInitialized() {
        this._redraw();
    }

    presentColumnStart(columnIndex) {
        if (this.viViewModel && this.viViewModel.visibleColumnCount <= columnIndex) {
            this.viViewModel.showNextColumn();
        }
        if (this.viViewModel) {
            this.viViewModel.activeColumnIndex = columnIndex;
        }
        this._redraw();
    }

    presentStateBackupStart(columnIndex, stateId) {
        if (this.viViewModel) {
            this.viViewModel.activeColumnIndex = columnIndex;
            this.viViewModel.activeStateId = stateId;
        }
        this._redraw();
    }

    presentStateBackupComplete(columnIndex, stateId) {
        if (this.viViewModel) {
            this.viViewModel.revealValue(columnIndex, stateId);
        }
        this._redraw();
        this._updateRightPanel();
    }

    presentColumnComplete(columnIndex) {
        if (this.viViewModel) {
            this.viViewModel.revealColumn(columnIndex);
        }
        this._redraw();
        this._updateRightPanel();
    }

    presentComplete() {
        const viState = this.viewModel.valueIterationState;
        if (viState) viState.isPlaying = false;
        this._updateButtonStates();
        this._redraw();
        this._updateRightPanel();
    }

    presentPaused() {
        this._updateButtonStates();
        this._redraw();
    }

    presentReset() {
        if (this.viViewModel) {
            this.viViewModel.reset();
        }
        this._updateButtonStates();
        this._redraw();
        this._updateRightPanel();
    }

    presentPhaseChange(phase, duration) {
        this._redraw();
    }

    presentError(message) {
        this.viewModel.lastOperationError = message;
        this._redraw();
    }

    _redraw() {
        if (typeof redraw === 'function') {
            redraw();
        }
    }

    _updateRightPanel() {
        // Signal that right panel content needs refresh
        // This is still a view-layer coupling via redraw — tracked as moderate violation
    }

    _updateButtonStates() {
        if (this.toolBar) {
            const viState = this.viewModel.valueIterationState;
            if (viState) {
                this.toolBar.updateVIButtonStates(viState.isPlaying, viState.canAdvance());
            }
        }
    }
}
