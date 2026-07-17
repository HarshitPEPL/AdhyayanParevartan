// Uses window.adhyayan global (set by the bundled core/app.js after db init)

export function init(navigateTo, state) {
    const { getUserByEmail, addUser, updateUserPassword } = window.adhyayan;
    let selectedClass = null;
    const errorEl = document.getElementById('class-error');
    
    document.querySelectorAll('.capsule').forEach(el => {
        el.addEventListener('click', (e) => {
            document.querySelectorAll('.capsule').forEach(c => {
                c.style.backgroundColor = '#FFF';
                c.style.color = '#111';
                c.style.borderColor = '#999';
            });
            e.target.style.backgroundColor = '#1B8039';
            e.target.style.color = '#FFF';
            e.target.style.borderColor = '#1B8039';
            selectedClass = e.target.dataset.class;
            if(errorEl) errorEl.style.display = 'none';
        });
    });

    const validateAndNavigate = async (route) => {
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');
        
        if (emailInput && passwordInput) {
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            
            if (!email || !password) {
                alert("Please enter both email and password.");
                return;
            }
            
            try {
                const user = await getUserByEmail(email);
                if (!user) {
                    alert("Account not found. Please sign up or contact your Admin to create your account.");
                    return;
                }
                if (user.password_hash !== password) {
                    alert("Incorrect password. Please try again.");
                    return;
                }
                
                // Security Check: Enforce admin creation/approval for student logins
                if (user.role_id === 3 && !user.is_approved) {
                    alert("Access Denied: Your account is pending administrator approval. Please contact your admin to activate your email and password.");
                    return;
                }
                
                state.currentUser = user;
                state.selectedClass = user.class_number || selectedClass || 9;
                navigateTo(route);
            } catch (e) {
                console.error("Login error:", e);
                alert("Login failed. Check connection.");
            }
        } else {
            state.selectedClass = selectedClass || 9;
            navigateTo(route);
        }
    };

    document.getElementById('btn-continue')?.addEventListener('click', () => validateAndNavigate('home'));
    document.getElementById('btn-google')?.addEventListener('click', () => {
        // Mock google login
        const cls = selectedClass || 9;
        state.currentUser = { full_name: "Google User", email: "google@user.com", class_number: cls, is_approved: 1, role_id: 3 };
        state.selectedClass = cls;
        navigateTo('home');
    });
    document.getElementById('btn-admin-login')?.addEventListener('click', () => navigateTo('admin-login'));
    document.getElementById('btn-visible-admin-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('admin-login');
    });

    const slider = document.getElementById('class-slider');
    const dots = document.querySelectorAll('.carousel-dot');
    
    if (slider && dots.length) {
        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                const scrollLeft = index * slider.clientWidth;
                slider.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            });
        });

        slider.addEventListener('scroll', () => {
            const index = Math.round(slider.scrollLeft / slider.clientWidth);
            dots.forEach((dot, i) => {
                if (i === index) dot.classList.add('active');
                else dot.classList.remove('active');
            });
        });
    }

    // --- SIGN UP FLOW ---
    const signupModal = document.getElementById('signup-modal');
    const signupOverlay = document.getElementById('signup-overlay');
    const signupClose = document.getElementById('signup-modal-close');
    const btnShowSignup = document.getElementById('btn-show-signup');
    const btnSubmitSignup = document.getElementById('btn-submit-signup');

    btnShowSignup?.addEventListener('click', (e) => {
        e.preventDefault();
        if (signupModal) signupModal.classList.remove('hidden');
    });

    const closeSignupModal = () => {
        if (signupModal) signupModal.classList.add('hidden');
    };
    
    signupClose?.addEventListener('click', closeSignupModal);
    signupOverlay?.addEventListener('click', closeSignupModal);

    btnSubmitSignup?.addEventListener('click', async () => {
        if (!selectedClass) {
            alert("Please select your class from the numbers below first!");
            closeSignupModal();
            document.querySelector('.class-setter')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;

        if (!name || !email || !password) {
            alert("Please fill out all fields.");
            return;
        }

        try {
            const existing = await getUserByEmail(email);
            if (existing) {
                alert("An account with this email already exists. Please log in.");
                return;
            }

            // Create new student user (role 3) in pending state (isApproved = 0)
            await addUser(name, email, password, 3, selectedClass, 0);
            
            alert("Registration requested successfully! Your account is created in 'Pending' status. Only after the administrator approves/creates your credentials can you log in.");
            closeSignupModal();
        } catch (e) {
            console.error("Signup error:", e);
            alert("Failed to create account. Ensure database is connected.");
        }
    });

    // --- STUDENT FORGOT PASSWORD FLOW ---
    let authOTP = null;
    let authRecoveryEmail = '';

    const modal = document.getElementById('forgot-pwd-modal');
    const btnForgotPassword = document.getElementById('btn-forgot-password');
    const modalClose = document.getElementById('forgot-modal-close');
    const modalOverlay = document.getElementById('forgot-pwd-overlay');

    const showAuthSubview = (viewId) => {
        document.querySelectorAll('.forgot-subview').forEach(view => {
            if (view.id === viewId) {
                view.style.display = 'flex';
            } else {
                view.style.display = 'none';
            }
        });
    };

    const dispatchAuthOTP = (email) => {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        authOTP = otp;

        const toast = document.getElementById('auth-otp-toast');
        const toastMsg = document.getElementById('auth-otp-toast-message');

        if (toast && toastMsg) {
            toastMsg.innerHTML = `OTP verification code <strong>${otp}</strong> successfully dispatched to ${email}`;
            toast.classList.remove('hidden');

            setTimeout(() => {
                toast.classList.add('hidden');
            }, 8000);
        }

        showAuthSubview('forgot-view-otp');
        const label = document.getElementById('forgot-otp-label');
        if (label) label.textContent = `We sent a security verification code to ${email}`;
        
        const input = document.getElementById('forgot-otp-input');
        if (input) {
            input.value = '';
            input.focus();
        }
    };

    if (btnForgotPassword) {
        btnForgotPassword.addEventListener('click', (e) => {
            e.preventDefault();
            if (modal) {
                modal.classList.remove('hidden');
                showAuthSubview('forgot-view-email');
                const emailInput = document.getElementById('forgot-email-input');
                if (emailInput) {
                    // Try to pre-fill from the login screen input
                    const loginEmail = document.getElementById('auth-email')?.value.trim();
                    emailInput.value = loginEmail || '';
                    emailInput.focus();
                }
            }
        });
    }

    const closeModal = () => {
        if (modal) modal.classList.add('hidden');
    };

    modalClose?.addEventListener('click', closeModal);
    modalOverlay?.addEventListener('click', closeModal);

    document.getElementById('btn-forgot-send-otp')?.addEventListener('click', () => {
        const emailInput = document.getElementById('forgot-email-input');
        const email = emailInput ? emailInput.value.trim() : '';

        if (!email || !email.includes('@')) {
            alert("Validation Error: Please enter a valid registered email address.");
            return;
        }

        authRecoveryEmail = email;
        dispatchAuthOTP(email);
    });

    document.getElementById('btn-forgot-resend-otp')?.addEventListener('click', () => {
        if (authRecoveryEmail) {
            dispatchAuthOTP(authRecoveryEmail);
        }
    });

    document.getElementById('btn-forgot-verify-otp')?.addEventListener('click', () => {
        const otpInput = document.getElementById('forgot-otp-input');
        const enteredOTP = otpInput ? otpInput.value.trim() : '';

        if (enteredOTP === authOTP) {
            showAuthSubview('forgot-view-reset');
            const passInput = document.getElementById('forgot-new-password');
            if (passInput) {
                passInput.value = '';
                passInput.focus();
            }
        } else {
            alert("Verification Failed: Invalid OTP code. Please enter the correct code.");
            if (otpInput) {
                otpInput.value = '';
                otpInput.focus();
            }
        }
    });

    document.getElementById('btn-forgot-save-pwd')?.addEventListener('click', async () => {
        const passInput = document.getElementById('forgot-new-password');
        const newPassword = passInput ? passInput.value : '';

        if (newPassword.length < 4) {
            alert("Validation Error: New password must be at least 4 characters.");
            return;
        }

        try {
            const user = await getUserByEmail(authRecoveryEmail);
            if (!user) {
                alert("Error: No account found with this email. Please contact your administrator to create your account.");
                closeModal();
                return;
            }

            // Block pending (unapproved) users from resetting password
            if (user.role_id === 3 && !user.is_approved) {
                alert("Access Denied: Your account is pending administrator approval. You cannot reset your password until an admin activates your account.");
                closeModal();
                return;
            }

            await updateUserPassword(user.user_id, newPassword);
            alert("Password Updated Successfully! Please log in with your new password.");
            closeModal();
            // Do NOT auto-login — user must log in manually with their new password
        } catch (e) {
            console.error("Failed to save updated password in database:", e);
            alert("Database Error: Could not save password change. Please try again.");
        }
    });

    // --- SUPABASE CONNECTION MANAGER FLOW ---
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

    // --- MIGRATION HELP MODAL ---
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