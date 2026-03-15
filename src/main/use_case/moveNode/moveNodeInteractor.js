// Interactor for MoveNode use case
class MoveNodeInteractor extends MoveNodeInputBoundary {
    constructor(graph, presenter) {
        super();
        this.graph = graph;
        this.presenter = presenter;
    }

    startMove(inputData) {
        console.log('MoveNodeInteractor.startMove called with inputData:', inputData);
        const entity = this._findEntity(inputData);
        console.log('Found entity:', entity);
        if (!entity) {
            console.log('Entity not found! inputData.nodeId:', inputData.nodeId);
            console.log('Available nodes:', this.graph.nodes.map(n => ({ id: n.id, name: n.name })));
            this.presenter.presentError('Entity not found');
            return;
        }

        this.presenter.presentMoveStarted(entity, entity.x, entity.y);
    }

    updateMove(inputData) {
        const entity = this._findEntity(inputData);
        if (!entity) return;

        // Update position directly (no undo/redo)
        entity.setPosition(inputData.endX, inputData.endY);
        this.presenter.presentMoveUpdated(entity);
    }

    finishMove(inputData) {
        const entity = this._findEntity(inputData);
        if (!entity) return;

        // Just update final position (no command history)
        entity.setPosition(inputData.endX, inputData.endY);
        this.presenter.presentMoveFinished(entity);
    }

    cancelMove(inputData) {
        const entity = this._findEntity(inputData);
        if (!entity) return;

        // Reset to start position
        entity.setPosition(inputData.startX, inputData.startY);
        this.presenter.presentMoveCancelled(entity);
    }

    _findEntity(inputData) {
        if (inputData.nodeId !== null && inputData.nodeId !== undefined) {
            return this.graph.getNodeById(inputData.nodeId);
        }
        if (inputData.textLabelId !== null && inputData.textLabelId !== undefined) {
            return this.graph.getTextLabelById(inputData.textLabelId);
        }
        return null;
    }
}
