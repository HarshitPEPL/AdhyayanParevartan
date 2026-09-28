// Google no longer allows anonymous/server-side requests to its legacy
// `drive.google.com/uc?export=download` link — even for files shared
// "Anyone with the link" it now redirects to a Google sign-in wall
// (accounts.google.com/ServiceLogin) to block scraping/bot traffic. The only
// reliable server-side path is the official Drive API (`files.get?alt=media`)
// authenticated as a Service Account that has been granted Viewer access to
// the target folder in Drive's sharing settings. This Edge Function signs a
// JWT with the service account's private key, exchanges it for an OAuth
// access token, fetches the file via the Drive API, and re-serves the bytes
// from our own domain with CORS wide open (so PDF.js's in-app fetch works).
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=3600'
};

// Cached across warm invocations of the same edge function instance so we
// don't re-authenticate on every single request.
let cachedToken = null;
let cachedTokenExpiry = 0;

function base64UrlEncode(bytes) {
    let binary = '';
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
    const base64 = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && now < cachedTokenExpiry - 60) return cachedToken;

    const clientEmail = Deno.env.get('GDRIVE_SA_CLIENT_EMAIL');
    // Netlify env vars are single-line, so the PEM's real newlines are stored
    // as literal "\n" escape sequences — restore them before parsing.
    const privateKeyPem = (Deno.env.get('GDRIVE_SA_PRIVATE_KEY') || '').replace(/\\n/g, '\n');
    if (!clientEmail || !privateKeyPem) {
        throw new Error('Service account credentials are not configured.');
    }

    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    };
    const encoder = new TextEncoder();
    const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(JSON.stringify(claim)))}`;

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        pemToArrayBuffer(privateKeyPem),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signingInput));
    const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`
    });
    if (!tokenRes.ok) {
        throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    }
    const tokenJson = await tokenRes.json();
    cachedToken = tokenJson.access_token;
    cachedTokenExpiry = now + (tokenJson.expires_in || 3600);
    return cachedToken;
}

export default async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return new Response('Missing or invalid Drive file id.', { status: 400, headers: CORS_HEADERS });
    }

    try {
        const accessToken = await getAccessToken();
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (res.status === 403 || res.status === 404) {
            return new Response(
                'This file is not accessible to the app. Make sure the Drive folder is shared with the service account as Viewer.',
                { status: 502, headers: CORS_HEADERS }
            );
        }
        if (!res.ok || !res.body) {
            return new Response('Failed to fetch file from Google Drive.', { status: res.status || 502, headers: CORS_HEADERS });
        }

        return new Response(res.body, {
            status: 200,
            headers: {
                ...CORS_HEADERS,
                'Content-Type': res.headers.get('content-type') || 'application/pdf'
            }
        });
    } catch (err) {
        return new Response(`Proxy error: ${err.message}`, { status: 500, headers: CORS_HEADERS });
    }
};

export const config = { path: '/api/drive-proxy' };
