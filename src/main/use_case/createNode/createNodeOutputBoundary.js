// Output boundary (interface) for node creation presenter
class CreateNodeOutputBoundary {
    presentNodeCreated(node) {
        throw new Error('presentNodeCreated() must be implemented by subclass');
    }

    presentError(message) {
        throw new Error('presentError() must be implemented by subclass');
    }
}
