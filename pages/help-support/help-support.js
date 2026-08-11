// Displays admin-editable content (managed from Admin Panel -> Help & Support tab).
const FALLBACK_TEXT = "Need help? Email us at support@adhyayanparevartan.com and our team will get back to you soon.";

export async function init(navigateTo, state) {
    document.getElementById('help-back-btn')?.addEventListener('click', () => navigateTo('profile'));

    const titleEl = document.getElementById('help-support-title');
    const bodyEl = document.getElementById('help-support-body');

    try {
        const content = await window.adhyayan.getSiteContent('help_support');
        if (content && content.content) {
            if (titleEl) titleEl.textContent = content.title || 'Help & Support';
            if (bodyEl) bodyEl.textContent = content.content;
        } else if (bodyEl) {
            bodyEl.textContent = FALLBACK_TEXT;
        }
    } catch (err) {
        console.error('Failed to load Help & Support content:', err);
        if (bodyEl) bodyEl.textContent = FALLBACK_TEXT;
    }
}
