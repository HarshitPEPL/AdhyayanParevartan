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

// --- CONTINUE LEARNING ------------------------------------------------------

const CONTINUE_SECTIONS = ['skeleton', 'card', 'next', 'empty', 'error'];
const CONTINUE_LAYOUTS = {
    loading: ['skeleton'],
    card: ['card'],
    cardWithNext: ['card', 'next'],
    empty: ['empty'],
    error: ['error']
};

const CONTINUE_BADGE_ICONS = {
    ebook: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14"/></svg>',
    doc: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6"/></svg>',
    video: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9.5 5 2.5-5 2.5z" fill="currentColor"/></svg>',
    audio: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>'
};const CONTINUE_PLAY_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const CONTINUE_REPLAY_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z"/></svg>';

function showContinueState(layout) {
    const visible = CONTINUE_LAYOUTS[layout] || [];
    CONTINUE_SECTIONS.forEach(name => {
        const node = document.getElementById(`home-continue-${name}`);
        if (node) node.hidden = !visible.includes(name);
    });
}

// "10" -> "10 min", "12:08" -> "12 min"; text that already has a unit is kept.
function formatLessonDuration(raw) {
    if (raw == null) return '';
    const text = String(raw).trim();
    if (!text || /^(na|n\/a|tbd|pending|-)$/i.test(text)) return '';

    const clock = text.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (clock) {
        const seconds = clock[3] != null
            ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
            : Number(clock[1]) * 60 + Number(clock[2]);
        const minutes = Math.max(1, Math.round(seconds / 60));
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
    }
    if (/^\d+(\.\d+)?$/.test(text)) return `${text} min`;
    return text;
}

// Total pages: the count learned when the reader opened the PDF, otherwise a
// "43 pages" style value in the material's duration field.
function getTotalPages(material, progress) {
    const learned = Math.floor(Number(progress?.total_pages));
    if (Number.isFinite(learned) && learned > 0) return learned;
    const match = String(material?.duration_lessons ?? '').trim().match(/^(\d+)\s*pages?$/i);
    return match ? Number(match[1]) : null;
}

// Whole number 0..100; page-based when page data exists, so the % text and the
// bar (which both use this value) can never disagree or show NaN.
function getLessonPercent(progress) {
    if (!progress) return 0;
    const { calcProgressPercent, clampPercent } = window.adhyayan;
    if (Number(progress.total_pages) > 0 && progress.pages_completed != null) {
        return calcProgressPercent(progress.pages_completed, progress.total_pages);
    }
    return clampPercent(progress.percent);
}

