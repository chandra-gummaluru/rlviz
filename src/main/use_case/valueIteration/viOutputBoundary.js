// Output boundary interface for Value Iteration use cases
class VIOutputBoundary {
    presentInitialized() { throw new Error('Not implemented'); }
    presentLayoutNeeded(canvasWidth, canvasHeight) { throw new Error('Not implemented'); }
    presentColumnStart(columnIndex) { throw new Error('Not implemented'); }
    presentStateBackupStart(columnIndex, stateId) { throw new Error('Not implemented'); }
    presentStateBackupComplete(columnIndex, stateId) { throw new Error('Not implemented'); }
    presentColumnComplete(columnIndex) { throw new Error('Not implemented'); }
    presentComplete() { throw new Error('Not implemented'); }
    presentPaused() { throw new Error('Not implemented'); }
    presentReset() { throw new Error('Not implemented'); }
    presentPhaseChange(phase, duration) { throw new Error('Not implemented'); }
    presentError(message) { throw new Error('Not implemented'); }

    // Detailed Bellman backup sub-phase callbacks
    presentEquationStart(columnIndex, stateId) { throw new Error('Not implemented'); }
    presentActionsRevealed(columnIndex, stateId) { throw new Error('Not implemented'); }
    presentTransitionsRevealed(columnIndex, stateId) { throw new Error('Not implemented'); }
    presentQValuesComputed(columnIndex, stateId) { throw new Error('Not implemented'); }
    presentMaxSelected(columnIndex, stateId) { throw new Error('Not implemented'); }
    presentValueRevealStart(columnIndex, stateId) { throw new Error('Not implemented'); }
}
