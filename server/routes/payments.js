// server/routes/payments.js — Stripe payments
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

// Validate key format — must be a real key, not a placeholder
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripeKeyValid = /^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(STRIPE_KEY);

let stripe = null;
if (stripeKeyValid) {
  stripe = require('stripe')(STRIPE_KEY);
}

const PLATFORM_FEE = 0.05;

function requireStripe(req, res, next) {
  if (!stripe) {
    return res.status(503).json({
      error: 'Payments not yet configured. Add STRIPE_SECRET_KEY to .env.',
    });
  }
  next();
}

// ── POST /api/payments/create-intent ───────────────────────
// Poster pays — identified by poster_email, no account needed
router.post('/create-intent', requireStripe, [
  body('job_id').trim().notEmpty(),
  body('poster_email').isEmail().normalizeEmail(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { job_id, poster_email } = req.body;
  const job = db.prepare(`
    SELECT j.*, u.stripe_account_id AS student_stripe_account
    FROM jobs j LEFT JOIN users u ON u.id = j.student_id
    WHERE j.id = ?
  `).get(job_id);

  if (!job) return res.status(404).json({ error: 'Task not found.' });
  if (job.poster_email !== poster_email) {
    return res.status(403).json({ error: 'Email does not match this task.' });
  }
  if (!['assigned', 'pending_payment'].includes(job.status)) {
    return res.status(400).json({ error: 'Task must be assigned before payment.' });
  }

  const existingTx = db.prepare("SELECT id FROM transactions WHERE job_id = ? AND status = 'paid'").get(job_id);
  if (existingTx) return res.status(400).json({ error: 'This task has already been paid.' });

  const amountCents = Math.round(job.pay * 100);
  const feeCents    = Math.round(amountCents * PLATFORM_FEE);
  const payoutCents = amountCents - feeCents;

  try {
    const intentParams = {
      amount:      amountCents,
      currency:    'usd',
      description: `Campus Hands: "${job.title}"`,
      metadata:    { job_id, poster_email },
    };

    if (job.student_stripe_account) {
      intentParams.transfer_data = {
        destination: job.student_stripe_account,
        amount:      payoutCents,
      };
    }

    const intent = await stripe.paymentIntents.create(intentParams);

    const txId = uuidv4();
    db.prepare(`
      INSERT INTO transactions (id, job_id, student_id, amount, platform_fee, student_payout, stripe_payment_intent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(txId, job_id, job.student_id, job.pay,
           job.pay * PLATFORM_FEE, job.pay * (1 - PLATFORM_FEE), intent.id);

    // Mark job as pending_payment if not already
    db.prepare("UPDATE jobs SET status = 'pending_payment' WHERE id = ? AND status = 'assigned'")
      .run(job_id);

    return res.json({
      clientSecret:   intent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      amount:         job.pay,
      platformFee:    job.pay * PLATFORM_FEE,
      studentPayout:  job.pay * (1 - PLATFORM_FEE),
      transactionId:  txId,
    });
  } catch (err) {
    console.error('Stripe error:', err.message);
    // Surface Stripe's actual message in development so it's easier to debug
    const msg = process.env.NODE_ENV !== 'production' && err.message
      ? err.message
      : 'Payment failed to start. Try again.';
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/payments/confirm ─────────────────────────────
router.post('/confirm', requireStripe, [
  body('payment_intent_id').trim().notEmpty(),
  body('poster_email').isEmail().normalizeEmail(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { payment_intent_id, poster_email } = req.body;

  try {
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (intent.status !== 'succeeded') {
      return res.status(400).json({ error: `Payment not completed (status: ${intent.status}).` });
    }

    const tx = db.prepare('SELECT * FROM transactions WHERE stripe_payment_intent = ?').get(payment_intent_id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

    const job = db.prepare('SELECT poster_email FROM jobs WHERE id = ?').get(tx.job_id);
    if (!job || job.poster_email !== poster_email) {
      return res.status(403).json({ error: 'Email mismatch.' });
    }

    db.prepare("UPDATE transactions SET status = 'paid' WHERE id = ?").run(tx.id);
    db.prepare("UPDATE jobs SET status = 'active' WHERE id = ?").run(tx.job_id);

    return res.json({ message: 'Payment confirmed. Work can now begin!' });
  } catch (err) {
    console.error('Confirm error:', err.message);
    const msg = process.env.NODE_ENV !== 'production' && err.message
      ? err.message
      : 'Payment confirmation failed.';
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/payments/webhook ─────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.sendStatus(200);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const id = event.data.object.id;
    db.prepare("UPDATE transactions SET status = 'paid' WHERE stripe_payment_intent = ?").run(id);
    db.prepare(`UPDATE jobs SET status = 'active'
                WHERE id = (SELECT job_id FROM transactions WHERE stripe_payment_intent = ?)`).run(id);
  }
  if (event.type === 'payment_intent.payment_failed') {
    db.prepare("UPDATE transactions SET status = 'failed' WHERE stripe_payment_intent = ?")
      .run(event.data.object.id);
  }
  return res.sendStatus(200);
});

// ── GET /api/payments/history — student's earnings ─────────
router.get('/history', requireAuth, (req, res) => {
  const txs = db.prepare(`
    SELECT t.*, j.title AS job_title, j.poster_name
    FROM transactions t JOIN jobs j ON j.id = t.job_id
    WHERE t.student_id = ?
    ORDER BY t.created_at DESC
  `).all(req.user.id);
  return res.json({ transactions: txs });
});

// ── POST /api/payments/onboard-student — Stripe Connect ─────
router.post('/onboard-student', requireAuth, requireStripe, async (req, res) => {
  try {
    let accountId = req.user.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type:          'express',
        country:       'US',
        email:         req.user.email,
        capabilities:  { transfers: { requested: true } },
        business_type: 'individual',
        metadata:      { userId: req.user.id },
      });
      accountId = account.id;
      db.prepare('UPDATE users SET stripe_account_id = ? WHERE id = ?')
        .run(accountId, req.user.id);
    }

    const link = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: `${process.env.APP_URL}/dashboard.html?stripe=refresh`,
      return_url:  `${process.env.APP_URL}/dashboard.html?stripe=success`,
      type:        'account_onboarding',
    });

    return res.json({ url: link.url });
  } catch (err) {
    console.error('Stripe onboard error:', err.message);
    return res.status(500).json({ error: 'Failed to start payout setup.' });
  }
});

module.exports = router;
