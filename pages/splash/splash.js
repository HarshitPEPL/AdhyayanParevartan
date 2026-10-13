// Splash Screen - works on both web and Android
export function init(navigateTo, state) {
    console.log('[Splash] init called');

    const startTime = Date.now();
    const MIN_DISPLAY = 1000;
    const MAX_DISPLAY = 5000;

    const proceed = async () => {
        const elapsed = Date.now() - startTime;

        const isAdminUser = state.currentUser && [1, 2].includes(Number(state.currentUser.role_id));
        const studentRoute = state.pendingRoute || 'home'; // set by app.js for deep links like #courses?type=ebook
        state.pendingRoute = null;
        // A student without a saved class picks it once before entering the app.
        const classNumber = Number(state.currentUser?.class_number);
        const needsClass = Number(state.currentUser?.role_id) === 3 && !(classNumber >= 1 && classNumber <= 12);
        const targetRoute = state.currentUser
            ? (isAdminUser ? 'admin' : needsClass ? 'choose-class' : studentRoute)
            : 'auth';

        if (elapsed >= MAX_DISPLAY) {
            navigateTo(targetRoute, { replace: true });
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

        navigateTo(targetRoute, { replace: true });
    };

    requestAnimationFrame(() => {
        setTimeout(proceed, 50);
    });
}
