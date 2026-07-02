// server/utils/email.js — Nodemailer email helper
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function sendVerificationEmail(toEmail, name, token) {
  const link = `${APP_URL}/verify-email?token=${token}`;

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'YardConnect <no-reply@yardconnect.app>',
    to:      toEmail,
    subject: 'Verify your YardConnect account',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0a0a0a;color:#f5f5f0;border-radius:8px;">
        <h1 style="font-size:2rem;margin-bottom:8px;color:#ff3c00;">YardConnect</h1>
        <h2 style="font-size:1.2rem;font-weight:600;margin-bottom:16px;">Hey ${name}, confirm your email</h2>
        <p style="color:rgba(245,245,240,.7);margin-bottom:28px;">
          Click the button below to verify your school email address and activate your account.
          This link expires in <strong>24 hours</strong>.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#ff3c00;color:#fff;padding:14px 32px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:.05em;">
          Verify Email →
        </a>
        <p style="margin-top:24px;font-size:.8rem;color:rgba(245,245,240,.4);">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

async function sendJobAssignedEmail(homeownerEmail, studentName, jobTitle) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      homeownerEmail,
    subject: `YardConnect — ${studentName} accepted your job`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0a0a0a;color:#f5f5f0;border-radius:8px;">
        <h1 style="color:#ff3c00;">YardConnect</h1>
        <p>Great news! <strong>${studentName}</strong> has been assigned to your job <strong>"${jobTitle}"</strong>.</p>
        <p style="color:rgba(245,245,240,.7);">Log in to your account to coordinate details and release payment when the job is complete.</p>
        <a href="${APP_URL}" style="display:inline-block;background:#ff3c00;color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:700;">Go to Dashboard →</a>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendJobAssignedEmail };
