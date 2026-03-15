
/**
 * Interactor for SetMode use case
 * Contains the business logic for switching between editor and simulate modes
 */
class SetModeInteractor extends SetModeInputBoundary {
    /**
     * @param {SetModeOutputBoundary} outputBoundary - The output boundary for presenting results
     */
    constructor(outputBoundary) {
        super();
        if (!outputBoundary) {
            throw new Error("OutputBoundary is required");
        }
        this.outputBoundary = outputBoundary;
        this.validModes = ['editor', 'simulate'];
    }

    /**
     * Execute the set mode operation
     * @param {SetModeInputData} inputData - The input data containing the mode
     * @returns {void}
     */
    execute(inputData) {
        // Validate input data
        if (!inputData || !inputData.mode) {
            const responseModel = {
                success: false,
                error: "Mode is required",
                mode: null
            };
            this.outputBoundary.present(responseModel);
            return;
        }

        // Validate mode value
        const mode = inputData.mode.toLowerCase();
        if (!this.validModes.includes(mode)) {
            const responseModel = {
                success: false,
                error: `Invalid mode: ${inputData.mode}. Must be 'editor' or 'simulate'`,
                mode: null
            };
            this.outputBoundary.present(responseModel);
            return;
        }

        // Mode is valid, prepare success response
        const responseModel = {
            success: true,
            error: null,
            mode: mode
        };

        // Present the results
        this.outputBoundary.present(responseModel);
    }
}
