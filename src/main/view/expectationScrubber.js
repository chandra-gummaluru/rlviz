// Shifting timeline scrubber for the MC/Values views: a horizontal tick row (t = 0..maxT) that
// slides under a fixed center playhead, dragged via pointer capture and snapping to an integer t
// on release. Reward-event dots render for whichever rollout is passed to
// setRolloutForRewardDots() (the focused run in detail view; none in the grid view).
class ExpectationScrubber {
    static STEP_PX = 56;
    static HEIGHT_PX = 50;

    constructor(expectationState, onScrub) {
        this.state = expectationState;
        this.onScrub = onScrub; // (t, isFinal) => void

        this.container = null;
        this.trackEl = null;
        this.tickRowEl = null;
        this.chipEl = null;

        this._rollout = null;
        this._width = 0;
        this._dragging = false;
        this._dragStartX = 0;
        this._dragStartT = 0;
        this._rafHandle = null;

        this._boundMove = this._onPointerMove.bind(this);
        this._boundUp = this._onPointerUp.bind(this);
    }

    mount(x, y, w) {
        this.destroy();

        const container = document.createElement('div');
        container.className = 'expectation-scrubber2';
        container.style.left = x + 'px';
        container.style.top = y + 'px';
        container.style.width = w + 'px';
        container.style.height = ExpectationScrubber.HEIGHT_PX + 'px';

        const track = document.createElement('div');
        track.className = 'scrubber2-track';
        container.appendChild(track);

        const tickRow = document.createElement('div');
        tickRow.className = 'scrubber2-ticks';
        track.appendChild(tickRow);

        const playhead = document.createElement('div');
        playhead.className = 'scrubber2-playhead';
        track.appendChild(playhead);

        const fadeLeft = document.createElement('div');
        fadeLeft.className = 'scrubber2-fade scrubber2-fade--left';
        track.appendChild(fadeLeft);

        const fadeRight = document.createElement('div');
        fadeRight.className = 'scrubber2-fade scrubber2-fade--right';
        track.appendChild(fadeRight);

        const chip = document.createElement('div');
        chip.className = 'scrubber2-chip';
        container.appendChild(chip);

        track.addEventListener('pointerdown', (e) => this._onPointerDown(e));

        document.body.appendChild(container);

        this.container = container;
        this.trackEl = track;
        this.tickRowEl = tickRow;
        this.chipEl = chip;
        this._width = w;

        this._rebuildTicks();
        this.updatePosition(this.state.currentT);
    }

    setRolloutForRewardDots(rollout) {
        this._rollout = rollout || null;
        this._rebuildTicks();
        this.updatePosition(this.state.currentT);
    }

    // Re-reads state.maxT (e.g. after new rollouts changed the horizon) without changing which
    // rollout's reward dots are shown.
    rebuildForNewMaxT() {
        this._rebuildTicks();
    }

    resize(x, y, w) {
        if (!this.container) return;
        this.container.style.left = x + 'px';
        this.container.style.top = y + 'px';
        this.container.style.width = w + 'px';
        this._width = w;
        this.updatePosition(this.state.currentT);
    }

    updatePosition(t) {
        if (!this.tickRowEl) return;
        const centerX = this._width / 2;
        const offset = centerX - t * ExpectationScrubber.STEP_PX;
        this.tickRowEl.style.transform = `translateX(${offset}px)`;
        if (this.chipEl) this.chipEl.textContent = `t = ${Math.round(t)}`;
    }

    _rebuildTicks() {
        if (!this.tickRowEl) return;
        this.tickRowEl.innerHTML = '';
        const maxT = this.state.maxT || 0;
        const rewards = this._rollout && this._rollout.rewards ? this._rollout.rewards : null;

        for (let t = 0; t <= maxT; t++) {
            const tick = document.createElement('div');
            tick.className = 'scrubber2-tick';
            tick.style.left = (t * ExpectationScrubber.STEP_PX) + 'px';

            const reward = rewards && t > 0 ? rewards[t - 1] : 0;
            if (reward) {
                const dot = document.createElement('span');
                dot.className = 'scrubber2-reward-dot ' + (reward > 0 ? 'scrubber2-reward-dot--pos' : 'scrubber2-reward-dot--neg');
                tick.appendChild(dot);
            }

            const mark = document.createElement('span');
            mark.className = 'scrubber2-tick-mark';
            tick.appendChild(mark);

            const label = document.createElement('span');
            label.className = 'scrubber2-tick-label';
            label.textContent = String(t);
            tick.appendChild(label);

            this.tickRowEl.appendChild(tick);
        }
    }

    _onPointerDown(e) {
        this._dragging = true;
        this._dragStartX = e.clientX;
        this._dragStartT = this.state.currentT;
        this.trackEl.setPointerCapture(e.pointerId);
        this.trackEl.addEventListener('pointermove', this._boundMove);
        this.trackEl.addEventListener('pointerup', this._boundUp);
        this.trackEl.addEventListener('pointercancel', this._boundUp);
    }

    _onPointerMove(e) {
        if (!this._dragging) return;
        const t = this._clampedTFromEvent(e);
        cancelAnimationFrame(this._rafHandle);
        this._rafHandle = requestAnimationFrame(() => {
            this.updatePosition(t);
            if (this.onScrub) this.onScrub(t, false);
        });
    }

    _onPointerUp(e) {
        if (!this._dragging) return;
        this._dragging = false;
        this.trackEl.removeEventListener('pointermove', this._boundMove);
        this.trackEl.removeEventListener('pointerup', this._boundUp);
        this.trackEl.removeEventListener('pointercancel', this._boundUp);

        const raw = this._clampedTFromEvent(e);
        const snapped = Math.max(0, Math.min(this.state.maxT || 0, Math.round(raw)));

        cancelAnimationFrame(this._rafHandle);
        this.updatePosition(snapped);
        if (this.onScrub) this.onScrub(snapped, true);
    }

    _clampedTFromEvent(e) {
        const dx = e.clientX - this._dragStartX;
        const raw = this._dragStartT - dx / ExpectationScrubber.STEP_PX;
        return Math.max(0, Math.min(this.state.maxT || 0, raw));
    }

    destroy() {
        if (this.container) this.container.remove();
        cancelAnimationFrame(this._rafHandle);
        this.container = null;
        this.trackEl = null;
        this.tickRowEl = null;
        this.chipEl = null;
    }
}
