// --- File-local constants ---
const RP_SET_CHAR_LIMIT      = 22;     // max combined plain-text chars before truncation
const RP_DEFAULT_DISCOUNT    = 0.9;
const RP_REWARD_SLIDER_MIN   = -100;
const RP_REWARD_SLIDER_MAX   = 100;
const RP_PROB_SLIDER_STEP    = 0.01;
const RP_VI_TABLE_MAX_H      = 400;    // px max height of the V(s) table
// --- End constants ---

// Right panel displaying MDP information and node editing

// Render a LaTeX string directly to HTML via KaTeX.
// display=true for block (display) math, false for inline.
function renderKatex(latex, display = false) {
    if (typeof katex === 'undefined') return `<span>${latex}</span>`;
    return katex.renderToString(latex, { throwOnError: false, displayMode: display });
}

function latexEscapeText(value) {
    return String(value)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[{}]/g, match => `\\${match}`)
        .replace(/_/g, '\\_')
        .replace(/%/g, '\\%')
        .replace(/&/g, '\\&')
        .replace(/#/g, '\\#')
        .replace(/\$/g, '\\$');
}

function latexNodeName(name) {
    return `\\text{${latexEscapeText(name)}}`;
}

function buildSetLatex(nodes, charLimit) {
    const parts = [];
    let charCount = 0;
    for (const node of nodes) {
        const name = node.name;
        if (parts.length > 0 && charCount + name.length > charLimit) {
            parts.push('\\ldots');
            break;
        }
        parts.push(latexNodeName(name));
        charCount += name.length + 2; // +2 for ", " separator
    }
    return parts.join(', ');
}

class RightPanel {
    constructor(viewModel, controller) {
        this.viewModel = viewModel;
        this.controller = controller;
        this.width = 272;
        this.panelElement = null;
        this.contentContainer = null;
        this.onPanelResize = null;

        // Discount factor (gamma) for MDP - editable
        this.discountFactor = RP_DEFAULT_DISCOUNT;

        this.simStatDisplay = {
            steps: 0,
            utility: 0,
            totalReward: 0
        };
        this.simStatAnimationFrame = null;
        this.expectationViewModel = null;
        this.expectationState = null;
        // Scoped subtree holding the Estimate/Episodes/Selected Run sections (see
        // renderExpectationPanel()/updateExpectationData()) - re-rendered on its own by
        // updateExpectationData() without rebuilding the whole panel (which would tear down and
        // recreate the Parameters gamma/max-steps sliders on every scrubber tick / play frame).
        this._mcStatsContainer = null;

        this.callbacks = {
            onSpinningArrowToggle: (enabled) => {
                if (this.controller && this.controller.toggleSpinningArrow) {
                    this.controller.toggleSpinningArrow(enabled);
                }
            },
            onSpinningArrowDurationChange: (duration) => {
                if (this.controller && this.controller.setSpinningArrowDuration) {
                    this.controller.setSpinningArrowDuration(duration);
                }
            },
            onVICellClick: null,            // (colIdx, stateId, actionId) => void
            onVIExplainClose: null,         // () => void
            onVIExplainStep: null,          // ('prev' | 'next') => void
            onManualQOverride: null,        // (stateId, actionId, value) => void
            onExpectationMaxStepsChange: null,    // (maxSteps) => void
            onExpectationGammaChange: null,       // (gamma) => void
            onInitialStateChange: null,           // () => void - re-run MC rollouts for the new s0
        };
    }

    setup(topOffset) {
        // Create main panel container
        this.panelElement = createDiv();
        this.panelElement.position(windowWidth - this.width, topOffset);
        this.panelElement.size(this.width, windowHeight - topOffset);
        this.panelElement.addClass('panel');

        this.updateContent();
        this._setupResizeHandle();
    }

    updateContent() {
        if (this.simStatAnimationFrame !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.simStatAnimationFrame);
            this.simStatAnimationFrame = null;
        }

        // Recreate container so renderMathInElement always processes a fresh, unmodified DOM tree
        if (this.contentContainer) this.contentContainer.remove();
        this.contentContainer = createDiv();
        this.contentContainer.parent(this.panelElement);
        // The old container (and any _mcStatsContainer child of it) was just destroyed above -
        // drop the stale reference so a later updateExpectationData() call is a no-op instead of
        // rebuilding into a detached DOM node, until renderExpectationPanel() creates a fresh one.
        this._mcStatsContainer = null;

        const selectedNode = this.viewModel.selection.selectedNode;
        const selectedEdge = this.viewModel.selection.selectedEdge;
        const isBuildMode = this.viewModel.interaction.mode === 'build';
        const isPolicyMode = this.viewModel.interaction.mode === 'policy';
        const isValuesMode = this.viewModel.interaction.mode === 'values';
        const valuesSubView = this.viewModel.valuesSubView;
        const isMCView = isValuesMode && valuesSubView === 'mc';
        const isVIMode = isValuesMode && valuesSubView === 'vi';

        const simState = this.viewModel.simulationState;
        const simActive = (isBuildMode || isPolicyMode) && simState && simState.replayInitialized;

        const rawHoveredNode = this.viewModel.interaction.hoveredNode;
        const rawHoveredEdge = this.viewModel.interaction.hoveredEdge;

        const hoveredNode = simActive && rawHoveredNode
            ? (simState.isNodeVisible(rawHoveredNode.id) ? rawHoveredNode : null)
            : rawHoveredNode;
        const hoveredEdge = simActive && rawHoveredEdge
            ? (simState.isEdgeVisible(rawHoveredEdge.getFromNode().id, rawHoveredEdge.getToNode().id) ? rawHoveredEdge : null)
            : rawHoveredEdge;

        if (isMCView) {
            this.renderExpectationPanel();
        } else if (isVIMode) {
            this.renderValueIterationPanel();
        } else if (selectedNode) {
            // Editable in both Build and Policy - Policy's canvas is identical to Build's, only
            // the default (nothing-selected) panel below differs between the two.
            this.renderNodePanel(selectedNode, { readOnly: !(isBuildMode || isPolicyMode) });
        } else if (selectedEdge) {
            this.renderEdgePanel(selectedEdge);
        } else if (hoveredNode) {
            this.renderNodePanel(hoveredNode, { readOnly: true });
        } else if (hoveredEdge) {
            this.renderEdgePanel(hoveredEdge);
        } else if (isBuildMode) {
            this.renderBuildPanel();
        } else if (isPolicyMode) {
            this.renderPolicyModePanel();
        }

