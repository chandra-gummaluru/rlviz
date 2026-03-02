// Interactor for DeleteNode use case
class DeleteNodeInteractor extends DeleteNodeInputBoundary {
    constructor(graph, commandHistory, presenter) {
        super();
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    execute(inputData) {
        const entity = this._findEntity(inputData);

        if (!entity) {
            this.presenter.presentError('Entity not found');
            return;
        }

        const command = this._createDeleteCommand(entity);
        this.commandHistory.execute(command);

        this.presenter.presentDeleted(entity);
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

    _createDeleteCommand(entity) {
        // Check if it's a node (has type property)
        if (entity.type === 'state' || entity.type === 'action') {
            return new DeleteNodeCommand(this.graph, entity);
        }
        // Check if it's an edge (has getFromNode method)
        if (entity.getFromNode) {
            return new DeleteEdgeCommand(this.graph, entity);
        }
        // Check if it's a text label (has text property)
        if (entity.text !== undefined) {
            return new DeleteTextLabelCommand(this.graph, entity);
        }
        throw new Error('Unknown entity type');
    }
}
