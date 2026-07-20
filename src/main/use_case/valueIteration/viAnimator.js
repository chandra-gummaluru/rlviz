// Animation orchestrator for synchronous-sweep Value Iteration.
//
// Each sweep is one "beat": compute the next sweep, notify the presenter (which updates the live
// heat-map / policy edges / sweep chip and triggers a pulse in the view), then pause briefly. The
// domain computation itself is always whole-sweep, synchronous, and atomic - computeNextSweep()
// solves every state in one call. What's per-state is purely the VISUAL reveal pacing, owned
// entirely by ViStatesView (its own live-section cursor, not this class) - this animator only
// ever asks it to "catch up on whatever's left" via awaitReveal(), never drives individual states
// itself. Step/Skip, in the one quadrant with a real per-state reveal (known:full), bypass this
// class's sweep-level methods entirely via revealNextState()/skipCurrentState() below; Play/"Find
// Optimal" (continuousPlay()) and the other 3 quadrants' Step/Skip still go through
// animateOneSweep()/stepOneSweep() exactly as before.
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
        // Lets the caller (main.js, wired to ViStatesView.waitForActiveReveal()) tell this
        // animator when a sweep's on-screen reveal has actually finished, so continuous Play can
        // wait for it instead of racing a fixed timer against it. Defaults to an instant no-op so
        // this file stays agnostic of any specific view.
        this.awaitReveal = options.awaitReveal || (() => Promise.resolve());
        // Lets stepOneSweep() (Step/Skip) tell whether a reveal - from ANY of Play/Step/Skip's
        // own animator instance, since ViStatesView tracks a single shared _activeReveal - is
        // still actively playing out, so a re-entrant click doesn't stomp on it (see
        // stepOneSweep()'s own comment for why that mattered).
        this.isRevealActive = options.isRevealActive || (() => false);
        // Thin passthroughs to ViStatesView.revealNextState()/skipCurrentState() (Step/Skip, in
        // the known:full quadrant only - both return false for the other 3 quadrants, telling the
        // interactor to fall through to this class's own sweep-level stepOneSweep() instead).
        // Kept as injected callbacks, same pattern as awaitReveal/isRevealActive above, so this
        // class stays agnostic of any specific view.
        this._revealNextStateOpt = options.revealNextState || (() => false);
        this._skipCurrentStateOpt = options.skipCurrentState || (() => false);
        // Bumped once per continuousPlay() call so a stale, superseded loop (e.g. Play -> Pause ->
        // Play in quick succession, the second call starting while the first is still suspended
        // mid-await) reliably stops instead of running concurrently with the newer one.
        this._playGeneration = 0;
        // True for the entire lifetime of a continuousPlay() call, including while it's suspended
        // (e.g. mid-await inside animateOneSweep()'s awaitReveal(), which is exactly where a
        // paused reveal leaves it parked). VIPlayInteractor checks this before starting a new
        // loop, so a Play click that's really "resume a paused reveal" doesn't kick off a SECOND
        // loop that would independently compute another sweep out from under the paused one.
        this._loopRunning = false;
    }

    isLoopRunning() {
        return this._loopRunning;
    }

    /** Step. See ViStatesView.revealNextState() for the real logic (known:full only). */
    revealNextState() {
        return this._revealNextStateOpt();
    }

    /** Skip. See ViStatesView.skipCurrentState() for the real logic (known:full only). */
    skipCurrentState() {
        return this._skipCurrentStateOpt();
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
    }

    /**
     * Compute + present exactly one sweep, then wait for its reveal and let the beat pulse play.
     * Calls awaitReveal() TWICE - once BEFORE computing the new sweep (catches up on whatever the
     * CURRENTLY live section still owes, e.g. a sweep the user was partway through manually
     * Step/Skip-ing when Play/"Find Optimal" was clicked - see ViStatesView.
     * playRemainingLiveSweep()) and once after (auto-plays the newly-computed sweep from scratch).
     * This is what keeps "Find Optimal" animating sweep-by-sweep, uninterrupted, regardless of how
     * much manual progress already existed on the current sweep.
     */
    async animateOneSweep(durationMs = this.getBeatMs()) {
        await this.awaitReveal();
        this.viState.computeNextSweep(this.graph);
        this.outputBoundary.presentSweepComplete(this.viState.currentSweepIndex);
        await this.awaitReveal();
        await this._sleep(durationMs);
    }

    /** Continuous playback: auto-stops at the T cap OR at convergence. */
    async continuousPlay() {
        const myGeneration = ++this._playGeneration;
        this._loopRunning = true;
        try {
            while (
                this.viState.isPlaying && myGeneration === this._playGeneration
                && this.viState.canAdvance() && !this.viState.converged
            ) {
                await this.animateOneSweep();
                if (!this.viState.isPlaying || myGeneration !== this._playGeneration) break;
                await this._sleep(this.getPauseMs());
            }
            // A stale/superseded loop (myGeneration no longer current) quietly exits here without
            // touching isPlaying or presenting completion - the newer loop that superseded it owns
            // both of those, and calling them here too would stomp on it mid-run.
            if (myGeneration !== this._playGeneration) return;
            this.viState.isPlaying = false;
            this.outputBoundary.presentComplete();
        } finally {
            // Only the CURRENT generation clears the flag - a stale/superseded call's own finally
            // must not stomp on the newer loop's _loopRunning = true.
            if (myGeneration === this._playGeneration) this._loopRunning = false;
        }
    }

    /**
     * Advance exactly one sweep (Step). Only reached for the 3 non-diagram quadrants -
     * VIStepInteractor/VISkipInteractor call revealNextState()/skipCurrentState() FIRST and only
     * fall through to this method when those report "not my quadrant" (false). NOT blocked by
     * convergence - only by the T cap. With durationMs = 0 this is the instant "Skip" variant.
     *
     * Ignores the call outright while a reveal is still ACTIVELY PLAYING (whether from a PREVIOUS
     * Step/Skip click on this same animator, or from Play's own animator) - without this guard, a
     * re-entrant click's computeNextSweep()/presentSweepComplete() forces
     * ViStatesView._prepareLiveSection() to supersede the in-flight reveal (see its own "Only one
     * sweep's cards ever animate at a time" comment), snapping it straight to fully-resolved
     * instead of letting it actually play out. A user stepping through sweeps at a normal clicking
     * pace would otherwise never see the animation at all - each click would cut the previous one
     * short.
     * Deliberately a silent no-op (not queued) - the same click just needs to be issued again once
     * the current reveal finishes, exactly like Play's own isLoopRunning() guard on repeated Play
     * clicks.
     *
     * Does NOT ignore the call when the reveal is merely PAUSED (ViStatesView.hasActiveReveal()
     * is false in that case, on purpose) - a paused reveal has already been shown to the user (they
     * chose to pause it), so Step must stay free to instantly supersede it and animate the next
     * sweep; otherwise, since a paused reveal never resolves on its own, Step/Skip would be stuck
     * doing nothing forever the moment anything was paused.
     */
    async stepOneSweep(durationMs = this.getBeatMs()) {
        if (this.isRevealActive()) return;
        if (!this.viState.canAdvance()) {
            this.outputBoundary.presentComplete();
            return;
        }
        await this.animateOneSweep(durationMs);
        this.outputBoundary.presentComplete();
    }
}
