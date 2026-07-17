export function init(navigateTo, state) {
    document.querySelectorAll('.option-row').forEach(el => {
        el.addEventListener('click', (e) => {
            document.querySelectorAll('.option-row').forEach(opt => {
                opt.classList.remove('active-selected');
                const node = opt.querySelector('.radio-node');
                if (node) {
                    node.classList.remove('filled');
                    if(node.innerHTML.includes('fa-check')) {
                        node.innerHTML = opt.dataset.letter || '?';
                    }
                }
            });
            const current = e.currentTarget;
            current.classList.add('active-selected');
            const node = current.querySelector('.radio-node');
            if (node) {
                current.dataset.letter = node.innerHTML; 
                node.classList.add('filled');
                node.innerHTML = '<i class="fa-solid fa-check"></i>';
            }
        });
    });
}