// Static demo content for the quiz section. It is only used when the backend
// returns no quizzes for the class (see quiz-center.js / quiz.js).
const q = (question, options, answerIndex) => ({
    question,
    options,
    correctAnswer: options[answerIndex],
    type: 'mcq'
});

const quiz = (id, subject, subjectId, chapter, title, questions) => ({
    quiz_id: id,
    title,
    class_number: 0,
    subject_id: subjectId,
    subject_name: subject,
    chapter_name: title,
    chapter_number: chapter,
    question_count: questions.length,
    questions,
    is_demo: true
});

export const DEMO_QUIZZES = [
    quiz(-1, 'Maths', -1, 1, 'Real Numbers', [
        q('Which of these is an irrational number?', ['√2', '0.5', '3/4', '7'], 0),
        q('The HCF of 12 and 18 is:', ['3', '6', '9', '12'], 1),
        q('The LCM of 4 and 6 is:', ['10', '12', '24', '2'], 1),
        q('Decimal expansion of a rational number is:', ['Non-terminating non-repeating', 'Terminating or repeating', 'Always terminating', 'Always repeating'], 1),
        q('Which is the smallest prime number?', ['0', '1', '2', '3'], 2)
    ]),
    quiz(-2, 'Maths', -1, 2, 'Polynomials', [
        q('Degree of the polynomial x³ + 2x + 1 is:', ['1', '2', '3', '0'], 2),
        q('A quadratic polynomial has at most how many zeroes?', ['1', '2', '3', '4'], 1),
        q('Zero of p(x) = x − 5 is:', ['−5', '0', '5', '1'], 2),
        q('Sum of zeroes of x² − 5x + 6 is:', ['5', '6', '−5', '1'], 0),
        q('A polynomial of degree 1 is called:', ['Constant', 'Linear', 'Quadratic', 'Cubic'], 1)
    ]),
    quiz(-3, 'Maths', -1, 3, 'Triangles', [
        q('Sum of the angles of a triangle is:', ['90°', '180°', '270°', '360°'], 1),
        q('A triangle with all sides equal is:', ['Scalene', 'Isosceles', 'Equilateral', 'Right'], 2),
        q('In a right triangle, the longest side is the:', ['Base', 'Height', 'Hypotenuse', 'Median'], 2),
        q('Two triangles with equal angles are:', ['Congruent', 'Similar', 'Equal', 'Parallel'], 1),
        q('Pythagoras theorem applies to:', ['Any triangle', 'Right triangles', 'Circles', 'Squares'], 1)
    ]),
    quiz(-4, 'Science', -2, 1, 'Chemical Reactions', [
        q('Rusting of iron is a:', ['Physical change', 'Chemical change', 'Nuclear change', 'No change'], 1),
        q('Which gas is released when zinc reacts with dilute HCl?', ['Oxygen', 'Hydrogen', 'Carbon dioxide', 'Nitrogen'], 1),
        q('Burning of magnesium produces:', ['MgO', 'MgCl₂', 'Mg(OH)₂', 'MgS'], 0),
        q('A reaction that releases heat is:', ['Endothermic', 'Exothermic', 'Neutral', 'Reversible'], 1),
        q('Balancing equations follows the law of:', ['Gravity', 'Conservation of mass', 'Motion', 'Inertia'], 1)
    ]),
    quiz(-5, 'Science', -2, 2, 'Life Processes', [
        q('The main organ of respiration in humans is the:', ['Heart', 'Lungs', 'Liver', 'Kidney'], 1),
        q('Plants make food by:', ['Respiration', 'Photosynthesis', 'Digestion', 'Excretion'], 1),
        q('Blood is pumped by the:', ['Lungs', 'Brain', 'Heart', 'Stomach'], 2),
        q('The functional unit of the kidney is the:', ['Neuron', 'Nephron', 'Alveolus', 'Villus'], 1),
        q('Which pigment captures sunlight in leaves?', ['Haemoglobin', 'Chlorophyll', 'Melanin', 'Keratin'], 1)
    ]),
    quiz(-6, 'English', -3, 1, 'A Letter to God', [
        q('Who wrote a letter to God in the story?', ['Lencho', 'Pedro', 'Diego', 'Tom'], 0),
        q('What did Lencho ask God for?', ['Food', 'Money', 'A house', 'Seeds'], 1),
        q('The hailstorm destroyed his:', ['House', 'Crops', 'Animals', 'Tools'], 1),
        q('Who read the letter at the post office?', ['The postmaster', 'The mayor', 'A farmer', 'A teacher'], 0),
        q('What was Lencho\'s main quality?', ['Faith', 'Anger', 'Fear', 'Greed'], 0)
    ]),
    quiz(-7, 'English', -3, 2, 'Nelson Mandela: Long Walk to Freedom', [
        q('Mandela became the first black President of:', ['Kenya', 'South Africa', 'Nigeria', 'Ghana'], 1),
        q('The system of racial separation was called:', ['Apartheid', 'Colonialism', 'Feudalism', 'Socialism'], 0),
        q('Mandela spent how many years in prison?', ['7', '18', '27', '40'], 2),
        q('The inauguration was held in:', ['Cape Town', 'Pretoria', 'Durban', 'Johannesburg'], 1),
        q('Mandela called courage the:', ['Absence of fear', 'Triumph over fear', 'Strength of arms', 'Gift of birth'], 1)
    ]),
    quiz(-8, 'Social Science', -4, 1, 'The Rise of Nationalism in Europe', [
        q('The French Revolution began in:', ['1689', '1789', '1815', '1848'], 1),
        q('Who unified Germany?', ['Garibaldi', 'Bismarck', 'Napoleon', 'Mazzini'], 1),
        q('The Treaty of Vienna was signed in:', ['1789', '1815', '1871', '1919'], 1),
        q('Giuseppe Mazzini founded:', ['Young Italy', 'Red Shirts', 'Zollverein', 'Jacobins'], 0),
        q('Nationalism means:', ['Love for one\'s nation', 'Hatred of others', 'Rule by kings', 'Trade union'], 0)
    ])
];

