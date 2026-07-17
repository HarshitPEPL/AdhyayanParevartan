let localNavigateTo = null;
let localState = null;
let currentOTP = null;
let adminRecoveryEmail = '';

// Initialize credentials if not present (only set defaults once on first run)
function initCredentials() {
    if (!localStorage.getItem('admin_id')) {
        localStorage.setItem('admin_id', 'Adhydydnadmin');
    }
    if (!localStorage.getItem('admin_password')) {
        localStorage.setItem('admin_password', 'Superadmin');
    }
}

export function init(navigateTo, state) {
    localNavigateTo = navigateTo;
    localState = state;
    
    initCredentials();
    setupNavigation();
    setupLogin();
    setupRecoveryFlow();
}

// Show specific subview of admin login
function showSubview(viewId) {
    const subviews = document.querySelectorAll('.login-subview');
    subviews.forEach(view => {
        if (view.id === viewId) {
            view.style.display = 'flex';
        } else {
            view.style.display = 'none';
        }
    });
}

function setupNavigation() {
    const backBtn = document.getElementById('btn-login-back');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // If we are on forgot password or OTP screens, back button returns to signin
            const isSigninVisible = document.getElementById('view-signin').style.display !== 'none';
            if (isSigninVisible) {
                localNavigateTo('auth');
            } else {
                showSubview('view-signin');
            }
        });
    }

    // Toggle Eye Buttons for Password Inputs
    const toggleEye = (inputId, btnId) => {
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId);
        if (input && btn) {
            btn.addEventListener('click', () => {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                const eyeIcon = btn.querySelector('i');
                if (eyeIcon) {
                    eyeIcon.className = isPassword ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
                }
            });
        }
    };

    toggleEye('admin-pass-input', 'btn-toggle-login-pass');
    toggleEye('new-admin-pass', 'btn-toggle-reset-pass');
}

function setupLogin() {
    const form = document.getElementById('form-admin-login');
    const card = document.querySelector('.login-card');
    const errorMsg = document.getElementById('login-error-msg');
    const idInputEl = document.getElementById('admin-id-input');
    const passInputEl = document.getElementById('admin-pass-input');

    if (!form) return;

    // Clear error message on typing
    const hideError = () => {
        if (errorMsg) errorMsg.classList.add('hidden');
    };
    idInputEl?.addEventListener('input', hideError);
    passInputEl?.addEventListener('input', hideError);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idInput = idInputEl ? idInputEl.value.trim() : '';
        const passInput = passInputEl ? passInputEl.value : '';

        let authenticated = false;
        let adminUser = null;

        // Try Supabase first if active
        if (window.adhyayan.dbType === 'supabase') {
            try {
                // If it looks like an email, query by email, otherwise fall back to admin email
                const emailToQuery = idInput.includes('@') ? idInput : 'adhyayan@parevartan.com';
                const user = await window.adhyayan.getUserByEmail(emailToQuery);
                
                if (user && user.role_id === 1 && user.password_hash === passInput) {
                    authenticated = true;
                    adminUser = user;
                }
            } catch (err) {
                console.error("Supabase admin auth error:", err);
            }
        }

        // Fallback to localStorage check (for local SQLite / offline mode)
        if (!authenticated) {
            const storedId = localStorage.getItem("admin_id") || "Adhydydnadmin";
            const storedPass = localStorage.getItem("admin_password") || "Superadmin";

            if (idInput.toLowerCase() === storedId.toLowerCase() && passInput === storedPass) {
                authenticated = true;
                adminUser = {
                    role_id: 1,
                    full_name: "Local Administrator",
                    email: "admin@parevartan.com",
                    is_approved: 1
                };
            }
        }

        if (authenticated && adminUser) {
            // Success: clear inputs and route to admin
            form.reset();
            hideError();
            
            // Set session for admin to pass the route guard
            localState.currentUser = adminUser;
            
            localNavigateTo('admin');
        } else {
            // Shake card animation
            if (card) {
                card.classList.add('shake');
                setTimeout(() => card.classList.remove('shake'), 400);
            }

            // Display premium inline error block instead of standard browser alert popup
            if (errorMsg) {
                errorMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Invalid Admin Credentials. Access denied.';
                errorMsg.classList.remove('hidden');
            } else {
                alert("Security Alert: Invalid Admin Credentials. Access denied.");
            }

            if (passInputEl) {
                passInputEl.value = '';
                passInputEl.focus();
            }
        }
    });
}

