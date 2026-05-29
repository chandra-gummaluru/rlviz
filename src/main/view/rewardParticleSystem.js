// Self-contained reward particle animation system using DOM elements
class RewardParticleSystem {
    constructor() {
        this.overlay = null;
        this.activeAnimations = [];
        this.ensureOverlay();
    }

    ensureOverlay() {
        if (this.overlay && document.body.contains(this.overlay)) return;
        this.overlay = document.createElement('div');
        this.overlay.className = 'reward-particle-overlay';
        document.body.appendChild(this.overlay);
    }

    /**
     * Launch reward particle animation
     * @param {number} reward - The reward value
     * @param {number} startX - Page X coordinate to start from
     * @param {number} startY - Page Y coordinate to start from
     * @param {Element} targetElement - DOM element particles fly toward
     * @param {Function} onComplete - Called when all particles arrive
     */
    launch(reward, startX, startY, targetElement, onComplete) {
        if (reward === 0) {
            if (onComplete) onComplete();
            return;
        }

        this.ensureOverlay();

        const color = reward > 0 ? '#4CAF50' : '#F44336';
        const text = reward > 0 ? `+${reward.toFixed(1)}` : reward.toFixed(1);
        const animState = { cancelled: false, particlesRemaining: 0 };
        this.activeAnimations.push(animState);

        // Phase 1: Flash text (0-200ms)
        const flash = document.createElement('div');
        flash.className = 'reward-flash-text';
        flash.textContent = text;
        flash.style.left = startX + 'px';
        flash.style.top = startY + 'px';
        flash.style.color = color;
        flash.style.opacity = '1';
        flash.style.transform = 'translate(-50%, -50%) scale(1)';
        this.overlay.appendChild(flash);

        const flashStart = performance.now();

        const animateFlash = (now) => {
            if (animState.cancelled) { flash.remove(); return; }
            const elapsed = now - flashStart;
            if (elapsed < 400) {
                // Pop: scale 1 -> 1.5 -> 1
                const t = elapsed / 400;
                const scale = t < 0.5 ? 1 + t * 2 * 0.5 : 1.5 - (t - 0.5) * 2 * 0.5;
                flash.style.transform = `translate(-50%, -50%) scale(${scale})`;
                requestAnimationFrame(animateFlash);
            } else {
                // Fade out flash text (400-600ms)
                const fadeT = Math.min((elapsed - 400) / 200, 1);
                flash.style.opacity = String(1 - fadeT);
                if (fadeT < 1) {
                    requestAnimationFrame(animateFlash);
                } else {
                    flash.remove();
                }
            }
        };
        requestAnimationFrame(animateFlash);

        // Phase 2: Burst particles at 200ms
        const numParticles = 8 + Math.floor(Math.random() * 5); // 8-12
        animState.particlesRemaining = numParticles;

        setTimeout(() => {
            if (animState.cancelled) return;

            for (let i = 0; i < numParticles; i++) {
                this.launchParticle(
                    startX + (Math.random() - 0.5) * 20,
                    startY + (Math.random() - 0.5) * 20,
                    color,
                    targetElement,
                    animState,
                    i * 15, // stagger
                    onComplete
                );
            }
        }, 400);
    }

    launchParticle(x, y, color, targetElement, animState, delay, onComplete) {
        const particle = document.createElement('div');
        particle.className = 'reward-particle';
        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        particle.style.backgroundColor = color;
        particle.style.opacity = '1';
        this.overlay.appendChild(particle);

        // Random burst offset
        const burstX = x + (Math.random() - 0.5) * 40;
        const burstY = y + (Math.random() - 0.5) * 40 - 15;

        const travelDuration = 900;
        const startTime = performance.now() + delay;

        const animate = (now) => {
            if (animState.cancelled) { particle.remove(); return; }
            const elapsed = now - startTime;
            if (elapsed < 0) {
                requestAnimationFrame(animate);
                return;
            }

            const t = Math.min(elapsed / travelDuration, 1);
            // Ease-in-out cubic
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            // Always re-query from DOM each frame (panel rebuilds detach old elements)
            const target = document.querySelector('.reward-bar-container');
            let targetX, targetY;
            if (target) {
                const rect = target.getBoundingClientRect();
                targetX = rect.left + rect.width / 2;
                targetY = rect.top + rect.height / 2;
            } else {
                targetX = window.innerWidth - 150;
                targetY = 300;
            }

            // Bezier-ish path: burst position -> overshoot -> target
            const cx = burstX + (targetX - burstX) * ease;
            const cy = burstY + (targetY - burstY) * ease - Math.sin(ease * Math.PI) * 30;

            particle.style.left = cx + 'px';
            particle.style.top = cy + 'px';

            if (t < 0.8) {
                particle.style.opacity = '1';
            } else {
                // Scale down and fade on arrival
                const fadeT = (t - 0.8) / 0.2;
                const s = 1 - fadeT;
                particle.style.transform = `translate(-50%, -50%) scale(${s})`;
                particle.style.opacity = String(1 - fadeT * 0.5);
            }

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                particle.remove();
                animState.particlesRemaining--;
                if (animState.particlesRemaining <= 0 && !animState.cancelled) {
                    // Remove from active list
                    const idx = this.activeAnimations.indexOf(animState);
                    if (idx !== -1) this.activeAnimations.splice(idx, 1);
                    if (onComplete) onComplete();
                }
            }
        };
        requestAnimationFrame(animate);
    }

    destroy() {
        // Cancel all active animations
        for (const anim of this.activeAnimations) {
            anim.cancelled = true;
        }
        this.activeAnimations = [];
        // Clean up overlay children
        if (this.overlay) {
            this.overlay.innerHTML = '';
        }
    }
}
