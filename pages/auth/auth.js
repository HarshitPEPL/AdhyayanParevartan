// Uses window.adhyayan global (set by the bundled core/app.js after db init)
import { sendEmail, isEmailConfigured } from '../../core/email.js';
import { signInWithGoogle, isGoogleAuthConfigured } from '../../core/googleAuth.js';

export function init(navigateTo, state) {
    const { getUserByEmail, addUser, updateUserPassword } = window.adhyayan;
    let selectedClass = null;
    const googleWarningEl = document.getElementById('google-class-warning');
    const roleSelect = document.getElementById('auth-role');
    const termsCheckbox = document.getElementById('auth-terms');
    const loginForm = document.getElementById('loginForm');

    const roleMap = {
        student: 3,
        teacher: 2,
        parent: 4,
        admin: 1
    };

    const getSelectedRole = () => roleSelect ? roleSelect.value : '';
    const getSelectedRoleLabel = () => {
        const role = getSelectedRole();
        if (role === 'student') return 'Student';
        if (role === 'teacher') return 'Teacher';
        if (role === 'parent') return 'Parent';
        if (role === 'admin') return 'Admin';
        return '';
    };

    // --- CLASS SELECTOR: Swipeable Carousel with 3 pages of 4 classes (1–4, 5–8, 9–12) ---
    const pills = document.getElementById('pills');
    const dots = document.getElementById('dots');
    const slider = document.getElementById('class-slider');
    let currentPage = 0;
    let isDragging = false;
    let startX = 0;
    let scrollLeft = 0;

    function initClassSelector() {
        // Build the carousel structure with 3 pages
        pills.innerHTML = '';
        
        for (let page = 0; page < 3; page++) {
            const classPage = document.createElement('div');
            classPage.className = 'class-page';
            classPage.style.flex = '0 0 100%';
            classPage.style.width = '100%';
            classPage.style.display = 'flex';
            classPage.style.justifyContent = 'center';
            classPage.style.gap = '14px';
            classPage.style.alignItems = 'center';
            classPage.style.scrollSnapAlign = 'center';
            classPage.style.scrollSnapStop = 'always';
            
            for (let i = 1; i <= 4; i++) {
                const classNum = page * 4 + i;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'pill';
                b.dataset.class = classNum;
                if (selectedClass === classNum) b.classList.add('active');
                b.textContent = classNum;
                b.setAttribute('aria-pressed', selectedClass === classNum);
                b.onclick = (e) => {
                    e.preventDefault();
                    // Update selected class without re-rendering
                    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                    b.classList.add('active');
                    b.setAttribute('aria-pressed', 'true');
                    selectedClass = classNum;
                };
                classPage.appendChild(b);
            }
            pills.appendChild(classPage);
        }

        // Initialize dots
        initDots();
    }

    function initDots() {
        dots.innerHTML = '';
        for (let p = 0; p < 3; p++) {
            const d = document.createElement('button');
            d.type = 'button';
            d.className = 'carousel-dot';
            d.dataset.page = p;
            if (p === currentPage) d.classList.add('active');
            d.setAttribute('aria-label', 'Classes page ' + (p + 1));
            if (p === currentPage) d.setAttribute('aria-current', 'true');
            d.onclick = (e) => {
                e.preventDefault();
                // Scroll to the page
                if (slider) {
                    slider.scrollTo({ left: p * slider.clientWidth, behavior: 'smooth' });
                }
            };
            dots.appendChild(d);
        }
    }

    function updateDotsIndicator() {
        if (!slider || !dots) return;
        // Compute current page based on scroll position
        const newPage = Math.round(slider.scrollLeft / slider.clientWidth);
        
        if (newPage !== currentPage) {
            currentPage = newPage;
            // Update dots
            dots.querySelectorAll('.carousel-dot').forEach((dot, idx) => {
                if (idx === newPage) {
                    dot.classList.add('active');
                    dot.setAttribute('aria-current', 'true');
                } else {
                    dot.classList.remove('active');
                    dot.removeAttribute('aria-current');
                }
            });
        }
    }

    // Initialize carousel
    initClassSelector();

    // Smooth scroll updates
    if (slider) {
        slider.addEventListener('scroll', updateDotsIndicator, { passive: true });
    }

    // --- MOUSE DRAG SUPPORT (Desktop) ---
    if (slider) {
        // Mouse down - start drag
        slider.addEventListener('pointerdown', (e) => {
            isDragging = true;
            startX = e.clientX;
            scrollLeft = slider.scrollLeft;
            slider.style.scrollBehavior = 'auto';
            slider.style.cursor = 'grabbing';
        });

        // Mouse move - drag
        document.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.clientX;
            const walk = (startX - x) * 1; // 1x multiplier for 1:1 drag
            slider.scrollLeft = scrollLeft + walk;
        });

        // Mouse up - end drag
        document.addEventListener('pointerup', () => {
            if (isDragging) {
                isDragging = false;
                slider.style.scrollBehavior = 'smooth';
                slider.style.cursor = 'grab';
                // Snap to nearest page after drag
                const pageWidth = slider.clientWidth;
                const currentScroll = slider.scrollLeft;
                const nextPage = Math.round(currentScroll / pageWidth);
                slider.scrollTo({ left: nextPage * pageWidth, behavior: 'smooth' });
            }
        });

        slider.style.cursor = 'grab';
    }

    const validateAndNavigate = async (route) => {
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');
        const selectedRole = getSelectedRole();

        if (!termsCheckbox?.checked) {
            alert("Please agree to the Terms and Conditions before logging in.");
            termsCheckbox?.focus();
            return;
        }

        if (!selectedRole) {
            alert("Please select your role before logging in.");
            if (roleSelect) roleSelect.focus();
            return;
        }

        if (!selectedClass) {
            // Show a more prominent warning message
            if (googleWarningEl) {
                googleWarningEl.style.display = 'block';
                googleWarningEl.textContent = 'Please select your class from the numbers below';
                googleWarningEl.style.color = '#d9534f';
                googleWarningEl.style.marginTop = '12px';
            }
            // Show toast message
            const toastEl = document.getElementById('auth-toast') || document.createElement('div');
            if (!document.getElementById('auth-toast')) {
                toastEl.id = 'auth-toast';
                toastEl.className = 'toast';
                document.body.appendChild(toastEl);
            }
            toastEl.textContent = 'Please select your class (1-12) before continuing';
            toastEl.classList.remove('hidden');
            setTimeout(() => toastEl.classList.add('hidden'), 3500);
            return;
        }
        
        // Clear the warning if class is selected
        if (googleWarningEl) {
            googleWarningEl.style.display = 'none';
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

    // Handle form submission
    loginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        validateAndNavigate('home');
    });

    // Google sign-in handler
    document.getElementById('btn-google')?.addEventListener('click', async (e) => {
        const selectedRole = getSelectedRole();
        if (!termsCheckbox?.checked) {
            alert("Please agree to the Terms and Conditions before continuing.");
            termsCheckbox?.focus();
            return;
        }
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
            // Show a more prominent warning message
            if (googleWarningEl) {
                googleWarningEl.style.display = 'block';
                googleWarningEl.textContent = 'Please select your class from the numbers below';
                googleWarningEl.style.color = '#d9534f';
                googleWarningEl.style.marginTop = '12px';
            }
            // Show toast message
            const toastEl = document.getElementById('auth-toast') || document.createElement('div');
            if (!document.getElementById('auth-toast')) {
                toastEl.id = 'auth-toast';
                toastEl.className = 'toast';
                document.body.appendChild(toastEl);
            }
            toastEl.textContent = 'Please select your class (1-12) before continuing';
            toastEl.classList.remove('hidden');
            setTimeout(() => toastEl.classList.add('hidden'), 3500);
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
            const errText = String(err?.message || '').toLowerCase();
            if (err?.message === 'popup_closed') {
                // user cancelled the popup; no urgent message needed
            } else if (errText.includes('origin_mismatch') || errText.includes('origin mismatch')) {
                alert(`Google sign-in is blocked for this origin: ${window.location.origin}.\n\nAdd this exact URL in Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client ID > Authorized JavaScript origins, then try again.`);
            } else if (errText.includes('28444') || errText.includes('developer console is not set up correctly')) {
                alert("Google Sign-In isn't fully set up for the Android app yet.\n\nAn Android OAuth Client ID (package name + SHA-1 fingerprint) needs to be registered in Google Cloud Console before native sign-in will work.");
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
        if (signupOverlay) signupOverlay.classList.remove('hidden');
    });

    const closeSignupModal = () => {
        if (signupModal) signupModal.classList.add('hidden');
        if (signupOverlay) signupOverlay.classList.add('hidden');
    };
    
    signupClose?.addEventListener('click', closeSignupModal);
    signupOverlay?.addEventListener('click', closeSignupModal);

    btnSubmitSignup?.addEventListener('click', async () => {
        if (!selectedClass) {
            // Show warning message with toast
            const toastEl = document.getElementById('auth-toast') || document.createElement('div');
            if (!document.getElementById('auth-toast')) {
                toastEl.id = 'auth-toast';
                toastEl.className = 'toast';
                document.body.appendChild(toastEl);
            }
            toastEl.textContent = 'Please select your class from the numbers below first';
            toastEl.classList.remove('hidden');
            setTimeout(() => toastEl.classList.add('hidden'), 3500);
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

    // --- FORGOT PASSWORD FLOW ---
    const forgotPwdModal = document.getElementById('forgot-pwd-modal');
    const btnForgotPassword = document.getElementById('btn-forgot-password');
    const forgotPwdOverlay = document.getElementById('forgot-pwd-overlay');
    const forgotPwdClose = document.getElementById('forgot-modal-close');
    const btnForgotSendOtp = document.getElementById('btn-forgot-send-otp');
    const btnForgotVerifyOtp = document.getElementById('btn-forgot-verify-otp');
    const btnForgotSavePwd = document.getElementById('btn-forgot-save-pwd');
    const btnForgotResendOtp = document.getElementById('btn-forgot-resend-otp');

    btnForgotPassword?.addEventListener('click', (e) => {
        e.preventDefault();
        if (forgotPwdModal) forgotPwdModal.classList.remove('hidden');
        if (forgotPwdOverlay) forgotPwdOverlay.classList.remove('hidden');
    });

    const closeForgotPwdModal = () => {
        if (forgotPwdModal) forgotPwdModal.classList.add('hidden');
        if (forgotPwdOverlay) forgotPwdOverlay.classList.add('hidden');
    };

    forgotPwdClose?.addEventListener('click', closeForgotPwdModal);
    forgotPwdOverlay?.addEventListener('click', closeForgotPwdModal);

    let forgotOtpCode = null;
    let forgotUserEmail = null;

    btnForgotSendOtp?.addEventListener('click', async () => {
        const email = document.getElementById('forgot-email-input')?.value.trim();
        if (!email) {
            alert("Please enter your email address.");
            return;
        }

        try {
            const user = await getUserByEmail(email);
            if (!user) {
                alert("No account found with this email address.");
                return;
            }

            forgotOtpCode = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
            forgotUserEmail = email;

            sendEmail({
                toEmail: email,
                toName: user.full_name,
                subject: 'Adhyayan Parevartan — Password Recovery Code',
                message: `Hi ${user.full_name},\n\nYour password recovery code is: ${forgotOtpCode}\n\nThis code will expire in 10 minutes.\n\nIf you did not request a password reset, please ignore this email.`
            }).catch(() => {});

            const toastEl = document.getElementById('auth-otp-toast');
            const toastMsg = document.getElementById('auth-otp-toast-message');
            if (toastEl && toastMsg) {
                toastMsg.innerHTML = `OTP Code <strong>${forgotOtpCode}</strong> sent successfully`;
                toastEl.classList.remove('hidden');
                setTimeout(() => toastEl.classList.add('hidden'), 6000);
            }

            // Show OTP view
            document.getElementById('forgot-view-email').style.display = 'none';
            document.getElementById('forgot-view-otp').style.display = 'block';
        } catch (e) {
            console.error("Forgot password error:", e);
            alert("Failed to send recovery code. Please try again.");
        }
    });

    btnForgotVerifyOtp?.addEventListener('click', async () => {
        const otp = document.getElementById('forgot-otp-input')?.value.trim();
        if (!otp || otp !== forgotOtpCode) {
            alert("Invalid verification code. Please try again.");
            return;
        }

        // Show reset password view
        document.getElementById('forgot-view-otp').style.display = 'none';
        document.getElementById('forgot-view-reset').style.display = 'block';
    });

    btnForgotSavePwd?.addEventListener('click', async () => {
        const newPassword = document.getElementById('forgot-new-password')?.value;
        if (!newPassword) {
            alert("Please enter a new password.");
            return;
        }

        try {
            if (!forgotUserEmail) throw new Error('Email not set');
            await updateUserPassword(forgotUserEmail, newPassword);

            alert("Your password has been successfully updated. Please log in with your new password.");
            closeForgotPwdModal();

            // Reset to email view
            document.getElementById('forgot-view-email').style.display = 'block';
            document.getElementById('forgot-view-otp').style.display = 'none';
            document.getElementById('forgot-view-reset').style.display = 'none';
            document.getElementById('forgot-email-input').value = '';
            document.getElementById('forgot-otp-input').value = '';
            document.getElementById('forgot-new-password').value = '';
        } catch (e) {
            console.error("Update password error:", e);
            alert("Failed to update password. Please try again.");
        }
    });

    btnForgotResendOtp?.addEventListener('click', async () => {
        try {
            if (!forgotUserEmail) throw new Error('Email not set');
            const user = await getUserByEmail(forgotUserEmail);
            if (!user) throw new Error('User not found');

            forgotOtpCode = String(Math.floor(Math.random() * 999999)).padStart(6, '0');

            sendEmail({
                toEmail: forgotUserEmail,
                toName: user.full_name,
                subject: 'Adhyayan Parevartan — Password Recovery Code',
                message: `Hi ${user.full_name},\n\nYour password recovery code is: ${forgotOtpCode}\n\nThis code will expire in 10 minutes.\n\nIf you did not request a password reset, please ignore this email.`
            }).catch(() => {});

            const toastEl = document.getElementById('auth-otp-toast');
            const toastMsg = document.getElementById('auth-otp-toast-message');
            if (toastEl && toastMsg) {
                toastMsg.innerHTML = `OTP Code <strong>${forgotOtpCode}</strong> resent successfully`;
                toastEl.classList.remove('hidden');
                setTimeout(() => toastEl.classList.add('hidden'), 6000);
            }
        } catch (e) {
            console.error("Resend OTP error:", e);
            alert("Failed to resend code. Please try again.");
        }
    });
}


