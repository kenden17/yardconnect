// server/utils/email.js — Nodemailer email helper
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const GREEN   = '#22c55e';

// Escape user-supplied strings before interpolating into HTML email bodies
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

async function sendJobAssignedEmail(posterEmail, posterName, studentName, jobTitle) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'Campus Hands <no-reply@campushands.app>',
    to:      posterEmail,
    subject: `Campus Hands — ${escHtml(studentName)} will handle your task`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;
                  background:#0a0a0a;color:#f5f5f0;border-radius:8px;">
        <h1 style="color:${GREEN};">Campus Hands</h1>
        <p>Hi ${escHtml(posterName)},</p>
        <p><strong>${escHtml(studentName)}</strong> has been assigned to your task
           <strong>&ldquo;${escHtml(jobTitle)}&rdquo;</strong>.</p>
        <p style="color:rgba(245,245,240,.7);">
          They'll reach out to coordinate. Once the task is complete, release payment
          through your manage link.
        </p>
        <a href="${APP_URL}" style="display:inline-block;background:${GREEN};color:#000;
           padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:700;">
          Go to Campus Hands →
        </a>
      </div>
    `,
  });
}

async function sendOtpEmail(email, code, action) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'Campus Hands <no-reply@campushands.app>',
    to:      email,
    subject: `Campus Hands — Your verification code`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;
                  background:#0a0a0a;color:#f5f5f0;border-radius:8px;">
        <h1 style="color:${GREEN};">Campus Hands</h1>
        <p>Your one-time code to <strong>${escHtml(action)}</strong> is:</p>
        <div style="font-size:2.4rem;font-weight:700;letter-spacing:.3em;
                    text-align:center;color:${GREEN};padding:24px 0;">
          ${escHtml(code)}
        </div>
        <p style="color:rgba(245,245,240,.7);">
          This code expires in 10 minutes. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendJobAssignedEmail, sendOtpEmail };
