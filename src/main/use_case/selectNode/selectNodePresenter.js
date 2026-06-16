class SelectNodePresenter extends SelectNodeOutputBoundary {
    constructor(selectionViewModel) {
        super();
        this.selectionViewModel = selectionViewModel;
    }

    presentSelected(entity) {
        this.selectionViewModel.selectedNode = null;
        this.selectionViewModel.selectedEdge = null;
        this.selectionViewModel.selectedTextLabel = null;

        if (entity.type === 'state' || entity.type === 'action') {
            this.selectionViewModel.selectedNode = entity;
        } else if (entity.getFromNode) { // Edge
            this.selectionViewModel.selectedEdge = entity;
        } else if (entity.text !== undefined) { // TextLabel
            this.selectionViewModel.selectedTextLabel = entity;
        }
    }

    presentSelectionCleared() {
        this.selectionViewModel.selectedNode = null;
        this.selectionViewModel.selectedEdge = null;
        this.selectionViewModel.selectedTextLabel = null;
    }
}
