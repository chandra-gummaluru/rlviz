// Input data for resizing a node or a text label (fontSize plays the role of "size").
// Exactly one of nodeId/textLabelId is set, mirroring MoveNodeInputData's entity-agnostic shape.
class ResizeNodeInputData {
    constructor(nodeId, oldSize, newSize) {
        this.nodeId = nodeId;
        this.textLabelId = null;
        this.oldSize = oldSize;
        this.newSize = newSize;
    }

    static forTextLabel(textLabelId, oldSize, newSize) {
        const data = new ResizeNodeInputData(null, oldSize, newSize);
        data.textLabelId = textLabelId;
        return data;
    }
}
