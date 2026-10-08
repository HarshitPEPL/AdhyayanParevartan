// Uses window.adhyayan global (set by bundled core/app.js after db init)

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t)
    );
}

const FORMAT_ICONS = {
    'E-Book':       { icon: 'fa-file-pdf',    color: '#E53935' },
    'Audio Book':   { icon: 'fa-headphones',  color: '#7B1FA2' },
    'Video Content':{ icon: 'fa-play-circle', color: '#1B8039' },
};

const SUBJECT_ICONS = {
    'Mathematics':      'fa-calculator',
    'Science':          'fa-flask',
    'English':          'fa-book',
    'Hindi':            'fa-language',
    'Social Studies':   'fa-globe',
    'EVS':              'fa-leaf',
    'Physics':          'fa-atom',
    'Chemistry':        'fa-vial',
    'Biology':          'fa-dna',
    'Computer Science': 'fa-laptop-code',
};

// Cycled by card index to give the grid the same colorful, varied look as
// the reference design (no per-subject meaning, just visual variety).
const BANNER_PALETTE = [
    'linear-gradient(135deg, #FDE68A 0%, #FBBF24 100%)',
    'linear-gradient(135deg, #BAE6FD 0%, #38BDF8 100%)',
    'linear-gradient(135deg, #BBF7D0 0%, #4ADE80 100%)',
    'linear-gradient(135deg, #E9D5FF 0%, #C084FC 100%)',
    'linear-gradient(135deg, #FBCFE8 0%, #F472B6 100%)',
    'linear-gradient(135deg, #A5F3FC 0%, #22D3EE 100%)',
    'linear-gradient(135deg, #FED7AA 0%, #FB923C 100%)',
    'linear-gradient(135deg, #FFE4C4 0%, #FDBA74 100%)',
];

const TYPE_OPTIONS = {
    'E-Book':        { icon: 'fa-file-pdf' },
    'Video Content': { icon: 'fa-circle-play' },
    'Audio Book':    { icon: 'fa-headphones' },
};

// URL slug <-> content type, used by the ?type= route parameter
// (e.g. #courses?type=ebook) so a filter survives refresh and shared links.
const TYPE_SLUGS = {
    'E-Book':        'ebook',
    'Audio Book':    'audio',
    'Video Content': 'video',
};
const TYPE_PLURAL_LABELS = {
    'E-Book':        'E-Books',
    'Audio Book':    'Audio Books',
    'Video Content': 'Video Lessons',
};

// Unknown or missing values fall back to "All" (show everything).
function typeFromSlug(slug) {
    const key = String(slug || '').toLowerCase().replace(/[^a-z]/g, '');
    if (key === 'ebook' || key === 'ebooks') return 'E-Book';
    if (key === 'audio' || key === 'audiobook' || key === 'audiobooks') return 'Audio Book';
    if (key === 'video' || key === 'videos' || key === 'videolessons' || key === 'videocontent') return 'Video Content';
    return 'All';
}

// Maps whatever the data source stores (format_name variants) to one of the
// three canonical types, so filtering never depends on display text.
function normalizeContentType(raw) {
    const v = String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!v) return '';
    if (v.includes('audio') || v === 'podcast') return 'Audio Book';
    if (v.includes('video')) return 'Video Content';
    if (v.includes('ebook') || v === 'pdf' || v === 'book' || v === 'document') return 'E-Book';
    return '';
}

// Cards shown per pagination page.
const PAGE_SIZE = 20;

// Bumped every time init() runs, so an async fetch started by an earlier
// (superseded) call to init() can detect it's stale and skip writing to the
// DOM once a later call has already taken over - otherwise a slow/failed
// request from a previous run can overwrite a newer, successful render.
let coursesInitGeneration = 0;

// Last known-good subjects/materials per class, kept at module scope so it
// survives across remounts of this page (the module itself is only loaded
// once by the router; init() just re-runs on it). This is what lets a
// transient network blip - e.g. the very first fetch right after the app
// boots, or a flaky mobile connection - fall back to what already loaded
// successfully instead of showing a hard error every time the user tabs
// away and back.
const subjectsCache  = new Map(); // classNumber -> subjects[]
const materialsCache = new Map(); // classNumber -> materials[]

