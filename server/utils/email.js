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

async function sendVerificationEmail(toEmail, name, token) {
  const link = `${APP_URL}/api/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'Campus Hands <no-reply@campushands.app>',
    to:      toEmail,
    subject: 'Verify your Campus Hands account',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;
                  background:#0a0a0a;color:#f5f5f0;border-radius:8px;">
        <h1 style="font-size:2rem;margin-bottom:4px;color:${GREEN};">Campus Hands</h1>
        <p style="color:rgba(245,245,240,.5);font-size:.85rem;margin-bottom:24px;">
          Student verified. Real jobs. Real pay.
        </p>
        <h2 style="font-size:1.2rem;font-weight:600;margin-bottom:12px;">
          Hey ${name}, one click to activate your account
        </h2>
        <p style="color:rgba(245,245,240,.7);margin-bottom:28px;">
          Click below to verify your school email and finish creating your account.
          This link expires in <strong>24 hours</strong>.
        </p>
        <a href="${link}"
           style="display:inline-block;background:${GREEN};color:#000;padding:14px 32px;
                  border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:.05em;">
          Verify &amp; Activate Account →
        </a>
        <p style="margin-top:24px;font-size:.8rem;color:rgba(245,245,240,.35);">
          If you didn't sign up, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

async function sendJobAssignedEmail(posterEmail, posterName, studentName, jobTitle) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'Campus Hands <no-reply@campushands.app>',
    to:      posterEmail,
    subject: `Campus Hands — ${studentName} will handle your task`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;
                  background:#0a0a0a;color:#f5f5f0;border-radius:8px;">
        <h1 style="color:${GREEN};">Campus Hands</h1>
        <p>Hi ${posterName},</p>
        <p><strong>${studentName}</strong> has been assigned to your task
           <strong>"${jobTitle}"</strong>.</p>
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

module.exports = { sendVerificationEmail, sendJobAssignedEmail };
