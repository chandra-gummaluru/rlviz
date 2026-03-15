// Output boundary interface for SelectNode use case
class SelectNodeOutputBoundary {
    presentSelected(entity) {
        throw new Error('SelectNodeOutputBoundary.presentSelected() must be implemented');
    }

    presentSelectionCleared() {
        throw new Error('SelectNodeOutputBoundary.presentSelectionCleared() must be implemented');
    }
}
