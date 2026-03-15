// Output boundary (interface) for node interaction presenter
class NodeInteractionOutputBoundary {
    presentNodeFound(node) {
        throw new Error('presentNodeFound() must be implemented by subclass');
    }

    presentNodeNotFound() {
        throw new Error('presentNodeNotFound() must be implemented by subclass');
    }

    presentNodeMoved(node) {
        throw new Error('presentNodeMoved() must be implemented by subclass');
    }

    presentError(message) {
        throw new Error('presentError() must be implemented by subclass');
    }
}
