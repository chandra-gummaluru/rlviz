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
        this.mainView.sideBar.playButton.setPlaying(true);
        this.mainView.sideBar.updateSimulationStatusLine();
        this.mainView.redrawSimulation();
    }

    presentRoundStart(currentNode, nextNode) {
        console.log(`[Presenter] Round starting: ${currentNode.name} -> ${nextNode.name}`);
        // State updated by interactor, just trigger redraw
    }

    presentRoundComplete(currentNode) {
        console.log(`[Presenter] Round complete at: ${currentNode.name}`);
        this.mainView.sideBar.updateSimulationStatusLine();
        this.mainView.redrawSimulation();
    }

    presentPhaseChange(phase, duration) {
        console.log(`[Presenter] Phase changed to: ${phase} (${duration}ms)`);

        // Trigger appropriate visual updates based on phase
        switch (phase) {
            case 'center_camera':
                // Center camera on start node
                const startNode = this.viewModel.simulationState.visited[0];
                const actualNode = this.viewModel.graph.getNodeById(startNode.id);
                if (actualNode) {
                    this.viewModel.centerOnNode(actualNode, this.mainView.canvas.width, this.mainView.canvas.height);
                }
                this.mainView.redrawSimulation();
                break;

            case 'camera_move':
                // Center camera on current node (which is now the toNode after advance)
                const currentNodeData = this.viewModel.simulationState.currentNode;
                const currentActualNode = this.viewModel.graph.getNodeById(currentNodeData.id);
                if (currentActualNode) {
                    this.viewModel.centerOnNode(currentActualNode, this.mainView.canvas.width, this.mainView.canvas.height);
                }
                this.mainView.redrawSimulation();
                break;

            case 'reveal':
                // Reveal all outgoing edges
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
                this.mainView.sideBar.updateSimulationStatusLine();
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
        this.mainView.sideBar.playButton.setPlaying(false);
        alert('Simulation complete! Reached end of trace.');
    }
}
