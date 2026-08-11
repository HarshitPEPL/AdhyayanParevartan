const SUBJECT_ICONS = {
    'Mathematics':      { icon: 'fa-calculator', color: '#1B8039' },
    'Science':          { icon: 'fa-flask', color: '#1565C0' },
    'English':          { icon: 'fa-book', color: '#6A1B9A' },
    'Hindi':            { icon: 'fa-language', color: '#E65100' },
    'Social Studies':   { icon: 'fa-globe', color: '#00695C' },
    'EVS':              { icon: 'fa-leaf', color: '#AD1457' },
    'Physics':          { icon: 'fa-atom', color: '#4527A0' },
    'Chemistry':        { icon: 'fa-vial', color: '#2E7D32' },
    'Biology':          { icon: 'fa-dna', color: '#FF8C00' },
    'Computer Science': { icon: 'fa-laptop-code', color: '#0288D1' },
};

function escapeHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function pickBestQuiz(quizzes, subjectId = null) {
    const filtered = subjectId == null
        ? quizzes
        : quizzes.filter(q => Number(q.subject_id) === Number(subjectId));

    if (!filtered || filtered.length === 0) return null;

    return [...filtered].sort((a, b) => {
        const aLen = Array.isArray(a.questions) ? a.questions.length : 0;
        const bLen = Array.isArray(b.questions) ? b.questions.length : 0;
        if (bLen !== aLen) return bLen - aLen;
        return Number(b.quiz_id || 0) - Number(a.quiz_id || 0);
    })[0];
}

