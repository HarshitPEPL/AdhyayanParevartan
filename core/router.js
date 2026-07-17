import { state } from './app.js';

export const routes = {
    'splash': { showNav: false },
    'auth': { showNav: false },
    'home': { showNav: true },
    'courses': { showNav: true },
    'classes': { showNav: false },
    'lesson': { showNav: false },
    'quiz': { showNav: false },
    'progress': { showNav: true },
    'profile': { showNav: true },
    'admin-login': { showNav: false },
    'admin': { showNav: false }
};

// Cache for loaded styles
const loadedStyles = new Set();

export async function navigateTo(routeId) {
    // Expose globally for inline onclicks in HTML
    window.navigateTo = navigateTo;

    // Secure Route Guarding
    const publicRoutes = ['splash', 'auth', 'admin-login'];
    if (!publicRoutes.includes(routeId)) {
        if (routeId === 'admin') {
            // Guard admin panel: must be logged in as role_id 1 (Admin)
            const isAdmin = state.currentUser && state.currentUser.role_id === 1;
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

    state.currentRoute = routeId;
    
    const wrapper = document.getElementById('desktop-wrapper');
    if(routeId === 'admin') {
        wrapper.classList.add('full-screen');
        document.body.classList.add('admin-theme');
    } else {
        wrapper.classList.remove('full-screen');
        document.body.classList.remove('admin-theme');
    }
    
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
        const response = await fetch(`/pages/${routeId}/${routeId}.html`);
        if (!response.ok) throw new Error('Failed to load page');
        rootView.innerHTML = await response.text();
        
        // Load CSS if not already loaded
        if (!loadedStyles.has(routeId)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `/pages/${routeId}/${routeId}.css`;
            document.head.appendChild(link);
            loadedStyles.add(routeId);
        }

        // Load JS
        try {
            // Using a dynamic import; path is fully dynamic so Vite leaves it as-is
            const module = await import(/* @vite-ignore */ `/pages/${routeId}/${routeId}.js`);
            if (module.init) {
                module.init(navigateTo, state);
            }
        } catch (e) {
            console.log(`No JS module init for ${routeId}:`, e.message);
        }
    } catch (e) {
        rootView.innerHTML = `<div class="screen"><h2>Template Missing or Error</h2><p>${e.message}</p></div>`;
    }
}

