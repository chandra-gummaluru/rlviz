// Input boundary interface for MoveNode use case
class MoveNodeInputBoundary {
    startMove(inputData) {
        throw new Error('MoveNodeInputBoundary.startMove() must be implemented');
    }

    updateMove(inputData) {
        throw new Error('MoveNodeInputBoundary.updateMove() must be implemented');
    }

    finishMove(inputData) {
        throw new Error('MoveNodeInputBoundary.finishMove() must be implemented');
    }

    cancelMove(inputData) {
        throw new Error('MoveNodeInputBoundary.cancelMove() must be implemented');
    }
}
