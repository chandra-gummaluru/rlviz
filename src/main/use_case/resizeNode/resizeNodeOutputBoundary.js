// Output boundary (interface) for resize node presenter
class ResizeNodeOutputBoundary {
    presentNodeResized(node) {
        throw new Error('presentNodeResized() must be implemented by subclass');
    }

    presentError(message) {
        throw new Error('presentError() must be implemented by subclass');
    }
}
