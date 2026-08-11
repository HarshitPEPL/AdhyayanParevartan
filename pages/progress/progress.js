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

    const subjectList  = el('dynamic-subject-progress');
    const activityList = el('dynamic-recent-activity');

    try {
        // Use allSettled (not all) so one failed fetch (e.g. no logged-in user,
        // or a transient network hiccup) doesn't blank out everything else that
        // loaded successfully.
        const results = await Promise.allSettled([
            window.adhyayan.getSubjectsByClass(classNumber),
            window.adhyayan.getMaterialsByClass(classNumber),
            window.adhyayan.getQuizzesByClass(classNumber),
            user?.user_id ? window.adhyayan.getQuizAttemptsByUser(user.user_id) : Promise.resolve([])
        ]);

        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.error('Progress page fetch failed:', ['subjects', 'materials', 'quizzes', 'attempts'][i], r.reason);
            }
        });

        const subjects = results[0].status === 'fulfilled' ? results[0].value : [];
        const materials = results[1].status === 'fulfilled' ? results[1].value : [];
        const quizzes = results[2].status === 'fulfilled' ? results[2].value : [];
        const attempts = results[3].status === 'fulfilled' ? results[3].value : [];

        // Every material this student has made progress on (device-local),
        // used to compute real "completed lessons" percentages per subject.
        const materialProgress   = user?.user_id ? (window.adhyayan.getAllMaterialProgress?.(user.user_id) || []) : [];
        const completedMaterials = materialProgress.filter(p => p.percent >= 100);

        // Update stats
        if (el('stat-lessons')) el('stat-lessons').textContent = materials.length;
        if (el('stat-quizzes')) el('stat-quizzes').textContent = quizzes.length;
        if (el('stat-score'))   el('stat-score').textContent   = attempts.length
            ? `${Math.round(attempts.reduce((sum, a) => sum + a.score_percent, 0) / attempts.length)}%`
            : '—';

        if (!subjects || subjects.length === 0) {
            if (subjectList) {
                subjectList.innerHTML = `
                    <div style="padding:24px;text-align:center;color:#aaa;font-size:14px;">
                        No subjects found for Class ${classNumber}.<br>
                        Ask your admin to add subjects.
                    </div>
                `;
            }
            renderRecentActivity(activityList, completedMaterials, attempts);
            return;
        }

        // Build subject rows — completion % is now based on how many of the
        // subject's materials the student has actually finished (percent >= 100
        // in the local lesson-progress tracker), not on quiz scores.
        if (subjectList) {
            subjectList.innerHTML = subjects.map((sub, i) => {
                const subMats   = materials.filter(m => m.subject_name === sub.subject_name);
                const matCount  = subMats.length;
                const icon      = SUBJECT_ICONS[sub.subject_name] || 'fa-book';
                const color     = SUBJECT_COLORS[i % SUBJECT_COLORS.length];

                const completedCount = completedMaterials.filter(p => p.subject_name === sub.subject_name).length;
                const pct = matCount ? Math.round((completedCount / matCount) * 100) : 0;

                const subAttempts   = attempts.filter(a => a.subject_name === sub.subject_name);
                const attemptLabel  = subAttempts.length ? `${subAttempts.length} quiz attempt${subAttempts.length !== 1 ? 's' : ''}` : 'No quiz attempts yet';

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
                                ${completedCount}/${matCount} lesson${matCount !== 1 ? 's' : ''} completed • ${attemptLabel}
                            </div>
                            <div class="progress-bar-thin">
                                <div class="fill" style="width:${pct}%;background:${color};"></div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        renderRecentActivity(activityList, completedMaterials, attempts);
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

// Merges completed-lesson events and quiz-attempt events into a single,
// newest-first activity feed (falls back to the original empty-state card).
function renderRecentActivity(container, completedMaterials, attempts) {
    if (!container) return;

    const lessonEvents = completedMaterials.map(p => ({
        icon: 'fa-book-open',
        title: `Completed: ${p.title || 'Lesson'}`,
        subtitle: p.subject_name || 'General',
        timestamp: p.updated_at || 0
    }));

    const quizEvents = attempts.map(a => ({
        icon: 'fa-brain',
        title: `Quiz: ${a.quiz_title || 'Quiz'}`,
        subtitle: `${a.subject_name || 'General'} • ${a.score_percent}% score`,
        timestamp: a.taken_at ? new Date(a.taken_at).getTime() : 0
    }));

    const events = [...lessonEvents, ...quizEvents]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5);

    if (events.length === 0) {
        container.innerHTML = `
            <div class="audit-log-block">
                <div class="token-canvas"><i class="fa-solid fa-book-open"></i></div>
                <div class="log-content">
                    <h4>Start your first lesson!</h4>
                    <p>Go to My Library to begin.</p>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = events.map(e => `
        <div class="audit-log-block">
            <div class="token-canvas"><i class="fa-solid ${e.icon}"></i></div>
            <div class="log-content">
                <h4>${e.title}</h4>
                <p>${e.subtitle}${e.timestamp ? ' • ' + formatRelativeTime(e.timestamp) : ''}</p>
            </div>
        </div>
    `).join('');
}

function formatRelativeTime(timestamp) {
    const diffMin = Math.floor((Date.now() - timestamp) / 60000);
    if (diffMin < 1)  return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24)  return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7)  return `${diffDay}d ago`;
    return new Date(timestamp).toLocaleDateString();
}
