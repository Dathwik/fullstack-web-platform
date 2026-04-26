const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

// GET /api/products — public, used to populate order forms
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products — add a new product
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, price_per_kg, stock_kg } = req.body;
    if (!name || !price_per_kg)
      return res.status(400).json({ error: 'name and price_per_kg required' });
    const result = await pool.query(
      'INSERT INTO products (name, price_per_kg, stock_kg) VALUES ($1, $2, $3) RETURNING *',
      [name, price_per_kg, stock_kg !== undefined ? stock_kg : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/products/:id — edit name, price, availability, or stock
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { name, price_per_kg, is_available, stock_kg } = req.body;
    const fields = [], params = [];
    let i = 1;
    if (name !== undefined)         { fields.push(`name=$${i++}`);         params.push(name); }
    if (price_per_kg !== undefined) { fields.push(`price_per_kg=$${i++}`); params.push(price_per_kg); }
    if (is_available !== undefined) { fields.push(`is_available=$${i++}`); params.push(is_available); }
    if (stock_kg !== undefined)     { fields.push(`stock_kg=$${i++}`);     params.push(stock_kg); }
    if (!fields.length)
      return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`,
      params
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id=$1 RETURNING id', [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
