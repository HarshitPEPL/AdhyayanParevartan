// Audio Book player for the lesson page: a hidden <audio> element driven by our
// own controls (play/pause, ±10 s, seek bar, volume/mute, speed), drawn over the
// material's thumbnail. Styles live in lesson.css under "AUDIO BOOK PLAYER".

const SKIP_SECONDS = 10;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Resolves with the first image URL that actually loads, or null if none do.
function loadFirstImage(urls) {
    return urls.reduce((chain, url) => chain.then((found) => found || new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 0 ? url : null);
        img.onerror = () => resolve(null);
        img.src = url;
    })), Promise.resolve(null));
}

// options:
//   sources        candidate stream URLs, tried in order (see getPlayableMediaSources)
//   thumbnailUrls  candidate image URLs for the background / cover art (may be empty)
//   title          shown above the controls and in the OS media controls
//   subtitle       secondary line (e.g. "Class 9 - Hindi")
//   openUrl        original File URL for the "Open file" fallback (omit to hide the link)
//   onOpenExternal(url) opens a link outside the app (system browser on native)
// Returns { audio, destroy }. `destroy()` stops playback and detaches listeners.
export function renderAudioPlayer(container, options) {
    const { sources = [], thumbnailUrls = [], title = '', subtitle = '', openUrl = '', onOpenExternal } = options;

    const root = document.createElement('div');
    root.className = 'audio-player is-loading';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', `Audio player: ${title}`);
    root.innerHTML = `
        <div class="audio-player-bg" aria-hidden="true"></div>
        <div class="audio-player-scrim" aria-hidden="true"></div>
        <div class="audio-player-body">
            <div class="audio-player-art" aria-hidden="true">
                <img class="audio-player-cover" alt="" draggable="false">
                <i class="fa-solid fa-headphones audio-player-art-icon"></i>
            </div>
            <div class="audio-player-heading">
                <div class="audio-player-title">${escapeHtml(title)}</div>
                ${subtitle ? `<div class="audio-player-subtitle">${escapeHtml(subtitle)}</div>` : ''}
            </div>
            <div class="audio-player-status" role="status" aria-live="polite"></div>
            <div class="audio-player-transport">
                <button type="button" class="audio-player-btn audio-player-skip" data-skip="-${SKIP_SECONDS}" aria-label="Back ${SKIP_SECONDS} seconds">
                    <i class="fa-solid fa-rotate-left"></i><span>${SKIP_SECONDS}</span>
                </button>
                <button type="button" class="audio-player-btn audio-player-play" aria-label="Play">
                    <i class="fa-solid fa-play"></i>
                    <span class="audio-player-spinner" aria-hidden="true"></span>
                </button>
                <button type="button" class="audio-player-btn audio-player-skip" data-skip="${SKIP_SECONDS}" aria-label="Forward ${SKIP_SECONDS} seconds">
                    <i class="fa-solid fa-rotate-right"></i><span>${SKIP_SECONDS}</span>
                </button>
            </div>
            <div class="audio-player-timeline">
                <span class="audio-player-time audio-player-current">0:00</span>
                <input type="range" class="audio-player-seek" min="0" max="0" step="0.1" value="0" aria-label="Seek" disabled>
                <span class="audio-player-time audio-player-duration">--:--</span>
            </div>
            <div class="audio-player-options">
                <div class="audio-player-volume">
                    <button type="button" class="audio-player-btn audio-player-mute" aria-label="Mute">
                        <i class="fa-solid fa-volume-high"></i>
                    </button>
                    <input type="range" class="audio-player-volume-range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
                </div>
                <label class="audio-player-speed">
                    <span class="audio-player-sr-only">Playback speed</span>
                    <select class="audio-player-speed-select" aria-label="Playback speed">
                        ${SPEEDS.map((s) => `<option value="${s}"${s === 1 ? ' selected' : ''}>${s}x</option>`).join('')}
                    </select>
                </label>
            </div>
        </div>
        <audio preload="metadata" playsinline></audio>
    `;
    container.appendChild(root);

    const $ = (sel) => root.querySelector(sel);
    const audio = $('audio');
    const bg = $('.audio-player-bg');
    const cover = $('.audio-player-cover');
    const status = $('.audio-player-status');
    const playBtn = $('.audio-player-play');
    const playIcon = playBtn.querySelector('i');
    const seek = $('.audio-player-seek');
    const currentEl = $('.audio-player-current');
    const durationEl = $('.audio-player-duration');
    const muteBtn = $('.audio-player-mute');
    const muteIcon = muteBtn.querySelector('i');
    const volumeRange = $('.audio-player-volume-range');
    const speedSelect = $('.audio-player-speed-select');

    let destroyed = false;
    let isScrubbing = false;
    const listeners = [];
    const on = (target, type, fn, opts) => {
        target.addEventListener(type, fn, opts);
        listeners.push(() => target.removeEventListener(type, fn, opts));
    };

    // --- Thumbnail background / cover art -------------------------------------
    // Until (unless) an image loads, the plain grey backdrop + headphones icon shows.
    if (thumbnailUrls.length) {
        loadFirstImage(thumbnailUrls).then((url) => {
            if (!url || destroyed) return;
            bg.style.backgroundImage = `url("${url.replace(/["\\\n]/g, encodeURIComponent)}")`;
            cover.src = url;
            root.classList.add('has-thumb');
            setMediaSessionArtwork(url);
        });
    }

    // --- Status line (loading / error) ----------------------------------------
    const setStatus = (html) => { status.innerHTML = html; };
    const setLoading = (loading) => root.classList.toggle('is-loading', loading && !root.classList.contains('has-error'));

    const showError = () => {
        root.classList.add('has-error');
        root.classList.remove('is-loading');
        const link = openUrl && !openUrl.startsWith('data:')
            ? ` <a class="audio-player-open" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener">Open file <i class="fa-solid fa-up-right-from-square"></i></a>`
            : '';
        setStatus(`<i class="fa-solid fa-triangle-exclamation"></i> <span>This audio can't be played here.</span>${link}`);
        status.querySelector('.audio-player-open')?.addEventListener('click', (event) => {
            if (!onOpenExternal) return;
            event.preventDefault();
            onOpenExternal(openUrl);
        });
        playBtn.disabled = true;
        seek.disabled = true;
    };

    // --- Source fallback ------------------------------------------------------
    // Each candidate is tried in turn; if one fails mid-way the next resumes at the same spot.
    let sourceIndex = -1;
    const tryNextSource = () => {
        const resumeAt = audio.currentTime || 0;
        const wasPlaying = !audio.paused;
        sourceIndex += 1;
        if (sourceIndex >= sources.length) {
            showError();
            return;
        }
        setLoading(true);
        audio.src = sources[sourceIndex];
        if (resumeAt > 0 || wasPlaying) {
            audio.addEventListener('loadedmetadata', () => {
                if (resumeAt > 0) audio.currentTime = resumeAt;
                if (wasPlaying) audio.play().catch(() => {});
            }, { once: true });
        }
        audio.load();
    };
    on(audio, 'error', () => {
        if (!destroyed && audio.error) tryNextSource();
    });

    // --- Transport ------------------------------------------------------------
    const togglePlay = () => {
        if (root.classList.contains('has-error')) return;
        if (audio.paused || audio.ended) audio.play().catch(() => {});
        else audio.pause();
    };
    const skipBy = (delta) => {
        if (!Number.isFinite(audio.duration)) {
            if (audio.readyState > 0) audio.currentTime = Math.max(0, audio.currentTime + delta);
            return;
        }
        audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + delta));
    };

    on(playBtn, 'click', togglePlay);
    root.querySelectorAll('.audio-player-skip').forEach((btn) => {
        on(btn, 'click', () => skipBy(Number(btn.dataset.skip)));
    });

    const syncPlayState = () => {
        const playing = !audio.paused && !audio.ended;
        root.classList.toggle('is-playing', playing);
        playIcon.className = `fa-solid ${playing ? 'fa-pause' : 'fa-play'}`;
        playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
        if ('mediaSession' in navigator) {
            try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch { /* unsupported */ }
        }
    };
    on(audio, 'play', syncPlayState);
    on(audio, 'pause', syncPlayState);
    on(audio, 'ended', syncPlayState);

    // Buffering only matters while playback is wanted: a paused seek with
    // preload="metadata" fetches nothing and would otherwise spin forever.
    on(audio, 'loadstart', () => setLoading(true));
    on(audio, 'waiting', () => setLoading(true));
    on(audio, 'seeking', () => { if (!audio.paused) setLoading(true); });
    on(audio, 'play', () => { if (audio.readyState < 3) setLoading(true); });
    ['loadedmetadata', 'canplay', 'playing', 'seeked', 'pause'].forEach((type) => {
        on(audio, type, () => {
            // A paused element that hasn't loaded anything yet is still loading.
            if (type === 'pause' && audio.readyState < 1) return;
            setLoading(false);
        });
    });

    // --- Seek bar -------------------------------------------------------------
    const paintSeek = (time) => {
        const duration = audio.duration;
        const pct = Number.isFinite(duration) && duration > 0 ? (time / duration) * 100 : 0;
        let bufferedPct = 0;
        if (Number.isFinite(duration) && duration > 0 && audio.buffered.length) {
            bufferedPct = (audio.buffered.end(audio.buffered.length - 1) / duration) * 100;
        }
        seek.style.setProperty('--progress', `${Math.min(100, pct)}%`);
        seek.style.setProperty('--buffered', `${Math.min(100, bufferedPct)}%`);
        currentEl.textContent = formatTime(time);
    };
    const syncDuration = () => {
        const duration = audio.duration;
        const known = Number.isFinite(duration) && duration > 0;
        seek.max = known ? String(duration) : '0';
        seek.disabled = !known;
        durationEl.textContent = known ? formatTime(duration) : '--:--';
        paintSeek(audio.currentTime);
    };
    on(audio, 'loadedmetadata', syncDuration);
    on(audio, 'durationchange', syncDuration);
    on(audio, 'timeupdate', () => {
        if (isScrubbing) return;
        seek.value = String(audio.currentTime);
        paintSeek(audio.currentTime);
    });
    on(audio, 'progress', () => { if (!isScrubbing) paintSeek(audio.currentTime); });

    // Dragging only moves the thumb + time label; the jump happens on release so
    // the stream isn't asked for a new range on every pixel.
    on(seek, 'input', () => {
        isScrubbing = true;
        paintSeek(Number(seek.value));
    });
    on(seek, 'change', () => {
        isScrubbing = false;
        audio.currentTime = Number(seek.value);
    });

    // --- Volume / speed -------------------------------------------------------
    const syncVolume = () => {
        const level = audio.muted ? 0 : audio.volume;
        muteIcon.className = `fa-solid ${level === 0 ? 'fa-volume-xmark' : level < 0.5 ? 'fa-volume-low' : 'fa-volume-high'}`;
        muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
        volumeRange.value = String(level);
        volumeRange.style.setProperty('--progress', `${level * 100}%`);
    };
    on(muteBtn, 'click', () => {
        // Unmuting from a zero volume would still be silent, so restore a usable level.
        if (audio.muted || audio.volume === 0) {
            audio.muted = false;
            if (audio.volume === 0) audio.volume = 1;
        } else {
            audio.muted = true;
        }
    });
    on(volumeRange, 'input', () => {
        const level = Number(volumeRange.value);
        audio.volume = level;
        audio.muted = level === 0;
    });
    on(audio, 'volumechange', syncVolume);
    syncVolume();

    on(speedSelect, 'change', () => {
        const rate = Number(speedSelect.value) || 1;
        audio.playbackRate = rate;
        audio.defaultPlaybackRate = rate;
    });
    // Browsers reset the rate when a new source loads; keep the user's choice.
    on(audio, 'loadedmetadata', () => {
        const rate = Number(speedSelect.value) || 1;
        audio.playbackRate = rate;
        audio.defaultPlaybackRate = rate;
    });

    // --- Keyboard: Space = play/pause, ←/→ = seek ------------------------------
    // Page-wide while the lesson is open, but form fields keep their own keys
    // (the volume slider and speed picker use the arrows themselves). The seek
    // slider is the exception: its native arrow step would only move 0.1 s.
    on(document, 'keydown', (event) => {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (target instanceof Element) {
            if (target.closest('input:not(.audio-player-seek), select, textarea, [contenteditable=""], [contenteditable="true"]')) return;
            if (target.closest('.reader-settings-menu')) return;
            // Buttons and links outside the player keep their native Space/Enter behaviour.
            if (event.key === ' ' && target.closest('button, a') && !root.contains(target)) return;
        }
        if (event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault();
            togglePlay();
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            skipBy(-SKIP_SECONDS);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            skipBy(SKIP_SECONDS);
        }
    });

    // --- OS media controls (lock screen / notification shade) -----------------
    function setMediaSessionArtwork(artUrl) {
        if (!('mediaSession' in navigator) || typeof window.MediaMetadata !== 'function') return;
        try {
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title,
                artist: subtitle,
                artwork: artUrl ? [{ src: artUrl }] : []
            });
        } catch { /* unsupported */ }
    }
    if ('mediaSession' in navigator) {
        setMediaSessionArtwork('');
        const actions = {
            play: () => audio.play().catch(() => {}),
            pause: () => audio.pause(),
            seekbackward: () => skipBy(-SKIP_SECONDS),
            seekforward: () => skipBy(SKIP_SECONDS)
        };
        Object.entries(actions).forEach(([action, handler]) => {
            try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ }
        });
    }

    if (sources.length) tryNextSource();
    else showError();

    const destroy = () => {
        if (destroyed) return;
        destroyed = true;
        listeners.splice(0).forEach((off) => off());
        try {
            audio.pause();
            // Dropping the source aborts the download; a detached element would otherwise keep playing.
            audio.removeAttribute('src');
            audio.load();
        } catch { /* already gone */ }
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.metadata = null;
                ['play', 'pause', 'seekbackward', 'seekforward'].forEach((a) => navigator.mediaSession.setActionHandler(a, null));
            } catch { /* unsupported */ }
        }
    };

    return { audio, destroy };
}
