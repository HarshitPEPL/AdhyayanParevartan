import { state } from './app.js';

export const routes = {
    'splash': { showNav: false },
    'auth': { showNav: false },
    'home': { showNav: true },
    'courses': { showNav: true },
    'competitive-exams': { showNav: true },
    'classes': { showNav: false },
    'lesson': { showNav: false },
    'quiz': { showNav: false },
    'quiz-center': { showNav: true },
    'progress': { showNav: true },
    'profile': { showNav: true },
    'help-support': { showNav: false },
    'downloads': { showNav: false },
    'admin-login': { showNav: false },
    'admin': { showNav: false }
};

const pageModules = import.meta.glob('../pages/*/*.js', { eager: true });

// Cache for loaded styles
const loadedStyles = new Set();

// --- Hardware/gesture back-button support ---------------------------------
// The app renders every "page" via fetch + innerHTML instead of real browser
// navigation, so by default the Android back button has no history to pop
// and just exits the app (or does nothing) instead of moving back through
// the app's own screens. To keep the OS-level back button in sync with our
// in-app navigation, every navigateTo() call also pushes a matching entry
// onto the real browser history, and a single `popstate` listener translates
// hardware/gesture back presses back into navigateTo() calls. This works
// both in the browser and inside the Capacitor Android WebView, since
// Capacitor's default back-button handling calls the WebView's native
// goBack() (which fires `popstate`) whenever there is history to go back to.
let popstateInstalled = false;
function installPopstateHandler() {
    if (popstateInstalled) return;
    popstateInstalled = true;
    window.addEventListener('popstate', (e) => {
        const targetRoute = e.state && e.state.routeId;
        if (targetRoute) {
            navigateTo(targetRoute, { fromPopState: true });
        }
        // If there's no state (user went back past our first tracked entry),
        // let the platform's default back behavior happen (Android exits the app).
    });
}

export async function navigateTo(routeId, options = {}) {
    const { replace = false, fromPopState = false } = options;
    const requestedRouteId = routeId;

    // Expose globally for inline onclicks in HTML
    window.navigateTo = navigateTo;
    installPopstateHandler();

    // Secure Route Guarding
    const publicRoutes = ['splash', 'auth', 'admin-login'];
    if (!publicRoutes.includes(routeId)) {
        if (routeId === 'admin') {
            // Guard admin panel: allow the main admin and teacher-level staff accounts;
            // these are the accounts created by the superadmin from the admin tools.
            const allowedAdminRoles = [1, 2];
            const isAdmin = state.currentUser && allowedAdminRoles.includes(Number(state.currentUser.role_id));
            if (!isAdmin) {
                console.warn("Unauthorized access to admin panel. Redirecting to admin-login.");
                routeId = 'admin-login';
            }
        } else {
            // Guard student pages: must be logged in
            if (!state.currentUser) {
                console.warn(`Unauthorized access to '${routeId}'. Redirecting to auth.`);
                routeId = 'auth';
            }
        }
    }

    const route = routes[routeId];
    if(!route) return;

    // Keep the browser/native history stack in sync with in-app navigation
    // so the hardware/gesture back button steps back through app screens.
    if (!fromPopState) {
        const wasForcedRedirect = routeId !== requestedRouteId;
        const useReplace = replace || wasForcedRedirect;
        const url = '#' + routeId;
        if (useReplace) {
            history.replaceState({ routeId }, '', url);
        } else {
            history.pushState({ routeId }, '', url);
        }
    }

    state.currentRoute = routeId;

    const bottomNav = document.getElementById('bottom-nav');
    if(route.showNav) {
        bottomNav.classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(el => {
            if(el.dataset.route === routeId) el.classList.add('active');
            else el.classList.remove('active');
        });
    } else {
        bottomNav.classList.add('hidden');
    }

    const rootView = document.getElementById('root-view');
    
    try {
        // Load HTML
        const response = await fetch(`./pages/${routeId}/${routeId}.html`);
        if (!response.ok) throw new Error('Failed to load page');
        rootView.innerHTML = await response.text();
        
        // Load CSS if not already loaded
        if (!loadedStyles.has(routeId)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `./pages/${routeId}/${routeId}.css`;
            document.head.appendChild(link);
            loadedStyles.add(routeId);
        }

        // Load JS
        try {
            const modulePath = `../pages/${routeId}/${routeId}.js`;
            if (pageModules[modulePath]) {
                const module = pageModules[modulePath];
                if (module.init) {
                    module.init(navigateTo, state);
                }
            } else {
                console.log(`No JS module found in glob for ${routeId}`);
                // fallback to standard dynamic import if not found by glob
                const fallbackPath = `./pages/${routeId}/${routeId}.js`;
                const module = await import(/* @vite-ignore */ fallbackPath);
                if (module.init) {
                    module.init(navigateTo, state);
                }
            }
        } catch (e) {
            console.log(`No JS module init for ${routeId}:`, e.message);
        }
    } catch (e) {
        rootView.innerHTML = `<div class="screen"><h2>Template Missing or Error</h2><p>${e.message}</p></div>`;
    }
}