        if (isValuesMode) this._renderEstimateVsExact();
    }

    // Build mode's default (nothing selected/hovered) inspector content: Parameters, Initial
    // State, Policy π, then Utility G - in that order per the unified Build/Values workspace
    // spec. Steps is no longer shown as its own big number (see _renderStepsAndUtility) - the
    // floating TraceScrubber (mainView.traceScrubber) now shows how far into the episode the
    // simulation is, replacing this panel's old read-only "t" progress bar.
    renderBuildPanel() {
        this.createSection('Parameters', () => {
            const paramsDiv = createDiv();
            paramsDiv.parent(this.contentContainer);
            paramsDiv.addClass('panel-section-content');
            this._renderGammaSlider(paramsDiv);
        });

        this.renderInitialStateSection();
        this._renderStepsAndUtility();
        this._renderPolicyLog();
    }

    renderInitialStateSection() {
        // Initial State (s₀) Section
        this.createSection('Initial State', () => {
            const s0Container = createDiv();
            s0Container.parent(this.contentContainer);
            s0Container.addClass('panel-section-content');

            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');

            const row = createDiv();
            row.parent(s0Container);
            row.style('display', 'flex');
            row.style('align-items', 'center');
            row.style('gap', '8px');

            const label = createDiv();
            label.parent(row);
            label.elt.innerHTML = renderKatex('s_0 =');

            const select = createSelect();
            select.parent(row);
            select.addClass('panel-input');
            select.option('None', '');

            states.forEach(stateNode => {
                select.option(stateNode.name, String(stateNode.id));
            });

            const currentStart = this.viewModel.startNode;
            select.selected(currentStart ? String(currentStart.id) : '');

            select.changed(() => {
                const val = select.value();
                if (val === '') {
                    this.viewModel.startNode = null;
                } else {
                    const node = this.viewModel.graph.nodes.find(n => n.id === Number(val));
                    this.viewModel.startNode = node || null;
                }
                // Monte Carlo's rollouts are generated FROM the start node, so a stale/absent
                // computation left over from before this change would make Play silently no-op
                // (ExpectationView.startPlay() returns early while !state.computed) - re-run in
                // the background whenever this changes while in Values mode, not just on the
                // MC pane specifically, so switching over to it later already has fresh data.
                if (this.callbacks.onInitialStateChange && this.viewModel.interaction.mode === 'values') {
                    this.callbacks.onInitialStateChange();
                }
                if (typeof redraw === 'function') redraw();
            });
        });
    }

    // Deterministic-mode action-segment row (one button per action, active = current policy
    // choice) - used by Policy mode's fuller Policy π section (_renderPolicyModeSection).
    _renderPolicyActionSegments(row, stateNode, actions, currentAction) {
        const segRow = createDiv();
        segRow.parent(row);
        segRow.addClass('policy-segmented-row');

        actions.forEach(actionId => {
            const actionNode = this.viewModel.graph.nodes.find(n => n.type === 'action' && n.id === actionId);
            if (!actionNode) return;
            const btn = createButton(actionNode.name);
            btn.parent(segRow);
            btn.addClass('policy-segmented-btn');
            if (currentAction === actionId) btn.addClass('policy-segmented-btn--active');
            btn.mousePressed(() => {
                this.controller.setPolicyAction(stateNode.id, actionId);
                this.updateContent();
                redraw();
            });
        });
    }

    // Policy mode's default (nothing selected/hovered) inspector content: Parameters, Initial
    // State, then the fuller Policy π section (adds the Random-with-weights editor on top of
    // Build's simple Deterministic-only toggle).
    renderPolicyModePanel() {
        this.createSection('Parameters', () => {
            const paramsDiv = createDiv();
            paramsDiv.parent(this.contentContainer);
            paramsDiv.addClass('panel-section-content');
            this._renderGammaSlider(paramsDiv);
        });

        this.renderInitialStateSection();
        this._renderPolicyModeSection();
        this._renderPolicyLog();
    }

    // Policy π section (Policy mode only): per-state Deterministic|Random toggle, where Random
    // reveals an editable weighted-probability distribution. Reads/writes
    // simulationState.policy/policyWeights, the shared source of truth also consumed by Build's
    // simulation and Monte Carlo's rollouts.
    _renderPolicyModeSection() {
        this.createSection('Policy π', () => {
            const policyDiv = createDiv();
            policyDiv.parent(this.contentContainer);

            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
            if (states.length === 0) {
                const empty = createDiv('No states available');
                empty.parent(policyDiv);
                empty.addClass('panel-empty');
                return;
            }

            const simulationState = this.viewModel.simulationState;
            let firstNonTerminal = null;
            let firstNonTerminalMode = null;

            states.forEach(stateNode => {
                const row = createDiv();
                row.parent(policyDiv);
                row.addClass('policy-state-row');

                const label = createDiv(stateNode.name);
                label.parent(row);
                label.addClass('policy-state-label');

                const actions = stateNode.actions || [];
                if (actions.length === 0) {
                    const terminal = createDiv('— terminal');
                    terminal.parent(row);
                    terminal.addClass('policy-terminal-label');
                    return;
                }

                if (!firstNonTerminal) {
                    firstNonTerminal = stateNode;
                    firstNonTerminalMode = simulationState.getPolicyMode(stateNode.id);
                }

                const policyMode = simulationState.getPolicyMode(stateNode.id);
                const isDeterministic = policyMode === 'deterministic';
                const isWeighted = policyMode === 'weighted';
                const currentAction = simulationState.getPolicyAction(stateNode.id);

                const drToggle = createDiv();
                drToggle.parent(row);
                drToggle.addClass('policy-det-random-toggle');

                const detBtn = createButton('Deterministic');
                detBtn.parent(drToggle);
                detBtn.addClass('policy-det-random-btn');
                if (isDeterministic) detBtn.addClass('policy-det-random-btn--active');
                detBtn.mousePressed(() => {
                    if (!isDeterministic) {
                        this.controller.setPolicyAction(stateNode.id, actions[0]);
                        this.updateContent();
                        redraw();
                    }
                });

                const randBtn = createButton('Random');
                randBtn.parent(drToggle);
                randBtn.addClass('policy-det-random-btn');
                if (!isDeterministic) randBtn.addClass('policy-det-random-btn--active');
                randBtn.mousePressed(() => {
                    // Seed equal weights the first time this state enters weighted mode, so
                    // every action starts with a real, sampled-from entry rather than siblings
                    // silently getting zero probability the moment only one slider is touched.
                    if (!isWeighted) {
                        this.controller.initPolicyWeightsUniform(stateNode.id, actions);
                        this.updateContent();
                        redraw();
                    }
                });

                if (isDeterministic) {
                    this._renderPolicyActionSegments(row, stateNode, actions, currentAction);
                } else if (isWeighted) {
                    this._renderPolicyWeightSliders(row, stateNode, actions);
                }
                // else: untouched-uniform - no extra content, matching Build's simple section;
                // clicking "Random" (already active by default) seeds real weights via
                // initPolicyWeightsUniform, which is what actually reveals the sliders.
            });

            if (firstNonTerminal) {
                const hint = createDiv();
                hint.parent(policyDiv);
                hint.addClass('panel-hint');
                hint.style('margin-top', '8px');

                if (firstNonTerminalMode === 'weighted') {
                    hint.html('stochastic π · sampled each step · edge width ∝ probability');
                } else {
                    const stateIndex = states.findIndex(s => s.id === firstNonTerminal.id);
                    const action = simulationState.getPolicyAction(firstNonTerminal.id);
                    const actionNode = action !== null
                        ? this.viewModel.graph.nodes.find(n => n.type === 'action' && n.id === action)
                        : null;
                    const rhs = actionNode ? latexNodeName(actionNode.name) : '\\text{random}';
                    hint.elt.innerHTML = renderKatex(`\\pi(s_{${stateIndex}}) = ${rhs}`)
                        + ' <span class="panel-hint-suffix">· used by Simulate and Values</span>';
                }
            }
        }, { titleClass: 'panel-section-title--policy' });
    }

    // Random-mode weight editor: one independent slider per action (raw weight, not forced to
    // sum to 1 - see SimulationState's "normalize at sample time" design). Dragging updates the
    // live normalized-percentage readouts for every sibling slider in this state (not just the
    // one being dragged) without a full panel rebuild, matching the established
    // commit-on-input/redraw-live pattern; a full refresh happens naturally on the next
    // updateContent() (e.g. switching states or the Deterministic|Random toggle).
    _renderPolicyWeightSliders(row, stateNode, actions) {
        const simulationState = this.viewModel.simulationState;
        const weights = simulationState.getPolicyWeights(stateNode.id) || {};

        const sliderContainer = createDiv();
        sliderContainer.parent(row);
        sliderContainer.addClass('policy-weight-sliders');

        const readouts = [];
        // Paired cyan/purple π(a₀)/π(a₁) notation is intentionally scoped to the 2-action case -
        // it's a complementary pair (p, 1-p) that doesn't generalize to 1- or 3+-action states,
        // which fall back to one generic per-row readout with a subscripted action index instead.
        const isPaired = actions.length === 2;

        const refreshReadouts = () => {
            const currentWeights = simulationState.getPolicyWeights(stateNode.id) || {};
            const sum = actions.reduce((s, id) => s + (currentWeights[id] ?? 0), 0);
            const pcts = actions.map(id => {
                const w = currentWeights[id] ?? 0;
                return sum > 0 ? w / sum : 1 / actions.length;
            });

            if (isPaired) {
                const p = pcts[0];
                const pairedHtml =
                    `<span style="color: var(--accent-cyan)">π(a${this._toSubscript(0)}) = ${p.toFixed(2)}</span>` +
                    ` / ` +
                    `<span style="color: var(--accent-purple)">π(a${this._toSubscript(1)}) = ${(1 - p).toFixed(2)}</span>`;
                // Show the combined pair string once (first row only) - previously this set the
                // same paired html on every row's readout, duplicating it across both actions.
                readouts.forEach(({ valueDisplay }, i) => valueDisplay.html(i === 0 ? pairedHtml : ''));
            } else {
                readouts.forEach(({ index, valueDisplay }) => {
                    valueDisplay.html(`π(a${this._toSubscript(index)}) = ${pcts[index].toFixed(2)}`);
                });
            }
        };

        actions.forEach((actionId, index) => {
            const actionNode = this.viewModel.graph.nodes.find(n => n.type === 'action' && n.id === actionId);
            if (!actionNode) return;

            const weightRow = createDiv();
            weightRow.parent(sliderContainer);
            weightRow.addClass('policy-weight-row');

            const nameLabel = createDiv(actionNode.name);
            nameLabel.parent(weightRow);
            nameLabel.addClass('policy-weight-name');

            const rawWeight = weights[actionId] ?? 0;
            const { slider, valueDisplay } = RightPanelBuilder.sliderRow(weightRow, 0, 1, rawWeight, 0.01);
            // Paired readout uses mono digits (same --font-family-mono token every numeric
            // readout in this file already builds on) so the two probabilities align visually.
            if (isPaired) valueDisplay.style('font-family', 'var(--font-family-mono, monospace)');
            readouts.push({ actionId, index, valueDisplay });

            slider.input(() => {
                const newValue = parseFloat(slider.value());
                this.controller.setPolicyWeight(stateNode.id, actionId, newValue);
                refreshReadouts();
                redraw();
            });
        });

        refreshReadouts();
    }

    renderNodePanel(node, { readOnly = false } = {}) {
        // Title
        const title = createDiv(`${node.type === 'state' ? 'State' : 'Action'} Node`);
        title.parent(this.contentContainer);
        title.addClass('panel-title');

        if (readOnly) {
            // Read-only: show name as plain text
            this.createSection('Name', () => {
                const nameContainer = createDiv();
                nameContainer.parent(this.contentContainer);
                nameContainer.addClass('panel-section-content');
                const nameVal = createDiv(node.name);
                nameVal.parent(nameContainer);
                nameVal.addClass('panel-stat-value');
            });
        } else {
            // Editable name section
            this.createSection('Name', () => {
                const nameContainer = createDiv();
                nameContainer.parent(this.contentContainer);
                nameContainer.addClass('panel-section-content');

                const input = createInput(node.name);
                input.parent(nameContainer);
                input.addClass('panel-input');

                const saveBtn = createButton('Save Name');
                saveBtn.parent(nameContainer);
                saveBtn.addClass('panel-btn');
                saveBtn.addClass('panel-btn--primary');

                const saveName = () => {
                    const newName = input.value();
                    if (newName && newName.trim() !== '') {
                        if (this.controller.interactors.renameNode) {
                            const inputData = new RenameNodeInputData(node.id, newName.trim());
                            this.controller.interactors.renameNode.executeRename(inputData);
                            this.updateContent();
                            redraw();
                        }
                    }
                };

                saveBtn.mousePressed(saveName);

                input.elt.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') saveName();
                });
            });

            // Image Upload Section (edit mode only)
            this.createSection('Image', () => {
                const imageContainer = createDiv();
                imageContainer.parent(this.contentContainer);
                imageContainer.addClass('panel-section-content');

                if (node.image) {
                    const imgPreview = createImg(node.image, 'Node image');
                    imgPreview.parent(imageContainer);
                    imgPreview.addClass('panel-img-preview');
                } else {
                    const noImage = createDiv('No image uploaded');
                    noImage.parent(imageContainer);
                    noImage.addClass('panel-empty');
                    noImage.addClass('panel-empty--with-gap');
                }

                const uploadBtn = createButton('Upload Image');
                uploadBtn.parent(imageContainer);
                uploadBtn.addClass('panel-btn');
                uploadBtn.addClass('panel-btn--success');

                uploadBtn.mousePressed(() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                this.controller.setNodeImage(node.id, event.target.result);
                                this.updateContent();
                                redraw();
                            };
                            reader.readAsDataURL(file);
                        }
                    };
                    input.click();
                });

                if (node.image) {
                    const removeBtn = createButton('Remove Image');
                    removeBtn.parent(imageContainer);
                    removeBtn.addClass('panel-btn');
                    removeBtn.addClass('panel-btn--danger');

                    removeBtn.mousePressed(() => {
                        this.controller.setNodeImage(node.id, null);
                        this.updateContent();
                        redraw();
                    });
                }
            });
        }

        // Connections Section (always shown)
        if (node.type === 'state') {
            this.renderStateConnections(node, readOnly);
        } else {
            this.renderActionConnections(node, readOnly);
        }
    }

    renderEdgePanel(edge) {
        const from = edge.getFromNode();
        const to = edge.getToNode();
        const isTransition = from.type === 'action' && to.type === 'state';

        const title = createDiv('Edge');
        title.parent(this.contentContainer);
        title.addClass('panel-title');

        this.createSection('Connection', () => {
            const content = createDiv();
            content.parent(this.contentContainer);
            content.addClass('panel-section-content');

            const typeLabel = createDiv(`${from.type === 'state' ? 'State' : 'Action'} → ${to.type === 'state' ? 'State' : 'Action'}`);
            typeLabel.parent(content);
            typeLabel.addClass('panel-label');

            const connRow = createDiv();
            connRow.parent(content);
            connRow.style('display', 'flex');
            connRow.style('align-items', 'center');
            connRow.style('gap', '6px');
            connRow.style('margin-top', '6px');

            RightPanelBuilder.nodeBadge(from.name, from.type, connRow);

            const arrow = createSpan('→');
            arrow.parent(connRow);

            RightPanelBuilder.nodeBadge(to.name, to.type, connRow);
        });

        if (isTransition) {
            this.createSection('Transition', () => {
                const content = createDiv();
                content.parent(this.contentContainer);
                content.addClass('panel-section-content');

                const probRow = createDiv();
                probRow.parent(content);
                probRow.addClass('panel-slider-row');
                const probLabel = createDiv('Probability:');
                probLabel.parent(probRow);
                probLabel.addClass('panel-label');
                const probVal = createDiv(edge.getProbability().toFixed(3));
                probVal.parent(probRow);
                probVal.addClass('panel-stat-value');

                const rewRow = createDiv();
                rewRow.parent(content);
                rewRow.addClass('panel-slider-row');
                const rewLabel = createDiv('Reward:');
                rewLabel.parent(rewRow);
                rewLabel.addClass('panel-label');
                const rewVal = createDiv(edge.getReward().toFixed(2));
                rewVal.parent(rewRow);
                rewVal.addClass('panel-stat-value');
                this._applyRewardColor(rewVal, edge.getReward());
            });
        } else {
            this.createSection('Info', () => {
                const content = createDiv();
                content.parent(this.contentContainer);
                content.addClass('panel-section-content');
                const info = createDiv('Availability edge — no transition probability or reward.');
                info.parent(content);
                info.addClass('panel-empty');
            });
        }
    }

    renderStateConnections(stateNode, readOnly = false) {
        const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
        const stateIndex = states.findIndex(s => s.id === stateNode.id);

        this.createSection('Available Actions', () => {
            const connectionsDiv = createDiv();
            connectionsDiv.parent(this.contentContainer);

            if (stateNode.actions.length === 0) {
                const latexDiv = createDiv();
                latexDiv.parent(connectionsDiv);
                latexDiv.elt.innerHTML = renderKatex(`A(s_{${stateIndex}}) = \\{\\}`, true);
                latexDiv.addClass('panel-latex-content');

            } else {
                const actionSet = stateNode.actions
                    .map(actionId => this.viewModel.graph.getNodeById(actionId))
                    .filter(n => n && n.type === 'action')
                    .map(n => latexNodeName(n.name))
                    .join(', ');
                const latexDiv = createDiv();
                latexDiv.parent(connectionsDiv);
                latexDiv.elt.innerHTML = renderKatex(`A(s_{${stateIndex}}) = \\{${actionSet}\\}`, true);
                latexDiv.addClass('panel-latex-content');

            }
        });
    }

    renderActionConnections(actionNode, readOnly = false) {
        const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');

        this.createSection('Transitions', () => {
            const transitionsDiv = createDiv();
            transitionsDiv.parent(this.contentContainer);

            if (actionNode.sas.length === 0) {
                const empty = createDiv('No transitions defined');
                empty.parent(transitionsDiv);
                empty.addClass('panel-empty');
            } else {
                actionNode.sas.forEach((transition) => {
                    const transitionContainer = createDiv();
                    transitionContainer.parent(transitionsDiv);
                    transitionContainer.addClass('panel-transition-box');

                    const targetState = states.find(s => s.id === transition.nextState);
                    const targetStateName = targetState ? targetState.name : 'Unknown';

                    const header = createDiv(`→ ${targetStateName}`);
                    header.parent(transitionContainer);
                    header.addClass('panel-transition-header');

                    if (readOnly) {
                        // Static probability + reward
                        const probRow = createDiv();
                        probRow.parent(transitionContainer);
                        probRow.addClass('panel-slider-row');
                        const probLabel = createDiv('Probability:');
                        probLabel.parent(probRow);
                        probLabel.addClass('panel-label');
                        const probVal = createDiv(transition.probability.toFixed(3));
                        probVal.parent(probRow);
                        probVal.addClass('panel-stat-value');

                        const rewRow = createDiv();
                        rewRow.parent(transitionContainer);
                        rewRow.addClass('panel-slider-row');
                        const rewLabel = createDiv('Reward:');
                        rewLabel.parent(rewRow);
                        rewLabel.addClass('panel-label');
                        const rewVal = createDiv(transition.reward.toFixed(2));
                        rewVal.parent(rewRow);
                        rewVal.addClass('panel-stat-value');
                        this._applyRewardColor(rewVal, transition.reward);
                    } else {
                        // Editable probability slider
                        const probLabel = createDiv('Probability:');
                        probLabel.parent(transitionContainer);
                        probLabel.addClass('panel-label');

                        const { slider: probSlider, valueDisplay: probValue } =
                            RightPanelBuilder.sliderRow(transitionContainer, 0, 1, transition.probability, RP_PROB_SLIDER_STEP);
                        probValue.html(transition.probability.toFixed(3));

                        probSlider.input(() => {
                            const newProb = parseFloat(probSlider.value());
                            this.controller.setTransitionProbability(actionNode.id, transition.nextState, newProb);
                            probValue.html(newProb.toFixed(3));
                            redraw();
                        });

                        // Editable reward slider
                        const rewardLabel = createDiv('Reward:');
                        rewardLabel.parent(transitionContainer);
                        rewardLabel.addClass('panel-label');

                        const { slider: rewardSlider, valueDisplay: rewardValue } =
                            RightPanelBuilder.sliderRow(transitionContainer, RP_REWARD_SLIDER_MIN, RP_REWARD_SLIDER_MAX, transition.reward, 1);
                        rewardValue.html(transition.reward.toFixed(2));
                        rewardValue.addClass('panel-slider-value--reward');
                        this._applyRewardColor(rewardValue, transition.reward);

                        rewardSlider.input(() => {
                            const newReward = parseFloat(rewardSlider.value());
                            this.controller.setTransitionReward(actionNode.id, transition.nextState, newReward);
                            rewardValue.html(newReward.toFixed(2));
                            this._applyRewardColor(rewardValue, newReward);
                            redraw();
                        });
                    }
                });

                // Show total probability sum
                const totalProb = actionNode.getTotalProbability();
                const totalDiv = createDiv(`Total Probability: ${totalProb.toFixed(3)}`);
                totalDiv.parent(transitionsDiv);
                totalDiv.addClass('panel-total-prob');
                totalDiv.addClass(totalProb === 1.0 ? 'panel-total-prob--valid' : 'panel-total-prob--invalid');
            }
        });
    }

    renderValueIterationPanel() {
        const viState = this.viewModel.valueIterationState;
        const viViewModel = this.viewModel.valueIterationViewModel;
        const modelKnown = this.viewModel.modelKnown;

        // Values mode's own top-of-panel Parameters section (shared γ, used by Simulate/VI) -
        // the Method panel's only access point since Phase 3 retired the old global top-strip.
        // Not duplicated on the MC panel, which already has its own distinct "Discount Factor
        // (γ)" section driving expectationState.gamma, a logically separate value.
        this.createSection('Parameters', () => {
            const paramsDiv = createDiv();
            paramsDiv.parent(this.contentContainer);
            paramsDiv.addClass('panel-section-content');
            this._renderGammaSlider(paramsDiv);
        });

        this.renderInitialStateSection();

        // unknown:full (Learning Iteration) is a genuinely separate subsystem: real episodic
        // Q-learning (algorithm toggle + Q/N table), not VI's Bellman sweep / editable-Q-table.
        const liKey = ValuesMethodMatrix.key(modelKnown, this.viewModel.observability);
        if (liKey === 'unknown:full') {
            this._renderLearningIterationPanel();
            this._renderPolicyLog();
            return;
        }

        // Explanation mode: show explanation + Q-table only (not the full VI panel)
        const explanationDetail = viViewModel?.explanationDetail;
        if (explanationDetail) {
            this._renderExplanationPanel(explanationDetail);
            if (viState && viState.initialized && viViewModel) {
                const tableTitle = createDiv('Action Values');
                tableTitle.parent(this.contentContainer);
                tableTitle.addClass('panel-section-title');
                tableTitle.style('margin-top', '15px');
                const qTableContainer = createDiv();
                qTableContainer.parent(this.contentContainer);
                qTableContainer.addClass('q-table-scroll');
                this._renderQTable(qTableContainer, viState, viViewModel, modelKnown);
            }
            this._renderPolicyLog();
            return;
        }

        // Title, equation, and Convergence copy all resolve through the 2x2 method matrix -
        // known:full/unknown:full are the only quadrants with a real computation difference
        // (Bellman backup vs "P unknown" notice); the two partial-observability quadrants reuse
        // the same numbers under illustrative labels (see valueIterationView.js's _beliefFor).
        const observability = this.viewModel.observability;
        const matrixEntry = ValuesMethodMatrix.resolve(modelKnown, observability);
        const matrixKey = ValuesMethodMatrix.key(modelKnown, observability);

        // Title
        const title = createDiv(matrixEntry.title);
        title.parent(this.contentContainer);
        title.addClass('panel-title');

        // Update-equation header - only the two partial-observability quadrants get one
        // (matching the design reference); known:full/unknown:full are unchanged.
        if (matrixKey === 'known:partial' || matrixKey === 'unknown:partial') {
            const equationTitle = createDiv(matrixKey === 'known:partial' ? 'Belief Update' : 'PO Q-Learning Update');
            equationTitle.parent(this.contentContainer);
            equationTitle.addClass('panel-hint');
            equationTitle.style('font-weight', '600');
            equationTitle.style('margin-bottom', '4px');
        }

        // Bellman/update equation (P known) / descriptive copy (P unknown - no learning
        // algorithm runs, the student edits the Q-table directly)
        const eqDiv = createDiv();
        eqDiv.parent(this.contentContainer);
        eqDiv.addClass('panel-section-content');
        if (matrixKey === 'known:full') {
            eqDiv.elt.innerHTML = renderKatex('V^{k}(s) = \\max_a \\sum_{s\'} P(s\'|s,a)[R + \\gamma V^{k-1}(s\')]', true);
        } else if (matrixKey === 'known:partial') {
            eqDiv.elt.innerHTML = renderKatex('V^{k}(b) = \\max_a \\sum_{s\'} P(s\'|s,a)[R + \\gamma V^{k-1}(b\')]', true);
        } else {
            eqDiv.elt.innerHTML = renderKatex('Q(b,a) \\leftarrow Q + \\alpha[r + \\gamma \\max_{a\'} Q(b\',a\') - Q]', true);
        }

        // Parameters
        const paramsDiv = createDiv();
        paramsDiv.parent(this.contentContainer);
        paramsDiv.addClass('panel-section-content');
        paramsDiv.style('margin-top', '10px');

        if (viState && viState.initialized) {
            const tLine = createDiv(`<strong>Max sweeps (T):</strong> ${viState.T}`);
            tLine.parent(paramsDiv);
            tLine.style('margin-bottom', '4px');

            const progressLine = createDiv(`<strong>Sweep:</strong> ${viState.currentSweepIndex} / ${viState.T}`);
            progressLine.parent(paramsDiv);
            progressLine.style('margin-bottom', '4px');
        }

        // Convergence - the "converged" check is real (live max-norm delta from the synchronous
        // Bellman sweep); the sweep/episode/vector framing per quadrant is illustrative for
        // LI/BI/PO-L, same precedent as Learning Iteration's existing "no real algorithm" framing.
        if (viState && viState.initialized) {
            this.createSection('Convergence', () => {
                const convDiv = createDiv();
                convDiv.parent(this.contentContainer);
                convDiv.addClass('panel-section-content');

                const perQuadrant = {
                    'known:full':      `max ${viState.T} sweeps`,
                    'known:partial':   `belief update · max ${viState.T} sweeps`,
                    'unknown:partial': 'α = 0.1 · belief memory'
                };
                const line1 = createDiv(perQuadrant[matrixKey]);
                line1.parent(convDiv);
                line1.style('margin-bottom', '4px');

                const delta = viState.getDelta(viState.currentSweepIndex);
                const line2 = createDiv();
                line2.parent(convDiv);
                if (viState.converged) {
                    line2.html(`✓ converged Δ &lt; ${viState.epsilon.toFixed(2)}`);
                    line2.style('color', 'var(--reward-positive)');
                } else if (delta === null) {
                    line2.html('Δ = — (init)');
                } else {
                    line2.html(`Δ = ${delta.toFixed(4)}`);
                    line2.style('color', 'var(--accent-yellow)');
                }
            });
        }

        // Q*(s,a;t) table
        if (viState && viState.initialized && viViewModel) {
            const tableTitle = createDiv('Action Values');
            tableTitle.parent(this.contentContainer);
            tableTitle.addClass('panel-section-title');
            tableTitle.style('margin-top', '15px');
            if (!modelKnown) {
                const editHint = createDiv('Click a value to edit it.');
                editHint.parent(this.contentContainer);
                editHint.addClass('panel-hint');
            }

            const qTableContainer = createDiv();
            qTableContainer.parent(this.contentContainer);
            qTableContainer.addClass('q-table-scroll');
            this._renderQTable(qTableContainer, viState, viViewModel, modelKnown);
        } else if (viState && !viState.initialized) {
            const hint = createDiv('Press Play, Step, or Skip to compute Q-values.');
            hint.parent(this.contentContainer);
            hint.addClass('panel-hint');
            hint.style('margin-top', '10px');
        }

        this._renderPolicyLog();
    }

    // ===== Learning Iteration (unknown:full): real episodic Q-learning =====

    // Panel body for the unknown:full quadrant: title, description, Algorithm subsection
    // (ε-greedy | UCB | Optimistic toggle + editable hyperparameter chip), and a live Q/N table.
    // Replaces VI's Bellman-sweep/editable-Q-table content for this quadrant only.
    _renderLearningIterationPanel() {
        const qls = this.viewModel.qLearningState;
        const matrixEntry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);

        // Keep the Q-learning discount in sync with the shared γ slider rendered above.
        if (qls) qls.gamma = this.discountFactor;

        const title = createDiv(matrixEntry.title);
        title.parent(this.contentContainer);
        title.addClass('panel-title');

        const desc = createDiv();
        desc.parent(this.contentContainer);
        desc.addClass('panel-section-content');
        desc.html('P is unknown. Sample episodes and learn Q by trial and error: '
            + 'Q(s,a) &larr; running mean of r + &gamma;·max<sub>a\'</sub> Q(s\',a\').');

        if (!qls) return;

        this._renderQLAlgorithmSection(qls);

        // Episode count readout.
        const stat = createDiv(`<strong>Episodes:</strong> ${qls.episodeCount}`);
        stat.parent(this.contentContainer);
        stat.addClass('panel-section-content');
        stat.style('margin-top', '8px');

        // Q / N table.
        const tableTitle = createDiv('Learned Q-values');
        tableTitle.parent(this.contentContainer);
        tableTitle.addClass('panel-section-title');
        tableTitle.style('margin-top', '12px');

        if (qls.episodeCount === 0) {
            const hint = createDiv('Press Run learning or Step to begin sampling.');
            hint.parent(this.contentContainer);
            hint.addClass('panel-hint');
            hint.style('margin-top', '6px');
        }

        const tableContainer = createDiv();
        tableContainer.parent(this.contentContainer);
        tableContainer.addClass('q-table-scroll');
        this._renderQLearningTable(tableContainer, qls);
    }

    // Algorithm toggle (ε-greedy | UCB | Optimistic) + a small click-to-edit hyperparameter chip
    // for the active algorithm. Toggle DOM/styling mirrors Policy mode's Deterministic|Random
    // toggle; the chip's click-to-edit mirrors the Q-table cell override interaction.
    _renderQLAlgorithmSection(qls) {
        this.createSection('Algorithm', () => {
            const wrap = createDiv();
            wrap.parent(this.contentContainer);
            wrap.addClass('panel-section-content');

            const toggle = createDiv();
            toggle.parent(wrap);
            toggle.addClass('policy-det-random-toggle');
            toggle.addClass('ql-algo-toggle');

            const options = [
                { key: 'epsilonGreedy', label: 'ε-greedy' },
                { key: 'ucb', label: 'UCB' },
                { key: 'optimistic', label: 'Optimistic' }
            ];
            options.forEach(opt => {
                const btn = createButton(opt.label);
                btn.parent(toggle);
                btn.addClass('policy-det-random-btn');
                if (qls.algorithm === opt.key) btn.addClass('policy-det-random-btn--active');
                btn.mousePressed(() => {
                    if (qls.algorithm !== opt.key) {
                        this.controller.setQLAlgorithm(opt.key);   // no reset of learned Q/N
                        this.updateContent();
                        if (typeof redraw === 'function') redraw();
                    }
                });
            });

            // Hyperparameter chip for the active algorithm (click to edit).
            const chipRow = createDiv();
            chipRow.parent(wrap);
            chipRow.addClass('ql-param-row');

            const paramMeta = {
                epsilonGreedy: { label: 'ε', value: qls.epsilon, step: '0.01' },
                ucb:           { label: 'c', value: qls.ucbC, step: '0.1' },
                optimistic:    { label: 'Q₀', value: qls.optimisticQ0, step: '0.5' }
            }[qls.algorithm];

            const chip = createDiv(`${paramMeta.label} = ${this._fmtParam(paramMeta.value)}`);
            chip.parent(chipRow);
            chip.addClass('ql-param-chip');
            chip.elt.title = 'Click to edit';
            chip.mousePressed(() => this._startEditingQLParam(chip.elt, qls.algorithm, paramMeta));
        });
    }

    _fmtParam(v) {
        return (Math.round(v * 100) / 100).toString();
    }

    // Inline click-to-edit for the algorithm hyperparameter (same pattern as _startEditingQCell).
    _startEditingQLParam(chipEl, algorithm, meta) {
        if (chipEl.querySelector('input')) return;
        chipEl.textContent = '';

        const input = document.createElement('input');
        input.type = 'number';
        input.step = meta.step;
        input.value = this._fmtParam(meta.value);
        input.className = 'q-table-cell-input';
        chipEl.appendChild(input);
        input.focus();
        input.select();

        let settled = false;
        const commit = () => {
            if (settled) return;
            settled = true;
            const parsed = parseFloat(input.value);
            if (isFinite(parsed)) {
                this.controller.setQLAlgorithm(algorithm, parsed);
            }
            this.updateContent();
            if (typeof redraw === 'function') redraw();
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { commit(); }
            else if (e.key === 'Escape') { settled = true; this.updateContent(); }
        });
        input.addEventListener('blur', commit);
    }

    // Q/N table for the learned tabular estimate: rows = (state, action), columns = N and Q,
    // with a ★ marker on each state's greedy (argmax-Q) action - same ★ convention as VI's
    // _renderQTable. Reads qLearningState.getQ/getN instead of viState's per-sweep values.
    _renderQLearningTable(container, qls) {
        const graph = this.viewModel.graph;
        const states = graph.nodes.filter(n => n.type === 'state');

        const tableEl = document.createElement('table');
        tableEl.className = 'q-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['s', 'a', 'N', 'Q'].forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        tableEl.appendChild(thead);

        const tbody = document.createElement('tbody');
        let renderedRows = 0;

        states.forEach(stateNode => {
            const actionIds = stateNode.actions || [];
            if (actionIds.length === 0) return;
            const bestAction = qls.greedyAction(stateNode.id, actionIds);

            actionIds.forEach((actionId, ai) => {
                const actionNode = graph.getNodeById(actionId);
                if (!actionNode) return;
                renderedRows++;
                const tr = document.createElement('tr');

                if (ai === 0) {
                    const tdState = document.createElement('td');
                    tdState.textContent = stateNode.name;
                    tdState.rowSpan = actionIds.length;
                    tdState.className = 'q-table-state';
                    tr.appendChild(tdState);
                }

                const tdAction = document.createElement('td');
                tdAction.textContent = actionNode.name;
                tdAction.className = 'q-table-action';
                tr.appendChild(tdAction);

                const n = qls.getN(stateNode.id, actionId);
                const q = qls.getQ(stateNode.id, actionId);
                const isBest = actionId === bestAction && n > 0;

                const tdN = document.createElement('td');
                tdN.className = 'q-table-cell q-table-cell--revealed';
                tdN.textContent = String(n);
                tr.appendChild(tdN);

                const tdQ = document.createElement('td');
                tdQ.className = 'q-table-cell q-table-cell--revealed';
                if (isBest) tdQ.classList.add('q-table-cell--best');
                tdQ.textContent = q.toFixed(2) + (isBest ? ' ★' : '');
                tr.appendChild(tdQ);

                tbody.appendChild(tr);
            });
        });

        if (renderedRows === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.textContent = 'No available actions';
            td.className = 'q-table-cell q-table-cell--unknown';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        tableEl.appendChild(tbody);
        container.elt.appendChild(tableEl);
    }

    // Shared discount-factor (γ) slider, used by Build's Parameters section and Values mode's
    // per-view Parameters section. Not mode-specific - drives both Simulate/Build's Utility G
    // and Value Iteration's Bellman backup gamma. Row layout (label - slider - value) matches
    // the design mockup and the Build panel's read-only t progress bar below it.
    _renderGammaSlider(parentDiv) {
        const row = createDiv();
        row.parent(parentDiv);
        row.addClass('panel-param-row');

        const label = createDiv('γ');
        label.parent(row);
        label.addClass('panel-param-row-label');

        const slider = createElement('input');
        slider.parent(row);
        slider.attribute('type', 'range');
        slider.attribute('min', '0');
        slider.attribute('max', '1');
        slider.attribute('step', '0.01');
        slider.attribute('value', String(this.discountFactor));
        slider.addClass('panel-param-row-slider');
        slider.addClass('panel-param-row-slider--gamma');
        slider.elt.addEventListener('mousedown', e => e.stopPropagation());
        slider.elt.addEventListener('click', e => e.stopPropagation());
        // WebKit/Blink have no native "filled portion" for a fully custom (appearance:none)
        // range input, unlike Firefox's ::-moz-range-progress - kept in sync via a CSS custom
        // property the track's background gradient reads (see input[type="range"] in style.css).
        slider.elt.style.setProperty('--fill', this.discountFactor);

        const value = createDiv(this.discountFactor.toFixed(2));
        value.parent(row);
        value.addClass('panel-param-row-value');

        slider.input(() => {
            const g = parseFloat(slider.value());
            this.discountFactor = g;
            value.html(g.toFixed(2));
            slider.elt.style.setProperty('--fill', g);
        });
        // 'change' (fires once, on release/commit - not every drag tick) triggers a full panel
        // refresh so anything else derived from discountFactor (Build's Utility G + contribution
        // bar, in particular) picks up the new value. Rebuilding mid-drag on 'input' instead would
        // replace the slider's own DOM node while the browser still has it mouse-captured, breaking
        // the drag.
        slider.elt.addEventListener('change', () => {
            this.updateContent();
            if (typeof redraw === 'function') redraw();
        });
    }

    // Same row layout/fill-pct pattern as _renderGammaSlider, but bound to
    // expectationState.gamma - Monte Carlo's own discount factor, intentionally distinct
    // from the shared this.discountFactor used by Build/Policy/Value Iteration.
    _renderExpectationGammaSlider(parentDiv) {
        const state = this.expectationState;
        const gamma = state ? state.gamma : 0.9;

        const row = createDiv();
        row.parent(parentDiv);
        row.addClass('panel-param-row');

        const label = createDiv('γ');
        label.parent(row);
        label.addClass('panel-param-row-label');

        const slider = createElement('input');
        slider.parent(row);
        slider.attribute('type', 'range');
        slider.attribute('min', '0');
        slider.attribute('max', '1');
        slider.attribute('step', '0.01');
        slider.attribute('value', String(gamma));
        slider.addClass('panel-param-row-slider');
        slider.addClass('panel-param-row-slider--gamma');
        slider.elt.addEventListener('mousedown', e => e.stopPropagation());
        slider.elt.addEventListener('click', e => e.stopPropagation());
        slider.elt.style.setProperty('--fill', gamma);

        const value = createDiv(gamma.toFixed(2));
        value.parent(row);
        value.addClass('panel-param-row-value');

        slider.input(() => {
            const g = parseFloat(slider.value());
            if (state) state.gamma = g;
            value.html(g.toFixed(2));
            slider.elt.style.setProperty('--fill', g);
            if (this.callbacks.onExpectationGammaChange) this.callbacks.onExpectationGammaChange(g);
        });
    }

    // Steps and Utility G render as one section (Utility nests inside Steps, no separate
    // section title) per the design mockup - Total Reward has been removed entirely.
    _renderStepsAndUtility() {
        const simulationState = this.viewModel.simulationState;
        const stats = simulationState.getSimulationStats();
        const gamma = this.discountFactor;
        const rewardHistory = stats.rewardHistory || [];
        const returnValue = rewardHistory.reduce((sum, reward, t) => sum + Math.pow(gamma, t) * reward, 0);
        const simStatElements = {};

        this.createSection('Utility', () => {
            const utilityDiv = createDiv();
            utilityDiv.parent(this.contentContainer);
            utilityDiv.addClass('panel-utility-inline');

            const row = createDiv();
            row.parent(utilityDiv);
            row.addClass('panel-utility-row');

            const formula = createDiv();
            formula.parent(row);
            formula.elt.innerHTML = renderKatex('G = \\sum_t \\gamma^t \\cdot r_t');
            formula.addClass('panel-latex');
            formula.addClass('panel-latex--inline');

            const utilityValue = createDiv();
            utilityValue.parent(row);
            utilityValue.addClass('panel-utility-value');
            utilityValue.html(this._formatAmount(this.simStatDisplay.utility));
            this._applyRewardColor(utilityValue, this.simStatDisplay.utility);
            simStatElements.utility = utilityValue;

            this._renderContributionBar(utilityDiv, rewardHistory, gamma);

            const caption = createDiv('each block = one step’s discounted reward γᵗ·rₜ · red = negative');
            caption.parent(utilityDiv);
            caption.addClass('panel-hint');
            caption.style('margin-top', '5px');

            this._animateSimulationStats({
                steps: stats.stepCount,
                utility: returnValue,
                totalReward: stats.totalReward
            }, simStatElements);
        });
    }

    // Always-visible contribution bar: one colored block per non-zero reward step, block width
    // proportional to the discounted magnitude |gamma^t * r_t| (not the raw reward), opacity
    // fading as gamma^t shrinks, green/red by reward sign. A trailing gray flex block represents
    // the remaining episode tail with no further reward.
    _renderContributionBar(parentDiv, rewardHistory, gamma) {
        // Empty-state text renders as a sibling, not inside the bar - the bar itself is a fixed
        // height:12px/overflow:hidden strip and would clip a normal text line.
        if (rewardHistory.length === 0) {
            const empty = createDiv('No rewards collected');
            empty.parent(parentDiv);
            empty.addClass('panel-empty');
            return;
        }

        const contributionEpsilon = 1e-9;
        const nonZeroContributions = rewardHistory
            .map((reward, t) => ({ reward, t, discounted: Math.pow(gamma, t) * reward }))
            .filter(({ discounted }) => Math.abs(discounted) > contributionEpsilon);

        if (nonZeroContributions.length === 0) {
            const empty = createDiv('No non-zero contributions');
            empty.parent(parentDiv);
            empty.addClass('panel-empty');
            return;
        }

        const bar = createDiv();
        bar.parent(parentDiv);
        bar.addClass('utility-contribution-bar');

        const totalDiscountedMagnitude = nonZeroContributions.reduce((sum, c) => sum + Math.abs(c.discounted), 0) || 1;

        nonZeroContributions.forEach(({ reward, t, discounted }) => {
            const gammaT = Math.pow(gamma, t);
            const blockWidthPct = (Math.abs(discounted) / totalDiscountedMagnitude) * 100;

            const block = createDiv();
            block.parent(bar);
            block.addClass('utility-contribution-block');
            block.style('width', blockWidthPct + '%');
            block.style('background', reward >= 0 ? 'var(--reward-positive)' : 'var(--reward-negative)');
            block.style('opacity', String(Math.max(0.35, gammaT)));
            block.attribute('title',
                `t=${t} · γ${this._toSuperscript(t)}·r${this._toSubscript(t)} = ${discounted >= 0 ? '+' : '−'}${Math.abs(discounted).toFixed(2)}`);
        });

        const remainder = createDiv();
        remainder.parent(bar);
        remainder.addClass('utility-contribution-remainder');
        remainder.attribute('title', `t ≥ ${rewardHistory.length} · no more reward`);
    }

    _toSuperscript(n) {
        const map = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
        return String(n).split('').map(c => map[c] || c).join('');
    }

    _toSubscript(n) {
        const map = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
        return String(n).split('').map(c => map[c] || c).join('');
    }

    // Shared "Policy log" section, appended in all four modes' panels (Build/Policy/Monte Carlo/
    // Iteration) - the log is mode-independent, so this renders identically everywhere it's
    // called from. Hovering a row previews that entry's policy on the graph (via
    // CanvasController.setPolicyPreview - does NOT touch the real, live policy); clicking a row
    // restores it for real (CanvasController.restorePolicyFromLog).
    //
    // policyEvaluationState is read via this.viewModel.policyEvaluationState - NOT a constructor
    // param or a direct rightPanel property. This mirrors valueIterationState's existing wiring
    // (canvasViewModel.valueIterationState = valueIterationState, set post-construction by
    // main.js; consumed here as this.viewModel.valueIterationState) rather than
    // expectationState/expectationViewModel's OTHER existing pattern (set directly as properties
    // on the rightPanel instance itself, e.g. rightPanel.expectationState = expectationState).
    // Both patterns coexist in this file already - policyEvaluationState follows the
    // viewModel-held one since the log is mode-independent, same as valueIterationState's own
    // access path.
    _renderPolicyLog() {
        this.createSection('Policy log', () => {
            const container = createDiv();
            container.parent(this.contentContainer);
            container.addClass('panel-section-content');

            const header = createDiv();
            header.parent(container);
            header.style('display', 'flex');
            header.style('justify-content', 'space-between');
            header.style('align-items', 'baseline');
            header.style('margin-bottom', '6px');

            const clearLink = createSpan('clear');
            clearLink.parent(header);
            clearLink.addClass('panel-link-muted');
            clearLink.mousePressed(() => {
                this.controller.clearPolicyLog();
                this.updateContent();
            });

            const entries = this.viewModel.policyEvaluationState
                ? this.viewModel.policyEvaluationState.entries
                : [];

            if (entries.length === 0) {
                const empty = createDiv('Click Evaluate π to log the current policy\'s exact value.');
                empty.parent(container);
                empty.addClass('panel-hint');
                return;
            }

            entries.forEach(entry => {
                const row = createDiv();
                row.parent(container);
                row.addClass('policy-log-row');

                const label = createDiv();
                label.parent(row);
                label.addClass('policy-log-row-label');
                label.elt.innerHTML = renderKatex(entry.label);

                const tCol = createDiv('—');
                tCol.parent(row);
                tCol.addClass('policy-log-row-t');

                const valueCol = createDiv(entry.valueAtStart.toFixed(2) + (entry.isBest ? ' ★' : ''));
                valueCol.parent(row);
                valueCol.addClass('policy-log-row-value');
                if (entry.isBest) valueCol.addClass('policy-log-row-value--best');

                row.mouseOver(() => {
                    this.controller.setPolicyPreview(entry.policySnapshot, entry.policyWeightsSnapshot);
                    if (typeof redraw === 'function') redraw();
                });
                row.mouseOut(() => {
                    this.controller.clearPolicyPreview();
                    if (typeof redraw === 'function') redraw();
                });
                row.mousePressed(() => {
                    this.controller.restorePolicyFromLog(entry);
                    this.updateContent();
                    if (typeof redraw === 'function') redraw();
                });
            });
        });
    }

    // "Estimate vs exact" comparison table: MC's per-state estimate alongside the active
    // method's value, per state. Rendered once in both Values sub-views, after whichever panel
    // (MC or Method) already rendered above it - comparison lives here (and in the convergence
    // chart) rather than in a split canvas view.
    _renderEstimateVsExact() {
        const modelKnown = this.viewModel.modelKnown;
        const observability = this.viewModel.observability;
        const matrixKey = ValuesMethodMatrix.key(modelKnown, observability);
        const shortLabels = { 'known:full': 'VI', 'unknown:full': 'LI', 'known:partial': 'BI', 'unknown:partial': 'PO-L' };
        const shortLabel = shortLabels[matrixKey];

        this.createSection('Estimate vs exact', () => {
            const headerHint = createDiv(`MC | ${shortLabel}`);
            headerHint.parent(this.contentContainer);
            headerHint.addClass('panel-hint');
            headerHint.style('margin-bottom', '6px');

            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
            const viState = this.viewModel.valueIterationState;
            const expectationState = this.expectationState;

            const mcMeans = (expectationState && expectationState.computed) ? expectationState.getPerStateMeans() : {};
            const finalCol = (viState && viState.initialized) ? viState.totalSweeps - 1 : -1;

            const table = document.createElement('table');
            table.className = 'estimate-vs-exact-table';

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['state', 'MC', shortLabel].forEach(label => {
                const th = document.createElement('th');
                th.textContent = label;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            states.forEach(stateNode => {
                const tr = document.createElement('tr');

                const tdName = document.createElement('td');
                tdName.textContent = stateNode.name;
                tr.appendChild(tdName);

                const tdMC = document.createElement('td');
                const mcVal = mcMeans[stateNode.id];
                tdMC.textContent = (mcVal !== undefined) ? mcVal.toFixed(2) : '—';
                tr.appendChild(tdMC);

                const tdMethod = document.createElement('td');
                if (matrixKey === 'unknown:full') {
                    // Learning Iteration's "method" column is the learned V̂ = max_a Q̂(s,a),
                    // not VI's exact numbers (no Bellman sweep runs in this quadrant).
                    const qls = this.viewModel.qLearningState;
                    const actionIds = stateNode.actions || [];
                    const hasData = qls && actionIds.some(a => qls.getN(stateNode.id, a) > 0);
                    tdMethod.textContent = hasData
                        ? Math.max(...actionIds.map(a => qls.getQ(stateNode.id, a))).toFixed(2)
                        : '—';
                } else if (finalCol >= 0) {
                    const methodVal = observability === 'partial'
                        ? ValuesMethodMatrix.beliefFor(viState, stateNode.id, finalCol).vOfB
                        : (viState.getValues(finalCol)[stateNode.id] ?? 0);
                    tdMethod.textContent = methodVal.toFixed(2);
                } else {
                    tdMethod.textContent = '—';
                }
                tr.appendChild(tdMethod);

                tbody.appendChild(tr);
            });
            table.appendChild(tbody);

            const tableContainer = createDiv();
            tableContainer.parent(this.contentContainer);
            tableContainer.addClass('estimate-vs-exact-scroll');
            tableContainer.elt.appendChild(table);

            // Belief/PO quadrants reuse VI's real numbers under an illustrative label - there is
            // no separate "exact" value for those two quadrants beyond what VI already computes.
            if (observability === 'partial') {
                const hint = createDiv('Belief/PO values are illustrative — reuses the exact Value Iteration numbers under a simplified belief label.');
                hint.parent(this.contentContainer);
                hint.addClass('panel-hint');
                hint.style('margin-top', '6px');
            }
        });
    }

    // Q*(s,a) per sweep. One column per computed sweep k=0..totalSweeps-1 (sweep 0 = the V=0
    // init). Rows come from the real graph so structure is stable even at sweep 0; every
    // computed sweep's values are shown directly (no per-state "reveal" cursor anymore).
    _renderQTable(container, viState, viViewModel, modelKnown = true) {
        const graph = this.viewModel.graph;
        const totalSweeps = viState.totalSweeps;

        const tableEl = document.createElement('table');
        tableEl.className = 'q-table';

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        const thS = document.createElement('th');
        thS.textContent = 's';
        headerRow.appendChild(thS);

        const thA = document.createElement('th');
        thA.textContent = 'a';
        headerRow.appendChild(thA);

        for (let colIdx = 0; colIdx < totalSweeps; colIdx++) {
            const th = document.createElement('th');
            th.textContent = `k=${colIdx}`;
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        tableEl.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        let renderedRows = 0;

        for (const stateId of viState.stateIds) {
            const stateNode = graph ? graph.getNodeById(stateId) : null;
            const actionIds = (stateNode && stateNode.actions) ? stateNode.actions : [];
            if (actionIds.length === 0) continue;

            actionIds.forEach((actionId, ai) => {
                const actionNode = graph.getNodeById(actionId);
                if (!actionNode) return;
                renderedRows++;
                const tr = document.createElement('tr');

                if (ai === 0) {
                    const tdState = document.createElement('td');
                    tdState.textContent = viState.stateNames[stateId] || `S${stateId}`;
                    tdState.rowSpan = actionIds.length;
                    tdState.className = 'q-table-state';
                    tr.appendChild(tdState);
                }

                const tdAction = document.createElement('td');
                tdAction.textContent = actionNode.name;
                tdAction.className = 'q-table-action';
                tr.appendChild(tdAction);

                for (let colIdx = 0; colIdx < totalSweeps; colIdx++) {
                    const td = document.createElement('td');
                    td.className = 'q-table-cell';

                    if (colIdx === 0) {
                        // Sweep 0 = initialization, V=0 everywhere.
                        td.textContent = '0';
                        td.classList.add('q-table-cell--revealed');
                        tr.appendChild(td);
                        continue;
                    }

                    const qVals = viState.getQValues(colIdx, stateId);
                    const qEntry = qVals.find(q => q.actionId === actionId);
                    const computedVal = qEntry ? qEntry.qValue : 0;
                    const val = viState.getEffectiveQValue(stateId, actionId, computedVal);
                    const isBest = viState.getBestAction(colIdx, stateId) === actionId;
                    td.textContent = val.toFixed(2) + (isBest ? ' ★' : '');
                    td.classList.add('q-table-cell--revealed');
                    if (isBest) td.classList.add('q-table-cell--best');

                    if (modelKnown) {
                        td.classList.add('q-table-cell--clickable');
                        const activeExplain = this.viewModel.valueIterationViewModel?.explanationDetail;
                        if (activeExplain &&
                            activeExplain.columnIndex === colIdx &&
                            activeExplain.stateId === stateId &&
                            activeExplain.actionId === actionId) {
                            td.classList.add('q-table-cell--explaining');
                        }
                        td.addEventListener('click', () => {
                            if (this.callbacks.onVICellClick) {
                                this.callbacks.onVICellClick(colIdx, stateId, actionId);
                            }
                        });
                    } else {
                        td.classList.add('q-table-cell--editable');
                        td.addEventListener('click', () => this._startEditingQCell(td, stateId, actionId, val));
                    }

                    tr.appendChild(td);
                }

                tbody.appendChild(tr);
            });
        }

        if (renderedRows === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 2 + totalSweeps;
            td.textContent = 'No available actions';
            td.className = 'q-table-cell q-table-cell--unknown';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        tableEl.appendChild(tbody);
        container.elt.appendChild(tableEl);
    }

    // Editable Q-table (P unknown): click a revealed cell to replace it with a number input;
    // Enter/blur commits via onManualQOverride, Escape reverts without committing.
    _startEditingQCell(td, stateId, actionId, currentValue) {
        if (td.querySelector('input')) return;
        td.textContent = '';

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.value = currentValue.toFixed(2);
        input.className = 'q-table-cell-input';
        td.appendChild(input);
        input.focus();
        input.select();

        let settled = false;
        const commit = () => {
            if (settled) return;
            settled = true;
            const parsed = parseFloat(input.value);
            if (isFinite(parsed) && this.callbacks.onManualQOverride) {
                this.callbacks.onManualQOverride(stateId, actionId, parsed);
            } else {
                this.updateContent();
            }
        };
        const cancel = () => {
            if (settled) return;
            settled = true;
            this.updateContent();
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
    }

    _formatCount(value) {
        return Math.round(value).toString();
    }

    _formatAmount(value) {
        return value.toFixed(2);
    }

    _animateSimulationStats(targets, elements) {
        if (!elements.utility) return;

        const starts = {
            steps: this.simStatDisplay.steps,
            utility: this.simStatDisplay.utility,
            totalReward: this.simStatDisplay.totalReward
        };
        const durationMs = 450;
        const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

        const renderFrame = () => {
            if (elements.steps) elements.steps.html(this._formatCount(this.simStatDisplay.steps));
            elements.utility.html(this._formatAmount(this.simStatDisplay.utility));
            this._applyRewardColor(elements.utility, this.simStatDisplay.utility);
            if (elements.totalReward) {
                elements.totalReward.html(this._formatAmount(this.simStatDisplay.totalReward));
                this._applyRewardColor(elements.totalReward, this.simStatDisplay.totalReward);
            }
        };

        const tick = now => {
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / durationMs);
            const eased = 1 - Math.pow(1 - t, 3);

            this.simStatDisplay.steps = starts.steps + (targets.steps - starts.steps) * eased;
            this.simStatDisplay.utility = starts.utility + (targets.utility - starts.utility) * eased;
            this.simStatDisplay.totalReward = starts.totalReward + (targets.totalReward - starts.totalReward) * eased;

            renderFrame();

            if (t < 1 && typeof requestAnimationFrame === 'function') {
                this.simStatAnimationFrame = requestAnimationFrame(tick);
                return;
            }

            this.simStatDisplay.steps = targets.steps;
            this.simStatDisplay.utility = targets.utility;
            this.simStatDisplay.totalReward = targets.totalReward;
            renderFrame();
            this.simStatAnimationFrame = null;
        };

        if (typeof requestAnimationFrame === 'function') {
            this.simStatAnimationFrame = requestAnimationFrame(tick);
        } else {
            this.simStatDisplay.steps = targets.steps;
            this.simStatDisplay.utility = targets.utility;
            this.simStatDisplay.totalReward = targets.totalReward;
            renderFrame();
        }
    }

    // Method accent hex for colored V(s') sub-terms in the explanation equations.
    _viAccentHex() {
        const entry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);
        const ns = AppPalette[entry.paletteNamespace];
        return (ns && ns.result) || AppPalette.text.medium;
    }

    _buildExplainEquationLines(detail) {
        const s = latexEscapeText(detail.stateName);
        // Sweep numbering: V^k(s) is backed up from the PREVIOUS sweep's V^{k-1}(s').
        const k = detail.timestep;
        const g = detail.gamma;
        const accent = this._viAccentHex();
        const posHex = AppPalette.reward.positive;
        const negHex = AppPalette.reward.negative;
        const vPrev = `\\textcolor{${accent}}{V^{${k - 1}}(s')}`;

        if (detail.stepIndex <= 0) {
            return [{
                type: 'header',
                text: `V^{${k}}(\\text{${s}}) = \\max_a \\sum_{s'} P(s'|s,a)\\bigl[R + ${g}\\,${vPrev}\\bigr]`
            }];
        }

        if (detail.stepIndex === 1) {
            // What is Q? — definition of Q(s,a)
            return [
                { type: 'header', text: `Q(s, a) = \\sum_{s'} P(s'|s,a)\\bigl[R(s,a,s') + ${g}\\,${vPrev}\\bigr]` },
                { type: 'normal', text: `\\text{expected return from taking action } a \\text{ in state } s` }
            ];
        }

        if (detail.stepIndex === 2) {
            const lines = [{
                type: 'header',
                text: `V^{${k}}(\\text{${s}}) = \\max\\{\\, Q(\\text{${s}}, a) \\,\\}`
            }];
            (detail.actions || []).forEach(action => {
                const a = latexEscapeText(action.actionName);
                lines.push({ type: 'normal', text: `Q(\\text{${s}}, \\text{${a}}) = \\;?` });
            });
            return lines;
        }

        if (detail.stepIndex === 3) {
            const clicked = (detail.actions || []).find(ac => ac.actionId === detail.selectedActionId);
            if (!clicked) {
                return [{
                    type: 'header',
                    text: `V^{${k}}(\\text{${s}}) = \\max_a \\sum_{s'} P(s'|s,a)\\bigl[R + ${g}\\,${vPrev}\\bigr]`
                }];
            }
            const a = latexEscapeText(clicked.actionName);
            const lines = [{
                type: 'header',
                text: `Q(\\text{${s}}, \\text{${a}}) = \\sum_{s'} P(s'|s,a)\\bigl[R + ${g}\\,${vPrev}\\bigr]`
            }];
            (clicked.transitions || []).forEach(tr => {
                const termVal = tr.term ?? (tr.probability * (tr.reward + g * (tr.nextValue ?? 0)));
                const rHex = tr.reward >= 0 ? posHex : negHex;
                const rTerm = `\\textcolor{${rHex}}{${tr.reward.toFixed(1)}}`;
                const vTerm = `\\textcolor{${accent}}{${(tr.nextValue ?? 0).toFixed(2)}}`;
                lines.push({
                    type: 'normal',
                    text: `${tr.probability.toFixed(2)} \\cdot [${rTerm} + ${g} \\cdot ${vTerm}] = ${termVal.toFixed(2)}`
                });
            });
            return lines;
        }

        return detail.equationLines || [];
    }

    _renderExplanationPanel(detail) {
        const phaseDescriptions = {
            'Equation':     'The Bellman equation shows how V(s) is computed from the best Q(s,a).',
            'What is Q?':   'Q(s,a) is the expected total return from taking action a in state s, then following the optimal policy. One Q-value per action — the best one becomes V(s).',
            'Actions':      'Each action available from this state fans out as a diamond node.',
            'Transitions':  'Each action leads to successor states with probability p and reward r.',
            'Q-Values':     'Q(s,a) sums the weighted future values across all transitions.',
            'Select Max':   'V(s) = max over all Q(s,a). The best action is highlighted green.',
            'Final Value':  'The new V(s) value is revealed and carried into the next sweep.'
        };

        // Header row
        const headerRow = createDiv();
        headerRow.parent(this.contentContainer);
        headerRow.style('display', 'flex');
        headerRow.style('justify-content', 'space-between');
        headerRow.style('align-items', 'center');
        headerRow.style('padding', '10px 12px 6px');

        const headerText = createDiv(`Explain: ${detail.stateName} at sweep ${detail.timestep}`);
        headerText.parent(headerRow);
        headerText.addClass('panel-title');
        headerText.style('margin', '0');

        const closeBtn = createButton('✕');
        closeBtn.parent(headerRow);
        closeBtn.addClass('panel-btn');
        closeBtn.addClass('panel-btn--close');
        closeBtn.mousePressed(() => {
            if (this.callbacks.onVIExplainClose) this.callbacks.onVIExplainClose();
        });

        // Step counter + nav
        const stepRow = createDiv();
        stepRow.parent(this.contentContainer);
        stepRow.style('display', 'flex');
        stepRow.style('align-items', 'center');
        stepRow.style('gap', '6px');
        stepRow.style('padding', '0 12px 8px');

        const prevBtn = createButton('← Prev');
        prevBtn.parent(stepRow);
        prevBtn.addClass('panel-btn');
        if (detail.stepIndex === 0) prevBtn.attribute('disabled', '');
        prevBtn.mousePressed(() => {
            if (this.callbacks.onVIExplainStep) this.callbacks.onVIExplainStep('prev');
        });

        const stepLabel = createDiv(`Step ${detail.stepIndex + 1} / ${detail.totalSteps}: ${detail.stepLabel}`);
        stepLabel.parent(stepRow);
        stepLabel.addClass('panel-explain-step');
        stepLabel.style('flex', '1');
        stepLabel.style('text-align', 'center');

        const nextBtn = createButton('Next →');
        nextBtn.parent(stepRow);
        nextBtn.addClass('panel-btn');
        if (detail.stepIndex === detail.totalSteps - 1) nextBtn.attribute('disabled', '');
        nextBtn.mousePressed(() => {
            if (this.callbacks.onVIExplainStep) this.callbacks.onVIExplainStep('next');
        });

        // Step-specific equations (developed per phase)
        const eqContainer = createDiv();
        eqContainer.parent(this.contentContainer);
        eqContainer.style('padding', '0 12px 6px');
        this._buildExplainEquationLines(detail).forEach(line => {
            const d = createDiv();
            d.parent(eqContainer);
            d.elt.innerHTML = renderKatex(line.text, true);
            d.addClass('explain-eq-line');
            d.addClass(`explain-eq-line--${line.type}`);
        });

        // Phase description
        const desc = createDiv(phaseDescriptions[detail.stepLabel] || '');
        desc.parent(this.contentContainer);
        desc.addClass('panel-explain-desc');
        desc.style('padding', '0 12px 8px');

        // Clicked action callout
        const clickedAction = detail.actions?.find(a => a.actionId === detail.selectedActionId);
        const clickedActionName = clickedAction?.actionName ?? String(detail.selectedActionId);
        const callout = createDiv(`Clicked: Q(${detail.stateName}, ${clickedActionName})`);
        callout.parent(this.contentContainer);
        callout.style('padding', '4px 12px 8px');
        callout.style('font-size', '12px');
        callout.style('color', 'var(--color-primary)');
        callout.style('font-weight', '600');

        // Action Q-value table (steps >= 4, i.e. Q-Values and beyond)
        if (detail.stepIndex >= 4 && detail.actions && detail.actions.length > 0) {
            const tableContainer = createDiv();
            tableContainer.parent(this.contentContainer);
            tableContainer.style('padding', '0 12px 8px');

            const tableEl = document.createElement('table');
            tableEl.className = 'q-table';
            tableEl.style.width = '100%';

            const thead = document.createElement('thead');
            const headerRow2 = document.createElement('tr');
            ['Action', 'Q(s,a)', ''].forEach(h => {
                const th = document.createElement('th');
                th.textContent = h;
                headerRow2.appendChild(th);
            });
            thead.appendChild(headerRow2);
            tableEl.appendChild(thead);

            const tbody = document.createElement('tbody');
            detail.actions.forEach(action => {
                const tr = document.createElement('tr');
                const isClicked = action.actionId === detail.selectedActionId;
                const isBest = action.actionId === detail.bestActionId;
                if (isClicked) tr.classList.add('panel-explain-action--clicked');

                const tdName = document.createElement('td');
                tdName.textContent = action.actionName;
                tdName.className = 'q-table-action';
                tr.appendChild(tdName);

                const tdQ = document.createElement('td');
                tdQ.textContent = action.qValue != null
                    ? action.qValue.toFixed(2) + (isBest ? ' ★' : '')
                    : '—';
                tdQ.className = 'q-table-cell q-table-cell--revealed';
                if (isBest) tdQ.classList.add('q-table-cell--best');
                tr.appendChild(tdQ);

                const tdMarker = document.createElement('td');
                tdMarker.style.fontSize = '11px';
                const markers = [];
                if (isClicked) markers.push('Clicked');
                if (isBest) markers.push('Best');
                tdMarker.textContent = markers.join(' / ');
                tr.appendChild(tdMarker);

                tbody.appendChild(tr);
            });
            tableEl.appendChild(tbody);
            tableContainer.elt.appendChild(tableEl);
        }

        // Result line (steps >= 5, i.e. Select Max and Final Value)
        if (detail.stepIndex >= 5 && detail.value != null) {
            const resultLine = createDiv(`V<sup>${detail.timestep}</sup>(${detail.stateName}) = ${detail.value.toFixed(2)}`);
            resultLine.parent(this.contentContainer);
            resultLine.style('padding', '4px 12px 8px');
            resultLine.style('font-size', '13px');
            resultLine.style('font-weight', '700');
            resultLine.style('color', 'var(--color-success)');
        }
    }

    _applyRewardColor(element, reward) {
        if (reward > 0) element.style('color', 'var(--reward-positive)');
        else if (reward < 0) element.style('color', 'var(--reward-negative)');
        else element.style('color', 'var(--reward-zero)');
    }

    createSection(title, contentCallback, opts = {}) {
        const sectionTitle = createDiv(title);
        sectionTitle.parent(this.contentContainer);
        sectionTitle.addClass('panel-section-title');
        // Optional scoped accent (e.g. Policy π's teal header) added alongside, not instead of,
        // the shared .panel-section-title rule - keeps this a per-call-site override rather than
        // a global header color change.
        if (opts.titleClass) sectionTitle.addClass(opts.titleClass);

        contentCallback();
    }

    _setupResizeHandle() {
        const PANEL_MIN = 200;
        const PANEL_MAX = 500;
        const PANEL_DEFAULT = 272;

        const handle = document.createElement('div');
        handle.className = 'panel-resize-handle';
        this.panelElement.elt.insertBefore(handle, this.panelElement.elt.firstChild);

        handle.addEventListener('dblclick', () => {
            this._setPanelWidth(PANEL_DEFAULT);
        });

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            handle.classList.add('panel-resize-handle--dragging');

            const onMove = (e) => {
                const maxWidth = Math.min(PANEL_MAX, Math.max(PANEL_MIN, window.innerWidth - 200));
                const newWidth = Math.min(maxWidth, Math.max(PANEL_MIN, window.innerWidth - e.clientX));
                this._setPanelWidth(newWidth);
            };
            const onUp = () => {
                handle.classList.remove('panel-resize-handle--dragging');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    _setPanelWidth(newWidth) {
        this.width = newWidth;
        const y = this.panelElement.position().y;
        this.panelElement.position(windowWidth - newWidth, y);
        this.panelElement.size(newWidth, this.panelElement.elt.offsetHeight);
        if (this.onPanelResize) this.onPanelResize(newWidth);
    }

    updateWidth(newWindowWidth) {
        if (this.panelElement) {
            this.panelElement.position(newWindowWidth - this.width, this.panelElement.position().y);
        }
    }

    updateHeight(newWindowHeight, topOffset) {
        if (this.panelElement) {
            this.panelElement.size(this.width, newWindowHeight - topOffset);
        }
    }

    getWidth() {
        return this.width;
    }

    renderExpectationPanel() {
        const state = this.expectationState;
        const startNode = this.viewModel.startNode;

        // Matches Build/Policy's "Parameters" section exactly (same row layout, same slider
        // styling) - but γ here is expectationState.gamma, MC's own distinct discount factor,
        // not the shared this.discountFactor used by Build/Simulate/Value Iteration.
        this.createSection('Parameters', () => {
            const container = createDiv();
            container.parent(this.contentContainer);
            container.addClass('panel-section-content');

            this._renderExpectationGammaSlider(container);
        });

        this.renderInitialStateSection();

        if (!state || !state.computed || !startNode) {
            const msg = createDiv('Set an Initial State above to compute rollouts.');
            msg.parent(this.contentContainer);
            msg.addClass('panel-hint');
            msg.style('margin-top', '8px');
            this._renderPolicyLog();
            return;
        }

        this.createSection('Policy', () => {
            const container = createDiv();
            container.parent(this.contentContainer);
            container.addClass('panel-section-content');

            const policy = this.viewModel.simulationState ? this.viewModel.simulationState.policy : {};
            const graph = this.viewModel.graph;
            let detCount = 0, randomCount = 0;
            for (const node of graph.nodes) {
                if (node.type !== 'state' || !node.actions || node.actions.length === 0) continue;
                if (policy[node.id] !== undefined && policy[node.id] !== null) { detCount++; }
                else { randomCount++; }
            }
            let summaryText = detCount === 0
                ? 'all Random'
                : `${detCount} det. action(s), ${randomCount} Random`;
            const staleCount = state.policyFallbacks ? state.policyFallbacks.length : 0;
            if (staleCount > 0) summaryText += ` (⚠ ${staleCount} stale)`;

            const summaryDiv = createDiv(summaryText);
            summaryDiv.parent(container);
            summaryDiv.style('font-size', '11px');
            summaryDiv.style('color', AppPalette.text.secondary);

            const hintDiv = createDiv('To change π, switch to Build mode.');
            hintDiv.parent(container);
            hintDiv.style('font-size', '10px');
            hintDiv.style('color', AppPalette.text.muted);
            hintDiv.style('margin-top', '2px');
        });

        // Estimate/Episodes/Selected Run all depend on expectationState.currentT and
        // expectationViewModel.focusedRunIndex, both of which change on every scrubber tick/play
        // frame/focus toggle - isolated into their own container so updateExpectationData() can
        // rebuild just this subtree (see below) instead of the whole panel.
        this._mcStatsContainer = createDiv();
        this._mcStatsContainer.parent(this.contentContainer);
        this._renderMcStatsSections();

        this._renderPolicyLog();
    }

    // Small createSection()-equivalent that parents into an explicit container rather than
    // always this.contentContainer, so the MC stats subtree (below) can be rebuilt on its own.
    _createSectionInto(parent, title, contentCallback) {
        const sectionTitle = createDiv(title);
        sectionTitle.parent(parent);
        sectionTitle.addClass('panel-section-title');
        contentCallback(parent);
    }

    // Rebuilds the Estimate/Episodes/Selected Run sections into this._mcStatsContainer. Safe to
    // call repeatedly (e.g. from updateExpectationData()) - clears its own subtree first, never
    // touches Parameters/Policy above it or the sliders they contain.
    _renderMcStatsSections() {
        if (!this._mcStatsContainer) return;
        const state = this.expectationState;
        if (!state || !state.computed) return;

        this._mcStatsContainer.html('');
        const t = state.currentT;

        this._renderEstimateSection(this._mcStatsContainer, state, t);
        this._renderEpisodesSection(this._mcStatsContainer, state, t);
        this._renderSelectedRunSection(this._mcStatsContainer, state, t);
    }

    // Big always-orange V̂(S0) estimate (mean discounted return across ALL rollouts, not
    // just the displayed slice - see ExpectationState.getMeanAtT/getSEAtT) with a SE subtitle.
    // Uses a dedicated .panel-estimate-value class rather than .panel-utility-value since this
    // number is never sign-colored (it's an estimate, not a live positive/negative reward).
    _renderEstimateSection(parent, state, t) {
        this._createSectionInto(parent, 'Estimate', (sectionParent) => {
            const container = createDiv();
            container.parent(sectionParent);
            container.addClass('panel-section-content');

            const mean = state.getMeanAtT(t);
            const se = state.getSEAtT(t);

            const valueDiv = createDiv(`V̂(S₀) = ${mean !== null ? mean.toFixed(2) : '—'}`);
            valueDiv.parent(container);
            valueDiv.addClass('panel-estimate-value');

            const subtitle = createDiv(
                `mean of ${state.rollouts.length} returns · SE ± ${se !== null ? se.toFixed(2) : '—'}`);
            subtitle.parent(container);
            subtitle.addClass('panel-hint');
            subtitle.style('margin-top', '2px');
        });
    }

    // Win/loss counts (over the currently DISPLAYED slice, matching what's on screen in the
    // mini-panel grid - see ExpectationState.getEpisodeStatsAtT) plus the observed return range.
    _renderEpisodesSection(parent, state, t) {
        this._createSectionInto(parent, 'Episodes', (sectionParent) => {
            const container = createDiv();
            container.parent(sectionParent);
            container.addClass('panel-section-content');

            const stats = state.getEpisodeStatsAtT(t);

            const countsDiv = createDiv();
            countsDiv.parent(container);
            countsDiv.addClass('panel-stat-value');

            const posSpan = document.createElement('span');
            posSpan.textContent = `${stats.posCount} ✓`;
            posSpan.style.color = 'var(--reward-positive)';
            countsDiv.elt.appendChild(posSpan);

            const sepSpan = document.createElement('span');
            sepSpan.textContent = ' / ';
            countsDiv.elt.appendChild(sepSpan);

            const negSpan = document.createElement('span');
            negSpan.textContent = `${stats.negCount} ✗`;
            negSpan.style.color = 'var(--reward-negative)';
            countsDiv.elt.appendChild(negSpan);

            const rangeDiv = createDiv(
                `G ∈ [${stats.min !== null ? stats.min.toFixed(2) : '—'}, ${stats.max !== null ? stats.max.toFixed(2) : '—'}]`);
            rangeDiv.parent(container);
            rangeDiv.addClass('panel-hint');
            rangeDiv.style('margin-top', '4px');
        });
    }

    // Only rendered while a mini-panel card is focused (expectationViewModel.focusedRunIndex !==
    // null) - disappears entirely (no section title, no empty placeholder) once the user exits
    // focus mode back to the full grid.
    _renderSelectedRunSection(parent, state, t) {
        const vm = this.expectationViewModel;
        if (!vm || vm.focusedRunIndex === null || vm.focusedRunIndex === undefined) return;

        const focusedIdx = vm.focusedRunIndex;
        const rollout = state.getDisplaySlice()[focusedIdx];
        if (!rollout) return;

        this._createSectionInto(parent, 'Selected Run', (sectionParent) => {
            const container = createDiv();
            container.parent(sectionParent);
            container.addClass('panel-section-content');

            const header = createDiv(`Run ${String(focusedIdx + 1).padStart(2, '0')}`);
            header.parent(container);
            header.addClass('panel-stat-value');

            const graph = this.viewModel.graph;
            const trajectory = RolloutFormatter.formatTrajectory(graph, rollout, t);
            const trajDiv = createDiv(trajectory || 'No steps taken yet.');
            trajDiv.parent(container);
            trajDiv.addClass('panel-hint');
            trajDiv.style('margin-top', '4px');
            trajDiv.style('word-break', 'break-word');

            const effectiveT = Math.floor(Math.min(t, rollout.numSteps));
            const utility = state._getUtility(rollout, t);
            const totalReward = rollout.rewards.slice(0, effectiveT).reduce((a, b) => a + b, 0);

            const gRow = createDiv();
            gRow.parent(container);
            gRow.addClass('panel-utility-row');
            gRow.style('margin-top', '8px');

            const gLabel = createDiv('G');
            gLabel.parent(gRow);
            gLabel.addClass('panel-latex--inline');

            const gValue = createDiv(utility.toFixed(2));
            gValue.parent(gRow);
            gValue.addClass('panel-utility-value');
            this._applyRewardColor(gValue, utility);

            const totalRewardDiv = createDiv(`Total reward: ${totalReward.toFixed(2)}`);
            totalRewardDiv.parent(container);
            totalRewardDiv.addClass('panel-hint');
            totalRewardDiv.style('margin-top', '4px');
        });
    }

    // Per-tick refresh hook called by ExpectationView (scrubber move, play tick, focus toggle).
    // Re-renders ONLY the Estimate/Episodes/Selected Run subtree (this._mcStatsContainer) - a
    // full updateContent() rebuild would tear down and recreate the Parameters gamma/max-steps
    // sliders on this same ~250ms cadence, causing visible flicker and interrupting any
    // in-progress drag on those controls. No-ops if the MC panel isn't currently rendered
    // (this._mcStatsContainer is null, e.g. while another mode/sub-view is showing).
    updateExpectationData() {
        this._renderMcStatsSections();
    }

    show() {
        if (this.panelElement) {
            this.panelElement.show();
        }
    }

    hide() {
        if (this.panelElement) {
            this.panelElement.hide();
        }
    }
}
