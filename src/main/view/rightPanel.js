// Right panel displaying MDP information and node editing
class RightPanel {
    constructor(viewModel, controller) {
        this.viewModel = viewModel;
        this.controller = controller;
        this.width = 300;
        this.panelElement = null;
        this.contentContainer = null;

        // Discount factor (gamma) for MDP - editable
        this.discountFactor = 0.9;

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

        // Create content container (will be regenerated on updates)
        this.contentContainer = createDiv();
        this.contentContainer.parent(this.panelElement);

        this.updateContent();
    }

    updateContent() {
        // Clear existing content
        this.contentContainer.html('');

        const selectedNode = this.viewModel.selection.selectedNode;
        const isSimulateMode = this.viewModel.interaction.mode === 'simulate';

        if (isSimulateMode && !selectedNode) {
            this.renderSimulationPanel();
        } else if (selectedNode) {
            this.renderNodePanel(selectedNode);
        } else {
            this.renderMDPInfoPanel();
        }
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

        if (window.MathJax) {
            MathJax.typesetPromise([latex.elt]).catch((err) => console.log('MathJax error:', err));
        }

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
                let stateNames;
                if (states.length > 5) {
                    const firstFive = states.slice(0, 5).map((s, index) => `s_{${index}}`).join(', ');
                    stateNames = `${firstFive}, \\ldots`;
                } else {
                    stateNames = states.map((s, index) => `s_{${index}}`).join(', ');
                }
                const setNotation = createDiv();
                setNotation.parent(stateList);
                setNotation.html(`$$\\mathcal{S} = \\{${stateNames}\\}$$`);
                setNotation.addClass('panel-set-notation');
                setNotation.addClass('panel-set-notation--wrap');
            }

            if (window.MathJax) {
                MathJax.typesetPromise([stateList.elt]).catch((err) => console.log('MathJax error:', err));
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
                let actionNames;
                if (actions.length > 5) {
                    const firstFive = actions.slice(0, 5).map((a, index) => `a_{${index}}`).join(', ');
                    actionNames = `${firstFive}, \\ldots`;
                } else {
                    actionNames = actions.map((a, index) => `a_{${index}}`).join(', ');
                }
                const setNotation = createDiv();
                setNotation.parent(actionList);
                setNotation.html(`$$\\mathcal{A} = \\{${actionNames}\\}$$`);
                setNotation.addClass('panel-set-notation');
                setNotation.addClass('panel-set-notation--wrap');
            }

