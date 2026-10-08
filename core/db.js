import { createClient } from '@supabase/supabase-js';

export let dbType = 'sqlite';
let supabaseClient = null;
let sqliteDb = null;
let quizMetaColumnsAvailable = null;
const QUIZ_QUESTION_CACHE_KEY = 'adhyayan_quiz_question_cache_v1';

// Helper to run queryAll on sqliteDb safely
function queryAll(db, sql, params = []) {
    const results = [];
    try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
    } catch (e) {
        console.error("SQL queryAll Error:", e);
    }
    return results;
}

function executeSQL(db, sql, params = []) {
    try {
        db.run(sql, params);
        // Save database local storage state
        const binary = db.export();
        let binaryString = "";
        const len = binary.byteLength;
        for (let i = 0; i < len; i++) {
            binaryString += String.fromCharCode(binary[i]);
        }
        const base64 = btoa(binaryString);
        localStorage.setItem("adhyayan_db", base64);
        return true;
    } catch (e) {
        console.error("SQL executeSQL Error:", e);
        if (e.name === 'QuotaExceededError' || e.message.includes('exceeded the quota')) {
            throw new Error("Local Storage limit exceeded. The file is too large to save.");
        }
        throw e;
    }
}

function parseQuestionsJson(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') {
        if (Array.isArray(value.questions)) return value.questions;
        if (value.question && Array.isArray(value.question)) return value.question;
        if (value.question && typeof value.question === 'string') return [value.question];
        return [value];
    }
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (_) { return []; }
    }
    return [];
}

function loadQuizQuestionCache() {
    try {
        const raw = localStorage.getItem(QUIZ_QUESTION_CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function saveQuizQuestionCache(entries) {
    try {
        localStorage.setItem(QUIZ_QUESTION_CACHE_KEY, JSON.stringify(entries.slice(0, 500)));
    } catch (_) {}
}

function cacheQuizQuestions(quizInfo, questions) {
    if (!Array.isArray(questions) || questions.length === 0) return;
    const cache = loadQuizQuestionCache();
    const normalizedTitle = String(quizInfo.title || '').trim().toLowerCase();
    const normalizedClass = Number(quizInfo.class_number);
    const normalizedSubject = quizInfo.subject_id != null ? Number(quizInfo.subject_id) : null;

    const existingIdx = cache.findIndex((entry) => {
        if (quizInfo.quiz_id != null && entry.quiz_id != null && Number(entry.quiz_id) === Number(quizInfo.quiz_id)) return true;
        return String(entry.title || '').trim().toLowerCase() === normalizedTitle
            && Number(entry.class_number) === normalizedClass
            && ((entry.subject_id == null && normalizedSubject == null) || Number(entry.subject_id) === normalizedSubject);
    });

    const payload = {
        quiz_id: quizInfo.quiz_id ?? null,
        title: quizInfo.title || '',
        class_number: Number.isFinite(normalizedClass) ? normalizedClass : null,
        subject_id: normalizedSubject,
        questions,
        updated_at: Date.now()
    };

    if (existingIdx >= 0) {
        cache[existingIdx] = payload;
    } else {
        cache.unshift(payload);
    }
    saveQuizQuestionCache(cache);
}

function getCachedQuizQuestions(quizInfo) {
    const cache = loadQuizQuestionCache();
    if (cache.length === 0) return [];
    const normalizedTitle = String(quizInfo.title || '').trim().toLowerCase();
    const normalizedClass = Number(quizInfo.class_number);
    const normalizedSubject = quizInfo.subject_id != null ? Number(quizInfo.subject_id) : null;

    const byId = quizInfo.quiz_id != null
        ? cache.find(entry => entry.quiz_id != null && Number(entry.quiz_id) === Number(quizInfo.quiz_id))
        : null;
    if (byId && Array.isArray(byId.questions) && byId.questions.length > 0) return byId.questions;

    const bySignature = cache.find((entry) => {
        return String(entry.title || '').trim().toLowerCase() === normalizedTitle
            && Number(entry.class_number) === normalizedClass
            && ((entry.subject_id == null && normalizedSubject == null) || Number(entry.subject_id) === normalizedSubject);
    });
    if (bySignature && Array.isArray(bySignature.questions) && bySignature.questions.length > 0) return bySignature.questions;
    return [];
}

function isMissingColumnError(error, columnName, tableName = 'quizzes') {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes(`could not find the '${String(columnName).toLowerCase()}' column of '${String(tableName).toLowerCase()}' in the schema cache`);
}

function getMissingQuizColumn(error) {
    const msg = String(error?.message || '');
    const schemaCacheMatch = msg.match(/could not find the '([^']+)' column of 'quizzes' in the schema cache/i);
    if (schemaCacheMatch) return schemaCacheMatch[1];

    const relationMatch = msg.match(/column\s+quizzes\.([a-zA-Z0-9_]+)\s+does not exist/i);
    if (relationMatch) return relationMatch[1];

    const quotedRelationMatch = msg.match(/column\s+"([a-zA-Z0-9_]+)"\s+of relation\s+"quizzes"\s+does not exist/i);
    if (quotedRelationMatch) return quotedRelationMatch[1];

    return null;
}

function getNotNullViolationColumn(error) {
    const msg = String(error?.message || '');
    const match = msg.match(/null value in column\s+"([a-zA-Z0-9_]+)"\s+of relation\s+"quizzes"\s+violates not-null constraint/i);
    return match ? match[1] : null;
}

// NOTE: The live Supabase `quizzes` table schema (verified directly against the
// production project) does NOT have `class_number`, `chapter_name`, `subject_icon`
// or `questions_json` columns. Its real columns are:
//   quiz_id, subject_id, chapter_number, topic_name, title, description,
//   question_count, duration_minutes, file_url, is_quick_practice, created_at,
//   chapter, google_form_url, is_quick_quiz
// Question data is stored as a JSON string in the `description` column (verified
// to round-trip correctly). class_number only exists on the related `subjects`
// row, so it must always be resolved via the subjects join below.
const QUIZ_BASE_COLUMNS = `
        quiz_id,
        subject_id,
        title,
        description,
        topic_name,
        chapter,
        chapter_number,
        question_count,
        duration_minutes,
        file_url,
        google_form_url,
        is_quick_practice,
        is_quick_quiz,
        created_at
    `;

// Supabase/PostgREST caps a single response at 1000 rows by default, so
// tables larger than that must be read page by page. `buildQuery` must return
// a fresh, deterministically ordered query each call.
const SUPABASE_PAGE_SIZE = 1000;
async function fetchAllRows(buildQuery) {
    const rows = [];
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
        const { data, error } = await buildQuery().range(from, from + SUPABASE_PAGE_SIZE - 1);
        if (error) return { data: null, error };
        rows.push(...(data || []));
        if (!data || data.length < SUPABASE_PAGE_SIZE) break;
    }
    return { data: rows, error: null };
}

async function fetchSupabaseQuizzesRows(classNumber = null) {
    const requestedClass = classNumber !== null && classNumber !== undefined ? parseInt(classNumber) : null;

    const buildQuery = () => {
        if (requestedClass !== null) {
            return supabaseClient
                .from('quizzes')
                .select(`${QUIZ_BASE_COLUMNS}, subjects!inner(subject_name, class_number)`)
                .eq('subjects.class_number', requestedClass)
                .order('quiz_id', { ascending: true });
        }
        return supabaseClient
            .from('quizzes')
            .select(`${QUIZ_BASE_COLUMNS}, subjects(subject_name, class_number)`)
            .order('quiz_id', { ascending: true });
    };

    const result = await fetchAllRows(buildQuery);
    if (result.error) throw result.error;
    return result.data || [];
}

function extractQuestionPayload(q) {
    const preferred = ['questions_json', 'questions', 'question_json', 'quiz_json', 'quiz_data', 'question_data'];
    for (const key of preferred) {
        if (q[key] !== undefined && q[key] !== null) return q[key];
    }

    const dynamicKey = Object.keys(q).find((k) => {
        if (!/question/i.test(k)) return false;
        return typeof q[k] === 'string' || Array.isArray(q[k]) || (q[k] && typeof q[k] === 'object');
    });
    return dynamicKey ? q[dynamicKey] : [];
}

function mapSupabaseQuizRow(q) {
    const normalizedClass = Number(q.subjects?.class_number);
    // Primary source of truth: the `description` column, where addQuiz() now stores
    // the questions array as a JSON string (confirmed to work against the real schema).
    let parsedQuestions = parseQuestionsJson(q.description);
    // Backward-compat fallback for any legacy rows saved by older buggy code paths
    // that may have (unsuccessfully) tried other column names.
    if (parsedQuestions.length === 0) {
        parsedQuestions = parseQuestionsJson(extractQuestionPayload(q));
    }
    const cachedQuestions = parsedQuestions.length === 0
        ? getCachedQuizQuestions({
            quiz_id: q.quiz_id,
            title: q.title,
            class_number: Number.isFinite(normalizedClass) ? normalizedClass : null,
            subject_id: q.subject_id
        })
        : [];
    const questions = parsedQuestions.length > 0 ? parsedQuestions : cachedQuestions;
    return {
        quiz_id: q.quiz_id,
        title: q.title,
        class_number: Number.isFinite(normalizedClass) ? normalizedClass : null,
        subject_id: q.subject_id,
        chapter_name: q.topic_name || q.chapter || '',
        chapter_number: q.chapter_number ?? null,
        subject_icon: 'fa-book',
        question_count: q.question_count ?? questions.length,
        questions,
        subject_name: q.subjects?.subject_name || 'General'
    };
}

// Initialize active database backend
export async function initDatabase(sqliteInstance) {
    sqliteDb = sqliteInstance;

    // Only use credentials from env or localStorage - NEVER hardcode in source
    let url = localStorage.getItem('VITE_SUPABASE_URL');
    let key = localStorage.getItem('VITE_SUPABASE_ANON_KEY');

    // __SUPABASE_URL__/__SUPABASE_ANON_KEY__ are inlined by Vite's `define`
    // at build time (see vite.config.js) so they work under any output format.
    if (!url && typeof __SUPABASE_URL__ !== 'undefined' && __SUPABASE_URL__) {
        url = __SUPABASE_URL__;
    }
    if (!key && typeof __SUPABASE_ANON_KEY__ !== 'undefined' && __SUPABASE_ANON_KEY__) {
        key = __SUPABASE_ANON_KEY__;
    }

    if (url && key && url !== 'YOUR_SUPABASE_URL_HERE' && key !== 'YOUR_SUPABASE_ANON_KEY_HERE') {
        try {
            supabaseClient = createClient(url, key);
            // Quick connection validation check
            const { data, error } = await supabaseClient.from('roles').select('role_id').limit(1);
            if (!error) {
                dbType = 'supabase';
                console.log("🚀 Supabase Connected! Active Backend: Cloud PostgreSQL Database.");
                return true;
            } else {
                console.warn("Supabase connection handshake failed, falling back to local SQLite:", error.message);
            }
        } catch (e) {
            console.error("Failed to connect to Supabase backend, falling back to local SQLite:", e);
        }
    }

    dbType = 'sqlite';
    console.log("📦 Active Backend: Local SQL.js SQLite (persisted to localStorage).");
    return false;
}


// --- DATABASE OPERATIONS ---

// 1. USERS TAB CRUD
export async function getUsers() {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('users')
            .select(`
                user_id,
                full_name,
                email,
                password_hash,
                role_id,
                class_number,
                is_approved,
                roles (
                    role_name
                )
            `);
        if (error) throw error;
        return data.map(u => ({
            user_id: u.user_id,
            full_name: u.full_name,
            email: u.email,
            password_hash: u.password_hash,
            role_name: u.roles?.role_name || 'Student',
            class_number: u.class_number,
            is_approved: u.is_approved ? 1 : 0
        }));
    } else {
        const sql = `
            SELECT u.user_id, u.full_name, u.email, u.password_hash, r.role_name, u.class_number, u.is_approved 
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.role_id
        `;
        return queryAll(sqliteDb, sql);
    }
}

