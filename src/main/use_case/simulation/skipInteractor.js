// Interactor for Skip simulation action
class SkipInteractor extends SkipInputBoundary {
    constructor(simulationState, outputBoundary) {
        super();
        this.simulationState = simulationState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        // Skip to the end of the trace
        if (!this.simulationState.replayInitialized) {
            this.outputBoundary.presentError('Simulation not started yet');
            return;
        }

        if (!this.simulationState.canAdvance()) {
            this.outputBoundary.presentError('Already at end of trace');
            return;
        }

        // Fast-forward: reveal all nodes and edges in the trace
        const visited = this.simulationState.visited;

        for (let i = 0; i < visited.length; i++) {
            const node = visited[i];
            this.simulationState.revealNode(node.id);

            // Reveal edges
            if (i < visited.length - 1) {
                const nextNode = visited[i + 1];
                this.simulationState.revealEdge(node.id, nextNode.id);
            }
        }

        // Advance to last node
        while (this.simulationState.canAdvance()) {
            this.simulationState.advance();
        }

        this.simulationState.clearHighlight();
        this.simulationState.setPhase('idle', 0);

        this.outputBoundary.presentTraceEnd();
        console.log('Skipped to end of trace');
    }
}
