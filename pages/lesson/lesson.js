// Logic for lesson
import { Browser } from '@capacitor/browser';

// Extracts a YouTube video ID from any common URL shape (watch?v=, youtu.be/,
// embed/, shorts/), ignoring extra query params like `si`/`feature`/`t`.
function getYouTubeVideoId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
    return match ? match[1] : null;
}

// Lazily loads the YouTube IFrame Player API (only once), so we can detect
// playback errors (e.g. the owner disabled embedding) and react to them --
// a plain <iframe src="…/embed/ID"> has no way to report that failure.
let youTubeApiPromise = null;
function loadYouTubeIframeAPI() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (youTubeApiPromise) return youTubeApiPromise;
    youTubeApiPromise = new Promise((resolve) => {
        const previousCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            previousCallback?.();
            resolve(window.YT);
        };
        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }
    });
    return youTubeApiPromise;
}

// Shows a clickable thumbnail linking straight to YouTube, used whenever the
// embedded player can't play the video (e.g. "Playback on other websites has
// been disabled by the video owner").
function showYouTubeFallback(container, videoId) {
    container.innerHTML = `
        <div style="width:100%; height:100%; position:relative; background:#000 url('https://img.youtube.com/vi/${videoId}/hqdefault.jpg') center/cover no-repeat; display:flex; align-items:center; justify-content:center;">
            <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener" style="background:rgba(0,0,0,0.75); color:#fff; padding:12px 20px; border-radius:30px; font-weight:700; font-size:14px; text-decoration:none; display:flex; align-items:center; gap:8px;">
                <i class="fa-brands fa-youtube" style="color:#FF0000; font-size:18px;"></i> Watch on YouTube
            </a>
        </div>
    `;
}

// Kept across renders so a leftover player from the previous lesson can't
// linger and fire stray events (or count against YouTube's concurrent-iframe
// limits) after the user navigates to another video.
let activeYouTubePlayer = null;
function destroyActiveYouTubePlayer() {
    if (activeYouTubePlayer && typeof activeYouTubePlayer.destroy === 'function') {
        try { activeYouTubePlayer.destroy(); } catch { /* already gone */ }
    }
    activeYouTubePlayer = null;
}

function renderYouTubePlayer(container, videoId, reportProgress) {
    destroyActiveYouTubePlayer();
    const playerDivId = `yt-player-${videoId}-${Date.now()}`;
    const playerDiv = document.createElement('div');
    playerDiv.id = playerDivId;
    playerDiv.style.cssText = 'width:100%; height:100%;';
    container.appendChild(playerDiv);

    loadYouTubeIframeAPI().then((YT) => {
        // The lesson may have been navigated away from before the API loaded.
        if (!document.getElementById(playerDivId)) return;
        activeYouTubePlayer = new YT.Player(playerDivId, {
            videoId,
            playerVars: { rel: 0, modestbranding: 1 },
            events: {
                onReady: () => reportProgress(100),
                // Only fall back for codes that mean the video can NEVER play
                // here: 100/101/150 = removed, private, or embedding disabled
                // by the owner. Other codes (2 = bad param, 5 = HTML5 glitch)
                // are transient/recoverable, so keep the player instead of
                // hiding a video that actually works.
                onError: (e) => {
                    if ([100, 101, 150].includes(e?.data)) {
                        showYouTubeFallback(container, videoId);
                    }
                }
            }
        });
    }).catch(() => showYouTubeFallback(container, videoId));
}

// Lazily loads Mozilla's PDF.js (only once) so PDFs can be rasterized onto a
// <canvas> and shown right inside the app — Android's WebView has no built-in
// PDF plugin, so a plain <iframe src="file.pdf"> just shows a blank page there.
const PDFJS_VERSION = '4.7.76';
let pdfjsLoadPromise = null;
function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsLoadPromise) return pdfjsLoadPromise;
    pdfjsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
            resolve(window.pdfjsLib);
        };
        script.onerror = () => reject(new Error('Failed to load PDF renderer.'));
        document.head.appendChild(script);
    });
    return pdfjsLoadPromise;
}