// Content type drives the badge, the progress source (pages vs. time) and the labels.
//   video / audio -> watched or listened time;  ebook / doc (E-Book, Notes, ...) -> pages
function getContentKind(material) {
    const format = String(material?.format_name || '').toLowerCase();
    const url = String(material?.file_url || '').toLowerCase();
    if (/video/.test(format) || /youtu\.?be|\.(mp4|webm|ogg|mov)(\?|#|$)/.test(url)) return 'video';
    if (/audio/.test(format) || /\.(mp3|wav|m4a|aac)(\?|#|$)/.test(url)) return 'audio';
    return /e-?book/.test(format) ? 'ebook' : 'doc';
}

function getContinueTypeLabel(kind, material) {
    if (kind === 'video') return 'Video';
    if (kind === 'audio') return 'Audiobook';
    return material?.format_name || (kind === 'ebook' ? 'E-Book' : 'Lesson');
}

// "7:05 Minutes" / "12:08" / "1:02:03" -> seconds; a bare "10" means minutes; "16 Page" -> null.
function parseDurationSeconds(raw) {
    const text = String(raw ?? '').trim();
    const clock = text.match(/^(\d+):(\d{2})(?::(\d{2}))?/);
    if (clock) {
        return clock[3] != null
            ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
            : Number(clock[1]) * 60 + Number(clock[2]);
    }
    const minutes = text.match(/^(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)?$/i);
    return minutes ? Math.round(Number(minutes[1]) * 60) : null;
}

// Real length measured by the player when available, otherwise the admin-entered text.
function getMediaDurationSec(material, progress) {
    const measured = Math.floor(Number(progress?.duration_sec));
    if (Number.isFinite(measured) && measured > 0) return measured;
    const parsed = parseDurationSeconds(material?.duration_lessons);
    return parsed > 0 ? parsed : null;
}

function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function formatMinutes(seconds) {
    return `${Math.max(1, Math.ceil(Number(seconds) / 60))} min`;
}

// The next lesson of the SAME course (subject) and SAME content type, later in
// chapter order and not finished yet. Never the card's own item, never an earlier
// one, and never something of another type (e.g. an E-Book while a Video is showing).
function pickNextUnfinished(current, materials, progressById) {
    const kind = getContentKind(current);
    const chapterOf = (m) => (m.chapter_number == null ? Number.MAX_SAFE_INTEGER : Number(m.chapter_number));
    const sequence = materials
        .filter(m => m.subject_name === current.subject_name && getContentKind(m) === kind)
        .sort((a, b) => chapterOf(a) - chapterOf(b) || Number(a.material_id) - Number(b.material_id));
    const index = sequence.findIndex(m => Number(m.material_id) === Number(current.material_id));
    if (index === -1) return null;
    return sequence.slice(index + 1).find(m =>
        Number(m.material_id) !== Number(current.material_id)
        && getLessonPercent(progressById.get(Number(m.material_id))) < 100) || null;
}

function renderContinueLearning({ materials, progress, classNumber, openMaterial }) {
    const el = id => document.getElementById(id);
    const progressById = new Map();
    progress.forEach(p => progressById.set(Number(p.material_id), p));
    const classMaterials = new Map(materials.map(m => [Number(m.material_id), m]));

    // ONE shared recent-activity list for every content type: the item with the
    // newest last_accessed_at (in the selected class) is the one shown.
    const latest = progress
        .filter(p => classMaterials.has(Number(p.material_id)))
        .sort((a, b) => (b.last_accessed_at ?? b.updated_at ?? 0) - (a.last_accessed_at ?? a.updated_at ?? 0))[0];

    if (!latest) {
        showContinueState('empty');
        return;
    }

    const mat = classMaterials.get(Number(latest.material_id));
    const kind = getContentKind(mat);
    const isMedia = kind === 'video' || kind === 'audio';
    const percent = getLessonPercent(latest);
    const completed = percent >= 100;

    let infoText = '';
    let sideLabel = '';
    if (isMedia) {
        const duration = getMediaDurationSec(mat, latest);
        const position = Math.max(0, Number(latest.last_position_sec) || 0);
        const verb = kind === 'video' ? 'Watched' : 'Listened';
        if (completed) infoText = 'Completed';
        else if (percent > 0 && position > 0 && duration) infoText = `${verb} ${formatClock(Math.min(position, duration))} of ${formatClock(duration)}`;
        else if (percent > 0) infoText = `${percent}% ${verb.toLowerCase()}`;
        if (duration) {
            const remaining = position > 0 ? duration - position : duration * (1 - percent / 100);
            sideLabel = completed ? formatMinutes(duration) : `${formatMinutes(Math.max(0, remaining))} left`;
        }
    } else {
        const totalPages = getTotalPages(mat, latest);
        const lastPage = Math.floor(Number(latest.last_page));
        const durationText = totalPages && /pages?$/i.test(String(mat.duration_lessons ?? '').trim())
            ? ''
            : formatLessonDuration(mat.duration_lessons);
        const parts = [];
        if (completed) parts.push('Completed');
        else if (percent > 0 && totalPages && Number.isFinite(lastPage) && lastPage >= 1) parts.push(`Page ${Math.min(lastPage, totalPages)} of ${totalPages}`);
        if (durationText) parts.push(`Duration: ${durationText}`);
        infoText = parts.join(' • ');
        sideLabel = totalPages ? `${totalPages} pages` : '';
    }

    const actionLabel = completed ? 'Revisit' : (percent > 0 ? 'Resume' : 'Start');
    const title = mat.title || 'Lesson';

    el('home-continue-badge').innerHTML = `${CONTINUE_BADGE_ICONS[kind] || CONTINUE_BADGE_ICONS.doc} ${escapeHTML(getContinueTypeLabel(kind, mat))}`;
    el('home-continue-subject').textContent = `${mat.subject_name || 'Subject'} • Class ${classNumber}`;
    el('home-continue-title').textContent = title;
    el('home-continue-info').textContent = infoText;
    el('home-continue-percent').textContent = `${percent}%`;
    el('home-continue-fill').style.width = `${percent}%`;
    el('home-continue-bar').setAttribute('aria-valuenow', String(percent));
    el('home-continue-pages').textContent = sideLabel;
    el('home-continue-action').textContent = actionLabel;
    el('home-continue-play').innerHTML = completed ? CONTINUE_REPLAY_ICON : CONTINUE_PLAY_ICON;
    el('home-continue-play').setAttribute('aria-label', `${actionLabel} ${title}`);

    const card = el('home-continue-card');
    card.style.cursor = 'pointer';
    // The play button is inside the card, so its click bubbles up to this handler.
    card.onclick = () => openMaterial(mat);

    const next = completed ? pickNextUnfinished(mat, materials, progressById) : null;
    if (next) {
        const nextKind = getContentKind(next);
        const nextDuration = nextKind === 'video' || nextKind === 'audio'
            ? (getMediaDurationSec(next, progressById.get(Number(next.material_id))) ? formatMinutes(getMediaDurationSec(next, progressById.get(Number(next.material_id)))) : '')
            : formatLessonDuration(next.duration_lessons);
        el('home-continue-next-title').textContent = next.title || 'Lesson';
        el('home-continue-next-meta').textContent = [getContinueTypeLabel(nextKind, next), nextDuration].filter(Boolean).join(' • ');
        el('home-continue-next-btn').onclick = () => openMaterial(next);
        showContinueState('cardWithNext');
    } else {
        showContinueState('card');
    }
}
export async function init(navigateTo, state) {
    const user = state.currentUser;
    const el = id => document.getElementById(id);

    // Store for use in other functions
    window._lastNavigateTo = navigateTo;
    window.state = state;

    // --- 1. GREETING: Dynamic time-based greeting with first name ---
    const updateGreeting = () => {
        const greeting = getGreeting();
        if (el('home-greeting-text')) {
            el('home-greeting-text').textContent = greeting;
        }
    };
    updateGreeting();

    // Extract first name from full_name (or fallback to "there")
    let firstName = 'there';
    if (user?.full_name) {
        const firstNameMatch = user.full_name.trim().split(/\s+/)[0];
        if (firstNameMatch) {
            firstName = firstNameMatch.charAt(0).toUpperCase() + firstNameMatch.slice(1).toLowerCase();
        }
    }

    if (el('home-name')) {
        el('home-name').textContent = firstName;
    }

    // --- 2. AVATAR: Show first letter, clickable to profile ---
    let avatarLetter = firstName[0].toUpperCase();
    if (el('profile-btn')) {
        el('profile-btn').textContent = avatarLetter;
        el('profile-btn').setAttribute('aria-label', 'Open profile');
        el('profile-btn').addEventListener('click', (e) => {
            e.preventDefault();
            closeNotificationPopup(); // Close notification popup if open
            navigateTo('profile');
        });
    }

    // --- 3. CLASS: Dynamic "Your Class" card ---
    const classNumber = state.selectedClass || user?.class_number || 9;
    
    const refreshClassDisplay = () => {
        const cls = state.selectedClass || user?.class_number || 9;
        if (el('home-class-badge')) {
            el('home-class-badge').textContent = `Class ${cls}`;
        }
        if (el('home-class-meta')) {
            const board = user?.board || 'CBSE';
            el('home-class-meta').textContent = `${board} curriculum`;
        }
    };
    refreshClassDisplay();

    // --- Update all class-dependent content when state.selectedClass changes ---
    const originalSetSelectedClass = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(state), 'selectedClass');
    let _selectedClass = state.selectedClass;
    Object.defineProperty(state, 'selectedClass', {
        get() { return _selectedClass; },
        set(value) {
            if (_selectedClass !== value) {
                _selectedClass = value;
                refreshClassDisplay();
                // Refresh search index and notifications on class change
                rebuildSearchIndex();
                loadAndDisplayNotifications();
            }
        },
        configurable: true
    });

    // Setup notifications
    setupNotifications(state);
    renderStreakAndMotivation(user);

    // Generate format cards for "Choose how you learn" section
    generateFormatCards();

    // --- Load competitive exams (not class specific) ---
    try {
        const competitiveExams = await window.adhyayan.getCompetitiveMaterials?.() || [];
        await renderCompetitiveExams(competitiveExams, navigateTo);
    } catch (err) {
        console.error('Failed to load competitive exams:', err);
    }

    // --- Continue learning: most recent lesson for the selected class ---
    let continueToken = 0;
    const getActiveClass = () => Number(state.selectedClass || user?.class_number || 9);
    const openContinueMaterial = (material) => {
        state.activeMaterial = material;
        state.lastLibraryRoute = 'home'; // the lesson's back button returns here
        navigateTo('lesson');
    };
    const refreshContinue = async (classNumber) => {
        const token = ++continueToken;
        showContinueState('loading');
        let materials = [];
        try {
            materials = await window.adhyayan.getMaterialsByClass(classNumber) || [];
            const progress = await window.adhyayan.getMaterialProgressForUser(user?.user_id);
            if (token === continueToken) {
                renderContinueLearning({ materials, progress, classNumber, openMaterial: openContinueMaterial });
            }
        } catch (err) {
            console.error('Failed to load continue-learning data:', err);
            if (token === continueToken) showContinueState('error');
        }
        return materials;
    };
    el('home-continue-retry')?.addEventListener('click', () => refreshContinue(getActiveClass()));
    el('home-continue-browse')?.addEventListener('click', () => navigateTo('courses'));
    // --- Load class-dependent content (subjects, continue card, quiz card, search) ---
    // Re-run whenever the student picks a different class. Handlers are assigned
    // with onclick so repeated runs never stack listeners.
    let classLoadToken = 0;
    const loadClassContent = async (classNumber, { reset = false } = {}) => {
        const token = ++classLoadToken;
        const isStale = () => token !== classLoadToken;
        let loadedSubjects = [];
        let loadedMaterials = [];
        let loadedQuizzes = [];

        // Fetched in parallel with the subjects below; renders its own states.
        const materialsPromise = refreshContinue(classNumber);

        const subGrid = document.getElementById('subjects-grid');
        if (el('subNote')) el('subNote').textContent = `Jump straight into a subject for Class ${classNumber}.`;

        try {
            const subjects = await window.adhyayan.getSubjectsByClass(classNumber);
            if (isStale()) return;
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

        loadedMaterials = await materialsPromise;
        if (isStale()) return;

        // --- Quiz suggestion ---
        try {
            const quizzes = await window.adhyayan.getQuizzesByClass(classNumber);
            if (isStale()) return;
            loadedQuizzes = quizzes || [];
            const quiz = pickBestQuiz(quizzes);
            const quizCard = document.querySelector('.quiz-suggestion-card');

            if (quizCard) {
                const title = quizCard.querySelector('b');
                const meta = quizCard.querySelector('.quiz-meta');
                const small = quizCard.querySelector('small');
                const btn = quizCard.querySelector('.start-quiz-btn');

                if (quiz) {
                    if (title) title.textContent = quiz.title || 'Practice quiz';
                    if (meta) meta.textContent = `${quiz.questions?.length || 0} questions • ${quiz.subject_name || 'Quiz'}`;
                    if (small) small.textContent = 'Get ready to test your knowledge!';

                    const handleQuizClick = () => {
                        state.activeQuiz = quiz;
                        navigateTo('quiz-center');
                    };

                    quizCard.onclick = handleQuizClick;
                    if (btn) btn.onclick = (e) => {
                        e.preventDefault();
                        handleQuizClick();
                    };
                } else if (reset) {
                    if (title) title.textContent = `Class ${classNumber} quiz`;
                    if (meta) meta.textContent = 'No quizzes available yet';
                    quizCard.onclick = null;
                    if (btn) btn.onclick = null;
                }
            }
        } catch (err) {
            console.error('Failed to load quiz card:', err);
        }

        buildSearchIndex(navigateTo, state, loadedSubjects, loadedMaterials, loadedQuizzes, classNumber);
    };

    // --- Change class modal ---
    const applyClassChange = async (newClass) => {
        const current = Number(state.selectedClass || user?.class_number || 9);
        if (newClass === current) return;

        state.selectedClass = newClass; // updates the "Your class" card via the setter above
        refreshClassDisplay();
        if (user) user.class_number = newClass; // courses, quiz and progress pages read this
        window.adhyayan.saveSession?.();         // persists to localStorage

        loadClassContent(newClass, { reset: true });

        if (user?.user_id) {
            try {
                await window.adhyayan.updateUserClass(user.user_id, newClass);
            } catch (err) {
                console.error('Failed to save class to profile:', err);
            }
        }
    };
    setupClassModal(() => Number(state.selectedClass || user?.class_number || 9), applyClassChange);

    // --- Event listeners for navigation ---
    el('home-competitive-explore')?.addEventListener('click', () => navigateTo('competitive-exams'));
    el('home-continue-explore')?.addEventListener('click', () => navigateTo('courses'));
    document.querySelectorAll('.fcard').forEach(card => {
        card.addEventListener('click', () => navigateTo('courses'));
    });

    document.querySelector('.start-quiz-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('quiz-center');
    });

    await loadClassContent(classNumber);
    setupSearch(navigateTo, state);
}

// "Change class" modal on the Your Class card.
function setupClassModal(getCurrentClass, onSelect) {
    const trigger = document.getElementById('change-class-btn');
    const overlay = document.getElementById('class-modal');
    const dialog = document.getElementById('class-modal-dialog');
    const grid = document.getElementById('class-modal-grid');
    const closeBtn = document.getElementById('class-modal-close');
    if (!trigger || !overlay || !dialog || !grid || !closeBtn) return;

    const COLUMNS = 4;
    const getButtons = () => Array.from(grid.querySelectorAll('.class-modal__btn'));

    const close = () => {
        if (overlay.hidden) return;
        overlay.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
    };

    const open = () => {
        const current = getCurrentClass();
        grid.innerHTML = '';
        for (let n = 1; n <= 12; n++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'class-modal__btn' + (n === current ? ' is-active' : '');
            btn.textContent = n;
            btn.dataset.class = n;
            btn.setAttribute('aria-label', `Class ${n}`);
            btn.setAttribute('aria-pressed', n === current ? 'true' : 'false');
            grid.appendChild(btn);
        }
        overlay.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        (grid.querySelector('.is-active') || getButtons()[0]).focus();
    };

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        open();
    });

    closeBtn.addEventListener('click', close);

    // Click on the dimmed backdrop (not the dialog itself) closes the popup
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.class-modal__btn');
        if (!btn) return;
        const selected = Number(btn.dataset.class);
        close();
        onSelect(selected);
    });

    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
        }

        const buttons = getButtons();
        const index = buttons.indexOf(document.activeElement);

        if (e.key === 'Tab') {
            // Keep focus inside the dialog
            const focusable = [closeBtn, ...buttons];
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
            return;
        }

        if (index === -1) return;
        const moves = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -COLUMNS,
            ArrowDown: COLUMNS
        };
        let next = null;
        if (e.key in moves) next = index + moves[e.key];
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = buttons.length - 1;
        if (next === null) return;

        e.preventDefault();
        if (next >= 0 && next < buttons.length) buttons[next].focus();
    });
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
            icon: 'fa-book',
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

