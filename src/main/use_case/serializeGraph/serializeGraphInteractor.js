// Interactor for serializing graph to JSON
class SerializeGraphInteractor extends SerializeGraphInputBoundary {
    constructor(graph, outputBoundary) {
        super();
        this.graph = graph;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        try {
            // Serialize graph to object
            const serialized = this.graph.serialize();

            // Convert to JSON string with formatting
            const jsonString = JSON.stringify(serialized, null, 2);

            // Present serialized data
            this.outputBoundary.presentSerializedGraph(jsonString);
        } catch (error) {
            this.outputBoundary.presentError(error.message);
        }
    }
}
