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
        this.panelElement.style('background-color', '#FFFFFF');
        this.panelElement.style('border-left', '1px solid #DDDDDD');
        this.panelElement.style('overflow-y', 'auto');
        this.panelElement.style('padding', '15px');
        this.panelElement.style('box-sizing', 'border-box');
        this.panelElement.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
        this.panelElement.style('z-index', '998');

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
            // Simulation mode without selection: show simulation info
            this.renderSimulationPanel();
        } else if (selectedNode) {
            // Node selected: show node editor
            this.renderNodePanel(selectedNode);
        } else {
            // Edit mode without selection: show MDP info
            this.renderMDPInfoPanel();
        }
    }

    renderMDPInfoPanel() {
        // Title with LaTeX notation
        const titleContainer = createDiv();
        titleContainer.parent(this.contentContainer);
        titleContainer.style('margin-bottom', '20px');

        const title = createDiv('Markov Decision Process');
        title.parent(titleContainer);
        title.style('font-size', '18px');
        title.style('font-weight', 'bold');
        title.style('color', '#333333');
        title.style('margin-bottom', '8px');

        const latex = createDiv();
        latex.parent(titleContainer);
        latex.html('$$\\langle \\mathcal{S}, s_0, \\mathcal{A}, P, r, \\gamma \\rangle$$');
        latex.style('font-size', '16px');
        latex.style('color', '#555555');
        latex.style('text-align', 'left');

        // Trigger MathJax rendering if available
        if (window.MathJax) {
            MathJax.typesetPromise([latex.elt]).catch((err) => console.log('MathJax error:', err));
        }

        // State Space Section
        this.createSection('State Space', () => {
            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
            const stateList = createDiv();
            stateList.parent(this.contentContainer);
            stateList.style('margin-bottom', '10px');

            if (states.length === 0) {
                const setNotation = createDiv();
                setNotation.parent(stateList);
                setNotation.html('$$\\mathcal{S} = \\{\\}$$');
                setNotation.style('font-size', '16px');
                setNotation.style('color', '#555555');
                setNotation.style('padding', '10px 0');
            } else {
                // Create subscripted state names: s_0, s_1, s_2, etc.
                // Show only first 5, then add ...
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
                setNotation.style('font-size', '16px');
                setNotation.style('color', '#555555');
                setNotation.style('word-wrap', 'break-word');
                setNotation.style('padding', '10px 0');
            }

            // Trigger MathJax rendering if available
            if (window.MathJax) {
                MathJax.typesetPromise([stateList.elt]).catch((err) => console.log('MathJax error:', err));
            }
        });

        // Action Space Section
        this.createSection('Action Space', () => {
            const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');
            const actionList = createDiv();
            actionList.parent(this.contentContainer);
            actionList.style('margin-bottom', '10px');

            if (actions.length === 0) {
                const setNotation = createDiv();
                setNotation.parent(actionList);
                setNotation.html('$$\\mathcal{A} = \\{\\}$$');
                setNotation.style('font-size', '16px');
                setNotation.style('color', '#555555');
                setNotation.style('padding', '10px 0');
            } else {
                // Create subscripted action names: a_0, a_1, a_2, etc.
                // Show only first 5, then add ...
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
                setNotation.style('font-size', '16px');
                setNotation.style('color', '#555555');
                setNotation.style('word-wrap', 'break-word');
                setNotation.style('padding', '10px 0');
            }

            // Trigger MathJax rendering if available
            if (window.MathJax) {
                MathJax.typesetPromise([actionList.elt]).catch((err) => console.log('MathJax error:', err));
            }
        });

        // Probability Section
        this.createSection('Probability', () => {
            const probabilityInfo = createDiv();
            probabilityInfo.parent(this.contentContainer);
            probabilityInfo.style('margin-bottom', '10px');

            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
            const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');

            if (states.length === 0 || actions.length === 0) {
                const empty = createDiv('Insufficient data');
                empty.parent(probabilityInfo);
                empty.style('color', '#999999');
                empty.style('font-style', 'italic');
                empty.style('font-size', '13px');
            } else {
                const dimensionsDiv = createDiv(`Dimensions: ${states.length} × ${actions.length} × ${states.length}`);
                dimensionsDiv.parent(probabilityInfo);
                dimensionsDiv.style('font-weight', '500');
                dimensionsDiv.style('margin-bottom', '8px');
                dimensionsDiv.style('font-size', '13px');

                const descDiv = createDiv();
                descDiv.parent(probabilityInfo);
                descDiv.html('$$P[s][a][s\'] = \\text{probability}$$');
                descDiv.style('font-size', '13px');
                descDiv.style('color', '#555555');

                // Trigger MathJax rendering if available
                if (window.MathJax) {
                    MathJax.typesetPromise([descDiv.elt]).catch((err) => console.log('MathJax error:', err));
                }
            }
        });

        // Reward Section
        this.createSection('Reward', () => {
            const rewardInfo = createDiv();
            rewardInfo.parent(this.contentContainer);
            rewardInfo.style('margin-bottom', '10px');

            const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
            const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');

            if (states.length === 0 || actions.length === 0) {
                const empty = createDiv('Insufficient data');
                empty.parent(rewardInfo);
                empty.style('color', '#999999');
                empty.style('font-style', 'italic');
                empty.style('font-size', '13px');
            } else {
                const dimensionsDiv = createDiv(`Dimensions: ${states.length} × ${actions.length} × ${states.length}`);
                dimensionsDiv.parent(rewardInfo);
                dimensionsDiv.style('font-weight', '500');
                dimensionsDiv.style('margin-bottom', '8px');
                dimensionsDiv.style('font-size', '13px');

                const descDiv = createDiv();
                descDiv.parent(rewardInfo);
                descDiv.html('$$R[s][a][s\'] = \\text{reward}$$');
                descDiv.style('font-size', '13px');
                descDiv.style('color', '#555555');

                // Trigger MathJax rendering if available
                if (window.MathJax) {
                    MathJax.typesetPromise([descDiv.elt]).catch((err) => console.log('MathJax error:', err));
                }
            }
        });

        // Discount Factor Section
        this.createSection('Discount Factor', () => {
            const gammaContainer = createDiv();
            gammaContainer.parent(this.contentContainer);
            gammaContainer.style('margin-bottom', '10px');

            const inputContainer = createDiv();
            inputContainer.parent(gammaContainer);
            inputContainer.style('display', 'flex');
            inputContainer.style('align-items', 'center');
            inputContainer.style('gap', '10px');

            const input = createInput(this.discountFactor.toString());
            input.parent(inputContainer);
            input.style('width', '80px');
            input.style('padding', '6px');
            input.style('border', '1px solid #CCCCCC');
            input.style('border-radius', '4px');
            input.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
            input.style('font-size', '13px');
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
            desc.style('font-size', '11px');
            desc.style('color', '#999999');
            desc.style('margin-top', '5px');
        });
    }

    renderNodePanel(node) {
        // Title
        const title = createDiv(`${node.type === 'state' ? 'State' : 'Action'} Node`);
        title.parent(this.contentContainer);
        title.style('font-size', '18px');
        title.style('font-weight', 'bold');
        title.style('margin-bottom', '20px');
        title.style('color', '#333333');

        // Name Editing Section
        this.createSection('Name', () => {
            const nameContainer = createDiv();
            nameContainer.parent(this.contentContainer);
            nameContainer.style('margin-bottom', '10px');

            const input = createInput(node.name);
            input.parent(nameContainer);
            input.style('width', '100%');
            input.style('padding', '8px');
            input.style('border', '1px solid #CCCCCC');
            input.style('border-radius', '4px');
            input.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
            input.style('font-size', '14px');
            input.style('box-sizing', 'border-box');

            const saveBtn = createButton('Save Name');
            saveBtn.parent(nameContainer);
            saveBtn.style('margin-top', '8px');
            saveBtn.style('padding', '6px 12px');
            saveBtn.style('border', 'none');
            saveBtn.style('border-radius', '4px');
            saveBtn.style('background-color', '#2196F3');
            saveBtn.style('color', '#FFFFFF');
            saveBtn.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
            saveBtn.style('font-size', '13px');
            saveBtn.style('cursor', 'pointer');

            saveBtn.mousePressed(() => {
                const newName = input.value();
                if (newName && newName.trim() !== '') {
                    // Use the rename interactor
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
            imageContainer.style('margin-bottom', '10px');

            // Show current image if exists
            if (node.image) {
                const imgPreview = createImg(node.image, 'Node image');
                imgPreview.parent(imageContainer);
                imgPreview.style('max-width', '100%');
                imgPreview.style('border-radius', '4px');
                imgPreview.style('margin-bottom', '8px');
                imgPreview.style('display', 'block');
            } else {
                const noImage = createDiv('No image uploaded');
                noImage.parent(imageContainer);
                noImage.style('color', '#999999');
                noImage.style('font-style', 'italic');
                noImage.style('font-size', '13px');
                noImage.style('margin-bottom', '8px');
            }

            const uploadBtn = createButton('Upload Image');
            uploadBtn.parent(imageContainer);
            uploadBtn.style('padding', '6px 12px');
            uploadBtn.style('border', 'none');
            uploadBtn.style('border-radius', '4px');
            uploadBtn.style('background-color', '#4CAF50');
            uploadBtn.style('color', '#FFFFFF');
            uploadBtn.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
            uploadBtn.style('font-size', '13px');
            uploadBtn.style('cursor', 'pointer');
            uploadBtn.style('margin-right', '8px');

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
                removeBtn.style('padding', '6px 12px');
                removeBtn.style('border', 'none');
                removeBtn.style('border-radius', '4px');
                removeBtn.style('background-color', '#F44336');
                removeBtn.style('color', '#FFFFFF');
                removeBtn.style('font-family', 'Calibri, "Segoe UI", Tahoma, sans-serif');
                removeBtn.style('font-size', '13px');
                removeBtn.style('cursor', 'pointer');

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
        // Find the index of this state node in the graph
        const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');
        const stateIndex = states.findIndex(s => s.id === stateNode.id);

        this.createSection('Available Actions', () => {
            const connectionsDiv = createDiv();
            connectionsDiv.parent(this.contentContainer);

            if (stateNode.actions.length === 0) {
                // Display with empty set
                const latexDiv = createDiv();
                latexDiv.parent(connectionsDiv);
                latexDiv.html(`$$A(s_{${stateIndex}}) = \\{\\}$$`);
                latexDiv.style('font-size', '14px');
                latexDiv.style('color', '#555555');
                latexDiv.style('padding', '10px 0');

                // Trigger MathJax rendering
                if (window.MathJax) {
                    MathJax.typesetPromise([latexDiv.elt]).catch((err) => console.log('MathJax error:', err));
                }
            } else {
                // Get all action nodes
                const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');

                // Build array of action indices for this state
                const actionIndices = stateNode.actions.map(actionId => {
                    const actionNode = actions.find(n => n.id === actionId);
                    return actionNode ? actions.indexOf(actionNode) : -1;
                }).filter(idx => idx !== -1);

                // Display as LaTeX set notation with equality
                const actionSet = actionIndices.map(idx => `a_{${idx}}`).join(', ');
                const latexDiv = createDiv();
                latexDiv.parent(connectionsDiv);
                latexDiv.html(`$$A(s_{${stateIndex}}) = \\{${actionSet}\\}$$`);
                latexDiv.style('font-size', '14px');
                latexDiv.style('color', '#555555');
                latexDiv.style('padding', '10px 0');

                // Trigger MathJax rendering
                if (window.MathJax) {
                    MathJax.typesetPromise([latexDiv.elt]).catch((err) => console.log('MathJax error:', err));
                }
            }
        });
    }

    renderActionConnections(actionNode) {
        // Find the index of this action node in the graph
        const actions = this.viewModel.graph.nodes.filter(n => n.type === 'action');
        const actionIndex = actions.findIndex(a => a.id === actionNode.id);

        // Get all state nodes for indexing
        const states = this.viewModel.graph.nodes.filter(n => n.type === 'state');

        // Create transitions section with editable probability and reward
        this.createSection('Transitions', () => {
            const transitionsDiv = createDiv();
            transitionsDiv.parent(this.contentContainer);

            if (actionNode.sas.length === 0) {
                const empty = createDiv('No transitions defined');
                empty.parent(transitionsDiv);
                empty.style('color', '#999999');
                empty.style('font-style', 'italic');
                empty.style('font-size', '13px');
            } else {
                // Display each transition with editable controls
                actionNode.sas.forEach((transition, index) => {
                    const transitionContainer = createDiv();
                    transitionContainer.parent(transitionsDiv);
                    transitionContainer.style('margin-bottom', '15px');
                    transitionContainer.style('padding', '10px');
                    transitionContainer.style('background-color', '#F9F9F9');
                    transitionContainer.style('border-radius', '4px');
                    transitionContainer.style('border', '1px solid #E0E0E0');

                    // Find target state name
                    const targetState = states.find(s => s.id === transition.nextState);
                    const targetStateName = targetState ? targetState.name : 'Unknown';

                    // Transition header
                    const header = createDiv(`→ ${targetStateName}`);
                    header.parent(transitionContainer);
                    header.style('font-weight', '600');
                    header.style('margin-bottom', '10px');
                    header.style('color', '#333333');
                    header.style('font-size', '14px');

                    // Probability control
                    const probLabel = createDiv('Probability:');
                    probLabel.parent(transitionContainer);
                    probLabel.style('font-size', '12px');
                    probLabel.style('color', '#666666');
                    probLabel.style('margin-bottom', '5px');

                    const probInputContainer = createDiv();
                    probInputContainer.parent(transitionContainer);
                    probInputContainer.style('display', 'flex');
                    probInputContainer.style('align-items', 'center');
                    probInputContainer.style('gap', '8px');
                    probInputContainer.style('margin-bottom', '10px');

                    const probSlider = createSlider(0, 1, transition.probability, 0.01);
                    probSlider.parent(probInputContainer);
                    probSlider.style('flex', '1');
                    probSlider.style('cursor', 'pointer');
                    probSlider.style('position', 'relative');
                    probSlider.style('z-index', '999');

                    const probValue = createDiv(transition.probability.toFixed(3));
                    probValue.parent(probInputContainer);
                    probValue.style('font-size', '13px');
                    probValue.style('font-weight', '600');
                    probValue.style('color', '#2196F3');
                    probValue.style('min-width', '50px');
                    probValue.style('text-align', 'right');

                    probSlider.input(() => {
                        const newProb = parseFloat(probSlider.value());
                        transition.probability = newProb;
                        probValue.html(newProb.toFixed(3));
                        redraw();
                    });

                    // Prevent slider mouse events from affecting canvas
                    probSlider.elt.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                    });
                    probSlider.elt.addEventListener('click', (e) => {
                        e.stopPropagation();
                    });

                    // Reward control
                    const rewardLabel = createDiv('Reward:');
                    rewardLabel.parent(transitionContainer);
                    rewardLabel.style('font-size', '12px');
                    rewardLabel.style('color', '#666666');
                    rewardLabel.style('margin-bottom', '5px');

                    const rewardInputContainer = createDiv();
                    rewardInputContainer.parent(transitionContainer);
                    rewardInputContainer.style('display', 'flex');
                    rewardInputContainer.style('align-items', 'center');
                    rewardInputContainer.style('gap', '8px');

                    const rewardSlider = createSlider(-100, 100, transition.reward, 1);
                    rewardSlider.parent(rewardInputContainer);
                    rewardSlider.style('flex', '1');
                    rewardSlider.style('cursor', 'pointer');
                    rewardSlider.style('position', 'relative');
                    rewardSlider.style('z-index', '999');

                    const rewardValue = createDiv(transition.reward.toFixed(2));
                    rewardValue.parent(rewardInputContainer);
                    rewardValue.style('font-size', '13px');
                    rewardValue.style('font-weight', '600');
                    rewardValue.style('min-width', '60px');
                    rewardValue.style('text-align', 'right');

                    // Update reward value color based on value
                    const updateRewardColor = (reward) => {
                        if (reward > 0) {
                            rewardValue.style('color', '#006400'); // Dark green
                        } else if (reward < 0) {
                            rewardValue.style('color', '#8B0000'); // Dark red
                        } else {
                            rewardValue.style('color', '#000000'); // Black
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

                    // Prevent slider mouse events from affecting canvas
                    rewardSlider.elt.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                    });
                    rewardSlider.elt.addEventListener('click', (e) => {
                        e.stopPropagation();
                    });
                });

                // Show total probability sum
                const totalProb = actionNode.getTotalProbability();
                const totalDiv = createDiv(`Total Probability: ${totalProb.toFixed(3)}`);
                totalDiv.parent(transitionsDiv);
                totalDiv.style('margin-top', '10px');
                totalDiv.style('font-weight', '600');
                totalDiv.style('font-size', '13px');
                totalDiv.style('padding', '8px');
                totalDiv.style('background-color', totalProb === 1.0 ? '#E8F5E9' : '#FFF3E0');
                totalDiv.style('color', totalProb === 1.0 ? '#2E7D32' : '#E65100');
                totalDiv.style('border-radius', '4px');
                totalDiv.style('text-align', 'center');
            }
        });
    }

    renderSimulationPanel() {
        // Title
        const title = createDiv('Simulation Status');
        title.parent(this.contentContainer);
        title.style('font-size', '18px');
        title.style('font-weight', 'bold');
        title.style('margin-bottom', '20px');
        title.style('color', '#333333');

        const simulationState = this.viewModel.simulationState;
        const stats = simulationState.getSimulationStats();

        // Initial State
        this.createSection('Initial State', () => {
            const stateDiv = createDiv();
            stateDiv.parent(this.contentContainer);
            if (stats.initialState) {
                const stateName = createDiv(stats.initialState.name);
                stateName.parent(stateDiv);
                stateName.style('font-size', '16px');
                stateName.style('font-weight', '600');
                stateName.style('color', '#2196F3');
            } else {
                const noState = createDiv('Not started');
                noState.parent(stateDiv);
                noState.style('color', '#999999');
                noState.style('font-style', 'italic');
            }
        });

        // Current State
        this.createSection('Current State', () => {
            const stateDiv = createDiv();
            stateDiv.parent(this.contentContainer);
            if (stats.currentState) {
                const stateName = createDiv(stats.currentState.name);
                stateName.parent(stateDiv);
                stateName.style('font-size', '16px');
                stateName.style('font-weight', '600');
                stateName.style('color', '#4CAF50');
            } else {
                const noState = createDiv('Not at a state');
                noState.parent(stateDiv);
                noState.style('color', '#999999');
                noState.style('font-style', 'italic');
            }
        });

        // Total Reward
        this.createSection('Total Reward', () => {
            const rewardDiv = createDiv();
            rewardDiv.parent(this.contentContainer);
            const rewardValue = createDiv(stats.totalReward.toFixed(2));
            rewardValue.parent(rewardDiv);
            rewardValue.style('font-size', '24px');
            rewardValue.style('font-weight', '700');
            if (stats.totalReward > 0) {
                rewardValue.style('color', '#006400'); // Dark green
            } else if (stats.totalReward < 0) {
                rewardValue.style('color', '#8B0000'); // Dark red
            } else {
                rewardValue.style('color', '#000000'); // Black
            }
        });

        // Steps
        this.createSection('Steps', () => {
            const stepsDiv = createDiv();
            stepsDiv.parent(this.contentContainer);
            const stepsValue = createDiv(stats.stepCount.toString());
            stepsValue.parent(stepsDiv);
            stepsValue.style('font-size', '24px');
            stepsValue.style('font-weight', '700');
            stepsValue.style('color', '#2196F3');
        });

        // Decision p(a|s) - if at a state
        if (stats.decisionProbs && stats.decisionProbs.length > 0) {
            this.createSection('Decision p(a|s)', () => {
                const decisionDiv = createDiv();
                decisionDiv.parent(this.contentContainer);
                decisionDiv.style('margin-top', '5px');

                stats.decisionProbs.forEach(decision => {
                    const row = createDiv();
                    row.parent(decisionDiv);
                    row.style('display', 'flex');
                    row.style('justify-content', 'space-between');
                    row.style('padding', '4px 0');
                    row.style('border-bottom', '1px solid #EEEEEE');

                    const actionName = createDiv(decision.actionName);
                    actionName.parent(row);
                    actionName.style('font-size', '13px');
                    actionName.style('color', '#555555');

                    const prob = createDiv(decision.probability.toFixed(3));
                    prob.parent(row);
                    prob.style('font-size', '13px');
                    prob.style('font-weight', '600');
                    prob.style('color', '#2196F3');
                });
            });
        }

        // Outcome p(s'|a,s) - if at an action
        if (stats.outcomeProbs && stats.outcomeProbs.length > 0) {
            this.createSection('Outcome p(s\'|a,s)', () => {
                const outcomeDiv = createDiv();
                outcomeDiv.parent(this.contentContainer);
                outcomeDiv.style('margin-top', '5px');

                stats.outcomeProbs.forEach(outcome => {
                    const row = createDiv();
                    row.parent(outcomeDiv);
                    row.style('padding', '8px');
                    row.style('margin-bottom', '5px');
                    row.style('background-color', '#F9F9F9');
                    row.style('border-radius', '4px');
                    row.style('border', '1px solid #E0E0E0');

                    const stateName = createDiv(outcome.stateName);
                    stateName.parent(row);
                    stateName.style('font-size', '13px');
                    stateName.style('font-weight', '600');
                    stateName.style('color', '#333333');
                    stateName.style('margin-bottom', '4px');

                    const probRow = createDiv();
                    probRow.parent(row);
                    probRow.style('display', 'flex');
                    probRow.style('justify-content', 'space-between');
                    probRow.style('margin-bottom', '2px');

                    const probLabel = createDiv('Probability:');
                    probLabel.parent(probRow);
                    probLabel.style('font-size', '11px');
                    probLabel.style('color', '#666666');

                    const prob = createDiv(outcome.probability.toFixed(3));
                    prob.parent(probRow);
                    prob.style('font-size', '11px');
                    prob.style('font-weight', '600');
                    prob.style('color', '#2196F3');

                    const rewardRow = createDiv();
                    rewardRow.parent(row);
                    rewardRow.style('display', 'flex');
                    rewardRow.style('justify-content', 'space-between');

                    const rewardLabel = createDiv('Reward:');
                    rewardLabel.parent(rewardRow);
                    rewardLabel.style('font-size', '11px');
                    rewardLabel.style('color', '#666666');

                    const reward = createDiv(outcome.reward.toFixed(2));
                    reward.parent(rewardRow);
                    reward.style('font-size', '11px');
                    reward.style('font-weight', '600');
                    if (outcome.reward > 0) {
                        reward.style('color', '#006400'); // Dark green
                    } else if (outcome.reward < 0) {
                        reward.style('color', '#8B0000'); // Dark red
                    } else {
                        reward.style('color', '#000000'); // Black
                    }
                });
            });
        }

        // Animation Settings Section
        this.createSection('Animation Settings', () => {
            const settingsDiv = createDiv();
            settingsDiv.parent(this.contentContainer);
            settingsDiv.style('margin-top', '10px');

            // Spinning Arrow Checkbox
            const checkboxContainer = createDiv();
            checkboxContainer.parent(settingsDiv);
            checkboxContainer.style('margin-bottom', '15px');

            const checkbox = createCheckbox('Enable Spinning Arrow Selection', simulationState.spinningArrowEnabled);
            checkbox.parent(checkboxContainer);
            checkbox.style('font-size', '13px');
            checkbox.changed(() => {
                const enabled = checkbox.checked();
                if (this.callbacks && this.callbacks.onSpinningArrowToggle) {
                    this.callbacks.onSpinningArrowToggle(enabled);
                }
            });

            // Duration Slider
            const sliderContainer = createDiv();
            sliderContainer.parent(settingsDiv);
            sliderContainer.style('margin-top', '10px');

            const sliderLabel = createDiv('Animation Duration:');
            sliderLabel.parent(sliderContainer);
            sliderLabel.style('font-size', '12px');
            sliderLabel.style('color', '#666666');
            sliderLabel.style('margin-bottom', '5px');

            const sliderValueDiv = createDiv();
            sliderValueDiv.parent(sliderContainer);
            sliderValueDiv.style('display', 'flex');
            sliderValueDiv.style('justify-content', 'space-between');
            sliderValueDiv.style('align-items', 'center');
            sliderValueDiv.style('margin-bottom', '8px');

            const valueLabel = createDiv(`${simulationState.spinningArrowDuration}ms`);
            valueLabel.parent(sliderValueDiv);
            valueLabel.style('font-size', '14px');
            valueLabel.style('font-weight', '600');
            valueLabel.style('color', '#2196F3');

            const rangeLabel = createDiv('(800ms - 3000ms)');
            rangeLabel.parent(sliderValueDiv);
            rangeLabel.style('font-size', '11px');
            rangeLabel.style('color', '#999999');

            const slider = createSlider(800, 3000, simulationState.spinningArrowDuration, 50);
            slider.parent(sliderContainer);
            slider.style('width', '100%');
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
        sectionTitle.style('font-size', '14px');
        sectionTitle.style('font-weight', '600');
        sectionTitle.style('margin-top', '15px');
        sectionTitle.style('margin-bottom', '10px');
        sectionTitle.style('color', '#444444');
        sectionTitle.style('border-bottom', '2px solid #2196F3');
        sectionTitle.style('padding-bottom', '5px');

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