// Global function to rebuild search index when class changes
window._rebuildSearchIndexForClass = async function(classNumber, navigateTo, state) {
    try {
        const subjects = await window.adhyayan.getSubjectsByClass(classNumber) || [];
        const materials = await window.adhyayan.getMaterialsByClass(classNumber) || [];
        const quizzes = await window.adhyayan.getQuizzesByClass(classNumber) || [];
        buildSearchIndex(navigateTo, state, subjects, materials, quizzes, classNumber);
    } catch (err) {
        console.error('Failed to rebuild search index:', err);
    }
};

function setupSearch(navigateTo, state) {
    const input = document.getElementById('home-search');
    const dropdown = document.getElementById('search-dropdown');
    const searchBtn = document.getElementById('search-submit-btn');
    const content = dropdown?.querySelector('.search-dropdown-content');
    
    if (!input || !dropdown || !content) return;

    let debounceTimer;
    let currentKeyboardIndex = -1;
    const RESULTS_PER_GROUP = 4;

    // Position dropdown under search input
    const positionDropdown = () => {
        const rect = input.getBoundingClientRect();
        const isMobile = window.innerWidth <= 640;
        
        content.style.position = 'fixed';
        content.style.top = (rect.bottom + 8) + 'px';
        content.style.left = rect.left + 'px';
        content.style.width = rect.width + 'px';
    };

    // Close dropdown
    const closeSearchDropdown = () => {
        dropdown.classList.remove('show');
        currentKeyboardIndex = -1;
    };

    // Render search results with grouping and "View all" button
    const renderSearchResults = (query) => {
        if (!query.trim()) {
            closeSearchDropdown();
            return;
        }

        const q = query.trim().toLowerCase();
        const matches = searchIndex.filter(item =>
            item.label.toLowerCase().includes(q) || (item.subtitle || '').toLowerCase().includes(q)
        );

        if (matches.length === 0) {
            content.innerHTML = `<div class="search-empty">No results found for "${escapeHTML(q)}"</div>`;
            dropdown.classList.add('show');
            positionDropdown();
            return;
        }

        // Group results by type
        const groups = {};
        matches.forEach(item => {
            const type = item.icon === 'fa-brain' ? 'Quizzes' : 
                        item.icon === 'fa-file-lines' ? 'Books & Materials' : 'Subjects';
            if (!groups[type]) groups[type] = [];
            groups[type].push(item);
        });

        let html = '';
        const groupOrder = ['Subjects', 'Books & Materials', 'Quizzes'];
        
        groupOrder.forEach(type => {
            if (groups[type]) {
                const allItems = groups[type];
                const visibleItems = allItems.slice(0, RESULTS_PER_GROUP);
                const hasMore = allItems.length > RESULTS_PER_GROUP;
                
                html += `<div class="search-group">
                    <div class="search-group-title">${type}</div>
                    ${visibleItems.map((item, idx) => `
                        <div class="search-result" data-index="${idx}" data-type="${type}" tabindex="0">
                            <div class="search-result-text">
                                <div class="search-result-label">${escapeHTML(item.label)}</div>
                                <div class="search-result-subtitle">${escapeHTML(item.subtitle || '')}</div>
                            </div>
                            <div class="search-result-icon">
                                <i class="fa-solid ${item.icon}"></i>
                            </div>
                        </div>
                    `).join('')}
                    ${hasMore ? `<div class="search-view-all" data-type="${type}" tabindex="0">View all ${type.toLowerCase()}</div>` : ''}
                </div>`;
            }
        });

        content.innerHTML = html;

        // Add click handlers
        content.querySelectorAll('.search-result').forEach((el) => {
            el.addEventListener('click', () => {
                const label = el.querySelector('.search-result-label').textContent.trim();
                const subtitle = el.querySelector('.search-result-subtitle').textContent.trim();
                const index = matches.findIndex(m => 
                    m.label === label && m.subtitle === subtitle
                );
                if (index >= 0) {
                    matches[index].action();
                    closeSearchDropdown();
                    input.value = '';
                }
            });
        });

        // Add "View all" handlers
        content.querySelectorAll('.search-view-all').forEach((el) => {
            el.addEventListener('click', () => {
                closeSearchDropdown();
                input.value = '';
                // Could navigate to full search results page if available
            });
        });

        dropdown.classList.add('show');
        positionDropdown();
    };

    // Reposition on resize and scroll
    const repositionOnEvent = () => {
        if (dropdown.classList.contains('show')) {
            positionDropdown();
        }
    };

    window.addEventListener('resize', repositionOnEvent);
    window.addEventListener('scroll', repositionOnEvent, true);

    // Input listener with debounce
    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            renderSearchResults(e.target.value);
        }, 250);
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
        const results = content.querySelectorAll('.search-result');
        const count = results.length;

        if (e.key === 'Escape') {
            closeSearchDropdown();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!dropdown.classList.contains('show')) {
                renderSearchResults(input.value);
            }
            currentKeyboardIndex = (currentKeyboardIndex + 1) % count;
            results.forEach((r, i) => {
                if (i === currentKeyboardIndex) {
                    r.focus();
                    r.style.background = 'var(--bg)';
                } else {
                    r.style.background = '';
                }
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!dropdown.classList.contains('show')) {
                renderSearchResults(input.value);
            }
            currentKeyboardIndex = (currentKeyboardIndex - 1 + count) % count;
            results.forEach((r, i) => {
                if (i === currentKeyboardIndex) {
                    r.focus();
                    r.style.background = 'var(--bg)';
                } else {
                    r.style.background = '';
                }
            });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentKeyboardIndex >= 0 && currentKeyboardIndex < count) {
                results[currentKeyboardIndex].click();
            } else {
                const q = (input.value || '').trim().toLowerCase();
                const matches = searchIndex.filter(item =>
                    item.label.toLowerCase().includes(q) || (item.subtitle || '').toLowerCase().includes(q)
                );
                if (matches.length > 0) {
                    matches[0].action();
                    closeSearchDropdown();
                }
            }
        }
    });

    // Search button click
    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const q = (input.value || '').trim().toLowerCase();
            const matches = searchIndex.filter(item =>
                item.label.toLowerCase().includes(q) || (item.subtitle || '').toLowerCase().includes(q)
            );
            if (matches.length > 0) {
                matches[0].action();
                closeSearchDropdown();
            }
        });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            closeSearchDropdown();
        }
    });

    // Close when input is cleared
    input.addEventListener('input', (e) => {
        if (!e.target.value.trim()) {
            closeSearchDropdown();
        }
    });
}

