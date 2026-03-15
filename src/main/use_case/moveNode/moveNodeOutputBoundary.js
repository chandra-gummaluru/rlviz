// Output boundary interface for MoveNode use case
class MoveNodeOutputBoundary {
    presentMoveStarted(entity, startX, startY) {
        throw new Error('MoveNodeOutputBoundary.presentMoveStarted() must be implemented');
    }

    presentMoveUpdated(entity) {
        throw new Error('MoveNodeOutputBoundary.presentMoveUpdated() must be implemented');
    }

    presentMoveFinished(entity) {
        throw new Error('MoveNodeOutputBoundary.presentMoveFinished() must be implemented');
    }

    presentMoveCancelled(entity) {
        throw new Error('MoveNodeOutputBoundary.presentMoveCancelled() must be implemented');
    }

    presentError(message) {
        throw new Error('MoveNodeOutputBoundary.presentError() must be implemented');
    }
}
