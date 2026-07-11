// Animation orchestrator for synchronous-sweep Value Iteration.
//
// Each sweep is one "beat": compute the next sweep, notify the presenter (which updates the live
// heat-map / policy edges / sweep chip and triggers a pulse in the view), then pause briefly.
// This replaced the old per-state sub-phase reveal engine - the whole graph updates together per
// sweep, so there is no per-state cursor or SUB_PHASES machinery anymore.
class VIAnimator {
    constructor(viState, outputBoundary, graph, options = {}) {
        this.viState = viState;
        this.outputBoundary = outputBoundary;
        this.graph = graph;
        // Between-sweep pause AND the beat's own pulse duration are both wired to the
        // animation-speed slider in main.js. Fall back to sensible defaults so the animator
        // works even if no getter is supplied.
        this.getPauseMs = options.getPauseMs || (() => 400);
        this.getBeatMs = options.getBeatMs || (() => 300);
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
    }

    /** Compute + present exactly one sweep, then let the beat pulse play (durationMs). */
    async animateOneSweep(durationMs = this.getBeatMs()) {
        this.viState.computeNextSweep(this.graph);
        this.outputBoundary.presentSweepComplete(this.viState.currentSweepIndex);
        await this._sleep(durationMs);
    }

    /** Continuous playback: auto-stops at the T cap OR at convergence. */
    async continuousPlay() {
        while (this.viState.isPlaying && this.viState.canAdvance() && !this.viState.converged) {
            await this.animateOneSweep();
            if (!this.viState.isPlaying) break;
            await this._sleep(this.getPauseMs());
        }
        this.viState.isPlaying = false;
        this.outputBoundary.presentComplete();
    }

    /**
     * Advance exactly one sweep (Step). NOT blocked by convergence - only by the T cap. With
     * durationMs = 0 this is the instant "Skip" variant.
     */
    async stepOneSweep(durationMs = this.getBeatMs()) {
        if (!this.viState.canAdvance()) {
            this.outputBoundary.presentComplete();
            return;
        }
        await this.animateOneSweep(durationMs);
        this.outputBoundary.presentComplete();
    }
}
