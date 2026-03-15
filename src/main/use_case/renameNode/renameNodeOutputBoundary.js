// Output boundary interface for RenameNode use case
class RenameNodeOutputBoundary {
    presentRenameRequested(node, currentName) {
        throw new Error('RenameNodeOutputBoundary.presentRenameRequested() must be implemented');
    }

    presentRenamed(node) {
        throw new Error('RenameNodeOutputBoundary.presentRenamed() must be implemented');
    }

    presentError(message) {
        throw new Error('RenameNodeOutputBoundary.presentError() must be implemented');
    }
}
