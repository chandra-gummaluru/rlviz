// Top menu bar with File, Edit, View menus
class MenuBar {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.height = 40;
        this.menuBarElement = null;
        this.menus = {
            file: null,
            edit: null,
            view: null
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
            const menuItem = createDiv();
            menuItem.parent(dropdown);
            menuItem.addClass('menubar-item');

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
