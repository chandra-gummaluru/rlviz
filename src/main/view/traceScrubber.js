// Unified bottom-center scrubber + steps-horizon control, shared by Build, Policy, and Monte
// Carlo (Value Iteration keeps its own separate sweep-stepping UI, untouched). Deliberately dumb
// and callback-driven - unlike the ExpectationScrubber it replaces, this component knows nothing
// about SimulationState or ExpectationState directly. Each consumer (mainView.js for Build/
// Policy, expectationView.js for Monte Carlo) feeds it tick labels/position via setTicks()/
// setPosition() and reacts to its callbacks by mutating its own domain state - mirroring the
// callback pattern already used by TreeViewPill/EstimatorPill in this codebase.
class TraceScrubber {
    static TICK_PX = 44;
    static MIN_MAX_STEPS = 1;
    static MAX_MAX_STEPS = 100;

    constructor(callbacks = {}) {
        this.callbacks = callbacks;

        this.containerEl = null;
        this.trackEl = null;
        this.ticksEl = null;
        this.leftArrowEl = null;
        this.rightArrowEl = null;
        this.horizonValueEl = null;

        this._ticks = [];
        this._currentIndex = 0;
        this._maxSteps = 25;
        this._width = 0;

        this._dragging = false;
        this._dragStartX = 0;
        this._dragStartIndex = 0;
        this._rafHandle = null;

        this._boundMove = this._onPointerMove.bind(this);
        this._boundUp = this._onPointerUp.bind(this);
    }

