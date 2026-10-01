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

let searchIndex = [];

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function formatRelativeTime(dateValue) {
    if (!dateValue) return '';
    const then = new Date(dateValue).getTime();
    if (Number.isNaN(then)) return '';
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateValue).toLocaleDateString();
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 5) return 'Good night,';
    if (hour < 12) return 'Good morning,';
    if (hour < 17) return 'Good afternoon,';
    if (hour < 21) return 'Good evening,';
    return 'Good night,';
}

function pickBestQuiz(quizzes) {
    if (!Array.isArray(quizzes) || quizzes.length === 0) return null;
    return [...quizzes].sort((a, b) => {
        const aLen = Array.isArray(a.questions) ? a.questions.length : 0;
        const bLen = Array.isArray(b.questions) ? b.questions.length : 0;
        if (bLen !== aLen) return bLen - aLen;
        return Number(b.quiz_id || 0) - Number(a.quiz_id || 0);
    })[0];
}

function computeStreak(attempts) {
    if (!attempts || attempts.length === 0) return 0;

    const dayKey = d => {
        const dt = new Date(d);
        return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
    };
    const days = new Set(attempts.map(a => dayKey(a.taken_at)));

    const cursor = new Date();
    if (!days.has(dayKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
        if (!days.has(dayKey(cursor))) return 0;
    }

    let streak = 0;
    while (days.has(dayKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

function setupClassSelection(currentClass, navigateTo, state) {
    const panel = document.getElementById('classPanel');
    const note = document.getElementById('clsNote');
    if (!panel) return;

    // Clear existing buttons
    panel.innerHTML = '';

    // Create buttons for classes 1-12
    for (let i = 1; i <= 12; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'my-class__btn' + (i === currentClass ? ' is-active' : '');
        btn.textContent = 'Class ' + i;
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', i === currentClass);

        btn.addEventListener('click', () => {
            // Update active state
            panel.querySelectorAll('.my-class__btn').forEach((b, idx) => {
                const isActive = idx + 1 === i;
                b.classList.toggle('is-active', isActive);
                b.setAttribute('aria-checked', isActive);
            });

            // Update state and content
            state.selectedClass = i;
            state.userSelectedClass = true;
            note.textContent = `Showing the Class ${i} subjects visible in your current homepage.`;
            document.getElementById('subNote').textContent = `Jump straight into a subject for Class ${i}.`;
            document.getElementById('qTitle').textContent = `Class ${i} Hindi`;
            document.querySelectorAll('.cn').forEach(el => el.textContent = `Class ${i}`);
        });

        panel.appendChild(btn);
    }
}

async function renderStreakAndMotivation(user) {
    if (!user?.user_id) return;

    try {
        const attempts = await window.adhyayan.getQuizAttemptsByUser?.(user.user_id);
        const streak = computeStreak(attempts);

        const streakSection = document.querySelector('.streak-section');
        if (streakSection) {
            if (streak > 0) {
                streakSection.style.display = 'block';
            } else {
                streakSection.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('Failed to load streak stats:', err);
    }
}

function generateFormatCards() {
    const formats = [
        {
            icon: '📖',
            color: '#eaf5ee',
            textColor: '#1f6144',
            title: 'E-Books',
            desc: 'Read textbooks and learning materials.',
            label: 'Explore'
        },
        {
            icon: '🎧',
            color: '#fcf1de',
            textColor: '#a06a22',
            title: 'Audio Books',
            desc: 'Listen to engaging lessons on the go.',
            label: 'Explore'
        },
        {
            icon: '🎥',
            color: '#e8edf8',
            textColor: '#4a62a8',
            title: 'Video Lessons',
            desc: 'Watch expertly made video tutorials.',
            label: 'Explore'
        },
        {
            icon: '✍️',
            color: '#f0e9f8',
            textColor: '#7a52a8',
            title: 'Quizzes',
            desc: 'Test your knowledge with quizzes.',
            label: 'Explore'
        },
        {
            icon: '📚',
            color: '#e6efec',
            textColor: '#4a6b63',
            title: 'Digital Library',
            desc: 'Explore our vast collection of resources.',
            label: 'Explore'
        }
    ];

    const grid = document.getElementById('learning-formats-grid');
    if (!grid) return;

    const fcardClasses = ['fcard--ebook', 'fcard--audio', 'fcard--video', 'fcard--quiz', 'fcard--library'];
    const fcardIcons = [
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14"/></svg>',
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 5v14l11-7z"/></svg>',
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 14l2 2 4-4"/></svg>',
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16M15 4v16M4 9h5M4 14h5"/></svg>'
    ];

    grid.innerHTML = '';
    formats.forEach((fmt, idx) => {
        const card = document.createElement('button');
        card.className = 'fcard ' + fcardClasses[idx];
        card.innerHTML = '<span class="fcard__icon">' + fcardIcons[idx] + '</span>' +
                        '<span class="fcard__name">' + fmt.title + '</span>' +
                        '<span class="fcard__desc">' + fmt.desc + '</span>' +
                        '<span class="fcard__cta">' + fmt.label + '<span>→</span></span>';
        grid.appendChild(card);
    });
}

export async function init(navigateTo, state) {
    const user = state.currentUser;

    // --- Populate user info in header ---
    if (user) {
        const nameParts = (user.full_name || 'Student').trim().split(' ').filter(Boolean);
        const initials = nameParts.map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

        const greeting = getGreeting();

        const el = id => document.getElementById(id);
        if (el('home-name')) {
            el('home-name').textContent = user.full_name || 'Student';
        }
        if (el('profile-btn')) {
            el('profile-btn').textContent = initials;
        }

        // Update class display
        if (el('home-class-badge')) {
            const cls = user.class_number || state.selectedClass || 2;
            el('home-class-badge').textContent = `Class ${cls}`;
        }
        if (el('home-class-meta')) {
            const board = user.board || 'CBSE';
            el('home-class-meta').textContent = `${board} curriculum`;
        }
    }

    // Setup notifications
    setupNotifications(state);
    renderStreakAndMotivation(user);

    // Setup class selection
    const classNumber = user?.class_number || state.selectedClass || 2;
    setupClassSelection(classNumber, navigateTo, state);

    // Generate format cards for "Choose how you learn" section
    generateFormatCards();

    // --- Load subjects ---
    const subGrid = document.getElementById('subjects-grid');
    let loadedSubjects = [];
    let loadedMaterials = [];
    let loadedQuizzes = [];

    try {
        const subjects = await window.adhyayan.getSubjectsByClass(classNumber);
        loadedSubjects = subjects || [];

        if (subGrid) {
            if (!subjects || subjects.length === 0) {
                subGrid.innerHTML = `<div style="padding:16px;color:#888;font-size:14px;">No subjects found for Class ${classNumber}.</div>`;
            } else {
                subGrid.innerHTML = subjects.slice(0, 5).map((sub, i) => {
                    const icon = SUBJECT_ICONS[sub.subject_name] || 'fa-book';
                    const color = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
                    return `
                        <button class="subject-card" style="cursor:pointer; border-top: 3px solid ${color};" onclick="window.navigateTo && window.navigateTo('courses')">
                            <span class="icon-circle" style="background: linear-gradient(135deg, ${color}, ${color}cc); color:#fff; margin:0;">
                                <i class="fa-solid ${icon}"></i>
                            </span>
                            <div><b>${escapeHTML(sub.subject_name)}</b><small><span class="cn">Class ${classNumber}</span></small></div><em>→</em>
                        </button>
                    `;
                }).join('');
            }
        }
    } catch (err) {
        console.error('Failed to load subjects:', err);
    }

    // --- Load continue-learning card ---
    try {
        const materials = await window.adhyayan.getMaterialsByClass(classNumber);
        loadedMaterials = materials || [];

        if (materials && materials.length > 0) {
            const mat = materials[0];
            const pct = 0;

            const el = id => document.getElementById(id);
            if (el('home-continue-badge')) el('home-continue-badge').textContent = mat.format_name || 'E-Book';
            if (el('home-continue-subject')) el('home-continue-subject').textContent = `${mat.subject_name || 'Subject'} • Class ${classNumber}`;
            if (el('home-continue-title')) el('home-continue-title').textContent = mat.title || 'Lesson';
            if (el('home-continue-info')) el('home-continue-info').textContent = pct >= 100 ? 'Completed' : (pct > 0 ? 'Continue where you left off' : (mat.duration_lessons ? `Duration: ${mat.duration_lessons}` : 'Tap to start'));
            if (el('home-continue-pages')) el('home-continue-pages').textContent = `${mat.duration_lessons || 14} pages`;

            // Update progress bar
            const bar = document.getElementById('home-continue-bar');
            if (bar) {
                bar.innerHTML = `<div style="width:${pct}%; height:100%; background:#ffd36e; border-radius:5px;"></div>`;
            }

            document.getElementById('resume-lesson')?.addEventListener('click', () => {
                state.activeMaterial = mat;
                navigateTo('lesson');
            });
        }
    } catch (err) {
        console.error('Failed to load continue-learning material:', err);
    }

    // --- Load competitive exams ---
    try {
        const competitiveExams = await window.adhyayan.getCompetitiveMaterials?.() || [];
        await renderCompetitiveExams(competitiveExams, navigateTo);
    } catch (err) {
        console.error('Failed to load competitive exams:', err);
    }

    // --- Load quiz suggestion ---
    try {
        const quizzes = await window.adhyayan.getQuizzesByClass(classNumber);
        loadedQuizzes = quizzes || [];
        const quiz = pickBestQuiz(quizzes);

        if (quiz) {
            const quizCard = document.querySelector('.quiz-suggestion-card');
            if (quizCard) {
                const title = quizCard.querySelector('b');
                const meta = quizCard.querySelector('.quiz-meta');
                const small = quizCard.querySelector('small');
                const btn = quizCard.querySelector('.start-quiz-btn');

                if (title) title.textContent = quiz.title || 'Practice quiz';
                if (meta) meta.textContent = `${quiz.questions?.length || 0} questions • ${quiz.subject_name || 'Quiz'}`;
                if (small) small.textContent = 'Get ready to test your knowledge!';

                const handleQuizClick = () => {
                    state.activeQuiz = quiz;
                    navigateTo('quiz-center');
                };

                quizCard.addEventListener('click', handleQuizClick);
                if (btn) btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    handleQuizClick();
                });
            }
        }
    } catch (err) {
        console.error('Failed to load quiz card:', err);
    }

    // --- Event listeners for navigation ---
    document.getElementById('change-class-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('.class-selection-section')?.scrollIntoView({ behavior: 'smooth' });
    });

    document.querySelectorAll('.fcard').forEach(card => {
        card.addEventListener('click', () => navigateTo('courses'));
    });

    document.querySelector('.start-quiz-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('quiz-center');
    });

    // --- Build search index & setup search ---
    buildSearchIndex(navigateTo, state, loadedSubjects, loadedMaterials, loadedQuizzes, classNumber);
    setupSearch(navigateTo, state);
}

async function renderCompetitiveExams(exams, navigateTo) {
    const card = document.getElementById('home-competitive-card');
    if (!card || !exams || exams.length === 0) return;

    const exam = exams[0];
    
    document.getElementById('home-competitive-title').textContent = exam.title || exam.exam_name || 'Competitive exam';
    document.getElementById('home-competitive-meta').textContent = `${exam.exam_name || 'Competitive'} • ${exam.duration_lessons || 'Study material'}`;

    card.addEventListener('click', () => {
        const material = {
            material_id: exam.material_id,
            title: exam.title || exam.exam_name || 'Competitive exam',
            subject_name: exam.exam_name || 'Competitive Exam',
            format_name: exam.format_name || 'Study Material',
            duration_lessons: exam.duration_lessons || 'N/A',
            instructor_name: exam.instructor_name || 'Competitive Exam',
            file_url: exam.file_url || '',
        };
        navigateTo('competitive-exams');
    });
}

function buildSearchIndex(navigateTo, state, subjects, materials, quizzes, classNumber) {
    searchIndex = [];

    subjects.forEach((sub) => {
        searchIndex.push({
            label: sub.subject_name,
            subtitle: `Class ${classNumber} Subject`,
            icon: SUBJECT_ICONS[sub.subject_name] || 'fa-book',
            action: () => navigateTo('courses')
        });
    });

    materials.forEach(mat => {
        searchIndex.push({
            label: mat.title,
            subtitle: `${mat.subject_name || 'Subject'} • ${mat.format_name || 'Material'}`,
            icon: 'fa-file-lines',
            action: () => {
                state.activeMaterial = mat;
                navigateTo('lesson');
            }
        });
    });

    quizzes.forEach(q => {
        searchIndex.push({
            label: q.title,
            subtitle: q.chapter_name ? `${q.subject_name || 'Quiz'} • ${q.chapter_name}` : (q.subject_name || 'Quiz'),
            icon: 'fa-brain',
            action: () => {
                state.activeQuiz = q;
                navigateTo('quiz-center');
            }
        });
    });
}

function setupSearch(navigateTo, state) {
    const input = document.getElementById('home-search');
    if (!input) return;

    let debounceTimer;
    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const q = (e.target.value || '').trim().toLowerCase();
            const matches = searchIndex.filter(item =>
                item.label.toLowerCase().includes(q) || (item.subtitle || '').toLowerCase().includes(q)
            ).slice(0, 8);

            if (matches.length > 0 && q) {
                matches[0].action();
            }
        }, 200);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const q = (input.value || '').trim().toLowerCase();
            const matches = searchIndex.filter(item =>
                item.label.toLowerCase().includes(q) || (item.subtitle || '').toLowerCase().includes(q)
            ).slice(0, 8);
            if (matches.length > 0) {
                matches[0].action();
            }
        }
    });
}

async function loadNotifications(state) {
    try {
        const notifications = await window.adhyayan.getNotifications?.();
        const userId = state.currentUser?.user_id || 'guest';
        const lastSeenId = Number(localStorage.getItem(`adhyayan_notif_seen_${userId}`) || 0);
        const unread = (notifications || []).filter(n => Number(n.notification_id) > lastSeenId).length;

        const badge = document.querySelector('.bell-icon i');
        if (badge) {
            if (unread > 0) {
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }

        return notifications || [];
    } catch (err) {
        console.error('Failed to load notifications:', err);
        return [];
    }
}

function setupNotifications(state) {
    const bell = document.getElementById('notif-btn');
    if (!bell) return;

    loadNotifications(state);

    bell.addEventListener('click', async (e) => {
        e.stopPropagation();
        const notifications = await loadNotifications(state);
        const userId = state.currentUser?.user_id || 'guest';
        const maxId = notifications.reduce((max, n) => Math.max(max, Number(n.notification_id) || 0), 0);
        localStorage.setItem(`adhyayan_notif_seen_${userId}`, String(maxId));
    });
}
