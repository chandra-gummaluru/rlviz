
/**
 * Interactor for Redo use case
 * Contains the business logic for redoing the last undone operation
 */
class RedoInteractor extends RedoInputBoundary {
    /**
     * @param {CommandHistory} commandHistory - The command history to operate on
     * @param {RedoOutputBoundary} outputBoundary - The output boundary for presenting results
     */
    constructor(commandHistory, outputBoundary) {
        super();
        if (!commandHistory) {
            throw new Error("CommandHistory is required");
        }
        if (!outputBoundary) {
            throw new Error("OutputBoundary is required");
        }
        this.commandHistory = commandHistory;
        this.outputBoundary = outputBoundary;
    }

    /**
     * Execute the redo operation
     * @param {RedoInputData} inputData - The input data (not used for redo)
     * @returns {void}
     */
    execute(inputData) {
        // Validate that redo is possible
        if (!this.commandHistory.canRedo()) {
            const responseModel = {
                success: false,
                error: "Nothing to redo",
                canUndo: this.commandHistory.canUndo(),
                canRedo: false
            };
            this.outputBoundary.present(responseModel);
            return;
        }

        // Perform the redo operation
        const redoSuccess = this.commandHistory.redo();

        // Prepare response model
        const responseModel = {
            success: redoSuccess,
            error: redoSuccess ? null : "Redo operation failed",
            canUndo: this.commandHistory.canUndo(),
            canRedo: this.commandHistory.canRedo()
        };

        // Present the results
        this.outputBoundary.present(responseModel);
    }
}
