// Uses window.adhyayan global (set by bundled core/app.js after db init)

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
    'History':          'fa-landmark',
    'Geography':        'fa-map',
    'Economics':        'fa-chart-line',
};

const SUBJECT_COLORS = [
    '#1B8039', '#1565C0', '#6A1B9A', '#E65100',
    '#00695C', '#AD1457', '#4527A0', '#2E7D32'
];

export async function init(navigateTo, state) {
    const user = state.currentUser;

    // --- Populate user info ---
    if (user) {
        const nameParts = (user.full_name || 'Student').trim().split(' ').filter(Boolean);
        const initials = nameParts.map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,';

        const el = id => document.getElementById(id);
        if (el('home-avatar'))   el('home-avatar').textContent   = initials;
        if (el('home-name'))     el('home-name').textContent     = user.full_name || 'Student';
        if (el('home-greeting')) el('home-greeting').textContent = greeting;
        if (el('home-class')) {
            const cls   = user.class_number || state.selectedClass || '?';
            const board = user.board || 'CBSE';
            el('home-class').textContent = `Class ${cls}  •  ${board}`;
        }
    }

    // --- Load subjects for user's class ---
    const classNumber = user?.class_number || state.selectedClass || 9;
    const slider = document.getElementById('home-subjects-slider');

    try {
        const subjects = await window.adhyayan.getSubjectsByClass(classNumber);

        if (!slider) return;

        if (!subjects || subjects.length === 0) {
            slider.innerHTML = `<div style="padding:16px;color:#888;font-size:14px;">No subjects found for Class ${classNumber}.</div>`;
        } else {
            slider.innerHTML = subjects.map((sub, i) => {
                const icon  = SUBJECT_ICONS[sub.subject_name] || 'fa-book';
                const color = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
                return `
                    <div class="subject-card" onclick="window.navigateTo('courses')" style="cursor:pointer;">
                        <div class="icon-circle" style="background:${color}15; color:${color};">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div class="title">${sub.subject_name}</div>
                        <div class="data">Class ${classNumber}</div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Failed to load subjects:', err);
        if (slider) slider.innerHTML = `<div style="padding:16px;color:#c00;font-size:14px;">Could not load subjects.</div>`;
    }

    // --- Load continue-learning card from first available material ---
    try {
        const materials = await window.adhyayan.getMaterialsByClass(classNumber);
        if (materials && materials.length > 0) {
            const mat = materials[0];
            const el  = id => document.getElementById(id);
            if (el('home-continue-subject')) el('home-continue-subject').textContent = mat.subject_name || 'Subject';
            if (el('home-continue-title'))   el('home-continue-title').textContent   = mat.title || 'Lesson';
            if (el('home-continue-info'))    el('home-continue-info').textContent    = mat.duration_lessons ? `Duration: ${mat.duration_lessons}` : 'Tap to start';
            const pct = 0;
            if (el('home-continue-bar'))     el('home-continue-bar').style.width     = `${pct}%`;
            if (el('home-continue-pct'))     el('home-continue-pct').textContent     = `${pct}%`;

            document.getElementById('resume-lesson')?.addEventListener('click', () => {
                state.activeMaterial = mat;
                navigateTo('lesson');
            });
        } else {
            // No materials - show friendly empty state
            const card = document.getElementById('home-continue-card');
            if (card) {
                card.innerHTML = `
                    <div style="width:100%;text-align:center;padding:10px 0;color:#aaa;font-size:14px;">
                        <i class="fa-solid fa-book-open" style="font-size:28px;margin-bottom:8px;display:block;"></i>
                        No lessons yet for Class ${classNumber}.<br>Check back soon!
                    </div>
                `;
            }
        }
    } catch (err) {
        console.error('Failed to load continue-learning material:', err);
    }

    // --- See all -> courses ---
    document.getElementById('home-see-all')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('courses');
    });
}