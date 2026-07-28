// Themed replacement for the native alert() previously shown by main.js's onPlay() when the
// Build/Policy "▶ Run" button is clicked with no start node set. Same DOM-overlay convention as
// renormalizeConfirmModal.js/namePolicyModal.js - a single dismiss button, no onProceed/onCancel
// branching, since there's nothing to confirm here, just an acknowledgement.
class NoStartNodeModal {
    constructor() {
        this.overlayEl = null;
    }

    setup() {
        if (this.overlayEl) return;

        const overlay = document.createElement('div');
        overlay.className = 'no-start-node-modal-overlay';
        document.body.appendChild(overlay);
        this.overlayEl = overlay;

        const card = document.createElement('div');
        card.className = 'no-start-node-modal';
        overlay.appendChild(card);

        const title = document.createElement('div');
        title.className = 'no-start-node-modal-title';
        title.textContent = 'No start state selected';
        card.appendChild(title);

        const body = document.createElement('div');
        body.className = 'no-start-node-modal-body';
        body.textContent = 'Please select a start state first — right-click a state on the canvas, or use the s₀ dropdown.';
        card.appendChild(body);

        const actions = document.createElement('div');
        actions.className = 'no-start-node-modal-actions';
        card.appendChild(actions);

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'panel-btn panel-btn--primary';
        okBtn.textContent = 'OK';
        okBtn.addEventListener('click', e => {
            e.stopPropagation();
            this.hide();
        });
        actions.appendChild(okBtn);

        card.addEventListener('mousedown', e => e.stopPropagation());
        overlay.addEventListener('mousedown', e => e.stopPropagation());

        this.hide();
    }

    show() {
        if (!this.overlayEl) return;
        this.overlayEl.style.display = 'flex';
    }

    hide() {
        if (!this.overlayEl) return;
        this.overlayEl.style.display = 'none';
    }
}
