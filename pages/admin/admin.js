// Uses window.adhyayan global (set by the bundled core/app.js after db init)

// Logic for admin
let localNavigateTo = null;
let localState = null;

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
    setupAdminSearch();

    // Initial Load of all tables asynchronously
    refreshAll();
}

async function refreshAll() {
    await renderUsers();
    await renderSubjects();
    await renderMaterials();
    await initClassAndSubjectDropdowns();
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

        tableBody.innerHTML = filtered.map(user => {
            const isApproved = user.is_approved === 1 || user.is_approved === true || user.role_name === 'Admin';
            const statusBadge = isApproved 
                ? `<span style="color: #1B8039; background: rgba(27,128,57,0.1); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-block;">Approved</span>` 
                : `<span style="color: #D97706; background: rgba(217,119,6,0.1); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-block;">Pending</span>`;
            
            const approveAction = (!isApproved && user.role_name === 'Student')
                ? `<button class="btn btn-outline" style="padding: 4px 8px; width: auto; margin-right: 4px; background-color: #1B8039; color: white; border-color: #1B8039; font-weight: 700; margin-bottom: 0;" onclick="window.approveUser(${user.user_id})">
                        <i class="fa-solid fa-check"></i> Approve
                   </button>`
                : '';

            return `
            <tr>
                <td>${user.user_id}</td>
                <td>${escapeHTML(user.full_name)}</td>
                <td>${escapeHTML(user.email)}</td>
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
    } catch (error) {
        console.error("Error rendering users:", error);
    }
}

// Expose globally so inline onclick works
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

        tableBody.innerHTML = filtered.map(sub => `
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
        
        let url = document.getElementById('material-url').value;
        const fileInput = document.getElementById('material-file');
        
        const proceedWithSubmit = async (finalUrl) => {
            try {
                await window.adhyayan.addMaterial(subjectId, formatId, title, duration, instructor, finalUrl);
                form.reset();
                if (document.getElementById('material-file')) {
                    document.getElementById('material-file').value = '';
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

async function renderMaterials() {
    const tableBody = document.getElementById('admin-materials-table');
    if (!tableBody) return;
    try {
        const materials = await window.adhyayan.getMaterials();
        cachedMaterials = materials;
        const query = (document.getElementById('materials-search') || {value:''}).value.trim().toLowerCase();
        const filtered = query ? cachedMaterials.filter(m => {
            return String(m.material_id).includes(query) || (m.title || '').toLowerCase().includes(query) || (m.subject_name || '').toLowerCase().includes(query) || (m.format_name || '').toLowerCase().includes(query);
        }) : cachedMaterials;

        tableBody.innerHTML = filtered.map(mat => `
            <tr>
                <td>${mat.material_id}</td>
                <td>${escapeHTML(mat.title)}</td>
                <td>${escapeHTML(mat.subject_name || 'Unknown')}</td>
                <td>${escapeHTML(mat.format_name || '')}</td>
                <td>
                    <button class="btn btn-outline btn-delete" style="padding: 4px 8px; width: auto;" onclick="window.deleteMaterial(${mat.material_id})">
                        <i class="fa-solid fa-trash"></i> Remove
                    </button>
                </td>
            </tr>
        `).join('');
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

let allSubjects = [];
let cachedUsers = [];
let cachedSubjects = [];
let cachedMaterials = [];

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

    if (usersInput) {
        usersInput.addEventListener('input', debounce(() => renderUsers(), 250));
        usersClear && usersClear.addEventListener('click', () => { usersInput.value = ''; renderUsers(); });
    }
    if (subjectsInput) {
        subjectsInput.addEventListener('input', debounce(() => renderSubjects(), 250));
        subjectsClear && subjectsClear.addEventListener('click', () => { subjectsInput.value = ''; renderSubjects(); });
    }
    if (materialsInput) {
        materialsInput.addEventListener('input', debounce(() => renderMaterials(), 250));
        materialsClear && materialsClear.addEventListener('click', () => { materialsInput.value = ''; renderMaterials(); });
    }
}

async function initClassAndSubjectDropdowns() {
    const classDropdown = document.getElementById('material-class');
    const subjectDropdown = document.getElementById('material-subject');
    if (!classDropdown || !subjectDropdown) return;

    try {
        allSubjects = await window.adhyayan.getSubjects();
        
        // Always show classes 1 to 12
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
