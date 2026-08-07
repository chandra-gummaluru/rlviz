// Minimal single-instance, auto-dismissing notification - the app's first toast/snackbar
// component (none existed before this). Backs policy-logging.md §1's "Log is capped at 6
// policies; when full, logging refuses with a toast" - main.js checks the cap BEFORE opening
// namePolicyModal.js, so this never appears alongside that modal. Same rounded-card visual shell
// as namePolicyModal.js/renormalizeConfirmModal.js, but deliberately NOT an overlay (no backdrop,
// no buttons, doesn't block canvas interaction) since a toast is meant to be glanced at, not
// dismissed - `show()` restarts its own auto-hide timer if called again while already visible, so
// a burst of "log full" clicks doesn't flicker it.
const TOAST_AUTO_HIDE_MS = 3000;

class Toast {
    constructor() {
        this.el = null;
        this._hideTimer = null;
    }

    setup() {
        if (this.el) return;

        const el = document.createElement('div');
        el.className = 'app-toast';
        document.body.appendChild(el);
        this.el = el;
    }

    // Relies purely on the --visible class's opacity/pointer-events toggle (see style.css) rather
    // than a display:none/block dance, so the fade transition always has something to animate -
    // display:none would jump-cut instead of fading, both in and out.
    show(message) {
        if (!this.el) return;
        this.el.textContent = message;
        this.el.classList.add('app-toast--visible');

        if (this._hideTimer) clearTimeout(this._hideTimer);
        this._hideTimer = setTimeout(() => this.hide(), TOAST_AUTO_HIDE_MS);
    }

    hide() {
        if (!this.el) return;
        this.el.classList.remove('app-toast--visible');
        if (this._hideTimer) {
            clearTimeout(this._hideTimer);
            this._hideTimer = null;
        }
    }
}
