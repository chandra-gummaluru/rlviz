// Input data for SetImage use case
class SetImageInputData {
    constructor(nodeId, imageData) {
        this.nodeId = nodeId;
        this.imageData = imageData; // base64 data URL or undefined to remove
    }
}
