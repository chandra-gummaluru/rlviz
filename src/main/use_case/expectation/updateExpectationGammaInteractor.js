class UpdateExpectationGammaInteractor extends UpdateExpectationGammaInputBoundary {
    constructor(expectationState, outputBoundary) {
        super();
        this.expectationState = expectationState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        const { gamma } = inputData;
        if (!isFinite(gamma) || gamma < 0 || gamma > 1) {
            return this.outputBoundary.presentError(`Invalid gamma: ${gamma}. Must be finite in [0, 1].`);
        }

        this.expectationState.setGamma(gamma);

        const state = this.expectationState;
        this.outputBoundary.presentComplete({
            success: true,
            error: null,
            currentT: state.currentT,
            maxT: state.maxT,
            rollouts: state.rollouts,
            mean: state.getMeanAtT(state.currentT),
            sigma: state.getSigmaAtT(state.currentT),
            meansOverTime: state.getMeansOverTime(),
            sigmasOverTime: state.getSigmasOverTime(),
            policyFallbacks: state.policyFallbacks
        });
    }
}
