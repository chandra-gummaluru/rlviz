// Interactor for SelectNode use case
class SelectNodeInteractor extends SelectNodeInputBoundary {
    constructor(graph, presenter) {
        super();
        this.graph = graph;
        this.presenter = presenter;
    }

    select(inputData) {
        console.log('SelectNodeInteractor.select called with inputData:', inputData);
        const entity = this._findEntity(inputData);
        console.log('Found entity:', entity);

        if (!entity) {
            console.log('Entity not found! Clearing selection.');
            this.presenter.presentSelectionCleared();
            return;
        }

        this.presenter.presentSelected(entity);
    }

    clearSelection(inputData) {
        this.presenter.presentSelectionCleared();
    }

    _findEntity(inputData) {
        if (inputData.nodeId !== null && inputData.nodeId !== undefined) {
            return this.graph.getNodeById(inputData.nodeId);
        }
        if (inputData.edgeFromId !== null && inputData.edgeFromId !== undefined &&
            inputData.edgeToId !== null && inputData.edgeToId !== undefined) {
            return this.graph.edges.find(e =>
                e.getFromNode().id === inputData.edgeFromId &&
                e.getToNode().id === inputData.edgeToId
            );
        }
        if (inputData.textLabelId !== null && inputData.textLabelId !== undefined) {
            return this.graph.getTextLabelById(inputData.textLabelId);
        }
        return null;
    }
}