// Renders a PDF page-by-page onto a <canvas>, inside the shared reader shell
// used elsewhere on this page. On success returns a controller object the
// caller uses to wire up the shared page/zoom toolbar; on any failure (e.g.
// the host blocks cross-origin fetches) it returns false so the caller can
// fall back to an "open externally" screen (or, on web, the Drive iframe).
async function renderPdfInline(container, pdfUrl) {
    try {
        const pdfjsLib = await loadPdfJs();
        const pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;

        container.innerHTML = `
            <div class="pdf-canvas-scroll">
                <canvas id="pdf-render-canvas"></canvas>
            </div>
        `;

        const canvas = container.querySelector('#pdf-render-canvas');
        const ctx = canvas.getContext('2d');
        const scrollEl = container.querySelector('.pdf-canvas-scroll');
        let currentPage = 1;
        let zoomFactor = 1;
        let renderTask = null;

        const renderPage = async (num) => {
            const page = await pdfDoc.getPage(num);
            const unscaledViewport = page.getViewport({ scale: 1 });
            const targetWidth = Math.max(scrollEl.clientWidth - 16, 100);
            const fitScale = targetWidth / unscaledViewport.width;
            const viewport = page.getViewport({ scale: fitScale * zoomFactor });
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            renderTask?.cancel();
            renderTask = page.render({ canvasContext: ctx, viewport });
            await renderTask.promise;
            scrollEl.scrollTop = 0;
        };

        await renderPage(currentPage);

        return {
            numPages: pdfDoc.numPages,
            getCurrentPage: () => currentPage,
            getZoom: () => zoomFactor,
            goToPage: async (num) => {
                const target = Math.min(Math.max(1, num), pdfDoc.numPages);
                if (target !== currentPage) {
                    currentPage = target;
                    await renderPage(currentPage);
                }
                return currentPage;
            },
            setZoom: async (factor) => {
                zoomFactor = Math.min(Math.max(0.5, factor), 3);
                await renderPage(currentPage);
                return zoomFactor;
            }
        };
    } catch (err) {
        console.error('Inline PDF render failed, falling back to external open:', err);
        return false;
    }
}

// Converts any Google Drive share/view/preview link into Drive's embeddable
// "/preview" URL. Drive links are HTML pages, not raw media files, so they
// can only be shown via <iframe>, never via <video>/<audio> src.
function getGoogleDriveEmbedUrl(url) {
    if (!url || !url.includes('drive.google.com')) return null;
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/[?&]usp=sharing.*?\b([a-zA-Z0-9_-]{10,})/);
    return idMatch ? `https://drive.google.com/file/d/${idMatch[1]}/preview` : null;
}

// Some materials were seeded with a link to a whole Drive *folder* instead of
// the individual file — there's no single document to preview in that case,
// so fall back to an embeddable folder listing instead of showing nothing.
function getGoogleDriveFolderEmbedUrl(url) {
    if (!url || !url.includes('drive.google.com')) return null;
    const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return folderMatch ? `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#list` : null;
}

