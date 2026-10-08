// Uses window.adhyayan global (set by the bundled core/app.js after db init)
import { sendEmail, isEmailConfigured, getEmailConfig, saveEmailConfig, clearEmailConfig, hasCustomEmailOverride } from '../../core/email.js';
import { isGoogleAuthConfigured, getGoogleClientId, saveGoogleClientId, clearGoogleClientId, hasCustomGoogleOverride } from '../../core/googleAuth.js';
import * as XLSX from 'xlsx';

// Logic for admin
let localNavigateTo = null;
let localState = null;

window.logoutAdmin = function logoutAdmin() {
    if (window.adhyayan?.clearSession) {
        window.adhyayan.clearSession();
    } else if (localState) {
        localState.currentUser = null;
        localState.selectedClass = null;
    }

    localStorage.removeItem('admin_id');
    localStorage.removeItem('admin_password');

    if (localNavigateTo) {
        localNavigateTo('admin-login', { replace: true });
    } else {
        window.location.href = './index.html#admin-login';
    }
};

// Custom confirmation using the application's premium modal
function showConfirm(message, callback) {
    const modal = document.getElementById('alert-modal');
    if (!modal) {
        // Fallback to native confirm if modal element isn't in DOM
        if (confirm(message)) callback();
        return;
    }
    
    document.getElementById('alert-message').textContent = message;
    document.getElementById('alert-title').textContent = "Confirm Action";
    modal.classList.remove('hidden');

    const confirmBtn = document.getElementById('alert-confirm');
    const cancelBtn = document.getElementById('alert-cancel');

    // Clone buttons to strip previous event listeners and prevent bugs
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newConfirmBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        callback();
    });

    newCancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
}

export function init(navigateTo, state) {
    localNavigateTo = navigateTo;
    localState = state;

    const isSuperAdmin = Number(localState?.currentUser?.role_id) === 1;
    document.querySelectorAll('.supabase-manager').forEach((el) => {
        el.style.display = isSuperAdmin ? 'flex' : 'none';
    });
    document.querySelectorAll('.tab-competitive').forEach((el) => {
        el.style.display = isSuperAdmin ? 'inline-flex' : 'none';
    });

    // All DB operations use window.adhyayan.* (set by bundled core/app.js after db init)

    // Show Supabase connection status banner
    const statusBar = document.getElementById('supabase-status-bar');
    if (statusBar) {
        statusBar.style.display = 'block';
        if (window.adhyayan.dbType === 'supabase') {
            statusBar.innerHTML = '🚀 <strong>Supabase Cloud Connected</strong> — Unlimited file uploads enabled. Files will be stored in Supabase Storage.';
            statusBar.style.background = 'rgba(27,128,57,0.12)';
            statusBar.style.color = '#1B8039';
            statusBar.style.border = '1px solid rgba(27,128,57,0.3)';
        } else {
            statusBar.innerHTML = '⚠️ <strong>Local Mode (SQLite)</strong> — Files are saved to local browser storage. For unlimited, permanent cloud storage, <a href="javascript:window.location.reload()" style="color:#c97000;">Configure Supabase</a>.';
            statusBar.style.background = 'rgba(255,160,0,0.1)';
            statusBar.style.color = '#c97000';
            statusBar.style.border = '1px solid rgba(255,160,0,0.3)';
        }
    }

    setupTabs();
    setupUsersCRUD();
    setupSubjectsCRUD();
    setupMaterialsCRUD();
    setupBulkMaterialUpload();
    setupCompetitiveExamCRUD();
    setupCompetitiveExamBulkUpload();
    setupQuizCRUD();
    setupNotificationsCRUD();
    setupHelpContentCRUD();
    setupAdminSearch();
    setupSupabaseManager();
    setupEmailManager();
    setupGoogleManager();
    setupMigrationHelp();

    // Initial Load of all tables asynchronously
    refreshAll();
}

async function refreshAll() {
    await renderUsers();
    await renderSubjects();
    await renderMaterials();
    await renderCompetitiveExams();
    await renderQuizzes();
    await renderNotifications();
    await initClassAndSubjectDropdowns();
    await initQuizClassAndSubjectDropdowns();
}

// --- Tab Navigation Setup ---
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const contents = document.querySelectorAll('.admin-tab-content');
            contents.forEach(c => c.style.display = 'none');

            const activeTabId = `tab-${tab.dataset.tab}`;
            const activeContent = document.getElementById(activeTabId);
            if (activeContent) {
                activeContent.style.display = 'block';
            }
        });
    });
}

// --- Users CRUD ---
function setupUsersCRUD() {
    const form = document.getElementById('form-add-user');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('user-name').value;
        const email = document.getElementById('user-email').value;
        const password = document.getElementById('user-password').value;
        const roleId = parseInt(document.getElementById('user-role').value, 10);
        const classNum = parseInt(document.getElementById('user-class').value, 10) || null;

        try {
            // Admin created users are approved automatically
            await window.adhyayan.addUser(fullName, email, password, roleId, classNum, 1);
            form.reset();
            await renderUsers();

            // Send a welcome email (best-effort; does not include the password
            // itself for security — the admin communicates that separately)
            sendEmail({
                toEmail: email,
                toName: fullName,
                subject: 'Welcome to Adhyayan Parevartan',
                message: `Hi ${fullName},\n\nAn administrator has created an account for you on Adhyayan Parevartan using this email address (${email}).\n\nYour account is already approved — you can log in now using the password provided to you by your administrator, or use "Forgot Password" on the login screen to set your own.`
            }).catch(() => {});
        } catch (error) {
            console.error("Error adding user:", error);
            alert("Database Error: " + error.message);
        }
    });
}

