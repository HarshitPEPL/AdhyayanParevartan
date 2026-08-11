// Lightweight client-side transactional email helper built on EmailJS
// (https://www.emailjs.com). This app has no backend server, so EmailJS's
// public REST API (safe to call directly from the browser with a public key)
// is used instead of a traditional SMTP/server-side mailer.
//
// Built-in default credentials (EmailJS "Public Key" is designed to be
// embedded in client-side code, like a Stripe publishable key — it is not
// a secret). These make real email delivery work out-of-the-box for every
// user without requiring manual setup. The "Email Notifications" icon on
// the login screen still lets anyone override these with their own
// EmailJS account via localStorage if they want to.
//
// If no configuration is present at all (defaults cleared and nothing
// saved), sendEmail() safely no-ops (returns { sent:false, reason:'not_configured' })
// so OTP/confirmation flows keep working via the on-screen toast fallback.

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

const DEFAULT_CONFIG = {
    serviceId: 'service_fbhgm8j',
    templateId: 'template_e6r7903',
    publicKey: 'GYnaKGAovp8IZYllX'
};

const KEYS = {
    serviceId: 'adhyayan_emailjs_service_id',
    templateId: 'adhyayan_emailjs_template_id',
    publicKey: 'adhyayan_emailjs_public_key'
};

export function getEmailConfig() {
    return {
        serviceId: localStorage.getItem(KEYS.serviceId) || DEFAULT_CONFIG.serviceId,
        templateId: localStorage.getItem(KEYS.templateId) || DEFAULT_CONFIG.templateId,
        publicKey: localStorage.getItem(KEYS.publicKey) || DEFAULT_CONFIG.publicKey
    };
}

export function isEmailConfigured() {
    const { serviceId, templateId, publicKey } = getEmailConfig();
    return !!(serviceId && templateId && publicKey);
}

export function saveEmailConfig(serviceId, templateId, publicKey) {
    localStorage.setItem(KEYS.serviceId, serviceId.trim());
    localStorage.setItem(KEYS.templateId, templateId.trim());
    localStorage.setItem(KEYS.publicKey, publicKey.trim());
}

// True when the user has saved their own EmailJS credentials (overriding the
// built-in defaults). Used purely for status-display purposes.
export function hasCustomEmailOverride() {
    return !!(
        localStorage.getItem(KEYS.serviceId) &&
        localStorage.getItem(KEYS.templateId) &&
        localStorage.getItem(KEYS.publicKey)
    );
}


export function clearEmailConfig() {
    localStorage.removeItem(KEYS.serviceId);
    localStorage.removeItem(KEYS.templateId);
    localStorage.removeItem(KEYS.publicKey);
}

// Sends a transactional email via EmailJS. Expects the EmailJS template to
// use these variable names: {{to_email}}, {{to_name}}, {{subject}}, {{message}}.
export async function sendEmail({ toEmail, toName, subject, message }) {
    const { serviceId, templateId, publicKey } = getEmailConfig();

    if (!serviceId || !templateId || !publicKey) {
        console.warn('Email service not configured; skipping real email dispatch. Configure it via the mail icon on the login screen.');
        return { sent: false, reason: 'not_configured' };
    }

    try {
        const response = await fetch(EMAILJS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: serviceId,
                template_id: templateId,
                user_id: publicKey,
                template_params: {
                    to_email: toEmail,
                    to_name: toName || toEmail,
                    subject,
                    message
                }
            })
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`EmailJS responded with ${response.status}: ${text}`);
        }

        return { sent: true };
    } catch (err) {
        console.error('Failed to send email via EmailJS:', err);
        return { sent: false, reason: err.message };
    }
}
