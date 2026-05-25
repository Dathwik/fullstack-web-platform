const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const requireCustomer = require('../middleware/customerAuth');
const loginLimiter = require('../middleware/rateLimiter');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
