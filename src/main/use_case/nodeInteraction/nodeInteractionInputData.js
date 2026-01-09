// Input data for finding node at position
class FindNodeInputData {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

// Input data for moving a node
class MoveNodeInputData {
    constructor(nodeId, newX, newY) {
        this.nodeId = nodeId;
        this.newX = newX;
        this.newY = newY;
    }
}
