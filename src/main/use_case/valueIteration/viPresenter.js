// Presenter for Value Iteration — translates state changes to view updates
class VIPresenter extends VIOutputBoundary {
    constructor(canvasViewModel, mainView) {
        super();
        this.viewModel = canvasViewModel;
        this.mainView = mainView;
        this.toolBar = null;  // set after construction
    }

    setToolBar(toolBar) {
        this.toolBar = toolBar;
    }

    presentInitialized() {
        this._redraw();
    }

    presentColumnStart(columnIndex) {
        this._redraw();
    }

    presentStateBackupStart(columnIndex, stateId) {
        this._redraw();
    }

    presentStateBackupComplete(columnIndex, stateId) {
        this._redraw();
        this._updateRightPanel();
    }

    presentColumnComplete(columnIndex) {
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
        this._updateButtonStates();
        this._redraw();
        this._updateRightPanel();
    }

    presentPhaseChange(phase, duration) {
        this._redraw();
    }

    presentError(message) {
        alert(message);
    }

    _redraw() {
        if (this.mainView) {
            redraw();
        }
    }

    _updateRightPanel() {
        if (this.mainView && this.mainView.rightPanel) {
            this.mainView.rightPanel.updateContent();
        }
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
