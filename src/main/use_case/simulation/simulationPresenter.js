// Presenter for simulation actions
class SimulationPresenter extends SimulationOutputBoundary {
    constructor(canvasViewModel, mainView) {
        super();
        this.viewModel = canvasViewModel;
        this.mainView = mainView;
    }

    presentInitializationStart() {
        // ViewModel state will be updated by interactor
        this.mainView.redrawSimulation();
    }

    presentInitializationComplete() {
        // Update button states based on simulation state
        const isPlaying = this.viewModel.simulationState.isPlaying;
        const canAdvance = this.viewModel.simulationState.canAdvance();
        this.mainView.toolBar.updateButtonStates(isPlaying, canAdvance);
        this.mainView.redrawSimulation();
    }

    presentRoundStart(currentNode, nextNode) {
        // State updated by interactor, just trigger redraw
    }

    presentRoundComplete(currentNode) {
        // Update button states based on simulation state
        const isPlaying = this.viewModel.simulationState.isPlaying;
        const canAdvance = this.viewModel.simulationState.canAdvance();
        this.mainView.toolBar.updateButtonStates(isPlaying, canAdvance);
        this.mainView.redrawSimulation();
    }

    presentPhaseChange(phase, duration) {
        // Trigger appropriate visual updates based on phase
        switch (phase) {
            case 'center_camera':
                // Skip camera centering - maintain original perspective
                this.mainView.redrawSimulation();
                break;

            case 'camera_move':
                // Skip camera centering - maintain original perspective
                this.mainView.redrawSimulation();
                break;

            case 'reveal':
                // Reveal all outgoing edges
                this.mainView.redrawSimulation();
                break;

            case 'reward_collect':
                // Launch reward particles after spinning arrow determines outcome
                this.mainView.redrawSimulation();
                if (this.viewModel.simulationState.hasPendingReward()) {
                    const simState = this.viewModel.simulationState;
                    this.mainView.launchRewardParticles(
                        simState.pendingReward,
                        simState.pendingRewardActionNodeId
                    );
                }
                break;

            case 'spinning_arrow':
                // Start spinning arrow animation - trigger initial redraw
                this.mainView.redrawSimulation();
                break;

            case 'edge_highlight':
            case 'decision_pause':
            case 'transition_pause':
            case 'pause':
                // Just redraw with current state
                this.mainView.redrawSimulation();
                break;

            case 'reset':
                // Reset complete - clean up any active particle animations
                if (this.mainView.rewardParticleSystem) {
                    this.mainView.rewardParticleSystem.destroy();
                }
                this.mainView.redrawSimulation();
                break;
        }
    }

    presentError(message) {
        console.error('[Presenter] Error:', message);
        this.viewModel.lastOperationError = message;
    }

    presentTraceEnd() {
        // Update button states (can't advance anymore)
        this.mainView.toolBar.updateButtonStates(false, false);
        this.viewModel.lastOperationMessage = 'Simulation complete! Reached end of trace.';
    }

    presentPaused() {
        // Update button states (paused, can still advance)
        const canAdvance = this.viewModel.simulationState.canAdvance();
        this.mainView.toolBar.updateButtonStates(false, canAdvance);
        this.mainView.redrawSimulation();
    }
}