// --- NOTIFICATION POPUP FUNCTIONS ---

let notificationRefreshTimer = null;

function getUnreadNotificationsKey(userId) {
    return `adhyayan_unread_notifs_${userId}`;
}

async function loadAndDisplayNotifications() {
    try {
        const userId = window.state?.currentUser?.user_id || 'guest';
        const notifications = await window.adhyayan.getNotifications?.() || [];
        const unreadSet = new Set(JSON.parse(localStorage.getItem(getUnreadNotificationsKey(userId)) || '[]'));

        // Update badge
        const badge = document.querySelector('.bell-icon i');
        const unreadCount = unreadSet.size;
        
        if (badge) {
            if (unreadCount > 0) {
                badge.classList.add('show');
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            } else {
                badge.classList.remove('show');
                badge.textContent = '';
            }
        }

        // Store for later use in popup
        window._cachedNotifications = notifications;
        window._cachedUnreadSet = unreadSet;

        return { notifications, unreadSet };
    } catch (err) {
        console.error('Failed to load notifications:', err);
        return { notifications: [], unreadSet: new Set() };
    }
}

async function renderNotificationPopup(notifications, unreadSet) {
    const listEl = document.getElementById('notif-popup-list');
    const emptyEl = document.getElementById('notif-popup-empty');
    
    if (!listEl) return;

    if (!notifications || notifications.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';
    listEl.innerHTML = notifications.map(n => {
        const notifId = Number(n.notification_id);
        const isUnread = unreadSet.has(notifId);
        const time = formatRelativeTime(n.created_at);
        
        return `
            <div class="notif-item ${isUnread ? 'unread' : ''}" data-notif-id="${notifId}">
                <div class="notif-item-title">${escapeHTML(n.title)}</div>
                <div class="notif-item-message">${escapeHTML(n.message)}</div>
                <div class="notif-item-time">${time}</div>
            </div>
        `;
    }).join('');

    // Add click handlers to mark as read
    listEl.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            const notifId = Number(item.getAttribute('data-notif-id'));
            const userId = window.state?.currentUser?.user_id || 'guest';
            const unreadKey = getUnreadNotificationsKey(userId);
            const unreadSet = new Set(JSON.parse(localStorage.getItem(unreadKey) || '[]'));
            unreadSet.delete(notifId);
            localStorage.setItem(unreadKey, JSON.stringify(Array.from(unreadSet)));
            
            // Update UI
            item.classList.remove('unread');
            await loadAndDisplayNotifications();
        });
    });
}

