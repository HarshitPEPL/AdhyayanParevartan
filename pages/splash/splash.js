// Splash Screen - works on both web and Android
export function init(navigateTo, state) {
    console.log('[Splash] init called');

    const startTime = Date.now();
    const MIN_DISPLAY = 1000;
    const MAX_DISPLAY = 5000;

    const proceed = async () => {
        const elapsed = Date.now() - startTime;

        if (elapsed >= MAX_DISPLAY) {
            navigateTo('auth', { replace: true });
            return;
        }

        const remaining = Math.max(0, MIN_DISPLAY - elapsed);
        if (remaining > 0) {
            await new Promise(r => setTimeout(r, remaining));
        }

        const splashEl = document.querySelector('.splash-screen');
        if (splashEl) {
            splashEl.classList.add('fade-out');
            await new Promise(r => setTimeout(r, 400));
        }

        navigateTo('auth', { replace: true });
    };

    requestAnimationFrame(() => {
        setTimeout(proceed, 50);
    });
}