    mount(x, y, w) {
        this.destroy();
        this._x = x || 0;
        this._width = w;

        const container = document.createElement('div');
        container.className = 'trace-scrubber';
        document.body.appendChild(container);
        this.containerEl = container;
        this._applyBounds();

        const leftArrow = document.createElement('button');
        leftArrow.type = 'button';
        leftArrow.className = 'trace-scrubber-arrow';
        leftArrow.textContent = '‹';
        leftArrow.addEventListener('mousedown', e => e.stopPropagation());
        leftArrow.addEventListener('click', e => {
            e.stopPropagation();
            this._scrubTo(this._currentIndex - 1, true);
        });
        container.appendChild(leftArrow);
        this.leftArrowEl = leftArrow;

        const track = document.createElement('div');
        track.className = 'trace-scrubber-track';
        container.appendChild(track);
        this.trackEl = track;

        const ticks = document.createElement('div');
        ticks.className = 'trace-scrubber-ticks';
        track.appendChild(ticks);
        this.ticksEl = ticks;

        const fadeLeft = document.createElement('div');
        fadeLeft.className = 'trace-scrubber-fade trace-scrubber-fade--left';
        track.appendChild(fadeLeft);

        const fadeRight = document.createElement('div');
        fadeRight.className = 'trace-scrubber-fade trace-scrubber-fade--right';
        track.appendChild(fadeRight);

        track.addEventListener('pointerdown', e => this._onPointerDown(e));

        const rightArrow = document.createElement('button');
        rightArrow.type = 'button';
        rightArrow.className = 'trace-scrubber-arrow';
        rightArrow.textContent = '›';
        rightArrow.addEventListener('mousedown', e => e.stopPropagation());
        rightArrow.addEventListener('click', e => {
            e.stopPropagation();
            this._scrubTo(this._currentIndex + 1, true);
        });
        container.appendChild(rightArrow);
        this.rightArrowEl = rightArrow;

        const divider = document.createElement('div');
        divider.className = 'trace-scrubber-divider';
        container.appendChild(divider);

        const horizon = document.createElement('div');
        horizon.className = 'trace-scrubber-horizon';
        container.appendChild(horizon);

        const minusBtn = document.createElement('button');
        minusBtn.type = 'button';
        minusBtn.className = 'trace-scrubber-horizon-btn';
        minusBtn.textContent = '−';
        minusBtn.addEventListener('mousedown', e => e.stopPropagation());
        minusBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._adjustMaxSteps(-1);
        });
        horizon.appendChild(minusBtn);

        const icon = document.createElement('span');
        icon.textContent = '⏱';
        horizon.appendChild(icon);

        const value = document.createElement('span');
        value.className = 'trace-scrubber-horizon-value';
        horizon.appendChild(value);
        this.horizonValueEl = value;

        const plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'trace-scrubber-horizon-btn';
        plusBtn.textContent = '+';
        plusBtn.addEventListener('mousedown', e => e.stopPropagation());
        plusBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._adjustMaxSteps(1);
        });
        horizon.appendChild(plusBtn);

        this._renderTicks();
        this._updateHorizonLabel();
    }

    resize(x, y, w) {
        this._x = x || 0;
        this._width = w;
        this._applyBounds();
    }

    // Centers the container within [x, x+w] (the canvas region, e.g. windowWidth -
    // RIGHT_PANEL_WIDTH) rather than the full viewport - the CSS class only supplies bottom/
    // display defaults, horizontal centering is computed here since the caller-supplied bounds
    // narrow once the right panel is open.
    _applyBounds() {
        if (!this.containerEl) return;
        const centerX = this._x + this._width / 2;
        this.containerEl.style.left = centerX + 'px';
        this.containerEl.style.transform = 'translateX(-50%)';
    }

    setTicks(labels) {
        this._ticks = labels || [];
        this._currentIndex = Math.max(0, Math.min(this._ticks.length - 1, this._currentIndex));
        this._renderTicks();
    }

    setPosition(index) {
        this._currentIndex = Math.max(0, Math.min(this._ticks.length - 1, index));
        this._applyPosition();
    }

    setMaxSteps(value) {
        this._maxSteps = value;
        this._updateHorizonLabel();
    }

    show() {
        if (this.containerEl) this.containerEl.style.display = '';
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }

    destroy() {
        if (this.containerEl) this.containerEl.remove();
        cancelAnimationFrame(this._rafHandle);
        this.containerEl = null;
        this.trackEl = null;
        this.ticksEl = null;
    }

    _renderTicks() {
        if (!this.ticksEl) return;
        this.ticksEl.innerHTML = '';
        this._ticks.forEach((label, i) => {
            const tick = document.createElement('div');
            tick.className = 'trace-scrubber-tick';
            tick.style.left = (i * TraceScrubber.TICK_PX) + 'px';
            tick.textContent = label;
            this.ticksEl.appendChild(tick);
        });
        this._applyPosition();
    }

    _applyPosition() {
        if (!this.ticksEl || !this.trackEl) return;
        const trackWidth = this.trackEl.clientWidth || 320;
        const centerX = trackWidth / 2;
        const offset = centerX - this._currentIndex * TraceScrubber.TICK_PX;
        this.ticksEl.style.transform = `translateX(${offset}px)`;

        Array.from(this.ticksEl.children).forEach((el, i) => {
            el.classList.toggle('trace-scrubber-tick--active', i === this._currentIndex);
        });

        if (this.leftArrowEl) this.leftArrowEl.disabled = this._currentIndex <= 0;
        if (this.rightArrowEl) this.rightArrowEl.disabled = this._currentIndex >= this._ticks.length - 1;
    }

    _scrubTo(index, isFinal) {
        const clamped = Math.max(0, Math.min(this._ticks.length - 1, index));
        if (clamped === this._currentIndex && isFinal) return;
        this._currentIndex = clamped;
        this._applyPosition();
        if (this.callbacks.onScrub) this.callbacks.onScrub(clamped, isFinal);
    }

    _adjustMaxSteps(delta) {
        const next = Math.max(TraceScrubber.MIN_MAX_STEPS, Math.min(TraceScrubber.MAX_MAX_STEPS, this._maxSteps + delta));
        if (next === this._maxSteps) return;
        this._maxSteps = next;
        this._updateHorizonLabel();
        if (this.callbacks.onMaxStepsChange) this.callbacks.onMaxStepsChange(next);
    }

    _updateHorizonLabel() {
        if (this.horizonValueEl) this.horizonValueEl.textContent = `steps=${this._maxSteps}`;
    }

    _onPointerDown(e) {
        this._dragging = true;
        this._dragStartX = e.clientX;
        this._dragStartIndex = this._currentIndex;
        this.trackEl.setPointerCapture(e.pointerId);
        this.trackEl.addEventListener('pointermove', this._boundMove);
        this.trackEl.addEventListener('pointerup', this._boundUp);
        this.trackEl.addEventListener('pointercancel', this._boundUp);
    }

    _onPointerMove(e) {
        if (!this._dragging) return;
        const raw = this._rawIndexFromEvent(e);
        cancelAnimationFrame(this._rafHandle);
        this._rafHandle = requestAnimationFrame(() => this._scrubTo(Math.round(raw), false));
    }

    _onPointerUp(e) {
        if (!this._dragging) return;
        this._dragging = false;
        this.trackEl.removeEventListener('pointermove', this._boundMove);
        this.trackEl.removeEventListener('pointerup', this._boundUp);
        this.trackEl.removeEventListener('pointercancel', this._boundUp);

        const raw = this._rawIndexFromEvent(e);
        cancelAnimationFrame(this._rafHandle);
        this._scrubTo(Math.round(raw), true);
    }

    _rawIndexFromEvent(e) {
        const dx = e.clientX - this._dragStartX;
        const raw = this._dragStartIndex - dx / TraceScrubber.TICK_PX;
        return Math.max(0, Math.min(this._ticks.length - 1, raw));
    }
}
