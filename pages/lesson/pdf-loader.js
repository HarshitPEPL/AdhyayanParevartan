// Shared PDF.js loader. Lets the library page start downloading a book's first
// pages while the student is still hovering / touching its card, so the reader
// opens with the document already in hand.

// 3.x is the last line that ships a classic (non-module) pdf.min.js + worker on cdnjs.
const PDFJS_VERSION = '3.11.174';
let pdfjsLoadPromise = null;

export function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsLoadPromise) return pdfjsLoadPromise;
    pdfjsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
            resolve(window.pdfjsLib);
        };
        script.onerror = () => {
            pdfjsLoadPromise = null;
            reject(new Error('Failed to load PDF renderer.'));
        };
        document.head.appendChild(script);
    });
    return pdfjsLoadPromise;
}

// Read books with 1 MB range requests only. With streaming on, PDF.js also pulls the whole
// file (30-50 MB for NCERT books) in one parallel response that competes with the ranges the
// visible page needs: measured ~4 s to the first page versus ~1.8 s without it. Auto-fetch then
// loads the rest one chunk at a time, always behind requests for the page being shown.
// (disableAutoFetch + disableStream together stalls PDF.js 3.11 on these linearized books.)
export const PDF_STREAM_OPTIONS = {
    rangeChunkSize: 1024 * 1024,
    disableAutoFetch: false,
    disableStream: true
};

// One pre-opened book at a time, so hovering across cards never splits the bandwidth
// between several books and the one actually clicked.
const WARM_LIMIT = 1;
const warmed = new Map(); // url -> Promise<PDFDocumentProxy>

function isWarmable(url) {
    return /^https?:\/\//i.test(url || '') && !url.includes('drive.google.com');
}

export function warmPdf(url) {
    if (!isWarmable(url) || warmed.has(url)) return;
    while (warmed.size >= WARM_LIMIT) {
        const oldest = warmed.keys().next().value;
        warmed.get(oldest).then(doc => doc.destroy()).catch(() => {});
        warmed.delete(oldest);
    }
    const promise = loadPdfJs().then(lib => lib.getDocument({ url, ...PDF_STREAM_OPTIONS }).promise);
    promise.catch(() => warmed.delete(url));
    warmed.set(url, promise);
}

// Hands a pre-opened document to the reader (which then owns it); null if none was started.
export function takeWarmPdf(url) {
    const promise = warmed.get(url);
    if (!promise) return null;
    warmed.delete(url);
    return promise;
}
