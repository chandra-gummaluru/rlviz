// Presenter for DeleteNode use case
class DeleteNodePresenter extends DeleteNodeOutputBoundary {
    constructor(selectionViewModel) {
        super();
        this.selectionViewModel = selectionViewModel;
    }

    presentDeleted(entity) {
        // Clear selection since deleted entity might have been selected
        this.selectionViewModel.clearSelection();

        // Track what was deleted for potential UI feedback
        this.selectionViewModel.lastDeletedType = this._getEntityType(entity);

        // Trigger visual update
        redraw();
    }

    presentError(message) {
        this.selectionViewModel.errorMessage = message;
        redraw();
    }

    _getEntityType(entity) {
        if (entity.type) return entity.type; // node
        if (entity.getFromNode) return 'edge';
        if (entity.text !== undefined) return 'textLabel';
        return 'unknown';
    }
}
