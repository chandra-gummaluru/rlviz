// ViewModel for Value Iteration visualization.
//
// The unrolled-column layout state (columns / reveal cursors / synthetic positions) is gone -
// the view now draws the single live graph at real node positions, reading V/policy straight
// from ValueIterationState per sweep. What remains here is the backup-diagram explanation state
// (clicking a Q-table cell) plus the currently-focused state id.
class ValueIterationViewModel {
    constructor() {
        this.reset();
    }

    reset() {
        this.activeStateId = null;
        this.backupDetail = null;   // transient backup-diagram detail (explanation card)

        // Explanation state (a clicked Q-cell's step-through backup diagram)
        this.explanationDetail = null;
        this.explanationStepIndex = 0;
        this.explanationTweenKey = null;
    }

    /** Set the backup detail for the state being explained */
    setBackupDetail(detail) {
        this.backupDetail = detail;
    }

    /** Clear backup detail */
    clearBackupDetail() {
        this.backupDetail = null;
    }

    /** Set explanation detail for a clicked Q-cell; generates a new tween key so animations restart */
    setExplanationDetail(detail) {
        this.explanationDetail = detail;
        this.explanationStepIndex = detail?.stepIndex ?? 0;
        this.explanationTweenKey = detail
            ? `${detail.columnIndex}:${detail.stateId}:${detail.actionId}:${detail.subPhase}:${Date.now()}`
            : null;
    }

    /** Clear explanation detail */
    clearExplanationDetail() {
        this.explanationDetail = null;
        this.explanationStepIndex = 0;
        this.explanationTweenKey = null;
    }
}