async function renderUsers() {
    const tableBody = document.getElementById('admin-users-table');
    if (!tableBody) return;
    try {
        const users = await window.adhyayan.getUsers();
        // cache for search/filtering
        cachedUsers = users;
        const query = (document.getElementById('users-search') || {value:''}).value.trim().toLowerCase();
        const filtered = query ? cachedUsers.filter(u => {
            return String(u.user_id).includes(query) || (u.full_name || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query) || (u.role_name || '').toLowerCase().includes(query);
        }) : cachedUsers;

        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (usersPage > totalPages) usersPage = totalPages;
        const pageItems = paginateArray(filtered, usersPage, PAGE_SIZE);

        tableBody.innerHTML = pageItems.map(user => {
            const isApproved = user.is_approved === 1 || user.is_approved === true || user.role_name === 'Admin';
            const statusBadge = isApproved 
                ? `<span style="color: #1B8039; background: rgba(27,128,57,0.1); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-block;">Approved</span>` 
                : `<span style="color: #D97706; background: rgba(217,119,6,0.1); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-block;">Pending</span>`;
            
            const approveAction = (!isApproved && user.role_name === 'Student')
                ? `<button class="btn btn-outline" style="padding: 4px 8px; width: auto; margin-right: 4px; background-color: #1B8039; color: white; border-color: #1B8039; font-weight: 700; margin-bottom: 0;" onclick="window.approveUser(${user.user_id})">
                        <i class="fa-solid fa-check"></i> Approve
                   </button>`
                : '';

            const rawPassword = user.password_hash || '';
            const passwordCell = rawPassword
                ? `<div class="password-cell" style="display:flex; align-items:center; gap:6px;">
                        <span class="password-mask" data-password="${escapeHTML(rawPassword)}">••••••••</span>
                        <button type="button" class="btn-toggle-password" title="Show/Hide password" onclick="window.togglePasswordVisibility(this)">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                   </div>`
                : `<span style="color:#999;">—</span>`;

            return `
            <tr>
                <td>${user.user_id}</td>
                <td>${escapeHTML(user.full_name)}</td>
                <td>${escapeHTML(user.email)}</td>
                <td>${passwordCell}</td>
                <td>${escapeHTML(user.role_name || '')}</td>
                <td>${user.class_number ? 'Class ' + user.class_number : 'N/A'}</td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        ${approveAction}
                        <button class="btn btn-outline btn-delete" style="padding: 4px 8px; width: auto; margin-bottom: 0;" onclick="window.deleteUser(${user.user_id})">
                            <i class="fa-solid fa-trash"></i> Remove
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');

        renderPaginationControls('users-pagination', filtered.length, usersPage, PAGE_SIZE, (p) => { usersPage = p; renderUsers(); });
    } catch (error) {
        console.error("Error rendering users:", error);
    }
}

// Expose globally so inline onclick works
window.togglePasswordVisibility = function(btn) {
    const cell = btn.previousElementSibling;
    const icon = btn.querySelector('i');
    const isHidden = cell.textContent === '••••••••';
    if (isHidden) {
        cell.textContent = cell.dataset.password;
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        cell.textContent = '••••••••';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

window.deleteUser = function(userId) {
    showConfirm("Are you sure you want to delete this user?", async () => {
        try {
            await window.adhyayan.deleteUser(userId);
            await renderUsers();
        } catch (error) {
            console.error("Error deleting user:", error);
            alert("Database Error: " + error.message);
        }
    });
};

window.approveUser = function(userId) {
    showConfirm("Are you sure you want to approve this user?", async () => {
        try {
            await window.adhyayan.approveUser(userId);
            await renderUsers();

            const approvedUser = (cachedUsers || []).find(u => u.user_id === userId);
            if (approvedUser?.email) {
                sendEmail({
                    toEmail: approvedUser.email,
                    toName: approvedUser.full_name,
                    subject: 'Your Adhyayan Parevartan Account is Approved',
                    message: `Hi ${approvedUser.full_name || ''},\n\nGood news! Your account has been approved by an administrator. You can now log in to Adhyayan Parevartan using your registered email and password.`
                }).catch(() => {});
            }
        } catch (error) {
            console.error("Error approving user:", error);
            alert("Database Error: " + error.message);
        }
    });
};

// --- Subjects CRUD ---
function setupSubjectsCRUD() {
    const form = document.getElementById('form-add-subject');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const subjectName = document.getElementById('subject-name').value;
        const classNum = parseInt(document.getElementById('subject-class').value, 10);

        try {
            await window.adhyayan.addSubject(subjectName, classNum);
            form.reset();
            await renderSubjects();
            await initClassAndSubjectDropdowns();
        } catch (error) {
            console.error("Error adding subject:", error);
            alert("Database Error: " + error.message);
        }
    });
}

async function renderSubjects() {
    const tableBody = document.getElementById('admin-subjects-table');
    if (!tableBody) return;
    try {
        const subjects = await window.adhyayan.getSubjects();
        cachedSubjects = subjects;
        const query = (document.getElementById('subjects-search') || {value:''}).value.trim().toLowerCase();
        const filtered = query ? cachedSubjects.filter(s => {
            return String(s.subject_id).includes(query) || (s.subject_name || '').toLowerCase().includes(query) || String(s.class_number).includes(query);
        }) : cachedSubjects;

        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (subjectsPage > totalPages) subjectsPage = totalPages;
        const pageItems = paginateArray(filtered, subjectsPage, PAGE_SIZE);

        tableBody.innerHTML = pageItems.map(sub => `
            <tr>
                <td>${sub.subject_id}</td>
                <td>${escapeHTML(sub.subject_name)}</td>
                <td>Class ${sub.class_number}</td>
                <td>
                    <button class="btn btn-outline btn-delete" style="padding: 4px 8px; width: auto;" onclick="window.deleteSubject(${sub.subject_id})">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `).join('');

        renderPaginationControls('subjects-pagination', filtered.length, subjectsPage, PAGE_SIZE, (p) => { subjectsPage = p; renderSubjects(); });
    } catch (error) {
        console.error("Error rendering subjects:", error);
    }
}

window.deleteSubject = function(subjectId) {
    showConfirm("Are you sure you want to delete this subject? This will cascade delete related learning materials.", async () => {
        try {
            await window.adhyayan.deleteSubject(subjectId);
            await renderSubjects();
            await renderMaterials();
            await initClassAndSubjectDropdowns();
        } catch (error) {
            console.error("Error deleting subject:", error);
            alert("Database Error: " + error.message);
        }
    });
};

// --- Materials CRUD ---
function setupMaterialsCRUD() {
    const form = document.getElementById('form-add-material');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('material-title').value;
        const subjectId = parseInt(document.getElementById('material-subject').value, 10);
        const formatId = parseInt(document.getElementById('material-format').value, 10);
        const instructor = document.getElementById('material-instructor').value;
        const duration = document.getElementById('material-duration').value;
        const chapterNumber = document.getElementById('material-chapter-number').value;
        
        let url = convertGoogleDriveLink(document.getElementById('material-url').value);
        const fileInput = document.getElementById('material-file');

        // Resolves the cover-image URL from either the file picker (uploaded to
        // Supabase Storage, or read as base64 for the local sqlite fallback) or
        // the manual "Thumbnail Image URL" text field. Returns null if neither is set.
        const resolveThumbnailUrl = async () => {
            const thumbFileInput = document.getElementById('material-thumbnail');
            const thumbFile = thumbFileInput && thumbFileInput.files.length > 0 ? thumbFileInput.files[0] : null;

            if (thumbFile) {
                if (window.adhyayan.dbType === 'supabase') {
                    return await window.adhyayan.uploadMaterialFile(thumbFile);
                }
                return await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => { alert('Error reading thumbnail image.'); resolve(null); };
                    reader.readAsDataURL(thumbFile);
                });
            }

            const manualThumbUrl = (document.getElementById('material-thumbnail-url')?.value || '').trim();
            return manualThumbUrl ? convertGoogleDriveLink(manualThumbUrl) : null;
        };

        const proceedWithSubmit = async (finalUrl) => {
            try {
                const thumbnailUrl = await resolveThumbnailUrl();
                await window.adhyayan.addMaterial(subjectId, formatId, title, duration, instructor, finalUrl, chapterNumber, thumbnailUrl);
                form.reset();
                if (document.getElementById('material-file')) {
                    document.getElementById('material-file').value = '';
                }
                if (document.getElementById('material-thumbnail')) {
                    document.getElementById('material-thumbnail').value = '';
                }
                await renderMaterials();
            } catch (error) {
                console.error("Error adding material:", error);
                alert("Database Error: " + error.message);
            }
        };
        
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            
            if (window.adhyayan.dbType === 'supabase') {
                const btnSubmit = document.getElementById('btn-add-material');
                const origText = btnSubmit.innerText;
                btnSubmit.innerText = 'Uploading to Cloud...';
                btnSubmit.disabled = true;

                try {
                    const cloudUrl = await window.adhyayan.uploadMaterialFile(file);
                    btnSubmit.innerText = origText;
                    btnSubmit.disabled = false;
                    proceedWithSubmit(cloudUrl);
                } catch (e) {
                    btnSubmit.innerText = origText;
                    btnSubmit.disabled = false;
                    alert("Supabase Upload Failed: " + e.message);
                }
            } else {
                const maxBase64Size = 50 * 1024 * 1024; // 50MB limit 
                
                if (file.size > maxBase64Size) {
                    alert("Notice: This file exceeds the 50MB maximum size limit.");
                    if (file.type.startsWith('video/')) {
                        url = 'https://www.w3schools.com/html/mov_bbb.mp4';
                    } else if (file.type.includes('pdf')) {
                        url = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
                    } else {
                        url = '/boot_video.mp4';
                    }
                    proceedWithSubmit(url);
                } else {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        proceedWithSubmit(e.target.result); // Base64 data URL
                    };
                    reader.onerror = () => {
                        alert("Error reading file.");
                    };
                    reader.readAsDataURL(file);
                }
            }
        } else if (!url) {
            // Default fallback
            url = 'https://www.w3schools.com/html/mov_bbb.mp4';
            proceedWithSubmit(url);
        } else {
            proceedWithSubmit(url);
        }
    });
}

// --- Bulk Materials Upload (Excel) ---

// Maps human-readable format names in the spreadsheet to the fixed format_id
// values used by the "Publish New Material" form's dropdown (1/2/3).
function resolveFormatId(formatText) {
    const normalized = (formatText || '').toString().trim().toLowerCase();
    if (!normalized) return null; // caller decides how to handle a missing/unrecognized column
    if (normalized.includes('audio') || normalized.includes('mp3') || normalized.includes('podcast')) return 2;
    if (normalized.includes('video') || normalized.includes('mp4') || normalized.includes('youtube')) return 3;
    if (normalized.includes('book') || normalized.includes('pdf') || normalized.includes('ebook') || normalized.includes('e-book') || normalized.includes('text') || normalized.includes('note')) return 1;
    return 1; // Unrecognized value text — fall back to E-Book
}

// Extracts a Google Drive file ID from any common share-link format and
// returns the in-app "preview" URL the lesson viewer already knows how to
// embed. Non-Drive URLs are passed through unchanged.
function convertGoogleDriveLink(url) {
    const raw = (url || '').toString().trim();
    if (!raw || !raw.includes('drive.google.com')) return raw;

    const idMatch = raw.match(/\/d\/([a-zA-Z0-9_-]+)/) || raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (!idMatch) return raw;

    return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
}

// Turns a Drive share link into a directly embeddable image URL so the
// thumbnail renders in <img>; other URLs are passed through unchanged.
function convertThumbnailLink(url) {
    const raw = (url || '').toString().trim();
    if (!raw || !raw.includes('drive.google.com')) return raw;
    const idMatch = raw.match(/\/d\/([a-zA-Z0-9_-]+)/) || raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return idMatch ? `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w600` : raw;
}

function setupBulkMaterialUpload() {
    const btnDownloadTemplate = document.getElementById('btn-download-material-template');
    const fileInput = document.getElementById('bulk-material-file');
    const btnUpload = document.getElementById('btn-bulk-upload-materials');
    const statusEl = document.getElementById('bulk-material-status');
    if (!btnUpload || !fileInput) return;

    const showStatus = (html, kind) => {
        if (!statusEl) return;
        statusEl.style.display = 'block';
        statusEl.innerHTML = html;
        if (kind === 'error') {
            statusEl.style.background = '#FEF2F2';
            statusEl.style.color = '#DC2626';
            statusEl.style.border = '1px solid #FCA5A5';
        } else if (kind === 'success') {
            statusEl.style.background = 'rgba(27,128,57,0.1)';
            statusEl.style.color = '#1B8039';
            statusEl.style.border = '1px solid rgba(27,128,57,0.3)';
        } else {
            statusEl.style.background = '#F3F4F6';
            statusEl.style.color = '#4B5563';
            statusEl.style.border = '1px solid #E5E7EB';
        }
    };

    btnDownloadTemplate?.addEventListener('click', () => {
        const headers = ['Title', 'Class', 'Subject', 'Format', 'Instructor', 'Duration', 'Chapter', 'File URL', 'Thumbnail URL'];
        const sampleRow = ['Accountancy Chapter 1 Notes', 11, 'Accountancy', 'E-Book', 'Mr. Sharma', '24 pages', 1, 'https://drive.google.com/file/d/FILE_ID/view?usp=sharing', 'https://drive.google.com/file/d/IMAGE_FILE_ID/view?usp=sharing'];
        const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
        worksheet['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 22) }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Materials');
        XLSX.writeFile(workbook, 'adhyayan_materials_bulk_upload_template.xlsx');
    });

    btnUpload.addEventListener('click', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
            showStatus('Please choose an Excel (.xlsx) or CSV file first.', 'error');
            return;
        }

        const origText = btnUpload.innerText;
        btnUpload.innerText = 'Reading file...';
        btnUpload.disabled = true;

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (!rows.length) {
                showStatus('The file has no data rows. Please use the template and fill at least one row.', 'error');
                return;
            }

            // Refresh subject list so Class/Subject lookups are accurate
            let subjects = await window.adhyayan.getSubjects();

            const findSubjectId = (subjectName, classNumber) => {
                const match = subjects.find(s =>
                    Number(s.class_number) === classNumber &&
                    (s.subject_name || '').trim().toLowerCase() === (subjectName || '').trim().toLowerCase()
                );
                return match ? match.subject_id : null;
            };

            // Creates the subject on the fly (and caches it locally) instead of
            // forcing the admin to pre-create every subject before bulk upload.
            const getOrCreateSubjectId = async (subjectName, classNumber) => {
                const existingId = findSubjectId(subjectName, classNumber);
                if (existingId) return existingId;
                const created = await window.adhyayan.addSubject(subjectName, classNumber);
                const newSubject = created && created.subject_id
                    ? created
                    : { subject_id: created, subject_name: subjectName, class_number: classNumber };
                subjects = [...subjects, newSubject];
                return newSubject.subject_id;
            };

            let successCount = 0;
            const errors = [];

            btnUpload.innerText = `Publishing 0/${rows.length}...`;

            // Matches column headers regardless of casing, spacing, or minor
            // wording differences (e.g. "Grade" for Class, "Link" for File URL).
            const normalizeKey = (k) => k.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const pick = (row, ...aliases) => {
                for (const key of Object.keys(row)) {
                    const nk = normalizeKey(key);
                    if (aliases.includes(nk)) {
                        const v = row[key];
                        if (v !== undefined && v !== null && v !== '') return v;
                    }
                }
                return '';
            };

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNum = i + 2; // Excel row (header is row 1)

                const title = pick(row, 'title', 'materialtitle', 'booktitle', 'name').toString().trim();
                const classNumber = parseInt(pick(row, 'class', 'classnumber', 'grade', 'std', 'standard'), 10);
                const subjectName = pick(row, 'subject', 'subjectname').toString().trim();
                const formatText = pick(row, 'format', 'type', 'booktype', 'contenttype', 'materialtype', 'mediatype', 'contentformat', 'category');
                const formatId = resolveFormatId(formatText) ?? 1; // No recognizable format column — default to E-Book
                const instructor = pick(row, 'instructor', 'teacher', 'author').toString().trim();
                const duration = pick(row, 'duration', 'pages', 'length').toString().trim();
                const chapterNumberRaw = pick(row, 'chapter', 'chapternumber', 'chapterno');
                const chapterNumber = chapterNumberRaw !== '' ? parseInt(chapterNumberRaw, 10) : null;
                const fileUrl = convertGoogleDriveLink(pick(row, 'fileurl', 'url', 'link', 'drivelink', 'gdrivelink'));
                const thumbnailUrl = convertThumbnailLink(pick(row, 'thumbnailurl', 'thumbnail', 'thumb', 'thumbnaillink', 'image', 'imageurl', 'cover', 'coverurl', 'coverimage')) || null;

                if (!title || !classNumber || !subjectName || !fileUrl) {
                    errors.push(`Row ${rowNum}: missing required Title/Class/Subject/File URL — skipped.`);
                    continue;
                }

                let subjectId;
                try {
                    subjectId = await getOrCreateSubjectId(subjectName, classNumber);
                } catch (err) {
                    errors.push(`Row ${rowNum}: could not create subject "${subjectName}" for Class ${classNumber}: ${err.message}`);
                    continue;
                }
                if (!subjectId) {
                    errors.push(`Row ${rowNum}: could not create/find subject "${subjectName}" for Class ${classNumber}.`);
                    continue;
                }

                try {
                    await window.adhyayan.addMaterial(subjectId, formatId, title, duration, instructor, fileUrl, chapterNumber, thumbnailUrl);
                    successCount++;
                } catch (err) {
                    errors.push(`Row ${rowNum} (${escapeHTML(title)}): ${err.message}`);
                }

                btnUpload.innerText = `Publishing ${i + 1}/${rows.length}...`;
            }

            await renderMaterials();
            fileInput.value = '';

            const summaryParts = [`✅ Published ${successCount} of ${rows.length} materials.`];
            if (errors.length) {
                summaryParts.push(`<br><strong>${errors.length} row(s) skipped:</strong><br>` + errors.map(escapeHTML).join('<br>'));
            }
            // Every row failing usually means the column headers don't match what we expect at all.
            if (successCount === 0 && errors.length === rows.length) {
                const detectedHeaders = Object.keys(rows[0]).join(', ') || '(none found)';
                summaryParts.push(`<br><br>⚠️ <strong>Detected columns in your file:</strong> ${escapeHTML(detectedHeaders)}` +
                    `<br>Expected columns: Title, Class, Subject, Format, Instructor, Duration, Chapter, File URL, Thumbnail URL.` +
                    `<br>Download the template above and copy your data into it, or rename your columns to match.`);
            }
            showStatus(summaryParts.join(''), errors.length ? 'error' : 'success');
        } catch (err) {
            console.error('Bulk material upload failed:', err);
            showStatus('Failed to read/process the file: ' + err.message, 'error');
        } finally {
            btnUpload.innerText = origText;
            btnUpload.disabled = false;
        }
    });
}

async function renderMaterials() {
    const tableBody = document.getElementById('admin-materials-table');
    if (!tableBody) return;
    try {
        const materials = await window.adhyayan.getMaterials();
        cachedMaterials = materials;
        const query = (document.getElementById('materials-search') || {value:''}).value.trim().toLowerCase();
        const filtered = query ? cachedMaterials.filter(m => {
            return String(m.material_id).includes(query) || (m.title || '').toLowerCase().includes(query) || (m.subject_name || '').toLowerCase().includes(query) || (m.format_name || '').toLowerCase().includes(query) || (m.chapter_number != null && `chapter ${m.chapter_number}`.includes(query));
        }) : cachedMaterials;

        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (materialsPage > totalPages) materialsPage = totalPages;
        const pageItems = paginateArray(filtered, materialsPage, PAGE_SIZE);

        tableBody.innerHTML = pageItems.map(mat => `
            <tr>
                <td>${mat.material_id}</td>
                <td>${mat.thumbnail_url ? `<img src="${escapeHTML(mat.thumbnail_url)}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px;">` : `<span style="color:#BBB;font-size:11px;">None</span>`}</td>
                <td>${escapeHTML(mat.title)}</td>
                <td>${escapeHTML(mat.subject_name || 'Unknown')}</td>
                <td>${mat.chapter_number ? 'Chapter ' + mat.chapter_number : '—'}</td>
                <td>${escapeHTML(mat.format_name || '')}</td>
                <td>
                    <button class="btn btn-outline btn-delete" style="padding: 4px 8px; width: auto;" onclick="window.deleteMaterial(${mat.material_id})">
                        <i class="fa-solid fa-trash"></i> Remove
                    </button>
                </td>
            </tr>
        `).join('');

        renderPaginationControls('materials-pagination', filtered.length, materialsPage, PAGE_SIZE, (p) => { materialsPage = p; renderMaterials(); });
    } catch (error) {
        console.error("Error rendering materials:", error);
    }
}

window.deleteMaterial = function(materialId) {
    showConfirm("Are you sure you want to delete this learning material?", async () => {
        try {
            await window.adhyayan.deleteMaterial(materialId);
            await renderMaterials();
        } catch (error) {
            console.error("Error deleting material:", error);
            alert("Database Error: " + error.message);
        }
    });
};

function resolveCompetitivePartValue(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === '') return null;
    const normalized = String(rawValue).trim().toLowerCase();
    if (!normalized || normalized === 'full' || normalized === 'full-course' || normalized === 'full course') {
        return null;
    }
    const match = normalized.match(/part\s*(\d+)/i) || normalized.match(/^(\d+)$/);
    if (!match) return null;
    const partNumber = parseInt(match[1], 10);
    return Number.isNaN(partNumber) ? null : partNumber;
}

function formatCompetitivePartLabel(chapterNumber) {
    if (chapterNumber == null || chapterNumber === '' || chapterNumber === 'null' || chapterNumber === 'undefined') {
        return 'Full Course';
    }
    const numericValue = Number(chapterNumber);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return 'Full Course';
    }
    return `Part ${numericValue}`;
}

function setupCompetitiveExamCRUD() {
    const form = document.getElementById('form-add-competitive');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('competitive-title').value.trim();
        const examName = document.getElementById('competitive-exam').value.trim();
        const formatId = parseInt(document.getElementById('competitive-format').value, 10);
        const instructor = document.getElementById('competitive-instructor').value.trim();
        const duration = document.getElementById('competitive-duration').value.trim();
        const chapterNumber = resolveCompetitivePartValue(document.getElementById('competitive-chapter-number').value);
        const fileInput = document.getElementById('competitive-file');
        let url = convertGoogleDriveLink(document.getElementById('competitive-url').value.trim());

        const proceedWithSubmit = async (finalUrl) => {
            try {
                await window.adhyayan.addCompetitiveMaterial(examName, formatId, title, duration, instructor, finalUrl, chapterNumber);
                form.reset();
                if (fileInput) fileInput.value = '';
                await renderCompetitiveExams();
            } catch (error) {
                console.error('Error adding competitive material:', error);
                alert('Database Error: ' + error.message);
            }
        };

        if (!title || !examName) {
            alert('Please enter both the material title and the competitive exam name.');
            return;
        }

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (window.adhyayan.dbType === 'supabase') {
                const btnSubmit = document.getElementById('btn-add-competitive');
                const origText = btnSubmit.innerText;
                btnSubmit.innerText = 'Uploading to Cloud...';
                btnSubmit.disabled = true;
                try {
                    const cloudUrl = await window.adhyayan.uploadMaterialFile(file);
                    btnSubmit.innerText = origText;
                    btnSubmit.disabled = false;
                    await proceedWithSubmit(cloudUrl);
                } catch (e) {
                    btnSubmit.innerText = origText;
                    btnSubmit.disabled = false;
                    alert('Supabase Upload Failed: ' + e.message);
                }
            } else {
                const reader = new FileReader();
                reader.onload = (e) => proceedWithSubmit(e.target.result);
                reader.onerror = () => alert('Error reading file.');
                reader.readAsDataURL(file);
            }
            return;
        }

        if (!url) {
            url = 'https://www.w3schools.com/html/mov_bbb.mp4';
        }
        await proceedWithSubmit(url);
    });
}

function setupCompetitiveExamBulkUpload() {
    const btnDownloadTemplate = document.getElementById('btn-download-competitive-template');
    const fileInput = document.getElementById('bulk-competitive-file');
    const btnUpload = document.getElementById('btn-bulk-upload-competitive');
    const statusEl = document.getElementById('bulk-competitive-status');
    if (!btnUpload || !fileInput) return;

    const showStatus = (html, kind) => {
        if (!statusEl) return;
        statusEl.style.display = 'block';
        statusEl.innerHTML = html;
        statusEl.style.background = kind === 'error' ? '#FEF2F2' : kind === 'success' ? 'rgba(27,128,57,0.1)' : '#F3F4F6';
        statusEl.style.color = kind === 'error' ? '#DC2626' : kind === 'success' ? '#1B8039' : '#4B5563';
        statusEl.style.border = `1px solid ${kind === 'error' ? '#FCA5A5' : kind === 'success' ? 'rgba(27,128,57,0.3)' : '#E5E7EB'}`;
    };

    btnDownloadTemplate?.addEventListener('click', () => {
        const headers = ['Exam Name', 'Title', 'Format', 'Instructor', 'Duration', 'Part', 'File URL'];
        const sampleRow = ['JEE Main', 'Aptitude Practice Set', 'Video Content', 'Mr. Sharma', '20 mins', 'Part 1', 'https://drive.google.com/file/d/FILE_ID/view?usp=sharing'];
        const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
        worksheet['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 22) }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Competitive Exams');
        XLSX.writeFile(workbook, 'competitive_exam_bulk_upload_template.xlsx');
    });

    btnUpload.addEventListener('click', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
            showStatus('Please choose an Excel (.xlsx) or CSV file first.', 'error');
            return;
        }

        const origText = btnUpload.innerText;
        btnUpload.innerText = 'Reading file...';
        btnUpload.disabled = true;

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (!rows.length) {
                showStatus('The file has no data rows. Please use the template and fill at least one row.', 'error');
                return;
            }

            const normalizeKey = (k) => k.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const pick = (row, ...aliases) => {
                for (const key of Object.keys(row)) {
                    const nk = normalizeKey(key);
                    if (aliases.includes(nk)) {
                        const v = row[key];
                        if (v !== undefined && v !== null && v !== '') return v;
                    }
                }
                return '';
            };

            let successCount = 0;
            const errors = [];
            btnUpload.innerText = `Publishing 0/${rows.length}...`;

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNum = i + 2;
                const examName = pick(row, 'examname', 'competitiveexam', 'exam').toString().trim();
                const title = pick(row, 'title', 'materialtitle', 'name').toString().trim();
                const formatText = pick(row, 'format', 'type', 'booktype', 'contenttype', 'materialtype', 'mediatype', 'contentformat', 'category');
                const formatId = resolveFormatId(formatText) ?? 1; // No recognizable format column — default to E-Book
                const instructor = pick(row, 'instructor', 'teacher', 'author').toString().trim();
                const duration = pick(row, 'duration', 'pages', 'length').toString().trim();
                const chapterNumberRaw = pick(row, 'part', 'chapter', 'chapternumber', 'chapterno');
                const chapterNumber = resolveCompetitivePartValue(chapterNumberRaw);
                const fileUrl = convertGoogleDriveLink(pick(row, 'fileurl', 'url', 'link', 'drivelink', 'gdrivelink'));

                if (!examName || !title || !fileUrl) {
                    errors.push(`Row ${rowNum}: missing required Exam Name/Title/File URL — skipped.`);
                    continue;
                }

                try {
                    await window.adhyayan.addCompetitiveMaterial(examName, formatId, title, duration, instructor, fileUrl, chapterNumber);
                    successCount++;
                } catch (err) {
                    errors.push(`Row ${rowNum} (${escapeHTML(title)}): ${err.message}`);
                }

                btnUpload.innerText = `Publishing ${i + 1}/${rows.length}...`;
            }

            await renderCompetitiveExams();
            fileInput.value = '';

            const summaryParts = [`✅ Published ${successCount} of ${rows.length} competitive materials.`];
            if (errors.length) {
                summaryParts.push(`<br><strong>${errors.length} row(s) skipped:</strong><br>` + errors.map(escapeHTML).join('<br>'));
            }
            showStatus(summaryParts.join(''), errors.length ? 'error' : 'success');
        } catch (err) {
            console.error('Bulk competitive upload failed:', err);
            showStatus('Failed to read/process the file: ' + err.message, 'error');
        } finally {
            btnUpload.innerText = origText;
            btnUpload.disabled = false;
        }
    });
}

async function renderCompetitiveExams() {
    const tableBody = document.getElementById('admin-competitive-table');
    if (!tableBody) return;
    try {
        const items = await window.adhyayan.getCompetitiveMaterials();
        cachedCompetitiveMaterials = items;
        const query = (document.getElementById('competitive-search') || { value: '' }).value.trim().toLowerCase();
        const filtered = query ? cachedCompetitiveMaterials.filter(item => {
            return String(item.material_id).includes(query) || (item.title || '').toLowerCase().includes(query) || (item.exam_name || '').toLowerCase().includes(query) || (item.format_name || '').toLowerCase().includes(query);
        }) : cachedCompetitiveMaterials;

        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (competitiveMaterialsPage > totalPages) competitiveMaterialsPage = totalPages;
        const pageItems = paginateArray(filtered, competitiveMaterialsPage, PAGE_SIZE);

        tableBody.innerHTML = pageItems.map(item => `
            <tr>
                <td>${item.material_id}</td>
                <td>${escapeHTML(item.title)}</td>
                <td>${escapeHTML(item.exam_name || 'General')}</td>
                <td>${formatCompetitivePartLabel(item.chapter_number)}</td>
                <td>${escapeHTML(item.format_name || '')}</td>
                <td>
                    <button class="btn btn-outline btn-delete" style="padding: 4px 8px; width: auto;" onclick="window.deleteCompetitiveMaterial(${item.material_id})">
                        <i class="fa-solid fa-trash"></i> Remove
                    </button>
                </td>
            </tr>
        `).join('');

        renderPaginationControls('competitive-pagination', filtered.length, competitiveMaterialsPage, PAGE_SIZE, (p) => { competitiveMaterialsPage = p; renderCompetitiveExams(); });
    } catch (error) {
        console.error('Error rendering competitive materials:', error);
    }
}

window.deleteCompetitiveMaterial = function(materialId) {
    showConfirm('Are you sure you want to delete this competitive exam material?', async () => {
        try {
            await window.adhyayan.deleteCompetitiveMaterial(materialId);
            await renderCompetitiveExams();
        } catch (error) {
            console.error('Error deleting competitive material:', error);
            alert('Database Error: ' + error.message);
        }
    });
};

let allSubjects = [];
let allQuizzes = [];
let cachedUsers = [];
let cachedSubjects = [];
let cachedMaterials = [];
let cachedCompetitiveMaterials = [];
let cachedQuizzes = [];

// --- Pagination helpers (shared by Users / Subjects / Materials / Quizzes tables) ---
const PAGE_SIZE = 10;
let usersPage = 1;
let subjectsPage = 1;
let materialsPage = 1;
let competitiveMaterialsPage = 1;
let quizzesPage = 1;

function paginateArray(arr, page, pageSize) {
    const start = (page - 1) * pageSize;
    return arr.slice(start, start + pageSize);
}

// Renders a "‹ 1 2 3 ... N ›" control into the given container and wires clicks to onChange(page)
function renderPaginationControls(containerId, totalItems, currentPage, pageSize, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);

    let html = `<button type="button" class="page-btn page-prev" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>&lsaquo;</button>`;

    if (start > 1) {
        html += `<button type="button" class="page-btn" data-page="1">1</button>`;
        if (start > 2) html += `<span class="page-ellipsis">&hellip;</span>`;
    }

    for (let p = start; p <= end; p++) {
        html += `<button type="button" class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }

    if (end < totalPages) {
        if (end < totalPages - 1) html += `<span class="page-ellipsis">&hellip;</span>`;
        html += `<button type="button" class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `<button type="button" class="page-btn page-next" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>&rsaquo;</button>`;

    container.innerHTML = html;
    container.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = parseInt(btn.dataset.page, 10);
            if (!isNaN(p) && p >= 1 && p <= totalPages && p !== currentPage) {
                onChange(p);
            }
        });
    });
}

// Debounce helper
function debounce(fn, wait) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

function setupAdminSearch() {
    const usersInput = document.getElementById('users-search');
    const usersClear = document.getElementById('users-clear-search');
    const subjectsInput = document.getElementById('subjects-search');
    const subjectsClear = document.getElementById('subjects-clear-search');
    const materialsInput = document.getElementById('materials-search');
    const materialsClear = document.getElementById('materials-clear-search');
    const competitiveInput = document.getElementById('competitive-search');
    const competitiveClear = document.getElementById('competitive-clear-search');
    const quizzesInput = document.getElementById('quizzes-search');
    const quizzesClear = document.getElementById('quizzes-clear-search');

    if (usersInput) {
        usersInput.addEventListener('input', debounce(() => { usersPage = 1; renderUsers(); }, 250));
        usersClear && usersClear.addEventListener('click', () => { usersInput.value = ''; usersPage = 1; renderUsers(); });
    }
    if (subjectsInput) {
        subjectsInput.addEventListener('input', debounce(() => { subjectsPage = 1; renderSubjects(); }, 250));
        subjectsClear && subjectsClear.addEventListener('click', () => { subjectsInput.value = ''; subjectsPage = 1; renderSubjects(); });
    }
    if (materialsInput) {
        materialsInput.addEventListener('input', debounce(() => { materialsPage = 1; renderMaterials(); }, 250));
        materialsClear && materialsClear.addEventListener('click', () => { materialsInput.value = ''; materialsPage = 1; renderMaterials(); });
    }
    if (competitiveInput) {
        competitiveInput.addEventListener('input', debounce(() => { competitiveMaterialsPage = 1; renderCompetitiveExams(); }, 250));
        competitiveClear && competitiveClear.addEventListener('click', () => { competitiveInput.value = ''; competitiveMaterialsPage = 1; renderCompetitiveExams(); });
    }
    if (quizzesInput) {
        quizzesInput.addEventListener('input', debounce(() => { quizzesPage = 1; renderQuizzes(); }, 250));
        quizzesClear && quizzesClear.addEventListener('click', () => { quizzesInput.value = ''; quizzesPage = 1; renderQuizzes(); });
    }
}

async function initClassAndSubjectDropdowns() {
    const classDropdown = document.getElementById('material-class');
    const subjectDropdown = document.getElementById('material-subject');
    if (!classDropdown || !subjectDropdown) return;

    try {
        allSubjects = await window.adhyayan.getSubjects();
        
        const allClasses = Array.from({length: 12}, (_, i) => i + 1);
        
        classDropdown.innerHTML = '<option value="" disabled selected>Select Class</option>' + 
            allClasses.map(cls => `<option value="${cls}">Class ${cls}</option>`).join('');
            
        subjectDropdown.innerHTML = '<option value="" disabled selected>Select Subject</option>';
        subjectDropdown.disabled = true;

        classDropdown.addEventListener('change', (e) => {
            const selectedClass = parseInt(e.target.value, 10);
            const filteredSubjects = allSubjects.filter(sub => sub.class_number === selectedClass);
            
            if (filteredSubjects.length === 0) {
                subjectDropdown.innerHTML = '<option value="" disabled selected>No Subjects Found (Add in Subjects Tab)</option>';
                subjectDropdown.disabled = true;
            } else {
                subjectDropdown.innerHTML = '<option value="" disabled selected>Select Subject</option>' + 
                    filteredSubjects.map(sub => `<option value="${sub.subject_id}">${escapeHTML(sub.subject_name)}</option>`).join('');
                subjectDropdown.disabled = false;
            }
        });

    } catch (error) {
        console.error("Error populating class/subjects dropdowns:", error);
    }
}

async function initQuizClassAndSubjectDropdowns() {
    const classDropdown = document.getElementById('quiz-class');
    const subjectDropdown = document.getElementById('quiz-subject');
    if (!classDropdown || !subjectDropdown) return;

    try {
        allSubjects = await window.adhyayan.getSubjects();
        const allClasses = Array.from({length: 12}, (_, i) => i + 1);

        classDropdown.innerHTML = '<option value="" disabled selected>Select Class</option>' +
            allClasses.map(cls => `<option value="${cls}">Class ${cls}</option>`).join('');

        subjectDropdown.innerHTML = '<option value="" disabled selected>Select Subject</option>';
        subjectDropdown.disabled = true;

        classDropdown.addEventListener('change', (e) => {
            const selectedClass = parseInt(e.target.value, 10);
            const filteredSubjects = allSubjects.filter(sub => sub.class_number === selectedClass);

            if (filteredSubjects.length === 0) {
                subjectDropdown.innerHTML = '<option value="" disabled selected>No Subjects Found</option>';
                subjectDropdown.disabled = true;
            } else {
                subjectDropdown.innerHTML = '<option value="" disabled selected>Select Subject</option>' +
                    filteredSubjects.map(sub => `<option value="${sub.subject_id}">${escapeHTML(sub.subject_name)}</option>`).join('');
                subjectDropdown.disabled = false;
            }
        });
    } catch (error) {
        console.error('Error populating quiz class/subject dropdowns:', error);
    }
}

// Validates the pasted quiz JSON and fills in a `type` ('mcq' default, or
// 'subjective' when there are no options) so the student quiz page knows
// whether to render answer choices or a free-text response box.
function normalizeQuizQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Questions must be a non-empty JSON array.');
    }

    return questions.map((q, idx) => {
        const rowLabel = `Question ${idx + 1}`;
        if (!q || typeof q !== 'object' || !q.question) {
            throw new Error(`${rowLabel}: missing "question" text.`);
        }

        const isSubjective = q.type === 'subjective' || !Array.isArray(q.options) || q.options.length === 0;

        if (isSubjective) {
            return {
                question: q.question,
                type: 'subjective',
                answer: q.answer || q.modelAnswer || ''
            };
        }

        if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
            throw new Error(`${rowLabel}: MCQ questions need a "correctAnswer" matching one of the options.`);
        }

        return {
            question: q.question,
            type: 'mcq',
            options: q.options,
            correctAnswer: q.correctAnswer
        };
    });
}

function setupQuizCRUD() {
    const form = document.getElementById('form-add-quiz');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('quiz-title').value;
        const classNumber = parseInt(document.getElementById('quiz-class').value, 10);
        const subjectId = parseInt(document.getElementById('quiz-subject').value, 10);
        const chapterName = document.getElementById('quiz-chapter').value;
        const chapterNumberRaw = document.getElementById('quiz-chapter-number').value;
        const chapterNumber = chapterNumberRaw ? parseInt(chapterNumberRaw, 10) : null;
        const subjectIcon = document.getElementById('quiz-icon').value;
        const questionsText = document.getElementById('quiz-questions').value;

        try {
            let questions = [];
            try {
                questions = JSON.parse(questionsText);
            } catch (_) {
                throw new Error('Please enter valid JSON for questions.');
            }

            questions = normalizeQuizQuestions(questions);

            await window.adhyayan.addQuiz(title, classNumber, subjectId, questions, chapterName, subjectIcon, chapterNumber);
            form.reset();
            await renderQuizzes();
        } catch (error) {
            console.error('Error adding quiz:', error);
            alert('Quiz Error: ' + error.message);
        }
    });
}

async function renderQuizzes() {
    const tableBody = document.getElementById('admin-quizzes-table');
    if (!tableBody) return;
    try {
        const quizzes = await window.adhyayan.getQuizzes();
        cachedQuizzes = quizzes;
        const query = (document.getElementById('quizzes-search') || { value: '' }).value.trim().toLowerCase();
        const filtered = query ? cachedQuizzes.filter(q => {
            return String(q.quiz_id).includes(query) || (q.title || '').toLowerCase().includes(query) || String(q.class_number).includes(query);
        }) : cachedQuizzes;

        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (quizzesPage > totalPages) quizzesPage = totalPages;
        const pageItems = paginateArray(filtered, quizzesPage, PAGE_SIZE);

        tableBody.innerHTML = pageItems.map(q => `
            <tr>
                <td>${q.quiz_id}</td>
                <td>${escapeHTML(q.title)}</td>
                <td>Class ${q.class_number}</td>
                <td>${escapeHTML(q.subject_name || 'General')}</td>
                <td>${escapeHTML(q.chapter_name || 'N/A')}</td>
                <td>${q.chapter_number ?? 'N/A'}</td>
                <td>${(q.questions || []).length}</td>
                <td><i class="fa-solid ${escapeHTML(q.subject_icon || 'fa-question')}" style="color:#1B8039;"></i></td>
                <td>
                    <button class="btn btn-outline btn-delete" style="padding: 4px 8px; width: auto;" onclick="window.deleteQuiz(${q.quiz_id})">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `).join('');

        renderPaginationControls('quizzes-pagination', filtered.length, quizzesPage, PAGE_SIZE, (p) => { quizzesPage = p; renderQuizzes(); });
    } catch (error) {
        console.error('Error rendering quizzes:', error);
    }
}

window.deleteQuiz = function(quizId) {
    showConfirm('Are you sure you want to delete this quiz?', async () => {
        try {
            await window.adhyayan.deleteQuiz(quizId);
            await renderQuizzes();
        } catch (error) {
            console.error('Error deleting quiz:', error);
            alert('Database Error: ' + error.message);
        }
    });
};

function setupNotificationsCRUD() {
    const form = document.getElementById('form-add-notification');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('notification-title').value.trim();
        const message = document.getElementById('notification-message').value.trim();

        try {
            await window.adhyayan.addNotification(title, message);
            form.reset();
            await renderNotifications();
        } catch (error) {
            console.error('Error adding notification:', error);
            alert('Notification Error: ' + error.message);
        }
    });
}

async function renderNotifications() {
    const tableBody = document.getElementById('admin-notifications-table');
    if (!tableBody) return;
    try {
        const notifications = await window.adhyayan.getNotifications();
        tableBody.innerHTML = (notifications || []).map(n => `
            <tr>
                <td>${n.notification_id}</td>
                <td>${escapeHTML(n.title)}</td>
                <td>${escapeHTML(n.message)}</td>
                <td>${n.created_at ? new Date(n.created_at).toLocaleString() : ''}</td>
                <td>
                    <button class="btn btn-outline btn-delete" style="padding: 4px 8px; width: auto;" onclick="window.deleteNotification(${n.notification_id})">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error rendering notifications:', error);
    }
}

window.deleteNotification = function(notificationId) {
    showConfirm('Are you sure you want to delete this notification?', async () => {
        try {
            await window.adhyayan.deleteNotification(notificationId);
            await renderNotifications();
        } catch (error) {
            console.error('Error deleting notification:', error);
            alert('Database Error: ' + error.message);
        }
    });
};

function setupHelpContentCRUD() {
    const form = document.getElementById('form-help-content');
    if (!form) return;

    const titleInput = document.getElementById('help-content-title');
    const bodyInput = document.getElementById('help-content-body');
    const status = document.getElementById('help-content-status');

    (async () => {
        try {
            const existing = await window.adhyayan.getSiteContent('help_support');
            if (existing) {
                if (titleInput) titleInput.value = existing.title || 'Help & Support';
                if (bodyInput) bodyInput.value = existing.content || '';
            } else if (titleInput) {
                titleInput.value = 'Help & Support';
            }
        } catch (error) {
            console.error('Error loading Help & Support content:', error);
        }
    })();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = titleInput.value.trim();
        const content = bodyInput.value.trim();

        try {
            await window.adhyayan.saveSiteContent('help_support', title, content);
            if (status) {
                status.textContent = 'Saved! Students will now see this updated content.';
                setTimeout(() => { if (status) status.textContent = ''; }, 4000);
            }
        } catch (error) {
            console.error('Error saving Help & Support content:', error);
            alert('Error saving content: ' + error.message);
        }
    });
}

