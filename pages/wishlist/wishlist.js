// Lists materials the student has saved to their wishlist from a lesson
// (tracked client-side in core/db.js via addToWishlist/getWishlist, called
// from pages/lesson/lesson.js). Tapping an entry reopens it in the lesson reader.

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

export function init(navigateTo, state) {
    document.getElementById('wishlist-back-btn')?.addEventListener('click', () => navigateTo('profile'));

    const listEl = document.getElementById('wishlist-list');
    if (!listEl) return;

    const userId = state.currentUser?.user_id;

    function render() {
        const items = window.adhyayan.getWishlist?.(userId) || [];

        if (items.length === 0) {
            listEl.innerHTML = `<div class="wishlist-empty"><i class="fa-solid fa-heart" style="font-size:28px;margin-bottom:10px;display:block;color:#ccc;"></i>Your wishlist is empty.<br>Tap the heart icon on a lesson to save it here.</div>`;
            return;
        }

        listEl.innerHTML = items.map((d, i) => `
            <div class="wishlist-item" data-index="${i}">
                <div class="wishlist-icon"><i class="fa-solid fa-book"></i></div>
                <div class="wishlist-info">
                    <div class="wishlist-title">${escapeHTML(d.title)}</div>
                    <div class="wishlist-meta">${escapeHTML(d.subject_name || '')} ${d.format_name ? '• ' + escapeHTML(d.format_name) : ''}</div>
                    <div class="wishlist-time">${d.wishlisted_at ? 'Added ' + new Date(d.wishlisted_at).toLocaleString() : ''}</div>
                </div>
                <button type="button" class="wishlist-remove-btn" data-index="${i}" aria-label="Remove from wishlist">
                    <i class="fa-solid fa-heart-crack"></i>
                </button>
            </div>
        `).join('');

        listEl.querySelectorAll('.wishlist-item').forEach(item => {
            item.addEventListener('click', () => {
                const mat = items[Number(item.dataset.index)];
                if (!mat) return;
                state.activeMaterial = mat;
                state.lastLibraryRoute = 'wishlist';
                navigateTo('lesson');
            });
        });

        listEl.querySelectorAll('.wishlist-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const mat = items[Number(btn.dataset.index)];
                if (!mat) return;
                window.adhyayan.removeFromWishlist?.(userId, mat.material_id);
                render();
            });
        });
    }

    render();
}
