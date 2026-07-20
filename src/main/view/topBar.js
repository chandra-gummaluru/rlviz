// Single top chrome bar (replaces the old menuBar.js + toolBar.js two-row layout): logo,
// filename menu, undo/redo, Build|Policy|Values mode toggle on the left; theme toggle,
// parameters popover, and mode-dependent action buttons (Run/Step/Reset/Renormalize, VI's
// T-input + checkboxes) on the right.
class TopBar {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;
        this.height = 40;

        this.topBarElement = null;
        this.leftSection = null;
        this.rightSection = null;

        // Filename menu
        this.menus = { filename: null, params: null };
        this.currentFilename = 'gridworld.mdp';
        this._filenameLabelEl = null;

        // Undo/redo
        this.undoBtn = null;
        this.redoBtn = null;

        // Mode toggle
        this.buildToggleBtn = null;
        this.policyToggleBtn = null;
        this.monteCarloToggleBtn = null;
        this.iterationToggleBtn = null;
        this.currentMode = 'build';

        // Theme toggle
        this.themeToggleBtn = null;

        // Parameters popover. Animation speed is a continuous slider (t: 0 = fastest,
        // 1 = slowest), not a discrete preset - see main.js's onSetAnimationSpeed.
        this._currentSpeed = 0.5;
        this._spinningArrowEnabled = true;
        this._speedSlider = null;
        this._speedValueEl = null;
        this._knownBtn = null;
        this._unknownBtn = null;
        this._fullBtn = null;
        this._partialBtn = null;
        this._spinCheckbox = null;
        this._paramsTriggerLabelEl = null;

        // Build mode action buttons
        this.renormalizeBtn = null;
        this.playPauseBtn = null;
        this.stepBtn = null;
        this.rerunBtn = null;

        // Values -> Monte Carlo
        this.expectationPlayPauseBtn = null;

