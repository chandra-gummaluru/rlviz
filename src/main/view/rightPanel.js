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
    // spec. Steps is no longer shown as its own big number (see _renderStepsAndUtility) - the t
    // progress bar below already shows how far into the episode the simulation is.
    renderBuildPanel() {
        this.createSection('Parameters', () => {
            const paramsDiv = createDiv();
            paramsDiv.parent(this.contentContainer);
            paramsDiv.addClass('panel-section-content');
            this._renderGammaSlider(paramsDiv);
            this._renderTProgressBar(paramsDiv);
        });

        this.renderInitialStateSection();
        this._renderStepsAndUtility();
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
            this._renderTProgressBar(paramsDiv);
        });

        this.renderInitialStateSection();
        this._renderPolicyModeSection();
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
        });
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

        const refreshReadouts = () => {
            const currentWeights = simulationState.getPolicyWeights(stateNode.id) || {};
            const sum = actions.reduce((s, id) => s + (currentWeights[id] ?? 0), 0);
            readouts.forEach(({ actionId, valueDisplay }) => {
                const w = currentWeights[actionId] ?? 0;
                const pct = sum > 0 ? w / sum : 1 / actions.length;
                valueDisplay.html(`π = ${pct.toFixed(2)}`);
            });
        };

        actions.forEach(actionId => {
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
            readouts.push({ actionId, valueDisplay });

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
            eqDiv.elt.innerHTML = renderKatex('V_t(s) = \\max_a \\sum_{s\'} P(s\'|s,a)[R + \\gamma V_{t+1}(s\')]', true);
        } else if (matrixKey === 'unknown:full') {
            eqDiv.html('P is unknown, so the true action values can\'t be computed. Manually estimate them below.');
        } else if (matrixKey === 'known:partial') {
            eqDiv.elt.innerHTML = renderKatex('V(b) = \\max_a \\sum_{s\'} P(s\'|s,a)[R + \\gamma V(b\')]', true);
        } else {
            eqDiv.elt.innerHTML = renderKatex('Q(b,a) \\leftarrow Q + \\alpha[r + \\gamma \\max_{a\'} Q(b\',a\') - Q]', true);
        }

        // Parameters
        const paramsDiv = createDiv();
        paramsDiv.parent(this.contentContainer);
        paramsDiv.addClass('panel-section-content');
        paramsDiv.style('margin-top', '10px');

        if (viState && viState.initialized) {
            const tLine = createDiv(`<strong>Horizon (T):</strong> ${viState.T}`);
            tLine.parent(paramsDiv);
            tLine.style('margin-bottom', '4px');

            const progressLine = createDiv(`<strong>Column:</strong> ${viState.currentColumnIndex + 1} / ${viState.totalColumns}`);
            progressLine.parent(paramsDiv);
            progressLine.style('margin-bottom', '4px');
        }

        // Convergence - the "converged" check is real (viState.lastDelta, computed once at the
        // end of the real backward-induction backup); the sweep/episode/vector framing per
        // quadrant is illustrative for LI/BI/PO-L, same precedent as Learning Iteration's
        // existing "no real algorithm" framing.
        if (viState && viState.initialized) {
            this.createSection('Convergence', () => {
                const convDiv = createDiv();
                convDiv.parent(this.contentContainer);
                convDiv.addClass('panel-section-content');

                const perQuadrant = {
                    'known:full':      `T = ${viState.T} sweeps`,
                    'unknown:full':    'α = 0.1 · 40 episodes',
                    'known:partial':   `${viState.T + 1} α-vectors · horizon ${viState.T}`,
                    'unknown:partial': 'α = 0.1 · belief memory'
                };
                const line1 = createDiv(perQuadrant[matrixKey]);
                line1.parent(convDiv);
                line1.style('margin-bottom', '4px');

                const convergedLine = viState.lastDelta < 0.01
                    ? '✓ converged Δ < 0.01'
                    : `Δ = ${viState.lastDelta.toFixed(4)}`;
                const line2 = createDiv(convergedLine);
                line2.parent(convDiv);
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

    // Build mode's read-only "t" progress bar - fills as the running simulation's step count
    // increases (v1: no scrub-to-any-step control, matching γ's row layout). A plain div bar,
    // not a styled <input type=range>: Chrome drops the accent-color fill entirely on disabled
    // range inputs (renders as a flat, valueless gray capsule regardless of position), so a div
    // is the only reliable way to show real progress here. A nominal max of 20 (matching the
    // design mockup's t range) sets the bar's fill scale; the numeric readout still shows the
    // real step count past that point even though the bar itself clamps at 100%.
    _renderTProgressBar(parentDiv) {
        const T_BAR_MAX = 20;
        const stepCount = this.viewModel.simulationState.getSimulationStats().stepCount;
        const pct = Math.max(0, Math.min(100, (stepCount / T_BAR_MAX) * 100));

        const row = createDiv();
        row.parent(parentDiv);
        row.addClass('panel-param-row');

        const label = createDiv('t');
        label.parent(row);
        label.addClass('panel-param-row-label');

        const track = createDiv();
        track.parent(row);
        track.addClass('panel-t-progress-track');

        const fill = createDiv();
        fill.parent(track);
        fill.addClass('panel-t-progress-fill');
        fill.style('width', pct + '%');

        const value = createDiv(String(stepCount));
        value.parent(row);
        value.addClass('panel-param-row-value');
        value.addClass('panel-param-row-value--time');
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

    // Max Steps as an interactive bar (was a plain number input) - same row layout as the
    // gamma/t sliders. Range mirrors the old input's bounds (1-1000).
    _renderExpectationMaxStepsBar(parentDiv) {
        const state = this.expectationState;
        const maxSteps = state ? state.maxSteps : 100;

        const row = createDiv();
        row.parent(parentDiv);
        row.addClass('panel-param-row');

        const label = createDiv('steps');
        label.parent(row);
        label.addClass('panel-param-row-label');

        const slider = createElement('input');
        slider.parent(row);
        slider.attribute('type', 'range');
        slider.attribute('min', '1');
        slider.attribute('max', '100');
        slider.attribute('step', '1');
        slider.attribute('value', String(maxSteps));
        slider.addClass('panel-param-row-slider');
        slider.elt.addEventListener('mousedown', e => e.stopPropagation());
        slider.elt.addEventListener('click', e => e.stopPropagation());
        slider.elt.style.setProperty('--fill', (maxSteps - 1) / 99);

        const value = createDiv(String(maxSteps));
        value.parent(row);
        value.addClass('panel-param-row-value');
        value.addClass('panel-param-row-value--time');

        slider.input(() => {
            const steps = parseInt(slider.value(), 10);
            if (state) state.maxSteps = steps;
            value.html(String(steps));
            slider.elt.style.setProperty('--fill', (steps - 1) / 99);
            if (this.callbacks.onExpectationMaxStepsChange) this.callbacks.onExpectationMaxStepsChange(steps);
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
            const finalCol = (viState && viState.initialized) ? viState.totalColumns - 1 : -1;

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
                if (finalCol >= 0) {
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

    _renderQTable(container, viState, viViewModel, modelKnown = true) {
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

        for (let colIdx = 0; colIdx < viState.totalColumns; colIdx++) {
            const th = document.createElement('th');
            th.textContent = `t=${viState.getTimestep(colIdx)}`;
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        tableEl.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        let renderedRows = 0;

        for (const stateId of viState.stateIds) {
            // colIdx=1 is first non-terminal; T>=1 enforced by toolbar
            const actionQs = viState.getQValues(1, stateId);
            if (actionQs.length === 0) continue;

            actionQs.forEach((aq, ai) => {
                renderedRows++;
                const tr = document.createElement('tr');

                if (ai === 0) {
                    const tdState = document.createElement('td');
                    tdState.textContent = viState.stateNames[stateId] || `S${stateId}`;
                    tdState.rowSpan = actionQs.length;
                    tdState.className = 'q-table-state';
                    tr.appendChild(tdState);
                }

                const tdAction = document.createElement('td');
                tdAction.textContent = aq.actionName;
                tdAction.className = 'q-table-action';
                tr.appendChild(tdAction);

                for (let colIdx = 0; colIdx < viState.totalColumns; colIdx++) {
                    const td = document.createElement('td');
                    td.className = 'q-table-cell';

                    if (colIdx === 0) {
                        td.textContent = '0';
                        td.classList.add('q-table-cell--revealed');
                    } else if (viViewModel.isQValueRevealed(colIdx, stateId, aq.actionId)) {
                        const qVals = viState.getQValues(colIdx, stateId);
                        const qEntry = qVals.find(q => q.actionId === aq.actionId);
                        const computedVal = qEntry ? qEntry.qValue : 0;
                        const val = viState.getEffectiveQValue(stateId, aq.actionId, computedVal);
                        td.textContent = val.toFixed(2);
                        td.classList.add('q-table-cell--revealed');
                        if (viState.bestActions[colIdx] &&
                            viState.bestActions[colIdx][stateId] === aq.actionId) {
                            td.classList.add('q-table-cell--best');
                        }
                        if (modelKnown) {
                            td.classList.add('q-table-cell--clickable');
                            const activeExplain = this.viewModel.valueIterationViewModel?.explanationDetail;
                            if (activeExplain &&
                                activeExplain.columnIndex === colIdx &&
                                activeExplain.stateId === stateId &&
                                activeExplain.actionId === aq.actionId) {
                                td.classList.add('q-table-cell--explaining');
                            }
                            td.addEventListener('click', () => {
                                if (this.callbacks.onVICellClick) {
                                    this.callbacks.onVICellClick(colIdx, stateId, aq.actionId);
                                }
                            });
                        } else {
                            td.classList.add('q-table-cell--editable');
                            td.addEventListener('click', () => this._startEditingQCell(td, stateId, aq.actionId, val));
                        }
                    } else {
                        td.textContent = '?';
                        td.classList.add('q-table-cell--unknown');
                    }

                    tr.appendChild(td);
                }

                tbody.appendChild(tr);
            });
        }

        if (renderedRows === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 2 + viState.totalColumns;
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

    _buildExplainEquationLines(detail) {
        const s = latexEscapeText(detail.stateName);
        const t = detail.timestep;
        const g = detail.gamma;

        if (detail.stepIndex <= 0) {
            return [{
                type: 'header',
                text: `V_{${t}}(\\text{${s}}) = \\max_a \\sum_{s'} P(s'|s,a)\\bigl[R + ${g}\\,V_{${t + 1}}(s')\\bigr]`
            }];
        }

        if (detail.stepIndex === 1) {
            // What is Q? — definition of Q(s,a)
            return [
                { type: 'header', text: `Q(s, a) = \\sum_{s'} P(s'|s,a)\\bigl[R(s,a,s') + ${g}\\,V_{${t + 1}}(s')\\bigr]` },
                { type: 'normal', text: `\\text{expected return from taking action } a \\text{ in state } s` }
            ];
        }

        if (detail.stepIndex === 2) {
            const lines = [{
                type: 'header',
                text: `V_{${t}}(\\text{${s}}) = \\max\\{\\, Q(\\text{${s}}, a) \\,\\}`
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
                    text: `V_{${t}}(\\text{${s}}) = \\max_a \\sum_{s'} P(s'|s,a)\\bigl[R + ${g}\\,V_{${t + 1}}(s')\\bigr]`
                }];
            }
            const a = latexEscapeText(clicked.actionName);
            const lines = [{
                type: 'header',
                text: `Q(\\text{${s}}, \\text{${a}}) = \\sum_{s'} P(s'|s,a)\\bigl[R + ${g}\\,V_{${t + 1}}(s')\\bigr]`
            }];
            (clicked.transitions || []).forEach(tr => {
                const termVal = tr.term ?? (tr.probability * (tr.reward + g * (tr.nextValue ?? 0)));
                lines.push({
                    type: 'normal',
                    text: `${tr.probability.toFixed(2)} \\cdot [${tr.reward.toFixed(1)} + ${g} \\cdot ${(tr.nextValue ?? 0).toFixed(2)}] = ${termVal.toFixed(2)}`
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
            'Final Value':  'The final V(s) value is revealed and stored for earlier timesteps.'
        };

        // Header row
        const headerRow = createDiv();
        headerRow.parent(this.contentContainer);
        headerRow.style('display', 'flex');
        headerRow.style('justify-content', 'space-between');
        headerRow.style('align-items', 'center');
        headerRow.style('padding', '10px 12px 6px');

        const headerText = createDiv(`Explain: ${detail.stateName} at t=${detail.timestep}`);
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
                tdQ.textContent = action.qValue != null ? action.qValue.toFixed(2) : '—';
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
            const resultLine = createDiv(`V<sub>${detail.timestep}</sub>(${detail.stateName}) = ${detail.value.toFixed(2)}`);
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

    createSection(title, contentCallback) {
        const sectionTitle = createDiv(title);
        sectionTitle.parent(this.contentContainer);
        sectionTitle.addClass('panel-section-title');

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
            this._renderExpectationMaxStepsBar(container);
        });

        this.renderInitialStateSection();

        if (!state || !state.computed || !startNode) {
            const msg = createDiv('Set an Initial State above to compute rollouts.');
            msg.parent(this.contentContainer);
            msg.addClass('panel-hint');
            msg.style('margin-top', '8px');
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

    }

    // Per-tick refresh hook called by ExpectationView (scrubber move, play tick, focus toggle).
    // The MC right-panel content (gamma/display-runs/max-steps/policy) doesn't depend on
    // currentT or the focused run, so there's nothing to refresh here - the bottom chart dock
    // (Convergence/Histogram/Q-table/MC-tree) is what live-updates on those events instead.
    updateExpectationData() {}

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
