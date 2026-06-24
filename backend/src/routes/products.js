const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

// GET /api/products/low-stock?threshold=5 — products below their reorder point (auth required)
// Uses each product's own reorder_point_kg when set; falls back to the global threshold default.
router.get('/low-stock', requireAuth, async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || 5;
    const result = await pool.query(
      `SELECT * FROM products
       WHERE stock_kg IS NOT NULL
         AND stock_kg < COALESCE(reorder_point_kg, $1)
       ORDER BY stock_kg ASC`,
      [threshold]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/stock-movements?limit=20 — recent inventory changes (auth required)
router.get('/stock-movements', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const result = await pool.query(
      `SELECT
         sm.id,
         p.name  AS product_name,
         sm.delta_kg,
         sm.type,
         sm.order_id,
         sm.created_at
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       ORDER BY sm.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows.map(r => ({
      id:           r.id,
      product_name: r.product_name,
      delta_kg:     parseFloat(r.delta_kg),
      type:         r.type,
      order_id:     r.order_id,
      created_at:   r.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/analytics?days=30 — sales breakdown per product (auth required)
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
    const result = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.price_per_kg,
         COUNT(DISTINCT oi.order_id)            AS total_orders,
         COALESCE(SUM(oi.quantity_kg), 0)       AS total_quantity_kg,
         COALESCE(SUM(oi.quantity_kg * p.price_per_kg), 0) AS total_revenue
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       LEFT JOIN orders o
         ON o.id = oi.order_id
        AND o.status <> 'Cancelled'
        AND o.created_at >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY p.id
       ORDER BY total_revenue DESC`,
      [days]
    );
    res.json(result.rows.map(r => ({
      id:                r.id,
      name:              r.name,
      price_per_kg:      parseFloat(r.price_per_kg),
      total_orders:      parseInt(r.total_orders, 10),
      total_quantity_kg: parseFloat(r.total_quantity_kg),
      total_revenue:     parseFloat(r.total_revenue),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const { name, price_per_kg, is_available, stock_kg, reorder_point_kg } = req.body;

    // Fetch current stock before update so we can compute the delta for manual restocks
    let oldStockKg = undefined;
    if (stock_kg !== undefined) {
      const cur = await pool.query('SELECT stock_kg FROM products WHERE id=$1', [req.params.id]);
      if (!cur.rows.length) return res.status(404).json({ error: 'Product not found' });
      oldStockKg = cur.rows[0].stock_kg;
    }

    const fields = [], params = [];
    let i = 1;
    if (name !== undefined)             { fields.push(`name=$${i++}`);              params.push(name); }
    if (price_per_kg !== undefined)     { fields.push(`price_per_kg=$${i++}`);      params.push(price_per_kg); }
    if (is_available !== undefined)     { fields.push(`is_available=$${i++}`);      params.push(is_available); }
    if (stock_kg !== undefined)         { fields.push(`stock_kg=$${i++}`);          params.push(stock_kg); }
    if (reorder_point_kg !== undefined) { fields.push(`reorder_point_kg=$${i++}`); params.push(reorder_point_kg); }
    if (!fields.length)
      return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`,
      params
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Product not found' });

    // Record stock movement when admin manually sets stock_kg and both values are numeric
    if (stock_kg !== undefined && stock_kg !== null && oldStockKg !== null && oldStockKg !== undefined) {
      const delta = parseFloat(stock_kg) - parseFloat(oldStockKg);
      if (delta !== 0) {
        await pool.query(
          `INSERT INTO stock_movements (product_id, delta_kg, type) VALUES ($1, $2, 'manual_restock')`,
          [req.params.id, delta]
        );
      }
    }

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
