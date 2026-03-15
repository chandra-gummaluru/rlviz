// Output boundary for renormalizing probabilities
class RenormalizeProbabilitiesOutputBoundary {
    presentRenormalized(renormalizedCount, totalActions) {
        throw new Error('presentRenormalized() must be implemented');
    }

    presentNoActionsFound() {
        throw new Error('presentNoActionsFound() must be implemented');
    }
}
