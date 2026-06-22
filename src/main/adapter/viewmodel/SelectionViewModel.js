// Selection state management
class SelectionViewModel {
    constructor() {
        this.selectedNode = null;
        this.selectedEdge = null;
        this.selectedTextLabel = null;
        this.selectedNodeNameLabel = null;
        this.errorMessage = null;
        this.lastDeletedType = null;
    }

    clearSelection() {
        this.selectedNode = null;
        this.selectedEdge = null;
        this.selectedTextLabel = null;
        this.selectedNodeNameLabel = null;
    }

    hasSelection() {
        return this.selectedNode !== null ||
               this.selectedEdge !== null ||
               this.selectedTextLabel !== null ||
               this.selectedNodeNameLabel !== null;
    }

    getSelectedEntity() {
        return this.selectedNode || this.selectedEdge || this.selectedTextLabel;
    }
}
