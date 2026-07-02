// server/routes/payments.js — Stripe payment integration
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

// Stripe is optional until keys are configured
let stripe = null;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const PLATFORM_FEE_PERCENT = 0.05; // 5% platform fee

function requireStripe(req, res, next) {
  if (!stripe) {
    return res.status(503).json({
      error: 'Payment processing is not configured yet. Add STRIPE_SECRET_KEY to .env to enable payments.',
    });
  }
  next();
}

// ── POST /api/payments/create-intent ───────────────────────
// Homeowner initiates payment for a completed job
router.post('/create-intent', requireAuth, requireRole('homeowner'), requireStripe, async (req, res) => {
  const { job_id } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id required.' });

  const job = db.prepare(`
    SELECT j.*, u.name AS student_name, u.stripe_account_id AS student_stripe_account
    FROM jobs j
    JOIN users u ON u.id = j.student_id
    WHERE j.id = ? AND j.homeowner_id = ?
  `).get(job_id, req.user.id);

  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.status !== 'assigned') return res.status(400).json({ error: 'Job must be assigned before payment.' });

  // Check no existing successful transaction
  const existingTx = db.prepare(
    "SELECT id FROM transactions WHERE job_id = ? AND status = 'paid'"
  ).get(job_id);
  if (existingTx) return res.status(400).json({ error: 'This job has already been paid.' });

  const amountCents   = Math.round(job.pay * 100);
  const feeCents      = Math.round(amountCents * PLATFORM_FEE_PERCENT);
  const payoutCents   = amountCents - feeCents;

  try {
    // Create or retrieve Stripe customer for homeowner
    let customerId = req.user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name:  req.user.name,
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;
      db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?')
        .run(customerId, req.user.id);
    }

    // Create PaymentIntent
    const intentParams = {
      amount:   amountCents,
      currency: 'usd',
      customer: customerId,
      metadata: {
        job_id,
        homeowner_id: req.user.id,
        student_id:   job.student_id,
      },
      description: `YardConnect: Payment for job "${job.title}"`,
    };

    // If student has a connected Stripe account, set up destination charge
    if (job.student_stripe_account) {
      intentParams.transfer_data = {
        destination: job.student_stripe_account,
        amount:      payoutCents,
      };
    }

    const intent = await stripe.paymentIntents.create(intentParams);

    // Record pending transaction
    const txId = uuidv4();
    db.prepare(`
      INSERT INTO transactions (id, job_id, homeowner_id, student_id, amount, platform_fee, student_payout, stripe_payment_intent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId, job_id, req.user.id, job.student_id,
      job.pay, job.pay * PLATFORM_FEE_PERCENT, job.pay * (1 - PLATFORM_FEE_PERCENT),
      intent.id
    );

    return res.json({
      clientSecret:      intent.client_secret,
      publishableKey:    process.env.STRIPE_PUBLISHABLE_KEY,
      amount:            job.pay,
      platformFee:       job.pay * PLATFORM_FEE_PERCENT,
      studentPayout:     job.pay * (1 - PLATFORM_FEE_PERCENT),
      transactionId:     txId,
    });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Payment initiation failed. Please try again.' });
  }
});

// ── POST /api/payments/confirm ─────────────────────────────
// Called after client-side payment succeeds
router.post('/confirm', requireAuth, requireRole('homeowner'), requireStripe, async (req, res) => {
  const { payment_intent_id } = req.body;
  if (!payment_intent_id) return res.status(400).json({ error: 'payment_intent_id required.' });

  try {
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (intent.status !== 'succeeded') {
      return res.status(400).json({ error: `Payment status is ${intent.status}, not succeeded.` });
    }

    // Update transaction and mark job complete
    const tx = db.prepare(
      'SELECT * FROM transactions WHERE stripe_payment_intent = ?'
    ).get(payment_intent_id);

    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
    if (tx.homeowner_id !== req.user.id) return res.status(403).json({ error: 'Not your transaction.' });

    db.prepare("UPDATE transactions SET status = 'paid' WHERE id = ?").run(tx.id);
    db.prepare("UPDATE jobs SET status = 'completed', completed_at = datetime('now') WHERE id = ?")
      .run(tx.job_id);

    return res.json({ message: 'Payment confirmed. Job marked as complete!' });
  } catch (err) {
    console.error('Confirm error:', err.message);
    return res.status(500).json({ error: 'Payment confirmation failed.' });
  }
});

// ── POST /api/payments/webhook ─────────────────────────────
// Stripe webhook (mount BEFORE express.json() in server for raw body)
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe) return res.sendStatus(200);

  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) return res.sendStatus(200); // not configured

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    db.prepare("UPDATE transactions SET status = 'paid' WHERE stripe_payment_intent = ?")
      .run(intent.id);
    db.prepare(`
      UPDATE jobs SET status = 'completed', completed_at = datetime('now')
      WHERE id = (SELECT job_id FROM transactions WHERE stripe_payment_intent = ?)
    `).run(intent.id);
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    db.prepare("UPDATE transactions SET status = 'failed' WHERE stripe_payment_intent = ?")
      .run(intent.id);
  }

  return res.sendStatus(200);
});

// ── GET /api/payments/history ───────────────────────────────
router.get('/history', requireAuth, (req, res) => {
  let txs;
  if (req.user.role === 'homeowner') {
    txs = db.prepare(`
      SELECT t.*, j.title AS job_title, u.name AS student_name
      FROM transactions t
      JOIN jobs j ON j.id = t.job_id
      JOIN users u ON u.id = t.student_id
      WHERE t.homeowner_id = ?
      ORDER BY t.created_at DESC
    `).all(req.user.id);
  } else {
    txs = db.prepare(`
      SELECT t.*, j.title AS job_title, u.name AS homeowner_name
      FROM transactions t
      JOIN jobs j ON j.id = t.job_id
      JOIN users u ON u.id = t.homeowner_id
      WHERE t.student_id = ?
      ORDER BY t.created_at DESC
    `).all(req.user.id);
  }
  return res.json({ transactions: txs });
});

// ── POST /api/payments/onboard-student ─────────────────────
// Start Stripe Connect onboarding for a student
router.post('/onboard-student', requireAuth, requireRole('student'), requireStripe, async (req, res) => {
  try {
    let accountId = req.user.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type:         'express',
        country:      'US',
        email:        req.user.email,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        metadata:     { userId: req.user.id },
      });
      accountId = account.id;
      db.prepare('UPDATE users SET stripe_account_id = ? WHERE id = ?')
        .run(accountId, req.user.id);
    }

    const accountLink = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: `${process.env.APP_URL}/dashboard?stripe=refresh`,
      return_url:  `${process.env.APP_URL}/dashboard?stripe=success`,
      type:        'account_onboarding',
    });

    return res.json({ url: accountLink.url });
  } catch (err) {
    console.error('Stripe onboard error:', err.message);
    return res.status(500).json({ error: 'Failed to start payment setup. Please try again.' });
  }
});

module.exports = router;
