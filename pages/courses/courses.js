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
    const formatPills   = document.querySelectorAll('.category-pill');
    const classLabel    = document.getElementById('courses-class-label');

    if (classLabel) {
        const name = state.currentUser?.full_name || 'Student';
        classLabel.textContent = `${name}  •  Class ${classNumber}`;
    }

    let materials    = [];
    let activeFormat  = 'All';
    let activeSubject = 'All';

    // --- Load subject filter pills ---
    try {
        const subjects = await getSubjectsByClass(classNumber);
        if (subjectSlider && subjects.length > 0) {
            const pills = [`<div class="subject-pill active" data-subject="All">All Subjects</div>`];
            subjects.forEach(s => {
                const icon = SUBJECT_ICONS[s.subject_name] || 'fa-book';
                pills.push(`
                    <div class="subject-pill" data-subject="${escapeHTML(s.subject_name)}">
                        <i class="fa-solid ${icon}"></i> ${escapeHTML(s.subject_name)}
                    </div>
                `);
            });
            subjectSlider.innerHTML = pills.join('');

            subjectSlider.querySelectorAll('.subject-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    subjectSlider.querySelectorAll('.subject-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    activeSubject = pill.dataset.subject;
                    renderFiltered();
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

    // --- Format pill clicks ---
    formatPills.forEach(pill => {
        pill.addEventListener('click', () => {
            formatPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeFormat = pill.dataset.filter;
            renderFiltered();
        });
    });

    // --- Render function ---
    function renderFiltered() {
        if (!container) return;

        let filtered = materials;
        if (activeFormat !== 'All') {
            filtered = filtered.filter(m => m.format_name === activeFormat);
        }
        if (activeSubject !== 'All') {
            filtered = filtered.filter(m => m.subject_name === activeSubject);
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-book-open"></i>
                    <p>No materials found for this filter.</p>
                    <span>Try selecting a different subject or type.</span>
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