function getInitials(fullName) {
    const parts = (fullName || 'Student').trim().split(' ').filter(Boolean);
    return parts.map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const WIN_THRESHOLD = 70; // score_percent at/above this counts as a "win"

export async function init(navigateTo, state) {
    const summaryBadge = document.getElementById('quiz-center-summary-badge');
    const summaryTitle = document.getElementById('quiz-center-summary-title');
    const progressFill = document.getElementById('quiz-center-progress-fill');
    const quickPracticeBtn = document.getElementById('quiz-center-start');
    const subjectGrid = document.getElementById('quiz-center-subject-grid');
    const recentScores = document.getElementById('quiz-center-recent-scores');
    const summaryCard = document.getElementById('quiz-center-summary');
    const chapterCard = document.getElementById('quiz-center-chapter-card');
    const chapterDropdown = document.getElementById('quiz-center-chapter-dropdown');
    const chapterStartBtn = document.getElementById('quiz-center-chapter-start');
    const searchInput = document.getElementById('quiz-center-search');

    const user = state.currentUser;
    const classNumber = user?.class_number || 9;
    const quizzes = await window.adhyayan.getQuizzesByClass(classNumber);
    const subjects = await window.adhyayan.getSubjectsByClass(classNumber);

    // Header avatar/name
    const avatarEl = document.getElementById('quiz-center-avatar');
    const headingEl = document.getElementById('quiz-center-heading');
    if (avatarEl) avatarEl.textContent = getInitials(user?.full_name);
    if (headingEl) headingEl.textContent = user?.full_name ? `Hi, ${user.full_name.split(' ')[0]}` : 'Practice. Learn. Improve.';

    const quiz = pickBestQuiz(quizzes) || {
        title: 'No quiz available',
        subject_name: 'General',
        chapter_name: '',
        questions: [],
        subject_icon: 'fa-book'
    };

    if (summaryBadge) summaryBadge.textContent = quiz.subject_name || 'General';
    if (summaryTitle) summaryTitle.textContent = quiz.title || 'Quiz Practice';
    if (progressFill) progressFill.style.width = `${quiz.questions ? Math.min(100, Math.round((quiz.questions.length / 10) * 100)) : 0}%`;

    summaryCard?.addEventListener('click', () => {
        state.activeQuiz = quiz;
        navigateTo('quiz');
    });
    quickPracticeBtn?.addEventListener('click', () => {
        state.activeQuiz = quiz;
        navigateTo('quiz');
    });

    function openChapterForSubject(subjectName, subjectId, preselectQuizId = null) {
        const chaptersForSubject = quizzes
            .filter(q => Number(q.subject_id) === subjectId)
            .sort((a, b) => (Number(a.chapter_number) || 0) - (Number(b.chapter_number) || 0));

        if (chaptersForSubject.length === 0) {
            chapterCard && (chapterCard.style.display = 'none');
            return;
        }

        if (chapterDropdown) {
            chapterDropdown.innerHTML = chaptersForSubject.map((q, idx) => {
                const name = q.chapter_name || q.title || `Chapter ${idx + 1}`;
                const label = q.chapter_number ? `Chapter ${q.chapter_number}: ${name}` : name;
                return `<option value="${q.quiz_id}">${escapeHtml(label)}</option>`;
            }).join('');
            if (preselectQuizId != null) chapterDropdown.value = String(preselectQuizId);
        }
        if (chapterCard) {
            chapterCard.style.display = 'flex';
            chapterCard.dataset.subjectName = subjectName;
            chapterCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    let activeSubjectFilter = 'All';

    function renderSubjectGrid(filterText = '') {
        if (!subjectGrid) return;
        const term = filterText.trim().toLowerCase();
        let filtered = activeSubjectFilter === 'All'
            ? subjects
            : subjects.filter(s => s.subject_name === activeSubjectFilter);
        if (term) filtered = filtered.filter(s => s.subject_name.toLowerCase().includes(term));

        subjectGrid.innerHTML = filtered.map(subject => {
            const lookup = SUBJECT_ICONS[subject.subject_name] || { icon: 'fa-book', color: '#1f2937' };
            return `
                <div class="subject-card quiz-center-subject" data-subject="${subject.subject_name}" data-subject-id="${subject.subject_id}">
                    <div class="subject-icon" style="background:${lookup.color}15; color:${lookup.color};">
                        <i class="fa-solid ${lookup.icon}"></i>
                    </div>
                    <div class="subject-name">${subject.subject_name}</div>
                </div>
            `;
        }).join('');

        subjectGrid.querySelectorAll('.quiz-center-subject').forEach(card => {
            card.addEventListener('click', () => {
                openChapterForSubject(card.dataset.subject, Number(card.dataset.subjectId));
            });
        });
    }

    renderSubjectGrid();
    searchInput?.addEventListener('input', (e) => renderSubjectGrid(e.target.value));

    setupFilterModal();

    function setupFilterModal() {
        const filterIcon = document.getElementById('quiz-center-filter-icon');
        const filterOverlay = document.getElementById('qc-filter-overlay');
        const filterSheet = document.getElementById('qc-filter-sheet');
        const filterClose = document.getElementById('qc-filter-close');
        const filterApplyBtn = document.getElementById('qc-filter-apply');
        const filterResetBtn = document.getElementById('qc-filter-reset');
        const modalSubjectRow = document.getElementById('qc-filter-modal-subjects');
        const modalChapterRow = document.getElementById('qc-filter-modal-chapters');
        const activeFiltersRow = document.getElementById('qc-active-filters-row');

        let activeChapterQuiz = null; // the specific quiz (chapter) applied, or null
        let pendingSubject = 'All';
        let pendingChapterQuiz = null;

        function chaptersForSubjectName(subjectName) {
            const subject = subjects.find(s => s.subject_name === subjectName);
            if (!subject) return [];
            return quizzes
                .filter(q => Number(q.subject_id) === Number(subject.subject_id))
                .sort((a, b) => (Number(a.chapter_number) || 0) - (Number(b.chapter_number) || 0));
        }

        function renderModalSubjectPills() {
            if (!modalSubjectRow) return;
            const pills = ['All', ...subjects.map(s => s.subject_name)];
            modalSubjectRow.innerHTML = pills.map(name => `
                <div class="qc-pill ${name === pendingSubject ? 'active' : ''}" data-subject="${escapeHtml(name)}">
                    ${name === 'All' ? 'All Subjects' : escapeHtml(name)}
                </div>
            `).join('');
            modalSubjectRow.querySelectorAll('.qc-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    pendingSubject = pill.dataset.subject;
                    pendingChapterQuiz = null;
                    modalSubjectRow.querySelectorAll('.qc-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    renderModalChapterPills();
                });
            });
        }

        function renderModalChapterPills() {
            if (!modalChapterRow) return;
            const chapters = pendingSubject === 'All' ? [] : chaptersForSubjectName(pendingSubject);
            const pills = [`<div class="qc-pill ${pendingChapterQuiz == null ? 'active' : ''}" data-quiz="">All Chapters</div>`];
            chapters.forEach((q, idx) => {
                const num = q.chapter_number || idx + 1;
                pills.push(`<div class="qc-pill ${pendingChapterQuiz === q.quiz_id ? 'active' : ''}" data-quiz="${q.quiz_id}">Chapter ${num}</div>`);
            });
            modalChapterRow.innerHTML = pills.join('');
            modalChapterRow.querySelectorAll('.qc-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    pendingChapterQuiz = pill.dataset.quiz ? Number(pill.dataset.quiz) : null;
                    modalChapterRow.querySelectorAll('.qc-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                });
            });
        }

        function renderActiveFilterChip() {
            if (!activeFiltersRow) return;
            if (activeSubjectFilter === 'All' && activeChapterQuiz == null) {
                activeFiltersRow.classList.add('hidden');
                activeFiltersRow.innerHTML = '';
                return;
            }
            const chapterQuiz = quizzes.find(q => q.quiz_id === activeChapterQuiz);
            const label = chapterQuiz
                ? `${escapeHtml(activeSubjectFilter)} &bull; Chapter ${chapterQuiz.chapter_number || ''}`
                : escapeHtml(activeSubjectFilter);
            activeFiltersRow.classList.remove('hidden');
            activeFiltersRow.innerHTML = `
                <div class="qc-active-filter-chip">
                    ${label}
                    <i class="fa-solid fa-xmark" id="qc-clear-filter"></i>
                </div>
            `;
            document.getElementById('qc-clear-filter')?.addEventListener('click', clearFilters);
        }

        function clearFilters() {
            activeSubjectFilter = 'All';
            activeChapterQuiz = null;
            pendingSubject = 'All';
            pendingChapterQuiz = null;
            filterIcon?.classList.remove('active');
            renderSubjectGrid(searchInput?.value || '');
            renderActiveFilterChip();
            if (chapterCard) chapterCard.style.display = 'none';
        }

        function openFilterModal() {
            pendingSubject = activeSubjectFilter;
            pendingChapterQuiz = activeChapterQuiz;
            renderModalSubjectPills();
            renderModalChapterPills();
            filterOverlay?.classList.remove('hidden');
            filterSheet?.classList.remove('hidden');
        }

        function closeFilterModal() {
            filterOverlay?.classList.add('hidden');
            filterSheet?.classList.add('hidden');
        }

        filterIcon?.addEventListener('click', openFilterModal);
        filterClose?.addEventListener('click', closeFilterModal);
        filterOverlay?.addEventListener('click', closeFilterModal);

        filterApplyBtn?.addEventListener('click', () => {
            activeSubjectFilter = pendingSubject;
            activeChapterQuiz = pendingChapterQuiz;
            filterIcon?.classList.toggle('active', activeSubjectFilter !== 'All' || activeChapterQuiz != null);
            renderSubjectGrid(searchInput?.value || '');
            renderActiveFilterChip();

            if (activeSubjectFilter !== 'All') {
                const subject = subjects.find(s => s.subject_name === activeSubjectFilter);
                if (subject) openChapterForSubject(activeSubjectFilter, subject.subject_id, activeChapterQuiz);
            }
            closeFilterModal();
        });

        filterResetBtn?.addEventListener('click', clearFilters);
    }

    chapterStartBtn?.addEventListener('click', () => {
        const selectedQuizId = chapterDropdown ? Number(chapterDropdown.value) : null;
        const selectedQuiz = quizzes.find(q => Number(q.quiz_id) === selectedQuizId);
        if (selectedQuiz) {
            state.activeQuiz = selectedQuiz;
            navigateTo('quiz');
        }
    });

    let attempts = [];
    if (recentScores) {
        if (user) {
            attempts = await window.adhyayan.getQuizAttemptsByUser(user.user_id);
            if (attempts.length === 0) {
                recentScores.innerHTML = `<div class="qc-empty-note">No quiz attempts yet. Finish a quiz to see your results here.</div>`;
            } else {
                recentScores.innerHTML = attempts.slice(0, 3).map(attempt => `
                    <div class="recent-score-card">
                        <div class="score-icon ${attempt.score_percent >= 90 ? 'green' : attempt.score_percent >= 75 ? 'purple' : 'orange'}"><i class="fa-solid fa-trophy"></i></div>
                        <div>
                            <div class="score-value">${attempt.score_percent}%</div>
                            <div class="score-label">${attempt.quiz_title || attempt.subject_name || 'Quiz'}</div>
                            <div class="score-timestamp">${new Date(attempt.taken_at).toLocaleDateString()}</div>
                        </div>
                    </div>
                `).join('');
            }
        } else {
            recentScores.innerHTML = `<div class="qc-empty-note">Log in to see your recent quiz scores.</div>`;
        }
    }

    initTabs(state, { user, classNumber, quizzes, attempts });
}

function initTabs(state, ctx) {
    const tabsBar = document.getElementById('quiz-center-tabs');
    const panels = document.querySelectorAll('.qc-tab-panel');
    if (!tabsBar) return;

    let statsLoaded = false;
    let leaderboardLoaded = false;

    tabsBar.querySelectorAll('.qc-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            tabsBar.querySelectorAll('.qc-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.tab;
            panels.forEach(p => p.classList.toggle('hidden', p.dataset.panel !== target));

            if (target === 'stats' && !statsLoaded) {
                statsLoaded = true;
                renderStatsTab(ctx);
            }
            if (target === 'leaderboard' && !leaderboardLoaded) {
                leaderboardLoaded = true;
                renderLeaderboardTab(state, ctx, 'week');
            }
        });
    });
}

