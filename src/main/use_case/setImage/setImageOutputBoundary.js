// Output boundary for SetImage use case
class SetImageOutputBoundary {
    presentImageSet(node) {
        throw new Error('SetImageOutputBoundary.presentImageSet() must be implemented');
    }

    presentError(message) {
        throw new Error('SetImageOutputBoundary.presentError() must be implemented');
    }
}
