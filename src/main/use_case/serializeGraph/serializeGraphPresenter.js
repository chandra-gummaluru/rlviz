
class SerializeGraphPresenter extends SerializeGraphOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
        this.serializedData = null;
    }

    presentSerializedGraph(jsonString) {
        this.serializedData = jsonString;
    }

    presentError(message) {
        console.error(`Serialize graph error: ${message}`);
        this.viewModel.lastOperationError = `Error serializing graph: ${message}`;
        this.serializedData = null;
    }

    getSerializedData() {
        return this.serializedData;
    }
}