// Utility to escape HTML to prevent XSS issues when displaying database values
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// --- OWNER-ONLY CONFIG ICONS (Database / Email / Google) ---
// Deliberately only wired up here in the Admin Control Panel (post-login) so
// students never see or can tamper with these settings.

function setupSupabaseManager() {
    const btnSupabaseManager = document.getElementById('btn-supabase-manager');
    const supabaseModal = document.getElementById('supabase-modal');
    const supabaseClose = document.getElementById('supabase-modal-close');
    const supabaseOverlay = document.getElementById('supabase-overlay');
    const statusBadge = document.getElementById('supabase-status-badge');
    const inputUrl = document.getElementById('input-supabase-url');
    const inputKey = document.getElementById('input-supabase-key');
    const btnSaveSupabase = document.getElementById('btn-save-supabase');
    const btnClearSupabase = document.getElementById('btn-clear-supabase');

    const updateStatusUI = () => {
        const currentDbType = window.adhyayan.dbType;
        if (currentDbType === 'supabase') {
            if (statusBadge) {
                statusBadge.textContent = "Status: Connected to Supabase Cloud Database! 🚀";
                statusBadge.style.background = "rgba(27,128,57,0.1)";
                statusBadge.style.color = "#1B8039";
            }
            if (btnClearSupabase) btnClearSupabase.style.display = 'block';
        } else {
            if (statusBadge) {
                statusBadge.textContent = "Status: Running locally on SQLite (Local Fallback) 📦";
                statusBadge.style.background = "#F3F4F6";
                statusBadge.style.color = "#4B5563";
            }
            if (btnClearSupabase) btnClearSupabase.style.display = 'none';
        }
    };

    btnSupabaseManager?.addEventListener('click', () => {
        if (supabaseModal) {
            supabaseModal.classList.remove('hidden');
            updateStatusUI();

            if (inputUrl) inputUrl.value = localStorage.getItem("VITE_SUPABASE_URL") || "";
            if (inputKey) inputKey.value = localStorage.getItem("VITE_SUPABASE_ANON_KEY") || "";
        }
    });

    const closeSupabaseModal = () => {
        if (supabaseModal) supabaseModal.classList.add('hidden');
    };

    supabaseClose?.addEventListener('click', closeSupabaseModal);
    supabaseOverlay?.addEventListener('click', closeSupabaseModal);

    btnSaveSupabase?.addEventListener('click', () => {
        const url = inputUrl ? inputUrl.value.trim() : "";
        const key = inputKey ? inputKey.value.trim() : "";

        if (!url || !key) {
            alert("Validation Error: Please enter both Supabase URL and Anon Key.");
            return;
        }

        localStorage.setItem("VITE_SUPABASE_URL", url);
        localStorage.setItem("VITE_SUPABASE_ANON_KEY", key);

        alert("Supabase Credentials Configured! Restoring cloud database connection...");
        closeSupabaseModal();
        window.location.reload();
    });

    btnClearSupabase?.addEventListener('click', () => {
        localStorage.removeItem("VITE_SUPABASE_URL");
        localStorage.removeItem("VITE_SUPABASE_ANON_KEY");

        alert("Supabase Credentials Disconnected! Falling back to offline SQLite...");
        closeSupabaseModal();
        window.location.reload();
    });
}

