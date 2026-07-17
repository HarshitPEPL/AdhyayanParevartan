// Splash Screen
// Handles initialization timing and navigation to auth with smooth fade transition

export function init(navigateTo, state) {
    const startTime = Date.now();
    const MIN_DISPLAY = 1000;   // 1 second minimum
    const MAX_DISPLAY = 5000;   // 5 seconds maximum

    // Record the splash visible time
    // window.adhyayan is already set by app.js before navigateTo('splash') was called,
    // so we just need to ensure minimum display time

    const proceed = async () => {
        const elapsed = Date.now() - startTime;
        
        // If initialization already took too long, don't add more delay
        if (elapsed >= MAX_DISPLAY) {
            navigateTo('auth');
            return;
        }

        // Wait until at least minimum display time
        const remaining = Math.max(0, MIN_DISPLAY - elapsed);
        if (remaining > 0) {
            await new Promise(r => setTimeout(r, remaining));
        }

        // Perform smooth fade transition
        const splashEl = document.querySelector('.splash-screen');
        if (splashEl) {
            splashEl.classList.add('fade-out');
            await new Promise(r => setTimeout(r, 400));
        }

        navigateTo('auth');
    };

    // Small delay to ensure DOM is painted
    requestAnimationFrame(() => {
        setTimeout(proceed, 50);
    });
}