export async function addUser(fullName, email, passwordHash, roleId, classNumber, isApproved = 0, googleOauthId = null) {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
        throw new Error('Email is required.');
    }

    const normalizedEmailLookup = normalizedEmail.toLowerCase();
    if (dbType === 'supabase') {
        const { data: existingUsers, error: lookupError } = await supabaseClient
            .from('users')
            .select('user_id, email')
            .ilike('email', normalizedEmailLookup)
            .limit(1);

        if (lookupError) throw lookupError;
        if (existingUsers && existingUsers.length > 0) {
            throw new Error(`A user with email "${normalizedEmail}" already exists. Please use a different email or update the existing user.`);
        }

        const row = {
            full_name: fullName,
            email: normalizedEmail,
            password_hash: passwordHash,
            role_id: parseInt(roleId),
            class_number: classNumber ? parseInt(classNumber) : null,
            is_approved: isApproved,
            google_oauth_id: googleOauthId || null
        };
        let { error } = await supabaseClient.from('users').insert([row]);
        if (error && isMissingColumnErrorGeneric(error)) {
            // google_oauth_id migration not run yet on the live table - retry without it
            const { google_oauth_id, ...rowWithoutGoogleId } = row;
            ({ error } = await supabaseClient.from('users').insert([rowWithoutGoogleId]));
        }
        if (error) throw error;
        return true;
    } else {
        const sql = `SELECT user_id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`;
        const existing = queryAll(sqliteDb, sql, [normalizedEmailLookup]);
        if (existing && existing.length > 0) {
            throw new Error(`A user with email "${normalizedEmail}" already exists. Please use a different email or update the existing user.`);
        }

        const insertSql = `INSERT INTO users (role_id, full_name, email, password_hash, class_number, is_approved, google_oauth_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        return executeSQL(sqliteDb, insertSql, [roleId, fullName, normalizedEmail, passwordHash, classNumber, isApproved, googleOauthId]);
    }
}

export async function deleteUser(userId) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('users')
            .delete()
            .eq('user_id', parseInt(userId));
        if (error) throw error;
        return true;
    } else {
        const sql = `DELETE FROM users WHERE user_id = ?`;
        return executeSQL(sqliteDb, sql, [userId]);
    }
}

// 2. SUBJECTS TAB CRUD
export async function getSubjects() {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('subjects')
            .select('*')
            .order('subject_id', { ascending: true });
        if (error) throw error;
        return data;
    } else {
        const sql = `SELECT subject_id, subject_name, class_number FROM subjects`;
        return queryAll(sqliteDb, sql);
    }
}

export async function addSubject(subjectName, classNumber) {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('subjects')
            .insert([{
                subject_name: subjectName,
                class_number: parseInt(classNumber)
            }])
            .select()
            .single();
        if (error) throw error;
        return data;
    } else {
        const sql = `INSERT INTO subjects (subject_name, class_number) VALUES (?, ?)`;
        return executeSQL(sqliteDb, sql, [subjectName, classNumber]);
    }
}

export async function deleteSubject(subjectId) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('subjects')
            .delete()
            .eq('subject_id', parseInt(subjectId));
        if (error) throw error;
        return true;
    } else {
        const sql = `DELETE FROM subjects WHERE subject_id = ?`;
        return executeSQL(sqliteDb, sql, [subjectId]);
    }
}

export async function getSubjectsByClass(classNumber) {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('subjects')
            .select('*')
            .eq('class_number', parseInt(classNumber))
            .order('subject_id', { ascending: true });
        if (error) throw error;
        return data;
    } else {
        const sql = `SELECT subject_id, subject_name, class_number FROM subjects WHERE class_number = ? ORDER BY subject_id ASC`;
        return queryAll(sqliteDb, sql, [classNumber]);
    }
}

// 3. MATERIALS TAB CRUD
export async function getMaterials() {
    if (dbType === 'supabase') {
        const selectWithChapter = `
                material_id,
                title,
                duration_lessons,
                instructor_name,
                chapter_number,
                thumbnail_url,
                subjects (
                    subject_name
                ),
                content_formats (
                    format_name
                )
            `;
        let { data, error } = await fetchAllRows(() => supabaseClient
            .from('learning_materials')
            .select(selectWithChapter)
            .order('material_id', { ascending: true }));
        if (error && isMissingColumnErrorGeneric(error)) {
            // chapter_number/thumbnail_url migration not run yet - fall back without them
            ({ data, error } = await fetchAllRows(() => supabaseClient.from('learning_materials').select(`
                material_id,
                title,
                duration_lessons,
                instructor_name,
                subjects ( subject_name ),
                content_formats ( format_name )
            `).order('material_id', { ascending: true })));
        }
        if (error) throw error;
        return data.map(m => ({
            material_id: m.material_id,
            title: m.title,
            duration_lessons: m.duration_lessons,
            instructor_name: m.instructor_name,
            chapter_number: m.chapter_number ?? null,
            thumbnail_url: m.thumbnail_url ?? null,
            subject_name: m.subjects?.subject_name || 'General',
            format_name: m.content_formats?.format_name || 'Video Content'
        }));
    } else {
        const sql = `
            SELECT m.material_id, m.title, m.duration_lessons, m.instructor_name, m.chapter_number, s.subject_name, f.format_name
            FROM learning_materials m
            JOIN subjects s ON m.subject_id = s.subject_id
            JOIN content_formats f ON m.format_id = f.format_id
        `;
        return queryAll(sqliteDb, sql);
    }
}

export async function addMaterial(subjectId, formatId, title, durationLessons, instructorName, fileUrl = '/vids/math1.mp4', chapterNumber = null, thumbnailUrl = null) {
    if (dbType === 'supabase') {
        const row = {
            subject_id: parseInt(subjectId),
            format_id: parseInt(formatId),
            title: title,
            duration_lessons: durationLessons,
            instructor_name: instructorName,
            file_url: fileUrl,
            chapter_number: chapterNumber != null && chapterNumber !== '' ? parseInt(chapterNumber) : null,
            thumbnail_url: thumbnailUrl || null
        };
        let { error } = await supabaseClient.from('learning_materials').insert([row]);
        if (error && isMissingColumnErrorGeneric(error)) {
            // chapter_number/thumbnail_url migration not run yet - retry without them
            const { chapter_number, thumbnail_url, ...rowWithoutNewCols } = row;
            ({ error } = await supabaseClient.from('learning_materials').insert([rowWithoutNewCols]));
        }
        if (error) throw error;
        return true;
    } else {
        const sql = `INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url, chapter_number) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        return executeSQL(sqliteDb, sql, [subjectId, formatId, title, durationLessons, instructorName, fileUrl, chapterNumber != null && chapterNumber !== '' ? parseInt(chapterNumber) : null]);
    }
}