function setupEmailManager() {
    const btnEmailManager = document.getElementById('btn-email-manager');
    const emailModal = document.getElementById('email-modal');
    const emailModalClose = document.getElementById('email-modal-close');
    const emailOverlay = document.getElementById('email-overlay');
    const emailStatusBadge = document.getElementById('email-status-badge');
    const inputEmailService = document.getElementById('input-email-service');
    const inputEmailTemplate = document.getElementById('input-email-template');
    const inputEmailKey = document.getElementById('input-email-key');
    const btnSaveEmail = document.getElementById('btn-save-email');
    const btnClearEmail = document.getElementById('btn-clear-email');

    const updateEmailStatusUI = () => {
        if (hasCustomEmailOverride()) {
            if (emailStatusBadge) {
                emailStatusBadge.textContent = "Status: Real emails enabled via your custom EmailJS account 📧";
                emailStatusBadge.style.background = "rgba(27,128,57,0.1)";
                emailStatusBadge.style.color = "#1B8039";
            }
            if (btnClearEmail) btnClearEmail.style.display = 'block';
        } else if (isEmailConfigured()) {
            if (emailStatusBadge) {
                emailStatusBadge.textContent = "Status: Real emails enabled via built-in default service 📧";
                emailStatusBadge.style.background = "rgba(27,128,57,0.1)";
                emailStatusBadge.style.color = "#1B8039";
            }
            if (btnClearEmail) btnClearEmail.style.display = 'none';
        } else {
            if (emailStatusBadge) {
                emailStatusBadge.textContent = "Status: Not configured (OTP shown on-screen only)";
                emailStatusBadge.style.background = "#F3F4F6";
                emailStatusBadge.style.color = "#4B5563";
            }
            if (btnClearEmail) btnClearEmail.style.display = 'none';
        }
    };

    btnEmailManager?.addEventListener('click', () => {
        if (emailModal) {
            emailModal.classList.remove('hidden');
            updateEmailStatusUI();

            const config = getEmailConfig();
            if (inputEmailService) inputEmailService.value = config.serviceId;
            if (inputEmailTemplate) inputEmailTemplate.value = config.templateId;
            if (inputEmailKey) inputEmailKey.value = config.publicKey;
        }
    });

    const closeEmailModal = () => {
        if (emailModal) emailModal.classList.add('hidden');
    };

    emailModalClose?.addEventListener('click', closeEmailModal);
    emailOverlay?.addEventListener('click', closeEmailModal);

    btnSaveEmail?.addEventListener('click', () => {
        const serviceId = inputEmailService ? inputEmailService.value.trim() : '';
        const templateId = inputEmailTemplate ? inputEmailTemplate.value.trim() : '';
        const publicKey = inputEmailKey ? inputEmailKey.value.trim() : '';

        if (!serviceId || !templateId || !publicKey) {
            alert("Validation Error: Please enter the Service ID, Template ID, and Public Key.");
            return;
        }

        saveEmailConfig(serviceId, templateId, publicKey);
        updateEmailStatusUI();
        alert("Email Service Configured! OTP and registration emails will now be sent for real.");
        closeEmailModal();
    });

    btnClearEmail?.addEventListener('click', () => {
        clearEmailConfig();
        const config = getEmailConfig();
        if (inputEmailService) inputEmailService.value = config.serviceId;
        if (inputEmailTemplate) inputEmailTemplate.value = config.templateId;
        if (inputEmailKey) inputEmailKey.value = config.publicKey;
        updateEmailStatusUI();
        alert("Your custom EmailJS account was removed. Reverted to the built-in default email service — real emails are still enabled.");
        closeEmailModal();
    });
}

