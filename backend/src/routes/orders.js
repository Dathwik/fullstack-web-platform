const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

// GET /api/orders — list all orders with their items
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) {
      where = 'WHERE o.status=$1::order_status';
      params.push(status);
    }
    const result = await pool.query(
      `SELECT o.*,
        COALESCE(json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', p.name,
            'price_per_kg', p.price_per_kg,
            'quantity_kg', oi.quantity_kg
          )
        ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       ${where}
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id — single order detail
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*,
        COALESCE(json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', p.name,
            'price_per_kg', p.price_per_kg,
            'quantity_kg', oi.quantity_kg
          )
        ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.id=$1
       GROUP BY o.id`,
      [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders — create a new order (operator enters while on the phone)
router.post('/', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_name, phone, address, email, special_instructions, items } = req.body;
    if (!customer_name || !phone || !address)
      return res.status(400).json({ error: 'customer_name, phone, address required' });
    if (!items || items.length === 0)
      return res.status(400).json({ error: 'At least one item required' });

    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, phone, email, address, special_instructions)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [customer_name, phone, email || null, address, special_instructions || null]
    );
    const order = orderResult.rows[0];

    for (const item of items) {
      if (!item.product_id || !item.quantity_kg || item.quantity_kg < 1)
        throw new Error('Each item needs product_id and quantity_kg (min 1kg)');
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity_kg) VALUES ($1,$2,$3)',
        [order.id, item.product_id, item.quantity_kg]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/orders/:id/status — move order through lifecycle
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const valid = ['Received', 'In Preparation', 'Completed', 'Cancelled'];
    const { status } = req.body;
    if (!valid.includes(status))
      return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
    const result = await pool.query(
      `UPDATE orders SET status=$1::order_status, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM orders WHERE id=$1 RETURNING id', [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;