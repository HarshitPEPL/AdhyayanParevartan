// Logic for lesson
import { Browser } from '@capacitor/browser';
import { createPdfReader } from './pdf-reader.js';

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

// hooks (all provided by the lesson page):
//   touch()               - record that the video was opened (refreshes last_accessed_at only)
//   getStartAt()          - Promise<seconds> to resume from (0 = start)
//   save({position, duration, force}) - throttled progress save
//   ended() / flush()     - mark finished / push pending progress to the backend now
//   onSnapshot(fn)        - register "save the exact position now" (tab hidden / lesson left)
//   onCleanup(fn)         - register timer cleanup to run when the lesson is left
function renderYouTubePlayer(container, videoId, hooks) {
    destroyActiveYouTubePlayer();
    const playerDivId = `yt-player-${videoId}-${Date.now()}`;
    const playerDiv = document.createElement('div');
    playerDiv.id = playerDivId;
    playerDiv.style.cssText = 'width:100%; height:100%;';
    container.appendChild(playerDiv);

    hooks.touch();

    loadYouTubeIframeAPI().then(async (YT) => {
        // The lesson may have been navigated away from before the API loaded.
        if (!document.getElementById(playerDivId)) return;
        const startAt = Math.max(0, Math.floor(Number(await hooks.getStartAt()) || 0));
        if (!document.getElementById(playerDivId)) return;

        const POLL_MS = 5000;
        let pollTimer = null;
        let player = null;
        const stopPolling = () => { clearInterval(pollTimer); pollTimer = null; };
        const snapshot = (force) => {
            if (!player || player !== activeYouTubePlayer || typeof player.getCurrentTime !== 'function') return;
            hooks.save({ position: player.getCurrentTime(), duration: player.getDuration?.(), force });
        };
        const states = YT.PlayerState || { ENDED: 0, PLAYING: 1, PAUSED: 2 };

        player = new YT.Player(playerDivId, {
            videoId,
            playerVars: { rel: 0, modestbranding: 1, start: startAt },
            events: {
                onStateChange: (e) => {
                    if (e?.data === states.PLAYING) {
                        snapshot(true);
                        if (!pollTimer) pollTimer = setInterval(() => snapshot(false), POLL_MS);
                    } else if (e?.data === states.ENDED) {
                        stopPolling();
                        hooks.ended(player?.getDuration?.());
                    } else if (e?.data === states.PAUSED) {
                        stopPolling();
                        snapshot(true);
                        hooks.flush();
                    }
                },
                // Only fall back for codes that mean the video can NEVER play
                // here: 100/101/150 = removed, private, or embedding disabled
                // by the owner. Other codes (2 = bad param, 5 = HTML5 glitch)
                // are transient/recoverable, so keep the player instead of
                // hiding a video that actually works.
                onError: (e) => {
                    if ([100, 101, 150].includes(e?.data)) {
                        stopPolling();
                        showYouTubeFallback(container, videoId);
                    }
                }
            }
        });
        activeYouTubePlayer = player;
        hooks.onSnapshot(() => snapshot(true));
        hooks.onCleanup(stopPolling);
    }).catch(() => showYouTubeFallback(container, videoId));
}

// Lazily loads Mozilla's PDF.js (only once) so PDFs can be rasterized onto a
// <canvas> and shown right inside the app — Android's WebView has no built-in
// PDF plugin, so a plain <iframe src="file.pdf"> just shows a blank page there.
// 3.x is the last line that ships a classic (non-module) pdf.min.js + worker on cdnjs.
const PDFJS_VERSION = '3.11.174';
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

