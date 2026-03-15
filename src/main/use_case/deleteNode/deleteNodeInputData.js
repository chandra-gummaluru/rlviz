// Input data for DeleteNode use case
class DeleteNodeInputData {
    constructor(nodeId, edgeFromId, edgeToId, textLabelId) {
        this.nodeId = nodeId;
        this.edgeFromId = edgeFromId;
        this.edgeToId = edgeToId;
        this.textLabelId = textLabelId;
    }

    static forNode(nodeId) {
        return new DeleteNodeInputData(nodeId, null, null, null);
    }

    static forEdge(fromId, toId) {
        return new DeleteNodeInputData(null, fromId, toId, null);
    }

    static forTextLabel(labelId) {
        return new DeleteNodeInputData(null, null, null, labelId);
    }
}
