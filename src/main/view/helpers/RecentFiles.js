// Pure localStorage-backed recent-files list for the menu bar's filename menu. No DOM.
// Stores full JSON content per entry (not just a filename) so a recent file can be re-imported
// without the browser's original File handle.
const RecentFiles = {
    _KEY: 'rlviz-recent-files',
    _MAX: 8,

    list() {
        try {
            const raw = localStorage.getItem(this._KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    },

    add({ name, json }) {
        if (!name || !json) return;
        const entries = this.list().filter(e => e.name !== name);
        entries.unshift({ name, json });
        const trimmed = entries.slice(0, this._MAX);
        try {
            localStorage.setItem(this._KEY, JSON.stringify(trimmed));
        } catch {
            // localStorage full/unavailable - recent files is a convenience, not critical
        }
    }
};
