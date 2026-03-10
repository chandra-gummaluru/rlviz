// Output boundary interface for setting spinning arrow animation
class SetSpinningArrowOutputBoundary {
    presentSuccess(enabled, duration) {
        throw new Error('Method presentSuccess() must be implemented');
    }

    presentError(message) {
        throw new Error('Method presentError() must be implemented');
    }
}
