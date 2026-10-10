const PROGRESS_PREFIX = 'adhyayan_quiz_progress_';
import { DEMO_QUIZZES, DEMO_ATTEMPTS, DEMO_CONTINUE, DEMO_LEADERBOARD } from './demo-data.js';
const WIN_THRESHOLD = 70; // score_percent at/above this counts as a "win"
const PASS_PERCENT = 50;  // below this a quiz is shown as "Retry"

function escapeHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getInitials(fullName) {
    const parts = (fullName || 'Student').trim().split(' ').filter(Boolean);
    return parts.map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function readSavedProgress(userId) {
    try {
        return JSON.parse(localStorage.getItem(PROGRESS_PREFIX + (userId || 'guest')) || '{}') || {};
    } catch (_) {
        return {};
    }
}

function sortByChapter(list) {
    return [...list].sort((a, b) =>
        (Number(a.chapter_number) || 9999) - (Number(b.chapter_number) || 9999) ||
        Number(a.quiz_id || 0) - Number(b.quiz_id || 0));
}

export async function init(navigateTo, state) {
    const classEl = document.getElementById('qz-class');
    const heroEl = document.getElementById('qz-hero');
    const heroTitle = document.getElementById('qz-hero-title');
    const heroMeta = document.getElementById('qz-hero-meta');
    const heroStart = document.getElementById('qz-hero-start');
    const continueEl = document.getElementById('qz-continue');
    const chipsEl = document.getElementById('qz-chips');
    const listEl = document.getElementById('qz-list');
    const seeAllBtn = document.getElementById('qz-see-all');

    const user = state.currentUser;
    const classNumber = user?.class_number || 9;
    if (classEl) classEl.textContent = `Class ${classNumber}`;

    if (listEl) {
        listEl.classList.add('is-loading');
        listEl.innerHTML = '<div class="qz-skeleton"></div>'.repeat(4);
    }

    let quizzes = [];
    let attempts = [];
    try {
        quizzes = await window.adhyayan.getQuizzesByClass(classNumber);
    } catch (err) {
        console.error('Failed to load quizzes:', err);
        if (listEl) {
            listEl.innerHTML = `<div class="qz-empty"><strong>Couldn't load quizzes</strong>Check your connection and try again.<br><button type="button" id="qz-retry">Retry</button></div>`;
            document.getElementById('qz-retry')?.addEventListener('click', () => navigateTo('quiz-center'));
        }
        initTabs(state, { user, classNumber, quizzes, attempts });
        return;
    }
    if (user) {
        try {
            attempts = await window.adhyayan.getQuizAttemptsByUser(user.user_id);
        } catch (err) {
            console.error('Failed to load quiz attempts:', err);
        }
    }

    let demoMode = false;
    if (!quizzes.length) {
        demoMode = true;
        quizzes = DEMO_QUIZZES;
        attempts = DEMO_ATTEMPTS;
    }

    const latestAttempt = new Map();
    attempts.forEach(a => {
        if (!latestAttempt.has(Number(a.quiz_id))) latestAttempt.set(Number(a.quiz_id), a);
    });

    const openQuiz = (quiz) => {
        state.activeQuiz = quiz;
        navigateTo('quiz');
    };

    // Today's challenge: first quiz not attempted yet, else the longest quiz
    const playable = quizzes.filter(q => Array.isArray(q.questions) && q.questions.length > 0);
    const challenge = sortByChapter(playable).find(q => !latestAttempt.has(Number(q.quiz_id)))
        || [...playable].sort((a, b) => b.questions.length - a.questions.length)[0];
    if (challenge && heroEl) {
        const n = challenge.questions.length;
        heroTitle.textContent = challenge.title || 'Quiz practice';
        heroMeta.textContent = `${n} question${n === 1 ? '' : 's'} · about ${Math.max(1, Math.round(n * 0.8))} min`;
        heroEl.hidden = false;
        heroStart?.addEventListener('click', () => openQuiz(challenge));
    }

    // Continue: most recent unfinished quiz saved by the quiz screen
    const saved = readSavedProgress(user?.user_id);
    const inProgress = Object.entries(saved)
        .map(([id, p]) => ({ quiz: quizzes.find(q => String(q.quiz_id) === id), p }))
        .filter(x => x.quiz && x.quiz.questions?.length && x.p && x.p.index < x.quiz.questions.length)
        .sort((a, b) => (b.p.at || 0) - (a.p.at || 0))[0]
        || (demoMode ? (() => {
            const quiz = quizzes.find(q => q.quiz_id === DEMO_CONTINUE.quizId);
            return quiz ? { quiz, p: { index: DEMO_CONTINUE.index } } : undefined;
        })() : undefined);
    if (inProgress && continueEl) {
        const total = inProgress.quiz.questions.length;
        const done = Math.min(total, Math.max(0, Number(inProgress.p.index) || 0));
        document.getElementById('qz-continue-count').textContent = `${done} of ${total}`;
        document.getElementById('qz-continue-title').textContent = inProgress.quiz.title || 'Quiz';
        const chapterBit = inProgress.quiz.chapter_number ? `Chapter ${inProgress.quiz.chapter_number}` : (inProgress.quiz.chapter_name || '');
        document.getElementById('qz-continue-sub').textContent = [inProgress.quiz.subject_name, chapterBit].filter(Boolean).join(' · ');
        const pct = Math.round((done / total) * 100);
        document.getElementById('qz-continue-fill').style.width = `${pct}%`;
        document.getElementById('qz-continue-bar').setAttribute('aria-valuenow', String(pct));
        continueEl.hidden = false;
        document.getElementById('qz-resume')?.addEventListener('click', () => openQuiz(inProgress.quiz));
    }

    let activeSubject = 'All';
    let expanded = false;
    let page = 0;
    const LIST_PAGE_SIZE = 10;
    const controlsEl = document.getElementById('qz-controls');
    const currentCols = () => {
        const w = listEl?.clientWidth || window.innerWidth;
        return w < 600 ? 1 : w < 940 ? 2 : 3;
    };
    const subjectNames = [...new Set(quizzes.map(q => q.subject_name).filter(Boolean))];

    function renderChips() {
        if (!chipsEl) return;
        chipsEl.innerHTML = ['All', ...subjectNames].map(name => `
            <button type="button" class="qz-chip${name === activeSubject ? ' active' : ''}" data-subject="${escapeHtml(name)}" aria-pressed="${name === activeSubject}">${escapeHtml(name)}</button>
        `).join('');
        chipsEl.querySelectorAll('.qz-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                activeSubject = btn.dataset.subject;
                page = 0;
                renderChips();
                renderList();
            });
        });
    }

    function statusFor(quiz) {
        const attempt = latestAttempt.get(Number(quiz.quiz_id));
        if (!attempt) return { kind: 'new', label: 'New' };
        const total = quiz.questions?.length || attempt.total_questions || 0;
        const pct = Number(attempt.score_percent) || 0;
        const correct = total ? Math.round((pct / 100) * total) : 0;
        const score = total ? `${correct}/${total}` : `${pct}%`;
        return pct < PASS_PERCENT
            ? { kind: 'low', label: `Retry · ${score}` }
            : { kind: 'good', label: score };
    }

    function renderList() {
        if (!listEl) return;
        listEl.classList.remove('is-loading');
        const shown = sortByChapter(activeSubject === 'All' ? quizzes : quizzes.filter(q => q.subject_name === activeSubject));
        if (shown.length === 0) {
            const filtered = activeSubject !== 'All';
            listEl.innerHTML = `
                <div class="qz-empty">
                    <strong>${filtered ? `No ${escapeHtml(activeSubject)} quizzes yet` : 'No quizzes yet'}</strong>
                    ${filtered ? 'Try another subject or view everything.' : 'New quizzes for your class will show up here.'}
                    ${filtered ? '<br><button type="button" id="qz-clear">Show all quizzes</button>' : ''}
                </div>`;
            if (controlsEl) controlsEl.innerHTML = '';
            document.getElementById('qz-clear')?.addEventListener('click', () => {
                activeSubject = 'All';
                page = 0;
                renderChips();
                renderList();
            });
            return;
        }
        listEl.classList.remove('is-loading');
        const cols = currentCols();
        listEl.style.setProperty('--qz-cols', cols);
        const cardHtml = (q, i) => {
            const st = statusFor(q);
            const n = q.questions?.length || q.question_count || 0;
            const tileNum = q.chapter_number || i + 1;
            return `
                <button type="button" class="qz-card" data-quiz="${q.quiz_id}">
                    <span class="qz-tile ${st.kind}">${escapeHtml(String(tileNum))}</span>
                    <span class="qz-card-text">
                        <span class="qz-card-title" style="display:block" title="${escapeHtml(q.title)}">${escapeHtml(q.title || 'Quiz')}</span>
                        <span class="qz-card-sub" style="display:block">${escapeHtml(q.subject_name || 'General')} · ${n} question${n === 1 ? '' : 's'}</span>
                    </span>
                    <span class="qz-badge ${st.kind}">${escapeHtml(st.label)}</span>
                </button>`;
        };

        const bindCards = () => {
            listEl.querySelectorAll('.qz-card').forEach(card => {
                card.addEventListener('click', () => {
                    const quiz = quizzes.find(q => String(q.quiz_id) === card.dataset.quiz);
                    if (quiz) openQuiz(quiz);
                });
            });
        };

        const perPage = expanded ? LIST_PAGE_SIZE : (cols === 1 ? 4 : cols * 3);
        const pageCount = Math.max(1, Math.ceil(shown.length / perPage));
        page = Math.min(Math.max(0, page), pageCount - 1);
        const chunks = [];
        for (let i = 0; i < shown.length; i += perPage) chunks.push(shown.slice(i, i + perPage));

        if (expanded) {
            const start = page * perPage;
            listEl.innerHTML = `<div class="qz-grid">${chunks[page].map((q, i) => cardHtml(q, start + i)).join('')}</div>`;
        } else {
            listEl.innerHTML = `
                <div class="qz-viewport">
                    <div class="qz-track" style="transform:translateX(${-page * 100}%)">
                        ${chunks.map((chunk, c) => `
                            <div class="qz-page qz-grid" ${c === page ? '' : 'inert aria-hidden="true"'}>
                                ${chunk.map((q, i) => cardHtml(q, c * perPage + i)).join('')}
                            </div>`).join('')}
                    </div>
                </div>`;
            attachSwipe(listEl.querySelector('.qz-viewport'), pageCount);
        }
        bindCards();
        renderControls(pageCount, shown.length);
    }

    function renderControls(pageCount, totalItems) {
        if (!controlsEl) return;
        if (pageCount <= 1) { controlsEl.innerHTML = ''; return; }
        if (!expanded) {
            controlsEl.innerHTML = `<div class="qz-dots" role="tablist" aria-label="Quiz pages">${
                Array.from({ length: pageCount }, (_, i) =>
                    `<button type="button" class="qz-dot${i === page ? ' active' : ''}" data-page="${i}" role="tab" aria-selected="${i === page}" aria-label="Page ${i + 1} of ${pageCount}"></button>`
                ).join('')}</div>`;
            controlsEl.querySelectorAll('.qz-dot').forEach(d => d.addEventListener('click', () => goTo(Number(d.dataset.page))));
            return;
        }
        const nums = [];
        for (let i = 0; i < pageCount; i++) {
            if (i === 0 || i === pageCount - 1 || Math.abs(i - page) <= 1) nums.push(i);
            else if (nums[nums.length - 1] !== '…') nums.push('…');
        }
        controlsEl.innerHTML = `
            <nav class="qz-pager" aria-label="Quiz pagination">
                <button type="button" class="qz-pg qz-pg-nav" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="Previous page">‹</button>
                ${nums.map(n => n === '…'
                    ? '<span class="qz-pg-gap" aria-hidden="true">…</span>'
                    : `<button type="button" class="qz-pg${n === page ? ' active' : ''}" data-page="${n}" ${n === page ? 'aria-current="page"' : ''} aria-label="Page ${n + 1}">${n + 1}</button>`).join('')}
                <button type="button" class="qz-pg qz-pg-nav" data-page="${page + 1}" ${page === pageCount - 1 ? 'disabled' : ''} aria-label="Next page">›</button>
            </nav>
            <p class="qz-pager-info">Showing ${page * LIST_PAGE_SIZE + 1}–${Math.min(totalItems, (page + 1) * LIST_PAGE_SIZE)} of ${totalItems}</p>`;
        controlsEl.querySelectorAll('.qz-pg').forEach(b => b.addEventListener('click', () => goTo(Number(b.dataset.page))));
    }

    function goTo(p) {
        page = p;
        renderList();
        if (expanded) listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function attachSwipe(el, pageCount) {
        if (!el || pageCount <= 1) return;
        let x0 = 0, y0 = 0;
        el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
        el.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - x0;
            const dy = e.changedTouches[0].clientY - y0;
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
            const next = page + (dx < 0 ? 1 : -1);
            if (next >= 0 && next < pageCount) goTo(next);
        }, { passive: true });
    }

    renderChips();
    renderList();
    seeAllBtn?.addEventListener('click', () => {
        expanded = !expanded;
        page = 0;
        seeAllBtn.textContent = expanded ? 'Show less' : 'See all';
        seeAllBtn.setAttribute('aria-expanded', String(expanded));
        renderList();
    });

    let lastCols = currentCols();
    const onResize = () => {
        if (!document.body.contains(listEl)) { window.removeEventListener('resize', onResize); return; }
        const cols = currentCols();
        if (cols !== lastCols) { lastCols = cols; page = 0; renderList(); }
    };
    window.addEventListener('resize', onResize);

    initTabs(state, { user, classNumber, quizzes, attempts, demo: demoMode });
}

