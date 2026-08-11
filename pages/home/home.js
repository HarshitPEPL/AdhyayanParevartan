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

// Combined search index built from the user's subjects/materials/quizzes
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

export async function init(navigateTo, state) {
    const user = state.currentUser;

    // --- Populate user info ---
    if (user) {
        const nameParts = (user.full_name || 'Student').trim().split(' ').filter(Boolean);
        const initials = nameParts.map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

        const greeting = getGreeting();

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

    // Wire up the notification bell right away (before any awaited data loads)
    // so it's clickable immediately once this page finishes rendering — this
    // lets other pages (e.g. Profile) reliably auto-open it right after navigating here.
    setupNotifications(state);

    // --- Load subjects for user's class ---
    const classNumber = user?.class_number || state.selectedClass || 9;
    const slider = document.getElementById('home-subjects-slider');

    let loadedSubjects = [];
    let loadedMaterials = [];
    let loadedQuizzes = [];

    try {
        const subjects = await window.adhyayan.getSubjectsByClass(classNumber);
        loadedSubjects = subjects || [];

        if (!slider) return;

        const dotsContainer = document.getElementById('home-subjects-dots');

        if (!subjects || subjects.length === 0) {
            slider.innerHTML = `<div style="padding:16px;color:#888;font-size:14px;">No subjects found for Class ${classNumber}.</div>`;
            setupSliderDots(slider, dotsContainer, 0);
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
            setupSliderDots(slider, dotsContainer, subjects.length);
        }
    } catch (err) {
        console.error('Failed to load subjects:', err);
        if (slider) slider.innerHTML = `<div style="padding:16px;color:#c00;font-size:14px;">Could not load subjects.</div>`;
    }

    // --- Load continue-learning card: prefer the user's most recently accessed
    // material (real progress %), fall back to the first available material. ---
    try {
        const materials = await window.adhyayan.getMaterialsByClass(classNumber);
        loadedMaterials = materials || [];

        if (materials && materials.length > 0) {
            const recentProgress = window.adhyayan.getRecentMaterialProgress?.(user?.user_id);
            const recentMat = recentProgress ? materials.find(m => m.material_id === recentProgress.material_id) : null;

            const mat = recentMat || materials[0];
            const pct = recentMat ? recentProgress.percent : 0;

            const el  = id => document.getElementById(id);
            if (el('home-continue-subject')) el('home-continue-subject').textContent = mat.subject_name || 'Subject';
            if (el('home-continue-title'))   el('home-continue-title').textContent   = mat.title || 'Lesson';
            if (el('home-continue-info'))    el('home-continue-info').textContent    = pct >= 100 ? 'Completed' : (pct > 0 ? 'Continue where you left off' : (mat.duration_lessons ? `Duration: ${mat.duration_lessons}` : 'Tap to start'));
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

    // --- Load quiz suggestion ---
    try {
        const quizzes = await window.adhyayan.getQuizzesByClass(classNumber);
        loadedQuizzes = quizzes || [];
        const quiz = pickBestQuiz(quizzes);
        const quizCard = document.getElementById('home-quiz-card');
        const quizSubject = document.getElementById('home-quiz-subject');
        const quizTitle = document.getElementById('home-quiz-title');
        const quizInfo = document.getElementById('home-quiz-info');

        if (quiz && quizCard) {
            if (quizSubject) quizSubject.textContent = quiz.subject_name || 'Quiz';
            if (quizTitle) quizTitle.textContent = quiz.title || 'Practice quiz';
            if (quizInfo) quizInfo.textContent = `${quiz.questions?.length || 0} questions • Tap to start`;
            if (document.getElementById('home-quiz-chapter')) {
                document.getElementById('home-quiz-chapter').textContent = quiz.chapter_name ? `${quiz.chapter_name}` : '';
            }
            if (document.getElementById('home-quiz-icon')) {
                const iconEl = document.getElementById('home-quiz-icon');
                const iconClass = quiz.subject_icon || 'fa-book';
                iconEl.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            }
            quizCard.addEventListener('click', () => {
                state.activeQuiz = quiz;
                navigateTo('quiz-center');
            });
        } else if (quizCard) {
            quizCard.innerHTML = '<div style="width:100%;text-align:center;padding:10px 0;color:#aaa;font-size:14px;">No quizzes available for this class yet.</div>';
        }
    } catch (err) {
        console.error('Failed to load quiz card:', err);
    }

    // --- See all -> courses ---
    document.getElementById('home-see-all')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('courses');
    });

    document.getElementById('home-quiz-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('quiz');
    });

    // --- Build search index & wire up search ---
    buildSearchIndex(navigateTo, state, loadedSubjects, loadedMaterials, loadedQuizzes, classNumber);
    setupSearch(navigateTo, state);
}

function buildSearchIndex(navigateTo, state, subjects, materials, quizzes, classNumber) {
    searchIndex = [];

    subjects.forEach((sub, i) => {
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
            icon: q.subject_icon || 'fa-brain',
            action: () => {
                state.activeQuiz = q;
                navigateTo('quiz-center');
            }
        });
    });
}

