// Presenter for SelectNode use case
class SelectNodePresenter extends SelectNodeOutputBoundary {
    constructor(selectionViewModel) {
        super();
        this.selectionViewModel = selectionViewModel;
    }

    presentSelected(entity) {
        console.log('SelectNodePresenter.presentSelected called with entity:', entity);
        this.selectionViewModel.selectedNode = null;
        this.selectionViewModel.selectedEdge = null;
        this.selectionViewModel.selectedTextLabel = null;

        if (entity.type === 'state' || entity.type === 'action') {
            console.log('Setting selectedNode to:', entity.name, 'ID:', entity.id);
            this.selectionViewModel.selectedNode = entity;
            console.log('selectedNode is now:', this.selectionViewModel.selectedNode);
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
