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
// Errors must never be cached (a transient failure would otherwise stick for an hour).
const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store' };
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cache-Control': 'public, max-age=3600'
};

// `?type=media` marks requests from the lesson's audio player: those forward the
// browser's Range header (so seeking works and the duration is known) and pass the
// length/range headers back. PDF requests (no `type`) are served exactly as before.
const MEDIA_HEADERS_TO_FORWARD = ['content-length', 'content-range', 'accept-ranges'];

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

// Anonymous path, used when no service account is configured (or it can't read the file).
// Drive's download host serves "anyone with the link" files to plain server-side requests, but it
// refuses browser cross-site fetches (no CORS), so this function fetches the bytes server-side and
// re-serves them from our own domain with CORS open. Files too big for Drive's virus scan answer
// with an HTML confirmation page; its hidden form is submitted to get the real file.
const DRIVE_DOWNLOAD_URL = 'https://drive.usercontent.google.com/download';

async function fetchDriveAnonymously(id, extraHeaders = {}) {
    let res = await fetch(`${DRIVE_DOWNLOAD_URL}?id=${encodeURIComponent(id)}&export=download`, { redirect: 'follow', headers: extraHeaders });
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && type.includes('text/html')) {
        // A ranged request could return only part of the confirmation page; read it whole.
        if (extraHeaders.Range) {
            await res.body?.cancel();
            res = await fetch(`${DRIVE_DOWNLOAD_URL}?id=${encodeURIComponent(id)}&export=download`, { redirect: 'follow' });
            if (!res.ok) return null;
        }
        const html = await res.text();
        const fields = [...html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)];
        if (!fields.length) return null; // sign-in wall / quota page, not a downloadable file
        const params = new URLSearchParams();
        for (const [, name, value] of fields) params.set(name, value.replace(/&amp;/g, '&'));
        res = await fetch(`${DRIVE_DOWNLOAD_URL}?${params.toString()}`, { redirect: 'follow', headers: extraHeaders });
        if ((res.headers.get('content-type') || '').toLowerCase().includes('text/html')) return null;
    }
    return res.ok && res.body ? res : null;
}

function fileResponse(res, isMedia = false) {
    const upstreamType = res.headers.get('content-type') || '';
    const headers = {
        ...CORS_HEADERS,
        // Media elements sniff the real format from the bytes; only PDFs need the explicit type.
        'Content-Type': !upstreamType || upstreamType.includes('octet-stream') ? (isMedia ? 'application/octet-stream' : 'application/pdf') : upstreamType
    };
    if (isMedia) {
        // A Content-Length after transparent decompression would be wrong, so only pass it for raw bytes.
        const encoded = !!res.headers.get('content-encoding');
        for (const name of MEDIA_HEADERS_TO_FORWARD) {
            const value = res.headers.get(name);
            if (value && !(encoded && name !== 'accept-ranges')) headers[name] = value;
        }
        headers['Vary'] = 'Range';
    }
    return new Response(res.body, {
        status: isMedia && res.status === 206 ? 206 : 200,
        headers
    });
}

export default async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS } });
    }

    const searchParams = new URL(request.url).searchParams;
    const id = searchParams.get('id');
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return new Response('Missing or invalid Drive file id.', { status: 400, headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS } });
    }
    const isMedia = searchParams.get('type') === 'media';
    const range = isMedia ? request.headers.get('range') : null;
    const rangeHeaders = range && /^bytes=\d*-\d*$/.test(range) ? { Range: range } : {};

    // 1) Optional: Drive API as a service account (only when its credentials are configured).
    if (Deno.env.get('GDRIVE_SA_CLIENT_EMAIL') && Deno.env.get('GDRIVE_SA_PRIVATE_KEY')) {
        try {
            const accessToken = await getAccessToken();
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
                headers: { Authorization: 'Bearer ' + accessToken, ...rangeHeaders }
            });
            if (res.ok && res.body) return fileResponse(res, isMedia);
        } catch (err) {
            console.warn('Service-account fetch failed, trying the anonymous download:', err.message);
        }
    }

    // 2) Anonymous download of public "anyone with the link" files.
    try {
        const res = await fetchDriveAnonymously(id, rangeHeaders);
        if (res) return fileResponse(res, isMedia);
        return new Response(
            'This file could not be downloaded. Make sure it is shared as "Anyone with the link can view".',
            { status: 502, headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS } }
        );
    } catch (err) {
        return new Response(`Proxy error: ${err.message}`, { status: 500, headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS } });
    }
};

export const config = { path: '/api/drive-proxy' };