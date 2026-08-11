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

export async function init(navigateTo, state) {
    const { getMaterialsByClass, getSubjectsByClass } = window.adhyayan;
    const classNumber = parseInt(state.currentUser?.class_number || state.selectedClass || 9, 10);
    const container   = document.getElementById('student-materials-list');
    const subjectSlider = document.getElementById('subject-filter-slider');
    const classLabel    = document.getElementById('courses-class-label');
    const activeFiltersRow = document.getElementById('active-filters-row');

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
        console.error('Failed to load subjects for filter:', err);
    }

    // --- Load materials ---
    try {
        materials = await getMaterialsByClass(classNumber);
        renderFiltered();
    } catch (err) {
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
    filterClose?.addEventListener('click', closeFilterModal);
    filterOverlay?.addEventListener('click', closeFilterModal);

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

        container.innerHTML = filtered.map(mat => {
            const fmt   = FORMAT_ICONS[mat.format_name] || { icon: 'fa-file', color: '#888' };
            const subIcon = SUBJECT_ICONS[mat.subject_name] || 'fa-book';
            return `
                <div class="curriculum-item" onclick="window.viewMaterial(${mat.material_id})">
                    <div class="item-icon-wrap" style="background:${fmt.color}18;">
                        <i class="fa-solid ${fmt.icon}" style="color:${fmt.color};"></i>
                    </div>
                    <div class="item-details">
                        <h4>${escapeHTML(mat.title)}</h4>
                        <p>
                            <i class="fa-solid ${subIcon}" style="font-size:10px;margin-right:4px;"></i>
                            ${escapeHTML(mat.subject_name)}
                            ${mat.instructor_name ? ' &bull; ' + escapeHTML(mat.instructor_name) : ''}
                        </p>
                        <span class="format-badge" style="background:${fmt.color}18;color:${fmt.color};">
                            ${escapeHTML(mat.format_name)}
                        </span>
                        ${mat.duration_lessons ? `<span class="duration-badge"><i class="fa-regular fa-clock"></i> ${escapeHTML(mat.duration_lessons)}</span>` : ''}
                    </div>
                    <div class="item-action">
                        <i class="fa-solid fa-chevron-right"></i>
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
            navigateTo('lesson');
        }
    };
}
