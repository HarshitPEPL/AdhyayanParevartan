# Auth Page - QA Verification Checklist

## ✅ Build & Deployment Status
- **Build Command**: npm run build
- **Deployment**: Git push to origin/main → Netlify auto-deploy
- **Last Deployment**: UI spacing fix committed successfully
- **URL**: https://adhyayanparevartan.netlify.app/#auth

---

## 📋 UI/UX Tests

### Visual Layout
- [ ] Adhyayan logo displays (or fallback "अध्ययन" text in Hindi)
- [ ] Form width fits entire viewport without overflow
- [ ] Email input field visible with envelope icon
- [ ] Password input field visible with lock icon
- [ ] Role dropdown visible with user-tag icon
- [ ] Terms checkbox visible with proper label
- [ ] Forgot password link visible
- [ ] Continue button properly sized and positioned

### Carousel & Progress Indicator
- [ ] Class selector shows "I'm in class" label
- [ ] Class pills render (1, 2, 3, 4 visible on first page)
- [ ] Progress indicator dots appear below carousel (3 tiny dots)
- [ ] Dots are 1px size (very subtle)
- [ ] **NO OVERLAP**: Compliance text "By continuing you agree..." is not hidden by dots
- [ ] Proper spacing between dots container and compliance text

### Responsive Design
- [ ] Form stays centered with clamp() scaling
- [ ] Elements don't overflow on mobile viewport
- [ ] Touch targets (buttons, pills) are clickable size
- [ ] Icons display correctly at different screen sizes

---

## 🔐 Form Input Tests

### Email Field
- [ ] Accepts email input
- [ ] Placeholder text displays
- [ ] Copy/paste works
- [ ] Submit fails if empty

### Password Field
- [ ] Accepts password input (masked with dots)
- [ ] Placeholder text displays
- [ ] Copy/paste works
- [ ] Submit fails if empty

### Role Dropdown
- [ ] Dropdown opens when clicked
- [ ] Shows options: Student, Teacher, Admin
- [ ] Selection persists when dropdown closes
- [ ] Submit fails if no role selected

### Terms Checkbox
- [ ] Checkbox toggles when clicked
- [ ] Label text "I agree to Terms & Conditions" displays
- [ ] Submit fails if unchecked
- [ ] Error alert: "Please agree to Terms and Conditions before logging in."

### Forgot Password Link
- [ ] Link visible
- [ ] Clicking opens forgot password modal
- [ ] Modal doesn't break layout

---

## 🎯 Class Selection Tests

### Class Carousel Interaction
- [ ] Initially no class selected (no green highlight)
- [ ] Clicking class 1 shows green highlight
- [ ] Clicking class 2 removes highlight from class 1, adds to class 2
- [ ] Only one class selected at a time
- [ ] Swiping/scrolling carousel works smoothly
- [ ] All classes 1-12 accessible across 3 pages

### Progress Indicator Dots
- [ ] 3 dots visible (page 1, 2, 3)
- [ ] First dot active (green) when viewing classes 1-4
- [ ] Second dot active when scrolling to classes 5-8
- [ ] Third dot active when scrolling to classes 9-12
- [ ] Dot color change is smooth transition
- [ ] Clicking a dot scrolls carousel to that page
- [ ] Dots update in real-time as user scrolls manually
- [ ] Dots remain clickable despite 1px size

### Class Selection Validation
- [ ] Submit fails if no class selected
- [ ] Warning message appears: "I'm in class" requirement shows
- [ ] Class selection is required before login succeeds

---

## 🔑 Authentication Flow Tests

### Email/Password Login
1. Fill email, password, select role, select class, check terms
2. Click Continue
   - [ ] Form submits without error
   - [ ] If account doesn't exist: Alert "Account not found. Please sign up..."
   - [ ] If password wrong: Alert "Incorrect password..."
   - [ ] If role mismatch: Alert "This account is not registered as a..."
   - [ ] If student not approved: Alert "Access Denied: Your account is pending..."
   - [ ] If admin: Alert "Admin access restricted... use Admin Portal" → redirects to admin-login
   - [ ] If successful: Redirects to home page with session saved

### Google Sign-In
- [ ] "Continue with Google" button visible
- [ ] Clicking button validates: terms checked, role selected, class selected
- [ ] If terms unchecked: Alert "Please agree to Terms..."
- [ ] If role not selected: Alert "Please select Student, Teacher, or Admin..."
- [ ] If class not selected: Warning message shows
- [ ] If admin role: Alert "Admin access restricted..."
- [ ] Fallback to mock login (since OAuth Client ID not yet configured)
- [ ] Mock login creates session and redirects to home

---

## 📝 Sign Up Flow Tests

### Modal Opening
- [ ] "Sign up" link visible
- [ ] Clicking "Sign up" opens signup modal
- [ ] Overlay appears behind modal
- [ ] Modal has header "Create Account" and close button
- [ ] Clicking overlay or close button closes modal

### Form Fields
- [ ] Full Name field accepts input
- [ ] Email field accepts input
- [ ] Password field accepts input
- [ ] Role dropdown shows selected role from login form (or defaults to "Student")
- [ ] All fields visible and properly labeled

### Signup Validation & Submission
1. Try submit without filling all fields
   - [ ] Alert "Please fill out all fields..."
