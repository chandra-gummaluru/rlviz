/**
 * Interactor for SetValuesSubView use case
 * Contains the business logic for switching between Values mode's sub-views
 * (Monte Carlo / Value Iteration / split compare)
 */
class SetValuesSubViewInteractor extends SetValuesSubViewInputBoundary {
    /**
     * @param {SetValuesSubViewOutputBoundary} outputBoundary - The output boundary for presenting results
     */
    constructor(outputBoundary) {
        super();
        if (!outputBoundary) {
            throw new Error("OutputBoundary is required");
        }
        this.outputBoundary = outputBoundary;
        this.validSubViews = ['mc', 'vi', 'split'];
    }

    /**
     * Execute the set values sub-view operation
     * @param {SetValuesSubViewInputData} inputData - The input data containing the sub-view
     * @returns {void}
     */
    execute(inputData) {
        if (!inputData || !inputData.subView) {
            this.outputBoundary.present({
                success: false,
                error: "Sub-view is required",
                subView: null
            });
            return;
        }

        const subView = inputData.subView.toLowerCase();
        if (!this.validSubViews.includes(subView)) {
            this.outputBoundary.present({
                success: false,
                error: `Invalid sub-view: ${inputData.subView}. Must be 'mc', 'vi', or 'split'`,
                subView: null
            });
            return;
        }

        this.outputBoundary.present({
            success: true,
            error: null,
            subView: subView
        });
    }
}
