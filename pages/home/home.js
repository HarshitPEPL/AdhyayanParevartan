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

    // --- 4. CHANGE CLASS: Navigate to classes page and refresh on return ---
    if (el('change-class-btn')) {
        el('change-class-btn').addEventListener('click', (e) => {
            e.preventDefault();
            // Navigate to classes page which handles class selection
            navigateTo('classes');
            // When user returns, the class will be updated in state
        });
    }

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
