// Shared animation logic for Play and Step simulation interactors
class SimulationAnimator {
    constructor(simulationState, traceGenerator, outputBoundary, startNodeProvider) {
        this.simulationState = simulationState;
        this.traceGenerator = traceGenerator;
        this.outputBoundary = outputBoundary;
        this.startNodeProvider = startNodeProvider;

        // Timing constants (in milliseconds)
        this.TIMING = {
            PRE_SETUP_PAUSE: 500,
            POST_ERASE_PAUSE: 300,
            CAMERA_CENTER: 600,
            DECISION_PAUSE: 400,
            EDGE_HIGHLIGHT: 600,
            TRANSITION_PAUSE: 300,
            CAMERA_TRANSITION: 600
        };
    }

    setTiming(timing) {
        this.TIMING = timing;
    }

    /**
     * Validate start node and generate trace.
     * Returns true if successful, false otherwise.
     */
    validateAndGenerateTrace() {
        const startNode = this.startNodeProvider();

        if (!startNode) {
            this.outputBoundary.presentError('Please select a start node first (double-click a state node)');
            return false;
        }

        if (startNode.type !== 'state') {
            this.outputBoundary.presentError('Starting node must be a state node');
            return false;
        }

        const rawNodeCap = this.simulationState.maxSteps * 2 + 1;
        const timeDependentPolicy = this.simulationState.isTimeDependent() ? this.simulationState.timeDependentPolicy : null;
        const visited = this.traceGenerator.generate(startNode, rawNodeCap, this.simulationState.policy, this.simulationState.policyWeights, timeDependentPolicy);
        this.simulationState.setTrace(visited);
        return true;
    }

    /**
     * Initialization animation sequence.
     * @param {boolean} autoPlay - If true, sets playing state; if false, keeps paused.
     */
    async animateInitialization(autoPlay) {
        this.outputBoundary.presentInitializationStart();

        // Phase 1: PRE-SETUP PAUSE
        this.simulationState.setPhase('pause', this.TIMING.PRE_SETUP_PAUSE);
        this.outputBoundary.presentPhaseChange('pause', this.TIMING.PRE_SETUP_PAUSE);
        await this.waitForPhase();

        // Phase 2: ERASE / RESET PHASE
        this.simulationState.hideAll();
        this.simulationState.revealStartOnly();
        this.outputBoundary.presentPhaseChange('reveal', 0);

        // Phase 3: POST-ERASE PAUSE
        this.simulationState.setPhase('pause', this.TIMING.POST_ERASE_PAUSE);
        this.outputBoundary.presentPhaseChange('pause', this.TIMING.POST_ERASE_PAUSE);
        await this.waitForPhase();

        // Phase 4: CAMERA CENTERING
        this.simulationState.setPhase('transition', this.TIMING.CAMERA_CENTER);
        this.outputBoundary.presentPhaseChange('center_camera', this.TIMING.CAMERA_CENTER);
        await this.waitForPhase();

        // Phase 5: COMPLETE
        this.simulationState.start();
        if (autoPlay) {
            this.simulationState.play();
        } else {
            this.simulationState.pause();
        }
        this.simulationState.setPhase('idle', 0);
        this.outputBoundary.presentInitializationComplete();
    }

