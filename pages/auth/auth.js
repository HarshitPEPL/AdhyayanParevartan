// Uses window.adhyayan global (set by the bundled core/app.js after db init)
import CryptoJS from 'crypto-js';
import { sendEmail } from '../../core/email.js';
import { signInWithGoogle, isGoogleAuthConfigured } from '../../core/googleAuth.js';

// Helper function to check database connection status
function getConnectionStatus() {
    const dbType = window.adhyayan?.dbType;
    if (dbType === 'supabase') {
        return '☁️ Connected to Supabase (Cloud Database)';
    } else if (dbType === 'sqlite') {
        return '💾 Using Local SQLite (Offline Mode)';
    } else {
        return '❓ Database type unknown';
    }
}

const ROLE_IDS = { admin: 1, teacher: 2, student: 3, parent: 4 };
const ROLE_LABELS = { 1: 'Admin', 2: 'Teacher', 3: 'Student', 4: 'Parent' };

const MESSAGES = {
    emptyFields: 'Please enter your email and password.',
    wrongCredentials: 'Wrong email or password. Please try again.',
    network: "Couldn't connect. Check your internet and try again.",
    google: 'Google sign-in failed. Please try again.',
    terms: 'Please accept the Terms and Conditions',
    pendingApproval: 'Your account is waiting for admin approval. Please try again once your admin has activated it.'
};

const EYE_OPEN = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>';
const EYE_CLOSED = '<path d="M3 3l18 18"></path><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>';

