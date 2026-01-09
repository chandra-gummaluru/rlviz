// Output boundary (interface) for edge creation presenter
class CreateEdgeOutputBoundary {
    presentEdgeCreated(edge) {
        throw new Error('presentEdgeCreated() must be implemented by subclass');
    }

    presentError(message) {
        throw new Error('presentError() must be implemented by subclass');
    }
}