    /**
     * Animate transition from current node to next node.
     * Shows all outgoing edges, highlights chosen edge, moves to next node.
     */
    async animateTransition(fromNode, toNode) {
        // Snapshot the jump generation so every await point below can detect a mid-flight
        // scrub/jump (SimulationState.jumpToIndex()) and abort before mutating state further -
        // fromNode/toNode become stale the instant a jump happens, and resuming here after that
        // would corrupt the position/stats jumpToIndex() just recomputed from scratch.
        const startGeneration = this.simulationState.jumpGeneration;

        this.outputBoundary.presentRoundStart(fromNode, toNode);

        // Phase 1: REVEAL ALL OUTGOING EDGES AND UPDATE PROBABILITIES
        if (fromNode.type === 'state') {
            const stateNodeInGraph = this.getNodeFromGraph(fromNode.id);
            if (stateNodeInGraph && stateNodeInGraph.actions) {
                stateNodeInGraph.actions.forEach(actionId => {
                    this.simulationState.revealNode(actionId);
                    this.simulationState.revealEdge(fromNode.id, actionId);
                });
            }
            if (stateNodeInGraph && this.traceGenerator && this.traceGenerator.graph) {
                this.simulationState.setDecisionProbs(stateNodeInGraph, this.traceGenerator.graph);
            }
        } else if (fromNode.type === 'action') {
            const actionNodeInGraph = this.getNodeFromGraph(fromNode.id);
            if (actionNodeInGraph && actionNodeInGraph.sas) {
                actionNodeInGraph.sas.forEach(transition => {
                    this.simulationState.revealNode(transition.nextState);
                    this.simulationState.revealEdge(fromNode.id, transition.nextState);
                });
            }
            if (actionNodeInGraph && this.traceGenerator && this.traceGenerator.graph) {
                this.simulationState.setOutcomeProbs(actionNodeInGraph, this.traceGenerator.graph);
            }
        }

        this.simulationState.setPhase('reveal', this.TIMING.DECISION_PAUSE);
        this.outputBoundary.presentPhaseChange('reveal', this.TIMING.DECISION_PAUSE);
        await this.waitForPhase();
        if (this.simulationState.jumpGeneration !== startGeneration) return;

        // Phase 2: State-level spinning arrow (random policy only)
        if (this.simulationState.spinningArrowEnabled &&
            fromNode.type === 'state' &&
            this.simulationState.policy[fromNode.id] === undefined) {
            await this._runStateSpinningArrow(fromNode, toNode, startGeneration);
        }
        if (this.simulationState.jumpGeneration !== startGeneration) return;

        // Phase 2b: Hide unchosen action nodes (state→action transitions)
        if (fromNode.type === 'state') {
            this._hideUnchosenActions(fromNode, toNode);
        }

        // Phase 2c: SPINNING ARROW (if enabled and at action node)
        if (this.simulationState.spinningArrowEnabled && fromNode.type === 'action') {
            await this._runSpinningArrow(fromNode, toNode, startGeneration);
        } else if (fromNode.type === 'action') {
            this._hideUnchosenTransitions(fromNode, toNode);
        }
        if (this.simulationState.jumpGeneration !== startGeneration) return;

        // Phase: REWARD PARTICLES (after spinning arrow determines outcome)
        if (fromNode.type === 'action') {
            const actionNodeInGraph = this.getNodeFromGraph(fromNode.id);
            if (actionNodeInGraph) {
                const transition = actionNodeInGraph.sas.find(t => t.nextState === toNode.id);
                if (transition) {
                    this.simulationState.addReward(transition.reward, fromNode.id);
                    this.outputBoundary.presentPhaseChange('reward_collect', 0);
                }
            }
        }

        // Phase 3: HIGHLIGHT CHOSEN EDGE
        this.simulationState.highlightEdge(fromNode.id, toNode.id);
        this.simulationState.setPhase('highlight', this.TIMING.EDGE_HIGHLIGHT);
        this.outputBoundary.presentPhaseChange('edge_highlight', this.TIMING.EDGE_HIGHLIGHT);
        await this.waitForPhase();
        if (this.simulationState.jumpGeneration !== startGeneration) return;

        // Phase 4: ADVANCE TO NEXT NODE
        this.simulationState.advance();
        this.simulationState.clearHighlight();

        // Phase 5: CAMERA TRANSITION TO NEXT NODE
        this.simulationState.setPhase('transition', this.TIMING.CAMERA_TRANSITION);
        this.outputBoundary.presentPhaseChange('camera_move', this.TIMING.CAMERA_TRANSITION);
        await this.waitForPhase();
        if (this.simulationState.jumpGeneration !== startGeneration) return;

        // Phase 6: COMPLETE
        this.simulationState.setPhase('idle', 0);
        this.outputBoundary.presentRoundComplete(this.simulationState.currentNode);
    }

    /**
     * Get node from graph by ID
     */
    getNodeFromGraph(nodeId) {
        if (this.traceGenerator && this.traceGenerator.graph) {
            return this.traceGenerator.graph.getNodeById(nodeId);
        }
        return null;
    }

    /**
     * Wait for current phase to complete
     */
    waitForPhase() {
        return AnimationUtils.waitForPhase(this.simulationState);
    }

