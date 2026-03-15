// Input data for MoveNode use case
class MoveNodeInputData {
    constructor(nodeId, textLabelId, startX, startY, endX, endY) {
        this.nodeId = nodeId;
        this.textLabelId = textLabelId;
        this.startX = startX;
        this.startY = startY;
        this.endX = endX;
        this.endY = endY;
    }

    static forNodeStart(nodeId) {
        return new MoveNodeInputData(nodeId, null, null, null, null, null);
    }

    static forNodeUpdate(nodeId, newX, newY) {
        return new MoveNodeInputData(nodeId, null, null, null, newX, newY);
    }

    static forNodeFinish(nodeId, startX, startY, endX, endY) {
        return new MoveNodeInputData(nodeId, null, startX, startY, endX, endY);
    }

    static forTextLabelStart(labelId) {
        return new MoveNodeInputData(null, labelId, null, null, null, null);
    }

    static forTextLabelUpdate(labelId, newX, newY) {
        return new MoveNodeInputData(null, labelId, null, null, newX, newY);
    }

    static forTextLabelFinish(labelId, startX, startY, endX, endY) {
        return new MoveNodeInputData(null, labelId, startX, startY, endX, endY);
    }
}
