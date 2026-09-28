// Google Drive's direct-download endpoint never sends an
// Access-Control-Allow-Origin header, so browser JS (fetch/XHR) can never
// read its response cross-origin — that's what blocks PDF.js from rendering
// Drive-hosted e-books directly inside the app. This Edge Function fetches
// the file server-side (no CORS applies to server-to-server requests) and
// re-serves the bytes from our own domain with CORS wide open.
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=3600'
};

export default async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return new Response('Missing or invalid Drive file id.', { status: 400, headers: CORS_HEADERS });
    }

    try {
        let res = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { redirect: 'follow' });
        const contentType = res.headers.get('content-type') || '';

        // Large files (~100MB+) get an HTML "can't scan for viruses" interstitial
        // with a hidden confirm token instead of the file itself — follow it.
        if (contentType.includes('text/html')) {
            const html = await res.text();
            const confirmMatch = html.match(/confirm=([0-9A-Za-z_-]+)/) || html.match(/name="confirm"\s+value="([0-9A-Za-z_-]+)"/);
            const uuidMatch = html.match(/uuid=([0-9A-Za-z_-]+)/);
            if (!confirmMatch) {
                return new Response('Google Drive did not return a file for this id.', { status: 502, headers: CORS_HEADERS });
            }
            const uuidParam = uuidMatch ? `&uuid=${uuidMatch[1]}` : '';
            res = await fetch(`https://drive.google.com/uc?export=download&id=${id}&confirm=${confirmMatch[1]}${uuidParam}`, { redirect: 'follow' });
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