function setupGoogleManager() {
    const btnGoogleManager = document.getElementById('btn-google-manager');
    const googleModal = document.getElementById('google-modal');
    const googleModalClose = document.getElementById('google-modal-close');
    const googleOverlay = document.getElementById('google-overlay');
    const googleStatusBadge = document.getElementById('google-status-badge');
    const inputGoogleClientId = document.getElementById('input-google-client-id');
    const btnSaveGoogle = document.getElementById('btn-save-google');
    const btnClearGoogle = document.getElementById('btn-clear-google');

    const updateGoogleStatusUI = () => {
        if (hasCustomGoogleOverride()) {
            if (googleStatusBadge) {
                googleStatusBadge.textContent = "Status: Using your custom Client ID 🚀";
                googleStatusBadge.style.background = "rgba(27,128,57,0.1)";
                googleStatusBadge.style.color = "#1B8039";
            }
            if (btnClearGoogle) btnClearGoogle.style.display = 'block';
        } else if (isGoogleAuthConfigured()) {
            if (googleStatusBadge) {
                googleStatusBadge.textContent = "Status: Using built-in default Client ID 🚀";
                googleStatusBadge.style.background = "rgba(27,128,57,0.1)";
                googleStatusBadge.style.color = "#1B8039";
            }
            if (btnClearGoogle) btnClearGoogle.style.display = 'none';
        } else {
            if (googleStatusBadge) {
                googleStatusBadge.textContent = "Status: Not configured (using placeholder name)";
                googleStatusBadge.style.background = "#F3F4F6";
                googleStatusBadge.style.color = "#4B5563";
            }
            if (btnClearGoogle) btnClearGoogle.style.display = 'none';
        }
    };

    btnGoogleManager?.addEventListener('click', () => {
        if (googleModal) {
            googleModal.classList.remove('hidden');
            updateGoogleStatusUI();
            if (inputGoogleClientId) inputGoogleClientId.value = getGoogleClientId();
        }
    });

    const closeGoogleModal = () => {
        if (googleModal) googleModal.classList.add('hidden');
    };

    googleModalClose?.addEventListener('click', closeGoogleModal);
    googleOverlay?.addEventListener('click', closeGoogleModal);

    btnSaveGoogle?.addEventListener('click', () => {
        const clientId = inputGoogleClientId ? inputGoogleClientId.value.trim() : '';

        if (!clientId) {
            alert("Validation Error: Please enter your Google OAuth Client ID.");
            return;
        }

        saveGoogleClientId(clientId);
        updateGoogleStatusUI();
        alert("Google Sign-In Configured! Users' real Google name and email will now be used on login.");
        closeGoogleModal();
    });

    btnClearGoogle?.addEventListener('click', () => {
        clearGoogleClientId();
        if (inputGoogleClientId) inputGoogleClientId.value = getGoogleClientId();
        updateGoogleStatusUI();
        alert("Your custom Client ID was removed. Reverted to the built-in default Client ID — Google Sign-In is still enabled.");
        closeGoogleModal();
    });
}

