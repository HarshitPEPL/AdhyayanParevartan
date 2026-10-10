// Shared URL handling for lesson media (Video Book, Audio Book) and thumbnails.
// One place decides what kind of link a material's File URL / Thumbnail URL is
// and how to turn it into something the lesson viewer can show or play.

// Drive-hosted files are read through our own Netlify edge function
// (netlify/edge-functions/drive-proxy.js), which downloads them server-side and
// re-serves them from our domain — Drive itself only hands out an HTML viewer page.
export const DRIVE_PROXY_ENDPOINT = 'https://parevartanadhayayan.in/api/drive-proxy';

// Extracts a YouTube video ID from any common URL shape (watch?v=, youtu.be/,
// embed/, shorts/), ignoring extra query params like `si`/`feature`/`t`.
export function getYouTubeVideoId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
    return match ? match[1] : null;
}

// File ID from any Google Drive share / view / preview / open / uc link.
export function getDriveFileId(url) {
    if (!url || !url.includes('drive.google.com')) return null;
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/[?&]usp=sharing.*?\b([a-zA-Z0-9_-]{10,})/);
    return idMatch ? idMatch[1] : null;
}

// Folder ID when the link points at a whole Drive folder instead of a file.
export function getDriveFolderId(url) {
    if (!url || !url.includes('drive.google.com')) return null;
    const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return folderMatch ? folderMatch[1] : null;
}

// Converts any Google Drive share/view/preview link into Drive's embeddable
// "/preview" URL. Drive links are HTML pages, not raw media files, so on their
// own they can only be shown via <iframe>, never via <video>/<audio> src.
export function getGoogleDriveEmbedUrl(url) {
    const id = getDriveFileId(url);
    return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

// Some materials were seeded with a link to a whole Drive *folder* instead of
// the individual file — there's no single document to preview in that case,
// so fall back to an embeddable folder listing instead of showing nothing.
export function getGoogleDriveFolderEmbedUrl(url) {
    const id = getDriveFolderId(url);
    return id ? `https://drive.google.com/embeddedfolderview?id=${id}#list` : null;
}

// Dropbox share links open an HTML preview page; `raw=1` serves the file itself.
function getDropboxRawUrl(url) {
    if (!/^https?:\/\/(www\.)?dropbox\.com\//i.test(url)) return null;
    try {
        const parsed = new URL(url);
        parsed.searchParams.delete('dl');
        parsed.searchParams.set('raw', '1');
        return parsed.toString();
    } catch {
        return null;
    }
}

// Sorts a material's File URL into the kinds the lesson viewer handles:
//   youtube      -> { videoId }
//   drive-folder -> { embedUrl }
//   drive-file   -> { fileId, embedUrl }
//   file         -> any other direct link (Supabase Storage, Dropbox, plain https, data:, relative path)
//   missing      -> blank / placeholder text ("NA", "TBD", ...) / not a URL at all
export function resolveMediaSource(rawUrl) {
    const url = String(rawUrl ?? '').trim();
    if (!url || /^(na|n\/a|tbd|pending|-)$/i.test(url) || !/^(https?:|data:|blob:|\/|\.)/i.test(url)) {
        return { kind: 'missing', url };
    }
    const videoId = getYouTubeVideoId(url);
    if (videoId) return { kind: 'youtube', url, videoId };
    const fileId = getDriveFileId(url);
    if (fileId) return { kind: 'drive-file', url, fileId, embedUrl: getGoogleDriveEmbedUrl(url) };
    const folderEmbedUrl = getGoogleDriveFolderEmbedUrl(url);
    if (folderEmbedUrl) return { kind: 'drive-folder', url, embedUrl: folderEmbedUrl };
    return { kind: 'file', url };
}

// Candidate URLs an <audio>/<video> element can stream directly, best first.
// The player tries them in order and moves on when one fails to load.
// (Media elements don't need CORS, so any host that serves the bytes works.)
export function getPlayableMediaSources(rawUrl) {
    const source = resolveMediaSource(rawUrl);
    if (source.kind === 'drive-file') {
        const id = encodeURIComponent(source.fileId);
        return [
            `${DRIVE_PROXY_ENDPOINT}?id=${id}&type=media`,
            // Direct download host: works for smaller public files when the proxy is unreachable.
            `https://drive.usercontent.google.com/download?id=${id}&export=download`
        ];
    }
    if (source.kind === 'file') {
        const dropbox = getDropboxRawUrl(source.url);
        return dropbox ? [dropbox, source.url] : [source.url];
    }
    return [];
}

// Turns a Thumbnail URL into something an <img> / CSS background can load.
// Drive share/preview links become Drive's thumbnail endpoint (same rule the
// admin portal uses for card previews); every other URL passes through unchanged.
export function getThumbnailImageUrl(rawUrl, width = 600) {
    const url = String(rawUrl ?? '').trim();
    if (!url || /^(na|n\/a|tbd|pending|-)$/i.test(url)) return '';
    const fileId = getDriveFileId(url);
    if (fileId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
    return getDropboxRawUrl(url) || url;
}
