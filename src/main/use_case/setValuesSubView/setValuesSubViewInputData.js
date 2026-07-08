/**
 * Input data for SetValuesSubView use case
 * Plain data object containing request parameters
 */
class SetValuesSubViewInputData {
    /**
     * Create set values sub-view input data
     * @param {string} subView - The sub-view to set ('mc', 'vi', or 'split')
     */
    constructor(subView) {
        this.subView = subView;
    }
}
