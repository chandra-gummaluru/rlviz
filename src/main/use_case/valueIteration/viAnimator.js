// Animation orchestrator for Value Iteration visualization
class VIAnimator {
    constructor(viState, viViewModel, outputBoundary) {
        this.viState = viState;
        this.viViewModel = viViewModel;
        this.outputBoundary = outputBoundary;

        this.TIMING = {
            COLUMN_SLIDE: 400,
            STATE_HIGHLIGHT: 300,
            VALUE_REVEAL: 500,
            COLUMN_PAUSE: 300,
            INIT_STATE_DELAY: 250
        };
    }

    /**
     * Animate the terminal column initialization (all V=0).
     */
    async animateInitialization() {
        this.outputBoundary.presentInitialized();

        // Animate terminal column (index 0) — reveal each state's V=0 one at a time
        await this.animateColumn(0);
    }

    /**
     * Animate a single column: reveal each state's value top-to-bottom.
     */
    async animateColumn(columnIndex) {
        // Make this column visible (shifts existing columns right, adds new one on left)
        if (this.viViewModel.visibleColumnCount <= columnIndex) {
            this.viViewModel.showNextColumn();
        }

        this.viViewModel.activeColumnIndex = columnIndex;
        this.outputBoundary.presentColumnStart(columnIndex);

        for (let si = 0; si < this.viState.stateCount; si++) {
            if (!this.viState.isPlaying && this.viState.phase !== 'stepping') break;

            const stateId = this.viState.stateIds[si];
            this.viViewModel.activeStateId = stateId;
            this.viState.currentColumnIndex = columnIndex;
            this.viState.currentStateIndex = si;

            this.outputBoundary.presentStateBackupStart(columnIndex, stateId);

            // Highlight phase
            this.viState.setPhase('computing', this.TIMING.STATE_HIGHLIGHT);
            this.outputBoundary.presentPhaseChange('computing', this.TIMING.STATE_HIGHLIGHT);
            await this.waitForPhase();
            if (!this.viState.isPlaying && this.viState.phase !== 'stepping') break;

            // Reveal value
            this.viViewModel.revealValue(columnIndex, stateId);
            this.viState.setPhase('revealing_value', this.TIMING.VALUE_REVEAL);
            this.outputBoundary.presentPhaseChange('revealing_value', this.TIMING.VALUE_REVEAL);
            await this.waitForPhase();
            if (!this.viState.isPlaying && this.viState.phase !== 'stepping') break;

            this.outputBoundary.presentStateBackupComplete(columnIndex, stateId);
        }

        // Mark column complete
        this.viViewModel.revealColumn(columnIndex);
        this.viState.currentStateIndex = this.viState.stateCount;
        this.viState.setPhase('idle', 0);
        this.outputBoundary.presentColumnComplete(columnIndex);

        // Pause between columns
        if (this.viState.isPlaying) {
            this.viState.setPhase('pause', this.TIMING.COLUMN_PAUSE);
            this.outputBoundary.presentPhaseChange('pause', this.TIMING.COLUMN_PAUSE);
            await this.waitForPhase();
        }
    }

    /**
     * Animate a single state backup (used by Step).
     */
    async animateOneState() {
        const colIdx = this.viState.currentColumnIndex;
        const stateIdx = this.viState.currentStateIndex;

        if (colIdx >= this.viState.totalColumns) return;
        if (stateIdx >= this.viState.stateCount) return;

        const stateId = this.viState.stateIds[stateIdx];
        this.viViewModel.activeColumnIndex = colIdx;
        this.viViewModel.activeStateId = stateId;

        if (stateIdx === 0) {
            // Make this column visible
            if (this.viViewModel.visibleColumnCount <= colIdx) {
                this.viViewModel.showNextColumn();
            }
            this.outputBoundary.presentColumnStart(colIdx);
        }

        this.outputBoundary.presentStateBackupStart(colIdx, stateId);

        // Highlight phase
        this.viState.setPhase('computing', this.TIMING.STATE_HIGHLIGHT);
        this.outputBoundary.presentPhaseChange('computing', this.TIMING.STATE_HIGHLIGHT);
        await this.waitForPhase();

        // Reveal value
        this.viViewModel.revealValue(colIdx, stateId);
        this.viState.setPhase('revealing_value', this.TIMING.VALUE_REVEAL);
        this.outputBoundary.presentPhaseChange('revealing_value', this.TIMING.VALUE_REVEAL);
        await this.waitForPhase();

        this.outputBoundary.presentStateBackupComplete(colIdx, stateId);

        // Advance cursor
        this.viState.currentStateIndex++;
        if (this.viState.currentStateIndex >= this.viState.stateCount) {
            this.viViewModel.revealColumn(colIdx);
            this.outputBoundary.presentColumnComplete(colIdx);
            this.viState.currentStateIndex = 0;
            this.viState.currentColumnIndex++;
        }

        this.viState.setPhase('idle', 0);
    }

    /**
     * Run continuous playback through all remaining columns/states.
     */
    async continuousPlay() {
        while (this.viState.isPlaying && this.viState.canAdvance()) {
            const colIdx = this.viState.currentColumnIndex;
            const stateIdx = this.viState.currentStateIndex;

            // If starting a new column
            if (stateIdx === 0) {
                await this.animateColumn(colIdx);
            } else {
                // Mid-column resume: animate remaining states
                await this._animateRemainingStates(colIdx, stateIdx);
            }

            if (!this.viState.isPlaying) break;
        }

        if (this.viState.isPlaying && !this.viState.canAdvance()) {
            this.viState.isPlaying = false;
            this.outputBoundary.presentComplete();
        }
    }

    async _animateRemainingStates(columnIndex, startStateIdx) {
        this.viViewModel.activeColumnIndex = columnIndex;

        for (let si = startStateIdx; si < this.viState.stateCount; si++) {
            if (!this.viState.isPlaying) break;

            const stateId = this.viState.stateIds[si];
            this.viViewModel.activeStateId = stateId;
            this.viState.currentStateIndex = si;

            this.outputBoundary.presentStateBackupStart(columnIndex, stateId);

            this.viState.setPhase('computing', this.TIMING.STATE_HIGHLIGHT);
            this.outputBoundary.presentPhaseChange('computing', this.TIMING.STATE_HIGHLIGHT);
            await this.waitForPhase();
            if (!this.viState.isPlaying) break;

            this.viViewModel.revealValue(columnIndex, stateId);
            this.viState.setPhase('revealing_value', this.TIMING.VALUE_REVEAL);
            this.outputBoundary.presentPhaseChange('revealing_value', this.TIMING.VALUE_REVEAL);
            await this.waitForPhase();
            if (!this.viState.isPlaying) break;

            this.outputBoundary.presentStateBackupComplete(columnIndex, stateId);
        }

        if (this.viState.isPlaying) {
            this.viViewModel.revealColumn(columnIndex);
            this.viState.currentStateIndex = 0;
            this.viState.currentColumnIndex++;
            this.outputBoundary.presentColumnComplete(columnIndex);

            this.viState.setPhase('pause', this.TIMING.COLUMN_PAUSE);
            this.outputBoundary.presentPhaseChange('pause', this.TIMING.COLUMN_PAUSE);
            await this.waitForPhase();
        }
    }

    waitForPhase() {
        return new Promise(resolve => {
            const checkComplete = () => {
                if (this.viState.isPhaseComplete() || (!this.viState.isPlaying && this.viState.phase !== 'stepping')) {
                    resolve();
                } else {
                    setTimeout(checkComplete, 50);
                }
            };
            checkComplete();
        });
    }
}
