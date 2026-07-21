// Themed "Name this policy" text-input modal - shared by BOTH the "Find optimal π" flow (once a
// Value-Iteration run it kicked off converges - see main.js's promptNameOptimalPolicy()) and the
// "Evaluate π" flow (main.js's onEvaluatePolicy), so either can log its resulting Policy log entry
// under a user-chosen name instead of an auto label. Since the two flows confirm into completely
// different interactors, this does NOT bind one fixed onConfirm/onCancel at construction time -
// show() takes them per-call instead, so each caller supplies its own handler for whichever action
// "OK" should actually perform. Same DOM-overlay convention as goalCard.js/findOptimalCard.js
// (plain DOM, not p5 createX() helpers, since it's not parented into the p5 draw tree), reusing
// rightPanel.js's own .panel-input/.panel-btn/.panel-btn--primary classes for the input and
// buttons so it matches the right panel's existing "Name" section (rightPanel.js's node-rename
// input) look exactly.
class NamePolicyModal {
    constructor() {
        this.overlayEl = null;
        this.inputEl = null;
        this._onConfirm = null;
        this._onCancel = null;
    }

    setup() {
        if (this.overlayEl) return;

        const overlay = document.createElement('div');
        overlay.className = 'name-policy-modal-overlay';
        document.body.appendChild(overlay);
        this.overlayEl = overlay;

        const card = document.createElement('div');
        card.className = 'name-policy-modal';
        overlay.appendChild(card);

        const title = document.createElement('div');
        title.className = 'name-policy-modal-title';
        title.textContent = 'Name this policy';
        card.appendChild(title);
        this.titleEl = title;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'panel-input name-policy-modal-input';
        card.appendChild(input);
        this.inputEl = input;

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._confirm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this._cancel();
            }
        });

        const actions = document.createElement('div');
        actions.className = 'name-policy-modal-actions';
        card.appendChild(actions);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'panel-btn panel-btn--secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._cancel();
        });
        actions.appendChild(cancelBtn);
        this.cancelBtnEl = cancelBtn;

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'panel-btn panel-btn--primary';
        okBtn.textContent = 'OK';
        okBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._confirm();
        });
        actions.appendChild(okBtn);
        this.okBtnEl = okBtn;

        card.addEventListener('mousedown', e => e.stopPropagation());
        overlay.addEventListener('mousedown', e => e.stopPropagation());

        this.hide();
    }

    // title is optional - defaults to "Name this policy" (the Find-Optimal flow's own wording);
    // Evaluate π passes a slightly different title since it's naming a policy EVALUATION, not
    // necessarily an optimal one. cancelLabel is optional - defaults to "Cancel" (Find-Optimal/
    // Evaluate π's own wording, where declining truly aborts); the MC/VI Play-button name-gate
    // passes "Don't Log" instead, since declining there still runs the action, just unlogged.
    // confirmLabel is optional - defaults to "OK"; the same "Don't Log" flows pass "Log" so the
    // pair reads as a coherent "Don't Log / Log" choice instead of "Don't Log / OK".
    show(defaultName, { onConfirm, onCancel, title, cancelLabel, confirmLabel } = {}) {
        if (!this.overlayEl) return;
        this._onConfirm = onConfirm || null;
        this._onCancel = onCancel || null;
        this.titleEl.textContent = title || 'Name this policy';
        this.inputEl.value = defaultName || '';
        if (this.cancelBtnEl) this.cancelBtnEl.textContent = cancelLabel || 'Cancel';
        if (this.okBtnEl) this.okBtnEl.textContent = confirmLabel || 'OK';
        this.overlayEl.style.display = 'flex';
        this.inputEl.focus();
        this.inputEl.select();
    }

    hide() {
        if (!this.overlayEl) return;
        this.overlayEl.style.display = 'none';
    }

    _confirm() {
        if (this._onConfirm) this._onConfirm(this.inputEl.value);
    }

    _cancel() {
        if (this._onCancel) this._onCancel();
    }
}
