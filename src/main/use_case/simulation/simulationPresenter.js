// Presenter for simulation actions
class SimulationPresenter extends SimulationOutputBoundary {
    constructor(canvasViewModel) {
        super();
        this.viewModel = canvasViewModel;
        this.topBar = null;
        this._onLaunchParticles = null;
        this._onDestroyParticles = null;
    }

    setTopBar(topBar) {
        this.topBar = topBar;
    }

    setParticleCallbacks(launchCb, destroyCb) {
        this._onLaunchParticles = launchCb;
        this._onDestroyParticles = destroyCb;
    }

    presentInitializationStart() {
        redraw();
    }

    presentInitializationComplete() {
        if (this.viewModel.interaction.mode !== 'build' && this.viewModel.interaction.mode !== 'policy') return;
        const isPlaying = this.viewModel.simulationState.isPlaying;
        const canAdvance = this.viewModel.simulationState.canAdvance();
        if (this.topBar) this.topBar.updateButtonStates(isPlaying, canAdvance);
        redraw();
    }

    presentRoundStart(currentNode, nextNode) {
        // State updated by interactor, just trigger redraw
    }

    presentRoundComplete(currentNode) {
        const isPlaying = this.viewModel.simulationState.isPlaying;
        const canAdvance = this.viewModel.simulationState.canAdvance();
        if (this.topBar) this.topBar.updateButtonStates(isPlaying, canAdvance);
        redraw();
    }

    presentPhaseChange(phase, duration) {
        switch (phase) {
            case 'center_camera':
            case 'camera_move':
            case 'reveal':
            case 'state_spinning_arrow':
            case 'spinning_arrow':
            case 'edge_highlight':
            case 'decision_pause':
            case 'transition_pause':
            case 'pause':
                redraw();
                break;

            case 'reward_collect':
                redraw();
                if (this.viewModel.simulationState.hasPendingReward()) {
                    const simState = this.viewModel.simulationState;
                    if (this._onLaunchParticles) {
                        this._onLaunchParticles(simState.pendingReward, simState.pendingRewardActionNodeId);
                    }
                }
                break;

            case 'reset':
                if (this._onDestroyParticles) this._onDestroyParticles();
                redraw();
                break;
        }
    }

    presentError(message) {
        console.error('[Presenter] Error:', message);
        this.viewModel.lastOperationError = message;
    }

    presentTraceEnd() {
        if (this.viewModel.interaction.mode !== 'build' && this.viewModel.interaction.mode !== 'policy') return;
        if (this.topBar) this.topBar.updateButtonStates(false, false);
        this.viewModel.lastOperationMessage = 'Simulation complete! Reached end of trace.';
    }

    presentPaused() {
        if (this.viewModel.interaction.mode !== 'build' && this.viewModel.interaction.mode !== 'policy') return;
        const canAdvance = this.viewModel.simulationState.canAdvance();
        if (this.topBar) this.topBar.updateButtonStates(false, canAdvance);
        redraw();
    }
}
