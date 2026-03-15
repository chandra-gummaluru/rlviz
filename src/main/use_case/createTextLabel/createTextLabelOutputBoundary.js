// Output boundary interface for CreateTextLabel use case
class CreateTextLabelOutputBoundary {
    presentTextRequested() {
        throw new Error('CreateTextLabelOutputBoundary.presentTextRequested() must be implemented');
    }

    presentTextLabelCreated(label) {
        throw new Error('CreateTextLabelOutputBoundary.presentTextLabelCreated() must be implemented');
    }

    presentError(message) {
        throw new Error('CreateTextLabelOutputBoundary.presentError() must be implemented');
    }
}
