// Presenter for renormalizing probabilities
class RenormalizeProbabilitiesPresenter extends RenormalizeProbabilitiesOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
    }

    presentRenormalized(renormalizedCount, totalActions) {
        this.viewModel.infoMessage = `Renormalized ${renormalizedCount} action node${renormalizedCount !== 1 ? 's' : ''} (${totalActions} total)`;
    }

    presentNoActionsFound() {
        this.viewModel.infoMessage = 'No action nodes found to renormalize';
    }
}
