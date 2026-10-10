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
        const set = (id, v) => { if (el(id)) el(id).textContent = v; };
        const classMatIds = new Set(materials.map(m => Number(m.material_id)));
        const doneCount = completedMaterials.filter(p => classMatIds.has(Number(p.material_id))).length;
        const overallPct = materials.length ? Math.round((doneCount / materials.length) * 100) : 0;
        const takenQuizIds = new Set(attempts.map(a => a.quiz_id ?? a.quiz_title));
        const avgScore = attempts.length
            ? Math.round(attempts.reduce((sum, a) => sum + a.score_percent, 0) / attempts.length)
            : null;
        const totalSec = materialProgress.reduce((s, p) => s + (Number(p.last_position_sec) || 0), 0);

        set('stat-lessons', doneCount);
        set('stat-lessons-note', `of ${materials.length} topics`);
        set('stat-quizzes', takenQuizIds.size);
        set('stat-quizzes-note', `of ${quizzes.length} available`);
        set('stat-score', avgScore == null ? '—' : `${avgScore}%`);
        set('stat-score-note', attempts.length ? `${attempts.length} attempt${attempts.length !== 1 ? 's' : ''} average` : 'No attempts yet');
        set('stat-time', formatDuration(totalSec));
        set('hero-percent', `${overallPct}%`);
        if (el('hero-ring')) el('hero-ring').style.setProperty('--p', overallPct);
        set('hero-sub', materials.length
            ? `You have completed ${doneCount} of ${materials.length} topics in Class ${classNumber}.`
            : 'No topics available for your class yet.');

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
            const cards = subjects.map((sub, i) => {
                const matCount = materials.filter(m => m.subject_name === sub.subject_name).length;
                const done = completedMaterials.filter(p => p.subject_name === sub.subject_name).length;
                const quizCount = attempts.filter(a => a.subject_name === sub.subject_name).length;
                return {
                    name: sub.subject_name,
                    icon: sub.subject_name === 'Science' ? 'fa-flask' : 'fa-book',
                    color: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
                    total: matCount,
                    done,
                    quizLabel: quizCount ? `${quizCount} quiz attempt${quizCount !== 1 ? 's' : ''}` : 'No quiz attempts yet'
                };
            });
            mountSubjectCarousel(subjectList, cards);
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

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SUBJECT_TINTS = [
    ['#e8f3e9', '#2e7d32'], ['#e6eef9', '#1e5fbf'], ['#f0e6f6', '#7b1fa2'], ['#fdeee6', '#e8590c'],
    ['#e0f0ee', '#00796b'], ['#f9e6ee', '#ad1457'], ['#ebe7f6', '#4527a0']
];
const SUBJECTS_PER_PAGE = 8;

function subjectRowHtml(c, i) {
    const [bg, fg] = SUBJECT_TINTS[i % SUBJECT_TINTS.length];
    const empty = c.total === 0;
    const pct = empty ? 0 : Math.round((c.done / c.total) * 100);
    const detail = empty
        ? 'No lessons yet'
        : `${c.done}/${c.total} lesson${c.total !== 1 ? 's' : ''} completed • ${escapeHtml(c.quizLabel)}`;
    return `
        <div class="sp-row${empty ? ' is-empty' : ''}">
            <div class="sp-icon" style="background:${bg};color:${fg};"><i class="fa-solid ${c.icon}"></i></div>
            <div class="sp-info">
                <div class="sp-top">
                    <h4 title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</h4>
                    <span class="sp-pct">${empty ? '—' : pct + '%'}</span>
                </div>
                <p class="sp-detail">${detail}</p>
                <div class="sp-bar"><div class="sp-fill" style="width:${pct}%"></div></div>
            </div>
        </div>`;
}

// Pages of 8 subjects (4 left + 4 right, column-first) that slide horizontally.
function mountSubjectCarousel(host, cards) {
    const pages = [];
    for (let i = 0; i < cards.length; i += SUBJECTS_PER_PAGE) pages.push(cards.slice(i, i + SUBJECTS_PER_PAGE));
    const pageCount = pages.length;

    const section = host.closest('.evaluation-pipeline') || document;
    const subtitle = section.querySelector('#subject-progress-count');
    const prevBtn = section.querySelector('#sp-prev');
    const nextBtn = section.querySelector('#sp-next');

    host.innerHTML = `
        <div class="sp-viewport" tabindex="0" aria-label="Subjects, use left and right arrow keys to change page">
            <div class="sp-track">
                ${pages.map((pg, n) => `<div class="sp-page" aria-label="Page ${n + 1} of ${pageCount}">${pg.map((c, j) => subjectRowHtml(c, n * SUBJECTS_PER_PAGE + j)).join('')}</div>`).join('')}
            </div>
        </div>
        <div class="sp-dots" ${pageCount <= 1 ? 'hidden' : ''}>
            ${pages.map((_, n) => `<button type="button" class="sp-dot" data-page="${n}" aria-label="Show subjects page ${n + 1}"></button>`).join('')}
        </div>`;

    const viewport = host.querySelector('.sp-viewport');
    const track = host.querySelector('.sp-track');
    const dots = host.querySelectorAll('.sp-dot');
    let page = 0;

    const update = () => {
        track.style.transform = `translateX(${-page * 100}%)`;
        track.querySelectorAll('.sp-page').forEach((p, i) => p.setAttribute('aria-hidden', String(i !== page)));
        dots.forEach((d, i) => {
            d.classList.toggle('on', i === page);
            if (i === page) d.setAttribute('aria-current', 'page'); else d.removeAttribute('aria-current');
        });
        if (prevBtn) prevBtn.disabled = page === 0;
        if (nextBtn) nextBtn.disabled = page >= pageCount - 1;
        if (subtitle) {
            const start = page * SUBJECTS_PER_PAGE + 1;
            const end = Math.min(start + SUBJECTS_PER_PAGE - 1, cards.length);
            subtitle.textContent = `${start}-${end} of ${cards.length} subject${cards.length !== 1 ? 's' : ''}`;
        }
    };
    const go = n => { page = Math.max(0, Math.min(n, pageCount - 1)); update(); };

    // onclick (not addEventListener) so re-mounting never stacks handlers on the header buttons.
    if (prevBtn) prevBtn.onclick = () => go(page - 1);
    if (nextBtn) nextBtn.onclick = () => go(page + 1);
    dots.forEach(d => d.addEventListener('click', () => go(Number(d.dataset.page))));
    viewport.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') go(page - 1);
        else if (e.key === 'ArrowRight') go(page + 1);
    });

    let sx = 0, sy = 0;
    viewport.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    viewport.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(page + (dx < 0 ? 1 : -1));
    }, { passive: true });

    update();
}

function formatDuration(sec) {
    if (!sec) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    return m ? `${m}m` : '<1m';
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
