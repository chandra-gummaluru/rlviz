// Input boundary interface for SelectNode use case
class SelectNodeInputBoundary {
    select(inputData) {
        throw new Error('SelectNodeInputBoundary.select() must be implemented');
    }

    clearSelection(inputData) {
        throw new Error('SelectNodeInputBoundary.clearSelection() must be implemented');
    }
}
