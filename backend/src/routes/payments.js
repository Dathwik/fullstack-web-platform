const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return require('stripe')(key);
}

// POST /api/payments/create-intent
// Creates a Stripe PaymentIntent from the submitted items; the total is computed
// server-side from the current database prices so the client cannot tamper with it.
router.post('/create-intent', async (req, res) => {
  try {
    const stripe = getStripe();
    const { items } = req.body;
    if (!items || !items.length)
      return res.status(400).json({ error: 'At least one item required' });

    let totalCents = 0;
    for (const item of items) {
      if (!item.product_id || !item.quantity_kg || item.quantity_kg < 1)
        return res.status(400).json({ error: 'Each item needs product_id and quantity_kg (min 1kg)' });
      const result = await pool.query(
        'SELECT price_per_kg, is_available FROM products WHERE id=$1',
        [item.product_id]
      );
      if (!result.rows.length || !result.rows[0].is_available)
        return res.status(400).json({ error: 'Product not found or unavailable' });
      totalCents += Math.round(
        parseFloat(result.rows[0].price_per_kg) * parseFloat(item.quantity_kg) * 100
      );
    }

    if (totalCents < 50)
      return res.status(400).json({ error: 'Order total is below the minimum charge amount' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      payment_method_types: ['card'],
    });

    res.json({ client_secret: paymentIntent.client_secret, payment_intent_id: paymentIntent.id });
  } catch (err) {
    if (err.message === 'STRIPE_SECRET_KEY not configured')
      return res.status(503).json({ error: 'Online payments are not enabled on this server' });
    res.status(500).json({ error: err.message });
  }
});

// Exported separately so app.js can mount it before express.json() with express.raw().
// Stripe requires the raw request body to verify the webhook signature.
async function webhookHandler(req, res) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret)
    return res.status(503).json({ error: 'Webhook secret not configured' });

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  // Idempotency: log the event; if event_id already exists this is a Stripe retry —
  // ON CONFLICT DO NOTHING returns 0 rows, so we skip re-processing safely.
  let isNew = true;
  try {
    const logResult = await pool.query(
      `INSERT INTO webhook_events (event_id, event_type, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [event.id, event.type, JSON.stringify(event)]
    );
    isNew = logResult.rowCount > 0;
  } catch (err) {
    console.error('Webhook log insert failed:', err.message);
  }

  if (isNew && event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    try {
      await pool.query(
        `UPDATE orders SET payment_received=TRUE, updated_at=NOW()
          WHERE stripe_payment_intent=$1`,
        [pi.id]
      );
    } catch (err) {
      console.error('Webhook DB update failed:', err.message);
    }
  }

  res.json({ received: true });
}

// GET /api/payments/webhook-events — last 20 Stripe webhook events (admin only)
router.get('/webhook-events', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id,
         event_id,
         event_type,
         payload->'data'->'object'->>'id' AS object_id,
         created_at
       FROM webhook_events
       ORDER BY created_at DESC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.webhookHandler = webhookHandler;
