// Output boundary (interface) for graph serialization presenter
class SerializeGraphOutputBoundary {
    presentSerializedGraph(jsonString) {
        throw new Error('presentSerializedGraph() must be implemented by subclass');
    }

    presentError(message) {
        throw new Error('presentError() must be implemented by subclass');
    }
}
