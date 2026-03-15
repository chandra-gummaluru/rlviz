// Interactor for CreateTextLabel use case
class CreateTextLabelInteractor extends CreateTextLabelInputBoundary {
    constructor(graph, commandHistory, presenter) {
        super();
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    requestCreate(inputData) {
        // Request text input from user (View handles prompt)
        this.presenter.presentTextRequested();
    }

    execute(inputData) {
        // Validate text
        if (!inputData.text || inputData.text.trim() === '') {
            this.presenter.presentError('Text cannot be empty');
            return;
        }

        // Business rule: default font size
        const fontSize = inputData.fontSize || 16;

        const label = new TextLabel(
            inputData.text,
            inputData.x,
            inputData.y,
            fontSize
        );

        const command = new AddTextLabelCommand(this.graph, label);
        this.commandHistory.execute(command);

        this.presenter.presentTextLabelCreated(label);
    }
}
