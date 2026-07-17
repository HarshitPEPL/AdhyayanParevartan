// Uses window.adhyayan global (set by bundled core/app.js after db init)

export function init(navigateTo, state) {
    const user = state.currentUser;
    if (!user) {
        navigateTo('auth');
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

    // Gamification metrics
    if (el('profile-streak')) el('profile-streak').textContent = user.streak_days ?? 0;
    if (el('profile-xp'))     el('profile-xp').textContent     =
        typeof user.xp_points === 'number' ? user.xp_points.toLocaleString() : '0';
    if (el('profile-rank'))   el('profile-rank').textContent   = '#—';

    // Change class → go back to auth (class selection screen)
    el('pref-change-class')?.addEventListener('click', () => {
        state.currentUser   = null;
        state.selectedClass = null;
        navigateTo('auth');
    });

    // Sign out
    el('btn-sign-out')?.addEventListener('click', () => {
        state.currentUser   = null;
        state.selectedClass = null;
        navigateTo('auth');
    });
}
