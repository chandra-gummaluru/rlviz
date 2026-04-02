// Animation orchestrator for Value Iteration visualization
// Only depends on domain (viState) and output boundary — no ViewModel references
class VIAnimator {
    constructor(viState, outputBoundary) {
        this.viState = viState;
        this.outputBoundary = outputBoundary;

        this.TIMING = {
            COLUMN_SLIDE: 400,
            STATE_HIGHLIGHT: 300,
            VALUE_REVEAL: 500,
            COLUMN_PAUSE: 300,
            INIT_STATE_DELAY: 250
        };
    }

    async animateInitialization() {
        this.outputBoundary.presentInitialized();
        await this.animateColumn(0);
    }

    async animateColumn(columnIndex) {
        this.outputBoundary.presentColumnStart(columnIndex);

        for (let si = 0; si < this.viState.stateCount; si++) {
            if (!this.viState.isPlaying && this.viState.phase !== 'stepping') break;

            const stateId = this.viState.stateIds[si];
            this.viState.currentColumnIndex = columnIndex;
            this.viState.currentStateIndex = si;

            this.outputBoundary.presentStateBackupStart(columnIndex, stateId);

            this.viState.setPhase('computing', this.TIMING.STATE_HIGHLIGHT);
            this.outputBoundary.presentPhaseChange('computing', this.TIMING.STATE_HIGHLIGHT);
            await this.waitForPhase();
            if (!this.viState.isPlaying && this.viState.phase !== 'stepping') break;

            this.viState.setPhase('revealing_value', this.TIMING.VALUE_REVEAL);
            this.outputBoundary.presentStateBackupComplete(columnIndex, stateId);
            await this.waitForPhase();
            if (!this.viState.isPlaying && this.viState.phase !== 'stepping') break;
        }

        this.viState.currentStateIndex = this.viState.stateCount;
        this.viState.setPhase('idle', 0);
        this.outputBoundary.presentColumnComplete(columnIndex);

        if (this.viState.isPlaying) {
            this.viState.setPhase('pause', this.TIMING.COLUMN_PAUSE);
            this.outputBoundary.presentPhaseChange('pause', this.TIMING.COLUMN_PAUSE);
            await this.waitForPhase();
        }
    }

    async animateOneState() {
        const colIdx = this.viState.currentColumnIndex;
        const stateIdx = this.viState.currentStateIndex;

        if (colIdx >= this.viState.totalColumns) return;
        if (stateIdx >= this.viState.stateCount) return;

        const stateId = this.viState.stateIds[stateIdx];

        if (stateIdx === 0) {
            this.outputBoundary.presentColumnStart(colIdx);
        }

        this.outputBoundary.presentStateBackupStart(colIdx, stateId);

        this.viState.setPhase('computing', this.TIMING.STATE_HIGHLIGHT);
        this.outputBoundary.presentPhaseChange('computing', this.TIMING.STATE_HIGHLIGHT);
        await this.waitForPhase();

        this.viState.setPhase('revealing_value', this.TIMING.VALUE_REVEAL);
        this.outputBoundary.presentStateBackupComplete(colIdx, stateId);
        await this.waitForPhase();

        // Advance cursor
        this.viState.currentStateIndex++;
        if (this.viState.currentStateIndex >= this.viState.stateCount) {
            this.outputBoundary.presentColumnComplete(colIdx);
            this.viState.currentStateIndex = 0;
            this.viState.currentColumnIndex++;
        }

        this.viState.setPhase('idle', 0);
    }

    async continuousPlay() {
        while (this.viState.isPlaying && this.viState.canAdvance()) {
            const colIdx = this.viState.currentColumnIndex;
            const stateIdx = this.viState.currentStateIndex;

            if (stateIdx === 0) {
                await this.animateColumn(colIdx);
            } else {
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
        for (let si = startStateIdx; si < this.viState.stateCount; si++) {
            if (!this.viState.isPlaying) break;

            const stateId = this.viState.stateIds[si];
            this.viState.currentStateIndex = si;

            this.outputBoundary.presentStateBackupStart(columnIndex, stateId);

            this.viState.setPhase('computing', this.TIMING.STATE_HIGHLIGHT);
            this.outputBoundary.presentPhaseChange('computing', this.TIMING.STATE_HIGHLIGHT);
            await this.waitForPhase();
            if (!this.viState.isPlaying) break;

            this.viState.setPhase('revealing_value', this.TIMING.VALUE_REVEAL);
            this.outputBoundary.presentStateBackupComplete(columnIndex, stateId);
            await this.waitForPhase();
            if (!this.viState.isPlaying) break;
        }

        if (this.viState.isPlaying) {
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
