// Logic for lesson

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

// Converts any Google Drive share/view/preview link into Drive's embeddable
// "/preview" URL. Drive links are HTML pages, not raw media files, so they
// can only be shown via <iframe>, never via <video>/<audio> src.
function getGoogleDriveEmbedUrl(url) {
    if (!url || !url.includes('drive.google.com')) return null;
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/[?&]usp=sharing.*?\b([a-zA-Z0-9_-]{10,})/);
    return idMatch ? `https://drive.google.com/file/d/${idMatch[1]}/preview` : null;
}

function getSafePdfUrl(fileUrl) {
    if (!fileUrl) return '';
    if (fileUrl.includes('drive.google.com')) {
        const match = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
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

    document.getElementById('lesson-subject').textContent = `${mat.subject_name.toUpperCase()} - CLASS ${classNum}`;
    document.getElementById('lesson-title').textContent = mat.title;
    document.getElementById('lesson-format').textContent = mat.format_name;
    document.getElementById('lesson-duration').textContent = mat.duration_lessons || 'N/A';
    document.getElementById('lesson-instructor').textContent = mat.instructor_name || 'Unknown Author';

    const backButton = document.querySelector('.lesson-back-btn');
    if (backButton) {
        backButton.addEventListener('click', () => navigateTo(backRoute));
    }

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

    const viewerContainer = document.getElementById('lesson-viewer-container');
    const ext = mat.file_url.split('.').pop().toLowerCase();
    const isDataUrl = mat.file_url.startsWith('data:');
    const youTubeVideoId = getYouTubeVideoId(mat.file_url);
    const driveEmbedUrl = getGoogleDriveEmbedUrl(mat.file_url);

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
        // Google Drive links are HTML pages, not playable media files — embed
        // via iframe instead of a <video>/<audio> tag (which would fail to load it).
        wrapper.innerHTML = `<iframe src="${driveEmbedUrl}" style="width:100%; height:100%; border:none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        // No reliable playback-progress API for cross-origin embeds, so just mark it viewed.
        reportProgress(100);
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

        const isNativeAndroid = !!(window.Capacitor || window.cordova || navigator.userAgent.includes('wv') || /Android/i.test(navigator.userAgent));
        const openPdfInBrowser = () => {
            // blob: URLs only exist in this page's memory — an external browser/tab
            // can't resolve them, so fall back to the original self-contained data: URL.
            const targetUrl = isDataUrl ? mat.file_url : (pdfUrl || mat.file_url);
            if (window.Capacitor?.Plugins?.Browser?.open) {
                window.Capacitor.Plugins.Browser.open({ url: targetUrl });
            } else {
                window.open(targetUrl, '_blank', 'noopener,noreferrer');
            }
            reportProgress(100);
        };

        if (isNativeAndroid) {
            wrapper.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center; color:#fff; width:100%; height:100%; background:linear-gradient(180deg, #111827, #1f2937);">
                    <i class="fa-solid fa-file-pdf" style="font-size:3rem; margin-bottom:16px; color:#f8d7da;"></i>
                    <div style="font-size:1.05rem; font-weight:700; margin-bottom:8px;">PDF ready to open</div>
                    <div style="font-size:0.82rem; opacity:0.8; margin-bottom:18px; max-width: 300px; line-height:1.5;">Android WebView cannot render PDFs inline here. Open it in the browser to read the file.</div>
                    <button class="btn btn-primary" id="pdf-open-external" style="padding:10px 18px; border-radius: 999px; font-weight:700;">Open PDF</button>
                </div>
            `;
            wrapper.querySelector('#pdf-open-external')?.addEventListener('click', openPdfInBrowser);
            reportProgress(40);
        } else {
            const resolvedPdfSrc = pdfUrl || mat.file_url;
            // Google's viewer fetches the URL from its own servers, so it can
            // never reach a browser-local blob:/data: URL (uploads that weren't
            // stored in cloud storage) — render those directly instead, letting
            // the browser's built-in PDF renderer handle it.
            const isRemotePdf = /^https?:\/\//i.test(resolvedPdfSrc);
            const pdfViewerSrc = isRemotePdf
                ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(resolvedPdfSrc)}`
                : resolvedPdfSrc;
            wrapper.innerHTML = `
                <div class="reader-page-shell">
                    <div class="reader-page-header">
                        <span>${(mat.title || 'Adhyayan').substring(0, 28)}</span>
                        <span>Page 1</span>
                    </div>
                    <iframe src="${pdfViewerSrc}" class="reader-iframe" allowfullscreen title="PDF Viewer"></iframe>
                </div>
            `;
            reportProgress(40);
        }
    } else {
        wrapper.innerHTML = `<div style="text-align:center; color: #fff;"><i class="fa-solid fa-file" style="font-size: 3rem; margin-bottom: 10px;"></i><br>Preview not available for this format.</div>`;
        reportProgress(100);
    }
    viewerContainer.appendChild(wrapper);

    const fullScreenToggle = document.getElementById('lesson-fullscreen-toggle');
    const fullscreenExitBtn = document.getElementById('lesson-fullscreen-exit-btn');

    // Elements outside the fullscreen element's subtree aren't painted while
    // it's active, so the overlay buttons must move inside it to stay visible.
    // Remember their original spot to restore it once fullscreen exits.
    const overlayHomes = [backOverlayBtn, fullscreenExitBtn]
        .filter(Boolean)
        .map((el) => ({ el, parent: el.parentNode, next: el.nextSibling }));

    if (fullScreenToggle) {
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

        fullScreenToggle.addEventListener('click', toggleFullscreen);
        fullScreenToggle.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleFullscreen();
            }
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


    const downloadBtn = document.getElementById('lesson-download-btn');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            window.adhyayan?.recordDownload?.(userId, mat);

            if (isDataUrl) {
                // Programmatic download for Data URLs
                const a = document.createElement('a');
                a.href = mat.file_url;
                // Try to guess extension for filename
                let dlExt = 'file';
                if (mat.file_url.includes('pdf')) dlExt = 'pdf';
                else if (mat.file_url.includes('audio')) dlExt = 'mp3';
                else if (mat.file_url.includes('video')) dlExt = 'mp4';
                
                a.download = `Adhyayan_${mat.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${dlExt}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                reportProgress(100);
            } else {
                window.open(mat.file_url, '_blank');
            }
        };
    }
}
