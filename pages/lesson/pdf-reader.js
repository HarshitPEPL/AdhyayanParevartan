// E-book page viewer for the lesson reader.
//
// Shows one PDF page at a time as a paper sheet that is fitted completely inside
// the reader area, with free pan / pinch / wheel / double-tap zoom built on pointer
// events + CSS transforms (no extra library).
//
// Zoom is expressed relative to "fit to page": 100% = the whole page just fits
// inside the reader area (with padding), 50%..400% is the allowed range.
//
// Sharpness: a full-page canvas is rendered at fit size x devicePixelRatio, and when
// zoomed in a second "detail" canvas re-renders only the visible part of the page at
// the exact zoomed device resolution, so text stays crisp at 200-400% without huge canvases.

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2;
const BUTTON_ZOOM_STEP = 1.25;
const FIT_EPSILON = 0.001;
const MAX_CANVAS_AREA = 16 * 1024 * 1024; // iOS Safari's canvas limit is ~16.7M px
const MAX_CANVAS_SIDE = 8192;
const PAGE_TURN_MS = 100; // out + in = ~200ms
const SWIPE_MIN_PX = 50;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Mounts the viewer inside `host` and resolves to a controller once page 1 is rendered.
 * Throws if the first page cannot be rendered (the caller then falls back to another viewer).
 */
