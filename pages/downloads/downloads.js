// Lists materials the student has downloaded from a lesson (tracked client-side
// in core/db.js via recordDownload/getDownloads, called from pages/lesson/lesson.js).

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

export function init(navigateTo, state) {
    document.getElementById('downloads-back-btn')?.addEventListener('click', () => navigateTo('profile'));

    const listEl = document.getElementById('downloads-list');
    if (!listEl) return;

    const userId = state.currentUser?.user_id;
    const downloads = window.adhyayan.getDownloads?.(userId) || [];

    if (downloads.length === 0) {
        listEl.innerHTML = `<div class="downloads-empty"><i class="fa-solid fa-download" style="font-size:28px;margin-bottom:10px;display:block;color:#ccc;"></i>No downloads yet.<br>Materials you download from a lesson will show up here.</div>`;
        return;
    }

    listEl.innerHTML = downloads.map((d, i) => `
        <div class="download-item" data-index="${i}">
            <div class="download-icon"><i class="fa-solid fa-file-arrow-down"></i></div>
            <div class="download-info">
                <div class="download-title">${escapeHTML(d.title)}</div>
                <div class="download-meta">${escapeHTML(d.subject_name || '')} ${d.format_name ? '• ' + escapeHTML(d.format_name) : ''}</div>
                <div class="download-time">${d.downloaded_at ? new Date(d.downloaded_at).toLocaleString() : ''}</div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:#CCC;font-size:12px;"></i>
        </div>
    `).join('');

    listEl.querySelectorAll('.download-item').forEach(item => {
        item.addEventListener('click', () => {
            const d = downloads[Number(item.dataset.index)];
            if (d?.file_url) window.open(d.file_url, '_blank');
        });
    });
}
