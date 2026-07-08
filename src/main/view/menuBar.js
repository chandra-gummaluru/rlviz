// Top menu bar with File, Edit, View, Settings menus
class MenuBar {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.height = 42;
        this.menuBarElement = null;
        this.themeToggleBtn = null;
        this.menus = {
            file: null,
            edit: null,
            view: null,
            settings: null
        };

        // Settings menu item references for updating checkmarks
        this.settingsItems = {
            fast: null,
            medium: null,
            slow: null,
            spinningArrow: null
        };
    }

    setup() {
        // Create main menu bar container
        this.menuBarElement = createDiv();
        this.menuBarElement.position(0, 0);
        this.menuBarElement.size(windowWidth, this.height);
        this.menuBarElement.addClass('menubar');

        // Create File menu
        this.createMenu('file', 'File', [
            { label: 'Import', action: () => this.callbacks.onImport() },
            { label: 'Export', action: () => this.callbacks.onExport() }
        ]);

        // Create Edit menu
        this.createMenu('edit', 'Edit', [
            { label: 'Undo', action: () => this.callbacks.onUndo(), shortcut: 'Ctrl+Z' },
            { label: 'Redo', action: () => this.callbacks.onRedo(), shortcut: 'Ctrl+Shift+Z' }
        ]);

        // Create View menu
        this.createMenu('view', 'View', [
            { label: 'Zoom In', action: () => this.callbacks.onZoomIn() },
            { label: 'Zoom Out', action: () => this.callbacks.onZoomOut() },
            { label: 'Reset Zoom', action: () => this.callbacks.onResetZoom() }
        ]);

        // Create Animations menu
        this.createMenu('settings', 'Animations', [
            { label: 'Fast', action: () => this.callbacks.onSetAnimationSpeed('fast'), key: 'fast', check: false },
            { label: 'Medium', action: () => this.callbacks.onSetAnimationSpeed('medium'), key: 'medium', check: true },
            { label: 'Slow', action: () => this.callbacks.onSetAnimationSpeed('slow'), key: 'slow', check: false },
            { type: 'separator' },
            { label: 'Spinning Arrow', action: () => this.callbacks.onToggleSpinningArrow(), key: 'spinningArrow', check: true }
        ]);

        this._createRightSection();
    }

    _createRightSection() {
        const right = createDiv();
        right.parent(this.menuBarElement);
        right.addClass('menubar-right');

        this.themeToggleBtn = createButton('');
        this.themeToggleBtn.parent(right);
        this.themeToggleBtn.addClass('menubar-theme-toggle');
        this.themeToggleBtn.attribute('title', 'Toggle light / dark theme');
        this.themeToggleBtn.mousePressed(() => {
            AppPalette.toggleTheme();
            this._updateThemeIcon();
        });
        this._updateThemeIcon();

        const wordmark = createSpan('rlviz');
        wordmark.parent(right);
        wordmark.addClass('menubar-wordmark');

        const tagline = createSpan('MDP editor · simulator');
        tagline.parent(right);
        tagline.addClass('menubar-tagline');
    }

    // Glyph reflects the destination theme: sun while dark (click for light), moon while light
    // (click for dark).
    _updateThemeIcon() {
        if (!this.themeToggleBtn) return;
        this.themeToggleBtn.html(AppPalette.getTheme() === 'dark' ? '☀' : '☾');
    }

    createMenu(menuKey, menuLabel, items) {
        // Create menu button
        const menuButton = createDiv(menuLabel);
        menuButton.parent(this.menuBarElement);
        menuButton.addClass('menubar-btn');

        // Create dropdown container
        const dropdown = createDiv();
        dropdown.parent(menuButton);
        dropdown.addClass('menubar-dropdown');

        // Add menu items
        items.forEach(item => {
            if (item.type === 'separator') {
                const sep = createDiv();
                sep.parent(dropdown);
                sep.addClass('menubar-separator');
                return;
            }

            const menuItem = createDiv();
            menuItem.parent(dropdown);
            menuItem.addClass('menubar-item');

            // Check mark (for settings items)
            if (item.key !== undefined) {
                const check = createSpan(item.check ? '\u2713' : '');
                check.parent(menuItem);
                check.addClass('menubar-check');
                this.settingsItems[item.key] = check;
            }

            // Label
            const label = createSpan(item.label);
            label.parent(menuItem);

            // Shortcut (if provided)
            if (item.shortcut) {
                const shortcut = createSpan(item.shortcut);
                shortcut.parent(menuItem);
                shortcut.addClass('menubar-shortcut');
            }

            // Click handler
            menuItem.mousePressed(() => {
                item.action();
                dropdown.style('display', 'none');
            });
        });

        // Toggle dropdown on menu button click
        menuButton.mousePressed(() => {
            const isVisible = dropdown.style('display') === 'block';

            // Hide all dropdowns first
            Object.values(this.menus).forEach(menu => {
                if (menu && menu.dropdown) {
                    menu.dropdown.style('display', 'none');
                }
            });

            // Toggle this dropdown
            dropdown.style('display', isVisible ? 'none' : 'block');
        });

        // Store menu reference
        this.menus[menuKey] = {
            button: menuButton,
            dropdown: dropdown
        };
    }

    // Update checkmarks in the Settings menu
    updateSettingsChecks(activeSpeed, spinningArrowEnabled) {
        ['fast', 'medium', 'slow'].forEach(speed => {
            if (this.settingsItems[speed]) {
                this.settingsItems[speed].html(speed === activeSpeed ? '\u2713' : '');
            }
        });
        if (this.settingsItems.spinningArrow) {
            this.settingsItems.spinningArrow.html(spinningArrowEnabled ? '\u2713' : '');
        }
    }

    // Close all dropdowns when clicking outside
    closeAllDropdowns() {
        Object.values(this.menus).forEach(menu => {
            if (menu && menu.dropdown) {
                menu.dropdown.style('display', 'none');
            }
        });
    }

    updateWidth(newWidth) {
        if (this.menuBarElement) {
            this.menuBarElement.size(newWidth, this.height);
        }
    }

    getHeight() {
        return this.height;
    }
}