function renderStatsTab({ user, quizzes, attempts }) {
    const monthCount = document.getElementById('qc-month-count');
    const monthRing = document.getElementById('qc-month-ring');
    const statAttempted = document.getElementById('qc-stat-attempted');
    const statWon = document.getElementById('qc-stat-won');
    const statXp = document.getElementById('qc-stat-xp');
    const barChart = document.getElementById('qc-bar-chart');

    const now = new Date();
    const thisMonthAttempts = attempts.filter(a => {
        const d = new Date(a.taken_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });

    const totalQuizzesAvailable = Math.max(quizzes.length, 1);
    const monthPct = Math.min(100, Math.round((thisMonthAttempts.length / totalQuizzesAvailable) * 100));

    if (monthCount) monthCount.textContent = thisMonthAttempts.length;
    if (monthRing) monthRing.style.setProperty('--pct', monthPct);

    const totalXp = attempts.reduce((sum, a) => sum + (a.score_percent || 0), 0);
    const wonCount = attempts.filter(a => (a.score_percent || 0) >= WIN_THRESHOLD).length;

    if (statAttempted) statAttempted.textContent = attempts.length;
    if (statWon) statWon.textContent = wonCount;
    if (statXp) statXp.textContent = totalXp.toLocaleString();

    if (barChart) {
        if (attempts.length === 0) {
            barChart.style.display = 'block';
            barChart.innerHTML = `<div class="qc-empty-note">Complete a quiz to see your performance by category.</div>`;
        } else {
            const bySubject = new Map();
            attempts.forEach(a => {
                const name = a.subject_name || 'General';
                if (!bySubject.has(name)) bySubject.set(name, []);
                bySubject.get(name).push(a.score_percent || 0);
            });

            const rows = Array.from(bySubject.entries())
                .map(([name, scores]) => ({
                    name,
                    avg: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
                }))
                .sort((a, b) => b.avg - a.avg)
                .slice(0, 5);

            barChart.innerHTML = rows.map(row => `
                <div class="qc-bar-col">
                    <div class="qc-bar-value">${row.avg}%</div>
                    <div class="qc-bar" style="height:${Math.max(8, row.avg)}%;"></div>
                    <div class="qc-bar-label">${escapeHtml(row.name)}</div>
                </div>
            `).join('');
        }
    }
}

async function renderLeaderboardTab(state, { user, classNumber }, range) {
    const toggle = document.getElementById('qc-lb-toggle');
    const podium = document.getElementById('qc-podium');
    const list = document.getElementById('qc-lb-list');

    toggle?.querySelectorAll('.qc-lb-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.range === range);
        btn.onclick = () => renderLeaderboardTab(state, { user, classNumber }, btn.dataset.range);
    });

    const since = range === 'week' ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : null;
    const [leaderboard, users] = await Promise.all([
        window.adhyayan.getQuizLeaderboard(classNumber, since ? { since } : {}),
        window.adhyayan.getUsers()
    ]);

    const nameById = new Map(users.map(u => [Number(u.user_id), u.full_name]));
    const rows = leaderboard.map(r => ({
        student_id: Number(r.student_id),
        xp: Math.round(r.xp || 0),
        name: nameById.get(Number(r.student_id)) || 'Student'
    }));

    if (rows.length === 0) {
        if (podium) podium.innerHTML = '';
        if (list) list.innerHTML = `<div class="qc-empty-note">No quiz attempts ${range === 'week' ? 'this week' : 'yet'} for your class.</div>`;
        return;
    }

    const top3 = rows.slice(0, 3);
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

    if (podium) {
        podium.innerHTML = podiumOrder.map(row => {
            const rank = top3.indexOf(row) + 1;
            return `
                <div class="qc-podium-col" data-rank="${rank}">
                    <div class="qc-podium-avatar">
                        ${getInitials(row.name)}
                        <span class="qc-podium-medal">${medals[rank] || rank}</span>
                    </div>
                    <div class="qc-podium-name">${escapeHtml(row.name)}</div>
                    <div class="qc-podium-xp">${row.xp} XP</div>
                    <div class="qc-podium-bar"></div>
                </div>
            `;
        }).join('');
    }

    if (list) {
        list.innerHTML = rows.map((row, idx) => `
            <div class="qc-lb-row ${row.student_id === Number(user?.user_id) ? 'is-me' : ''}">
                <div class="qc-lb-rank">#${idx + 1}</div>
                <div class="qc-lb-avatar">${getInitials(row.name)}</div>
                <div class="qc-lb-name">${escapeHtml(row.name)}${row.student_id === Number(user?.user_id) ? ' (You)' : ''}</div>
                <div class="qc-lb-xp">${row.xp} XP</div>
            </div>
        `).join('');
    }
}