export async function createPdfReader(host, pdfDoc, hooks = {}) {
    const originalHostStyle = host.style.cssText;
    // Fill the reader area regardless of how the parent resolves percentage heights.
    host.style.cssText = 'position:absolute; inset:0;';
    host.innerHTML = `
        <div class="pdf-stage" role="document" aria-label="E-book page viewer">
            <div class="pdf-page-wrap">
                <div class="pdf-sheet">
                    <canvas class="pdf-canvas pdf-canvas-base"></canvas>
                </div>
            </div>
        </div>
    `;

    const stage = host.querySelector('.pdf-stage');
    const wrap = host.querySelector('.pdf-page-wrap');
    const sheet = host.querySelector('.pdf-sheet');
    const baseCanvas = host.querySelector('.pdf-canvas-base');

    const zoomListeners = [];
    const pageListeners = [];
    if (hooks.onZoomChange) zoomListeners.push(hooks.onZoomChange);
    if (hooks.onPageChange) pageListeners.push(hooks.onPageChange);

    // --- state -----------------------------------------------------------
    let destroyed = false;
    let page = null;
    let pageNum = 1;
    let pageW = 1;   // page size in PDF units at scale 1
    let pageH = 1;
    let cw = 0;      // stage (viewport) size in CSS px
    let ch = 0;
    let fit = 1;     // CSS px per PDF unit when the page fits the stage
    let fitW = 1;    // page size in CSS px at 100%
    let fitH = 1;
    let z = 1;       // zoom relative to fit
    let tx = 0;      // sheet translation in stage px
    let ty = 0;
    let lastEmittedZoom = null;
    let navToken = 0;
    let baseTask = null;
    let detailToken = 0;
    let detailTask = null;
    let detail = null; // { canvas, x, y, w, h, z }
    let detailTimer = 0;
    let baseTimer = 0;
    let animFrame = 0;

    const dpr = () => Math.min(window.devicePixelRatio || 1, 3);
    const pad = () => (cw < 600 ? 16 : 24);

    // --- layout ----------------------------------------------------------
    function measure() {
        const rect = stage.getBoundingClientRect();
        cw = rect.width;
        ch = rect.height;
    }

    // scale = min(containerWidth / pageWidth, containerHeight / pageHeight), minus padding
    function computeFit() {
        const p = pad();
        const availW = Math.max(40, cw - 2 * p);
        const availH = Math.max(40, ch - 2 * p);
        fit = Math.min(availW / pageW, availH / pageH);
        fitW = pageW * fit;
        fitH = pageH * fit;
        sheet.style.width = `${fitW}px`;
        sheet.style.height = `${fitH}px`;
    }

    // Keeps the page reachable on every edge but never lets it leave the view entirely.
    function clampPan(nx, ny, zoom) {
        const sw = fitW * zoom;
        const sh = fitH * zoom;
        const p = pad();
        const x = sw + 2 * p <= cw ? (cw - sw) / 2 : clamp(nx, cw - sw - p, p);
        const y = sh + 2 * p <= ch ? (ch - sh) / 2 : clamp(ny, ch - sh - p, p);
        return [x, y];
    }

    function emitZoom() {
        if (lastEmittedZoom !== null && Math.abs(lastEmittedZoom - z) < 1e-6) return;
        lastEmittedZoom = z;
        zoomListeners.forEach((fn) => { try { fn(z); } catch (_) { /* listener failed */ } });
    }

    function apply() {
        sheet.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${z})`;
        stage.classList.toggle('can-pan', z > 1 + FIT_EPSILON);
        emitZoom();
        scheduleDetail();
    }

    function resetToFit() {
        z = 1;
        [tx, ty] = clampPan(0, 0, 1);
        apply();
    }

    // Zooms to `next` keeping the page point under (fx, fy) fixed.
    function zoomAt(next, fx, fy) {
        const target = clamp(next, MIN_ZOOM, MAX_ZOOM);
        const px = (fx - tx) / z;
        const py = (fy - ty) / z;
        z = target;
        [tx, ty] = clampPan(fx - px * z, fy - py * z, z);
        apply();
    }

    function cancelAnimation() {
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = 0;
    }

    // Smooth, jitter-free zoom to `target` around (fx, fy).
    function animateZoom(target, fx = cw / 2, fy = ch / 2, duration = 200) {
        cancelAnimation();
        const from = z;
        const to = clamp(target, MIN_ZOOM, MAX_ZOOM);
        if (Math.abs(to - from) < 1e-4) return;
        const start = performance.now();
        const step = (now) => {
            const t = clamp((now - start) / duration, 0, 1);
            zoomAt(from + (to - from) * easeOutCubic(t), fx, fy);
            animFrame = t < 1 ? requestAnimationFrame(step) : 0;
        };
        animFrame = requestAnimationFrame(step);
    }

    // --- rendering -------------------------------------------------------
    function cappedPixelScale(width, height) {
        const byArea = Math.sqrt(MAX_CANVAS_AREA / Math.max(1, width * height));
        const bySide = MAX_CANVAS_SIDE / Math.max(width, height, 1);
        return Math.min(1, byArea, bySide);
    }

    async function renderBase() {
        if (!page) return;
        const myPage = page;
        const pixelRatio = dpr();
        const cap = cappedPixelScale(fitW * pixelRatio, fitH * pixelRatio);
        const viewport = myPage.getViewport({ scale: fit * pixelRatio * cap });
        baseCanvas.width = Math.ceil(viewport.width);
        baseCanvas.height = Math.ceil(viewport.height);
        const ctx = baseCanvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, baseCanvas.width, baseCanvas.height);
        try { baseTask?.cancel(); } catch (_) { /* nothing running */ }
        baseTask = myPage.render({ canvasContext: ctx, viewport });
        try {
            await baseTask.promise;
        } catch (err) {
            if (err?.name !== 'RenderingCancelledException') throw err;
        }
    }

    function removeDetail() {
        detailToken++;
        try { detailTask?.cancel(); } catch (_) { /* nothing running */ }
        detailTask = null;
        if (detail) detail.canvas.remove();
        detail = null;
    }

    function visibleRect() {
        return {
            x0: clamp(-tx / z, 0, fitW),
            y0: clamp(-ty / z, 0, fitH),
            x1: clamp((cw - tx) / z, 0, fitW),
            y1: clamp((ch - ty) / z, 0, fitH)
        };
    }

    function detailCovers(vis) {
        if (!detail) return false;
        if (Math.abs(detail.z - z) / z > 0.05) return false;
        return vis.x0 >= detail.x - 0.5 && vis.y0 >= detail.y - 0.5
            && vis.x1 <= detail.x + detail.w + 0.5 && vis.y1 <= detail.y + detail.h + 0.5;
    }

    function scheduleDetail() {
        clearTimeout(detailTimer);
        if (!page) return;
        if (z <= 1.05) {
            if (detail) removeDetail();
            return;
        }
        detailTimer = setTimeout(renderDetail, 130);
    }

    // Re-renders just the visible part of the page (plus a margin) at the exact zoomed
    // device resolution, then swaps it in on top of the base canvas.
    async function renderDetail() {
        if (destroyed || !page) return;
        const vis = visibleRect();
        if (detailCovers(vis)) return;

        const marginX = (vis.x1 - vis.x0) * 0.25;
        const marginY = (vis.y1 - vis.y0) * 0.25;
        const rx = clamp(vis.x0 - marginX, 0, fitW);
        const ry = clamp(vis.y0 - marginY, 0, fitH);
        const rw = clamp(vis.x1 + marginX, 0, fitW) - rx;
        const rh = clamp(vis.y1 + marginY, 0, fitH) - ry;
        if (rw < 1 || rh < 1) return;

        const pixelRatio = dpr();
        const renderZoom = z;
        const cap = cappedPixelScale(rw * renderZoom * pixelRatio, rh * renderZoom * pixelRatio);
        const k = renderZoom * pixelRatio * cap; // device px per sheet px
        const token = ++detailToken;
        const myPage = page;

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas pdf-canvas-detail';
        canvas.width = Math.max(1, Math.ceil(rw * k));
        canvas.height = Math.max(1, Math.ceil(rh * k));
        canvas.style.cssText = `left:${rx}px; top:${ry}px; width:${rw}px; height:${rh}px;`;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const viewport = myPage.getViewport({ scale: fit * k });
        try { detailTask?.cancel(); } catch (_) { /* nothing running */ }
        detailTask = myPage.render({ canvasContext: ctx, viewport, transform: [1, 0, 0, 1, -rx * k, -ry * k] });
        try {
            await detailTask.promise;
        } catch (err) {
            if (err?.name === 'RenderingCancelledException') return;
            console.warn('Detail render failed:', err);
            return;
        }
        if (destroyed || token !== detailToken || myPage !== page) return;
        const previous = detail;
        sheet.appendChild(canvas);
        detail = { canvas, x: rx, y: ry, w: rw, h: rh, z: renderZoom };
        previous?.canvas.remove();
        // The view may have moved while rendering; make sure the new tile still covers it.
        if (!detailCovers(visibleRect())) scheduleDetail();
    }

    async function loadPage(num) {
        const loaded = await pdfDoc.getPage(num);
        const viewport = loaded.getViewport({ scale: 1 });
        page = loaded;
        pageW = viewport.width;
        pageH = viewport.height;
        removeDetail();
        measure();
        computeFit();
        await renderBase();
    }

    // --- page turning ----------------------------------------------------
    async function goToPage(num, options = {}) {
        const target = clamp(Math.round(Number(num) || 1), 1, pdfDoc.numPages);
        if (page && target === pageNum) return pageNum;
        const direction = target >= pageNum ? 1 : -1;
        const token = ++navToken;
        cancelAnimation();

        if (!options.instant && page) {
            wrap.style.setProperty('--dir', String(direction));
            wrap.classList.add('is-leaving');
            await sleep(PAGE_TURN_MS);
            if (token !== navToken) return pageNum;
        }

        await loadPage(target);
        if (destroyed || token !== navToken) return pageNum;
        pageNum = target;
        resetToFit();

        if (!options.instant) {
            wrap.classList.remove('is-leaving');
            wrap.classList.add('is-entering');
            void wrap.offsetWidth; // commit the start state, then let the transition run
            wrap.classList.remove('is-entering');
        }
        pageListeners.forEach((fn) => { try { fn(pageNum); } catch (_) { /* listener failed */ } });
        return pageNum;
    }

    // --- pointer gestures: pan, pinch, double-tap, swipe -----------------
    const pointers = new Map();
    let gesture = null; // { mode: 'pan' | 'pinch', ... }
    let lastTap = null;
    let lastPointerType = 'mouse';

    const stagePoint = (clientX, clientY) => {
        const rect = stage.getBoundingClientRect();
        return [clientX - rect.left, clientY - rect.top];
    };

    function isZoomedIn() {
        return z > 1 + FIT_EPSILON;
    }

    function toggleFitAndZoom(fx, fy) {
        animateZoom(isZoomedIn() ? 1 : DOUBLE_TAP_ZOOM, fx, fy);
    }

    function startPinch() {
        const [a, b] = [...pointers.values()];
        const [mx, my] = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
        gesture = {
            mode: 'pinch',
            startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            startZoom: z,
            // page point under the fingers when the pinch began
            px: (mx - tx) / z,
            py: (my - ty) / z
        };
    }

    stage.addEventListener('pointerdown', (e) => {
        lastPointerType = e.pointerType;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        cancelAnimation();
        try { stage.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
        pointers.set(e.pointerId, {
            x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
            startTime: performance.now(), type: e.pointerType
        });
        if (pointers.size >= 2) {
            startPinch();
        } else {
            gesture = { mode: 'pan', moved: false, wasPinch: false };
            if (isZoomedIn()) stage.classList.add('is-panning');
        }
    });

    stage.addEventListener('pointermove', (e) => {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (!gesture) return;

        if (gesture.mode === 'pinch' && pointers.size >= 2) {
            const [a, b] = [...pointers.values()];
            const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
            const [mx, my] = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
            const next = clamp(gesture.startZoom * (dist / gesture.startDist), MIN_ZOOM, MAX_ZOOM);
            z = next;
            [tx, ty] = clampPan(mx - gesture.px * z, my - gesture.py * z, z);
            apply();
            e.preventDefault();
            return;
        }

        if (gesture.mode === 'pan') {
            if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 6) gesture.moved = true;
            if (isZoomedIn()) {
                [tx, ty] = clampPan(tx + dx, ty + dy, z);
                apply();
                e.preventDefault();
            }
        }
    });

    function endPointer(e, cancelled) {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        pointers.delete(e.pointerId);
        try { stage.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }

        if (gesture?.mode === 'pinch') {
            if (pointers.size === 1) {
                // One finger left after a pinch: carry on as a pan without a jump.
                gesture = { mode: 'pan', moved: true, wasPinch: true };
            } else if (pointers.size === 0) {
                gesture = null;
            }
            stage.classList.remove('is-panning');
            return;
        }

        stage.classList.remove('is-panning');
        const wasPan = gesture?.mode === 'pan';
        const info = gesture;
        gesture = null;
        if (cancelled || !wasPan || info.wasPinch || p.type === 'mouse') return;

        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        const elapsed = performance.now() - p.startTime;

        // Swipe to turn pages, only when the page is at fit zoom (never while panning).
        if (!isZoomedIn() && elapsed < 700 && Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
            lastTap = null;
            goToPage(pageNum + (dx < 0 ? 1 : -1));
            return;
        }

        // Double-tap toggles fit <-> 200% around the tapped point.
        if (!info.moved && elapsed < 350) {
            const now = performance.now();
            if (lastTap && now - lastTap.time < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32) {
                lastTap = null;
                const [fx, fy] = stagePoint(e.clientX, e.clientY);
                toggleFitAndZoom(fx, fy);
            } else {
                lastTap = { time: now, x: e.clientX, y: e.clientY };
            }
        }
    }
    stage.addEventListener('pointerup', (e) => endPointer(e, false));
    stage.addEventListener('pointercancel', (e) => endPointer(e, true));

    // Mouse double-click toggles fit <-> 200% around the cursor. (Touch double-taps are
    // handled in endPointer; some browsers also synthesize a dblclick for them.)
    stage.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (lastPointerType !== 'mouse') return;
        const [fx, fy] = stagePoint(e.clientX, e.clientY);
        toggleFitAndZoom(fx, fy);
    });

    // Ctrl + wheel and trackpad pinch (reported as ctrl+wheel) zoom around the cursor.
    // A plain wheel pans the page while zoomed in, and is left to the app when at fit.
    stage.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            cancelAnimation();
            const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
            const factor = clamp(Math.exp(-e.deltaY * unit * 0.01), 0.8, 1.25);
            const [fx, fy] = stagePoint(e.clientX, e.clientY);
            zoomAt(z * factor, fx, fy);
            return;
        }
        if (isZoomedIn()) {
            e.preventDefault();
            cancelAnimation();
            const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? ch : 1;
            const horizontal = e.shiftKey && !e.deltaX;
            const moveX = horizontal ? e.deltaY : e.deltaX;
            const moveY = horizontal ? 0 : e.deltaY;
            [tx, ty] = clampPan(tx - moveX * unit, ty - moveY * unit, z);
            apply();
        }
    }, { passive: false });

    // Safari's proprietary pinch events would zoom the whole page.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
        stage.addEventListener(name, (e) => e.preventDefault());
    });

    // --- keyboard --------------------------------------------------------
    const onKeyDown = (e) => {
        if (destroyed || !stage.isConnected || isTypingTarget(e.target)) return;
        if (e.ctrlKey || e.metaKey) {
            if (e.key === '+' || e.key === '=' || e.key === 'Add') {
                e.preventDefault();
                animateZoom(z * BUTTON_ZOOM_STEP);
            } else if (e.key === '-' || e.key === '_' || e.key === 'Subtract') {
                e.preventDefault();
                animateZoom(z / BUTTON_ZOOM_STEP);
            } else if (e.key === '0') {
                e.preventDefault();
                animateZoom(1);
            }
            return;
        }
        if (e.altKey || e.shiftKey) return;
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            goToPage(pageNum + 1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            goToPage(pageNum - 1);
        }
    };
    document.addEventListener('keydown', onKeyDown);

    // --- resize / orientation / fullscreen -------------------------------
    function onResize() {
        if (destroyed || !page) return;
        const oldW = fitW;
        const oldH = fitH;
        const oldCw = cw;
        const oldCh = ch;
        const oldZ = z;
        measure();
        if (cw < 10 || ch < 10) return;
        computeFit();
        if (Math.abs(oldZ - 1) < FIT_EPSILON) {
            z = 1;
            [tx, ty] = clampPan(0, 0, 1);
        } else {
            // Keep the same part of the page centred when the area changes size.
            const fracX = (oldCw / 2 - tx) / (oldW * oldZ);
            const fracY = (oldCh / 2 - ty) / (oldH * oldZ);
            [tx, ty] = clampPan(cw / 2 - fracX * fitW * z, ch / 2 - fracY * fitH * z, z);
        }
        removeDetail();
        apply();
        clearTimeout(baseTimer);
        baseTimer = setTimeout(() => { renderBase().catch(() => {}); }, 150);
    }

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    resizeObserver?.observe(stage);
    const onWindowResize = () => onResize();
    const onOrientation = () => setTimeout(onResize, 250);
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', onOrientation);

    // --- go ----------------------------------------------------------------
    try {
        await loadPage(1);
    } catch (err) {
        destroyed = true;
        resizeObserver?.disconnect();
        window.removeEventListener('resize', onWindowResize);
        window.removeEventListener('orientationchange', onOrientation);
        document.removeEventListener('keydown', onKeyDown);
        host.style.cssText = originalHostStyle;
        throw err;
    }
    pageNum = 1;
    resetToFit();

    return {
        numPages: pdfDoc.numPages,
        getCurrentPage: () => pageNum,
        getZoom: () => z,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        goToPage,
        zoomIn: () => animateZoom(z * BUTTON_ZOOM_STEP),
        zoomOut: () => animateZoom(z / BUTTON_ZOOM_STEP),
        fit: () => animateZoom(1),
        onZoomChange: (fn) => { zoomListeners.push(fn); },
        onPageChange: (fn) => { pageListeners.push(fn); },
        destroy() {
            destroyed = true;
            cancelAnimation();
            clearTimeout(detailTimer);
            clearTimeout(baseTimer);
            try { baseTask?.cancel(); } catch (_) { /* nothing running */ }
            removeDetail();
            resizeObserver?.disconnect();
            window.removeEventListener('resize', onWindowResize);
            window.removeEventListener('orientationchange', onOrientation);
            document.removeEventListener('keydown', onKeyDown);
        }
    };
}