function setupRecoveryFlow() {
    const btnForgot = document.getElementById('btn-forgot-creds');
    const formForgotEmail = document.getElementById('form-forgot-email');
    const formVerifyOtp = document.getElementById('form-verify-otp');
    const formResetCreds = document.getElementById('form-reset-creds');
    const btnBackToSignin = document.getElementById('btn-back-to-signin');
    const btnResendOtp = document.getElementById('btn-resend-otp');

    // Trigger Forgot Credentials View
    if (btnForgot) {
        btnForgot.addEventListener('click', () => {
            showSubview('view-forgot');
        });
    }

    if (btnBackToSignin) {
        btnBackToSignin.addEventListener('click', () => {
            showSubview('view-signin');
        });
    }

    // Trigger Security Code Request
    if (formForgotEmail) {
        formForgotEmail.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('recovery-email-input').value.trim();

            if (!email || !email.includes('@')) {
                alert("Validation Error: Please enter a valid registered email address.");
                return;
            }

            adminRecoveryEmail = email;
            dispatchOTP(email);
        });
    }

    // Trigger OTP Validation
    if (formVerifyOtp) {
        formVerifyOtp.addEventListener('submit', (e) => {
            e.preventDefault();
            const otpCode = document.getElementById('otp-code-input').value.trim();

            if (otpCode === currentOTP) {
                // Correct OTP
                showSubview('view-reset');
            } else {
                alert("Verification Failed: Invalid OTP code. Please enter the correct code.");
                document.getElementById('otp-code-input').value = '';
                document.getElementById('otp-code-input').focus();
            }
        });
    }

    if (btnResendOtp) {
        btnResendOtp.addEventListener('click', () => {
            const email = adminRecoveryEmail || 'admin@parevartan.com';
            dispatchOTP(email);
        });
    }

    // Trigger Reset Completion
    if (formResetCreds) {
        formResetCreds.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newId = document.getElementById('new-admin-id').value.trim();
            const newPass = document.getElementById('new-admin-pass').value;

            if (newId.length < 4 || newPass.length < 4) {
                alert("Validation Error: New credentials must be at least 4 characters.");
                return;
            }

            let updatedInSupabase = false;

            if (window.adhyayan.dbType === 'supabase') {
                try {
                    const user = await window.adhyayan.getUserByEmail(adminRecoveryEmail);
                    if (user && user.role_id === 1) {
                        await window.adhyayan.updateUserPassword(user.user_id, newPass);
                        updatedInSupabase = true;
                    }
                } catch (err) {
                    console.error("Failed to update admin password on Supabase:", err);
                }
            }

            // Always update local storage credentials as well
            localStorage.setItem("admin_id", newId);
            localStorage.setItem("admin_password", newPass);

            if (updatedInSupabase) {
                alert("Security Success: Supabase Admin password updated!");
            } else {
                alert("Security Success: Administrator credentials have been successfully updated!");
            }
            
            // Clean up and return to signin
            formResetCreds.reset();
            document.getElementById('form-admin-login').reset();
            showSubview('view-signin');
        });
    }
}

// Generate, dispatch, and display OTP Simulation
function dispatchOTP(email) {
    // Generate 6-digit random code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    currentOTP = otp;

    // Show floating premium security toast
    const toast = document.getElementById('otp-toast');
    const toastMsg = document.getElementById('otp-toast-message');
    
    if (toast && toastMsg) {
        toastMsg.innerHTML = `OTP verification code <strong>${otp}</strong> successfully dispatched to ${email}`;
        toast.classList.remove('hidden');

        // Hide after 8 seconds
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 8000);
    }

    // Open next view
    showSubview('view-otp');
    document.getElementById('otp-message-label').textContent = `We sent a security verification code to ${email}`;
    document.getElementById('otp-code-input').value = '';
    document.getElementById('otp-code-input').focus();
}
