// Input boundary for Step simulation action (one step at a time)
class StepInputBoundary {
    execute(inputData) {
        throw new Error('StepInputBoundary.execute() must be implemented by subclass');
    }
}