    // --- Private helpers ---

    _hideUnchosenActions(fromNode, toNode) {
        const stateNodeInGraph = this.getNodeFromGraph(fromNode.id);
        if (stateNodeInGraph && stateNodeInGraph.actions) {
            stateNodeInGraph.actions.forEach(actionId => {
                if (actionId !== toNode.id) {
                    if (!this.simulationState.hasEdgeBeenTraversed(fromNode.id, actionId)) {
                        this.simulationState.hideEdge(fromNode.id, actionId);
                    }
                    if (!this.simulationState.hasNodeBeenVisited(actionId)) {
                        this.simulationState.hideNode(actionId);
                    }
                }
            });
        }
    }

    _hideUnchosenTransitions(fromNode, toNode) {
        const actionNodeInGraph = this.getNodeFromGraph(fromNode.id);
        if (actionNodeInGraph && actionNodeInGraph.sas) {
            actionNodeInGraph.sas.forEach(transition => {
                if (transition.nextState !== toNode.id) {
                    if (!this.simulationState.hasEdgeBeenTraversed(fromNode.id, transition.nextState)) {
                        this.simulationState.hideEdge(fromNode.id, transition.nextState);
                    }
                    if (!this.simulationState.hasNodeBeenVisited(transition.nextState)) {
                        this.simulationState.hideNode(transition.nextState);
                    }
                }
            });
        }
    }

    // `startGeneration` is the jumpGeneration snapshot taken at the top of the calling
    // animateTransition() - this method has its own internal await (the spinning-arrow phase
    // itself), so it must re-check the guard before its own post-await mutations
    // (clearSpinningArrow()) rather than relying solely on the caller's check after this method
    // returns, which would run too late (the mutation below would already have happened).
    async _runStateSpinningArrow(fromNode, toNode, startGeneration) {
        const stateNodeInGraph = this.getNodeFromGraph(fromNode.id);
        if (!stateNodeInGraph || !stateNodeInGraph.actions || stateNodeInGraph.actions.length === 0) {
            return;
        }

        const targetActionId = Number(toNode.id);
        const actionIds = stateNodeInGraph.actions.filter(actionId => {
            const actionNode = this.getNodeFromGraph(actionId);
            return actionNode && actionNode.type === 'action';
        });
        if (!actionIds.some(actionId => Number(actionId) === targetActionId)) {
            return;
        }

        this.simulationState.initStateSpinningArrow(actionIds, targetActionId, stateNodeInGraph.id);
        this.simulationState.setPhase('state_spinning_arrow', this.simulationState.spinningArrowDuration);
        this.outputBoundary.presentPhaseChange('state_spinning_arrow', this.simulationState.spinningArrowDuration);
        await this.waitForPhase();
        if (this.simulationState.jumpGeneration !== startGeneration) return;

        this.simulationState.clearSpinningArrow();
    }

    // See _runStateSpinningArrow's comment - same reasoning applies here: this method's own
    // await needs its own guard before clearSpinningArrow()/_hideUnchosenTransitions() run.
    async _runSpinningArrow(fromNode, toNode, startGeneration) {
        const actionNodeInGraph = this.getNodeFromGraph(fromNode.id);
        if (!actionNodeInGraph || !actionNodeInGraph.sas || actionNodeInGraph.sas.length === 0) {
            return;
        }

        const targetIndex = actionNodeInGraph.sas.findIndex(t => t.nextState === toNode.id);
        if (targetIndex === -1) return;

        // Prepare edge data for spinning arrow
        const edges = actionNodeInGraph.sas.map(transition => ({
            probability: transition.probability,
            targetId: transition.nextState
        }));

        // Initialize spinning arrow
        this.simulationState.initSpinningArrow(edges, targetIndex);
        this.simulationState.setPhase('spinning_arrow', this.simulationState.spinningArrowDuration);
        this.outputBoundary.presentPhaseChange('spinning_arrow', this.simulationState.spinningArrowDuration);
        await this.waitForPhase();
        if (this.simulationState.jumpGeneration !== startGeneration) return;

        // Clear spinning arrow state
        this.simulationState.clearSpinningArrow();

        // Hide unchosen paths
        this._hideUnchosenTransitions(fromNode, toNode);
    }
}