// A valid saved class (1–12) or null.
export function getSavedClass(user) {
    const n = Number(user?.class_number);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

// Where a freshly signed-in user lands. Students go straight to their saved class;
// a student without one picks it once on the "Choose your class" screen.
// Teachers and parents keep landing on Home, as before.
export function completeLogin(user, state, navigateTo) {
    state.currentUser = user;
    const savedClass = getSavedClass(user);
    state.selectedClass = savedClass;
    window.adhyayan?.saveSession?.();
    const needsClass = Number(user.role_id) === ROLE_IDS.student && !savedClass;
    navigateTo(needsClass ? 'choose-class' : 'home', { replace: true });
}

export function init(navigateTo, state) {
    const { getUserByEmail, addUser, updateUserPassword } = window.adhyayan;
    const roleSelect = document.getElementById('auth-role');
    const termsCheckbox = document.getElementById('auth-terms');
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const btnContinue = document.getElementById('btn-continue');
    const btnGoogle = document.getElementById('btn-google');

    // Log connection status
    console.log(`[AUTH] ${getConnectionStatus()}`);

    document.querySelectorAll('a[href="#"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));

    // --- ERROR BOX ---
    // Every login failure is shown here; nothing fails silently.
    function showAuthError(message) {
        const text = document.getElementById('auth-error-text');
        const box = document.getElementById('auth-error');
        if (!text || !box) return;
        text.textContent = message;
        box.classList.add('show');
    }
    function hideAuthError() {
        document.getElementById('auth-error')?.classList.remove('show');
    }
    [emailInput, passwordInput, roleSelect].forEach(el => el?.addEventListener('input', hideAuthError));
    roleSelect?.addEventListener('change', hideAuthError);
    termsCheckbox?.addEventListener('change', hideAuthError);

    // --- PASSWORD HASHING UTILITY (SHA-256 using crypto-js) ---
    // Uses crypto-js for consistent SHA-256 hashing across browser and Node.js
    async function hashPassword(password) {
        try {
            // Use crypto-js for consistent SHA-256 across all environments
            const hash = CryptoJS.SHA256(password).toString();
            console.log('[AUTH] Password hashed using crypto-js SHA-256');
            return hash;
        } catch (e) {
            console.error('[AUTH] Hash failed:', e.message);
            throw e;
        }
    }

    // --- SECURE OTP GENERATION ---
    function generateSecureOTP() {
        const array = new Uint8Array(3);
        window.crypto.getRandomValues(array);
        let otp = (array[0] << 16) | (array[1] << 8) | array[2];
        otp = otp % 1000000; // Keep it to 6 digits
        return String(otp).padStart(6, '0');
    }

    // --- PASSWORD SHOW/HIDE TOGGLES ---
    const loginEye = document.getElementById('login-pwd-toggle');
    loginEye?.addEventListener('click', () => {
        const show = passwordInput.type === 'password';
        passwordInput.type = show ? 'text' : 'password';
        loginEye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        loginEye.style.opacity = show ? '1' : '.7';
        const icon = document.getElementById('login-eye-icon');
        if (icon) icon.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
    });

    document.querySelectorAll('.pwd-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            }
        });
    });

    const getSelectedRole = () => roleSelect?.value || 'student';

    // Admin accounts sign in through the Admin Portal; every other account signs in with
    // its own role, whatever is picked in the dropdown. Returns an error message or null.
    const checkAccountRole = (user) => {
        if (Number(user.role_id) === ROLE_IDS.admin && getSelectedRole() !== 'admin') {
            return 'This account is registered as an Admin. Please select Admin and try again.';
        }
        if (Number(user.role_id) === ROLE_IDS.student && !user.is_approved) {
            return MESSAGES.pendingApproval;
        }
        return null;
    };

    const setBusy = (busy) => {
        if (btnContinue) {
            btnContinue.disabled = busy;
            btnContinue.textContent = busy ? 'Logging in…' : 'Continue';
        }
        if (btnGoogle) {
            btnGoogle.disabled = busy;
            btnGoogle.style.opacity = busy ? '0.6' : '';
        }
    };

    // --- EMAIL / PASSWORD LOGIN ---
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAuthError();

        if (!termsCheckbox?.checked) {
            showAuthError(MESSAGES.terms);
            return;
        }

        const email = emailInput?.value.trim() || '';
        const password = passwordInput?.value || '';
        if (!email || !password) {
            showAuthError(MESSAGES.emptyFields);
            return;
        }

        setBusy(true);
        try {
            console.log(`[AUTH] Attempting login with database: ${window.adhyayan?.dbType || 'unknown'}`);

            let user;
            try {
                user = await getUserByEmail(email);
            } catch (err) {
                console.error('[AUTH] Login lookup failed:', err);
                showAuthError(MESSAGES.network);
                return;
            }

            if (!user || user.password_hash !== await hashPassword(password)) {
                console.warn(`[AUTH] Wrong email or password for: ${email}`);
                showAuthError(MESSAGES.wrongCredentials);
                return;
            }

            const roleError = checkAccountRole(user);
            if (roleError) {
                showAuthError(roleError);
                return;
            }

            if (Number(user.role_id) === ROLE_IDS.admin) {
                // Admin access is restricted to the super admin portal.
                navigateTo('admin-login', { replace: true });
                return;
            }

            const selected = getSelectedRole();
            if (ROLE_IDS[selected] !== Number(user.role_id)) {
                console.info(`[AUTH] Role picked was ${selected}; signing in as ${ROLE_LABELS[user.role_id] || user.role_id}, the account's own role.`);
            }

            console.log(`[AUTH] Login successful: ${user.full_name} (ID: ${user.user_id})`);
            completeLogin(user, state, navigateTo);
        } catch (err) {
            console.error('[AUTH] Login error:', err);
            showAuthError(MESSAGES.network);
        } finally {
            setBusy(false);
        }
    });

    // --- GOOGLE SIGN-IN ---
    btnGoogle?.addEventListener('click', async () => {
        hideAuthError();
        if (!termsCheckbox?.checked) {
            showAuthError(MESSAGES.terms);
            return;
        }
        const selectedRole = getSelectedRole();
        if (selectedRole === 'admin') {
            // Admin access is restricted to the super admin portal.
            navigateTo('admin-login', { replace: true });
            return;
        }

        if (!isGoogleAuthConfigured()) {
            // No live OAuth Client ID on this origin (e.g. a LAN dev server) — fall back to
            // the placeholder mock login. The class is then picked on the next screen.
            completeLogin({ full_name: 'Google User', email: 'google@user.com', class_number: null, is_approved: 1, role_id: ROLE_IDS[selectedRole] }, state, navigateTo);
            return;
        }

        setBusy(true);
        try {
            const profile = await signInWithGoogle();
            if (!profile?.email) throw new Error('No email returned by Google.');

            let user = await getUserByEmail(profile.email);
            if (!user) {
                // New Google users get an approved profile without a class;
                // students then pick their class once on the next screen.
                const randomPassword = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                const hashedPassword = await hashPassword(randomPassword);
                await addUser(profile.name, profile.email, hashedPassword, ROLE_IDS[selectedRole], null, 1, profile.sub);
                user = await getUserByEmail(profile.email);
                if (!user) throw new Error('Account was not created.');
            }

            const roleError = checkAccountRole(user);
            if (roleError) {
                showAuthError(roleError);
                return;
            }

            completeLogin(user, state, navigateTo);
        } catch (err) {
            console.error('Google sign-in failed:', err);
            const errText = String(err?.message || '').toLowerCase();
            if (errText.includes('origin_mismatch') || errText.includes('origin mismatch')) {
                showAuthError(`Google sign-in is not allowed from ${window.location.origin}. Add it to the OAuth Client's Authorized JavaScript origins in Google Cloud Console.`);
            } else if (errText.includes('failed to fetch') || errText.includes('network')) {
                showAuthError(MESSAGES.network);
            } else {
                showAuthError(MESSAGES.google);
            }
        } finally {
            setBusy(false);
        }
    });

    document.getElementById('btn-admin-login')?.addEventListener('click', () => navigateTo('admin-login'));
    document.getElementById('btn-visible-admin-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('admin-login');
    });

    // --- SIGN UP FLOW ---
    const signupModal = document.getElementById('signup-modal');
    const signupOverlay = document.getElementById('signup-overlay');
    const signupClose = document.getElementById('signup-modal-close');
    const btnShowSignup = document.getElementById('btn-show-signup');
    const btnSubmitSignup = document.getElementById('btn-submit-signup');
    const signupRoleSelect = document.getElementById('signup-role');
    const signupClassSelect = document.getElementById('signup-class');
    const signupClassField = document.getElementById('signup-class-field');

    // The Class field only applies to students.
    const syncSignupClassField = () => {
        signupClassField?.classList.toggle('hidden', signupRoleSelect?.value !== 'student');
    };
    signupRoleSelect?.addEventListener('change', syncSignupClassField);

    btnShowSignup?.addEventListener('click', (e) => {
        e.preventDefault();
        if (signupRoleSelect) {
            const loginRole = getSelectedRole();
            signupRoleSelect.value = ['student', 'teacher', 'parent'].includes(loginRole) ? loginRole : 'student';
        }
        if (signupClassSelect) signupClassSelect.value = '';
        syncSignupClassField();
        if (signupModal) signupModal.classList.remove('hidden');
        if (signupOverlay) signupOverlay.classList.remove('hidden');
    });

    const closeSignupModal = () => {
        if (signupModal) signupModal.classList.add('hidden');
        if (signupOverlay) signupOverlay.classList.add('hidden');
        // Clear form
        document.getElementById('signup-name').value = '';
        document.getElementById('signup-email').value = '';
        document.getElementById('signup-password').value = '';
        if (signupClassSelect) signupClassSelect.value = '';
    };

    signupClose?.addEventListener('click', closeSignupModal);
    signupOverlay?.addEventListener('click', (e) => {
        if (e.target === signupOverlay) closeSignupModal();
    });

    btnSubmitSignup?.addEventListener('click', async () => {
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const signupRole = signupRoleSelect?.value || 'student';
        const signupRoleId = ROLE_IDS[signupRole] || ROLE_IDS.student;
        const signupClass = signupRole === 'student' ? Number(signupClassSelect?.value) || null : null;

        if (!name || !email || !password) {
            alert("Please fill out all fields.");
            return;
        }

        if (signupRole === 'student' && !signupClass) {
            alert("Please select your class.");
            signupClassSelect?.focus();
            return;
        }

        if (password.length < 6) {
            alert("Password must be at least 6 characters long.");
            return;
        }

        try {
            console.log(`[SIGNUP] Attempting to create account for: ${email}`);

            const existing = await getUserByEmail(email);
            if (existing) {
                console.warn(`[SIGNUP] Email already exists: ${email}`);
                alert("An account with this email already exists. Please log in.");
                return;
            }

            // Hash the password before sending to DB
            const hashedPassword = await hashPassword(password);

            console.log(`[SIGNUP] Creating user: ${name} (${email}) as ${signupRole}`);
            await addUser(name, email, hashedPassword, signupRoleId, signupClass, 0);
            console.log(`[SIGNUP] User created successfully`);

            // Send a registration confirmation email (best-effort; app still works
            // without it since the on-screen toast already confirms registration)
            const registeredFor = signupClass ? ` for Class ${signupClass}` : '';
            sendEmail({
                toEmail: email,
                toName: name,
                subject: 'Adhyayan Parevartan — Registration Received',
                message: `Hi ${name},\n\nThank you for registering with Adhyayan Parevartan${registeredFor}.\n\nYour account has been created and is currently pending administrator approval. You will be able to log in once an administrator activates your account.\n\nIf you did not request this, please ignore this email.`
            }).catch(() => {});

            const successToast = document.getElementById('signup-success-toast');
            const successToastMessage = document.getElementById('signup-success-toast-message');
            if (successToast && successToastMessage) {
                successToastMessage.textContent = `Your registration for ${name} is complete. It is currently in the admin approval stage.`;
                successToast.classList.remove('hidden');
                setTimeout(() => successToast.classList.add('hidden'), 8000);
            }

            closeSignupModal();
        } catch (e) {
            console.error("[SIGNUP] Error:", e);
            const errorMsg = String(e?.message || '').toLowerCase();
            const dbType = window.adhyayan?.dbType || 'unknown';

            if (errorMsg.includes('already exists')) {
                alert("This email is already registered. Please try logging in.");
            } else if (errorMsg.includes('network') || errorMsg.includes('connect') || errorMsg.includes('fetch')) {
                alert(`Connection failed (${dbType} backend). Please check your internet.`);
            } else if (errorMsg.includes('database')) {
                alert("Database error. Please contact your administrator.");
            } else {
                alert("Failed to create account. Check your connection and try again.");
            }
        }
    });

    // --- FORGOT PASSWORD FLOW ---
    const forgotPwdModal = document.getElementById('forgot-pwd-modal');
    const btnForgotPassword = document.getElementById('btn-forgot-password');
    const forgotPwdOverlay = document.getElementById('forgot-pwd-overlay');
    const forgotPwdClose = document.getElementById('forgot-modal-close');
    const btnForgotSendOtp = document.getElementById('btn-forgot-send-otp');
    const btnForgotVerifyOtp = document.getElementById('btn-forgot-verify-otp');
    const btnForgotSavePwd = document.getElementById('btn-forgot-save-pwd');
    const btnForgotResendOtp = document.getElementById('btn-forgot-resend-otp');
    const forgotOtpTimer = document.getElementById('forgot-otp-timer');
    const btnResendText = document.getElementById('btn-resend-text');
    const btnResendTimer = document.getElementById('btn-resend-timer');
    const timerSeconds = document.getElementById('timer-seconds');

    let forgotOtpCode = null;
    let forgotUserEmail = null;
    let forgotUserId = null;
    let forgotOtpExpiry = null;
    let forgotOtpAttempts = 0;
    let lastOtpSentTime = 0;

    btnForgotPassword?.addEventListener('click', (e) => {
        e.preventDefault();
        if (forgotPwdModal) forgotPwdModal.classList.remove('hidden');
        if (forgotPwdOverlay) forgotPwdOverlay.classList.remove('hidden');
    });

    const closeForgotPwdModal = () => {
        if (forgotPwdModal) forgotPwdModal.classList.add('hidden');
        if (forgotPwdOverlay) forgotPwdOverlay.classList.add('hidden');
        // Reset form
        document.getElementById('forgot-email-input').value = '';
        document.getElementById('forgot-otp-input').value = '';
        document.getElementById('forgot-new-password').value = '';
        document.getElementById('forgot-confirm-password').value = '';
        // Reset views
        document.getElementById('forgot-view-email').style.display = 'block';
        document.getElementById('forgot-view-otp').style.display = 'none';
        document.getElementById('forgot-view-reset').style.display = 'none';
        forgotOtpCode = null;
        forgotUserEmail = null;
        forgotUserId = null;
        forgotOtpAttempts = 0;
        lastOtpSentTime = 0;
    };

    forgotPwdClose?.addEventListener('click', closeForgotPwdModal);
    forgotPwdOverlay?.addEventListener('click', (e) => {
        if (e.target === forgotPwdOverlay) closeForgotPwdModal();
    });

    btnForgotSendOtp?.addEventListener('click', async () => {
        const email = document.getElementById('forgot-email-input')?.value.trim();
        if (!email) {
            alert("Please enter your email address.");
            return;
        }

        try {
            const user = await getUserByEmail(email);
            
            // Security: Don't reveal whether email exists
            if (!user) {
                const toastEl = document.getElementById('auth-otp-toast');
                const toastMsg = document.getElementById('auth-otp-toast-message');
                if (toastEl && toastMsg) {
                    toastMsg.textContent = 'If this email is registered, a recovery code has been sent.';
                    toastEl.classList.remove('hidden');
                    setTimeout(() => toastEl.classList.add('hidden'), 5000);
                }
                // Still show OTP view for UX, but it won't work
                document.getElementById('forgot-view-email').style.display = 'none';
                document.getElementById('forgot-view-otp').style.display = 'block';
                forgotUserEmail = email; // Store even if doesn't exist
                return;
            }

            // Generate secure OTP with 10-minute expiry
            forgotOtpCode = generateSecureOTP();
            forgotUserEmail = email;
            forgotUserId = user.user_id; // Store user ID for password update
            forgotOtpExpiry = Date.now() + (10 * 60 * 1000); // 10 minutes from now
            forgotOtpAttempts = 0;
            lastOtpSentTime = Date.now();

            sendEmail({
                toEmail: email,
                toName: user.full_name,
                subject: 'Adhyayan Parevartan — Password Recovery Code',
                message: `Hi ${user.full_name},\n\nYour password recovery code is: ${forgotOtpCode}\n\nThis code will expire in 10 minutes.\n\nIf you did not request a password reset, please ignore this email.`
            }).catch(() => {});

            const toastEl = document.getElementById('auth-otp-toast');
            const toastMsg = document.getElementById('auth-otp-toast-message');
            if (toastEl && toastMsg) {
                toastMsg.textContent = 'Recovery code sent to your email. Check your inbox.';
                toastEl.classList.remove('hidden');
                setTimeout(() => toastEl.classList.add('hidden'), 5000);
            }

            // Show OTP view
            document.getElementById('forgot-view-email').style.display = 'none';
            document.getElementById('forgot-view-otp').style.display = 'block';
            startOtpTimer();
            startResendCooldown();
        } catch (e) {
            console.error("Forgot password error:", e);
            alert("Failed to send recovery code. Please try again.");
        }
    });

    function startResendCooldown() {
        btnForgotResendOtp.disabled = true;
        btnResendText.style.display = 'none';
        btnResendTimer.style.display = 'inline';
        
        let secondsLeft = 30;
        timerSeconds.textContent = secondsLeft;
        
        const countdown = setInterval(() => {
            secondsLeft--;
            if (secondsLeft <= 0) {
                clearInterval(countdown);
                btnForgotResendOtp.disabled = false;
                btnResendText.style.display = 'inline';
                btnResendTimer.style.display = 'none';
            } else {
                timerSeconds.textContent = secondsLeft;
            }
        }, 1000);
    }

    function startOtpTimer() {
        const updateTimer = () => {
            if (!forgotOtpExpiry) return;
            const remaining = Math.max(0, Math.floor((forgotOtpExpiry - Date.now()) / 1000));
            if (remaining > 0) {
                if (forgotOtpTimer) {
                    forgotOtpTimer.textContent = `Code expires in ${remaining} seconds`;
                }
                setTimeout(updateTimer, 1000);
            } else {
                if (forgotOtpTimer) {
                    forgotOtpTimer.textContent = 'Code has expired. Please request a new one.';
                    forgotOtpTimer.style.color = '#d9534f';
                }
                btnForgotVerifyOtp.disabled = true;
            }
        };
        updateTimer();
    }

    btnForgotVerifyOtp?.addEventListener('click', async () => {
        // Check if OTP has expired
        if (!forgotOtpExpiry || Date.now() > forgotOtpExpiry) {
            alert("Recovery code has expired. Please request a new one.");
            return;
        }

        const otp = document.getElementById('forgot-otp-input')?.value.trim();
        if (!otp) {
            alert("Please enter the recovery code.");
            return;
        }

        forgotOtpAttempts++;
        
        if (otp !== forgotOtpCode) {
            if (forgotOtpAttempts >= 5) {
                alert("Too many failed attempts. Please request a new recovery code.");
                document.getElementById('forgot-view-otp').style.display = 'none';
                document.getElementById('forgot-view-email').style.display = 'block';
                forgotOtpCode = null;
                forgotOtpAttempts = 0;
            } else {
                alert(`Invalid code. ${5 - forgotOtpAttempts} attempts remaining.`);
            }
            return;
        }

        // Show reset password view
        document.getElementById('forgot-view-otp').style.display = 'none';
        document.getElementById('forgot-view-reset').style.display = 'block';
    });

    btnForgotSavePwd?.addEventListener('click', async () => {
        const newPassword = document.getElementById('forgot-new-password')?.value;
        const confirmPassword = document.getElementById('forgot-confirm-password')?.value;
        
        if (!newPassword || !confirmPassword) {
            alert("Please enter both passwords.");
            return;
        }

        if (newPassword.length < 6) {
            alert("Password must be at least 6 characters long.");
            return;
        }

        if (newPassword !== confirmPassword) {
            alert("Passwords do not match. Please try again.");
            return;
        }

        try {
            if (!forgotUserId) throw new Error('User ID not set. Please try again.');
            if (!forgotUserEmail) throw new Error('Email not set');
            
            console.log(`[FORGOT-PASSWORD] Updating password for user: ${forgotUserEmail} (ID: ${forgotUserId})`);
            
            // Hash the new password before updating
            const hashedPassword = await hashPassword(newPassword);
            await updateUserPassword(forgotUserId, hashedPassword);
            console.log(`[FORGOT-PASSWORD] Password updated successfully`);

            const toastEl = document.getElementById('auth-otp-toast');
            const toastMsg = document.getElementById('auth-otp-toast-message');
            if (toastEl && toastMsg) {
                toastMsg.textContent = 'Password updated successfully. Please log in with your new password.';
                toastEl.classList.remove('hidden');
                setTimeout(() => toastEl.classList.add('hidden'), 5000);
            }

            closeForgotPwdModal();
        } catch (e) {
            console.error("[FORGOT-PASSWORD] Update password error:", e);
            const errorMsg = String(e?.message || '').toLowerCase();
            
            if (errorMsg.includes('user id not set')) {
                alert("Session error. Please request a new recovery code.");
            } else if (errorMsg.includes('network') || errorMsg.includes('connect')) {
                alert("Connection failed. Please check your internet and try again.");
            } else if (errorMsg.includes('unauthorized') || errorMsg.includes('forbidden')) {
                alert("Permission denied. Please try again.");
            } else {
                alert("Failed to update password. Please try again.");
            }
        }
    });

    btnForgotResendOtp?.addEventListener('click', async () => {
        const now = Date.now();
        const timeSinceLastSend = now - lastOtpSentTime;
        const secondsRemaining = Math.ceil((30000 - timeSinceLastSend) / 1000);

        if (secondsRemaining > 0) {
            alert(`Please wait ${secondsRemaining} seconds before resending.`);
            return;
        }

        try {
            if (!forgotUserEmail) throw new Error('Email not set');
            const user = await getUserByEmail(forgotUserEmail);
            if (!user) {
                // Generic message - don't reveal email doesn't exist
                const toastEl = document.getElementById('auth-otp-toast');
                const toastMsg = document.getElementById('auth-otp-toast-message');
                if (toastEl && toastMsg) {
                    toastMsg.textContent = 'If this email is registered, a recovery code has been sent.';
                    toastEl.classList.remove('hidden');
                    setTimeout(() => toastEl.classList.add('hidden'), 5000);
                }
                return;
            }

            // Generate new secure OTP
            forgotOtpCode = generateSecureOTP();
            forgotOtpExpiry = Date.now() + (10 * 60 * 1000);
            forgotOtpAttempts = 0;
            lastOtpSentTime = now;

            sendEmail({
                toEmail: forgotUserEmail,
                toName: user.full_name,
                subject: 'Adhyayan Parevartan — Password Recovery Code (Resent)',
                message: `Hi ${user.full_name},\n\nYour password recovery code is: ${forgotOtpCode}\n\nThis code will expire in 10 minutes.\n\nIf you did not request a password reset, please ignore this email.`
            }).catch(() => {});

            const toastEl = document.getElementById('auth-otp-toast');
            const toastMsg = document.getElementById('auth-otp-toast-message');
            if (toastEl && toastMsg) {
                toastMsg.textContent = 'Recovery code resent to your email.';
                toastEl.classList.remove('hidden');
                setTimeout(() => toastEl.classList.add('hidden'), 5000);
            }

            // Reset OTP input and start timer
            document.getElementById('forgot-otp-input').value = '';
            startOtpTimer();
            startResendCooldown();
        } catch (e) {
            console.error("Resend OTP error:", e);
            alert("Failed to resend code. Please try again.");
        }
    });
}