export async function deleteMaterial(materialId) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('learning_materials')
            .delete()
            .eq('material_id', parseInt(materialId));
        if (error) throw error;
        return true;
    } else {
        const sql = `DELETE FROM learning_materials WHERE material_id = ?`;
        return executeSQL(sqliteDb, sql, [materialId]);
    }
}

export async function getCompetitiveMaterials() {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('competitive_exam_materials')
            .select('*')
            .order('material_id', { ascending: true });
        if (error) {
            if (isMissingTableError(error)) {
                console.warn('Supabase `competitive_exam_materials` table is missing in the live database. The app is falling back to browser-local cache only. Run the migration in supabase_schema.sql or competitive_exam_schema_fix.sql to enable live cloud sync.');
                return loadLocalCompetitiveMaterials();
            }
            throw error;
        }
        return (data || []).map(m => ({
            material_id: m.material_id,
            title: m.title,
            exam_name: m.exam_name,
            duration_lessons: m.duration_lessons,
            instructor_name: m.instructor_name,
            chapter_number: m.chapter_number ?? null,
            file_url: m.file_url,
            bg_thumbnail_url: m.bg_thumbnail_url ?? null,
            format_name: m.format_name || (m.format_id === 2 ? 'Audio Book' : m.format_id === 3 ? 'Video Content' : 'E-Book')
        }));
    } else {
        const sql = `
            SELECT m.material_id, m.title, m.exam_name, m.duration_lessons, m.instructor_name, m.chapter_number, m.file_url, m.bg_thumbnail_url, f.format_name
            FROM competitive_exam_materials m
            JOIN content_formats f ON m.format_id = f.format_id
            ORDER BY m.material_id ASC
        `;
        return queryAll(sqliteDb, sql);
    }
}

