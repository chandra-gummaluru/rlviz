// Full-canvas "in development" overlay for Values -> Iteration while Observability = Partial.
// The two partial-observability quadrants (Belief Iteration / PO Q-Learning) are deprecated and
// no longer reachable; this card is what the user sees instead, with a one-click way back to
// full observability. DOM-based, reusing goalCard.js's .goal-card-overlay/.goal-card shell (same
// convention as findOptimalCard.js). Visibility is derived from the viewmodel in refresh():
// mode === 'values' && valuesSubView === 'vi' && observability === 'partial'.
class InDevelopmentCard {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;
        this.overlayEl = null;
    }

    setup() {
        if (this.overlayEl) return;

        const overlay = document.createElement('div');
        overlay.className = 'goal-card-overlay in-dev-card-overlay';
        document.body.appendChild(overlay);
        this.overlayEl = overlay;

        const card = document.createElement('div');
        card.className = 'goal-card in-dev-card';
        overlay.appendChild(card);

        const eyebrow = document.createElement('div');
        eyebrow.className = 'goal-card-eyebrow';
        eyebrow.textContent = 'Partial observability';
        card.appendChild(eyebrow);

        const title = document.createElement('div');
        title.className = 'in-dev-card-title';
        title.textContent = "That's all, folks… for now!";
        card.appendChild(title);

        const body = document.createElement('div');
        body.className = 'in-dev-card-body';
        body.innerHTML = 'Belief-state methods (Belief Iteration, PO Q-Learning) are '
            + '<strong>in development</strong>. Value Iteration and Learning Iteration are fully '
            + 'available under full observability.';
        card.appendChild(body);

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'in-dev-card-back';
        backBtn.textContent = '← Back to full observability';
        backBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (this.callbacks.onBackToFull) this.callbacks.onBackToFull();
        });
        card.appendChild(backBtn);

        card.addEventListener('mousedown', e => e.stopPropagation());
        overlay.addEventListener('mousedown', e => e.stopPropagation());

        this.refresh();
    }

    isActive() {
        return this.viewModel.mode === 'values'
            && this.viewModel.valuesSubView === 'vi'
            && this.viewModel.observability === 'partial';
    }

    refresh() {
        if (!this.overlayEl) return;
        this.overlayEl.style.display = this.isActive() ? 'flex' : 'none';
    }

    hide() {
        if (this.overlayEl) this.overlayEl.style.display = 'none';
    }
}
