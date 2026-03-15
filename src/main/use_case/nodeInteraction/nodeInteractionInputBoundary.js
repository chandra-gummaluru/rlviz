// Input boundary (interface) for node interactions
class NodeInteractionInputBoundary {
    findNodeAtPosition(inputData) {
        throw new Error('findNodeAtPosition() must be implemented by subclass');
    }

    moveNode(inputData) {
        throw new Error('moveNode() must be implemented by subclass');
    }
}