function closeNotificationPopup() {
    const popup = document.getElementById('notif-popup');
    const overlay = document.getElementById('notif-overlay');
    if (popup) popup.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
}

function setupNotifications(state) {
    const bell = document.getElementById('notif-btn');
    const popup = document.getElementById('notif-popup');
    const overlay = document.getElementById('notif-overlay');
    const closeBtn = document.getElementById('notif-popup-close');
    const markAllReadBtn = document.getElementById('notif-mark-all-read');

    if (!bell || !popup) return;

    // Initial load
    loadAndDisplayNotifications();

    // Refresh every 45 seconds
    if (notificationRefreshTimer) clearInterval(notificationRefreshTimer);
    notificationRefreshTimer = setInterval(() => {
        loadAndDisplayNotifications();
    }, 45000);

    // Bell click: open popup
    bell.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { notifications, unreadSet } = await loadAndDisplayNotifications();
        await renderNotificationPopup(notifications, unreadSet);
        popup.classList.add('show');
        overlay.classList.add('show');
    });

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeNotificationPopup();
        });
    }

    // Mark all as read
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const userId = state.currentUser?.user_id || 'guest';
            localStorage.setItem(getUnreadNotificationsKey(userId), '[]');
            await loadAndDisplayNotifications();
            await renderNotificationPopup(window._cachedNotifications || [], new Set());
        });
    }

    // Close on overlay click
    if (overlay) {
        overlay.addEventListener('click', closeNotificationPopup);
    }

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popup.classList.contains('show')) {
            closeNotificationPopup();
        }
    });

    // Close popup when navigating
    window._closeNotificationPopup = closeNotificationPopup;
}

