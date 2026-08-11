function escapeHtml(str) {
    return (str || '').toString()
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

export async function init(navigateTo, state) {
    let quiz = state.activeQuiz;
    const questionBox = document.getElementById('quiz-question');
    const optionsBox = document.getElementById('quiz-options');
    const counter = document.getElementById('quiz-counter');
    const typeBadge = document.getElementById('quiz-type-badge');
    const nextBtn = document.getElementById('quiz-next-btn');
    const prevBtn = document.getElementById('quiz-prev-btn');
    const timer = document.getElementById('quiz-timer');
    const progressFill = document.getElementById('quiz-progress-fill');
    const questionView = document.getElementById('quiz-question-view');
    const resultsView = document.getElementById('quiz-results-view');
    const resultsRing = document.getElementById('results-score-ring');
    const resultsScoreValue = document.getElementById('results-score-value');
    const resultsTitle = document.getElementById('results-title');
    const resultsSubtitle = document.getElementById('results-subtitle');
    const resultsStats = document.getElementById('results-stats');

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
        if (questionBox) questionBox.textContent = 'No quiz is available right now. Please check back later.';
        if (optionsBox) optionsBox.innerHTML = '';
        if (counter) counter.textContent = 'No quiz available';
        return;
    }

    const pageSubject = document.getElementById('quiz-page-subject');
    const pageChapter = document.getElementById('quiz-page-chapter');
    const pageIcon = document.getElementById('quiz-page-icon');
    const iconClass = quiz.subject_icon || 'fa-book';

    if (pageSubject) pageSubject.textContent = quiz.subject_name || 'Quiz';
    if (pageChapter) pageChapter.textContent = quiz.chapter_name || '';
    if (pageIcon) pageIcon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;

    let currentIndex = 0;
    const selectedAnswers = {};

    const isSubjective = (question) => question.type === 'subjective' || !Array.isArray(question.options) || question.options.length === 0;

    const renderQuestion = () => {
        const question = quiz.questions[currentIndex];
        if (!question) return;
        if (questionBox) questionBox.textContent = question.question;
        if (counter) counter.textContent = `Question ${currentIndex + 1} of ${quiz.questions.length}`;
        if (typeBadge) {
            const subjective = isSubjective(question);
            typeBadge.textContent = subjective ? 'Subjective' : 'Multiple Choice';
            typeBadge.classList.toggle('type-subjective', subjective);
        }
        if (progressFill) progressFill.style.width = `${((currentIndex + 1) / quiz.questions.length) * 100}%`;
        if (optionsBox) {
            if (isSubjective(question)) {
                const answer = selectedAnswers[currentIndex] || '';
                optionsBox.innerHTML = `<textarea class="subjective-answer-box" rows="6" placeholder="Type your answer here...">${escapeHtml(answer)}</textarea>`;
                const textarea = optionsBox.querySelector('.subjective-answer-box');
                textarea?.addEventListener('input', () => {
                    selectedAnswers[currentIndex] = textarea.value;
                    nextBtn.disabled = textarea.value.trim() === '';
                });
            } else {
                optionsBox.innerHTML = (question.options || []).map((opt, idx) => {
                    const isSelected = selectedAnswers[currentIndex] === opt;
                    const letter = ['A', 'B', 'C', 'D'][idx] || String(idx + 1);
                    return `
                        <div class="option-row ${isSelected ? 'active-selected' : ''}" data-answer="${opt}">
                            <div class="radio-node ${isSelected ? 'filled' : ''}">${isSelected ? '<i class="fa-solid fa-check"></i>' : letter}</div>
                            <div class="response-metric">${opt}</div>
                        </div>
                    `;
                }).join('');

                optionsBox.querySelectorAll('.option-row').forEach((row) => {
                    row.addEventListener('click', () => {
                        selectedAnswers[currentIndex] = row.dataset.answer;
                        renderQuestion();
                    });
                });
            }
        }

        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = !selectedAnswers[currentIndex] || String(selectedAnswers[currentIndex]).trim() === '';
        nextBtn.textContent = currentIndex === quiz.questions.length - 1 ? 'Submit Quiz' : 'Next Question';
    };

    let quizCompleted = false;

    prevBtn?.addEventListener('click', () => {
        if (quizCompleted) {
            navigateTo('home');
        } else if (currentIndex > 0) {
            currentIndex -= 1;
            renderQuestion();
        }
    });

    nextBtn?.addEventListener('click', () => {
        if (quizCompleted) {
            navigateTo('quiz-center');
            return;
        }

        if (currentIndex < quiz.questions.length - 1) {
            currentIndex += 1;
            renderQuestion();
        } else {
            // Only MCQ questions are auto-graded; subjective answers are just recorded.
            const objectiveQuestions = quiz.questions.filter(q => !isSubjective(q));
            const subjectiveCount = quiz.questions.length - objectiveQuestions.length;
            const correctCount = quiz.questions.reduce((count, q, idx) => {
                return count + (!isSubjective(q) && selectedAnswers[idx] === q.correctAnswer ? 1 : 0);
            }, 0);
            const totalQuestions = objectiveQuestions.length;
            const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;

            if (timer) timer.textContent = 'Done';
            if (progressFill) progressFill.style.width = '100%';

            if (questionView) questionView.classList.add('hidden');
            if (resultsView) resultsView.classList.remove('hidden');

            const ringColor = scorePercent >= 75 ? '#1b8039' : scorePercent >= 50 ? '#f59e0b' : '#ef4444';
            if (resultsRing) resultsRing.style.setProperty('--pct', scorePercent);
            if (resultsRing) resultsRing.style.setProperty('--ring-color', ringColor);
            if (resultsScoreValue) resultsScoreValue.textContent = `${scorePercent}%`;
            if (resultsTitle) resultsTitle.textContent = scorePercent >= 75 ? 'Great job!' : scorePercent >= 50 ? 'Good effort!' : 'Keep practicing!';
            resultsSubtitle && (resultsSubtitle.textContent = totalQuestions > 0
                ? `You got ${correctCount} out of ${totalQuestions} correct.${subjectiveCount ? ` (${subjectiveCount} subjective answer${subjectiveCount > 1 ? 's' : ''} submitted for review.)` : ''}`
                : `${subjectiveCount} subjective answer${subjectiveCount > 1 ? 's' : ''} submitted for review.`);
            if (resultsStats) {
                const incorrectCount = totalQuestions - correctCount;
                resultsStats.innerHTML = [
                    totalQuestions > 0 ? `<div class="stat-chip stat-correct"><i class="fa-solid fa-check"></i> ${correctCount} Correct</div>` : '',
                    totalQuestions > 0 ? `<div class="stat-chip stat-incorrect"><i class="fa-solid fa-xmark"></i> ${incorrectCount} Incorrect</div>` : '',
                    subjectiveCount ? `<div class="stat-chip stat-subjective"><i class="fa-solid fa-pen"></i> ${subjectiveCount} For Review</div>` : ''
                ].join('');
            }

            quizCompleted = true;
            prevBtn.disabled = false;
            nextBtn.disabled = false;
            prevBtn.textContent = 'Back';
            nextBtn.textContent = 'View Score';

            if (window.adhyayan && state.currentUser && state.currentUser.user_id) {
                window.adhyayan.addQuizAttempt(state.currentUser.user_id, quiz.quiz_id, correctCount, totalQuestions, scorePercent)
                    .catch(err => console.error('Failed to save quiz attempt:', err));
            }
        }
    });

    let seconds = 0;
    setInterval(() => {
        seconds += 1;
        if (timer) timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }, 1000);

    renderQuestion();
}