function setupMigrationHelp() {
    const migrationHelpModal = document.getElementById('migration-help-modal');
    const migrationHelpClose = document.getElementById('migration-help-close');
    const migrationHelpOverlay = document.getElementById('migration-help-overlay');
    const btnMigrationHelp = document.getElementById('btn-migration-help');
    const btnCopySQL = document.getElementById('btn-copy-sql');
    const sqlSchemaEl = document.getElementById('sql-schema');

    const closeMigrationModal = () => {
        if (migrationHelpModal) migrationHelpModal.classList.add('hidden');
    };

    btnMigrationHelp?.addEventListener('click', () => {
        if (migrationHelpModal) migrationHelpModal.classList.remove('hidden');
    });

    migrationHelpClose?.addEventListener('click', closeMigrationModal);
    migrationHelpOverlay?.addEventListener('click', closeMigrationModal);

    btnCopySQL?.addEventListener('click', () => {
        const sqlText = sqlSchemaEl?.innerText || '';
        if (sqlText) {
            navigator.clipboard.writeText(sqlText).then(() => {
                const origText = btnCopySQL.innerText;
                btnCopySQL.innerText = '✓ Copied!';
                setTimeout(() => {
                    btnCopySQL.innerText = origText;
                }, 2000);
            }).catch(err => {
                alert("Failed to copy. Please try again.");
            });
        }
    });
}
