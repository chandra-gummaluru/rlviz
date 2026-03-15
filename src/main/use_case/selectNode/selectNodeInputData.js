// Input data for SelectNode use case
class SelectNodeInputData {
    constructor(nodeId, edgeFromId, edgeToId, textLabelId) {
        this.nodeId = nodeId;
        this.edgeFromId = edgeFromId;
        this.edgeToId = edgeToId;
        this.textLabelId = textLabelId;
    }

    static forNode(nodeId) {
        return new SelectNodeInputData(nodeId, null, null, null);
    }

    static forEdge(fromId, toId) {
        return new SelectNodeInputData(null, fromId, toId, null);
    }

    static forTextLabel(labelId) {
        return new SelectNodeInputData(null, null, null, labelId);
    }

    static forClear() {
        return new SelectNodeInputData(null, null, null, null);
    }
}
