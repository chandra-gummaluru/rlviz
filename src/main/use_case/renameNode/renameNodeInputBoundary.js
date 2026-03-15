// Input boundary interface for RenameNode use case
class RenameNodeInputBoundary {
    requestRename(inputData) {
        throw new Error('RenameNodeInputBoundary.requestRename() must be implemented');
    }

    executeRename(inputData) {
        throw new Error('RenameNodeInputBoundary.executeRename() must be implemented');
    }
}
