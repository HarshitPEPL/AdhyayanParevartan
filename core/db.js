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

async function fetchSupabaseQuizzesRows(classNumber = null) {
    const requestedClass = classNumber !== null && classNumber !== undefined ? parseInt(classNumber) : null;

    let query;
    if (requestedClass !== null) {
        query = supabaseClient
            .from('quizzes')
            .select(`${QUIZ_BASE_COLUMNS}, subjects!inner(subject_name, class_number)`)
            .eq('subjects.class_number', requestedClass);
    } else {
        query = supabaseClient
            .from('quizzes')
            .select(`${QUIZ_BASE_COLUMNS}, subjects(subject_name, class_number)`);
    }

    const result = await query.order('quiz_id', { ascending: true });
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
    if (dbType === 'supabase') {
        const row = {
            full_name: fullName,
            email: email,
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
        const sql = `INSERT INTO users (role_id, full_name, email, password_hash, class_number, is_approved, google_oauth_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        return executeSQL(sqliteDb, sql, [roleId, fullName, email, passwordHash, classNumber, isApproved, googleOauthId]);
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
                subjects (
                    subject_name
                ),
                content_formats (
                    format_name
                )
            `;
        let { data, error } = await supabaseClient.from('learning_materials').select(selectWithChapter);
        if (error && isMissingColumnErrorGeneric(error)) {
            // chapter_number migration not run yet - fall back without it
            ({ data, error } = await supabaseClient.from('learning_materials').select(`
                material_id,
                title,
                duration_lessons,
                instructor_name,
                subjects ( subject_name ),
                content_formats ( format_name )
            `));
        }
        if (error) throw error;
        return data.map(m => ({
            material_id: m.material_id,
            title: m.title,
            duration_lessons: m.duration_lessons,
            instructor_name: m.instructor_name,
            chapter_number: m.chapter_number ?? null,
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

export async function addMaterial(subjectId, formatId, title, durationLessons, instructorName, fileUrl = '/vids/math1.mp4', chapterNumber = null) {
    if (dbType === 'supabase') {
        const row = {
            subject_id: parseInt(subjectId),
            format_id: parseInt(formatId),
            title: title,
            duration_lessons: durationLessons,
            instructor_name: instructorName,
            file_url: fileUrl,
            chapter_number: chapterNumber != null && chapterNumber !== '' ? parseInt(chapterNumber) : null
        };
        let { error } = await supabaseClient.from('learning_materials').insert([row]);
        if (error && isMissingColumnErrorGeneric(error)) {
            // chapter_number migration not run yet - retry without it
            const { chapter_number, ...rowWithoutChapter } = row;
            ({ error } = await supabaseClient.from('learning_materials').insert([rowWithoutChapter]));
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
            format_name: m.format_name || (m.format_id === 2 ? 'Audio Book' : m.format_id === 3 ? 'Video Content' : 'E-Book')
        }));
    } else {
        const sql = `
            SELECT m.material_id, m.title, m.exam_name, m.duration_lessons, m.instructor_name, m.chapter_number, m.file_url, f.format_name
            FROM competitive_exam_materials m
            JOIN content_formats f ON m.format_id = f.format_id
            ORDER BY m.material_id ASC
        `;
        return queryAll(sqliteDb, sql);
    }
}

export async function addCompetitiveMaterial(examName, formatId, title, durationLessons, instructorName, fileUrl = '/vids/math1.mp4', chapterNumber = null) {
    if (dbType === 'supabase') {
        const row = {
            exam_name: examName,
            format_id: parseInt(formatId),
            title: title,
            duration_lessons: durationLessons,
            instructor_name: instructorName,
            file_url: fileUrl,
            chapter_number: chapterNumber != null && chapterNumber !== '' ? parseInt(chapterNumber) : null
        };
        const { error } = await supabaseClient.from('competitive_exam_materials').insert([row]);
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
                    format_name: formatId === 2 ? 'Audio Book' : formatId === 3 ? 'Video Content' : 'E-Book'
                });
                saveLocalCompetitiveMaterials(list);
                return true;
            }
            throw error;
        }
        return true;
    } else {
        const sql = `INSERT INTO competitive_exam_materials (exam_name, format_id, title, duration_lessons, instructor_name, file_url, chapter_number) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        return executeSQL(sqliteDb, sql, [examName, formatId, title, durationLessons, instructorName, fileUrl, chapterNumber != null && chapterNumber !== '' ? parseInt(chapterNumber) : null]);
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
                subjects!inner (
                    subject_name,
                    class_number
                ),
                content_formats (
                    format_name
                )
            `;
        let { data, error } = await supabaseClient
            .from('learning_materials')
            .select(selectWithChapter)
            .eq('subjects.class_number', parseInt(classNumber));

        if (error && isMissingColumnErrorGeneric(error)) {
            // chapter_number migration not run yet - fall back without it
            ({ data, error } = await supabaseClient
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
                .eq('subjects.class_number', parseInt(classNumber)));
        }

        if (error) throw error;
        return data.map(m => ({
            material_id: m.material_id,
            title: m.title,
            duration_lessons: m.duration_lessons,
            instructor_name: m.instructor_name,
            file_url: m.file_url,
            chapter_number: m.chapter_number ?? null,
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

// 6. LOCAL LESSON PROGRESS (client-side; powers the "Continue Learning" card)
// Progress is tracked per-device via localStorage since there is no reliable
// cross-platform reading/watch-time column in the live schema yet.
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

export function setMaterialProgress(userId, material, percent) {
    if (!material || material.material_id == null) return;
    const store = loadProgressStore();
    const key = String(userId || 'guest');
    if (!store[key]) store[key] = {};

    const existing = store[key][material.material_id];
    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

    store[key][material.material_id] = {
        material_id: material.material_id,
        title: material.title,
        subject_name: material.subject_name,
        format_name: material.format_name,
        duration_lessons: material.duration_lessons,
        // Never let progress go backwards from a stray/lower reading.
        percent: existing ? Math.max(existing.percent, safePercent) : safePercent,
        updated_at: Date.now()
    };
    saveProgressStore(store);
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

// 6b. DOWNLOADED LESSONS (client-side; per-device download history)
const DOWNLOADS_CACHE_KEY = 'adhyayan_downloads_v1';

function loadDownloadsStore() {
    try {
        const raw = localStorage.getItem(DOWNLOADS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveDownloadsStore(store) {
    try { localStorage.setItem(DOWNLOADS_CACHE_KEY, JSON.stringify(store)); } catch (_) {}
}

export function recordDownload(userId, material) {
    if (!material || material.material_id == null) return;
    const store = loadDownloadsStore();
    const key = String(userId || 'guest');
    const existing = (store[key] || []).filter(d => Number(d.material_id) !== Number(material.material_id));

    existing.unshift({
        material_id: material.material_id,
        title: material.title,
        subject_name: material.subject_name,
        format_name: material.format_name,
        file_url: material.file_url,
        downloaded_at: new Date().toISOString()
    });

    store[key] = existing.slice(0, 100); // cap history per user
    saveDownloadsStore(store);
}

export function getDownloads(userId) {
    const store = loadDownloadsStore();
    return store[String(userId || 'guest')] || [];
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
