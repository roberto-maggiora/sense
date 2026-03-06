import nodemailer from 'nodemailer';

export async function sendEmail(options: { to: string[], subject: string, html: string }) {
    const { to, subject, html } = options;

    if (!to || to.length === 0) {
        console.warn(`[MAILER] No recipients provided for email: "${subject}". Skipping send.`);
        return;
    }

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || '"Sense Platform" <noreply@sense.local>';
    const secure = process.env.SMTP_SECURE === 'true';

    // Fallback to console if SMTP env vars are not fully configured
    if (!host) {
        console.log(`\n================= CONSOLE EMAIL TRANSPORT =================`);
        console.log(`To:      ${to.join(', ')}`);
        console.log(`From:    ${from}`);
        console.log(`Subject: ${subject}`);
        console.log(`-----------------------------------------------------------`);
        // Log a summary slice of the HTML to avoid blowing out the console
        console.log(html.slice(0, 500) + (html.length > 500 ? '\n... (truncated)' : ''));
        console.log(`===========================================================\n`);
        return;
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure, // true for 465, false for other ports
        auth: user && pass ? { user, pass } : undefined,
    });

    try {
        const info = await transporter.sendMail({
            from,
            to: to.join(', '),
            subject,
            html,
        });
        console.log(`[MAILER] Message sent successfully: ${info.messageId} to ${to.length} recipients.`);
    } catch (error) {
        console.error(`[MAILER] Failed to send email to ${to.length} recipients:`, error);
        throw error; // Rethrow to let the dispatcher's retry backoff handle it
    }
}