// Returns true when everything was saved, or 'thumbnail-skipped' when the material
// was saved but the live database has no `bg_thumbnail_url` column yet (migration pending).
export async function addCompetitiveMaterial(examName, formatId, title, durationLessons, instructorName, fileUrl = '/vids/math1.mp4', chapterNumber = null, bgThumbnailUrl = null) {
    if (dbType === 'supabase') {
        const row = {
            exam_name: examName,
            format_id: parseInt(formatId),
            title: title,
            duration_lessons: durationLessons,
            instructor_name: instructorName,
            file_url: fileUrl,
            chapter_number: chapterNumber != null && chapterNumber !== '' ? parseInt(chapterNumber) : null,
            bg_thumbnail_url: bgThumbnailUrl || null
        };
        let { error } = await supabaseClient.from('competitive_exam_materials').insert([row]);
        let thumbnailSkipped = false;
        if (error && isMissingColumnErrorGeneric(error) && /bg_thumbnail_url/i.test(error.message || '')) {
            // bg_thumbnail_url migration not run yet - save everything else so the upload isn't lost
            const { bg_thumbnail_url, ...rowWithoutThumb } = row;
            ({ error } = await supabaseClient.from('competitive_exam_materials').insert([rowWithoutThumb]));
            thumbnailSkipped = !!bgThumbnailUrl;
        }
        if (error) {
            if (isMissingTableError(error)) {
                console.warn('Supabase `competitive_exam_materials` table is missing. Saving only to the local browser cache until the schema migration is applied in Supabase SQL Editor.');
                const list = loadLocalCompetitiveMaterials();
                const nextId = list.reduce((max, item) => Math.max(max, Number(item.material_id) || 0), 0) + 1;
                list.push({
                    material_id: nextId,
                    title,
                    exam_name: examName,
                    duration_lessons: durationLessons,
                    instructor_name: instructorName,
                    chapter_number: row.chapter_number,
                    file_url: fileUrl,
                    bg_thumbnail_url: row.bg_thumbnail_url,
                    format_name: formatId === 2 ? 'Audio Book' : formatId === 3 ? 'Video Content' : 'E-Book'
                });
                saveLocalCompetitiveMaterials(list);
                return true;
            }
            throw error;
        }
        return thumbnailSkipped ? 'thumbnail-skipped' : true;
    } else {
        const sql = `INSERT INTO competitive_exam_materials (exam_name, format_id, title, duration_lessons, instructor_name, file_url, chapter_number, bg_thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        return executeSQL(sqliteDb, sql, [examName, formatId, title, durationLessons, instructorName, fileUrl, chapterNumber != null && chapterNumber !== '' ? parseInt(chapterNumber) : null, bgThumbnailUrl || null]);
    }
}

export async function deleteCompetitiveMaterial(materialId) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('competitive_exam_materials')
            .delete()
            .eq('material_id', parseInt(materialId));
        if (error) {
            if (isMissingTableError(error)) {
                const list = loadLocalCompetitiveMaterials().filter(item => Number(item.material_id) !== Number(materialId));
                saveLocalCompetitiveMaterials(list);
                return true;
            }
            throw error;
        }
        return true;
    } else {
        const sql = `DELETE FROM competitive_exam_materials WHERE material_id = ?`;
        return executeSQL(sqliteDb, sql, [materialId]);
    }
}

export async function getMaterialsByClass(classNumber) {
    if (dbType === 'supabase') {
        const selectWithChapter = `
                material_id,
                title,
                duration_lessons,
                instructor_name,
                file_url,
                chapter_number,
                thumbnail_url,
                subjects!inner (
                    subject_name,
                    class_number
                ),
                content_formats (
                    format_name
                )
            `;
        let { data, error } = await fetchAllRows(() => supabaseClient
            .from('learning_materials')
            .select(selectWithChapter)
            .eq('subjects.class_number', parseInt(classNumber))
            .order('material_id', { ascending: true }));

        if (error && isMissingColumnErrorGeneric(error)) {
            // chapter_number/thumbnail_url migration not run yet - fall back without them
            ({ data, error } = await fetchAllRows(() => supabaseClient
                .from('learning_materials')
                .select(`
                    material_id,
                    title,
                    duration_lessons,
                    instructor_name,
                    file_url,
                    subjects!inner ( subject_name, class_number ),
                    content_formats ( format_name )
                `)
                .eq('subjects.class_number', parseInt(classNumber))
                .order('material_id', { ascending: true })));
        }

        if (error) throw error;
        return data.map(m => ({
            material_id: m.material_id,
            title: m.title,
            duration_lessons: m.duration_lessons,
            instructor_name: m.instructor_name,
            file_url: m.file_url,
            chapter_number: m.chapter_number ?? null,
            thumbnail_url: m.thumbnail_url ?? null,
            subject_name: m.subjects?.subject_name || 'General',
            format_name: m.content_formats?.format_name || 'Video Content'
        }));
    } else {
        const sql = `
            SELECT m.material_id, m.title, m.duration_lessons, m.instructor_name, m.file_url, m.chapter_number, s.subject_name, f.format_name
            FROM learning_materials m
            JOIN subjects s ON m.subject_id = s.subject_id
            JOIN content_formats f ON m.format_id = f.format_id
            WHERE s.class_number = ?
        `;
        return queryAll(sqliteDb, sql, [classNumber]);
    }
}

// --- STORAGE OPERATIONS ---
export async function uploadMaterialFile(file) {
    if (dbType === 'supabase') {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabaseClient.storage
            .from('learning_materials')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseClient.storage
            .from('learning_materials')
            .getPublicUrl(fileName);

        return publicUrl;
    }
    throw new Error("Supabase is not connected.");
}

// 4. QUIZ OPERATIONS
export async function getQuizzes() {
    if (dbType === 'supabase') {
        const rows = await fetchSupabaseQuizzesRows();
        return rows.map(mapSupabaseQuizRow);
    }

    const sql = `
        SELECT q.quiz_id, q.title, q.class_number, q.subject_id, q.chapter_name, q.chapter_number, q.subject_icon, q.questions_json, s.subject_name
        FROM quizzes q
        LEFT JOIN subjects s ON q.subject_id = s.subject_id
        ORDER BY q.quiz_id ASC
    `;
    return queryAll(sqliteDb, sql).map(row => ({
        ...row,
        questions: parseQuestionsJson(row.questions_json)
    }));
}

export async function getQuizzesByClass(classNumber) {
    if (dbType === 'supabase') {
        const rows = await fetchSupabaseQuizzesRows(classNumber);
        const requestedClass = parseInt(classNumber);
        return rows
            .map(mapSupabaseQuizRow)
            .filter(q => {
                const quizClass = Number(q.class_number);
                if (Number.isFinite(quizClass)) return quizClass === requestedClass;
                return true;
            });
    }

    const sql = `
        SELECT q.quiz_id, q.title, q.class_number, q.subject_id, q.chapter_name, q.chapter_number, q.subject_icon, q.questions_json, s.subject_name
        FROM quizzes q
        LEFT JOIN subjects s ON q.subject_id = s.subject_id
        WHERE q.class_number = ?
        ORDER BY q.quiz_id ASC
    `;
    return queryAll(sqliteDb, sql, [classNumber]).map(row => ({
        ...row,
        questions: parseQuestionsJson(row.questions_json)
    }));
}

export async function addQuiz(title, classNumber, subjectId, questions, chapterName = '', subjectIcon = '', chapterNumber = null) {
    const list = Array.isArray(questions) ? questions : [];
    const payload = JSON.stringify(list);

    if (dbType === 'supabase') {
        // Real schema has no questions_json/class_number/subject_icon columns.
        // Questions are stored as a JSON string in `description` (verified working
        // against the live table); class_number is resolved via the subjects join.
        const insertPayload = {
            subject_id: subjectId ? parseInt(subjectId) : null,
            title,
            topic_name: chapterName || null,
            chapter: chapterName || null,
            chapter_number: chapterNumber !== null && chapterNumber !== '' && !Number.isNaN(Number(chapterNumber)) ? parseInt(chapterNumber, 10) : null,
            description: payload,
            question_count: list.length,
            duration_minutes: 0,
            is_quick_practice: 0,
            is_quick_quiz: false
        };

        let data = null;
        let lastError = null;
        for (let i = 0; i < 5; i++) {
            const result = await supabaseClient
                .from('quizzes')
                .insert([insertPayload])
                .select('quiz_id')
                .single();

            if (!result.error) {
                data = result.data;
                break;
            }

            // Small safety net in case the schema drifts again in future -
            // drop any column Supabase says it doesn't recognize and retry once.
            const missing = getMissingQuizColumn(result.error);
            if (missing && missing in insertPayload) {
                delete insertPayload[missing];
                console.warn(`Supabase quizzes column '${missing}' missing; retrying quiz insert without it.`);
                lastError = result.error;
                continue;
            }

            throw result.error;
        }

        if (!data) throw lastError || new Error('Unable to save quiz due to Supabase schema mismatch.');

        cacheQuizQuestions({
            quiz_id: data.quiz_id,
            title,
            class_number: parseInt(classNumber),
            subject_id: subjectId ? parseInt(subjectId) : null
        }, list);

        return true;
    }

    const sql = `INSERT INTO quizzes (title, class_number, subject_id, chapter_name, chapter_number, subject_icon, questions_json) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    return executeSQL(sqliteDb, sql, [title, parseInt(classNumber), subjectId ? parseInt(subjectId) : null, chapterName, chapterNumber ? parseInt(chapterNumber, 10) : null, subjectIcon, payload]);
}

export async function deleteQuiz(quizId) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('quizzes')
            .delete()
            .eq('quiz_id', parseInt(quizId));
        if (error) throw error;
        return true;
    }

    const sql = `DELETE FROM quizzes WHERE quiz_id = ?`;
    return executeSQL(sqliteDb, sql, [quizId]);
}