        // Values -> Value Iteration
        this.viPlayPauseBtn = null;
        this.viStepBtn = null;
        this.viSkipBtn = null;
        this.viResetBtn = null;
        this.viTInput = null;
        this.viTLabel = null;
    }

    setup() {
        this.topBarElement = createDiv();
        this.topBarElement.position(0, 0);
        this.topBarElement.size(windowWidth, this.height);
        this.topBarElement.addClass('topbar');

        this.leftSection = createDiv();
        this.leftSection.parent(this.topBarElement);
        this.leftSection.addClass('topbar-left');

        this.rightSection = createDiv();
        this.rightSection.parent(this.topBarElement);
        this.rightSection.addClass('topbar-right');

        this._createLogo();
        this._createFilenameMenu();
        this._createUndoRedoButtons();
        this._createModeToggle();

        this._createThemeToggle();
        this._createParametersPopover();
        this._createActionButtons();

        this.setMode('build');
    }

    _createLogo() {
        const logo = createDiv('r');
        logo.parent(this.leftSection);
        logo.addClass('topbar-logo');
    }

    // ===== Filename menu (New/Open/Save/Import/Export/recent files) =====

    _createFilenameMenu() {
        const menuButton = createDiv();
        menuButton.parent(this.leftSection);
        menuButton.addClass('menubar-btn');
        menuButton.addClass('menubar-filename-btn');

        this._filenameLabelEl = createSpan();
        this._filenameLabelEl.parent(menuButton);
        this._updateFilenameLabel();

        const dropdown = createDiv();
        dropdown.parent(menuButton);
        dropdown.addClass('menubar-dropdown');

        const renderItems = () => {
            dropdown.html('');
            this._buildFilenameMenuItems().forEach(item => {
                if (item.type === 'separator') {
                    const sep = createDiv();
                    sep.parent(dropdown);
                    sep.addClass('menubar-separator');
                    return;
                }

                const menuItem = createDiv();
                menuItem.parent(dropdown);
                menuItem.addClass('menubar-item');

                const label = createSpan(item.label);
                label.parent(menuItem);

                if (item.shortcut) {
                    const shortcut = createSpan(item.shortcut);
                    shortcut.parent(menuItem);
                    shortcut.addClass('menubar-shortcut');
                }

                menuItem.mousePressed(() => {
                    item.action();
                    dropdown.style('display', 'none');
                });
            });
        };

        menuButton.mousePressed(() => {
            const isVisible = dropdown.style('display') === 'block';
            this.closeAllDropdowns();
            if (!isVisible) {
                renderItems();
                dropdown.style('display', 'block');
            }
        });

        this.menus.filename = { button: menuButton, dropdown: dropdown };
    }

    _buildFilenameMenuItems() {
        const items = [
            { label: 'New', action: () => this.callbacks.onNewGraph() },
            { label: 'Open…', shortcut: '⌘O', action: () => this.callbacks.onOpenGraph() },
            { label: 'Save', shortcut: '⌘S', action: () => this.callbacks.onSaveGraph() },
            { type: 'separator' },
            { label: 'Export PNG', action: () => this.callbacks.onExportPNG() }
        ];

        const recent = this.callbacks.getRecentFiles ? this.callbacks.getRecentFiles() : [];
        if (recent.length > 0) {
            items.push({ type: 'separator' });
            recent.forEach(entry => {
                items.push({ label: entry.name, action: () => this.callbacks.onOpenRecent(entry) });
            });
        }

        return items;
    }

    setFilename(name) {
        this.currentFilename = name;
        this._updateFilenameLabel();
    }

    _updateFilenameLabel() {
        if (this._filenameLabelEl) this._filenameLabelEl.html(`${this.currentFilename} ▾`);
    }

    // ===== Undo/redo icon buttons =====

    _createUndoRedoButtons() {
        const container = createDiv();
        container.parent(this.leftSection);
        container.addClass('menubar-undo-redo');

        this.undoBtn = createButton('↩');
        this.undoBtn.parent(container);
        this.undoBtn.addClass('menubar-icon-btn');
        this.undoBtn.attribute('title', 'Undo');
        this.undoBtn.attribute('disabled', '');
        this.undoBtn.mousePressed(() => { if (this.callbacks.onUndo) this.callbacks.onUndo(); });

        this.redoBtn = createButton('↪');
        this.redoBtn.parent(container);
        this.redoBtn.addClass('menubar-icon-btn');
        this.redoBtn.attribute('title', 'Redo');
        this.redoBtn.attribute('disabled', '');
        this.redoBtn.mousePressed(() => { if (this.callbacks.onRedo) this.callbacks.onRedo(); });
    }

    updateUndoRedoState(canUndo, canRedo) {
        if (this.undoBtn) {
            if (canUndo) this.undoBtn.removeAttribute('disabled');
            else this.undoBtn.attribute('disabled', '');
        }
        if (this.redoBtn) {
            if (canRedo) this.redoBtn.removeAttribute('disabled');
            else this.redoBtn.attribute('disabled', '');
        }
    }

    // ===== Mode toggle (Build | Policy | Values) =====

    _createModeToggle() {
        // Padded, rounded outer track (not edge-to-edge touching segments) - each button is
        // independently rounded, matching the mockup's pill styling.
        const track = createDiv();
        track.parent(this.leftSection);
        track.addClass('topbar-mode-toggle');

        this.buildToggleBtn = createButton('Build');
        this.buildToggleBtn.parent(track);
        this.buildToggleBtn.addClass('toolbar-toggle');
        this.buildToggleBtn.addClass('toolbar-toggle--build');
        this.buildToggleBtn.addClass('toolbar-toggle--active');
        this.buildToggleBtn.mousePressed(() => this.switchMode('build'));

        this.policyToggleBtn = createButton('Policy');
        this.policyToggleBtn.parent(track);
        this.policyToggleBtn.addClass('toolbar-toggle');
        this.policyToggleBtn.addClass('toolbar-toggle--policy');
        this.policyToggleBtn.mousePressed(() => this.switchMode('policy'));

        // Monte Carlo / Iteration: Evaluate redesign Phase 1 replaces the single Values segment
        // with two visually-separate scene entry points. Both still drive the SAME internal
        // mode='values' + valuesSubView state as before (see CanvasController.enterValuesScene) -
        // this is a rendering-only split, not a new top-level mode. Sub-view switching WHILE
        // already in Values mode still lives in the floating estimator pill, unchanged; these
        // buttons are the "enter Values mode at this sub-view, with the goal-card gate" path.
        this.monteCarloToggleBtn = createButton('Monte Carlo');
        this.monteCarloToggleBtn.parent(track);
        this.monteCarloToggleBtn.addClass('toolbar-toggle');
        this.monteCarloToggleBtn.addClass('toolbar-toggle--mc');
        this.monteCarloToggleBtn.mousePressed(() => this.enterValuesScene('mc'));

        // Iteration's label/active-color relabel to "Learning Iteration" (purpleT) when P is
        // unknown, mirroring ValuesMethodMatrix's known:full/unknown:full split - see
        // refreshModeToggle() below. Only the modelKnown axis affects this button; observability
        // (Belief/PO Q-Learning) stays handled entirely inside the Iteration sub-view, as today.
        this.iterationToggleBtn = createButton('Iteration');
        this.iterationToggleBtn.parent(track);
        this.iterationToggleBtn.addClass('toolbar-toggle');
        this.iterationToggleBtn.addClass('toolbar-toggle--iteration');
        this.iterationToggleBtn.mousePressed(() => this.enterValuesScene('vi'));

        this.refreshModeToggle();
    }

    // Re-applies the Iteration button's label ("Iteration" / "Learning Iteration") and active-
    // state color class based on the current modelKnown flag. Called on setup and whenever
    // modelKnown toggles (main.js's onModelKnownToggle) so the button never goes stale.
    refreshModeToggle() {
        if (!this.iterationToggleBtn || !this.viewModel) return;
        const known = this.viewModel.modelKnown;
        this.iterationToggleBtn.html(known ? 'Iteration' : 'Learning Iteration');
        // NOTE: this codebase's vendored p5.js Element.toggleClass(cls) takes only ONE argument
        // and always flips unconditionally - it silently ignores a second "force" boolean (unlike
        // native classList.toggle(cls, force)). Using addClass/removeClass explicitly instead,
        // matching _refreshParamsPopover()'s pattern elsewhere in this file.
        if (known) {
            this.iterationToggleBtn.removeClass('toolbar-toggle--iteration-unknown');
        } else {
            this.iterationToggleBtn.addClass('toolbar-toggle--iteration-unknown');
        }
    }

    // Public entry point for both new buttons - always shown via callback (not a direct
    // controller call), matching every other top-bar action in this file.
    //
    // Bug found during Task 4's real-browser end-to-end verification: this used to just set
    // `this.currentMode = 'values'` directly instead of calling `this.setMode('values')`. That
    // skipped setMode()'s hide() calls on Build/Policy's playPauseBtn/stepBtn/rerunBtn/
    // renormalizeBtn, so those stayed visible (and clickable) stacked on top of the Monte
    // Carlo/VI action buttons after entering Values mode via these two toolbar segments -
    // e.g. two overlapping "Reset" buttons, with the stale Build one winning hit-testing since
    // it was created first. setMode('values') itself derives the button set from
    // this.viewModel.valuesSubView, which may still hold the *previous* sub-view for a moment
    // here (canvasController.enterValuesScene(subView) hasn't run yet) - harmless, since the
    // onEnterValuesScene/onSelectScene callback below always follows up with an explicit
    // topBar.refreshValuesSubView(subView) call using the real target subView, correcting it.
    enterValuesScene(subView) {
        this.setMode('values');
        if (this.callbacks.onEnterValuesScene) {
            this.callbacks.onEnterValuesScene(subView);
        }
    }

    switchMode(newMode) {
        this.currentMode = newMode;
        this.setMode(newMode);

        if (this.callbacks.onModeChange) {
            this.callbacks.onModeChange(newMode);
        }
    }

    // ===== Theme toggle =====

    _createThemeToggle() {
        this.themeToggleBtn = createButton('');
        this.themeToggleBtn.parent(this.rightSection);
        this.themeToggleBtn.addClass('menubar-theme-toggle');
        this.themeToggleBtn.attribute('title', 'Toggle light / dark theme');
        this.themeToggleBtn.mousePressed(() => {
            AppPalette.toggleTheme();
            this._updateThemeIcon();
        });
        this._updateThemeIcon();
    }

    // Glyph reflects the destination theme: sun while dark (click for light), moon while light
    // (click for dark).
    _updateThemeIcon() {
        if (!this.themeToggleBtn) return;
        this.themeToggleBtn.html(AppPalette.getTheme() === 'dark' ? '☀' : '☾');
    }

    // ===== Parameters popover: animation speed, spinning arrow, P known/unknown, observability =====

    _createParametersPopover() {
        const trigger = createDiv();
        trigger.parent(this.rightSection);
        trigger.addClass('menubar-btn');
        trigger.addClass('menubar-params-trigger');

        this._paramsTriggerLabelEl = createSpan();
        this._paramsTriggerLabelEl.parent(trigger);

        const dropdown = createDiv();
        dropdown.parent(trigger);
        dropdown.addClass('menubar-dropdown');
        dropdown.addClass('menubar-popover');
        // Popover hosts live controls (buttons/checkbox) rather than a one-shot item list -
        // clicks inside must not bubble to the canvas or be treated as "click outside".
        dropdown.elt.addEventListener('mousedown', e => e.stopPropagation());

        this._buildSpeedSection(dropdown);
        this._buildModelKnownSection(dropdown);
        this._buildObservabilitySection(dropdown);

        trigger.mousePressed((event) => {
            if (event && event.stopPropagation) event.stopPropagation();
            const isVisible = dropdown.style('display') === 'block';
            this.closeAllDropdowns();
            dropdown.style('display', isVisible ? 'none' : 'block');
        });

        this.menus.params = { button: trigger, dropdown: dropdown };
        this._refreshParamsPopover();
    }

    // Display-only: reparametrizes the continuous t (0-1, 0=fastest/1=slowest) onto a
    // 0.25x-3x numeric multiplier range for the slider's live readout and the trigger chip's
    // short label. Purely presentational - main.js's actual SPEED_FAST/SPEED_SLOW timing
    // interpolation (onSetAnimationSpeed) is untouched, so the real animation speed/feel at
    // any given slider position is unchanged; only this label text changed from the old
    // Fast/Medium/Slow buckets.
    _speedLabelForT(t) {
        const clamped = Math.max(0, Math.min(1, t));
        const displayMultiplier = 0.25 + (3 - 0.25) * (1 - clamped);
        return displayMultiplier.toFixed(2) + '×';
    }

    _buildSpeedSection(dropdown) {
        const section = createDiv();
        section.parent(dropdown);
        section.addClass('menubar-popover-section');

        const title = createDiv('Animation speed');
        title.parent(section);
        title.addClass('menubar-popover-title');

        const row = createDiv();
        row.parent(section);
        row.addClass('menubar-speed-row');

        this._speedSlider = createElement('input');
        this._speedSlider.parent(row);
        this._speedSlider.attribute('type', 'range');
        this._speedSlider.attribute('min', '0');
        this._speedSlider.attribute('max', '1');
        this._speedSlider.attribute('step', '0.01');
        this._speedSlider.attribute('value', String(this._currentSpeed));
        this._speedSlider.addClass('menubar-speed-slider');
        this._speedSlider.elt.addEventListener('mousedown', e => e.stopPropagation());
        this._speedSlider.elt.addEventListener('click', e => e.stopPropagation());
        this._speedSlider.elt.style.setProperty('--fill', this._currentSpeed);

        this._speedValueEl = createSpan(this._speedLabelForT(this._currentSpeed));
        this._speedValueEl.parent(row);
        this._speedValueEl.addClass('menubar-speed-value');

        this._speedSlider.input(() => {
            const t = parseFloat(this._speedSlider.value());
            this._speedSlider.elt.style.setProperty('--fill', t);
            this._speedValueEl.html(this._speedLabelForT(t));
            if (this.callbacks.onSetAnimationSpeed) this.callbacks.onSetAnimationSpeed(t);
        });

        const endLabels = createDiv();
        endLabels.parent(section);
        endLabels.addClass('menubar-speed-endlabels');
        const fastLabel = createSpan('Fast');
        fastLabel.parent(endLabels);
        const slowLabel = createSpan('Slow');
        slowLabel.parent(endLabels);

        const spinRow = createDiv();
        spinRow.parent(section);
        spinRow.addClass('menubar-popover-checkbox-row');

        this._spinCheckbox = createCheckbox('Spinning Arrow', true);
        this._spinCheckbox.parent(spinRow);
        this._spinCheckbox.addClass('menubar-checkbox');
        this._spinCheckbox.changed(() => {
            if (this.callbacks.onToggleSpinningArrow) this.callbacks.onToggleSpinningArrow();
        });
    }

    _buildModelKnownSection(dropdown) {
        const section = createDiv();
        section.parent(dropdown);
        section.addClass('menubar-popover-section');

        const title = createDiv('Transition model');
        title.parent(section);
        title.addClass('menubar-popover-title');

        const row = createDiv();
        row.parent(section);
        row.addClass('menubar-segmented');

        this._knownBtn = createButton('P known');
        this._knownBtn.parent(row);
        this._knownBtn.addClass('menubar-segmented-btn');
        this._knownBtn.mousePressed(() => {
            if (this.callbacks.onModelKnownToggle) this.callbacks.onModelKnownToggle(true);
        });

        this._unknownBtn = createButton('P unknown');
        this._unknownBtn.parent(row);
        this._unknownBtn.addClass('menubar-segmented-btn');
        this._unknownBtn.mousePressed(() => {
            if (this.callbacks.onModelKnownToggle) this.callbacks.onModelKnownToggle(false);
        });
    }

    _buildObservabilitySection(dropdown) {
        const section = createDiv();
        section.parent(dropdown);
        section.addClass('menubar-popover-section');

        const title = createDiv('Observability');
        title.parent(section);
        title.addClass('menubar-popover-title');

        const row = createDiv();
        row.parent(section);
        row.addClass('menubar-segmented');

        this._fullBtn = createButton('Full');
        this._fullBtn.parent(row);
        this._fullBtn.addClass('menubar-segmented-btn');
        this._fullBtn.mousePressed(() => {
            if (this.callbacks.onObservabilityToggle) this.callbacks.onObservabilityToggle('full');
        });

        this._partialBtn = createButton('Partial');
        this._partialBtn.parent(row);
        this._partialBtn.addClass('menubar-segmented-btn');
        this._partialBtn.mousePressed(() => {
            if (this.callbacks.onObservabilityToggle) this.callbacks.onObservabilityToggle('partial');
        });
    }

    // Called after any popover-affecting state change (speed, spinning arrow, modelKnown,
    // observability) - re-derives every active-state class and the trigger chip's label from
    // the current viewModel/local state, rather than tracking incremental diffs.
    _refreshParamsPopover() {
        if (!this.menus.params) return;

        if (this._speedSlider) {
            this._speedSlider.elt.value = this._currentSpeed;
            this._speedSlider.elt.style.setProperty('--fill', this._currentSpeed);
        }
        if (this._speedValueEl) this._speedValueEl.html(this._speedLabelForT(this._currentSpeed));

        if (this._spinCheckbox) this._spinCheckbox.checked(this._spinningArrowEnabled);

        const known = this.viewModel ? this.viewModel.modelKnown : true;
        if (this._knownBtn) {
            if (known) this._knownBtn.addClass('menubar-segmented-btn--active');
            else this._knownBtn.removeClass('menubar-segmented-btn--active');
        }
        if (this._unknownBtn) {
            if (!known) this._unknownBtn.addClass('menubar-segmented-btn--active');
            else this._unknownBtn.removeClass('menubar-segmented-btn--active');
        }

        const observability = (this.viewModel && this.viewModel.observability) || 'full';
        if (this._fullBtn) {
            if (observability === 'full') this._fullBtn.addClass('menubar-segmented-btn--active');
            else this._fullBtn.removeClass('menubar-segmented-btn--active');
        }
        if (this._partialBtn) {
            if (observability === 'partial') this._partialBtn.addClass('menubar-segmented-btn--active');
            else this._partialBtn.removeClass('menubar-segmented-btn--active');
        }

        if (this._paramsTriggerLabelEl) {
            const speedShort = this._speedLabelForT(this._currentSpeed);
            const knownShort = known ? 'P known' : 'P unknown';
            const obsShort = observability === 'partial' ? 'PO' : 'Full';
            this._paramsTriggerLabelEl.html(`${speedShort} · ${knownShort} · ${obsShort} ▾`);
        }
    }

    // Public entry point (mirrors the old updateSettingsChecks API) - called from main.js
    // whenever animation speed or spinning-arrow state changes.
    updateSettingsChecks(activeSpeed, spinningArrowEnabled) {
        this._currentSpeed = activeSpeed;
        this._spinningArrowEnabled = spinningArrowEnabled;
        this._refreshParamsPopover();
    }

    // Called from main.js whenever modelKnown/observability change (controller-mutated state
    // topBar doesn't otherwise observe).
    refreshParameters() {
        this._refreshParamsPopover();
    }

    // Close all dropdowns when clicking outside
    closeAllDropdowns() {
        Object.values(this.menus).forEach(menu => {
            if (menu && menu.dropdown) {
                menu.dropdown.style('display', 'none');
            }
        });
    }

    // ===== Mode-dependent action buttons: Run/Step/Reset/Renormalize (Build & Policy),
    // MC's Play/Pause, VI's Play/Step/Skip/Reset + T-input + Per-action/Show-calcs checkboxes =====

    _createActionButtons() {
        this.renormalizeBtn = this._createBtn('⟳ Renormalize', () => this.callbacks.onRenormalize(), 'toolbar-btn--renormalize');

        // Evaluate pi: unlike every other button in this cluster, this one is ALWAYS visible in
        // all four modes (Build/Policy/Monte Carlo/Iteration) - it's never hidden by setMode()'s
        // per-mode show/hide dance the way playPauseBtn/renormalizeBtn etc. are, only ever
        // enabled/disabled via setEvaluatePolicyEnabled() (see main.js's onModelKnownToggle
        // wiring). Shown once here at creation time and never hidden again.
        this.evaluatePiBtn = this._createBtn('Evaluate π', () => {
            if (this.callbacks.onEvaluatePolicy) this.callbacks.onEvaluatePolicy();
        }, 'toolbar-btn--evaluate-pi');
        this.evaluatePiBtn.show();

        this.playPauseBtn = this._createBtn('▶ Run', () => this.handlePlayPauseClick(), 'toolbar-btn--play');
        this.playPauseBtn.elt.dataset.mode = 'play';
        this.stepBtn = this._createBtn('Step', () => this.callbacks.onStep(), 'toolbar-btn--step');
        this.rerunBtn = this._createBtn('Reset', () => this.callbacks.onRerun(), 'toolbar-btn--rerun');

        this.expectationPlayPauseBtn = this._createBtn('▶ Play', () => this.handleExpectationPlayPauseClick(), 'toolbar-btn--play');
        this.expectationPlayPauseBtn.elt.dataset.mode = 'play';
        this.expectationStepBtn = this._createBtn('Step', () => {
            if (this.callbacks.onExpectationStep) this.callbacks.onExpectationStep();
        }, 'toolbar-btn--step');
        this.expectationResetBtn = this._createBtn('Reset', () => {
            if (this.callbacks.onExpectationReset) this.callbacks.onExpectationReset();
        }, 'toolbar-btn--rerun');

        this.viPlayPauseBtn = this._createBtn('Play', () => this.handleVIPlayPauseClick(), 'toolbar-btn--play');
        this.viPlayPauseBtn.elt.dataset.mode = 'play';
        this.viStepBtn = this._createBtn('Step', () => {
            if (this.callbacks.onVIStep) this.callbacks.onVIStep();
        }, 'toolbar-btn--step');
        this.viSkipBtn = this._createBtn('Skip', () => {
            if (this.callbacks.onVISkip) this.callbacks.onVISkip();
        }, 'toolbar-btn--action');
        this.viResetBtn = this._createBtn('Reset', () => {
            if (this.callbacks.onVIReset) this.callbacks.onVIReset();
        }, 'toolbar-btn--rerun');

        this.viTLabel = createSpan('T =');
        this.viTLabel.parent(this.rightSection);
        this.viTLabel.addClass('toolbar-t-label');

        this.viTInput = createInput('8', 'number');
        this.viTInput.parent(this.rightSection);
        this.viTInput.addClass('toolbar-t-input');
        this.viTInput.attribute('min', '0');
        this.viTInput.attribute('max', '100');
        this.viTInput.attribute('title', 'Safety cap — Iteration stops here even if it has not converged');
        this.viTInput.size(50);
    }

    _createBtn(label, onClick, modifierClass) {
        const btn = createButton(label);
        btn.parent(this.rightSection);
        btn.addClass('toolbar-btn');
        if (modifierClass) btn.addClass(modifierClass);
        btn.mousePressed(onClick);
        return btn;
    }

    handleExpectationPlayPauseClick() {
        const mode = this.expectationPlayPauseBtn.elt.dataset.mode;
        if (mode === 'play') {
            if (this.callbacks.onExpectationPlay) this.callbacks.onExpectationPlay();
        } else {
            if (this.callbacks.onExpectationPause) this.callbacks.onExpectationPause();
        }
    }

    setExpectationPlayMode(mode) {
        if (!this.expectationPlayPauseBtn) return;
        this.expectationPlayPauseBtn.elt.dataset.mode = mode;
        if (mode === 'play') {
            // Use the current display-run count in the label
            const displayRuns = (this.viewModel && this.viewModel.expectationState) ? this.viewModel.expectationState.displayRuns : 24;
            this.expectationPlayPauseBtn.html(`▶ Run ${displayRuns} episodes`);
            this.expectationPlayPauseBtn.removeClass('toolbar-btn--pause');
            this.expectationPlayPauseBtn.addClass('toolbar-btn--play');
        } else {
            this.expectationPlayPauseBtn.html('⏸ Pause');
            this.expectationPlayPauseBtn.removeClass('toolbar-btn--play');
            this.expectationPlayPauseBtn.addClass('toolbar-btn--pause');
        }
    }

    handleVIPlayPauseClick() {
        const mode = this.viPlayPauseBtn.elt.dataset.mode;
        if (mode === 'play') {
            if (this.callbacks.onVIPlay) this.callbacks.onVIPlay();
        } else {
            if (this.callbacks.onVIPause) this.callbacks.onVIPause();
        }
    }

    getVIT() {
        const v = parseInt(this.viTInput.value());
        return (Number.isFinite(v) && v >= 0) ? v : 8;
    }

    handlePlayPauseClick() {
        const mode = this.playPauseBtn.elt.dataset.mode;
        if (mode === 'play') {
            if (this.callbacks.onPlay) this.callbacks.onPlay();
        } else {
            if (this.callbacks.onPause) this.callbacks.onPause();
        }
    }

    // Called whenever the Values sub-view changes without a top-level mode change (e.g.
    // clicking the estimator pill's MC/Method segments) - setMode('values') only re-derives
    // which action buttons show at the moment 'values' mode is first entered, so sub-view-only
    // transitions need this explicit refresh too, or the previous sub-view's buttons stay stuck.
    refreshValuesSubView(subView) {
        if (this.currentMode !== 'values') return;
        this._applyValuesSubViewButtons(subView);
    }

    // Shows/hides the MC and VI button sets for the given sub-view ('mc' | 'vi'), hiding both
    // first so it's safe to call repeatedly/idempotently. subView === null hides all.
    _applyValuesSubViewButtons(subView) {
        this.expectationPlayPauseBtn.hide();
        this.expectationStepBtn.hide();
        this.expectationResetBtn.hide();
        this.viPlayPauseBtn.hide();
        this.viStepBtn.hide();
        this.viSkipBtn.hide();
        this.viResetBtn.hide();
        this.viTLabel.hide();
        this.viTInput.hide();

        // Monte Carlo/Iteration toolbar segments only show their tint while actually the current
        // sub-view (matching Build/Policy's own .toolbar-toggle--active convention) - clear both
        // unconditionally, then re-apply below for whichever one matches.
        if (this.monteCarloToggleBtn) this.monteCarloToggleBtn.removeClass('toolbar-toggle--active');
        if (this.iterationToggleBtn) this.iterationToggleBtn.removeClass('toolbar-toggle--active');

        if (!subView) return;

        if (subView === 'mc') {
            this.expectationPlayPauseBtn.show();
            this.expectationStepBtn.show();
            this.expectationResetBtn.show();
            this.setExpectationPlayMode('play');
            if (this.monteCarloToggleBtn) this.monteCarloToggleBtn.addClass('toolbar-toggle--active');
        }
        if (subView === 'vi') {
            this.viPlayPauseBtn.show();
            this.viStepBtn.show();
            this.viSkipBtn.show();
            this.viResetBtn.show();
            this.viTLabel.show();
            this.viTInput.show();
            this.setVIPlayPauseMode('play');
            if (this.iterationToggleBtn) this.iterationToggleBtn.addClass('toolbar-toggle--active');
        }
    }

    // mode: 'build' | 'policy' | 'values'. Policy's top bar/canvas are now identical to
    // Build's in every way (same action buttons, same Renormalize, same Run label) - only the
    // right panel differs between the two.
    setMode(mode) {
        this.currentMode = mode;

        this.renormalizeBtn.hide();
        this.playPauseBtn.hide();
        this.stepBtn.hide();
        this.rerunBtn.hide();
        this._applyValuesSubViewButtons(null);

        this.buildToggleBtn.removeClass('toolbar-toggle--active');
        this.policyToggleBtn.removeClass('toolbar-toggle--active');

        if (mode === 'build' || mode === 'policy') {
            this.playPauseBtn.show();
            this.stepBtn.show();
            this.rerunBtn.show();
            this.renormalizeBtn.show();
            this.setPlayPauseMode('play');
            this.setPlayPauseEnabled(true);
            this.setStepEnabled(true);
            this._updateRunButtonLabel();

            if (mode === 'build') {
                this.buildToggleBtn.addClass('toolbar-toggle--active');
            } else {
                this.policyToggleBtn.addClass('toolbar-toggle--active');
            }
        } else if (mode === 'values') {
            // Monte Carlo/Iteration's own .toolbar-toggle--active is applied inside
            // _applyValuesSubViewButtons() based on subView, same as Build/Policy above.
            const subView = (this.viewModel && this.viewModel.valuesSubView) || 'mc';
            this._applyValuesSubViewButtons(subView);
        }
    }

    // "Run" in both Build and Policy - Policy's Run/Renormalize/Step/Reset row is identical to
    // Build's (per CLAUDE.md: Policy's canvas/top-bar are intentionally the same as Build's).
    // Values gets its own method-specific labels, handled separately via setPlayPauseMode's
    // callers passing 'play'/'pause'.
    _updateRunButtonLabel() {
        if (!this.playPauseBtn || this.playPauseBtn.elt.dataset.mode !== 'play') return;
        this.playPauseBtn.html('▶ Run');
    }

    updateWidth(newWidth) {
        if (this.topBarElement) {
            this.topBarElement.size(newWidth, this.height);
        }
    }

    getHeight() {
        return this.height;
    }

    getCurrentMode() {
        return this.currentMode;
    }

    setPlayPauseMode(mode) {
        if (!this.playPauseBtn) return;

        this.playPauseBtn.elt.dataset.mode = mode;

        if (mode === 'play') {
            this.playPauseBtn.removeClass('toolbar-btn--pause');
            this.playPauseBtn.addClass('toolbar-btn--play');
            this._updateRunButtonLabel();
        } else {
            this.playPauseBtn.html('⏸ Pause');
            this.playPauseBtn.removeClass('toolbar-btn--play');
            this.playPauseBtn.addClass('toolbar-btn--pause');
        }
    }

    setPlayPauseEnabled(enabled) {
        if (this.playPauseBtn) {
            if (enabled) this.playPauseBtn.removeAttribute('disabled');
            else this.playPauseBtn.attribute('disabled', '');
        }
    }

    setStepEnabled(enabled) {
        if (this.stepBtn) {
            if (enabled) this.stepBtn.removeAttribute('disabled');
            else this.stepBtn.attribute('disabled', '');
        }
    }

    setEvaluatePolicyEnabled(enabled) {
        if (this.evaluatePiBtn) {
            if (enabled) this.evaluatePiBtn.removeAttribute('disabled');
            else this.evaluatePiBtn.attribute('disabled', '');
        }
    }

    updateButtonStates(isPlaying, canAdvance) {
        if (isPlaying) {
            this.setPlayPauseMode('pause');
            this.setPlayPauseEnabled(true);
        } else {
            this.setPlayPauseMode('play');
            this.setPlayPauseEnabled(canAdvance);
        }

        this.setStepEnabled(!isPlaying && canAdvance);
    }

    // Value Iteration button methods

    setVIPlayPauseMode(mode) {
        if (!this.viPlayPauseBtn) return;

        this.viPlayPauseBtn.elt.dataset.mode = mode;

        if (mode === 'play') {
            // Resolve the current VI quadrant's runLabel through ValuesMethodMatrix
            const modelKnown = this.viewModel ? this.viewModel.modelKnown : true;
            const observability = (this.viewModel && this.viewModel.observability) || 'full';
            const entry = ValuesMethodMatrix.resolve(modelKnown, observability);
            const label = (entry && entry.runLabel) ? entry.runLabel : '▶ Play';
            this.viPlayPauseBtn.html(label);
            this.viPlayPauseBtn.removeClass('toolbar-btn--pause');
            this.viPlayPauseBtn.addClass('toolbar-btn--play');
        } else {
            this.viPlayPauseBtn.html('⏸ Pause');
            this.viPlayPauseBtn.removeClass('toolbar-btn--play');
            this.viPlayPauseBtn.addClass('toolbar-btn--pause');
        }
    }

    // canStep: can advance (T cap only in the 3 non-diagram quadrants; "does the live sweep have
    // an un-revealed state left" in known:full - see ViStatesView.canRevealNextState()). canPlay:
    // "Find Optimal"'s own enablement (canStep AND not yet converged in the non-diagram
    // quadrants; always just the T cap in known:full, independent of per-state reveal progress -
    // see ViStatesView.canSkipCurrentState()). canSkip defaults to canStep, keeping every
    // pre-existing 3-arg call site (the other 3 quadrants + Learning Iteration, where Step and
    // Skip always share the same enablement) unchanged.
    updateVIButtonStates(isPlaying, canStep, canPlay = canStep, canSkip = canStep) {
        if (isPlaying) {
            this.setVIPlayPauseMode('pause');
        } else {
            this.setVIPlayPauseMode('play');
        }

        if (this.viPlayPauseBtn) {
            if (isPlaying || canPlay) this.viPlayPauseBtn.removeAttribute('disabled');
            else this.viPlayPauseBtn.attribute('disabled', '');
        }

        if (this.viStepBtn) {
            if (!isPlaying && canStep) this.viStepBtn.removeAttribute('disabled');
            else this.viStepBtn.attribute('disabled', '');
        }

        if (this.viSkipBtn) {
            if (!isPlaying && canSkip) this.viSkipBtn.removeAttribute('disabled');
            else this.viSkipBtn.attribute('disabled', '');
        }
    }
}
