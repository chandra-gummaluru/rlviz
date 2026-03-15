// Presenter for MoveNode use case
class MoveNodePresenter extends MoveNodeOutputBoundary {
    constructor(interactionViewModel) {
        super();
        this.interactionViewModel = interactionViewModel;
    }

    presentMoveStarted(entity, startX, startY) {
        // Store drag start position
        if (entity.type === 'state' || entity.type === 'action') {
            this.interactionViewModel.dragStartNodeX = startX;
            this.interactionViewModel.dragStartNodeY = startY;
        }
    }

    presentMoveUpdated(entity) {
        // Live update - no state change needed
        // Entity already moved by interactor
    }

    presentMoveFinished(entity) {
        // Clear drag state
        this.interactionViewModel.clearDrag();
    }

    presentMoveCancelled(entity) {
        // Clear drag state
        this.interactionViewModel.clearDrag();
    }

    presentError(message) {
        // Could set error message on ViewModel if needed
        console.error('Move error:', message);
    }
}