export async function addQuizAttempt(userId, quizId, correctAnswers, totalQuestions, scorePercent) {
    if (dbType === 'supabase') {
        // Real quiz_attempts schema only has: attempt_id, student_id, quiz_id, score,
        // started_at, completed_at (no correct_answers/total_questions/score_percent).
        const { error } = await supabaseClient
            .from('quiz_attempts')
            .insert([{
                student_id: parseInt(userId),
                quiz_id: parseInt(quizId),
                score: parseInt(scorePercent),
                completed_at: new Date().toISOString()
            }]);
        if (error) throw error;
        return true;
    }

    const sql = `INSERT INTO quiz_attempts (user_id, quiz_id, correct_answers, total_questions, score_percent) VALUES (?, ?, ?, ?, ?)`;
    return executeSQL(sqliteDb, sql, [userId, quizId, correctAnswers, totalQuestions, scorePercent]);
}

export async function getQuizAttemptsByUser(userId) {
    if (dbType === 'supabase') {
        // Real quiz_attempts schema: attempt_id, student_id, quiz_id, score, started_at,
        // completed_at. There's no correct_answers/total_questions column, so those
        // are estimated from the quiz's question_count and the stored score percent.
        const result = await supabaseClient
            .from('quiz_attempts')
            .select(`
                attempt_id,
                student_id,
                quiz_id,
                score,
                started_at,
                completed_at,
                quizzes (
                    title,
                    topic_name,
                    chapter,
                    question_count,
                    subjects (subject_name)
                )
            `)
            .eq('student_id', parseInt(userId))
            .order('started_at', { ascending: false });

        if (result.error) throw result.error;
        const rows = result.data || [];

        return rows.map(a => {
            const totalQuestions = a.quizzes?.question_count || 0;
            const scorePercent = a.score ?? 0;
            const correctAnswers = totalQuestions > 0 ? Math.round((scorePercent / 100) * totalQuestions) : 0;
            return {
                attempt_id: a.attempt_id,
                quiz_id: a.quiz_id,
                correct_answers: correctAnswers,
                total_questions: totalQuestions,
                score_percent: scorePercent,
                taken_at: a.completed_at || a.started_at,
                quiz_title: a.quizzes?.title || 'Quiz',
                subject_name: a.quizzes?.subjects?.subject_name || 'General',
                chapter_name: a.quizzes?.topic_name || a.quizzes?.chapter || '',
                subject_icon: 'fa-book'
            };
        });
    }

    const sql = `
        SELECT a.attempt_id, a.user_id, a.quiz_id, a.correct_answers, a.total_questions, a.score_percent, a.taken_at,
               q.title AS quiz_title, q.chapter_name, q.subject_icon, s.subject_name
        FROM quiz_attempts a
        JOIN quizzes q ON a.quiz_id = q.quiz_id
        LEFT JOIN subjects s ON q.subject_id = s.subject_id
        WHERE a.user_id = ?
        ORDER BY a.taken_at DESC
    `;
    return queryAll(sqliteDb, sql, [userId]);
}

// Ranks every student in a class by total quiz score (sum of all their
// quiz_attempts.score values) so the profile page can show a real "#N" rank
// based on quiz participation instead of a hardcoded placeholder.
export async function getQuizLeaderboard(classNumber, options = {}) {
    // `options.since` (Date or ISO string) restricts the leaderboard to attempts
    // taken on/after that time, e.g. for a "This Week" view. Omit for all-time.
    const sinceISO = options.since ? new Date(options.since).toISOString() : null;

    if (dbType === 'supabase') {
        let query = supabaseClient
            .from('quiz_attempts')
            .select(`
                student_id,
                score,
                started_at,
                completed_at,
                quizzes!inner (
                    subjects!inner ( class_number )
                )
            `)
            .eq('quizzes.subjects.class_number', parseInt(classNumber));
        if (sinceISO) query = query.gte('completed_at', sinceISO);
        const { data, error } = await query;
        if (error) throw error;

        const totals = new Map();
        (data || []).forEach(row => {
            const sid = row.student_id;
            totals.set(sid, (totals.get(sid) || 0) + (row.score || 0));
        });

        return Array.from(totals.entries())
            .map(([student_id, xp]) => ({ student_id, xp }))
            .sort((a, b) => b.xp - a.xp);
    } else {
        const sql = `
            SELECT a.user_id AS student_id, SUM(a.score_percent) AS xp
            FROM quiz_attempts a
            JOIN quizzes q ON a.quiz_id = q.quiz_id
            LEFT JOIN subjects s ON q.subject_id = s.subject_id
            WHERE (q.class_number = ? OR s.class_number = ?)
            ${sinceISO ? 'AND a.taken_at >= ?' : ''}
            GROUP BY a.user_id
            ORDER BY xp DESC
        `;
        const params = sinceISO ? [classNumber, classNumber, sinceISO] : [classNumber, classNumber];
        return queryAll(sqliteDb, sql, params);
    }
}

