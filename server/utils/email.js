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

module.exports = { sendJobAssignedEmail };
