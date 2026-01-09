// Interactor for Play simulation action
class PlayInteractor extends PlayInputBoundary {
    constructor(simulationState, traceGenerator, outputBoundary, startNodeProvider) {
        super();
        this.simulationState = simulationState;
        this.traceGenerator = traceGenerator;
        this.outputBoundary = outputBoundary;
        this.startNodeProvider = startNodeProvider;  // Function that returns current start node

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

    execute(inputData) {
        if (!this.simulationState.replayInitialized) {
            // First Play click: Run initialization
            this.runInitialization(inputData);
        } else {
            // Subsequent Play clicks: Execute one round
            this.playNextRound(inputData);
        }
    }

    /**
     * Initialization sequence (first Play click)
     */
    runInitialization(inputData) {
        // 1. Get start node
        const startNode = this.startNodeProvider();

        // 2. Validate start node
        if (!startNode) {
            this.outputBoundary.presentError('Please select a start node first (double-click a state node)');
            return;
        }

        if (startNode.type !== 'state') {
            this.outputBoundary.presentError('Starting node must be a state node');
            return;
        }

        // 3. Generate trace
        console.log('Generating trace from start node:', startNode.getName());
        const visited = this.traceGenerator.generate(startNode, 50);
        this.simulationState.setTrace(visited);

        console.log('Trace generated:', visited.length, 'nodes');

        // 4. Run initialization animation sequence
        this.animateInitialization(inputData);
    }

    /**
     * Initialization animation sequence
     */
    async animateInitialization(inputData) {
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

        // Phase 5: COMPLETE - Set initialized and wait for next Play
        this.simulationState.start();
        this.simulationState.setPhase('idle', 0);
        this.outputBoundary.presentInitializationComplete();

        console.log('Initialization complete, ready for first round');
    }

    /**
     * Execute one round (State→Action or Action→State)
     */
    playNextRound(inputData) {
        // Check if we can advance
        if (!this.simulationState.canAdvance()) {
            this.outputBoundary.presentTraceEnd();
            console.log('Reached end of trace');
            return;
        }

        const currentNode = this.simulationState.currentNode;
        const nextNode = this.simulationState.peekNext();

        console.log(`Round: ${currentNode.type} (${currentNode.name}) -> ${nextNode.type} (${nextNode.name})`);

        // Determine round type and animate
        if (currentNode.type === 'state' && nextNode.type === 'action') {
            this.animateStateToAction(currentNode, nextNode, inputData);
        } else if (currentNode.type === 'action' && nextNode.type === 'state') {
            this.animateActionToState(currentNode, nextNode, inputData);
        } else {
            this.outputBoundary.presentError(`Invalid transition: ${currentNode.type} -> ${nextNode.type}`);
        }
    }

    /**
     * Animate State → Action transition
     */
    async animateStateToAction(stateNode, actionNode, inputData) {
        this.outputBoundary.presentRoundStart(stateNode, actionNode);

        // Phase 1: DECISION PAUSE
        this.simulationState.setPhase('pause', this.TIMING.DECISION_PAUSE);
        this.outputBoundary.presentPhaseChange('decision_pause', this.TIMING.DECISION_PAUSE);

        await this.waitForPhase();

        // Phase 2: EDGE HIGHLIGHT
        this.simulationState.revealNode(actionNode.id);
        this.simulationState.revealEdge(stateNode.id, actionNode.id);
        this.simulationState.highlightEdge(stateNode.id, actionNode.id);
        this.simulationState.setPhase('highlight', this.TIMING.EDGE_HIGHLIGHT);
        this.outputBoundary.presentPhaseChange('edge_highlight', this.TIMING.EDGE_HIGHLIGHT);

        await this.waitForPhase();

        // Phase 3: TRANSITION PAUSE
        this.simulationState.setPhase('pause', this.TIMING.TRANSITION_PAUSE);
        this.outputBoundary.presentPhaseChange('transition_pause', this.TIMING.TRANSITION_PAUSE);

        await this.waitForPhase();

        // Phase 4: CAMERA TRANSITION
        this.simulationState.setPhase('transition', this.TIMING.CAMERA_TRANSITION);
        this.outputBoundary.presentPhaseChange('camera_move', this.TIMING.CAMERA_TRANSITION);

        await this.waitForPhase();

        // Phase 5: COMPLETE
        this.simulationState.advance();
        this.simulationState.clearHighlight();
        this.simulationState.setPhase('idle', 0);
        this.outputBoundary.presentRoundComplete(this.simulationState.currentNode);

        console.log('Round complete, advanced to:', this.simulationState.currentNode.name);
    }

    /**
     * Animate Action → State transition
     */
    async animateActionToState(actionNode, stateNode, inputData) {
        this.outputBoundary.presentRoundStart(actionNode, stateNode);

        // Phase 1: DECISION PAUSE
        this.simulationState.setPhase('pause', this.TIMING.DECISION_PAUSE);
        this.outputBoundary.presentPhaseChange('decision_pause', this.TIMING.DECISION_PAUSE);

        await this.waitForPhase();

        // Phase 2: EDGE HIGHLIGHT (with probability text)
        this.simulationState.revealNode(stateNode.id);
        this.simulationState.revealEdge(actionNode.id, stateNode.id);
        this.simulationState.highlightEdge(actionNode.id, stateNode.id);
        this.simulationState.setPhase('highlight', this.TIMING.EDGE_HIGHLIGHT);
        this.outputBoundary.presentPhaseChange('edge_highlight', this.TIMING.EDGE_HIGHLIGHT);

        await this.waitForPhase();

        // Phase 3: TRANSITION PAUSE
        this.simulationState.setPhase('pause', this.TIMING.TRANSITION_PAUSE);
        this.outputBoundary.presentPhaseChange('transition_pause', this.TIMING.TRANSITION_PAUSE);

        await this.waitForPhase();

        // Phase 4: CAMERA TRANSITION
        this.simulationState.setPhase('transition', this.TIMING.CAMERA_TRANSITION);
        this.outputBoundary.presentPhaseChange('camera_move', this.TIMING.CAMERA_TRANSITION);

        await this.waitForPhase();

        // Phase 5: COMPLETE
        this.simulationState.advance();
        this.simulationState.clearHighlight();
        this.simulationState.setPhase('idle', 0);
        this.outputBoundary.presentRoundComplete(this.simulationState.currentNode);

        console.log('Round complete, advanced to:', this.simulationState.currentNode.name);
    }

    /**
     * Wait for current phase to complete
     */
    waitForPhase() {
        return new Promise(resolve => {
            const checkComplete = () => {
                if (this.simulationState.isPhaseComplete()) {
                    resolve();
                } else {
                    setTimeout(checkComplete, 50);  // Check every 50ms
                }
            };
            checkComplete();
        });
    }
}