// 5. NOTIFICATIONS TAB CRUD
// A live Supabase project may not yet have the `notifications` table created
// (see supabase_schema.sql for the migration to run). When the table is missing,
// gracefully fall back to a localStorage-backed cache so the admin/notification
// UI still works within the current browser instead of hard-failing.
const NOTIFICATIONS_CACHE_KEY = 'adhyayan_notifications_cache_v1';

function loadLocalNotifications() {
    try {
        const raw = localStorage.getItem(NOTIFICATIONS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function saveLocalNotifications(list) {
    try { localStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(list)); } catch (_) {}
}

const COMPETITIVE_EXAMS_CACHE_KEY = 'adhyayan_competitive_exams_cache_v1';

function loadLocalCompetitiveMaterials() {
    try {
        const raw = localStorage.getItem(COMPETITIVE_EXAMS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function saveLocalCompetitiveMaterials(list) {
    try { localStorage.setItem(COMPETITIVE_EXAMS_CACHE_KEY, JSON.stringify(list)); } catch (_) {}
}

function isMissingTableError(error) {
    if (!error) return false;
    // Postgres/PostgREST "relation does not exist" -> 42P01, or PostgREST schema-cache message.
    return error.code === '42P01' || /relation .* does not exist|schema cache/i.test(error.message || '');
}

// Detects a missing-column error (generic, any table) so callers can fall back gracefully until the
// admin runs the `alter table ... add column chapter_number` migration in supabase_schema.sql.
function isMissingColumnErrorGeneric(error) {
    if (!error) return false;
    return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|could not find .* column/i.test(error.message || '');
}

export async function getNotifications() {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('notifications')
            .select('*')
            .order('notification_id', { ascending: false });
        if (error) {
            if (isMissingTableError(error)) {
                console.warn('Supabase `notifications` table not found; using local cache. Run the migration in supabase_schema.sql to enable cloud sync.');
                return loadLocalNotifications();
            }
            throw error;
        }
        return data;
    }

    const sql = `SELECT * FROM notifications ORDER BY notification_id DESC`;
    return queryAll(sqliteDb, sql);
}

export async function addNotification(title, message) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('notifications')
            .insert([{ title, message }]);
        if (error) {
            if (isMissingTableError(error)) {
                const list = loadLocalNotifications();
                const nextId = list.reduce((max, n) => Math.max(max, Number(n.notification_id) || 0), 0) + 1;
                list.unshift({ notification_id: nextId, title, message, created_at: new Date().toISOString() });
                saveLocalNotifications(list);
                return true;
            }
            throw error;
        }
        return true;
    }

    const sql = `INSERT INTO notifications (title, message) VALUES (?, ?)`;
    return executeSQL(sqliteDb, sql, [title, message]);
}

export async function deleteNotification(notificationId) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('notifications')
            .delete()
            .eq('notification_id', parseInt(notificationId));
        if (error) {
            if (isMissingTableError(error)) {
                saveLocalNotifications(loadLocalNotifications().filter(n => Number(n.notification_id) !== Number(notificationId)));
                return true;
            }
            throw error;
        }
        return true;
    }

    const sql = `DELETE FROM notifications WHERE notification_id = ?`;
    return executeSQL(sqliteDb, sql, [notificationId]);
}

// 6. LESSON PROGRESS (powers the "Continue Learning" card)
// Stored per-device in localStorage and mirrored to the backend (see the sync
// helpers below) for logged-in users.
const PROGRESS_CACHE_KEY = 'adhyayan_progress_v1';

function loadProgressStore() {
    try {
        const raw = localStorage.getItem(PROGRESS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveProgressStore(store) {
    try { localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify(store)); } catch (_) {}
}

function toPositiveInt(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : null;
}

// Always returns a whole number in 0..100 (never NaN, negative or above 100).
export function clampPercent(value) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

// Lesson progress = (pages completed / total pages) x 100, rounded.
export function calcProgressPercent(pagesCompleted, totalPages) {
    const total = Number(totalPages);
    const done = Number(pagesCompleted);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(done)) return 0;
    return clampPercent((Math.min(Math.max(done, 0), total) / total) * 100);
}

// extra (all optional): { lastPage, totalPages, pagesCompleted, position, duration }
//   - totalPages + pagesCompleted switch the entry to page-based progress (E-Books/Notes)
//   - position + duration (seconds) drive time-based progress (Video/Audiobook); the
//     percentage is derived here so every content type shares one calculation
//   - lastPage / position are the resume points
// Every call also refreshes last_accessed_at: this ONE timestamp, shared by every
// content type, decides which item "Continue learning" shows.
export function setMaterialProgress(userId, material, percent, extra = {}) {
    if (!material || material.material_id == null) return null;
    const store = loadProgressStore();
    const key = String(userId || 'guest');
    if (!store[key]) store[key] = {};

    const existing = store[key][material.material_id];
    const now = Date.now();
    const totalPages = toPositiveInt(extra.totalPages) ?? existing?.total_pages ?? null;
    const durationSec = toPositiveInt(extra.duration) ?? existing?.duration_sec ?? null;

    let pagesCompleted = existing?.pages_completed ?? null;
    let nextPercent;
    if (totalPages != null && extra.pagesCompleted != null) {
        const reached = Math.max(Math.floor(Number(extra.pagesCompleted)) || 0, 0);
        // Never let progress go backwards when the reader flips back a page.
        pagesCompleted = Math.min(Math.max(existing?.pages_completed ?? 0, reached), totalPages);
        nextPercent = calcProgressPercent(pagesCompleted, totalPages);
    } else if (existing?.total_pages) {
        nextPercent = existing.percent; // page-tracked lessons only advance via page data
    } else {
        let safePercent = clampPercent(percent);
        if (extra.position != null && durationSec) {
            // Whole seconds, the same value that is stored/shown, so text and bar always agree.
            safePercent = Math.max(safePercent, clampPercent((Math.floor(Number(extra.position)) / durationSec) * 100));
        }
        // Never let progress go backwards from a stray/lower reading.
        nextPercent = existing ? Math.max(clampPercent(existing.percent), safePercent) : safePercent;
    }

    const lastPage = toPositiveInt(extra.lastPage) ?? existing?.last_page ?? null;
    const entry = {
        material_id: material.material_id,
        title: material.title,
        subject_name: material.subject_name,
        format_name: material.format_name,
        duration_lessons: material.duration_lessons,
        percent: nextPercent,
        pages_completed: pagesCompleted,
        total_pages: totalPages,
        last_page: lastPage != null && totalPages != null ? Math.min(lastPage, totalPages) : lastPage,
        last_position_sec: extra.position != null
            ? Math.max(0, Math.floor(Number(extra.position)) || 0)
            : (existing?.last_position_sec ?? null),
        duration_sec: durationSec,
        last_accessed_at: now,
        updated_at: now
    };
    store[key][material.material_id] = entry;
    saveProgressStore(store);
    queueProgressSync(userId, entry.material_id);
    return entry;
}

export function getMaterialProgress(userId, materialId) {
    const store = loadProgressStore();
    return store[String(userId || 'guest')]?.[materialId] || null;
}

export function getRecentMaterialProgress(userId) {
    const store = loadProgressStore();
    const entries = Object.values(store[String(userId || 'guest')] || {});
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b.updated_at - a.updated_at)[0];
}