function getSafePdfUrl(fileUrl) {
    if (!fileUrl) return '';
    if (fileUrl.includes('drive.google.com')) {
        const match = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
    return fileUrl;
}

// Google Drive's file-serving endpoints never send Access-Control-Allow-Origin,
// so PDF.js's in-browser fetch() can never read the bytes directly — route
// Drive-hosted PDFs through our own CORS-enabled proxy (netlify/edge-functions/
// drive-proxy.js) instead, which fetches the file server-side (unaffected by
// CORS) and re-serves it with CORS open. Non-Drive URLs pass through unchanged.
const DRIVE_PROXY_ENDPOINT = 'https://parevartanadhayayan.in/api/drive-proxy';
function getInlineRenderablePdfSrc(fileUrl) {
    if (!fileUrl) return '';
    if (fileUrl.includes('drive.google.com')) {
        const match = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (match) return `${DRIVE_PROXY_ENDPOINT}?id=${match[1]}`;
    }
    return fileUrl;
}


export function init(navigateTo, state) {
    const mat = state.activeMaterial;
    if (!mat) {
        navigateTo('courses');
        return;
    }

    const classNum = state.selectedClass || (state.currentUser ? state.currentUser.class_number : 9) || 9;
    const backRoute = state.lastLibraryRoute || 'courses';

    document.getElementById('lesson-title-inline').textContent = mat.title;
    document.getElementById('lesson-subject-inline').textContent = `Class ${classNum} - ${mat.subject_name}`;
    document.getElementById('lesson-title').textContent = mat.title;
    document.getElementById('lesson-meta-title').textContent = mat.title;
    document.getElementById('lesson-meta-class').textContent = classNum;
    document.getElementById('lesson-meta-subject').textContent = mat.subject_name;
    document.getElementById('lesson-format').textContent = mat.format_name;
    document.getElementById('lesson-duration').textContent = mat.duration_lessons || 'N/A';
    document.getElementById('lesson-instructor').textContent = mat.instructor_name || 'Unknown Author';
    document.getElementById('lesson-chapter').textContent = mat.chapter_number ? `Chapter ${mat.chapter_number}` : '-';

    // Top-left overlay back button: exits fullscreen first (if active) so the
    // user always lands back in the normal view before navigating away.
    const backOverlayBtn = document.getElementById('lesson-back-overlay-btn');
    if (backOverlayBtn) {
        const goBack = async () => {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                try {
                    if (document.exitFullscreen) await document.exitFullscreen();
                    else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
                } catch (err) {
                    console.error('Exit fullscreen failed:', err);
                }
            }
            navigateTo(backRoute);
        };
        backOverlayBtn.addEventListener('click', goBack);
        backOverlayBtn.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                goBack();
            }
        });
    }

    // --- Shared PDF page/zoom toolbar (topbar badge + bottom bar) --------
    // Hidden by default; only wired up + shown once a PDF actually renders
    // inline via PDF.js, since video/audio/Drive embeds have no page/zoom concept.
    const readerPageBadge = document.getElementById('reader-page-badge');
    const readerBottombar = document.getElementById('reader-bottombar');
    const zoomGroups = document.querySelectorAll('.reader-zoom-group');
    const fitButtons = document.querySelectorAll('.reader-icon-fit');
    const prevPageBtn = document.getElementById('pdf-prev-page');
    const nextPageBtn = document.getElementById('pdf-next-page');
    const pageSelect = document.getElementById('pdf-page-select');
    const pageSelectWrap = document.querySelector('.reader-page-select-wrap');

    function setPdfControlsVisible(visible) {
        if (readerPageBadge) readerPageBadge.style.display = visible ? '' : 'none';
        zoomGroups.forEach((g) => { g.style.display = visible ? '' : 'none'; });
        fitButtons.forEach((b) => { b.style.display = visible ? '' : 'none'; });
        if (readerBottombar) readerBottombar.style.display = visible ? 'flex' : 'none';
    }
    setPdfControlsVisible(false);

    function updatePdfPageUi(controller) {
        const current = controller.getCurrentPage();
        if (readerPageBadge) readerPageBadge.textContent = `Page ${current}/${controller.numPages}`;
        if (pageSelect) pageSelect.value = String(current);
        if (prevPageBtn) prevPageBtn.disabled = current <= 1;
        if (nextPageBtn) nextPageBtn.disabled = current >= controller.numPages;
    }

    function updatePdfZoomUi(controller) {
        const pct = Math.round(controller.getZoom() * 100);
        document.querySelectorAll('.reader-zoom-level').forEach((el) => { el.textContent = `${pct}%`; });
    }

    function wirePdfControls(controller) {
        setPdfControlsVisible(true);
        const hasMultiplePages = controller.numPages > 1;
        if (prevPageBtn) prevPageBtn.style.display = hasMultiplePages ? '' : 'none';
        if (nextPageBtn) nextPageBtn.style.display = hasMultiplePages ? '' : 'none';
        if (pageSelectWrap) pageSelectWrap.style.display = hasMultiplePages ? '' : 'none';
        if (pageSelect) {
            pageSelect.innerHTML = Array.from({ length: controller.numPages }, (_, i) =>
                `<option value="${i + 1}">${i + 1} / ${controller.numPages}</option>`
            ).join('');
        }

        updatePdfPageUi(controller);
        updatePdfZoomUi(controller);

        prevPageBtn?.addEventListener('click', async () => {
            await controller.goToPage(controller.getCurrentPage() - 1);
            updatePdfPageUi(controller);
        });
        nextPageBtn?.addEventListener('click', async () => {
            await controller.goToPage(controller.getCurrentPage() + 1);
            updatePdfPageUi(controller);
        });
        pageSelect?.addEventListener('change', async (event) => {
            await controller.goToPage(parseInt(event.target.value, 10));
            updatePdfPageUi(controller);
        });
        document.querySelectorAll('.reader-zoom-in').forEach((btn) => btn.addEventListener('click', async () => {
            await controller.setZoom(controller.getZoom() + 0.1);
            updatePdfZoomUi(controller);
        }));
        document.querySelectorAll('.reader-zoom-out').forEach((btn) => btn.addEventListener('click', async () => {
            await controller.setZoom(controller.getZoom() - 0.1);
            updatePdfZoomUi(controller);
        }));
        fitButtons.forEach((btn) => btn.addEventListener('click', async () => {
            await controller.setZoom(1);
            updatePdfZoomUi(controller);
        }));
    }

    // --- Settings ("gear") popover menu: houses the less-frequent actions
    // (wishlist / open externally) so the toolbar itself stays uncluttered.
    function wireSettingsMenu(onToggleWishlist, onOpenExternal, getIsWishlisted) {
        document.querySelectorAll('.reader-settings-wrap').forEach((wrap) => {
            const trigger = wrap.querySelector('.reader-icon-settings');
            if (!trigger) return;
            trigger.addEventListener('click', (event) => {
                event.stopPropagation();
                document.querySelectorAll('.reader-settings-menu').forEach((m) => m.remove());
                const isWishlisted = !!getIsWishlisted?.();
                const menu = document.createElement('div');
                menu.className = 'reader-settings-menu';
                menu.innerHTML = `
                    <button type="button" data-action="wishlist"><i class="fa-${isWishlisted ? 'solid' : 'regular'} fa-heart"></i> ${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}</button>
                    ${onOpenExternal ? '<button type="button" data-action="external"><i class="fa-solid fa-up-right-from-square"></i> Open Externally</button>' : ''}
                `;
                menu.querySelector('[data-action="wishlist"]')?.addEventListener('click', () => {
                    menu.remove();
                    onToggleWishlist?.();
                });
                menu.querySelector('[data-action="external"]')?.addEventListener('click', () => {
                    menu.remove();
                    onOpenExternal?.();
                });
                wrap.appendChild(menu);
                const closeMenu = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeMenu), 0);
            });
        });
    }


    const viewerContainer = document.getElementById('lesson-viewer-container');
    const ext = mat.file_url.split('.').pop().toLowerCase();
    const isDataUrl = mat.file_url.startsWith('data:');
    const youTubeVideoId = getYouTubeVideoId(mat.file_url);
    const driveEmbedUrl = getGoogleDriveEmbedUrl(mat.file_url);
    const driveFolderEmbedUrl = getGoogleDriveFolderEmbedUrl(mat.file_url);
    // Google blocks its own sign-in flow inside embedded WebViews ("This
    // browser or app may not be secure"), so any drive.google.com iframe shows
    // a broken "Can't access your Google Account" prompt on native Android —
    // open Drive links in the system browser there instead of iframing them.
    // NOTE: must check isNativePlatform() (not just `window.Capacitor`, which
    // exists in every Capacitor-bundled build even when running as a plain
    // website) and must NOT blanket-match `/Android/i` — that regex matches
    // every Android phone's browser too, breaking the website's PDF viewer
    // for all Android visitors, not just the native app.
    const isNativeAndroid = !!(window.Capacitor?.isNativePlatform?.() || window.cordova || navigator.userAgent.includes('wv'));
    const openExternalLink = (url) => {
        // Statically imported above so the plugin is guaranteed to be registered
        // by the time this runs (relying on window.Capacitor.Plugins.Browser here
        // silently fails if that plugin was never loaded elsewhere in this session).
        if (window.Capacitor?.isNativePlatform?.()) {
            Browser.open({ url }).catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const userId = state.currentUser?.user_id;
    function reportProgress(percent) {
        window.adhyayan?.setMaterialProgress?.(userId, mat, percent);
    }

    // Add a wrapper for fullscreen capabilities
    viewerContainer.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center;';

    if (youTubeVideoId) {
        renderYouTubePlayer(wrapper, youTubeVideoId, reportProgress);
    } else if (driveEmbedUrl) {
        if (isNativeAndroid && mat.format_name !== 'E-Book') {
            // Non-E-Book Drive content (video/audio) genuinely hits Google's
            // embedded sign-in wall in native WebViews — open externally.
            wrapper.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center; color:#fff; width:100%; height:100%; background:linear-gradient(180deg, #111827, #1f2937);">
                    <i class="fa-brands fa-google-drive" style="font-size:3rem; margin-bottom:16px; color:#8ab4f8;"></i>
                    <div style="font-size:1.05rem; font-weight:700; margin-bottom:8px;">Ready to open</div>
                    <div style="font-size:0.82rem; opacity:0.8; margin-bottom:18px; max-width: 300px; line-height:1.5;">Google Drive can't be viewed inside the app. Open it in your browser to read the file.</div>
                    <button class="btn btn-primary" id="drive-open-external" style="padding:10px 18px; border-radius: 999px; font-weight:700;">Open in Google Drive</button>
                </div>
            `;
            wrapper.querySelector('#drive-open-external')?.addEventListener('click', () => {
                openExternalLink(mat.file_url);
                reportProgress(100);
            });
            reportProgress(40);
        } else {
            // Google Drive links are HTML pages, not playable media files — embed
            // via iframe instead of a <video>/<audio> tag (which would fail to load it).
            // E-Book PDFs render fine this way in the native WebView too (Drive's
            // sign-in wall only triggers for video/audio pages, not the PDF preview),
            // so avoid the PDF.js/CORS-proxy pipeline here — it depends on a
            // server-side Google service account that may not be configured.
            wrapper.innerHTML = `<iframe src="${driveEmbedUrl}" style="width:100%; height:100%; border:none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
            // No reliable playback-progress API for cross-origin embeds, so just mark it viewed.
            reportProgress(100);
        }
    } else if (driveFolderEmbedUrl) {
        if (isNativeAndroid) {
            wrapper.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center; color:#fff; width:100%; height:100%; background:linear-gradient(180deg, #111827, #1f2937);">
                    <i class="fa-brands fa-google-drive" style="font-size:3rem; margin-bottom:16px; color:#8ab4f8;"></i>
                    <div style="font-size:1.05rem; font-weight:700; margin-bottom:8px;">This links to a Drive folder</div>
                    <div style="font-size:0.82rem; opacity:0.8; margin-bottom:18px; max-width: 300px; line-height:1.5;">Open the folder in your browser and find "${(mat.title || '').replace(/"/g, '&quot;')}".</div>
                    <button class="btn btn-primary" id="drive-folder-open-external" style="padding:10px 18px; border-radius: 999px; font-weight:700;">Open Folder in Google Drive</button>
                </div>
            `;
            wrapper.querySelector('#drive-folder-open-external')?.addEventListener('click', () => {
                openExternalLink(mat.file_url);
                reportProgress(30);
            });
        } else {
            // This material was linked to an entire Drive folder rather than a
            // specific file — there's nothing to render directly, so show the
            // folder contents so the user can find/open the right file themselves.
            wrapper.innerHTML = `
                <div style="display:flex; flex-direction:column; width:100%; height:100%;">
                    <div style="background:#fef3c7; color:#92400e; font-size:0.8rem; font-weight:600; padding:10px 14px; text-align:center;">
                        This material links to a folder, not a single file. Browse below to find "${(mat.title || '').replace(/"/g, '&quot;')}".
                    </div>
                    <iframe src="${driveFolderEmbedUrl}" style="width:100%; height:100%; border:none; flex:1;" allow="autoplay"></iframe>
                </div>
            `;
            reportProgress(30);
        }
    } else if (ext === 'mp4' || ext === 'webm' || ext === 'ogg' || mat.format_name === 'Video Content' || (isDataUrl && mat.file_url.includes('video'))) {
        wrapper.innerHTML = `<video controls style="width: 100%; height: 100%; max-height: 100%;"><source src="${mat.file_url}">Your browser does not support the video tag.</video>`;
        const videoEl = wrapper.querySelector('video');
        if (videoEl) {
            reportProgress(1);
            let lastReported = 0;
            videoEl.addEventListener('timeupdate', () => {
                if (!videoEl.duration) return;
                const now = Date.now();
                if (now - lastReported < 3000) return; // throttle writes
                lastReported = now;
                reportProgress((videoEl.currentTime / videoEl.duration) * 100);
            });
            videoEl.addEventListener('ended', () => reportProgress(100));
        }
    } else if (ext === 'mp3' || ext === 'wav' || mat.format_name === 'Audio Book' || (isDataUrl && mat.file_url.includes('audio'))) {
        wrapper.innerHTML = `<div style="text-align:center; width: 100%;"><i class="fa-solid fa-headphones" style="font-size: 4rem; color: #aaa; margin-bottom: 20px;"></i><br><audio controls style="width: 80%;"><source src="${mat.file_url}">Your browser does not support the audio tag.</audio></div>`;
        const audioEl = wrapper.querySelector('audio');
        if (audioEl) {
            reportProgress(1);
            let lastReported = 0;
            audioEl.addEventListener('timeupdate', () => {
                if (!audioEl.duration) return;
                const now = Date.now();
                if (now - lastReported < 3000) return;
                lastReported = now;
                reportProgress((audioEl.currentTime / audioEl.duration) * 100);
            });
            audioEl.addEventListener('ended', () => reportProgress(100));
        }
    } else if (ext === 'pdf' || (isDataUrl && mat.file_url.includes('pdf'))) {
        let pdfUrl = getSafePdfUrl(mat.file_url);
        if (isDataUrl) {
            try {
                const byteString = atob(mat.file_url.split(',')[1]);
                const mimeString = mat.file_url.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], {type: mimeString});
                pdfUrl = URL.createObjectURL(blob);
            } catch (e) {
                console.error("Error converting PDF data URL to blob URL", e);
            }
        }

        const openPdfInBrowser = () => {
            // blob: URLs only exist in this page's memory — an external browser/tab
            // can't resolve them, so fall back to the original self-contained data: URL.
            const targetUrl = isDataUrl ? mat.file_url : (pdfUrl || mat.file_url);
            openExternalLink(targetUrl);
            reportProgress(100);
        };

        const showPdfOpenFallback = () => {
            wrapper.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center; color:#fff; width:100%; height:100%; background:linear-gradient(180deg, #111827, #1f2937);">
                    <i class="fa-solid fa-file-pdf" style="font-size:3rem; margin-bottom:16px; color:#f8d7da;"></i>
                    <div style="font-size:1.05rem; font-weight:700; margin-bottom:8px;">PDF ready to open</div>
                    <div style="font-size:0.82rem; opacity:0.8; margin-bottom:18px; max-width: 300px; line-height:1.5;">Couldn't render this PDF inline. Open it in the browser to read the file.</div>
                    <button class="btn btn-primary" id="pdf-open-external" style="padding:10px 18px; border-radius: 999px; font-weight:700;">Open PDF</button>
                </div>
            `;
            wrapper.querySelector('#pdf-open-external')?.addEventListener('click', openPdfInBrowser);
            reportProgress(40);
        };

        // Try the custom PDF.js/canvas UI first everywhere (matches the
        // reader's shared page/zoom toolbar); only degrade to a fallback when
        // it genuinely can't render (blocked cross-origin fetch, etc.).
        const inlineSrc = isDataUrl ? pdfUrl : getInlineRenderablePdfSrc(mat.file_url);
        wrapper.innerHTML = `<div style="color:#374151; font-size:0.85rem;">Loading…</div>`;

        renderPdfInline(wrapper, inlineSrc).then((controller) => {
            if (controller) {
                wirePdfControls(controller);
                reportProgress(40);
                return;
            }
            if (isNativeAndroid) {
                // No web-only iframe fallback available inside the native WebView.
                showPdfOpenFallback();
                return;
            }
            // Web fallback: Google's own viewer still renders the PDF, just
            // without our custom page/zoom toolbar (it has its own chrome).
            const resolvedPdfSrc = pdfUrl || mat.file_url;
            const isRemotePdf = /^https?:\/\//i.test(resolvedPdfSrc);
            const pdfViewerSrc = isRemotePdf
                ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(resolvedPdfSrc)}`
                : resolvedPdfSrc;
            wrapper.innerHTML = `<iframe src="${pdfViewerSrc}" class="reader-iframe" allowfullscreen title="PDF Viewer"></iframe>`;
            reportProgress(40);
        });
    } else {
        // Placeholder/blank links ("Na", "N/A", "TBD", empty, or anything that
        // isn't even a URL) mean no content was actually attached to this
        // material — say so plainly instead of a generic "wrong format" message.
        const looksLikeMissingLink = !mat.file_url
            || /^(na|n\/a|tbd|pending|-)$/i.test(mat.file_url.trim())
            || !/^(https?:|data:|\/)/i.test(mat.file_url.trim());
        wrapper.innerHTML = looksLikeMissingLink
            ? `<div style="text-align:center; color: #fff;"><i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; margin-bottom: 10px; color:#fbbf24;"></i><br>This material has no content link yet.<br><span style="font-size:0.8rem; opacity:0.75;">Please check back later or contact your teacher.</span></div>`
            : `<div style="text-align:center; color: #fff;"><i class="fa-solid fa-file" style="font-size: 3rem; margin-bottom: 10px;"></i><br>Preview not available for this format.</div>`;
        reportProgress(100);
    }
    viewerContainer.appendChild(wrapper);

    const fullScreenToggles = document.querySelectorAll('.reader-icon-fullscreen');
    const fullscreenExitBtn = document.getElementById('lesson-fullscreen-exit-btn');

    // Elements outside the fullscreen element's subtree aren't painted while
    // it's active, so the overlay buttons must move inside it to stay visible.
    // Remember their original spot to restore it once fullscreen exits.
    const overlayHomes = [backOverlayBtn, fullscreenExitBtn]
        .filter(Boolean)
        .map((el) => ({ el, parent: el.parentNode, next: el.nextSibling }));

    if (fullScreenToggles.length) {
        const toggleFullscreen = async () => {
            const container = document.getElementById('lesson-viewer-container');
            if (!container) return;

            try {
                if (!document.fullscreenElement) {
                    if (container.requestFullscreen) {
                        await container.requestFullscreen();
                    } else if (container.webkitRequestFullscreen) {
                        await container.webkitRequestFullscreen();
                    }
                } else if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    await document.webkitExitFullscreen();
                }
            } catch (err) {
                console.error('Fullscreen toggle failed:', err);
            }
        };

        // Handle fullscreenchange event to show/hide exit button
        const handleFullscreenChange = () => {
            const fullscreenEl = document.fullscreenElement || document.webkitFullscreenElement;
            if (fullscreenEl) {
                // Entered fullscreen: move overlay buttons inside so they render on top.
                overlayHomes.forEach(({ el }) => fullscreenEl.appendChild(el));
                if (fullscreenExitBtn) {
                    fullscreenExitBtn.style.display = 'flex';
                    fullscreenExitBtn.setAttribute('aria-hidden', 'false');
                }
            } else {
                // Exited fullscreen: restore overlay buttons to their original spot.
                overlayHomes.forEach(({ el, parent, next }) => parent.insertBefore(el, next));
                if (fullscreenExitBtn) {
                    fullscreenExitBtn.style.display = 'none';
                    fullscreenExitBtn.setAttribute('aria-hidden', 'true');
                }
            }
        };

        // Listen for fullscreen changes
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        fullScreenToggles.forEach((toggle) => {
            toggle.addEventListener('click', toggleFullscreen);
            toggle.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleFullscreen();
                }
            });
        });
    }

    // Exit fullscreen button handler
    if (fullscreenExitBtn) {
        fullscreenExitBtn.addEventListener('click', async () => {
            try {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    await document.webkitExitFullscreen();
                }
            } catch (err) {
                console.error('Exit fullscreen failed:', err);
            }
        });

        fullscreenExitBtn.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fullscreenExitBtn.click();
            }
        });
    }


    const wishlistBtn = document.getElementById('lesson-wishlist-btn');
    const wishlistIcon = document.getElementById('lesson-wishlist-icon');
    const wishlistText = document.getElementById('lesson-wishlist-text');
    const isWishlisted = () => !!window.adhyayan?.isInWishlist?.(userId, mat.material_id);

    const refreshWishlistUi = () => {
        const wishlisted = isWishlisted();
        if (wishlistIcon) wishlistIcon.className = `fa-${wishlisted ? 'solid' : 'regular'} fa-heart`;
        if (wishlistText) wishlistText.textContent = wishlisted ? 'Remove from Wishlist' : 'Add to Wishlist';
        wishlistBtn?.classList.toggle('active', wishlisted);
    };

    const toggleWishlist = () => {
        if (isWishlisted()) {
            window.adhyayan?.removeFromWishlist?.(userId, mat.material_id);
        } else {
            window.adhyayan?.addToWishlist?.(userId, mat);
        }
        refreshWishlistUi();
    };

    refreshWishlistUi();
    if (wishlistBtn) {
        wishlistBtn.onclick = toggleWishlist;
    }

    // Gear icon menu (topbar + bottom toolbar): wishlist / open externally.
    wireSettingsMenu(toggleWishlist, isDataUrl ? null : () => openExternalLink(mat.file_url), isWishlisted);
}
