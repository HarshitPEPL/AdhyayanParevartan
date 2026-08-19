// Uses window.adhyayan global (set by the bundled core/app.js after db init)
import { sendEmail, isEmailConfigured } from '../../core/email.js';
import { signInWithGoogle, isGoogleAuthConfigured } from '../../core/googleAuth.js';

export function init(navigateTo, state) {
    const { getUserByEmail, addUser, updateUserPassword } = window.adhyayan;
    let selectedClass = null;
    const errorEl = document.getElementById('class-error');
    const googleWarningEl = document.getElementById('google-class-warning');
    const roleSelect = document.getElementById('auth-role');

    const roleMap = {
        student: 3,
        teacher: 2,
        admin: 1
    };

    const getSelectedRole = () => roleSelect ? roleSelect.value : '';
    const getSelectedRoleLabel = () => {
        const role = getSelectedRole();
        if (role === 'student') return 'Student';
        if (role === 'teacher') return 'Teacher';
        if (role === 'admin') return 'Admin';
        return '';
    };

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
            if(googleWarningEl) googleWarningEl.style.display = 'none';
        });
    });

    const validateAndNavigate = async (route) => {
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');
        const selectedRole = getSelectedRole();

        if (!selectedRole) {
            alert("Please select your role before logging in.");
            if (roleSelect) roleSelect.focus();
            return;
        }

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
                    alert("Account not found. Please sign up or contact your admin to create your account.");
                    return;
                }

                const expectedRoleId = roleMap[selectedRole];
                if (user.role_id !== expectedRoleId) {
                    alert(`This account is not registered as a ${getSelectedRoleLabel()}. Please select the correct role or use the correct credentials.`);
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

                if (selectedRole === 'admin') {
                    alert("Admin access is restricted to the super admin portal. Please use the Admin Portal login flow.");
                    navigateTo('admin-login', { replace: true });
                    return;
                }

                state.currentUser = user;
                state.selectedClass = user.class_number || selectedClass || 9;
                window.adhyayan?.saveSession?.();
                navigateTo(route, { replace: true });
            } catch (e) {
                console.error("Login error:", e);
                alert("Login failed. Check connection.");
            }
        } else {
            state.selectedClass = selectedClass || 9;
            navigateTo(route, { replace: true });
        }
    };

    document.getElementById('btn-continue')?.addEventListener('click', () => validateAndNavigate('home'));
    document.getElementById('btn-google')?.addEventListener('click', async (e) => {
        const selectedRole = getSelectedRole();
        if (!selectedRole) {
            alert("Please select Student, Teacher, or Admin before continuing with Google.");
            if (roleSelect) roleSelect.focus();
            return;
        }
        if (selectedRole === 'admin') {
            alert("Admin access is restricted to the super admin portal. Please use the Admin Portal login flow.");
            navigateTo('admin-login', { replace: true });
            return;
        }
        if (!selectedClass) {
            if (googleWarningEl) googleWarningEl.style.display = 'block';
            return;
        }
        if (googleWarningEl) googleWarningEl.style.display = 'none';

        if (!isGoogleAuthConfigured()) {
            // No live OAuth Client ID yet (added later once the app has a live domain
            // to register with Google) — fall back to the placeholder mock login.
            state.currentUser = { full_name: "Google User", email: "google@user.com", class_number: selectedClass, is_approved: 1, role_id: roleMap[selectedRole] };
            state.selectedClass = selectedClass;
            window.adhyayan?.saveSession?.();
            navigateTo('home', { replace: true });
            return;
        }

        const btnGoogle = e.currentTarget;
        const originalLabel = btnGoogle.innerHTML;
        btnGoogle.style.pointerEvents = 'none';
        btnGoogle.style.opacity = '0.6';

        try {
            const profile = await signInWithGoogle();
            if (!profile?.email) throw new Error('No email returned by Google.');

            let user = await getUserByEmail(profile.email);
            if (!user) {
                const randomPassword = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                await addUser(profile.name, profile.email, randomPassword, roleMap[selectedRole], selectedClass, 1, profile.sub);
                user = await getUserByEmail(profile.email);
            }

            if (user.role_id !== roleMap[selectedRole]) {
                alert(`This Google account is registered as a ${user.role_id === 3 ? 'Student' : user.role_id === 2 ? 'Teacher' : 'Admin'}, not as a ${getSelectedRoleLabel()}. Please select the correct role.`);
                return;
            }

            if (user.role_id === 3 && !user.is_approved) {
                alert("Access Denied: Your account is pending administrator approval. Please contact your admin to activate your account.");
                return;
            }

            state.currentUser = user;
            state.selectedClass = user.class_number || selectedClass;
            window.adhyayan?.saveSession?.();
            navigateTo('home', { replace: true });
        } catch (err) {
            console.error("Google sign-in failed:", err);
            if (err?.message === 'popup_closed') {
                // user cancelled the popup; no urgent message needed
            } else if (String(err?.message || '').toLowerCase().includes('origin_mismatch') || String(err?.message || '').toLowerCase().includes('origin mismatch')) {
                alert(`Google sign-in is blocked for this origin: ${window.location.origin}.\n\nAdd this exact URL in Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client ID > Authorized JavaScript origins, then try again.`);
            } else {
                alert("Google sign-in failed. Please try again.");
            }
        } finally {
            btnGoogle.style.pointerEvents = '';
            btnGoogle.style.opacity = '';
            btnGoogle.innerHTML = originalLabel;
        }
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
    const signupRoleSelect = document.getElementById('signup-role');

    btnShowSignup?.addEventListener('click', (e) => {
        e.preventDefault();
        if (signupRoleSelect) {
            signupRoleSelect.value = getSelectedRole() || 'student';
        }
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
        const signupRole = signupRoleSelect ? signupRoleSelect.value : (getSelectedRole() || 'student');
        const signupRoleId = roleMap[signupRole] || 3;

        if (!name || !email || !password || !signupRole) {
            alert("Please fill out all fields and select your role.");
            return;
        }

        try {
            const existing = await getUserByEmail(email);
            if (existing) {
                alert("An account with this email already exists. Please log in.");
                return;
            }

            await addUser(name, email, password, signupRoleId, selectedClass, 0);

            // Send a registration confirmation email (best-effort; app still works
            // without it since the on-screen toast already confirms registration)
            sendEmail({
                toEmail: email,
                toName: name,
                subject: 'Adhyayan Parevartan — Registration Received',
                message: `Hi ${name},\n\nThank you for registering with Adhyayan Parevartan for Class ${selectedClass}.\n\nYour account has been created and is currently pending administrator approval. You will be able to log in once an administrator activates your account.\n\nIf you did not request this, please ignore this email.`
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

    const dispatchAuthOTP = async (email) => {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        authOTP = otp;

        const toast = document.getElementById('auth-otp-toast');
        const toastMsg = document.getElementById('auth-otp-toast-message');
        const emailConfigured = isEmailConfigured();

        if (toast && toastMsg) {
            toastMsg.innerHTML = emailConfigured
                ? `OTP verification code <strong>${otp}</strong> is being emailed to ${email}`
                : `OTP verification code <strong>${otp}</strong> successfully dispatched to ${email} (email service not configured — showing code here)`;
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

        // Best-effort real email dispatch; the on-screen toast above already
        // lets the flow work even if the email service isn't configured yet.
        const result = await sendEmail({
            toEmail: email,
            subject: 'Adhyayan Parevartan — Password Reset Code',
            message: `Your password reset verification code is: ${otp}\n\nThis code expires shortly. If you did not request a password reset, you can safely ignore this email.`
        });

        if (toastMsg && result.sent) {
            toastMsg.innerHTML = `A verification code has been emailed to <strong>${email}</strong>`;
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
}
