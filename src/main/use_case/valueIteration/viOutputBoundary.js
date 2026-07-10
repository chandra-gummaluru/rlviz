// Output boundary interface for Value Iteration use cases
class VIOutputBoundary {
    presentInitialized() { throw new Error('Not implemented'); }
    presentSweepComplete(sweepIndex) { throw new Error('Not implemented'); }
    presentComplete() { throw new Error('Not implemented'); }
    presentPaused() { throw new Error('Not implemented'); }
    presentReset() { throw new Error('Not implemented'); }
    presentError(message) { throw new Error('Not implemented'); }
}
