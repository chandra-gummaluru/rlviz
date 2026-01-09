
/**
 * Interactor for Undo use case
 * Contains the business logic for undoing the last operation
 */
class UndoInteractor extends UndoInputBoundary {
    /**
     * @param {CommandHistory} commandHistory - The command history to operate on
     * @param {UndoOutputBoundary} outputBoundary - The output boundary for presenting results
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
     * Execute the undo operation
     * @param {UndoInputData} inputData - The input data (not used for undo)
     * @returns {void}
     */
    execute(inputData) {
        // Validate that undo is possible
        if (!this.commandHistory.canUndo()) {
            const responseModel = {
                success: false,
                error: "Nothing to undo",
                canUndo: false,
                canRedo: this.commandHistory.canRedo()
            };
            this.outputBoundary.present(responseModel);
            return;
        }

        // Perform the undo operation
        const undoSuccess = this.commandHistory.undo();

        // Prepare response model
        const responseModel = {
            success: undoSuccess,
            error: undoSuccess ? null : "Undo operation failed",
            canUndo: this.commandHistory.canUndo(),
            canRedo: this.commandHistory.canRedo()
        };

        // Present the results
        this.outputBoundary.present(responseModel);
    }
}
