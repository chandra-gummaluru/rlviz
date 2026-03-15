// Input data for RenameNode use case
class RenameNodeInputData {
    constructor(nodeId, newName) {
        this.nodeId = nodeId;
        this.newName = newName;
    }

    static forRequest(nodeId) {
        return new RenameNodeInputData(nodeId, null);
    }

    static forExecution(nodeId, newName) {
        return new RenameNodeInputData(nodeId, newName);
    }
}