            if (window.MathJax) {
                MathJax.typesetPromise([actionList.elt]).catch((err) => console.log('MathJax error:', err));
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
                const dimensionsDiv = createDiv(`Dimensions: ${states.length} × ${actions.length} × ${states.length}`);
                dimensionsDiv.parent(probabilityInfo);
                dimensionsDiv.addClass('panel-dimensions');

                const descDiv = createDiv();
                descDiv.parent(probabilityInfo);
                descDiv.html('$$P[s][a][s\'] = \\text{probability}$$');
                descDiv.addClass('panel-description');

                if (window.MathJax) {
                    MathJax.typesetPromise([descDiv.elt]).catch((err) => console.log('MathJax error:', err));
                }
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
                const dimensionsDiv = createDiv(`Dimensions: ${states.length} × ${actions.length} × ${states.length}`);
                dimensionsDiv.parent(rewardInfo);
                dimensionsDiv.addClass('panel-dimensions');

                const descDiv = createDiv();
                descDiv.parent(rewardInfo);
                descDiv.html('$$R[s][a][s\'] = \\text{reward}$$');
                descDiv.addClass('panel-description');

                if (window.MathJax) {
                    MathJax.typesetPromise([descDiv.elt]).catch((err) => console.log('MathJax error:', err));
                }
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

    renderNodePanel(node) {
        // Title
        const title = createDiv(`${node.type === 'state' ? 'State' : 'Action'} Node`);
        title.parent(this.contentContainer);
        title.addClass('panel-title');

        // Name Editing Section
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

        // Image Upload Section
        this.createSection('Image', () => {
            const imageContainer = createDiv();
            imageContainer.parent(this.contentContainer);
            imageContainer.addClass('panel-section-content');

            // Show current image if exists
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
                            node.image = event.target.result;
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
                    delete node.image;
                    this.updateContent();
                    redraw();
                });
            }
        });

        // Connections Section
        if (node.type === 'state') {
            this.renderStateConnections(node);
        } else {
            this.renderActionConnections(node);
        }
    }

    renderStateConnections(stateNode) {
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

                if (window.MathJax) {
                    MathJax.typesetPromise([latexDiv.elt]).catch((err) => console.log('MathJax error:', err));
                }
            } else {
                const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');
                const actionIndices = stateNode.actions.map(actionId => {
                    const actionNode = actions.find(n => n.id === actionId);
                    return actionNode ? actions.indexOf(actionNode) : -1;
                }).filter(idx => idx !== -1);

                const actionSet = actionIndices.map(idx => `a_{${idx}}`).join(', ');
                const latexDiv = createDiv();
                latexDiv.parent(connectionsDiv);
                latexDiv.html(`$$A(s_{${stateIndex}}) = \\{${actionSet}\\}$$`);
                latexDiv.addClass('panel-latex-content');

                if (window.MathJax) {
                    MathJax.typesetPromise([latexDiv.elt]).catch((err) => console.log('MathJax error:', err));
                }
            }
        });
    }

    renderActionConnections(actionNode) {
        const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');
        const actionIndex = actions.findIndex(a => a.id === actionNode.id);
        const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');

        this.createSection('Transitions', () => {
            const transitionsDiv = createDiv();
            transitionsDiv.parent(this.contentContainer);

            if (actionNode.sas.length === 0) {
                const empty = createDiv('No transitions defined');
                empty.parent(transitionsDiv);
                empty.addClass('panel-empty');
            } else {
                actionNode.sas.forEach((transition, index) => {
                    const transitionContainer = createDiv();
                    transitionContainer.parent(transitionsDiv);
                    transitionContainer.addClass('panel-transition-box');

                    const targetState = states.find(s => s.id === transition.nextState);
                    const targetStateName = targetState ? targetState.name : 'Unknown';

                    // Transition header
                    const header = createDiv(`→ ${targetStateName}`);
                    header.parent(transitionContainer);
                    header.addClass('panel-transition-header');

                    // Probability control
                    const probLabel = createDiv('Probability:');
                    probLabel.parent(transitionContainer);
                    probLabel.addClass('panel-label');

                    const probInputContainer = createDiv();
                    probInputContainer.parent(transitionContainer);
                    probInputContainer.addClass('panel-slider-row');

                    const probSlider = createSlider(0, 1, transition.probability, 0.01);
                    probSlider.parent(probInputContainer);
                    probSlider.addClass('panel-slider');

                    const probValue = createDiv(transition.probability.toFixed(3));
                    probValue.parent(probInputContainer);
                    probValue.addClass('panel-slider-value');

                    probSlider.input(() => {
                        const newProb = parseFloat(probSlider.value());
                        transition.probability = newProb;
                        probValue.html(newProb.toFixed(3));
                        redraw();
                    });

                    probSlider.elt.addEventListener('mousedown', (e) => e.stopPropagation());
                    probSlider.elt.addEventListener('click', (e) => e.stopPropagation());

                    // Reward control
                    const rewardLabel = createDiv('Reward:');
                    rewardLabel.parent(transitionContainer);
                    rewardLabel.addClass('panel-label');

                    const rewardInputContainer = createDiv();
                    rewardInputContainer.parent(transitionContainer);
                    rewardInputContainer.addClass('panel-slider-row');

                    const rewardSlider = createSlider(-100, 100, transition.reward, 1);
                    rewardSlider.parent(rewardInputContainer);
                    rewardSlider.addClass('panel-slider');

                    const rewardValue = createDiv(transition.reward.toFixed(2));
                    rewardValue.parent(rewardInputContainer);
                    rewardValue.addClass('panel-slider-value');
                    rewardValue.addClass('panel-slider-value--reward');

                    // Reward color must stay inline (dynamic value)
                    const updateRewardColor = (reward) => {
                        if (reward > 0) {
                            rewardValue.style('color', 'var(--reward-positive)');
                        } else if (reward < 0) {
                            rewardValue.style('color', 'var(--reward-negative)');
                        } else {
                            rewardValue.style('color', 'var(--reward-zero)');
                        }
                    };

                    updateRewardColor(transition.reward);

                    rewardSlider.input(() => {
                        const newReward = parseFloat(rewardSlider.value());
                        transition.reward = newReward;
                        rewardValue.html(newReward.toFixed(2));
                        updateRewardColor(newReward);
                        redraw();
                    });

                    rewardSlider.elt.addEventListener('mousedown', (e) => e.stopPropagation());
                    rewardSlider.elt.addEventListener('click', (e) => e.stopPropagation());
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
            // Reward color stays inline (dynamic)
            if (stats.totalReward > 0) {
                rewardValue.style('color', 'var(--reward-positive)');
            } else if (stats.totalReward < 0) {
                rewardValue.style('color', 'var(--reward-negative)');
            } else {
                rewardValue.style('color', 'var(--reward-zero)');
            }
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
                    // Reward color stays inline (dynamic)
                    if (outcome.reward > 0) {
                        reward.style('color', 'var(--reward-positive)');
                    } else if (outcome.reward < 0) {
                        reward.style('color', 'var(--reward-negative)');
                    } else {
                        reward.style('color', 'var(--reward-zero)');
                    }
                });
            });
        }

        // Animation Settings Section
        this.createSection('Animation Settings', () => {
            const settingsDiv = createDiv();
            settingsDiv.parent(this.contentContainer);
            settingsDiv.addClass('panel-settings');

            // Spinning Arrow Checkbox
            const checkboxContainer = createDiv();
            checkboxContainer.parent(settingsDiv);
            checkboxContainer.addClass('panel-checkbox-container');

            const checkbox = createCheckbox('Enable Spinning Arrow Selection', simulationState.spinningArrowEnabled);
            checkbox.parent(checkboxContainer);
            checkbox.addClass('panel-checkbox');
            checkbox.changed(() => {
                const enabled = checkbox.checked();
                if (this.callbacks && this.callbacks.onSpinningArrowToggle) {
                    this.callbacks.onSpinningArrowToggle(enabled);
                }
            });

            // Duration Slider
            const sliderContainer = createDiv();
            sliderContainer.parent(settingsDiv);
            sliderContainer.addClass('panel-slider-label');

            const sliderLabel = createDiv('Animation Duration:');
            sliderLabel.parent(sliderContainer);
            sliderLabel.addClass('panel-label');

            const sliderValueDiv = createDiv();
            sliderValueDiv.parent(sliderContainer);
            sliderValueDiv.addClass('panel-duration-header');

            const valueLabel = createDiv(`${simulationState.spinningArrowDuration}ms`);
            valueLabel.parent(sliderValueDiv);
            valueLabel.addClass('panel-duration-value');

            const rangeLabel = createDiv('(800ms - 3000ms)');
            rangeLabel.parent(sliderValueDiv);
            rangeLabel.addClass('panel-duration-range');

            const slider = createSlider(800, 3000, simulationState.spinningArrowDuration, 50);
            slider.parent(sliderContainer);
            slider.addClass('panel-full-width-slider');
            slider.input(() => {
                const duration = slider.value();
                valueLabel.html(`${duration}ms`);
                if (this.callbacks && this.callbacks.onSpinningArrowDurationChange) {
                    this.callbacks.onSpinningArrowDurationChange(duration);
                }
            });
        });
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
