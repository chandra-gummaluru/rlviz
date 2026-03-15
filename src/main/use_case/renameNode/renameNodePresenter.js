// Presenter for RenameNode use case
class RenameNodePresenter extends RenameNodeOutputBoundary {
    constructor(interactionViewModel) {
        super();
        this.interactionViewModel = interactionViewModel;
    }

    presentRenameRequested(node, currentName) {
        // Signal to View that rename is needed
        this.interactionViewModel.pendingRenameNodeId = node.id;
        this.interactionViewModel.pendingRenameCurrentName = currentName;
        this.interactionViewModel.renameTargetNode = node;
        this.interactionViewModel.renameRequested = true;
    }

    presentRenamed(node) {
        // Clear pending state
        this.interactionViewModel.pendingRenameNodeId = null;
        this.interactionViewModel.pendingRenameCurrentName = null;
        this.interactionViewModel.renameTargetNode = null;
        this.interactionViewModel.renameRequested = false;
    }

    presentError(message) {
        this.interactionViewModel.pendingRenameNodeId = null;
        this.interactionViewModel.pendingRenameCurrentName = null;
        this.interactionViewModel.renameTargetNode = null;
        this.interactionViewModel.renameRequested = false;
        console.error('Rename error:', message);
    }
}
