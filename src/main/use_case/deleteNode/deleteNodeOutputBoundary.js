// Output boundary interface for DeleteNode use case
class DeleteNodeOutputBoundary {
    presentDeleted(entity) {
        throw new Error('DeleteNodeOutputBoundary.presentDeleted() must be implemented');
    }

    presentError(message) {
        throw new Error('DeleteNodeOutputBoundary.presentError() must be implemented');
    }
}
