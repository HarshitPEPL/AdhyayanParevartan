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

// Bumped every time init() runs, so an async fetch started by an earlier
// (superseded) call to init() can detect it's stale and skip writing to the
// DOM once a later call has already taken over - otherwise a slow/failed
// request from a previous run can overwrite a newer, successful render.
let coursesInitGeneration = 0;

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
    let activeChapter  = 'All';
    let activeSubject  = 'All';
    // Selections staged inside the modal until "Apply Filters" is pressed
    let pendingChapter = 'All';
    let pendingSubject = 'All';

    // --- Load subject filter pills (quick row + modal copy) ---
    try {
        const subjects = await getSubjectsByClass(classNumber);
        if (isStale()) return;
        const pillsHTML = [`<div class="subject-pill active" data-subject="All">All Subjects</div>`];
        subjects.forEach(s => {
            const icon = SUBJECT_ICONS[s.subject_name] || 'fa-book';
            pillsHTML.push(`
                <div class="subject-pill" data-subject="${escapeHTML(s.subject_name)}">
                    <i class="fa-solid ${icon}"></i> ${escapeHTML(s.subject_name)}
                </div>
            `);
        });

        if (subjectSlider && subjects.length > 0) {
            subjectSlider.innerHTML = pillsHTML.join('');
            subjectSlider.querySelectorAll('.subject-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    activeSubject = pendingSubject = pill.dataset.subject;
                    activeChapter = pendingChapter = 'All';
                    syncSubjectPills();
                    renderActiveFilterChip();
                    renderFiltered();
                });
            });
        }

        if (modalSubjectRow && subjects.length > 0) {
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
    } catch (err) {
        if (isStale()) return;
        console.error('Failed to load subjects for filter:', err);
    }

    // --- Load materials ---
    try {
        const fetchedMaterials = await getMaterialsByClass(classNumber);
        if (isStale()) return;
        materials = fetchedMaterials;
        renderFiltered();
    } catch (err) {
        if (isStale()) return;
        console.error('Error fetching materials:', err);
        if (container) {
            container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-wifi-slash"></i><p>Failed to load library. Check your connection.</p></div>`;
        }
    }

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

    let searchTerm = '';
    searchInput?.addEventListener('input', () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        renderFiltered();
    });

    filterApplyBtn?.addEventListener('click', () => {
        activeSubject = pendingSubject;
        activeChapter = pendingChapter;
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

    // --- Show a removable chip when a chapter filter is applied ---
    function renderActiveFilterChip() {
        if (!activeFiltersRow) return;
        if (activeChapter === 'All') {
            activeFiltersRow.classList.add('hidden');
            activeFiltersRow.innerHTML = '';
            return;
        }
        const chapters = getSubjectChapters(activeSubject);
        const idx = chapters.findIndex(c => c.title === activeChapter);
        const matchedChapter = idx >= 0 ? chapters[idx] : null;
        const chapterLabel = matchedChapter?.chapter_number
            ? `Chapter ${matchedChapter.chapter_number}`
            : (idx >= 0 ? `Chapter ${idx + 1}` : escapeHTML(activeChapter));
        activeFiltersRow.classList.remove('hidden');
        activeFiltersRow.innerHTML = `
            <div class="active-filter-chip">
                ${chapterLabel}
                <i class="fa-solid fa-xmark" id="clear-chapter-filter"></i>
            </div>
        `;
        document.getElementById('clear-chapter-filter')?.addEventListener('click', () => {
            activeChapter = pendingChapter = 'All';
            renderChapterChips();
            renderActiveFilterChip();
            renderFiltered();
        });
    }

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
        if (searchTerm) {
            filtered = filtered.filter(m => m.title?.toLowerCase().includes(searchTerm));
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-book-open"></i>
                    <p>No materials found for this filter.</p>
                    <span>Try selecting a different subject or chapter.</span>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map((mat, i) => {
            const fmt = FORMAT_ICONS[mat.format_name] || { icon: 'fa-file', color: '#888' };
            const banner = BANNER_PALETTE[i % BANNER_PALETTE.length];
            const percent = progressByMaterial.get(Number(mat.material_id)) || 0;

            // Prefer the admin-uploaded cover image; fall back to the gradient + format icon.
            const bannerHTML = mat.thumbnail_url
                ? `<img src="${escapeHTML(mat.thumbnail_url)}" alt="" loading="lazy">`
                : `<div class="course-card-banner-icon"><i class="fa-solid ${fmt.icon}"></i></div>`;

            const progressHTML = percent > 0 ? `
                <div class="course-card-progress">
                    <div class="progress-track"><div class="progress-fill" style="width:${percent}%;"></div></div>
                    <span class="progress-label">${percent}% Complete</span>
                </div>
            ` : `<div class="course-card-not-started">Not Started</div>`;

            return `
                <div class="course-card" onclick="window.viewMaterial(${mat.material_id})">
                    <div class="course-card-banner" style="${mat.thumbnail_url ? '' : `background:${banner};`}">
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
