/**
 * Input data for SetMode use case
 * Plain data object containing request parameters
 */
class SetModeInputData {
    /**
     * Create set mode input data
     * @param {string} mode - The mode to set ('editor' or 'simulate')
     */
    constructor(mode) {
        this.mode = mode;
    }
}
