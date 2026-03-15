// Output boundary for simulation actions
class SimulationOutputBoundary {
    presentInitializationStart() {
        throw new Error('SimulationOutputBoundary.presentInitializationStart() must be implemented');
    }

    presentInitializationComplete() {
        throw new Error('SimulationOutputBoundary.presentInitializationComplete() must be implemented');
    }

    presentRoundStart(currentNode, nextNode) {
        throw new Error('SimulationOutputBoundary.presentRoundStart() must be implemented');
    }

    presentRoundComplete(currentNode) {
        throw new Error('SimulationOutputBoundary.presentRoundComplete() must be implemented');
    }

    presentPhaseChange(phase, duration) {
        throw new Error('SimulationOutputBoundary.presentPhaseChange() must be implemented');
    }

    presentError(message) {
        throw new Error('SimulationOutputBoundary.presentError() must be implemented');
    }

    presentTraceEnd() {
        throw new Error('SimulationOutputBoundary.presentTraceEnd() must be implemented');
    }

    presentPaused() {
        throw new Error('SimulationOutputBoundary.presentPaused() must be implemented');
    }
}
