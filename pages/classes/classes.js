export function init(navigateTo, state) {
    document.querySelectorAll('.class-card').forEach(el => {
        el.addEventListener('click', () => {
            document.getElementById('format-modal').classList.remove('hidden');
        });
    });
    document.getElementById('back-btn')?.addEventListener('click', () => navigateTo('courses'));
}