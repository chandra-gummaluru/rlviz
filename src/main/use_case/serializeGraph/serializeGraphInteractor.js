class SerializeGraphInteractor extends SerializeGraphInputBoundary {
    constructor(graph, outputBoundary) {
        super();
        this.graph = graph;
        this.outputBoundary = outputBoundary;
        this.presenter = outputBoundary;
    }

    execute(inputData) {
        try {
            // Serialize graph to object (include positions for file export)
            const includePositions = inputData && inputData.includePositions;
            const serialized = this.graph.serialize(includePositions);

            const jsonString = JSON.stringify(serialized, null, 2);

            this.outputBoundary.presentSerializedGraph(jsonString);
        } catch (error) {
            this.outputBoundary.presentError(error.message);
        }
    }
}
