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
};

const SUBJECT_COLORS = [
    '#1B8039', '#1565C0', '#6A1B9A', '#E65100',
    '#00695C', '#AD1457', '#4527A0', '#2E7D32'
];

export async function init(navigateTo, state) {
    const user        = state.currentUser;
    const classNumber = user?.class_number || state.selectedClass || 9;
    const el          = id => document.getElementById(id);

    // Set class tag
    if (el('progress-class-tag')) {
        el('progress-class-tag').textContent =
            `Class ${classNumber}  •  ${user?.board || 'CBSE'}`;
    }

    const subjectList = el('dynamic-subject-progress');

    try {
        const [subjects, materials] = await Promise.all([
            window.adhyayan.getSubjectsByClass(classNumber),
            window.adhyayan.getMaterialsByClass(classNumber)
        ]);

        // Update stats
        if (el('stat-lessons')) el('stat-lessons').textContent = materials.length;

        if (!subjects || subjects.length === 0) {
            if (subjectList) {
                subjectList.innerHTML = `
                    <div style="padding:24px;text-align:center;color:#aaa;font-size:14px;">
                        No subjects found for Class ${classNumber}.<br>
                        Ask your admin to add subjects.
                    </div>
                `;
            }
            return;
        }

        // Build subject rows
        if (subjectList) {
            subjectList.innerHTML = subjects.map((sub, i) => {
                const subMats   = materials.filter(m => m.subject_name === sub.subject_name);
                const matCount  = subMats.length;
                const icon      = SUBJECT_ICONS[sub.subject_name] || 'fa-book';
                const color     = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
                // Progress is 0% since no real tracking yet; extend here when tracking is added
                const pct       = 0;

                return `
                    <div class="progress-trace-row">
                        <div class="icon-circle" style="background:${color}18;color:${color};">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div class="details">
                            <div class="top">
                                <h4>${sub.subject_name}</h4>
                                <span>${pct}%</span>
                            </div>
                            <div class="volume">
                                ${matCount} material${matCount !== 1 ? 's' : ''} available
                            </div>
                            <div class="progress-bar-thin">
                                <div class="fill" style="width:${pct}%;background:${color};"></div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Progress page load error:', err);
        if (subjectList) {
            subjectList.innerHTML = `
                <div style="padding:24px;text-align:center;color:#c00;font-size:14px;">
                    Could not load progress data.
                </div>
            `;
        }
    }
}
