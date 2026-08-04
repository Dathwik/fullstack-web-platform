const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const requireCustomer = require('../middleware/customerAuth');
const loginLimiter = require('../middleware/rateLimiter');
const { sendEmailChangeVerification } = require('../services/mailer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

// POST /api/customers/register — public, creates account and signs the customer in
router.post('/register', loginLimiter, async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ error: 'email, password, name required' });
    if (!EMAIL_RE.test(email))
      return res.status(400).json({ error: 'Invalid email address' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO customers (email, password_hash, name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, phone`,
      [email.toLowerCase(), password_hash, name, phone || null]
    );
    const customer = result.rows[0];
    req.session.customer_id = customer.id;
    res.status(201).json(customer);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'An account with that email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/login — public, verifies credentials and sets session
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password required' });

    const result = await pool.query(
      'SELECT id, email, name, phone, password_hash FROM customers WHERE email=$1',
      [email.toLowerCase()]
    );
    if (!result.rows.length)
      return res.status(401).json({ error: 'Invalid email or password' });

    const customer = result.rows[0];
    const valid = await bcrypt.compare(password, customer.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Invalid email or password' });

    req.session.customer_id = customer.id;
    res.json({ id: customer.id, email: customer.email, name: customer.name, phone: customer.phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/logout — clears the customer session field
router.post('/logout', (req, res) => {
  if (req.session) delete req.session.customer_id;
  res.json({ success: true });
});

// GET /api/customers/me — returns the signed-in customer or null
router.get('/me', async (req, res) => {
  if (!req.session?.customer_id) return res.json(null);
  try {
    const result = await pool.query(
      'SELECT id, email, name, phone FROM customers WHERE id=$1',
      [req.session.customer_id]
    );
    if (!result.rows.length) {
      delete req.session.customer_id;
      return res.json(null);
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/customers/me — update the signed-in customer's name and/or phone
// Email is intentionally not editable here since it's the login identifier and is unique-
// constrained; changing it would need its own re-verification flow, out of scope for this route.
router.patch('/me', requireCustomer, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const fields = [], params = [];
    let i = 1;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
      fields.push(`name=$${i++}`);
      params.push(name.trim());
    }
    if (phone !== undefined) {
      fields.push(`phone=$${i++}`);
      params.push(phone || null);
    }
    if (!fields.length)
      return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.session.customer_id);
    const result = await pool.query(
      `UPDATE customers SET ${fields.join(', ')} WHERE id=$${i} RETURNING id, email, name, phone`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/customers/me/password — change the signed-in customer's password
// Requires the current password (not just an active session) since a session cookie alone can
// be left behind on a shared device — re-proving the password before a security-sensitive change
// is the same reasoning the admin login and Stripe webhook signing already apply elsewhere.
router.patch('/me/password', requireCustomer, loginLimiter, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'current_password and new_password required' });
    if (new_password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const result = await pool.query(
      'SELECT password_hash FROM customers WHERE id=$1',
      [req.session.customer_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Account not found' });

    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE customers SET password_hash=$1 WHERE id=$2', [password_hash, req.session.customer_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/me/email — request an email change (auth required)
// The address on the account is left untouched until the new one is confirmed via the emailed
// link — writing it immediately would let someone lock the real owner out just by mistyping (or
// deliberately entering) an email they don't control.
router.post('/me/email', requireCustomer, loginLimiter, async (req, res) => {
  try {
    const { new_email } = req.body;
    if (!new_email || !EMAIL_RE.test(new_email))
      return res.status(400).json({ error: 'Invalid email address' });

    const normalized = new_email.toLowerCase();
    const existing = await pool.query(
      'SELECT id FROM customers WHERE email=$1 AND id <> $2',
      [normalized, req.session.customer_id]
    );
    if (existing.rows.length)
      return res.status(409).json({ error: 'An account with that email already exists' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    const result = await pool.query(
      `UPDATE customers
       SET pending_email=$1, email_verify_token=$2, email_verify_expires=$3
       WHERE id=$4
       RETURNING name`,
      [normalized, token, expires, req.session.customer_id]
    );

    await sendEmailChangeVerification(normalized, result.rows[0].name, token);
    res.json({ pending_email: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/verify-email?token=... — confirm a pending email change (public)
// Public (not requireCustomer) because the link is opened from an email client, which may not
// carry the session cookie that initiated the change — the token itself is the proof of intent.
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token required' });

    const result = await pool.query(
      `SELECT id, pending_email, email_verify_expires FROM customers
       WHERE email_verify_token=$1`,
      [token]
    );
    if (!result.rows.length)
      return res.status(400).json({ error: 'Invalid or already-used verification link' });

    const row = result.rows[0];
    if (!row.pending_email || new Date(row.email_verify_expires) < new Date())
      return res.status(400).json({ error: 'This verification link has expired' });

    const updated = await pool.query(
      `UPDATE customers
       SET email=$1, pending_email=NULL, email_verify_token=NULL, email_verify_expires=NULL
       WHERE id=$2
       RETURNING id, email, name, phone`,
      [row.pending_email, row.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'That email was claimed by another account in the meantime' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/stats — lifetime order count, total spend, and account age (auth required)
// Cancelled orders are excluded from both total_orders and total_spent, since neither figure
// should reflect an order that was never actually fulfilled or paid for.
router.get('/stats', requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         (SELECT created_at FROM customers WHERE id = $1) AS member_since,
         COUNT(DISTINCT o.id) AS total_orders,
         COALESCE(SUM(oi.quantity_kg * p.price_per_kg), 0) AS total_spent
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.customer_id = $1
         AND o.status <> 'Cancelled'`,
      [req.session.customer_id]
    );
    const row = result.rows[0];
    res.json({
      member_since: row.member_since,
      total_orders: parseInt(row.total_orders, 10),
      total_spent: parseFloat(row.total_spent),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/orders — past orders for the signed-in customer
router.get('/orders', requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.payment_received, o.created_at,
              COALESCE(json_agg(
                json_build_object(
                  'product_id', oi.product_id,
                  'product_name', p.name,
                  'price_per_kg', p.price_per_kg,
                  'quantity_kg', oi.quantity_kg
                )
              ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE o.customer_id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC`,
      [req.session.customer_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
