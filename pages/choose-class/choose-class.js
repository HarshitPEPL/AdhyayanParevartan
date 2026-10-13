// One-time class picker for students who have no saved class (accounts created before
// signup asked for it, and first-time Google sign-ins). The choice is saved to the
// profile, so the student lands straight in their class on every later login.
import { getSavedClass } from '../auth/auth.js';

export function init(navigateTo, state) {
    const user = state.currentUser;
    if (!user) {
        navigateTo('auth', { replace: true });
        return;
    }
    if (getSavedClass(user)) {
        navigateTo('home', { replace: true });
        return;
    }

    const grid = document.getElementById('choose-class-grid');
    const continueBtn = document.getElementById('choose-class-continue');
    const errorEl = document.getElementById('choose-class-error');
    let chosen = null;

    grid.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(n => `
        <button type="button" class="choose-class-btn" role="radio" aria-checked="false" data-class="${n}">${n}</button>
    `).join('');

    grid.querySelectorAll('.choose-class-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            chosen = Number(btn.dataset.class);
            grid.querySelectorAll('.choose-class-btn').forEach(b => {
                const active = b === btn;
                b.classList.toggle('active', active);
                b.setAttribute('aria-checked', String(active));
            });
            errorEl.classList.remove('show');
            continueBtn.disabled = false;
            continueBtn.textContent = `Continue to Class ${chosen}`;
        });
    });

    continueBtn.addEventListener('click', async () => {
        if (!chosen) return;
        continueBtn.disabled = true;
        continueBtn.textContent = 'Saving…';
        try {
            // The placeholder Google login used on unregistered dev origins has no database row.
            if (user.user_id != null) await window.adhyayan.updateUserClass(user.user_id, chosen);
            user.class_number = chosen;
            state.currentUser = user;
            state.selectedClass = chosen;
            window.adhyayan?.saveSession?.();
            navigateTo('home', { replace: true });
        } catch (err) {
            console.error('Failed to save class:', err);
            errorEl.textContent = "Couldn't save your class. Check your internet and try again.";
            errorEl.classList.add('show');
            continueBtn.disabled = false;
            continueBtn.textContent = `Continue to Class ${chosen}`;
        }
    });
}