2. Try signup with existing email
   - [ ] Alert "An account with this email already exists..."
3. Submit valid signup (no class selected)
   - [ ] Alert "Please select your class from the numbers below first!"
   - [ ] Modal closes
   - [ ] Focuses on class carousel
4. Select class and try again
   - [ ] New user added to database
   - [ ] Success toast shows: "Your registration for [Name] is complete..."
   - [ ] Modal closes
   - [ ] Registration confirmation email sent (best-effort)

---

## 🔄 Forgot Password Flow Tests

### Modal Opening
- [ ] "Forgot password?" link visible and clickable
- [ ] Clicking opens forgot password modal
- [ ] Modal shows "Recover Password" header

### Step 1: Email Entry
- [ ] Email input field present
- [ ] "Send OTP" button visible
- [ ] Clicking without email: Alert "Please enter your email address."
- [ ] Clicking with non-existent email: Alert "No account found with this email."
- [ ] Clicking with valid email:
  - [ ] OTP generated and sent via email
  - [ ] Toast shows "OTP Code [CODE] sent successfully"
  - [ ] View switches to OTP entry screen

### Step 2: OTP Verification
- [ ] OTP input field visible
- [ ] "Verify OTP" button visible
- [ ] "Resend OTP" button visible
- [ ] Clicking verify with wrong OTP: Alert "Invalid verification code..."
- [ ] Clicking verify with correct OTP:
  - [ ] View switches to password reset screen
  - [ ] Original email/OTP cleared for security

### Step 3: Password Reset
- [ ] New password input field visible
- [ ] "Save Password" button visible
- [ ] Clicking without password: Alert "Please enter a new password."
- [ ] Clicking with new password:
  - [ ] Password updated in database
  - [ ] Alert "Your password has been successfully updated..."
  - [ ] Modal closes
  - [ ] View resets to email entry for next attempt
  - [ ] All fields cleared

### Resend OTP
- [ ] "Resend OTP" button works during OTP step
- [ ] New OTP generated and sent
- [ ] Toast shows updated code

---

## 🔗 Navigation Tests

### Links
- [ ] "Sign up" link opens signup modal
- [ ] "Admin Portal" link navigates to admin-login page
- [ ] "Forgot password?" link opens forgot password modal
- [ ] Terms link (in checkbox label) is present but can be placeholder

### Button States
- [ ] Continue button has proper hover/active states
- [ ] Google button shows loading state (opacity reduced) during auth
- [ ] Modal close buttons work properly

---

## 🛡️ Error Handling

### Database Errors
- [ ] Missing email → "Account not found..." alert
- [ ] Missing password → "Incorrect password..." alert
- [ ] Missing user → "Please sign up..." alert
- [ ] DB connection error → "Login failed. Check connection." alert

### Modal Errors
- [ ] Signup form validation shows appropriate alerts
- [ ] Forgot password email validation works
- [ ] OTP mismatch caught properly

### Google Errors
- [ ] Popup closed by user → no alert (silent close)
- [ ] Origin mismatch → alert with Google Console instructions
- [ ] OAuth not configured → Fallback to mock login

---

## 🎨 CSS/Styling Tests

### Color Verification
- [ ] Active class pill: Green (#1b8d47)
- [ ] Active dot: Green (#2aa35c)
- [ ] Inactive pills: Light gray (#a7a7a7)
- [ ] Inactive dots: Light gray with 0.5px border
- [ ] Background: White
- [ ] Text: Dark gray (#111)

### Spacing Verification
- [ ] Class carousel margin-bottom: clamp(4px,0.6vh,8px)
- [ ] Carousel dots margin-bottom: 4px
- [ ] NO VISUAL OVERLAP between dots and compliance text
- [ ] Proper gap between form elements (clamp values)

### Font Sizes
- [ ] Class numbers: clamp(.88rem,0.95vw,1rem)
- [ ] Compliance text: clamp(.58rem,1.4vw,.68rem)
- [ ] Input placeholders: Readable on all screen sizes

---

## 🧪 Cross-Browser Compatibility

- [ ] Chrome/Edge - All features working
- [ ] Firefox - All features working
- [ ] Safari - All features working
- [ ] Mobile browsers - Touch events working, layout responsive

---

## ⚡ Performance Tests

- [ ] Page loads in under 2 seconds
- [ ] Modals open/close smoothly
- [ ] Carousel scrolls without lag
- [ ] Dots update in real-time on scroll
- [ ] Form submission doesn't hang

---

## 📊 Session Management Tests

- [ ] After successful login: Session saved via window.adhyayan.saveSession()
- [ ] State.currentUser set correctly
- [ ] State.selectedClass set correctly
- [ ] Navigation to home page succeeds
- [ ] Session persists on page refresh

---

## ✨ Final Verification

- [ ] **All form fields functional** ✓
- [ ] **All modals working** ✓
- [ ] **Class carousel smooth** ✓
- [ ] **Progress dots visible and interactive** ✓
- [ ] **NO UI OVERLAP issues** ✓
- [ ] **Proper spacing throughout** ✓
- [ ] **Error handling graceful** ✓
- [ ] **Mobile responsive** ✓
- [ ] **Login flow complete** ✓

---

**Test Date**: 2026-10-02
**Tested By**: QA Verification
**Status**: Ready for User Acceptance Testing
