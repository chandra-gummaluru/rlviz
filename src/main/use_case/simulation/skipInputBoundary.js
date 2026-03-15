// Input boundary for Skip simulation action
class SkipInputBoundary {
    execute(inputData) {
        throw new Error('SkipInputBoundary.execute() must be implemented by interactor');
    }
}