function initTabs(state, ctx) {
    const tabsBar = document.getElementById('quiz-center-tabs');
    const panels = document.querySelectorAll('.qz-panel');
    if (!tabsBar) return;

    let statsLoaded = false;
    let leaderboardLoaded = false;

    tabsBar.querySelectorAll('.qz-view').forEach(btn => {
        btn.addEventListener('click', () => {
            tabsBar.querySelectorAll('.qz-view').forEach(b => {
                b.classList.toggle('active', b === btn);
                b.setAttribute('aria-selected', String(b === btn));
            });
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

function renderStatsTab({ quizzes, attempts }) {
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

    if (!barChart) return;
    if (attempts.length === 0) {
        barChart.style.display = 'block';
        barChart.innerHTML = `<div class="qc-empty-note">Complete a quiz to see your performance by category.</div>`;
        return;
    }
    const bySubject = new Map();
    attempts.forEach(a => {
        const name = a.subject_name || 'General';
        if (!bySubject.has(name)) bySubject.set(name, []);
        bySubject.get(name).push(a.score_percent || 0);
    });
    const rows = Array.from(bySubject.entries())
        .map(([name, scores]) => ({ name, avg: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) }))
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

async function renderLeaderboardTab(state, { user, classNumber, demo: ctxDemo }, range) {
    const toggle = document.getElementById('qc-lb-toggle');
    const podium = document.getElementById('qc-podium');
    const list = document.getElementById('qc-lb-list');

    toggle?.querySelectorAll('.qc-lb-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.range === range);
        btn.onclick = () => renderLeaderboardTab(state, { user, classNumber, demo: ctxDemo }, btn.dataset.range);
    });

    const since = range === 'week' ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : null;
    const [leaderboard, users] = await Promise.all([
        window.adhyayan.getQuizLeaderboard(classNumber, since ? { since } : {}),
        window.adhyayan.getUsers()
    ]);

    const nameById = new Map(users.map(u => [Number(u.user_id), u.full_name]));
    let rows = leaderboard.map(r => ({
        student_id: Number(r.student_id),
        xp: Math.round(r.xp || 0),
        name: nameById.get(Number(r.student_id)) || 'Student'
    }));
    if (rows.length === 0 && ctxDemo) {
        rows = DEMO_LEADERBOARD.map((r, i) => ({ student_id: -(i + 1), ...r }));
    }

    if (rows.length === 0) {
        if (podium) podium.innerHTML = '';
        if (list) list.innerHTML = `<div class="qc-empty-note">No quiz attempts ${range === 'week' ? 'this week' : 'yet'} for your class.</div>`;
        return;
    }

    const top3 = rows.slice(0, 3);
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

    if (podium) {
        podium.innerHTML = podiumOrder.map(row => {
            const rank = top3.indexOf(row) + 1;
            return `
                <div class="qc-podium-col" data-rank="${rank}">
                    <div class="qc-podium-avatar">
                        ${getInitials(row.name)}
                        <span class="qc-podium-medal">${rank}</span>
                    </div>
                    <div class="qc-podium-name">${escapeHtml(row.name)}</div>
                    <div class="qc-podium-xp">${row.xp} XP</div>
                    <div class="qc-podium-bar"></div>
                </div>
            `;
        }).join('');
    }

    if (list) {
        const myId = Number(user?.user_id);
        list.innerHTML = rows.map((row, idx) => `
            <div class="qc-lb-row ${row.student_id === myId ? 'is-me' : ''}">
                <div class="qc-lb-rank">#${idx + 1}</div>
                <div class="qc-lb-avatar">${getInitials(row.name)}</div>
                <div class="qc-lb-name">${escapeHtml(row.name)}${row.student_id === myId ? ' (You)' : ''}</div>
                <div class="qc-lb-xp">${row.xp} XP</div>
            </div>
        `).join('');
    }
}