// Latest attempt per demo quiz: [quiz_id, score_percent, minutes ago]
const ATTEMPT_ROWS = [
    [-1, 90, 60 * 24],
    [-2, 40, 60 * 30],
    [-4, 80, 60 * 52],
    [-5, 100, 60 * 80],
    [-6, 60, 60 * 120]
];

export const DEMO_ATTEMPTS = ATTEMPT_ROWS.map(([id, pct, minsAgo], i) => {
    const quizItem = DEMO_QUIZZES.find(item => item.quiz_id === id);
    return {
        attempt_id: -(i + 1),
        quiz_id: id,
        score_percent: pct,
        total_questions: quizItem.questions.length,
        correct_answers: Math.round((pct / 100) * quizItem.questions.length),
        taken_at: new Date(Date.now() - minsAgo * 60 * 1000).toISOString(),
        quiz_title: quizItem.title,
        subject_name: quizItem.subject_name,
        chapter_name: quizItem.chapter_name
    };
});

// Quiz shown on the "Continue" card, with 3 of 5 questions already answered.
export const DEMO_CONTINUE = { quizId: -3, index: 3 };

export function demoResumeFor(quizItem) {
    if (!quizItem?.is_demo || quizItem.quiz_id !== DEMO_CONTINUE.quizId) return null;
    const answers = {};
    quizItem.questions.slice(0, DEMO_CONTINUE.index).forEach((item, i) => { answers[i] = item.correctAnswer; });
    return { index: DEMO_CONTINUE.index, answers, seconds: 74 };
}

export const DEMO_LEADERBOARD = [
    { name: 'Aarav Sharma', xp: 940 },
    { name: 'Diya Patel', xp: 880 },
    { name: 'Kabir Singh', xp: 815 },
    { name: 'Ananya Gupta', xp: 760 },
    { name: 'Rohan Mehta', xp: 702 },
    { name: 'Ishita Verma', xp: 655 },
    { name: 'Vihaan Joshi', xp: 590 }
];
