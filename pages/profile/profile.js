// Uses window.adhyayan global (set by bundled core/app.js after db init)

export function init(navigateTo, state) {
    const user = state.currentUser;
    if (!user) {
        navigateTo('auth', { replace: true });
        return;
    }

    const el = id => document.getElementById(id);

    // Avatar initials
    const nameParts = (user.full_name || 'Student').trim().split(' ').filter(Boolean);
    const initials  = nameParts.map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

    if (el('profile-avatar')) el('profile-avatar').textContent = initials;
    if (el('profile-name'))   el('profile-name').textContent   = user.full_name   || 'Student';
    if (el('profile-email'))  el('profile-email').textContent  = user.email        || '—';
    if (el('profile-class'))  el('profile-class').innerHTML    =
        `Class ${user.class_number || '?'} &bull; ${user.board || 'CBSE'}`;

    // Gamification metrics, computed live from the student's quiz participation
    loadQuizStats(user, state);

    // Change class → in-place picker (no logout required)
    el('pref-change-class')?.addEventListener('click', () => openClassPicker(user, state));

    // Notifications → jump to Home and auto-open its live notification bell/panel
    el('pref-notifications')?.addEventListener('click', async () => {
        await navigateTo('home');
        document.getElementById('home-bell')?.click();
    });

    // Downloaded Lessons → real per-device download history
    el('pref-downloads')?.addEventListener('click', () => navigateTo('downloads'));

    // Help & Support → admin-editable content page
    el('pref-help')?.addEventListener('click', () => navigateTo('help-support'));

    // Sign out
    el('btn-sign-out')?.addEventListener('click', () => {
        state.currentUser   = null;
        state.selectedClass = null;
        navigateTo('auth', { replace: true });
    });
}

function openClassPicker(user, state) {
    const overlay = document.getElementById('class-picker-overlay');
    const grid = document.getElementById('class-picker-grid');
    const cancelBtn = document.getElementById('class-picker-cancel');
    if (!overlay || !grid) return;

    grid.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(n => `
        <button type="button" class="class-picker-btn ${Number(user.class_number) === n ? 'active' : ''}" data-class="${n}">${n}</button>
    `).join('');

    overlay.classList.remove('hidden');

    grid.querySelectorAll('.class-picker-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const newClass = Number(btn.dataset.class);
            overlay.classList.add('hidden');
            if (newClass === Number(user.class_number)) return;

            try {
                await window.adhyayan.updateUserClass(user.user_id, newClass);
                user.class_number = newClass;
                state.currentUser.class_number = newClass;

                const classEl = document.getElementById('profile-class');
                if (classEl) classEl.innerHTML = `Class ${newClass} &bull; ${user.board || 'CBSE'}`;

                loadQuizStats(user, state); // refresh RANK/XP against the new class's leaderboard
            } catch (err) {
                console.error('Failed to update class:', err);
                alert('Could not update your class. Please try again.');
            }
        }, { once: true });
    });

    const closeOverlay = () => overlay.classList.add('hidden');
    cancelBtn?.addEventListener('click', closeOverlay, { once: true });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeOverlay();
    }, { once: true });
}

async function loadQuizStats(user, state) {
    const el = id => document.getElementById(id);
    const classNumber = user.class_number || state.selectedClass || 9;

    try {
        const [attempts, leaderboard] = await Promise.all([
            window.adhyayan.getQuizAttemptsByUser(user.user_id),
            window.adhyayan.getQuizLeaderboard(classNumber)
        ]);

        // XP: 1 point per percentage score earned on every quiz attempt.
        const xp = attempts.reduce((sum, a) => sum + (a.score_percent || 0), 0);
        if (el('profile-xp')) el('profile-xp').textContent = xp.toLocaleString();

        // Day streak: consecutive calendar days (ending today or yesterday)
        // on which the student completed at least one quiz.
        if (el('profile-streak')) el('profile-streak').textContent = computeStreak(attempts);

        // Rank: position among classmates ranked by total quiz score.
        if (el('profile-rank')) {
            const idx = leaderboard.findIndex(r => Number(r.student_id) === Number(user.user_id));
            el('profile-rank').textContent = idx === -1 ? '#—' : `#${idx + 1}`;
        }
    } catch (err) {
        console.error('Failed to load quiz-based profile stats:', err);
    }
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
        if (!days.has(dayKey(cursor))) return 0; // no quiz today or yesterday: streak is broken
    }

    let streak = 0;
    while (days.has(dayKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}
