// Sends a simple notification email via Resend (https://resend.com).
// Reads the API key from an environment variable — never hardcode it here.
//
// IMPORTANT SANDBOX LIMITATION: until a sending domain is verified on the
// Resend account, Resend only allows sending TO the email address the
// account itself was signed up with. This is a Resend safety restriction,
// not a bug in this code. Once you verify a domain (e.g. yourdomain.com)
// in the Resend dashboard, you can send to anyone and use an address like
// notifications@yourdomain.com as the sender.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'BoriHomes <onboarding@resend.dev>';

async function sendAdminNotification(subject, htmlBody) {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    // Not configured yet — silently skip rather than breaking the request
    // the customer is waiting on.
    console.log('Email notifications not configured (missing RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL) — skipping.');
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [NOTIFY_EMAIL],
        subject,
        html: htmlBody,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Resend email failed:', res.status, errText);
    }
  } catch (err) {
    // Never let a notification failure break the customer's enquiry/inspection request.
    console.error('Error sending admin notification email:', err.message);
  }
}

module.exports = { sendAdminNotification };
