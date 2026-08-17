function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
        t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t)
    );
}

const FORMAT_ICONS = {
    'E-Book': { icon: 'fa-file-pdf', color: '#E53935' },
    'Audio Book': { icon: 'fa-headphones', color: '#7B1FA2' },
    'Video Content': { icon: 'fa-play-circle', color: '#1B8039' },
};

export async function init(navigateTo, state) {
    const container = document.getElementById('competitive-exams-list');
    const backButton = document.getElementById('competitive-exams-back');
    const classLabel = document.getElementById('competitive-exams-class-label');

    backButton?.addEventListener('click', () => navigateTo('home'));

    if (classLabel) {
        const userName = state.currentUser?.full_name || 'Student';
        classLabel.textContent = `${userName} • Competitive Exams`;
    }

    try {
        const exams = await window.adhyayan.getCompetitiveMaterials?.() || [];
        if (!container) return;

        if (!exams.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-book-open"></i>
                    <p>No competitive exam materials found yet.</p>
                    <span>Check back soon for new study materials.</span>
                </div>
            `;
            return;
        }

        container.innerHTML = exams.map(exam => {
            const fmt = FORMAT_ICONS[exam.format_name] || { icon: 'fa-file', color: '#888' };
            return `
                <div class="competitive-exam-item" data-id="${exam.material_id ?? ''}" onclick="window.openCompetitiveExamMaterial(${exam.material_id ?? 0})">
                    <div class="item-icon-wrap" style="background:${fmt.color}18; color:${fmt.color};">
                        <i class="fa-solid ${fmt.icon}"></i>
                    </div>
                    <div class="item-details">
                        <h4>${escapeHTML(exam.title || exam.exam_name || 'Competitive exam')}</h4>
                        <p>${escapeHTML(exam.exam_name || 'Competitive Exam')}</p>
                        <span class="format-badge" style="background:${fmt.color}18;color:${fmt.color};">
                            ${escapeHTML(exam.format_name || 'Study Material')}
                        </span>
                        ${exam.duration_lessons ? `<span class="duration-badge" style="background:#f3f4f6;color:#374151;"><i class="fa-regular fa-clock"></i> ${escapeHTML(exam.duration_lessons)}</span>` : ''}
                    </div>
                    <div class="item-action"><i class="fa-solid fa-chevron-right"></i></div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Failed to load competitive exams page:', err);
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-wifi-slash"></i>
                    <p>Failed to load competitive exams.</p>
                    <span>Please try again.</span>
                </div>
            `;
        }
    }
}

window.openCompetitiveExamMaterial = function(id) {
    const exams = window.adhyayan?.getCompetitiveMaterials ? window.adhyayan.getCompetitiveMaterials() : Promise.resolve([]);
    Promise.resolve(exams).then((items = []) => {
        const exam = items.find(item => Number(item.material_id) === Number(id));
        if (!exam) return;

        const material = {
            material_id: exam.material_id,
            title: exam.title || exam.exam_name || 'Competitive exam',
            subject_name: exam.exam_name || 'Competitive Exam',
            format_name: exam.format_name || 'Study Material',
            duration_lessons: exam.duration_lessons || 'N/A',
            instructor_name: exam.instructor_name || 'Competitive Exam',
            file_url: exam.file_url || '',
        };
        if (window.state) {
            window.state.activeMaterial = material;
            window.state.lastLibraryRoute = 'competitive-exams';
        }
        window.navigateTo('lesson');
    }).catch((err) => {
        console.error('Failed to open competitive exam material:', err);
    });
};