// Retries a request a couple of times (with a short delay) before giving up,
// so a one-off blip on first load doesn't have to surface as a user-facing
// error at all.
async function withRetry(fn, attempts = 2, delayMs = 700) {
    let lastErr;
    for (let i = 0; i <= attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (i < attempts) await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw lastErr;
}

export async function init(navigateTo, state) {
    const myGeneration = ++coursesInitGeneration;
    const isStale = () => myGeneration !== coursesInitGeneration;

    const { getMaterialsByClass, getSubjectsByClass, getAllMaterialProgress } = window.adhyayan;
    const classNumber = parseInt(state.currentUser?.class_number || state.selectedClass || 9, 10);
    const userId = state.currentUser?.user_id;
    const container   = document.getElementById('student-materials-list');
    const subjectSlider = document.getElementById('subject-filter-slider');
    const classLabel    = document.getElementById('courses-class-label');
    const activeFiltersRow = document.getElementById('active-filters-row');
    const searchInput   = document.getElementById('courses-search-input');
    const searchFilterIcon = document.getElementById('courses-search-filter-icon');
    const paginationEl  = document.getElementById('courses-pagination');
    const scrollBody     = document.getElementById('courses-scroll-body');

    // Progress lookup (material_id -> percent), populated once up front so
    // renderFiltered() can stay synchronous.
    let progressByMaterial = new Map();
    try {
        (getAllMaterialProgress?.(userId) || []).forEach(p => progressByMaterial.set(Number(p.material_id), p.percent));
    } catch (err) {
        console.error('Failed to load progress for library cards:', err);
    }

    // Filter modal elements (opened via the top-right sliders icon)
    const filterIcon      = document.getElementById('courses-filter-icon');
    const filterOverlay    = document.getElementById('courses-filter-overlay');
    const filterSheet      = document.getElementById('courses-filter-sheet');
    const filterClose      = document.getElementById('courses-filter-close');
    const filterApplyBtn   = document.getElementById('courses-filter-apply');
    const filterResetBtn   = document.getElementById('courses-filter-reset');
    const modalSubjectRow  = document.getElementById('filter-modal-subjects');
    const modalChapterRow  = document.getElementById('filter-modal-chapters');

    if (classLabel) {
        const name = state.currentUser?.full_name || 'Student';
        classLabel.textContent = `${name}  •  Class ${classNumber}`;
    }

    let materials     = [];
    let materialsLoaded = false;
    let activeChapter  = 'All';
    let activeSubject  = 'All';
    let activeType     = typeFromSlug(state.routeParams?.type);
    // Selections staged inside the modal until "Apply Filters" is pressed
    let pendingChapter = 'All';
    let pendingSubject = 'All';
    // Declared here (rather than near its search-input listener below) because
    // loadMaterials() -> renderFiltered() reads it and runs before this point
    // in the function body; declaring it later left it in the temporal dead
    // zone, throwing "Cannot access 'searchTerm' before initialization" and
    // leaving the page stuck on "Loading your library..." forever.
    let searchTerm = '';
    let currentPage = 1;

    // --- Load subject filter pills (quick row + modal copy) ---
    try {
        const subjects = await withRetry(() => getSubjectsByClass(classNumber));
        if (isStale()) return;
        subjectsCache.set(classNumber, subjects);
        renderSubjectPills(subjects);
    } catch (err) {
        if (isStale()) return;
        console.error('Failed to load subjects for filter:', err);
        // Fall back to whatever last loaded successfully for this class,
        // rather than leaving the filter row empty on a transient failure.
        const cached = subjectsCache.get(classNumber);
        if (cached) renderSubjectPills(cached);
    }

    // Only subjects that actually have course content are offered as filters.
    function renderSubjectPills(allSubjects) {
        if (!materialsLoaded) return;
        const withContent = new Set(materials.map(m => m.subject_name));
        const subjects = allSubjects.filter(s => withContent.has(s.subject_name));
        const pillsHTML = [`<div class="subject-pill active" data-subject="All">All Subjects</div>`];
        subjects.forEach(s => {
            const icon = SUBJECT_ICONS[s.subject_name] || 'fa-book';
            pillsHTML.push(`
                <div class="subject-pill" data-subject="${escapeHTML(s.subject_name)}">
                    <i class="fa-solid ${icon}"></i> ${escapeHTML(s.subject_name)}
                </div>
            `);
        });

        if (subjectSlider) {
            subjectSlider.innerHTML = pillsHTML.join('');
            subjectSlider.querySelectorAll('.subject-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    activeSubject = pendingSubject = pill.dataset.subject;
                    activeChapter = pendingChapter = 'All';
                    currentPage = 1;
                    syncSubjectPills();
                    renderActiveFilterChip();
                    renderFiltered();
                });
            });
        }

        if (modalSubjectRow) {
            modalSubjectRow.innerHTML = pillsHTML.join('');
            modalSubjectRow.querySelectorAll('.subject-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    pendingSubject = pill.dataset.subject;
                    pendingChapter = 'All';
                    modalSubjectRow.querySelectorAll('.subject-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    renderChapterChips();
                });
            });
        }
    }

    // --- Load materials ---
    async function loadMaterials() {
        try {
            const fetchedMaterials = await withRetry(() => getMaterialsByClass(classNumber));
            if (isStale()) return;
            materials = fetchedMaterials;
            materialsLoaded = true;
            materialsCache.set(classNumber, fetchedMaterials);
            const knownSubjects = subjectsCache.get(classNumber);
            if (knownSubjects) renderSubjectPills(knownSubjects);
            renderFiltered();
        } catch (err) {
            if (isStale()) return;
            console.error('Error fetching materials:', err);
            // A transient failure on remount shouldn't wipe out a library that
            // already loaded successfully earlier in this session.
            const cached = materialsCache.get(classNumber);
            if (cached) {
                materials = cached;
                materialsLoaded = true;
                const knownSubjects = subjectsCache.get(classNumber);
                if (knownSubjects) renderSubjectPills(knownSubjects);
                renderFiltered();
                return;
            }
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-wifi-slash"></i>
                        <p>Failed to load library. Check your connection.</p>
                        <button type="button" id="courses-retry-btn" class="course-card-btn" style="width:auto;padding:9px 24px;">Retry</button>
                    </div>
                `;
                document.getElementById('courses-retry-btn')?.addEventListener('click', () => {
                    if (isStale()) return;
                    container.innerHTML = `<div class="loading-state"><div class="loader-ring"></div><p>Loading...</p></div>`;
                    loadMaterials();
                });
            }
        }
    }
    await loadMaterials();

    // Prefer the real chapter_number column when materials have it set; otherwise
    // fall back to deriving an order from first-appearance (sorted by material_id,
    // since older seeded materials predate the chapter_number column).
    function getSubjectChapters(subject) {
        const chapters = [...materials]
            .filter(m => m.subject_name === subject)
            .sort((a, b) => a.material_id - b.material_id)
            .reduce((acc, m) => {
                const existing = acc.find(c => c.title === m.title);
                if (!existing) {
                    acc.push({ title: m.title, chapter_number: m.chapter_number ?? null });
                } else if (existing.chapter_number == null && m.chapter_number != null) {
                    existing.chapter_number = m.chapter_number;
                }
                return acc;
            }, []);

        if (chapters.some(c => c.chapter_number != null)) {
            chapters.sort((a, b) => {
                if (a.chapter_number == null) return 1;
                if (b.chapter_number == null) return -1;
                return a.chapter_number - b.chapter_number;
            });
        }
        return chapters;
    }

    function getSubjectChapterTitles(subject) {
        return getSubjectChapters(subject).map(c => c.title);
    }

    // --- Chapter chips (inside the filter modal, scoped to the selected subject) ---
    function renderChapterChips() {
        if (!modalChapterRow) return;

        const chapters = pendingSubject === 'All' ? [] : getSubjectChapters(pendingSubject);

        const chips = [`<div class="category-pill" data-chapter="All">All Chapters</div>`];
        chapters.forEach((c, i) => {
            const label = c.chapter_number ? `Chapter ${c.chapter_number}` : `Chapter ${i + 1}`;
            chips.push(`<div class="category-pill" data-chapter="${escapeHTML(c.title)}">${label}</div>`);
        });
        modalChapterRow.innerHTML = chips.join('');

        modalChapterRow.querySelectorAll('.category-pill').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.chapter === pendingChapter);
            pill.addEventListener('click', () => {
                pendingChapter = pill.dataset.chapter;
                modalChapterRow.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            });
        });
    }

    // --- Filter modal open/close ---
    function openFilterModal() {
        pendingSubject = activeSubject;
        pendingChapter = activeChapter;
        if (modalSubjectRow) {
            modalSubjectRow.querySelectorAll('.subject-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.subject === activeSubject);
            });
        }
        renderChapterChips();
        filterOverlay?.classList.remove('hidden');
        filterSheet?.classList.remove('hidden');
        filterIcon?.classList.add('active');
    }

    function closeFilterModal() {
        filterOverlay?.classList.add('hidden');
        filterSheet?.classList.add('hidden');
        filterIcon?.classList.toggle('active', activeChapter !== 'All' || activeSubject !== 'All');
    }

    filterIcon?.addEventListener('click', openFilterModal);
    searchFilterIcon?.addEventListener('click', openFilterModal);
    filterClose?.addEventListener('click', closeFilterModal);
    filterOverlay?.addEventListener('click', closeFilterModal);

    searchInput?.addEventListener('input', () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        currentPage = 1;
        renderFiltered();
    });

    filterApplyBtn?.addEventListener('click', () => {
        activeSubject = pendingSubject;
        activeChapter = pendingChapter;
        currentPage = 1;
        syncSubjectPills();
        renderActiveFilterChip();
        renderFiltered();
        closeFilterModal();
    });

    filterResetBtn?.addEventListener('click', () => {
        pendingSubject = 'All';
        pendingChapter = 'All';
        activeSubject  = 'All';
        activeChapter  = 'All';
        currentPage = 1;
        syncSubjectPills();
        if (modalSubjectRow) {
            modalSubjectRow.querySelectorAll('.subject-pill').forEach(p => p.classList.toggle('active', p.dataset.subject === 'All'));
        }
        renderChapterChips();
        renderActiveFilterChip();
        renderFiltered();
        closeFilterModal();
    });

    // --- Keep the quick subject row in sync with the active selection ---
    function syncSubjectPills() {
        if (!subjectSlider) return;
        subjectSlider.querySelectorAll('.subject-pill').forEach(p => {
            p.classList.toggle('active', p.dataset.subject === activeSubject);
        });
    }

    // --- Removable chips for the applied filters + a "Clear Filters" action ---
    // Subject is only echoed here while a content type is active, so the
    // combined (AND) selection is visible; the subject row itself is unchanged.
    function renderActiveFilterChip() {
        if (!activeFiltersRow) return;
        if (activeChapter === 'All' && activeType === 'All') {
            activeFiltersRow.classList.add('hidden');
            activeFiltersRow.innerHTML = '';
            return;
        }
        const chips = [];
        if (activeType !== 'All' && activeSubject !== 'All') {
            chips.push(`<div class="active-filter-chip">Subject: ${escapeHTML(activeSubject)}</div>`);
        }
        if (activeType !== 'All') {
            chips.push(`<div class="active-filter-chip">Content Type: ${escapeHTML(activeType)}<i class="fa-solid fa-xmark" id="clear-type-filter" role="button" aria-label="Clear content type"></i></div>`);
        }
        if (activeChapter !== 'All') {
            const chapters = getSubjectChapters(activeSubject);
            const idx = chapters.findIndex(c => c.title === activeChapter);
            const matchedChapter = idx >= 0 ? chapters[idx] : null;
            const chapterLabel = matchedChapter?.chapter_number
                ? `Chapter ${matchedChapter.chapter_number}`
                : (idx >= 0 ? `Chapter ${idx + 1}` : escapeHTML(activeChapter));
            chips.push(`<div class="active-filter-chip">${chapterLabel}<i class="fa-solid fa-xmark" id="clear-chapter-filter"></i></div>`);
        }
        chips.push(`<button type="button" class="active-filter-clear" id="clear-all-filters">Clear Filters</button>`);
        activeFiltersRow.classList.remove('hidden');
        activeFiltersRow.innerHTML = chips.join('');
        document.getElementById('clear-chapter-filter')?.addEventListener('click', () => {
            activeChapter = pendingChapter = 'All';
            currentPage = 1;
            renderChapterChips();
            renderActiveFilterChip();
            renderFiltered();
        });
        document.getElementById('clear-type-filter')?.addEventListener('click', () => setContentType('All'));
        document.getElementById('clear-all-filters')?.addEventListener('click', () => {
            activeSubject = pendingSubject = 'All';
            activeChapter = pendingChapter = 'All';
            activeType = 'All';
            currentPage = 1;
            syncSubjectPills();
            renderChapterChips();
            syncTypeFilterUI();
            renderActiveFilterChip();
            renderFiltered();
        });
    }

    // --- Content type dropdown ---
    const typeFilterEl   = document.getElementById('type-filter');
    const typeBtn        = document.getElementById('type-filter-btn');
    const typeMenu       = document.getElementById('type-filter-menu');
    const typeBtnIcon    = document.getElementById('type-filter-icon');
    const typeBtnLabel   = document.getElementById('type-filter-label');

    function syncTypeFilterUI() {
        const active = activeType !== 'All';
        if (typeBtnLabel) typeBtnLabel.textContent = active ? activeType : 'Content Type';
        if (typeBtnIcon) typeBtnIcon.className = `fa-solid ${active ? TYPE_OPTIONS[activeType].icon : 'fa-layer-group'}`;
        typeBtn?.classList.toggle('active', active);
        typeMenu?.querySelectorAll('.type-filter-option').forEach(o => {
            const on = o.dataset.type === activeType;
            o.classList.toggle('active', on);
            o.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        syncTypeToUrl();
    }

    // Mirrors the active type into the URL (replaceState: no extra back-button
    // stops per filter click) so refresh / copy-paste keeps the same filter.
    function syncTypeToUrl() {
        if (state.currentRoute !== 'courses') return;
        const slug = TYPE_SLUGS[activeType];
        const route = slug ? `courses?type=${slug}` : 'courses';
        state.routeParams = slug ? { type: slug } : {};
        history.replaceState({ routeId: route }, '', '#' + route);
    }

    function setTypeMenuOpen(open) {
        typeMenu?.classList.toggle('hidden', !open);
        typeBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function setContentType(type) {
        activeType = type;
        currentPage = 1;
        syncTypeFilterUI();
        renderActiveFilterChip();
        renderFiltered();
    }

    typeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        setTypeMenuOpen(typeMenu?.classList.contains('hidden'));
    });
    typeMenu?.querySelectorAll('.type-filter-option').forEach(opt => {
        opt.addEventListener('click', () => {
            setContentType(opt.dataset.type);
            setTypeMenuOpen(false);
        });
    });

    // Outside press / Escape close the popover; replaced on every init() so
    // remounting the page never stacks duplicate listeners.
    window._coursesTypeFilterCleanup?.();
    const onOutsidePress = (e) => {
        if (typeFilterEl && !typeFilterEl.contains(e.target)) setTypeMenuOpen(false);
    };
    const onTypeKey = (e) => { if (e.key === 'Escape') setTypeMenuOpen(false); };
    document.addEventListener('mousedown', onOutsidePress);
    document.addEventListener('touchstart', onOutsidePress, { passive: true });
    document.addEventListener('keydown', onTypeKey);
    window._coursesTypeFilterCleanup = () => {
        document.removeEventListener('mousedown', onOutsidePress);
        document.removeEventListener('touchstart', onOutsidePress);
        document.removeEventListener('keydown', onTypeKey);
    };
    // Apply a content type that arrived through the route (home cards, refresh, shared link).
    // The list itself was already filtered by activeType when materials loaded.
    syncTypeFilterUI();
    renderActiveFilterChip();

    // --- Render function ---
    function renderFiltered() {
        if (!container) return;

        let filtered = materials;
        if (activeSubject !== 'All') {
            filtered = filtered.filter(m => m.subject_name === activeSubject);
        }
        if (activeChapter !== 'All') {
            filtered = filtered.filter(m => m.title === activeChapter);
        }
        if (activeType !== 'All') {
            filtered = filtered.filter(m => normalizeContentType(m.format_name) === activeType);
        }
        if (searchTerm) {
            filtered = filtered.filter(m => m.title?.toLowerCase().includes(searchTerm));
        }

        if (filtered.length === 0) {
            const typeHasContent = activeType === 'All'
                || materials.some(m => normalizeContentType(m.format_name) === activeType);
            if (activeType !== 'All' && !typeHasContent) {
                const label = TYPE_PLURAL_LABELS[activeType];
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid ${TYPE_OPTIONS[activeType].icon}"></i>
                        <p>No ${escapeHTML(label)} available for Class ${classNumber} yet.</p>
                        <span>New content is on the way. Check back soon or browse another content type.</span>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-book-open"></i>
                        <p>No materials found for this filter.</p>
                        <span>Try selecting a different subject, chapter or content type.</span>
                    </div>
                `;
            }
            renderPagination(0, 1);
            return;
        }

        // Clamp in case a filter change shrank the result set below the
        // previously active page (e.g. jumping from page 3 down to 1 page).
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        const pageStart = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

        container.innerHTML = pageItems.map((mat, i) => {
            const fmt = FORMAT_ICONS[mat.format_name] || { icon: 'fa-file', color: '#888' };
            const banner = BANNER_PALETTE[(pageStart + i) % BANNER_PALETTE.length];
            const percent = progressByMaterial.get(Number(mat.material_id)) || 0;

            // Prefer the admin-uploaded cover image; fall back to the gradient + format icon.
            const bannerHTML = mat.thumbnail_url
                ? `<img class="course-card-thumb-bg" src="${escapeHTML(mat.thumbnail_url)}" alt="" aria-hidden="true" loading="lazy">
                   <img class="course-card-thumb" src="${escapeHTML(mat.thumbnail_url)}" alt="" loading="lazy">`
                : `<div class="course-card-banner-icon"><i class="fa-solid ${fmt.icon}"></i></div>`;

            const progressHTML = percent > 0 ? `
                <div class="course-card-progress">
                    <div class="progress-track"><div class="progress-fill" style="width:${percent}%;"></div></div>
                    <span class="progress-label">${percent}% Complete</span>
                </div>
            ` : `<div class="course-card-not-started">Not Started</div>`;

            return `
                <div class="course-card" onclick="window.viewMaterial(${mat.material_id})">
                    <div class="course-card-banner${mat.thumbnail_url ? ' has-thumb' : ''}" style="${mat.thumbnail_url ? '' : `background:${banner};`}">
                        ${bannerHTML}
                    </div>
                    <div class="course-card-body">
                        <h4>${escapeHTML(mat.title)}</h4>
                        <p class="course-card-meta">${escapeHTML(mat.subject_name)} &bull; NCERT</p>
                        <div class="course-card-format-row">
                            <span class="course-card-format" style="color:${fmt.color};">${escapeHTML(mat.format_name)}</span>
                            ${mat.duration_lessons ? `<span class="course-card-duration">&bull; ${escapeHTML(mat.duration_lessons)}</span>` : ''}
                        </div>
                        ${progressHTML}
                        <button type="button" class="course-card-btn">${percent > 0 ? 'Continue' : 'Start'}</button>
                    </div>
                </div>
            `;
        }).join('');

        renderPagination(totalPages, currentPage);
    }

    // --- Pagination controls (Prev/Next + "Page X of Y") ---
    function renderPagination(totalPages, page) {
        if (!paginationEl) return;
        if (totalPages <= 1) {
            paginationEl.classList.add('hidden');
            paginationEl.innerHTML = '';
            return;
        }
        paginationEl.classList.remove('hidden');
        paginationEl.innerHTML = `
            <button type="button" class="courses-pagination-btn" id="courses-page-prev" ${page <= 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-chevron-left"></i> Prev
            </button>
            <span class="courses-pagination-info">Page ${page} of ${totalPages}</span>
            <button type="button" class="courses-pagination-btn" id="courses-page-next" ${page >= totalPages ? 'disabled' : ''}>
                Next <i class="fa-solid fa-chevron-right"></i>
            </button>
        `;
        document.getElementById('courses-page-prev')?.addEventListener('click', () => goToPage(currentPage - 1));
        document.getElementById('courses-page-next')?.addEventListener('click', () => goToPage(currentPage + 1));
    }

    function goToPage(page) {
        currentPage = page;
        renderFiltered();
        scrollBody?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- Global click handler for items ---
    window.viewMaterial = function(id) {
        const mat = materials.find(m => m.material_id === id);
        if (mat) {
            state.activeMaterial = mat;
            state.lastLibraryRoute = 'courses';
            navigateTo('lesson');
        }
    };
}
