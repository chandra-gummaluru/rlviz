class AnimationUtils {
    static waitForPhase(stateObj, pollMs = 50) {
        return new Promise(resolve => {
            const check = () => {
                if (stateObj.isPhaseComplete()) {
                    resolve();
                } else {
                    setTimeout(check, pollMs);
                }
            };
            check();
        });
    }
}
