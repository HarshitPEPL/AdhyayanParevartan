import { navigateTo } from './router.js';
import {
    initDatabase,
    getUserByEmail, addUser, deleteUser, updateUserPassword, approveUser,
    getUsers, getSubjects, addSubject, deleteSubject, getSubjectsByClass,
    getMaterials, addMaterial, deleteMaterial, getMaterialsByClass,
    getQuizzes, addQuiz, deleteQuiz, getQuizzesByClass,
    addQuizAttempt, getQuizAttemptsByUser, getQuizLeaderboard,
    getNotifications, addNotification, deleteNotification,
    setMaterialProgress, getRecentMaterialProgress, getAllMaterialProgress,
    recordDownload, getDownloads,
    getSiteContent, saveSiteContent,
    updateUserClass,
    uploadMaterialFile, dbType
} from './db.js';

// Global error handler
window.addEventListener('error', (e) => {
    console.error('GLOBAL ERROR:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('UNHANDLED REJECTION:', e.reason);
});

// Platform Detection
const isNativeApp = !!(window.Capacitor || window.cordova ||
    navigator.userAgent.includes('wv') ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
// Guard against running before <body> exists (e.g. a blocking script placed
// in <head>) so a timing quirk can never crash top-level script execution.
function markNativeApp() {
    if (isNativeApp) document.body.classList.add('native-app');
}
if (document.body) markNativeApp();
else document.addEventListener('DOMContentLoaded', markNativeApp);

export const state = { db: null, currentUser: null, currentRoute: 'splash' };

export async function initDB() {
    if (typeof window.initSqlJs !== 'function') {
        console.error('sql.js not loaded');
        return false;
    }
    let SQL;
    try {
        SQL = await window.initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
    } catch (e) {
        console.error('Failed to init sql.js:', e);
        return false;
    }

    const saved = localStorage.getItem('adhyayan_db');
    if (saved) {
        try {
            const bytes = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
            state.db = new SQL.Database(bytes);
            // Migration: ensure schema columns and tables exist
            try {
                state.db.run('ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0;');
            } catch (_) { /* column exists */ }
            ensureSchema(state.db);
            saveDatabase();
            return true;
        } catch (e) {
            console.error('Failed to restore DB, creating fresh:', e);
        }
    }

    try {
        state.db = new SQL.Database();
        const tables = [
            `CREATE TABLE IF NOT EXISTS roles (role_id INTEGER PRIMARY KEY AUTOINCREMENT, role_name VARCHAR(50) UNIQUE NOT NULL)`,
            `CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY AUTOINCREMENT, role_id INTEGER NOT NULL, full_name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, google_oauth_id VARCHAR(255), class_number INTEGER, board VARCHAR(50), streak_days INTEGER DEFAULT 0, xp_points INTEGER DEFAULT 0, is_approved INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (role_id) REFERENCES roles(role_id))`,
            `CREATE TABLE IF NOT EXISTS subjects (subject_id INTEGER PRIMARY KEY AUTOINCREMENT, subject_name VARCHAR(100) NOT NULL, class_number INTEGER NOT NULL)`,
            `CREATE TABLE IF NOT EXISTS content_formats (format_id INTEGER PRIMARY KEY AUTOINCREMENT, format_name VARCHAR(50) UNIQUE NOT NULL)`,
            `CREATE TABLE IF NOT EXISTS learning_materials (material_id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, format_id INTEGER NOT NULL, title VARCHAR(255) NOT NULL, description TEXT, file_url VARCHAR(512) NOT NULL, duration_lessons VARCHAR(50), instructor_name VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE, FOREIGN KEY (format_id) REFERENCES content_formats(format_id))`,
            `CREATE TABLE IF NOT EXISTS quizzes (quiz_id INTEGER PRIMARY KEY AUTOINCREMENT, title VARCHAR(255) NOT NULL, class_number INTEGER NOT NULL, subject_id INTEGER, chapter_name VARCHAR(255), chapter_number INTEGER, subject_icon VARCHAR(255), questions_json TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE SET NULL)`,
            `CREATE TABLE IF NOT EXISTS student_progress (progress_id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, material_id INTEGER NOT NULL, completion_percentage INTEGER DEFAULT 0, is_completed BOOLEAN DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE, FOREIGN KEY (material_id) REFERENCES learning_materials(material_id) ON DELETE CASCADE)`,
            `CREATE TABLE IF NOT EXISTS notifications (notification_id INTEGER PRIMARY KEY AUTOINCREMENT, title VARCHAR(255) NOT NULL, message TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
        ];
        tables.forEach(t => state.db.run(t));
        seedData();
        saveDatabase();
    } catch (e) {
        console.error('Failed to init tables:', e);
        return false;
    }
    return true;
}

export function saveDatabase() {
    if (!state.db) return;
    try {
        const binary = state.db.export();
        let str = '';
        for (let i = 0; i < binary.byteLength; i++) str += String.fromCharCode(binary[i]);
        localStorage.setItem('adhyayan_db', btoa(str));
    } catch (e) { console.error('Failed to save DB:', e); }
}

function ensureSchema(db) {
    const safeRun = (sql) => {
        try { db.run(sql); } catch (_) {}
    };

    safeRun(`ALTER TABLE quizzes ADD COLUMN chapter_name VARCHAR(255)`);
    safeRun(`ALTER TABLE quizzes ADD COLUMN subject_icon VARCHAR(255)`);
    safeRun(`ALTER TABLE quizzes ADD COLUMN questions_json TEXT NOT NULL DEFAULT '[]'`);
    safeRun(`CREATE TABLE IF NOT EXISTS quiz_attempts (
        attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        quiz_id INTEGER NOT NULL,
        correct_answers INTEGER DEFAULT 0,
        total_questions INTEGER DEFAULT 0,
        score_percent INTEGER DEFAULT 0,
        taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
    )`);
    safeRun(`CREATE TABLE IF NOT EXISTS notifications (notification_id INTEGER PRIMARY KEY AUTOINCREMENT, title VARCHAR(255) NOT NULL, message TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
}

function seedData() {
    const safeRun = (sql, params) => {
        try { state.db.run(sql, params); } catch (_) {}
    };
    safeRun("INSERT INTO roles (role_name) VALUES ('Admin')");
    safeRun("INSERT INTO roles (role_name) VALUES ('Teacher')");
    safeRun("INSERT INTO roles (role_name) VALUES ('Student')");
    safeRun("INSERT INTO users (role_id, full_name, email, password_hash, class_number, board, streak_days, xp_points, is_approved) VALUES (3, 'Rahul Kumar', 'rahul@example.com', 'student123', 9, 'CBSE', 12, 2340, 1)");
    safeRun("INSERT INTO users (role_id, full_name, email, password_hash, class_number, board, streak_days, xp_points, is_approved) VALUES (3, 'Rahul', 'rahul@parevartan.com', 'Testing', 4, 'CBSE', 0, 0, 1)");
    safeRun("INSERT INTO content_formats (format_name) VALUES ('E-Book')");
    safeRun("INSERT INTO content_formats (format_name) VALUES ('Audio Book')");
    safeRun("INSERT INTO content_formats (format_name) VALUES ('Video Content')");

    const subjects = [
        [1,'Mathematics'],[1,'English'],[1,'Hindi'],[1,'EVS'],[2,'Mathematics'],[2,'English'],[2,'Hindi'],[2,'EVS'],
        [3,'Mathematics'],[3,'English'],[3,'Hindi'],[3,'EVS'],[4,'Mathematics'],[4,'English'],[4,'Hindi'],[4,'EVS'],
        [5,'Mathematics'],[5,'English'],[5,'Hindi'],[5,'EVS'],[6,'Mathematics'],[6,'Science'],[6,'English'],[6,'Hindi'],[6,'Social Studies'],
        [7,'Mathematics'],[7,'Science'],[7,'English'],[7,'Hindi'],[7,'Social Studies'],[8,'Mathematics'],[8,'Science'],[8,'English'],[8,'Hindi'],[8,'Social Studies'],
        [9,'Mathematics'],[9,'Science'],[9,'English'],[9,'Social Studies'],[9,'Hindi'],[10,'Mathematics'],[10,'Science'],[10,'English'],[10,'Social Studies'],[10,'Hindi'],
        [11,'Mathematics'],[11,'Physics'],[11,'Chemistry'],[11,'Biology'],[11,'English'],[12,'Mathematics'],[12,'Physics'],[12,'Chemistry'],[12,'Biology'],[12,'English']
    ];
    subjects.forEach(([cls, sub]) => safeRun('INSERT INTO subjects (subject_name, class_number) VALUES (?,?)', [sub, cls]));

    // Sample materials
    try {
        const r = (sql) => { const res = state.db.exec(sql); return res[0]?.values?.[0]?.[0]; };
        const m9 = r("SELECT subject_id FROM subjects WHERE subject_name='Mathematics' AND class_number=9");
        const m4 = r("SELECT subject_id FROM subjects WHERE subject_name='Mathematics' AND class_number=4");
        const e4 = r("SELECT subject_id FROM subjects WHERE subject_name='English' AND class_number=4");
        if (m9) state.db.run('INSERT INTO learning_materials (subject_id, format_id, title, description, file_url, duration_lessons, instructor_name) VALUES (?,3,?,?,?,?,?)', [m9,'Linear Equations in Two Variables','Learn linear equations.','/vids/math1.mp4','12:08','Anjali M.']);
        if (m4) state.db.run('INSERT INTO learning_materials (subject_id, format_id, title, description, file_url, duration_lessons, instructor_name) VALUES (?,3,?,?,?,?,?)', [m4,'Introduction to Numbers','Fun with numbers.','/vids/math4_1.mp4','08:30','Priya S.']);
        if (m4) state.db.run('INSERT INTO learning_materials (subject_id, format_id, title, description, file_url, duration_lessons, instructor_name) VALUES (?,1,?,?,?,?,?)', [m4,'Class 4 Math E-Book','Class 4 Math textbook.','/ebooks/math4.pdf','20 Chapters','Priya S.']);
        if (e4) state.db.run('INSERT INTO learning_materials (subject_id, format_id, title, description, file_url, duration_lessons, instructor_name) VALUES (?,3,?,?,?,?,?)', [e4,'English Grammar Basics','Grammar fundamentals.','/vids/eng4_1.mp4','10:15','Meena R.']);
        if (m9) state.db.run('INSERT INTO quizzes (title, class_number, subject_id, questions_json) VALUES (?,?,?,?)', ['Linear Equations Quiz', 9, m9, JSON.stringify([{ question: 'If 2x + 3y = 12 and x = 3, what is y?', options: ['1', '2', '3', '4'], correctAnswer: '2' }])]);
    } catch (_) {}
}

// Global Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    const rootView = document.getElementById('root-view');
    rootView.innerHTML = '<div style="padding:20px;text-align:center;"><h2>Loading...</h2></div>';

    // Try the real production backend (Supabase) first. This needs no local
    // SQL.js/wasm at all, so app boot never depends on fetching a large wasm
    // file from a third-party CDN over (possibly slow/blocked) mobile data.
    let ready = await initDatabase(null);
    if (!ready) {
        // Supabase not configured or unreachable - fall back to local SQLite.
        const dbReady = await initDB();
        if (!dbReady) {
            rootView.innerHTML = `<div class="screen" style="justify-content:center;align-items:center;text-align:center;padding:40px;">
                <div style="font-size:48px;margin-bottom:20px;">⚠️</div>
                <h2 style="font-size:20px;font-weight:700;margin-bottom:12px;">Connection Error</h2>
                <p style="font-size:14px;color:#666;line-height:1.5;">Failed to initialize the database.<br>Check your internet and refresh.</p>
                <button onclick="location.reload()" style="margin-top:24px;padding:12px 32px;background:#2E7D32;color:white;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;">Retry</button>
            </div>`;
            return;
        }
        await initDatabase(state.db);
    }

    // Expose db functions globally
    window.adhyayan = {
        state,
        getUserByEmail, addUser, deleteUser, updateUserPassword, approveUser,
        getUsers, getSubjects, addSubject, deleteSubject, getSubjectsByClass,
        getMaterials, addMaterial, deleteMaterial, getMaterialsByClass,
        getQuizzes, addQuiz, deleteQuiz, getQuizzesByClass,
        addQuizAttempt, getQuizAttemptsByUser, getQuizLeaderboard,
        getNotifications, addNotification, deleteNotification,
        setMaterialProgress, getRecentMaterialProgress, getAllMaterialProgress,
        recordDownload, getDownloads,
        getSiteContent, saveSiteContent,
        updateUserClass,
        uploadMaterialFile,
        get dbType() { return dbType; }
    };

    // Bottom Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            navigateTo(e.currentTarget.dataset.route);
        });
    });

    // Modal handlers
    document.getElementById('modal-close')?.addEventListener('click', () =>
        document.getElementById('format-modal')?.classList.add('hidden'));
    document.getElementById('alert-cancel')?.addEventListener('click', () =>
        document.getElementById('alert-modal')?.classList.add('hidden'));
    document.getElementById('alert-confirm')?.addEventListener('click', () => {
        document.getElementById('alert-modal')?.classList.add('hidden');
        alert('Account permanently deleted.');
    });
    document.querySelectorAll('.format-option').forEach(el => {
        el.addEventListener('click', () => {
            document.getElementById('format-modal')?.classList.add('hidden');
            navigateTo('lesson');
        });
    });

    // Start app
    navigateTo('splash', { replace: true });
});

// Scroll listener
document.addEventListener('scroll', (e) => {
    const el = e.target === document ? document.documentElement : e.target;
    if (el?.classList) {
        el.classList.add('is-scrolling');
        clearTimeout(el.scrollTimeoutId);
        el.scrollTimeoutId = setTimeout(() => el.classList.remove('is-scrolling'), 1500);
    }
}, true);
