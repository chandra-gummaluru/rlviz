// Presenter for graph serialization
class SerializeGraphPresenter extends SerializeGraphOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
        this.serializedData = null;
    }

    presentSerializedGraph(jsonString) {
        // Store serialized data for retrieval
        this.serializedData = jsonString;
        console.log('Graph serialized successfully');
    }

    presentError(message) {
        console.error(`Serialize graph error: ${message}`);
        alert(`Error serializing graph: ${message}`);
        this.serializedData = null;
    }

    // Getter for serialized data (used by ViewModel)
    getSerializedData() {
        return this.serializedData;
    }
}
