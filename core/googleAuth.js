// Real Google Sign-In via Google Identity Services (GIS), no backend required.
// Built-in default Client ID (OAuth Client IDs are public identifiers meant
// to be embedded in client-side code, like a Stripe publishable key — not a
// secret) so Google Sign-In works out-of-the-box for every user/browser
// without manual setup, as long as the app is served from one of the
// "Authorized JavaScript origins" registered for this Client ID in Google
// Cloud Console (https://parevartanadhayayan.in/). The "Google Sign-In
// Setup" icon on the post-login admin panel still lets anyone override this
// with their own Client ID via localStorage (e.g. for a different domain).

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const CLIENT_ID_KEY = 'adhyayan_google_client_id';
const DEFAULT_CLIENT_ID = '193244009678-7l08mh25ro83e3s94lp3nj8s77piv0ig.apps.googleusercontent.com';

export function getGoogleClientId() {
    return (localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID).trim();
}

export function isGoogleAuthConfigured() {
    return !!getGoogleClientId();
}

export function saveGoogleClientId(clientId) {
    localStorage.setItem(CLIENT_ID_KEY, clientId.trim());
}

// True when the user has saved their own Client ID (overriding the built-in
// default). Used purely for status-display purposes.
export function hasCustomGoogleOverride() {
    return !!localStorage.getItem(CLIENT_ID_KEY);
}

export function clearGoogleClientId() {
    localStorage.removeItem(CLIENT_ID_KEY);
}

let gisLoadPromise = null;

// Injects the Google Identity Services script once and resolves when
// window.google.accounts is ready to use.
function loadGoogleIdentityServices() {
    if (gisLoadPromise) return gisLoadPromise;

    gisLoadPromise = new Promise((resolve, reject) => {
        if (window.google?.accounts?.oauth2) {
            resolve(window.google);
            return;
        }
        const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
        const script = existing || document.createElement('script');
        script.src = GIS_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener('load', () => resolve(window.google), { once: true });
        script.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script.')), { once: true });
        if (!existing) document.head.appendChild(script);
    });

    return gisLoadPromise;
}

// Opens the real Google account picker/consent popup (must be called from a
// user-gesture handler, e.g. a button click) and returns the signed-in
// user's actual Google profile: { name, email, sub, picture }.
export async function signInWithGoogle() {
    const clientId = getGoogleClientId();
    if (!clientId) {
        throw new Error('Google Sign-In is not configured. Add your OAuth Client ID via the Google icon on the login screen.');
    }

    const google = await loadGoogleIdentityServices();

    const accessToken = await new Promise((resolve, reject) => {
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'openid email profile',
            callback: (response) => {
                if (response.error) {
                    reject(new Error(response.error_description || response.error));
                } else {
                    resolve(response.access_token);
                }
            },
            error_callback: (err) => {
                reject(new Error(err?.type === 'popup_closed' ? 'popup_closed' : (err?.message || 'Google sign-in was cancelled.')));
            }
        });
        tokenClient.requestAccessToken();
    });

    const res = await fetch(USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Failed to fetch Google profile.');

    const profile = await res.json();
    return {
        name: profile.name || profile.given_name || 'Google User',
        email: profile.email,
        sub: profile.sub,
        picture: profile.picture || null
    };
}
