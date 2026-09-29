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

// Capacitor's native WebView serves the app from "https://localhost" by
// default, which would otherwise be misidentified as a local dev server below.
function isNativePlatform() {
    return !!(window.Capacitor?.isNativePlatform?.());
}

function isLocalDevelopmentOrigin() {
    if (isNativePlatform()) return false;
    // These exact origin:port combos are already registered as Authorized
    // JavaScript origins for DEFAULT_CLIENT_ID in Google Cloud Console, so
    // real Google Sign-In (the actual account picker/consent popup) works
    // fine there — only block origins that AREN'T registered (e.g. LAN IPs
    // used by `vite --host` for on-device testing, or an unlisted port),
    // where Google would otherwise reject the popup with "origin_mismatch".
    if (getProductionGoogleOrigins().includes(window.location.origin)) return false;
    const host = (window.location?.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.');
}

export function getProductionGoogleOrigins() {
    return [
        'https://parevartanadhayayan.in',
        'https://www.parevartanadhayayan.in',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000'
    ];
}

export function getGoogleClientId() {
    const customClientId = localStorage.getItem(CLIENT_ID_KEY);
    if (customClientId && customClientId.trim()) {
        return customClientId.trim();
    }
    if (isLocalDevelopmentOrigin()) {
        return '';
    }
    return DEFAULT_CLIENT_ID.trim();
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

// Static bounce page (deployed at the site root) that immediately forwards
// Google's redirect into the app via its custom URI scheme — this lets native
// Android reuse the SAME Web OAuth Client ID, no separate Android OAuth
// client/SHA-1 registration required.
const NATIVE_OAUTH_REDIRECT_URI = 'https://parevartanadhayayan.in/oauth2redirect.html';
const NATIVE_OAUTH_CUSTOM_SCHEME = 'com.adhyayank12.app://oauth2redirect';

// Google blocks its OAuth popup inside embedded WebViews (same restriction
// that broke Drive file previews), so native Android opens the auth URL in a
// Custom Tab (real browser context, not a WebView) instead of using GIS.
async function signInWithGoogleNative() {
    const [{ Browser }, { App: CapacitorApp }] = await Promise.all([
        import('@capacitor/browser'),
        import('@capacitor/app')
    ]);

    const clientId = getGoogleClientId();
    const state = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', NATIVE_OAUTH_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'select_account');

    return new Promise((resolve, reject) => {
        let settled = false;
        const handles = [];
        // Set as soon as the redirect lands, so `browserFinished` (which fires
        // almost simultaneously when the Custom Tab closes on redirect) knows
        // not to race it while the profile fetch below is still in flight.
        let redirectReceived = false;

        const finish = (err, profile) => {
            if (settled) return;
            settled = true;
            handles.forEach((h) => h?.remove());
            Browser.close().catch(() => { /* already closed */ });
            err ? reject(err) : resolve(profile);
        };

        CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
            if (!url?.startsWith(NATIVE_OAUTH_CUSTOM_SCHEME)) return;
            redirectReceived = true;
            try {
                const params = new URLSearchParams(url.split('#')[1] || '');
                if (params.get('error')) {
                    throw new Error(params.get('error') === 'access_denied' ? 'popup_closed' : params.get('error'));
                }
                if (params.get('state') !== state) {
                    throw new Error('Google sign-in state mismatch.');
                }
                const accessToken = params.get('access_token');
                if (!accessToken) throw new Error('No access token returned by Google.');

                const res = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
                if (!res.ok) throw new Error('Failed to fetch Google profile.');
                const profile = await res.json();
                finish(null, {
                    name: profile.name || profile.given_name || 'Google User',
                    email: profile.email,
                    sub: profile.sub,
                    picture: profile.picture || null
                });
            } catch (err) {
                finish(err);
            }
        }).then((h) => handles.push(h));

        // The user closing the Custom Tab without completing sign-in also counts as
        // cancellation — but closing it also happens (via the oauth2redirect bounce)
        // on a SUCCESSFUL sign-in, firing at nearly the same time as appUrlOpen above.
        // Wait briefly for appUrlOpen to claim the redirect before treating this as a cancel.
        Browser.addListener('browserFinished', () => {
            setTimeout(() => {
                if (!redirectReceived) finish(new Error('popup_closed'));
            }, 800);
        }).then((h) => handles.push(h));

        Browser.open({ url: authUrl.toString() }).catch((err) => finish(err));
    });
}

// Opens the real Google account picker/consent popup (must be called from a
// user-gesture handler, e.g. a button click) and returns the signed-in
// user's actual Google profile: { name, email, sub, picture }.
export async function signInWithGoogle() {
    const clientId = getGoogleClientId();
    if (!clientId) {
        if (isLocalDevelopmentOrigin()) {
            throw new Error('Google Sign-In is unavailable on localhost. Add your OAuth Client ID in the admin Google setup panel or run the app on the production domain.');
        }
        throw new Error('Google Sign-In is not configured. Add your OAuth Client ID via the Google icon on the login screen.');
    }

    if (isNativePlatform()) {
        return signInWithGoogleNative();
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