// Returns every tracked material-progress entry for a user (not just the most
// recent one), sorted newest-first. Powers the Progress page's real
// per-subject "completed lessons" percentage and the Recent Activity feed.
export function getAllMaterialProgress(userId) {
    const store = loadProgressStore();
    const entries = Object.values(store[String(userId || 'guest')] || {});
    return entries.sort((a, b) => b.updated_at - a.updated_at);
}

// --- Backend sync for lesson progress -------------------------------------
// localStorage above is the always-available fallback. When a real user is
// logged in the same record is also written to the `student_progress` table
// (Supabase or the local SQL.js DB) so it follows the account across devices
// and survives logout/login. If that table/columns are missing on a live
// Supabase project, sync quietly disables itself for the session.
let progressBackendUnavailable = false;
// duration_sec was added after the first release; if the live table lacks it we keep
// syncing everything else instead of disabling cloud sync altogether.
let durationColumnMissing = false;
const PROGRESS_FETCH_TIMEOUT_MS = 6000;
// Media position is saved every few seconds locally, but the backend only gets a
// write at most this often per item (pause / ended / leaving the page flush at once).
const PROGRESS_MIN_SYNC_GAP_MS = 15000;
const progressSyncTimers = new Map();
const progressLastSyncAt = new Map();

function isSyncableUser(userId) {
    return userId != null && Number.isFinite(parseInt(userId, 10));
}

function progressEntryToRow(userId, entry) {
    return {
        student_id: parseInt(userId, 10),
        material_id: parseInt(entry.material_id, 10),
        completion_percentage: clampPercent(entry.percent),
        is_completed: clampPercent(entry.percent) >= 100,
        last_page: entry.last_page ?? null,
        total_pages: entry.total_pages ?? null,
        pages_completed: entry.pages_completed ?? null,
        last_position_sec: entry.last_position_sec ?? null,
        duration_sec: entry.duration_sec ?? null,
        last_accessed_at: new Date(entry.last_accessed_at || entry.updated_at || Date.now()).toISOString(),
        updated_at: new Date().toISOString()
    };
}

function progressRowToEntry(row) {
    const accessed = Date.parse(row.last_accessed_at || row.updated_at || '') || 0;
    return {
        material_id: Number(row.material_id),
        percent: clampPercent(row.completion_percentage),
        pages_completed: row.pages_completed ?? null,
        total_pages: row.total_pages ?? null,
        last_page: row.last_page ?? null,
        last_position_sec: row.last_position_sec ?? null,
        duration_sec: row.duration_sec ?? null,
        last_accessed_at: accessed,
        updated_at: accessed
    };
}

