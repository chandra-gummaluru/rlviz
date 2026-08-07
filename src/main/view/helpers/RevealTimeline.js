// src/main/view/helpers/RevealTimeline.js
// Shared async reveal-sequencing primitive for ViBackupDiagram's per-transition/per-action
// "Substitution" choreography (Values -> Iteration animation redesign, handoff 2). Ported from
// the prototype's `Timeline` class (vi-engine.js), adapted so pause()/resume() genuinely freeze
// elapsed progress (the prototype's own wait()/tween() compare wall-clock-since-start against a
// duration computed ONCE per call, which - unlike this port - silently skips the remainder of a
// wait/tween if resume() happens to land after that wall-clock window has already elapsed, even
// though most of it was spent paused; not acceptable here since viBackupDiagram.js's existing
// drawAnimated() already correctly freezes mid-move on pause, and this must not regress that).
//
// getSpeedScale is a LIVE callback (not snapshotted) re-read every animation frame, matching the
// app-wide convention (see viBackupDiagram.js's drawAnimated()) - a mid-reveal animation-speed
// slider change takes effect immediately, on whichever wait()/tween() call is currently in
// flight, without any explicit rebase step: `dur` is recomputed from the live speed scale every
// frame while `elapsed` accumulates only real, unscaled active milliseconds, so a speed change
// simply shifts the remaining target rather than needing a separate rebase calculation.
//
// One instance per in-flight reveal (a card's own drawAnimated() call) - never shared/reused
// across reveals, and carries no module-level mutable state, so N cards could in principle each
// own a live RevealTimeline concurrently (today's app-wide convention still only ever runs one
// reveal at a time - see ViStatesView's `_activeReveal` singleton - but nothing here assumes
// that).
class RevealTimeline {
    constructor(getSpeedScale = () => 1) {
        this.getSpeedScale = getSpeedScale;
        this.cancelled = false;
        this.paused = false;
        this._resumers = [];
    }

    cancel() {
        this.cancelled = true;
        this._resumers.splice(0).forEach(r => r());
    }

    pause() {
        this.paused = true;
    }

    resume() {
        if (!this.paused) return;
        this.paused = false;
        this._resumers.splice(0).forEach(r => r());
    }

    // requestAnimationFrame raced against a 50ms setTimeout fallback - mirrors the prototype's
    // own nextFrame() helper, so a backgrounded/unfocused tab (where rAF throttles hard) still
    // makes progress instead of a reveal silently freezing.
    _nextFrame() {
        return new Promise(resolve => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            requestAnimationFrame(finish);
            setTimeout(finish, 50);
        });
    }

    // Parks until resume()/cancel() wakes it - resolves immediately if not currently paused.
    _waitWhilePaused() {
        if (!this.paused) return Promise.resolve();
        return new Promise(resolve => this._resumers.push(resolve));
    }

    // Waits `ms` of ACTIVE (non-paused) time, scaled live by getSpeedScale(). Resolves early
    // (without waiting) once cancel() fires.
    async wait(ms) {
        let elapsed = 0;
        let last = performance.now();
        while (!this.cancelled) {
            if (this.paused) {
                await this._waitWhilePaused();
                if (this.cancelled) return;
                last = performance.now();
                continue;
            }
            await this._nextFrame();
            if (this.cancelled) return;
            const now = performance.now();
            elapsed += now - last;
            last = now;
            const dur = Math.max(0, ms) * this.getSpeedScale();
            if (elapsed >= dur) return;
        }
    }

    // Tweens over `ms` of ACTIVE time, calling onTick(easedT, rawT) every frame - easing applied
    // here (EasingUtils.easeInOut, the same easing viBackupDiagram.js's drawAnimated() already
    // uses) so callers just consume a 0..1 progress value. Always fires a final onTick(1, 1) -
    // on cancel, so callers land in their fully-resolved visual state rather than mid-tween.
    async tween(ms, onTick) {
        let elapsed = 0;
        let last = performance.now();
        while (!this.cancelled) {
            if (this.paused) {
                await this._waitWhilePaused();
                if (this.cancelled) { onTick(1, 1); return; }
                last = performance.now();
                continue;
            }
            await this._nextFrame();
            if (this.cancelled) { onTick(1, 1); return; }
            const now = performance.now();
            elapsed += now - last;
            last = now;
            const dur = Math.max(1, ms) * this.getSpeedScale();
            const rawT = Math.min(1, elapsed / dur);
            onTick(EasingUtils.easeInOut(rawT), rawT);
            if (rawT >= 1) return;
        }
        onTick(1, 1);
    }
}