// --- SEARCH FUNCTIONS ---

function rebuildSearchIndex() {
    // Called when class changes - rebuild search index for new class
    const classNum = window.state?.selectedClass || window.state?.currentUser?.class_number || 9;
    if (window._rebuildSearchIndexForClass && window._lastNavigateTo) {
        window._rebuildSearchIndexForClass(classNum, window._lastNavigateTo, window.state);
    }
}

async function loadNotifications(state) {
    try {
        const notifications = await window.adhyayan.getNotifications?.();
        const userId = state.currentUser?.user_id || 'guest';
        const unreadKey = getUnreadNotificationsKey(userId);
        const unreadSet = new Set(JSON.parse(localStorage.getItem(unreadKey) || '[]'));
        
        // On first load, mark all existing notifications as read
        if (unreadSet.size === 0 && notifications && notifications.length > 0) {
            const allIds = notifications.map(n => Number(n.notification_id));
            unreadSet.clear();
        }

        const badge = document.querySelector('.bell-icon i');
        if (badge) {
            if (unreadSet.size > 0) {
                badge.classList.add('show');
                badge.textContent = unreadSet.size > 9 ? '9+' : unreadSet.size;
            } else {
                badge.classList.remove('show');
            }
        }

        return notifications || [];
    } catch (err) {
        console.error('Failed to load notifications:', err);
        return [];
    }
}
