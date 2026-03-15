// Presenter for simulation actions
class SimulationPresenter extends SimulationOutputBoundary {
    constructor(canvasViewModel, mainView) {
        super();
        this.viewModel = canvasViewModel;
        this.mainView = mainView;
    }

    presentInitializationStart() {
        console.log('[Presenter] Initialization starting');
        // ViewModel state will be updated by interactor
        this.mainView.redrawSimulation();
    }

    presentInitializationComplete() {
        console.log('[Presenter] Initialization complete');
        // Update button states based on simulation state
        const isPlaying = this.viewModel.simulationState.isPlaying;
        const canAdvance = this.viewModel.simulationState.canAdvance();
        this.mainView.toolBar.updateButtonStates(isPlaying, canAdvance);
        this.mainView.redrawSimulation();
    }

    presentRoundStart(currentNode, nextNode) {
        console.log(`[Presenter] Round starting: ${currentNode.name} -> ${nextNode.name}`);
        // State updated by interactor, just trigger redraw
    }

    presentRoundComplete(currentNode) {
        console.log(`[Presenter] Round complete at: ${currentNode.name}`);
        // Update button states based on simulation state
        const isPlaying = this.viewModel.simulationState.isPlaying;
        const canAdvance = this.viewModel.simulationState.canAdvance();
        this.mainView.toolBar.updateButtonStates(isPlaying, canAdvance);
        this.mainView.redrawSimulation();
    }

    presentPhaseChange(phase, duration) {
        console.log(`[Presenter] Phase changed to: ${phase} (${duration}ms)`);

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

            case 'spinning_arrow':
                // Start spinning arrow animation - trigger initial redraw
                console.log('[Presenter] Spinning arrow phase started, triggering redraw');
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
                // Reset complete
                this.mainView.redrawSimulation();
                break;
        }
    }

    presentError(message) {
        console.error('[Presenter] Error:', message);
        alert(message);
    }

    presentTraceEnd() {
        console.log('[Presenter] Reached end of trace');
        // Update button states (can't advance anymore)
        this.mainView.toolBar.updateButtonStates(false, false);
        alert('Simulation complete! Reached end of trace.');
    }

    presentPaused() {
        console.log('[Presenter] Simulation paused');
        // Update button states (paused, can still advance)
        const canAdvance = this.viewModel.simulationState.canAdvance();
        this.mainView.toolBar.updateButtonStates(false, canAdvance);
        this.mainView.redrawSimulation();
    }
}
