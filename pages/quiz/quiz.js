const PROGRESS_PREFIX = 'adhyayan_quiz_progress_';
import { DEMO_QUIZZES, demoResumeFor } from '../quiz-center/demo-data.js';

function escapeHtml(str) {
    return (str ?? '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function pickBestQuiz(quizzes, subjectId = null) {
    const filtered = subjectId == null
        ? quizzes
        : quizzes.filter(q => Number(q.subject_id) === Number(subjectId));
    if (!Array.isArray(filtered) || filtered.length === 0) return null;
    return [...filtered].sort((a, b) => {
        const aLen = Array.isArray(a.questions) ? a.questions.length : 0;
        const bLen = Array.isArray(b.questions) ? b.questions.length : 0;
        if (bLen !== aLen) return bLen - aLen;
        return Number(b.quiz_id || 0) - Number(a.quiz_id || 0);
    })[0];
}

const ICON_CHECK = '<svg class="qq-mark" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_CROSS = '<svg class="qq-mark" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export async function init(navigateTo, state) {
    let quiz = state.activeQuiz;
    const $ = (id) => document.getElementById(id);
    const questionBox = $('quiz-question');
    const optionsBox = $('quiz-options');
    const counter = $('quiz-counter');
    const nextBtn = $('quiz-next-btn');
    const skipBtn = $('quiz-skip-btn');
    const timerEl = $('quiz-timer');
    const fill = $('quiz-progress-fill');
    const bar = $('qq-bar');
    const feedback = $('qq-feedback');
    const questionView = $('qq-question-view');
    const resultsView = $('qq-results-view');

    if ((!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) && state.currentUser) {
        try {
            const classNumber = Number(state.currentUser.class_number || state.selectedClass || 9);
            const quizzes = await window.adhyayan.getQuizzesByClass(classNumber);
            const recovered = pickBestQuiz(quizzes, quiz?.subject_id) || pickBestQuiz(quizzes);
            if (recovered) {
                quiz = recovered;
                state.activeQuiz = recovered;
            }
        } catch (err) {
            console.error('Failed to auto-recover quiz with questions:', err);
        }
    }

    if (!quiz || !quiz.questions || quiz.questions.length === 0) {
        questionBox.textContent = 'No quiz is available right now. Please check back later.';
        counter.textContent = 'No quiz available';
        skipBtn.hidden = true;
        $('qq-close').addEventListener('click', () => navigateTo('quiz-center'));
        return;
    }

    const total = quiz.questions.length;
    const storeKey = PROGRESS_PREFIX + (state.currentUser?.user_id || 'guest');
    const readStore = () => { try { return JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; } catch (_) { return {}; } };
    const writeStore = (data) => { try { localStorage.setItem(storeKey, JSON.stringify(data)); } catch (_) { /* storage full or blocked */ } };
    const clearProgress = () => { const s = readStore(); delete s[quiz.quiz_id]; writeStore(s); };
    const saveProgress = () => {
        const s = readStore();
        s[quiz.quiz_id] = { index: currentIndex, answers: selectedAnswers, seconds, at: Date.now() };
        writeStore(s);
    };

    $('qq-pill').textContent = [quiz.subject_name, quiz.chapter_name].filter(Boolean).join(' · ') || 'Quiz';

    const isSubjective = (q) => q.type === 'subjective' || !Array.isArray(q.options) || q.options.length === 0;

    let currentIndex = 0;
    let selectedAnswers = {};
    let seconds = 0;
    let finished = false;

    const resume = readStore()[quiz.quiz_id] || demoResumeFor(quiz);
    if (resume && resume.index < total) {
        currentIndex = Math.max(0, Number(resume.index) || 0);
        selectedAnswers = resume.answers || {};
        seconds = Number(resume.seconds) || 0;
    }

    const interval = setInterval(() => {
        if (!document.body.contains(timerEl)) { clearInterval(interval); return; }
        if (finished) return;
        seconds += 1;
        timerEl.textContent = formatTime(seconds);
    }, 1000);
    timerEl.textContent = formatTime(seconds);

    const answered = (idx) => {
        const v = selectedAnswers[idx];
        return v !== undefined && String(v).trim() !== '';
    };

    function setFeedback(question) {
        if (isSubjective(question) || !answered(currentIndex)) {
            feedback.hidden = true;
            return;
        }
        const ok = selectedAnswers[currentIndex] === question.correctAnswer;
        feedback.className = `qq-feedback ${ok ? 'ok' : 'no'}`;
        const explanation = question.explanation ? `<p>${escapeHtml(question.explanation)}</p>` : '';
        const idx = question.options.indexOf(question.correctAnswer);
        const heading = ok
            ? 'Correct! Well done.'
            : `Not quite. The answer is ${idx >= 0 ? LETTERS[idx] : escapeHtml(question.correctAnswer)}.`;
        feedback.innerHTML = `<strong>${heading}</strong>${explanation}`;
        feedback.hidden = false;
    }

    function renderQuestion() {
        const question = quiz.questions[currentIndex];
        const isLast = currentIndex === total - 1;
        questionBox.textContent = question.question;
        counter.textContent = `Question ${currentIndex + 1} of ${total}`;
        const pct = Math.round((currentIndex / total) * 100);
        fill.style.width = `${pct}%`;
        bar.setAttribute('aria-valuenow', String(pct));

        if (isSubjective(question)) {
            optionsBox.removeAttribute('role');
            optionsBox.innerHTML = `<textarea class="qq-textarea" rows="6" placeholder="Type your answer here..." aria-label="Your answer">${escapeHtml(selectedAnswers[currentIndex] || '')}</textarea>`;
            const ta = optionsBox.querySelector('textarea');
            ta.addEventListener('input', () => {
                selectedAnswers[currentIndex] = ta.value;
                nextBtn.disabled = ta.value.trim() === '';
            });
            nextBtn.disabled = !answered(currentIndex);
            nextBtn.textContent = isLast ? 'Submit quiz' : 'Next question';
        } else {
            optionsBox.setAttribute('role', 'radiogroup');
            const locked = answered(currentIndex);
            optionsBox.innerHTML = question.options.map((opt, i) => {
                const picked = selectedAnswers[currentIndex] === opt;
                const correct = opt === question.correctAnswer;
                let cls = '';
                if (locked && correct) cls = 'is-correct';
                else if (locked && picked) cls = 'is-wrong';
                return `
                    <button type="button" class="qq-option ${cls}" role="radio" aria-checked="${picked}" data-i="${i}" ${locked ? 'disabled' : ''}>
                        <span class="qq-letter">${LETTERS[i] || i + 1}</span>
                        <span class="qq-option-text">${escapeHtml(opt)}</span>
                        ${locked && correct ? ICON_CHECK : locked && picked ? ICON_CROSS : ''}
                    </button>`;
            }).join('');
            optionsBox.querySelectorAll('.qq-option').forEach(btn => {
                btn.addEventListener('click', () => pick(Number(btn.dataset.i)));
            });
            nextBtn.disabled = !locked;
            nextBtn.textContent = locked ? (isLast ? 'Submit quiz' : 'Next question') : 'Check answer';
        }
        skipBtn.hidden = false;
        setFeedback(question);
    }

    function pick(i) {
        const question = quiz.questions[currentIndex];
        if (isSubjective(question) || answered(currentIndex)) return;
        selectedAnswers[currentIndex] = question.options[i];
        saveProgress();
        renderQuestion();
        nextBtn.focus({ preventScroll: true });
    }

    function advance() {
        if (currentIndex < total - 1) {
            currentIndex += 1;
            saveProgress();
            renderQuestion();
            window.scrollTo({ top: 0 });
        } else {
            finish();
        }
    }

    nextBtn.addEventListener('click', () => { if (!nextBtn.disabled) advance(); });
    skipBtn.addEventListener('click', advance);
    $('qq-close').addEventListener('click', () => navigateTo('quiz-center'));

    const onKey = (e) => {
        if (!document.body.contains(optionsBox)) { document.removeEventListener('keydown', onKey); return; }
        if (finished || e.ctrlKey || e.metaKey || e.altKey) return;
        if (/^(textarea|input)$/i.test(e.target?.tagName || '')) return;
        const key = e.key.toUpperCase();
        let i = -1;
        if (/^[1-9]$/.test(key)) i = Number(key) - 1;
        else if (/^[A-F]$/.test(key)) i = LETTERS.indexOf(key);
        if (i >= 0 && i < (quiz.questions[currentIndex].options?.length || 0)) {
            e.preventDefault();
            pick(i);
        }
    };
    document.addEventListener('keydown', onKey);

    async function finish() {
        finished = true;
        clearProgress();
        const objective = quiz.questions.map((q, idx) => ({ q, idx })).filter(x => !isSubjective(x.q));
        const subjectiveCount = total - objective.length;
        const wrong = objective.filter(({ q, idx }) => selectedAnswers[idx] !== q.correctAnswer);
        const correctCount = objective.length - wrong.length;
        const scorePercent = objective.length > 0 ? Math.round((correctCount / objective.length) * 100) : 100;

        if (!quiz.is_demo && state.currentUser?.user_id && window.adhyayan?.addQuizAttempt) {
            window.adhyayan.addQuizAttempt(state.currentUser.user_id, quiz.quiz_id, correctCount, objective.length, scorePercent)
                .catch(err => console.error('Failed to save quiz attempt:', err));
        }

        questionView.hidden = true;
        resultsView.hidden = false;
        window.scrollTo({ top: 0 });

        $('qq-results-name').textContent = quiz.title || 'Quiz';
        $('qq-ring-score').textContent = objective.length ? `${correctCount}/${objective.length}` : '—';
        $('qq-ring-pct').textContent = `${scorePercent}%`;
        $('qq-stat-correct').textContent = correctCount;
        $('qq-stat-wrong').textContent = wrong.length;
        $('qq-stat-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

        const title = scorePercent >= 75 ? 'Great work!' : scorePercent >= 50 ? 'Good try!' : 'Keep practising!';
        const line = scorePercent >= 75 ? 'You really know this chapter. Keep it up!'
            : scorePercent >= 50 ? 'You are getting there. Review your mistakes and try again.'
            : 'Every attempt makes you stronger. Review the answers and retry.';
        $('results-title').textContent = title;
        $('results-subtitle').textContent = subjectiveCount
            ? `${line} ${subjectiveCount} written answer${subjectiveCount > 1 ? 's' : ''} saved for review.`
            : line;

        const arc = $('qq-ring-arc');
        const circumference = 2 * Math.PI * 52;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            arc.style.strokeDashoffset = String(circumference * (1 - scorePercent / 100));
        }));

        const review = $('qq-review');
        const list = $('qq-review-list');
        review.hidden = wrong.length === 0;
        list.innerHTML = wrong.map(({ q, idx }) => `
            <button type="button" class="qq-review-card" data-idx="${idx}">
                <span class="qq-badge-q">Q${idx + 1}</span>
                <span>${escapeHtml(q.question)}</span>
            </button>`).join('');
        list.querySelectorAll('.qq-review-card').forEach(btn => {
            btn.addEventListener('click', () => openSheet(Number(btn.dataset.idx)));
        });

        setupResultActions();
    }

    const sheet = $('qq-sheet');
    function openSheet(idx) {
        const q = quiz.questions[idx];
        $('qq-sheet-badge').textContent = `Q${idx + 1}`;
        $('qq-sheet-q').textContent = q.question;
        $('qq-sheet-yours').textContent = answered(idx) ? selectedAnswers[idx] : 'Skipped';
        $('qq-sheet-correct').textContent = q.correctAnswer;
        sheet.hidden = false;
        $('qq-sheet-close').focus();
    }
    const closeSheet = () => { sheet.hidden = true; };
    $('qq-sheet-close').addEventListener('click', closeSheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

    async function setupResultActions() {
        $('qq-results-close').onclick = () => navigateTo('quiz-center');
        $('qq-retry').onclick = () => {
            selectedAnswers = {};
            currentIndex = 0;
            seconds = 0;
            finished = false;
            timerEl.textContent = formatTime(0);
            $('qq-ring-arc').style.strokeDashoffset = '326.7';
            resultsView.hidden = true;
            questionView.hidden = false;
            renderQuestion();
            window.scrollTo({ top: 0 });
        };

        const nextQuizBtn = $('qq-next-quiz');
        let nextQuiz = null;
        try {
            const classNumber = Number(state.currentUser?.class_number || quiz.class_number || 9);
            const all = quiz.is_demo ? DEMO_QUIZZES : await window.adhyayan.getQuizzesByClass(classNumber);
            const sameSubject = all
                .filter(q => Number(q.subject_id) === Number(quiz.subject_id) && Array.isArray(q.questions) && q.questions.length)
                .sort((a, b) => (Number(a.chapter_number) || 9999) - (Number(b.chapter_number) || 9999) || Number(a.quiz_id) - Number(b.quiz_id));
            const at = sameSubject.findIndex(q => Number(q.quiz_id) === Number(quiz.quiz_id));
            nextQuiz = at >= 0 ? sameSubject[at + 1] : null;
        } catch (err) {
            console.error('Failed to look up next quiz:', err);
        }
        if (nextQuiz) {
            nextQuizBtn.textContent = 'Next chapter quiz';
            nextQuizBtn.onclick = () => { state.activeQuiz = nextQuiz; navigateTo('quiz'); };
        } else {
            nextQuizBtn.textContent = 'More quizzes';
            nextQuizBtn.onclick = () => navigateTo('quiz-center');
        }
    }

    renderQuestion();
}