async function pushProgress(userId, entry) {
    const row = progressEntryToRow(userId, entry);
    const withoutDuration = (r) => { const { duration_sec, ...rest } = r; return rest; };

    if (dbType === 'supabase') {
        const upsert = (r) => supabaseClient
            .from('student_progress')
            .upsert([r], { onConflict: 'student_id,material_id' });

        let { error } = await upsert(durationColumnMissing ? withoutDuration(row) : row);
        if (error && !durationColumnMissing && isMissingColumnErrorGeneric(error) && /duration_sec/.test(error.message || '')) {
            durationColumnMissing = true;
            console.warn('student_progress.duration_sec column not found; "time left" will only be remembered on this device. Run: alter table public.student_progress add column if not exists duration_sec integer;');
            ({ error } = await upsert(withoutDuration(row)));
        }
        if (error) {
            if (isMissingTableError(error) || isMissingColumnErrorGeneric(error)) {
                progressBackendUnavailable = true;
                console.warn('Supabase `student_progress` table/columns not found; progress is kept on this device only. Run the migration in supabase_schema.sql to enable cloud sync.');
                return;
            }
            throw error;
        }
        return;
    }

    if (!sqliteDb) return;
    const found = queryAll(sqliteDb,
        `SELECT progress_id FROM student_progress WHERE student_id = ? AND material_id = ?`,
        [row.student_id, row.material_id]);
    const values = [
        row.completion_percentage, row.is_completed ? 1 : 0, row.last_page, row.total_pages,
        row.pages_completed, row.last_position_sec, row.duration_sec, row.last_accessed_at, row.updated_at
    ];
    if (found.length) {
        executeSQL(sqliteDb, `UPDATE student_progress SET completion_percentage = ?, is_completed = ?, last_page = ?, total_pages = ?, pages_completed = ?, last_position_sec = ?, duration_sec = ?, last_accessed_at = ?, updated_at = ? WHERE progress_id = ?`,
            [...values, found[0].progress_id]);
    } else {
        executeSQL(sqliteDb, `INSERT INTO student_progress (completion_percentage, is_completed, last_page, total_pages, pages_completed, last_position_sec, duration_sec, last_accessed_at, updated_at, student_id, material_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [...values, row.student_id, row.material_id]);
    }
}

// Debounced and rate-limited so page flips and playback ticks never flood the
// backend: the first write goes out after 1s, later ones at most every 15s.
// { immediate: true } skips the wait (used for pause, ended and leaving the page).
function queueProgressSync(userId, materialId, { immediate = false } = {}) {
    if (!isSyncableUser(userId) || progressBackendUnavailable) return;
    const timerKey = `${userId}:${materialId}`;
    clearTimeout(progressSyncTimers.get(timerKey));
    const last = progressLastSyncAt.get(timerKey) || 0;
    const wait = immediate ? 0 : Math.max(1000, last + PROGRESS_MIN_SYNC_GAP_MS - Date.now());
    progressSyncTimers.set(timerKey, setTimeout(() => {
        progressSyncTimers.delete(timerKey);
        const entry = getMaterialProgress(userId, materialId);
        if (!entry) return;
        progressLastSyncAt.set(timerKey, Date.now());
        pushProgress(userId, entry).catch(err => console.warn('Failed to sync lesson progress:', err));
    }, wait));
}

// Sends any pending progress for this user right now (one item, or all of them when
// materialId is omitted). Called when playback pauses/ends and when a lesson is left.
export function flushMaterialProgress(userId, materialId) {
    if (!isSyncableUser(userId)) return;
    const prefix = `${userId}:`;
    [...progressSyncTimers.keys()]
        .filter(k => (materialId == null ? k.startsWith(prefix) : k === `${userId}:${materialId}`))
        .forEach(k => queueProgressSync(userId, k.slice(prefix.length), { immediate: true }));
}

async function fetchProgressRows(userId) {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('student_progress')
            .select('*')
            .eq('student_id', parseInt(userId, 10));
        if (error) {
            if (isMissingTableError(error) || isMissingColumnErrorGeneric(error)) {
                progressBackendUnavailable = true;
                return [];
            }
            throw error;
        }
        return data || [];
    }
    if (!sqliteDb) return [];
    return queryAll(sqliteDb, `SELECT * FROM student_progress WHERE student_id = ?`, [parseInt(userId, 10)]);
}

// Newest-first progress for a user, merged with the backend copy (the more
// recently accessed record wins). Falls back to localStorage if the backend
// can't be reached, so it never rejects.
export async function getMaterialProgressForUser(userId) {
    if (!isSyncableUser(userId) || progressBackendUnavailable) return getAllMaterialProgress(userId);

    try {
        // A backend that never answers must not leave the UI waiting forever.
        const rows = await Promise.race([
            fetchProgressRows(userId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), PROGRESS_FETCH_TIMEOUT_MS))
        ]);
        const store = loadProgressStore();
        const key = String(userId);
        if (!store[key]) store[key] = {};
        let changed = false;
        const remoteIds = new Set();

        rows.forEach(row => {
            const remote = progressRowToEntry(row);
            remoteIds.add(remote.material_id);
            const mine = store[key][remote.material_id];
            const mineAccessed = mine ? (mine.last_accessed_at ?? mine.updated_at ?? 0) : -1;
            if (remote.last_accessed_at > mineAccessed) {
                // The newer copy wins, but a missing (null) field never erases a known local value.
                const merged = { ...(mine || {}) };
                Object.entries(remote).forEach(([field, value]) => { if (value != null) merged[field] = value; });
                store[key][remote.material_id] = merged;
                changed = true;
            } else if (remote.last_accessed_at < mineAccessed) {
                queueProgressSync(userId, remote.material_id);
            }
        });

        // Back-fill progress that only exists on this device so far.
        Object.keys(store[key]).forEach(id => {
            if (!remoteIds.has(Number(id))) queueProgressSync(userId, Number(id));
        });

        if (changed) saveProgressStore(store);
    } catch (err) {
        console.warn('Could not load lesson progress from the backend, using local copy:', err);
    }
    return getAllMaterialProgress(userId);
}

// 6b. WISHLIST (client-side; per-device saved lessons)
const WISHLIST_CACHE_KEY = 'adhyayan_wishlist_v1';

function loadWishlistStore() {
    try {
        const raw = localStorage.getItem(WISHLIST_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveWishlistStore(store) {
    try { localStorage.setItem(WISHLIST_CACHE_KEY, JSON.stringify(store)); } catch (_) {}
}

export function addToWishlist(userId, material) {
    if (!material || material.material_id == null) return;
    const store = loadWishlistStore();
    const key = String(userId || 'guest');
    // Keep the full material record (not just a few fields) so opening a
    // wishlisted item later can render the lesson page exactly like the library did.
    const existing = (store[key] || []).filter(w => Number(w.material_id) !== Number(material.material_id));

    existing.unshift({ ...material, wishlisted_at: new Date().toISOString() });

    store[key] = existing.slice(0, 200); // cap history per user
    saveWishlistStore(store);
}

export function removeFromWishlist(userId, materialId) {
    const store = loadWishlistStore();
    const key = String(userId || 'guest');
    store[key] = (store[key] || []).filter(w => Number(w.material_id) !== Number(materialId));
    saveWishlistStore(store);
}

export function getWishlist(userId) {
    const store = loadWishlistStore();
    return store[String(userId || 'guest')] || [];
}

export function isInWishlist(userId, materialId) {
    if (materialId == null) return false;
    return getWishlist(userId).some(w => Number(w.material_id) === Number(materialId));
}

// 6c. SITE CONTENT (admin-editable pages, e.g. Help & Support)
// A live Supabase project may not yet have the `site_content` table created
// (see supabase_schema.sql). When missing, gracefully fall back to a
// localStorage-backed cache so the admin editor & student page still work.
const SITE_CONTENT_CACHE_KEY = 'adhyayan_site_content_v1';

function loadLocalSiteContent() {
    try {
        const raw = localStorage.getItem(SITE_CONTENT_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveLocalSiteContent(store) {
    try { localStorage.setItem(SITE_CONTENT_CACHE_KEY, JSON.stringify(store)); } catch (_) {}
}

export async function getSiteContent(pageKey) {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('site_content')
            .select('*')
            .eq('page_key', pageKey)
            .maybeSingle();
        if (error) {
            if (isMissingTableError(error)) {
                console.warn('Supabase `site_content` table not found; using local cache. Run the migration in supabase_schema.sql to enable cloud sync.');
                return loadLocalSiteContent()[pageKey] || null;
            }
            throw error;
        }
        return data || null;
    }

    const stmt = sqliteDb.prepare("SELECT * FROM site_content WHERE page_key = ?");
    stmt.bind([pageKey]);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
}

export async function saveSiteContent(pageKey, title, content) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('site_content')
            .upsert([{ page_key: pageKey, title, content, updated_at: new Date().toISOString() }], { onConflict: 'page_key' });
        if (error) {
            if (isMissingTableError(error)) {
                const store = loadLocalSiteContent();
                store[pageKey] = { page_key: pageKey, title, content, updated_at: new Date().toISOString() };
                saveLocalSiteContent(store);
                return true;
            }
            throw error;
        }
        return true;
    }

    const sql = `INSERT INTO site_content (page_key, title, content) VALUES (?, ?, ?)
                 ON CONFLICT(page_key) DO UPDATE SET title = excluded.title, content = excluded.content`;
    return executeSQL(sqliteDb, sql, [pageKey, title, content]);
}

// 7. USER AUTH & DYNAMIC PROFILE HANDLERS
export async function getUserByEmail(email) {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', email.trim());
        if (error) throw error;
        return data.length ? data[0] : null;
    } else {
        const stmt = sqliteDb.prepare("SELECT user_id, role_id, full_name, email, password_hash, class_number, is_approved FROM users WHERE email = ?");
        stmt.bind([email.trim()]);
        let user = null;
        if (stmt.step()) {
            user = stmt.getAsObject();
        }
        stmt.free();
        return user;
    }
}

export async function updateUserPassword(userId, newPasswordHash) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('users')
            .update({ password_hash: newPasswordHash })
            .eq('user_id', parseInt(userId));
        if (error) throw error;
        return true;
    } else {
        const sql = `UPDATE users SET password_hash = ? WHERE user_id = ?`;
        return executeSQL(sqliteDb, sql, [newPasswordHash, userId]);
    }
}

export async function approveUser(userId) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('users')
            .update({ is_approved: 1 })
            .eq('user_id', parseInt(userId));
        if (error) throw error;
        return true;
    } else {
        const sql = `UPDATE users SET is_approved = 1 WHERE user_id = ?`;
        return executeSQL(sqliteDb, sql, [userId]);
    }
}

export async function updateUserClass(userId, classNumber) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('users')
            .update({ class_number: parseInt(classNumber) })
            .eq('user_id', parseInt(userId));
        if (error) throw error;
        return true;
    } else {
        const sql = `UPDATE users SET class_number = ? WHERE user_id = ?`;
        return executeSQL(sqliteDb, sql, [classNumber, userId]);
    }
}
