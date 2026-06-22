// --- File-local constants ---
const RP_SET_CHAR_LIMIT      = 22;     // max combined plain-text chars before truncation
const RP_DEFAULT_DISCOUNT    = 0.9;
const RP_REWARD_SLIDER_MIN   = -100;
const RP_REWARD_SLIDER_MAX   = 100;
const RP_PROB_SLIDER_STEP    = 0.01;
const RP_VI_TABLE_MAX_H      = 400;    // px max height of the V(s) table
const RP_REWARD_BAR_MAX      = 100;    // reward clamped to ±this for bar width
const RP_REWARD_BAR_HALF_PCT = 50;     // percent representing one full half of bar
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
        this.width = 300;
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
            onVICellClick: null,       // (colIdx, stateId, actionId) => void
            onVIExplainClose: null,    // () => void
            onVIExplainStep: null,     // ('prev' | 'next') => void
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
        const hoveredNode  = this.viewModel.interaction.hoveredNode;
        const hoveredEdge  = this.viewModel.interaction.hoveredEdge;
        const isSimulateMode = this.viewModel.interaction.mode === 'simulate';
        const isVIMode = this.viewModel.interaction.mode === 'value_iteration';

        if (isVIMode) {
            this.renderValueIterationPanel();
        } else if (selectedNode) {
            this.renderNodePanel(selectedNode, { readOnly: false });
        } else if (selectedEdge) {
            this.renderEdgePanel(selectedEdge);
        } else if (hoveredNode) {
            this.renderNodePanel(hoveredNode, { readOnly: true });
        } else if (hoveredEdge) {
            this.renderEdgePanel(hoveredEdge);
        } else if (isSimulateMode) {
            this.renderSimulationPanel();
        } else {
            this.renderMDPInfoPanel();
        }

    }

    renderMDPInfoPanel() {
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
                if (typeof redraw === 'function') redraw();
            });
        });

        // Policy (π) Section
        this.createSection('Policy', () => {
            const policyDiv = createDiv();
            policyDiv.parent(this.contentContainer);

            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
            if (states.length === 0) {
                const empty = createDiv('No states available');
                empty.parent(policyDiv);
                empty.addClass('panel-empty');
                return;
            }

            const note = createDiv('Select π(s). Random chooses uniformly among available actions.');
            note.parent(policyDiv);
            note.addClass('panel-hint');
            note.style('margin-bottom', '8px');

            const simulationState = this.viewModel.simulationState;

            states.forEach(stateNode => {
                const row = createDiv();
                row.parent(policyDiv);
                row.style('display', 'grid');
                row.style('grid-template-columns', 'minmax(0, 1fr) minmax(110px, 1.2fr)');
                row.style('gap', '8px');
                row.style('align-items', 'center');
                row.style('margin-bottom', '8px');

                const label = createDiv(`π(${stateNode.name})`);
                label.parent(row);
                label.style('font-size', '12px');
                label.style('font-weight', '600');
                label.style('color', '#444');

                const select = createSelect();
                select.parent(row);
                select.addClass('panel-input');
                select.option('Random', '');

                (stateNode.actions || []).forEach(actionId => {
                    const actionNode = this.viewModel.graph.nodes.find(n => n.type === 'action' && n.id === actionId);
                    if (actionNode) {
                        select.option(actionNode.name, String(actionId));
                    }
                });

                const selectedAction = simulationState.getPolicyAction(stateNode.id);
                select.selected(selectedAction === null ? '' : String(selectedAction));
                select.changed(() => {
                    const selectedValue = select.value();
                    simulationState.setPolicyAction(stateNode.id, selectedValue === '' ? null : Number(selectedValue));
                });
            });
        });

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
                this._renderQTable(qTableContainer, viState, viViewModel);
            }
            return;
        }

        // Title
        const title = createDiv('Value Iteration');
        title.parent(this.contentContainer);
        title.addClass('panel-title');

        // Bellman equation
        const eqDiv = createDiv();
        eqDiv.parent(this.contentContainer);
        eqDiv.addClass('panel-section-content');
        eqDiv.elt.innerHTML = renderKatex('V_t(s) = \\max_a \\sum_{s\'} P(s\'|s,a)[R + \\gamma V_{t+1}(s\')]', true);

        // Parameters
        const paramsDiv = createDiv();
        paramsDiv.parent(this.contentContainer);
        paramsDiv.addClass('panel-section-content');
        paramsDiv.style('margin-top', '10px');

        const gammaLine = createDiv();
        gammaLine.elt.innerHTML = `<strong>Discount (${renderKatex('\\gamma', false)}):</strong> ${this.discountFactor}`;
        gammaLine.parent(paramsDiv);
        gammaLine.style('margin-bottom', '4px');
        if (viState && viState.initialized) {
            const tLine = createDiv(`<strong>Horizon (T):</strong> ${viState.T}`);
            tLine.parent(paramsDiv);
            tLine.style('margin-bottom', '4px');

            const progressLine = createDiv(`<strong>Column:</strong> ${viState.currentColumnIndex + 1} / ${viState.totalColumns}`);
            progressLine.parent(paramsDiv);
            progressLine.style('margin-bottom', '4px');
        }

        // Q*(s,a;t) table
        if (viState && viState.initialized && viViewModel) {
            const tableTitle = createDiv('Action Values');
            tableTitle.parent(this.contentContainer);
            tableTitle.addClass('panel-section-title');
            tableTitle.style('margin-top', '15px');

            const qTableContainer = createDiv();
            qTableContainer.parent(this.contentContainer);
            qTableContainer.addClass('q-table-scroll');
            this._renderQTable(qTableContainer, viState, viViewModel);
        } else if (viState && !viState.initialized) {
            const hint = createDiv('Press Play, Step, or Skip to compute Q-values.');
            hint.parent(this.contentContainer);
            hint.addClass('panel-hint');
            hint.style('margin-top', '10px');
        }

    }

    renderSimulationPanel() {
        const simulationState = this.viewModel.simulationState;
        const stats = simulationState.getSimulationStats();
        const gamma = this.discountFactor;
        const rewardHistory = stats.rewardHistory || [];
        const returnValue = rewardHistory.reduce((sum, reward, t) => sum + Math.pow(gamma, t) * reward, 0);
        const simStatElements = {};

        // Steps
        this.createSection('Steps', () => {
            const stepsDiv = createDiv();
            stepsDiv.parent(this.contentContainer);
            const stepsValue = createDiv();
            stepsValue.parent(stepsDiv);
            stepsValue.addClass('panel-stat-value--large-primary');
            stepsValue.html(this._formatCount(this.simStatDisplay.steps));
            simStatElements.steps = stepsValue;
        });

        // Discount Factor (γ) Section
        this.createSection('Discount Factor', () => {
            const gammaContainer = createDiv();
            gammaContainer.parent(this.contentContainer);
            gammaContainer.addClass('panel-section-content');

            const inputContainer = createDiv();
            inputContainer.parent(gammaContainer);
            inputContainer.addClass('panel-flex-row');

            const input = createInput(this.discountFactor.toString());
            input.parent(inputContainer);
            input.addClass('panel-input');
            input.addClass('panel-input--small');
            input.attribute('type', 'number');
            input.attribute('step', '0.01');
            input.attribute('min', '0');
            input.attribute('max', '1');

            input.input(() => {
                const value = parseFloat(input.value());
                if (!isNaN(value) && value >= 0 && value <= 1) {
                    this.discountFactor = value;
                }
            });

            const desc = createDiv('Range: 0.0 - 1.0');
            desc.parent(gammaContainer);
            desc.addClass('panel-hint');
        });

        // Discounted return
        this.createSection('Utility', () => {
            const utilityDiv = createDiv();
            utilityDiv.parent(this.contentContainer);

            const formula = createDiv();
            formula.parent(utilityDiv);
            formula.elt.innerHTML = renderKatex('G = \\sum_{t=0}^{T-1} \\gamma^t r_t', true);
            formula.addClass('panel-latex');

            const utilityValue = createDiv();
            utilityValue.parent(utilityDiv);
            utilityValue.addClass('panel-stat-value--large');
            utilityValue.html(this._formatAmount(this.simStatDisplay.utility));
            this._applyRewardColor(utilityValue, this.simStatDisplay.utility);
            simStatElements.utility = utilityValue;

            const timeline = createDiv();
            timeline.parent(utilityDiv);
            timeline.style('display', 'grid');
            timeline.style('grid-template-columns', 'repeat(auto-fit, minmax(72px, 1fr))');
            timeline.style('gap', '6px');
            timeline.style('margin-top', '10px');

            if (rewardHistory.length === 0) {
                const empty = createDiv('No rewards collected');
                empty.parent(timeline);
                empty.addClass('panel-empty');
            } else {
                rewardHistory.forEach((reward, t) => {
                    const discounted = Math.pow(gamma, t) * reward;
                    const cell = createDiv();
                    cell.parent(timeline);
                    cell.style('border', '1px solid #e0e0e0');
                    cell.style('border-radius', '4px');
                    cell.style('padding', '6px');
                    cell.style('background', '#fafafa');

                    const label = createDiv(`T = ${t}`);
                    label.parent(cell);
                    label.style('font-size', '11px');
                    label.style('font-weight', '600');
                    label.style('color', '#555');

                    const term = createDiv(`&gamma;^${t} &times; ${reward.toFixed(2)}`);
                    term.parent(cell);
                    term.style('font-size', '11px');
                    term.style('margin-top', '4px');

                    const value = createDiv(discounted.toFixed(2));
                    value.parent(cell);
                    value.style('font-size', '13px');
                    value.style('font-weight', '600');
                    value.style('margin-top', '3px');
                    this._applyRewardColor(value, discounted);
                });
            }
        });

        // Total Reward
        this.createSection('Total Reward', () => {
            const rewardDiv = createDiv();
            rewardDiv.parent(this.contentContainer);
            const rewardValue = createDiv();
            rewardValue.parent(rewardDiv);
            rewardValue.addClass('panel-stat-value--large');
            rewardValue.html(this._formatAmount(this.simStatDisplay.totalReward));
            this._applyRewardColor(rewardValue, this.simStatDisplay.totalReward);
            simStatElements.totalReward = rewardValue;

            // Horizontal reward bar
            const barContainer = createDiv();
            barContainer.parent(rewardDiv);
            barContainer.addClass('reward-bar-container');

            const barFill = createDiv();
            barFill.parent(barContainer);
            barFill.addClass('reward-bar-fill');

            // Scale: map reward to 0-100% of half-width
            // Clamp so the bar doesn't overflow
            const maxReward = RP_REWARD_BAR_MAX;
            const clampedReward = Math.max(-maxReward, Math.min(maxReward, stats.totalReward));
            const pct = Math.abs(clampedReward) / maxReward * RP_REWARD_BAR_HALF_PCT;

            if (stats.totalReward > 0) {
                barFill.style('left', RP_REWARD_BAR_HALF_PCT + '%');
                barFill.style('width', pct + '%');
                barFill.style('background', AppPalette.reward.positiveBright);
            } else if (stats.totalReward < 0) {
                barFill.style('left', (RP_REWARD_BAR_HALF_PCT - pct) + '%');
                barFill.style('width', pct + '%');
                barFill.style('background', 'var(--reward-negative)');
            } else {
                barFill.style('width', '0%');
            }

            // Center line
            const centerLine = createDiv();
            centerLine.parent(barContainer);
            centerLine.addClass('reward-bar-center');

            this._animateSimulationStats({
                steps: stats.stepCount,
                utility: returnValue,
                totalReward: stats.totalReward
            }, simStatElements);
        });

    }

    _renderQTable(container, viState, viViewModel) {
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
                        const val = qEntry ? qEntry.qValue : 0;
                        td.textContent = val.toFixed(2);
                        td.classList.add('q-table-cell--revealed');
                        if (viState.bestActions[colIdx] &&
                            viState.bestActions[colIdx][stateId] === aq.actionId) {
                            td.classList.add('q-table-cell--best');
                        }
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

    _formatCount(value) {
        return Math.round(value).toString();
    }

    _formatAmount(value) {
        return value.toFixed(2);
    }

    _animateSimulationStats(targets, elements) {
        if (!elements.steps || !elements.utility || !elements.totalReward) return;

        const starts = {
            steps: this.simStatDisplay.steps,
            utility: this.simStatDisplay.utility,
            totalReward: this.simStatDisplay.totalReward
        };
        const durationMs = 450;
        const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

        const renderFrame = () => {
            elements.steps.html(this._formatCount(this.simStatDisplay.steps));
            elements.utility.html(this._formatAmount(this.simStatDisplay.utility));
            elements.totalReward.html(this._formatAmount(this.simStatDisplay.totalReward));
            this._applyRewardColor(elements.utility, this.simStatDisplay.utility);
            this._applyRewardColor(elements.totalReward, this.simStatDisplay.totalReward);
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
        const PANEL_DEFAULT = 300;

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
