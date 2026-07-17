import { createClient } from '@supabase/supabase-js';

export let dbType = 'sqlite';
let supabaseClient = null;
let sqliteDb = null;

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

// Initialize active database backend
export async function initDatabase(sqliteInstance) {
    sqliteDb = sqliteInstance;

    // Only use credentials from env or localStorage - NEVER hardcode in source
    const url = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
        || localStorage.getItem('VITE_SUPABASE_URL');
    const key = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY
        || localStorage.getItem('VITE_SUPABASE_ANON_KEY');

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
            role_name: u.roles?.role_name || 'Student',
            class_number: u.class_number,
            is_approved: u.is_approved ? 1 : 0
        }));
    } else {
        const sql = `
            SELECT u.user_id, u.full_name, u.email, r.role_name, u.class_number, u.is_approved 
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.role_id
        `;
        return queryAll(sqliteDb, sql);
    }
}

export async function addUser(fullName, email, passwordHash, roleId, classNumber, isApproved = 0) {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('users')
            .insert([{
                full_name: fullName,
                email: email,
                password_hash: passwordHash,
                role_id: parseInt(roleId),
                class_number: classNumber ? parseInt(classNumber) : null,
                is_approved: isApproved
            }]);
        if (error) throw error;
        return true;
    } else {
        const sql = `INSERT INTO users (role_id, full_name, email, password_hash, class_number, is_approved) VALUES (?, ?, ?, ?, ?, ?)`;
        return executeSQL(sqliteDb, sql, [roleId, fullName, email, passwordHash, classNumber, isApproved]);
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
        const { error } = await supabaseClient
            .from('subjects')
            .insert([{
                subject_name: subjectName,
                class_number: parseInt(classNumber)
            }]);
        if (error) throw error;
        return true;
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
        const { data, error } = await supabaseClient
            .from('learning_materials')
            .select(`
                material_id,
                title,
                duration_lessons,
                instructor_name,
                subjects (
                    subject_name
                ),
                content_formats (
                    format_name
                )
            `);
        if (error) throw error;
        return data.map(m => ({
            material_id: m.material_id,
            title: m.title,
            duration_lessons: m.duration_lessons,
            instructor_name: m.instructor_name,
            subject_name: m.subjects?.subject_name || 'General',
            format_name: m.content_formats?.format_name || 'Video Content'
        }));
    } else {
        const sql = `
            SELECT m.material_id, m.title, m.duration_lessons, m.instructor_name, s.subject_name, f.format_name
            FROM learning_materials m
            JOIN subjects s ON m.subject_id = s.subject_id
            JOIN content_formats f ON m.format_id = f.format_id
        `;
        return queryAll(sqliteDb, sql);
    }
}

export async function addMaterial(subjectId, formatId, title, durationLessons, instructorName, fileUrl = '/vids/math1.mp4') {
    if (dbType === 'supabase') {
        const { error } = await supabaseClient
            .from('learning_materials')
            .insert([{
                subject_id: parseInt(subjectId),
                format_id: parseInt(formatId),
                title: title,
                duration_lessons: durationLessons,
                instructor_name: instructorName,
                file_url: fileUrl
            }]);
        if (error) throw error;
        return true;
    } else {
        const sql = `INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url) VALUES (?, ?, ?, ?, ?, ?)`;
        return executeSQL(sqliteDb, sql, [subjectId, formatId, title, durationLessons, instructorName, fileUrl]);
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

export async function getMaterialsByClass(classNumber) {
    if (dbType === 'supabase') {
        const { data, error } = await supabaseClient
            .from('learning_materials')
            .select(`
                material_id,
                title,
                duration_lessons,
                instructor_name,
                file_url,
                subjects!inner (
                    subject_name,
                    class_number
                ),
                content_formats (
                    format_name
                )
            `)
            .eq('subjects.class_number', parseInt(classNumber));
            
        if (error) throw error;
        return data.map(m => ({
            material_id: m.material_id,
            title: m.title,
            duration_lessons: m.duration_lessons,
            instructor_name: m.instructor_name,
            file_url: m.file_url,
            subject_name: m.subjects?.subject_name || 'General',
            format_name: m.content_formats?.format_name || 'Video Content'
        }));
    } else {
        const sql = `
            SELECT m.material_id, m.title, m.duration_lessons, m.instructor_name, m.file_url, s.subject_name, f.format_name
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

// 4. USER AUTH & DYNAMIC PROFILE HANDLERS
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