function setupSearch(navigateTo, state) {
    const input = document.getElementById('home-search');
    const resultsBox = document.getElementById('home-search-results');
    const micBtn = document.getElementById('home-mic-btn');
    if (!input || !resultsBox) return;

    function runSearch(query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            resultsBox.classList.add('hidden');
            resultsBox.innerHTML = '';
            return;
        }

        const matches = searchIndex.filter(item =>
            item.label.toLowerCase().includes(q) || (item.subtitle || '').toLowerCase().includes(q)
        ).slice(0, 8);

        if (matches.length === 0) {
            resultsBox.innerHTML = `<div class="notif-empty">No results for "${escapeHTML(query)}"</div>`;
        } else {
            resultsBox.innerHTML = matches.map((m, i) => `
                <div class="search-result-item" data-index="${i}">
                    <div class="icon-circle-sm"><i class="fa-solid ${m.icon}"></i></div>
                    <div>
                        <div class="result-label">${escapeHTML(m.label)}</div>
                        <div class="result-sub">${escapeHTML(m.subtitle)}</div>
                    </div>
                </div>
            `).join('');

            resultsBox.querySelectorAll('.search-result-item').forEach(elm => {
                elm.addEventListener('click', () => {
                    const idx = Number(elm.dataset.index);
                    matches[idx].action();
                    resultsBox.classList.add('hidden');
                    resultsBox.innerHTML = '';
                    input.value = '';
                });
            });
        }
        resultsBox.classList.remove('hidden');
    }

    let debounceTimer;
    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(e.target.value), 200);
    });

    input.addEventListener('focus', () => {
        if (input.value.trim()) runSearch(input.value);
    });

    document.addEventListener('click', (e) => {
        if (!resultsBox.contains(e.target) && e.target !== input) {
            resultsBox.classList.add('hidden');
        }
    });

    // Voice search via the Web Speech API (falls back gracefully if unsupported)
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (micBtn && SpeechRecognitionCtor) {
        micBtn.style.cursor = 'pointer';
        micBtn.addEventListener('click', () => {
            try {
                const recognition = new SpeechRecognitionCtor();
                recognition.lang = 'en-IN';
                recognition.interimResults = false;
                recognition.maxAlternatives = 1;
                micBtn.classList.add('mic-active');

                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    input.value = transcript;
                    runSearch(transcript);
                };
                recognition.onerror = () => micBtn.classList.remove('mic-active');
                recognition.onend = () => micBtn.classList.remove('mic-active');
                recognition.start();
            } catch (err) {
                console.error('Voice search failed:', err);
                micBtn.classList.remove('mic-active');
            }
        });
    } else if (micBtn) {
        micBtn.style.opacity = '0.4';
        micBtn.title = 'Voice search not supported in this browser';
    }
}

async function loadNotifications(state) {
    const list = document.getElementById('home-notif-list');
    const badge = document.getElementById('home-notif-badge');

    try {
        const notifications = await window.adhyayan.getNotifications();
        const userId = state.currentUser?.user_id || 'guest';
        const lastSeenId = Number(localStorage.getItem(`adhyayan_notif_seen_${userId}`) || 0);
        const unread = (notifications || []).filter(n => Number(n.notification_id) > lastSeenId).length;

        if (badge) {
            if (unread > 0) {
                badge.textContent = unread > 9 ? '9+' : String(unread);
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        if (list) {
            if (!notifications || notifications.length === 0) {
                list.innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
            } else {
                list.innerHTML = notifications.map(n => `
                    <div class="notif-item">
                        <div class="notif-title">${escapeHTML(n.title)}</div>
                        <div class="notif-message">${escapeHTML(n.message)}</div>
                        <div class="notif-time">${formatRelativeTime(n.created_at)}</div>
                    </div>
                `).join('');
            }
        }

        return notifications || [];
    } catch (err) {
        console.error('Failed to load notifications:', err);
        if (list) list.innerHTML = `<div class="notif-empty">Could not load notifications.</div>`;
        return [];
    }
}

// Renders one dot per subject beneath the horizontal slider and keeps the
// active dot in sync with the slider's scroll position (like a carousel).
function setupSliderDots(slider, dotsContainer, count) {
    if (!dotsContainer) return;

    if (!count || count <= 1) {
        dotsContainer.innerHTML = '';
        return;
    }

    dotsContainer.innerHTML = Array.from({ length: count }, (_, i) =>
        `<span class="dot${i === 0 ? ' active' : ''}" data-dot-index="${i}"></span>`
    ).join('');

    const dots = Array.from(dotsContainer.querySelectorAll('.dot'));

    const updateActiveDot = () => {
        const cards = slider.querySelectorAll('.subject-card');
        if (!cards.length) return;
        const sliderRect = slider.getBoundingClientRect();
        const sliderCenter = sliderRect.left + sliderRect.width / 2;

        let closestIndex = 0;
        let closestDist = Infinity;
        cards.forEach((card, i) => {
            const rect = card.getBoundingClientRect();
            const cardCenter = rect.left + rect.width / 2;
            const dist = Math.abs(cardCenter - sliderCenter);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        });

        dots.forEach((dot, i) => dot.classList.toggle('active', i === closestIndex));
    };

    slider.onscroll = updateActiveDot;
    dots.forEach((dot, i) => {
        dot.onclick = () => {
            const card = slider.querySelectorAll('.subject-card')[i];
            if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        };
    });

    updateActiveDot();
}

function setupNotifications(state) {
    const bell = document.getElementById('home-bell');
    const panel = document.getElementById('home-notif-panel');
    if (!bell || !panel) return;

    // Populate the unread badge on load without opening the panel.
    loadNotifications(state);

    bell.addEventListener('click', async (e) => {
        e.stopPropagation();
        const opening = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        if (!opening) return;

        const notifications = await loadNotifications(state);
        const userId = state.currentUser?.user_id || 'guest';
        const maxId = notifications.reduce((max, n) => Math.max(max, Number(n.notification_id) || 0), 0);
        localStorage.setItem(`adhyayan_notif_seen_${userId}`, String(maxId));
        document.getElementById('home-notif-badge')?.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && !bell.contains(e.target)) {
            panel.classList.add('hidden');
        }
    });
}