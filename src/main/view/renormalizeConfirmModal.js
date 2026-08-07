// Themed confirmation modal replacing the native confirm() previously used by
// main.js's checkAndRenormalizeIfNeeded() before starting a Build/Policy simulation or entering
// Monte Carlo with unnormalized action probabilities. Same DOM-overlay convention as
// goalCard.js/findOptimalCard.js/namePolicyModal.js. Unlike a native confirm(), this is
// necessarily async - show() takes an onProceed callback invoked only if the user clicks
// "Renormalize", never called at all on Cancel - main.js's checkAndRenormalizeIfNeeded() is
// restructured around this (see its own comment).
class RenormalizeConfirmModal {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.overlayEl = null;
        this.bodyEl = null;
        this._pendingProceed = null;
    }

    setup() {
        if (this.overlayEl) return;

        const overlay = document.createElement('div');
        overlay.className = 'renormalize-confirm-modal-overlay';
        document.body.appendChild(overlay);
        this.overlayEl = overlay;

        const card = document.createElement('div');
        card.className = 'renormalize-confirm-modal';
        overlay.appendChild(card);

        const title = document.createElement('div');
        title.className = 'renormalize-confirm-modal-title';
        title.textContent = 'Unnormalized probabilities';
        card.appendChild(title);

        const body = document.createElement('div');
        body.className = 'renormalize-confirm-modal-body';
        card.appendChild(body);
        this.bodyEl = body;

        const actions = document.createElement('div');
        actions.className = 'renormalize-confirm-modal-actions';
        card.appendChild(actions);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'panel-btn panel-btn--secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._pendingProceed = null;
            this.hide();
            if (this.callbacks.onCancel) this.callbacks.onCancel();
        });
        actions.appendChild(cancelBtn);

        const renormalizeBtn = document.createElement('button');
        renormalizeBtn.type = 'button';
        renormalizeBtn.className = 'panel-btn panel-btn--primary';
        renormalizeBtn.textContent = '⟳ Renormalize';
        renormalizeBtn.addEventListener('click', e => {
            e.stopPropagation();
            const proceed = this._pendingProceed;
            this._pendingProceed = null;
            this.hide();
            if (proceed) proceed();
        });
        actions.appendChild(renormalizeBtn);

        card.addEventListener('mousedown', e => e.stopPropagation());
        overlay.addEventListener('mousedown', e => e.stopPropagation());

        this.hide();
    }

    show(names, onProceed) {
        if (!this.overlayEl) return;
        this._pendingProceed = onProceed;
        this.bodyEl.textContent =
            `Action node(s) [${names.join(', ')}] have probabilities that don't sum to 1. ` +
            `Continuing will renormalize these probabilities.`;
        this.overlayEl.style.display = 'flex';
    }

    hide() {
        if (!this.overlayEl) return;
        this.overlayEl.style.display = 'none';
    }
}
