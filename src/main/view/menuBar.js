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
        this.menuBarElement.style('background-color', '#000000');
        this.menuBarElement.style('display', 'flex');
        this.menuBarElement.style('align-items', 'center');
        this.menuBarElement.style('padding', '0 10px');
        this.menuBarElement.style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');
        this.menuBarElement.style('z-index', '1000');

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
        menuButton.style('color', '#FFFFFF');
        menuButton.style('padding', '8px 16px');
        menuButton.style('cursor', 'pointer');
        menuButton.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
        menuButton.style('font-size', '14px');
        menuButton.style('font-weight', '500');
        menuButton.style('position', 'relative');
        menuButton.style('user-select', 'none');

        // Create dropdown container
        const dropdown = createDiv();
        dropdown.parent(menuButton);
        dropdown.style('position', 'absolute');
        dropdown.style('top', '100%');
        dropdown.style('left', '0');
        dropdown.style('background-color', '#1A1A1A');
        dropdown.style('min-width', '180px');
        dropdown.style('box-shadow', '0 4px 8px rgba(0,0,0,0.3)');
        dropdown.style('border-radius', '0 0 4px 4px');
        dropdown.style('display', 'none');
        dropdown.style('z-index', '1001');

        // Add menu items
        items.forEach(item => {
            const menuItem = createDiv();
            menuItem.parent(dropdown);
            menuItem.style('padding', '10px 16px');
            menuItem.style('color', '#FFFFFF');
            menuItem.style('cursor', 'pointer');
            menuItem.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
            menuItem.style('font-size', '13px');
            menuItem.style('display', 'flex');
            menuItem.style('justify-content', 'space-between');
            menuItem.style('align-items', 'center');

            // Label
            const label = createSpan(item.label);
            label.parent(menuItem);

            // Shortcut (if provided)
            if (item.shortcut) {
                const shortcut = createSpan(item.shortcut);
                shortcut.parent(menuItem);
                shortcut.style('color', '#888888');
                shortcut.style('font-size', '11px');
                shortcut.style('margin-left', '20px');
            }

            // Hover effect
            menuItem.mouseOver(() => {
                menuItem.style('background-color', '#333333');
            });
            menuItem.mouseOut(() => {
                menuItem.style('background-color', 'transparent');
            });

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

        // Hover effect for menu button
        menuButton.mouseOver(() => {
            menuButton.style('background-color', 'rgba(255, 255, 255, 0.1)');
        });
        menuButton.mouseOut(() => {
            menuButton.style('background-color', 'transparent');
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