// Renders a PDF page-by-page inside the shared reader shell used elsewhere on this
// page (see pdf-reader.js for the fit / pinch / pan / zoom engine). `pdfUrls` is one URL
// or a list of candidates tried in order. On success returns a controller the caller uses
// to wire up the shared page/zoom toolbar; if none of them can be read as a PDF it returns
// false so the caller can fall back (Drive iframe on web, "open" screen on the native app).
async function renderPdfInline(container, pdfUrls) {
    const candidates = (Array.isArray(pdfUrls) ? pdfUrls : [pdfUrls]).filter(Boolean);
    let pdfjsLib;
    try {
        pdfjsLib = await loadPdfJs();
    } catch (err) {
        console.error('PDF renderer failed to load:', err);
        return false;
    }
    for (const url of candidates) {
        try {
            // The proxy streams the whole file in one response, so range requests are skipped.
            const pdfDoc = await pdfjsLib.getDocument({ url, disableRange: url.startsWith(DRIVE_PROXY_ENDPOINT) }).promise;
            return await createPdfReader(container, pdfDoc);
        } catch (err) {
            console.warn('Inline PDF source failed, trying the next one:', url.slice(0, 80), err?.message || err);
        }
    }
    return false;
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

// Google Drive refuses to hand file bytes to a browser: the legacy `uc?export=download` link has no
// CORS headers and `drive.usercontent.google.com/download` answers 403 to cross-site browser fetches.
// So Drive-hosted PDFs are read through our own Netlify function (netlify/edge-functions/
// drive-proxy.js), which downloads them server-side and re-serves them with CORS open.
// Non-Drive URLs pass through unchanged.
const DRIVE_PROXY_ENDPOINT = 'https://parevartanadhayayan.in/api/drive-proxy';
function getInlineRenderablePdfSources(fileUrl) {
    if (!fileUrl) return [];
    if (fileUrl.includes('drive.google.com')) {
        const match = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (match) return [`${DRIVE_PROXY_ENDPOINT}?id=${match[1]}`];
    }
    return [fileUrl];
}


// "12" for an e-book means 12 pages; text that already has a unit ("43 pages", "20 mins")
// is kept as written. Other formats are shown unchanged.
function formatMaterialDuration(mat) {
    const raw = String(mat.duration_lessons ?? '').trim();
    if (!raw || /^(na|n\/a|tbd|pending|-)$/i.test(raw)) return 'N/A';
    if (mat.format_name === 'E-Book' && /^\d+$/.test(raw)) {
        const pages = Number(raw);
        return `${pages} ${pages === 1 ? 'page' : 'pages'}`;
    }
    return raw;
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
    document.getElementById('lesson-duration').textContent = formatMaterialDuration(mat);
    document.getElementById('lesson-instructor').textContent = mat.instructor_name || 'Unknown Author';
    document.getElementById('lesson-chapter').textContent = mat.chapter_number ? String(mat.chapter_number) : '-';

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
        const total = controller.numPages;
        if (readerPageBadge) readerPageBadge.textContent = `Page ${current}/${total}`;
        if (pageSelect) pageSelect.value = String(current);
        if (prevPageBtn) prevPageBtn.disabled = current <= 1;
        if (nextPageBtn) nextPageBtn.disabled = current >= total;
        // Pages left behind count as completed; reaching the last page finishes the lesson.
        reportProgress(0, {
            lastPage: current,
            totalPages: total,
            pagesCompleted: current >= total ? total : current - 1
        });
    }

    function updatePdfZoomUi(controller) {
        const zoom = controller.getZoom();
        const pct = Math.round(zoom * 100);
        document.querySelectorAll('.reader-zoom-level').forEach((el) => { el.textContent = `${pct}%`; });
        document.querySelectorAll('.reader-zoom-in').forEach((btn) => { btn.disabled = zoom >= controller.maxZoom - 0.001; });
        document.querySelectorAll('.reader-zoom-out').forEach((btn) => { btn.disabled = zoom <= controller.minZoom + 0.001; });
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

        // Gestures, wheel and keyboard change page/zoom inside the viewer, so the
        // toolbar (page counter, selector, % label) listens to the viewer, not the buttons.
        controller.onPageChange(() => updatePdfPageUi(controller));
        controller.onZoomChange(() => updatePdfZoomUi(controller));
        registerCleanup(() => controller.destroy());

        prevPageBtn?.addEventListener('click', () => controller.goToPage(controller.getCurrentPage() - 1));
        nextPageBtn?.addEventListener('click', () => controller.goToPage(controller.getCurrentPage() + 1));
        pageSelect?.addEventListener('change', (event) => controller.goToPage(parseInt(event.target.value, 10)));
        document.querySelectorAll('.reader-zoom-in').forEach((btn) => btn.addEventListener('click', () => controller.zoomIn()));
        document.querySelectorAll('.reader-zoom-out').forEach((btn) => btn.addEventListener('click', () => controller.zoomOut()));
        fitButtons.forEach((btn) => btn.addEventListener('click', () => controller.fit()));
    }

    // --- Settings ("gear") popover menu: houses the less-frequent actions
    // (wishlist / open externally) so the toolbar itself stays uncluttered.
    function wireSettingsMenu(onToggleWishlist, onOpenExternal, getIsWishlisted, canOpenExternal = () => true) {
        document.querySelectorAll('.reader-settings-wrap').forEach((wrap) => {
            const trigger = wrap.querySelector('.reader-icon-settings');
            if (!trigger) return;
            trigger.addEventListener('click', (event) => {
                event.stopPropagation();
                document.querySelectorAll('.reader-settings-menu').forEach((m) => m.remove());
                const isWishlisted = !!getIsWishlisted?.();
                // The book itself never leaves the app: no "Open Externally" while it is in our viewer.
                const showExternal = !!onOpenExternal && canOpenExternal();
                const menu = document.createElement('div');
                menu.className = 'reader-settings-menu';
                menu.innerHTML = `
                    <button type="button" data-action="wishlist"><i class="fa-${isWishlisted ? 'solid' : 'regular'} fa-heart"></i> ${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}</button>
                    ${showExternal ? '<button type="button" data-action="external"><i class="fa-solid fa-up-right-from-square"></i> Open Externally</button>' : ''}
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
    // Competitive-exam materials live in their own table, so their ids can
    // collide with regular materials; they are not tracked in lesson progress.
    const trackProgress = state.lastLibraryRoute !== 'competitive-exams';
    function reportProgress(percent, extra) {
        if (!trackProgress) return;
        window.adhyayan?.setMaterialProgress?.(userId, mat, percent, extra);
    }

    // Saved progress used to resume where the reader left off. Reads the
    // backend copy (so it also works on a new device) but never waits long.
    const savedProgressPromise = !trackProgress ? Promise.resolve(null) : Promise.race([
        (async () => {
            try {
                const list = await window.adhyayan?.getMaterialProgressForUser?.(userId);
                return list?.find((p) => Number(p.material_id) === Number(mat.material_id)) || null;
            } catch (_) {
                return null;
            }
        })(),
        new Promise((resolve) => setTimeout(resolve, 2500, undefined))
    ]).then((saved) => saved ?? window.adhyayan?.getMaterialProgress?.(userId, mat.material_id) ?? null);

    // Resume a finished lesson from the start ("Revisit"); an unstarted one too.
    const getResumePage = (saved, totalPages) => {
        if (!saved || !(saved.percent > 0) || saved.percent >= 100) return 1;
        const page = Math.floor(Number(saved.last_page));
        return Number.isFinite(page) && page >= 1 ? Math.min(page, totalPages) : 1;
    };

    // Seeks a <video>/<audio> back to where the user stopped.
    const resumeMediaPosition = (mediaEl) => {
        mediaEl.addEventListener('loadedmetadata', () => {
            savedProgressPromise.then((saved) => {
                const position = Number(saved?.last_position_sec);
                if (saved && saved.percent > 0 && saved.percent < 100 && position > 0 && position < mediaEl.duration) {
                    mediaEl.currentTime = position;
                }
            });
        }, { once: true });
    };

    // --- Shared position tracking for <video>, <audio> and YouTube ---------------
    // Every content type writes into the same progress record, so last_accessed_at
    // (which decides what "Continue learning" shows) is refreshed whatever is opened.
    const MEDIA_SAVE_MIN_MS = 4500; // local save cadence while playing; the backend is rate-limited separately
    let lastMediaSave = 0;
    const snapshotHandlers = [];  // save the exact position now (tab hidden / lesson left)
    const cleanupHandlers = [];   // stop timers (lesson left)
    const registerSnapshot = (fn) => snapshotHandlers.push(fn);
    const registerCleanup = (fn) => cleanupHandlers.push(fn);
    const flushProgress = () => {
        if (trackProgress) window.adhyayan?.flushMaterialProgress?.(userId, mat.material_id);
    };
    const validDuration = (d) => (Number.isFinite(Number(d)) && Number(d) > 0 ? Number(d) : undefined);
    const saveMediaPosition = ({ position, duration, force = false }) => {
        const pos = Number(position);
        if (!Number.isFinite(pos) || pos < 0) return;
        const now = Date.now();
        if (!force && now - lastMediaSave < MEDIA_SAVE_MIN_MS) return;
        lastMediaSave = now;
        reportProgress(0, { position: pos, duration: validDuration(duration) });
    };
    const finishMedia = (duration) => {
        reportProgress(100, { position: 0, duration: validDuration(duration) });
        flushProgress();
    };
    const persistNow = () => {
        snapshotHandlers.forEach((fn) => { try { fn(); } catch (_) { /* player already gone */ } });
        flushProgress();
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') persistNow(); };
    window.addEventListener('pagehide', persistNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.__pageTeardown = () => {
        persistNow();
        cleanupHandlers.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
        window.removeEventListener('pagehide', persistNow);
        document.removeEventListener('visibilitychange', onVisibilityChange);
    };

    const trackMediaElement = (el) => {
        reportProgress(0); // opened: refreshes last_accessed_at only
        resumeMediaPosition(el);
        const snapshot = (force) => {
            if (el.duration) saveMediaPosition({ position: el.currentTime, duration: el.duration, force });
        };
        el.addEventListener('play', () => reportProgress(0));
        el.addEventListener('timeupdate', () => snapshot(false));
        el.addEventListener('seeked', () => snapshot(true));
        el.addEventListener('pause', () => {
            if (el.ended) return; // 'ended' handles the finished case
            snapshot(true);
            flushProgress();
        });
        el.addEventListener('ended', () => finishMedia(el.duration));
        registerSnapshot(() => snapshot(true));
    };

    // Add a wrapper for fullscreen capabilities
    viewerContainer.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center;';

    // True once the book is shown in our own viewer; the gear menu then hides "Open Externally"
    // so the book content never leaves the app / website.
    let inlineReaderActive = false;

    // Resumes at the saved page and hooks the page/zoom toolbar up to a freshly built viewer.
    const attachPdfController = async (controller) => {
        const saved = await savedProgressPromise;
        const resumePage = getResumePage(saved, controller.numPages);
        if (resumePage > 1) await controller.goToPage(resumePage, { instant: true });
        inlineReaderActive = true;
        wirePdfControls(controller); // also records the page being opened
    };

    // Google's embedded viewers carry a pop-out button (top-right) that opens the file in a new
    // tab. A cross-origin iframe can't be modified, so a transparent shield swallows clicks there.
    const shieldIframePopout = () => {
        const shield = document.createElement('div');
        shield.className = 'reader-popout-shield';
        shield.setAttribute('aria-hidden', 'true');
        wrapper.appendChild(shield);
    };

    if (youTubeVideoId) {
        renderYouTubePlayer(wrapper, youTubeVideoId, {
            touch: () => reportProgress(0),
            getStartAt: async () => {
                const saved = await savedProgressPromise;
                const position = Number(saved?.last_position_sec);
                return saved && saved.percent > 0 && saved.percent < 100 && position > 0 ? position : 0;
            },
            save: saveMediaPosition,
            ended: finishMedia,
            flush: flushProgress,
            onSnapshot: registerSnapshot,
            onCleanup: registerCleanup
        });
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
            // Google's embedded viewer (Drive "/preview") is the last-resort fallback: it has its own
            // chrome, including a pop-out button that would open the book in a new tab and take the
            // reader out of the app. The cross-origin iframe can't be changed, so that corner is shielded.
            const showDriveIframe = () => {
                wrapper.innerHTML = `<iframe src="${driveEmbedUrl}" style="width:100%; height:100%; border:none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
                shieldIframePopout();
                // No reliable playback-progress API for cross-origin embeds, so just mark it viewed.
                reportProgress(100);
            };

            if (mat.format_name === 'E-Book') {
                // Read Drive PDFs inside our own viewer (fit-to-page, pinch / drag zoom, in-app
                // fullscreen) instead of Google's. Drive's download host is CORS-enabled for
                // "anyone with the link" files, so this works on the website and in the APK.
                wrapper.innerHTML = `<div style="color:#374151; font-size:0.85rem;">Loading…</div>`;
                renderPdfInline(wrapper, getInlineRenderablePdfSources(mat.file_url)).then(async (controller) => {
                    if (controller) {
                        await attachPdfController(controller);
                        return;
                    }
                    showDriveIframe(); // not a plain PDF (e.g. very large file) — keep the old viewer
                });
            } else {
                // Drive video/audio are HTML pages, not media files — embed via iframe.
                showDriveIframe();
            }
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
        if (videoEl) trackMediaElement(videoEl);
    } else if (ext === 'mp3' || ext === 'wav' || mat.format_name === 'Audio Book' || (isDataUrl && mat.file_url.includes('audio'))) {
        wrapper.innerHTML = `<div style="text-align:center; width: 100%;"><i class="fa-solid fa-headphones" style="font-size: 4rem; color: #aaa; margin-bottom: 20px;"></i><br><audio controls style="width: 80%;"><source src="${mat.file_url}">Your browser does not support the audio tag.</audio></div>`;
        const audioEl = wrapper.querySelector('audio');
        if (audioEl) trackMediaElement(audioEl);
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
        const inlineSrc = isDataUrl ? pdfUrl : getInlineRenderablePdfSources(mat.file_url);
        wrapper.innerHTML = `<div style="color:#374151; font-size:0.85rem;">Loading…</div>`;

        renderPdfInline(wrapper, inlineSrc).then(async (controller) => {
            if (controller) {
                await attachPdfController(controller);
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
            shieldIframePopout();
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

    const readerCard = document.querySelector('.reader-viewer-card');
    const nativeFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
    // "Fullscreen" falls back to filling the app window when the platform has no element
    // fullscreen (some Android WebViews, iPhone Safari): the book still opens on this same page.
    let fakeFullscreen = false;
    const movedOverlays = [];
    const isFullscreenActive = () => !!nativeFullscreenElement() || fakeFullscreen;

    // Keeps the exit button visible: elements outside the fullscreen element aren't painted while
    // it's active, so the overlay buttons move inside it and are put back once fullscreen ends.
    const syncFullscreenUi = () => {
        const fullscreenEl = nativeFullscreenElement() || (fakeFullscreen ? readerCard : null);
        if (fullscreenEl) {
            overlayHomes.forEach((home) => {
                if (!fullscreenEl.contains(home.el)) {
                    fullscreenEl.appendChild(home.el);
                    movedOverlays.push(home);
                }
            });
            if (fullscreenExitBtn) {
                fullscreenExitBtn.style.display = 'flex';
                fullscreenExitBtn.setAttribute('aria-hidden', 'false');
            }
        } else {
            movedOverlays.splice(0).forEach(({ el, parent, next }) => parent.insertBefore(el, next));
            if (fullscreenExitBtn) {
                fullscreenExitBtn.style.display = 'none';
                fullscreenExitBtn.setAttribute('aria-hidden', 'true');
            }
        }
    };

    const enterFullscreen = async () => {
        if (!readerCard) return;
        // The whole reader card goes fullscreen (page + page/zoom toolbar), so navigation and zoom stay reachable.
        const request = readerCard.requestFullscreen || readerCard.webkitRequestFullscreen;
        if (request) {
            try {
                await request.call(readerCard);
                return;
            } catch (err) {
                console.warn('Native fullscreen unavailable, using in-page fullscreen:', err);
            }
        }
        fakeFullscreen = true;
        readerCard.classList.add('is-fake-fullscreen');
        syncFullscreenUi();
    };

    const exitFullscreen = async () => {
        if (nativeFullscreenElement()) {
            try {
                if (document.exitFullscreen) await document.exitFullscreen();
                else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
            } catch (err) {
                console.error('Exit fullscreen failed:', err);
            }
        }
        if (fakeFullscreen) {
            fakeFullscreen = false;
            readerCard?.classList.remove('is-fake-fullscreen');
            syncFullscreenUi();
        }
    };

    const toggleFullscreen = () => (isFullscreenActive() ? exitFullscreen() : enterFullscreen());

    const onFakeFullscreenKey = (event) => {
        if (fakeFullscreen && event.key === 'Escape') exitFullscreen();
    };
    document.addEventListener('fullscreenchange', syncFullscreenUi);
    document.addEventListener('webkitfullscreenchange', syncFullscreenUi);
    document.addEventListener('keydown', onFakeFullscreenKey);
    registerCleanup(() => {
        document.removeEventListener('fullscreenchange', syncFullscreenUi);
        document.removeEventListener('webkitfullscreenchange', syncFullscreenUi);
        document.removeEventListener('keydown', onFakeFullscreenKey);
    });

    fullScreenToggles.forEach((toggle) => {
        toggle.addEventListener('click', toggleFullscreen);
        toggle.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleFullscreen();
            }
        });
    });

    if (fullscreenExitBtn) {
        fullscreenExitBtn.addEventListener('click', exitFullscreen);
        fullscreenExitBtn.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                exitFullscreen();
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
    wireSettingsMenu(toggleWishlist, isDataUrl ? null : () => openExternalLink(mat.file_url), isWishlisted, () => !inlineReaderActive);
}
