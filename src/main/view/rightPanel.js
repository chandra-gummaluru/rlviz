// --- File-local constants ---
const RP_SET_CHAR_LIMIT      = 40;     // max combined plain-text chars before truncation
const RP_DEFAULT_DISCOUNT    = 0.9;
const RP_REWARD_SLIDER_MIN   = -100;
const RP_REWARD_SLIDER_MAX   = 100;
const RP_PROB_SLIDER_STEP    = 0.01;
const RP_VI_TABLE_MAX_H      = 400;    // px max height of the V(s) table
const RP_REWARD_BAR_MAX      = 100;    // reward clamped to ±this for bar width
const RP_REWARD_BAR_HALF_PCT = 50;     // percent representing one full half of bar
// --- End constants ---

// Right panel displaying MDP information and node editing

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

        // Discount factor (gamma) for MDP - editable
        this.discountFactor = RP_DEFAULT_DISCOUNT;

        // Sequence counter to cancel stale async MathJax renders
        this.mathJaxRenderSeq = 0;

        // Callbacks for spinning arrow animation
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
            }
        };
    }

    setup(topOffset) {
        // Create main panel container
        this.panelElement = createDiv();
        this.panelElement.position(windowWidth - this.width, topOffset);
        this.panelElement.size(this.width, windowHeight - topOffset);
        this.panelElement.addClass('panel');

        this.updateContent();
    }

    updateContent() {
        // Replace container with a fresh element so MathJax always sees an unprocessed root
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

        this._typesetMath();
    }

    _typesetMath() {
        if (!window.MathJax || !MathJax.startup || !MathJax.typesetPromise || !this.contentContainer) {
            return;
        }

        const target = this.contentContainer.elt;
        const seq = ++this.mathJaxRenderSeq;

        MathJax.startup.promise
            .then(() => {
                if (seq !== this.mathJaxRenderSeq || !document.body.contains(target)) {
                    return null;
                }
                return MathJax.typesetPromise([target]);
            })
            .catch(e => console.error('[MJ] typesetPromise failed:', e));
    }

    renderMDPInfoPanel() {
        // Title with LaTeX notation
        const titleContainer = createDiv();
        titleContainer.parent(this.contentContainer);
        titleContainer.addClass('panel-section-margin');

        const title = createDiv('Markov Decision Process');
        title.parent(titleContainer);
        title.addClass('panel-title');
        title.addClass('panel-title--with-gap');

        const latex = createDiv();
        latex.parent(titleContainer);
        latex.html('$$\\langle \\mathcal{S}, s_0, \\mathcal{A}, P, r, \\gamma \\rangle$$');
        latex.addClass('panel-latex');

        // State Space Section
        this.createSection('State Space', () => {
            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
            const stateList = createDiv();
            stateList.parent(this.contentContainer);
            stateList.addClass('panel-section-content');

            if (states.length === 0) {
                const setNotation = createDiv();
                setNotation.parent(stateList);
                setNotation.html('$$\\mathcal{S} = \\{\\}$$');
                setNotation.addClass('panel-set-notation');
            } else {
                const stateNames = buildSetLatex(states, RP_SET_CHAR_LIMIT);
                const setNotation = createDiv();
                setNotation.parent(stateList);
                setNotation.html(`$$\\mathcal{S} = \\{${stateNames}\\}$$`);
                setNotation.addClass('panel-set-notation');
                setNotation.addClass('panel-set-notation--wrap');
            }

        });

        // Action Space Section
        this.createSection('Action Space', () => {
            const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');
            const actionList = createDiv();
            actionList.parent(this.contentContainer);
            actionList.addClass('panel-section-content');

            if (actions.length === 0) {
                const setNotation = createDiv();
                setNotation.parent(actionList);
                setNotation.html('$$\\mathcal{A} = \\{\\}$$');
                setNotation.addClass('panel-set-notation');
            } else {
                const actionNames = buildSetLatex(actions, RP_SET_CHAR_LIMIT);
                const setNotation = createDiv();
                setNotation.parent(actionList);
                setNotation.html(`$$\\mathcal{A} = \\{${actionNames}\\}$$`);
                setNotation.addClass('panel-set-notation');
                setNotation.addClass('panel-set-notation--wrap');
            }

        });

        // Probability Section
        this.createSection('Probability', () => {
            const probabilityInfo = createDiv();
            probabilityInfo.parent(this.contentContainer);
            probabilityInfo.addClass('panel-section-content');

            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
            const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');

            if (states.length === 0 || actions.length === 0) {
                const empty = createDiv('Insufficient data');
                empty.parent(probabilityInfo);
                empty.addClass('panel-empty');
            } else {
                const dimensionsDiv = createDiv(`Dimensions: ${states.length} \\(\\times\\) ${actions.length} \\(\\times\\) ${states.length}`);
                dimensionsDiv.parent(probabilityInfo);
                dimensionsDiv.addClass('panel-dimensions');

                const descDiv = createDiv();
                descDiv.parent(probabilityInfo);
                descDiv.html('$$P[s][a][s\'] = \\text{probability}$$');
                descDiv.addClass('panel-description');

            }
        });

        // Reward Section
        this.createSection('Reward', () => {
            const rewardInfo = createDiv();
            rewardInfo.parent(this.contentContainer);
            rewardInfo.addClass('panel-section-content');

            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
            const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');

            if (states.length === 0 || actions.length === 0) {
                const empty = createDiv('Insufficient data');
                empty.parent(rewardInfo);
                empty.addClass('panel-empty');
            } else {
                const dimensionsDiv = createDiv(`Dimensions: ${states.length} \\(\\times\\) ${actions.length} \\(\\times\\) ${states.length}`);
                dimensionsDiv.parent(rewardInfo);
                dimensionsDiv.addClass('panel-dimensions');

                const descDiv = createDiv();
                descDiv.parent(rewardInfo);
                descDiv.html('$$R[s][a][s\'] = \\text{reward}$$');
                descDiv.addClass('panel-description');

            }
        });

        // Discount Factor Section
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

                saveBtn.mousePressed(() => {
                    const newName = input.value();
                    if (newName && newName.trim() !== '') {
                        if (this.controller.interactors.renameNode) {
                            const inputData = new RenameNodeInputData(node.id, newName.trim());
                            this.controller.interactors.renameNode.executeRename(inputData);
                            this.updateContent();
                            redraw();
                        }
                    }
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
                latexDiv.html(`$$A(s_{${stateIndex}}) = \\{\\}$$`);
                latexDiv.addClass('panel-latex-content');

            } else {
                const actionSet = stateNode.actions
                    .map(actionId => this.viewModel.graph.getNodeById(actionId))
                    .filter(n => n && n.type === 'action')
                    .map(n => latexNodeName(n.name))
                    .join(', ');
                const latexDiv = createDiv();
                latexDiv.parent(connectionsDiv);
                latexDiv.html(`$$A(s_{${stateIndex}}) = \\{${actionSet}\\}$$`);
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

        // Title
        const title = createDiv('Value Iteration');
        title.parent(this.contentContainer);
        title.addClass('panel-title');

        // Bellman equation
        const eqDiv = createDiv();
        eqDiv.parent(this.contentContainer);
        eqDiv.addClass('panel-section-content');
        eqDiv.html('$$V_t(s) = \\max_a \\sum_{s\'} P(s\'|s,a)[R + \\gamma V_{t+1}(s\')]$$');

        // Parameters
        const paramsDiv = createDiv();
        paramsDiv.parent(this.contentContainer);
        paramsDiv.addClass('panel-section-content');
        paramsDiv.style('margin-top', '10px');

        const gammaLine = createDiv(`<strong>Discount (\\(\\gamma\\)):</strong> ${this.discountFactor}`);
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

        // V(s) table
        if (viState && viState.initialized && viViewModel) {
            const tableTitle = createDiv('State Values');
            tableTitle.parent(this.contentContainer);
            tableTitle.addClass('panel-section-title');
            tableTitle.style('margin-top', '15px');

            const tableContainer = createDiv();
            tableContainer.parent(this.contentContainer);
            tableContainer.addClass('panel-section-content');
            tableContainer.style('max-height', RP_VI_TABLE_MAX_H + 'px');
            tableContainer.style('overflow-y', 'auto');

            // Show values for the most recently completed column
            const lastRevealedCol = Math.max(0, viState.currentColumnIndex - (viState.isColumnComplete() ? 0 : 1));

            for (let colIdx = Math.min(lastRevealedCol, viState.totalColumns - 1); colIdx >= 0; colIdx--) {
                const timestep = viState.getTimestep(colIdx);
                const values = viState.getValues(colIdx);

                const colHeader = createDiv(`<strong>t = ${timestep}</strong>`);
                colHeader.parent(tableContainer);
                colHeader.style('margin-top', '8px');
                colHeader.style('margin-bottom', '4px');
                colHeader.style('color', '#333');

                viState.stateIds.forEach(stateId => {
                    const isRevealed = viViewModel.isValueRevealed(colIdx, stateId);
                    const val = isRevealed ? (values[stateId] ?? 0).toFixed(3) : '?';
                    const name = viState.stateNames[stateId] || `S${stateId}`;

                    const row = createDiv();
                    row.parent(tableContainer);
                    row.style('display', 'flex');
                    row.style('justify-content', 'space-between');
                    row.style('padding', '2px 8px');
                    row.style('font-size', '13px');

                    const nameSpan = createSpan(name);
                    nameSpan.parent(row);

                    const valSpan = createSpan(`V = ${val}`);
                    valSpan.parent(row);
                    if (isRevealed) {
                        const numVal = values[stateId] ?? 0;
                        valSpan.style('color', numVal > 0 ? '#2e7d32' : numVal < 0 ? '#c62828' : '#666');
                        valSpan.style('font-weight', 'bold');
                    } else {
                        valSpan.style('color', '#999');
                    }
                });
            }
        }

    }

    renderSimulationPanel() {
        // Title
        const title = createDiv('Simulation Status');
        title.parent(this.contentContainer);
        title.addClass('panel-title');

        const simulationState = this.viewModel.simulationState;
        const stats = simulationState.getSimulationStats();

        // Initial State
        this.createSection('Initial State', () => {
            const stateDiv = createDiv();
            stateDiv.parent(this.contentContainer);
            if (stats.initialState) {
                const stateName = createDiv(stats.initialState.name);
                stateName.parent(stateDiv);
                stateName.addClass('panel-stat-value');
                stateName.addClass('panel-stat-value--primary');
            } else {
                const noState = createDiv('Not started');
                noState.parent(stateDiv);
                noState.addClass('panel-empty');
            }
        });

        // Current State
        this.createSection('Current State', () => {
            const stateDiv = createDiv();
            stateDiv.parent(this.contentContainer);
            if (stats.currentState) {
                const stateName = createDiv(stats.currentState.name);
                stateName.parent(stateDiv);
                stateName.addClass('panel-stat-value');
                stateName.addClass('panel-stat-value--success');
            } else {
                const noState = createDiv('Not at a state');
                noState.parent(stateDiv);
                noState.addClass('panel-empty');
            }
        });

        // Total Reward
        this.createSection('Total Reward', () => {
            const rewardDiv = createDiv();
            rewardDiv.parent(this.contentContainer);
            const rewardValue = createDiv(stats.totalReward.toFixed(2));
            rewardValue.parent(rewardDiv);
            rewardValue.addClass('panel-stat-value--large');
            this._applyRewardColor(rewardValue, stats.totalReward);

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
                barFill.style('background', '#4CAF50');
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
        });

        // Steps
        this.createSection('Steps', () => {
            const stepsDiv = createDiv();
            stepsDiv.parent(this.contentContainer);
            const stepsValue = createDiv(stats.stepCount.toString());
            stepsValue.parent(stepsDiv);
            stepsValue.addClass('panel-stat-value--large-primary');
        });

        // Decision p(a|s)
        if (stats.decisionProbs && stats.decisionProbs.length > 0) {
            this.createSection('Decision p(a|s)', () => {
                const decisionDiv = createDiv();
                decisionDiv.parent(this.contentContainer);

                stats.decisionProbs.forEach(decision => {
                    const row = createDiv();
                    row.parent(decisionDiv);
                    row.addClass('panel-decision-row');

                    const actionName = createDiv(decision.actionName);
                    actionName.parent(row);
                    actionName.addClass('panel-decision-name');

                    const prob = createDiv(decision.probability.toFixed(3));
                    prob.parent(row);
                    prob.addClass('panel-decision-prob');
                });
            });
        }

        // Outcome p(s'|a,s)
        if (stats.outcomeProbs && stats.outcomeProbs.length > 0) {
            this.createSection('Outcome p(s\'|a,s)', () => {
                const outcomeDiv = createDiv();
                outcomeDiv.parent(this.contentContainer);

                stats.outcomeProbs.forEach(outcome => {
                    const row = createDiv();
                    row.parent(outcomeDiv);
                    row.addClass('panel-outcome-card');

                    const stateName = createDiv(outcome.stateName);
                    stateName.parent(row);
                    stateName.addClass('panel-outcome-name');

                    const probRow = createDiv();
                    probRow.parent(row);
                    probRow.addClass('panel-outcome-detail');

                    const probLabel = createDiv('Probability:');
                    probLabel.parent(probRow);
                    probLabel.addClass('panel-outcome-label');

                    const prob = createDiv(outcome.probability.toFixed(3));
                    prob.parent(probRow);
                    prob.addClass('panel-outcome-value');
                    prob.addClass('panel-outcome-value--primary');

                    const rewardRow = createDiv();
                    rewardRow.parent(row);
                    rewardRow.addClass('panel-outcome-detail');

                    const rewardLabel = createDiv('Reward:');
                    rewardLabel.parent(rewardRow);
                    rewardLabel.addClass('panel-outcome-label');

                    const reward = createDiv(outcome.reward.toFixed(2));
                    reward.parent(rewardRow);
                    reward.addClass('panel-outcome-value');
                    this._applyRewardColor(reward, outcome.reward);
                });
            });
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
