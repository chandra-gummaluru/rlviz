// Input data for creating an edge
class CreateEdgeInputData {
    constructor(fromNodeId, toNodeId, probability, reward) {
        this.fromNodeId = fromNodeId;
        this.toNodeId = toNodeId;
        this.probability = probability;
        this.reward = reward;
    }
}
