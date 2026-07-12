const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

// GET /api/products/low-stock?threshold=5 — products below their reorder point (auth required)
// Uses each product's own reorder_point_kg when set; falls back to the global threshold default.
// Ordered by projected days-remaining (stock_kg / trailing-30-day average daily usage) rather
// than raw kg, so a fast-moving product at 4kg surfaces above a slow-moving one at 2kg when it
// will actually run out sooner. Products with no recent sales (no usage to project from) sort
// after any product that does have a projection, ordered by raw kg among themselves.
router.get('/low-stock', requireAuth, async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || 5;
    const result = await pool.query(
      `SELECT p.*, u.avg_daily_usage_kg
       FROM products p
       LEFT JOIN (
         SELECT oi.product_id, SUM(oi.quantity_kg) / 30.0 AS avg_daily_usage_kg
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'Cancelled'
           AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY oi.product_id
       ) u ON u.product_id = p.id
       WHERE p.stock_kg IS NOT NULL
         AND p.stock_kg < COALESCE(p.reorder_point_kg, $1)
       ORDER BY
         CASE WHEN u.avg_daily_usage_kg > 0 THEN p.stock_kg / u.avg_daily_usage_kg END ASC NULLS LAST,
         p.stock_kg ASC`,
      [threshold]
    );
    res.json(result.rows.map(r => {
      const avgDailyUsageKg = r.avg_daily_usage_kg !== null ? parseFloat(r.avg_daily_usage_kg) : 0;
      const stockKg = parseFloat(r.stock_kg);
      return {
        ...r,
        days_remaining: avgDailyUsageKg > 0 ? Math.round(stockKg / avgDailyUsageKg) : null,
      };
    }));
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

// GET /api/products/stock-forecast?days=30 — projected days of stock remaining (auth required)
// avg_daily_usage_kg is an exponential moving average (EMA) over the trailing window's daily
// totals, not a flat mean — alpha = 2 / (days + 1), the standard N-day EMA smoothing constant,
// so a recent shift in demand is reflected faster than an equally-weighted average would allow.
// days_remaining = stock_kg / avg_daily_usage_kg, null when there's no usage to project from.
// Complements reorder_point_kg's fixed-threshold alert with a velocity-aware one.
router.get('/stock-forecast', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 365);

    const dailyRes = await pool.query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, interval '1 day')::date AS day
       ),
       usage AS (
         SELECT oi.product_id, o.created_at::date AS day, SUM(oi.quantity_kg) AS qty
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'Cancelled'
           AND o.created_at >= CURRENT_DATE - ($1::int - 1)
         GROUP BY oi.product_id, o.created_at::date
       )
       SELECT p.id AS product_id, p.stock_kg, d.day, COALESCE(u.qty, 0) AS qty
       FROM products p
       CROSS JOIN days d
       LEFT JOIN usage u ON u.product_id = p.id AND u.day = d.day
       WHERE p.stock_kg IS NOT NULL
       ORDER BY p.id, d.day`,
      [days]
    );

    const byProduct = new Map();
    for (const row of dailyRes.rows) {
      if (!byProduct.has(row.product_id)) {
        byProduct.set(row.product_id, { stockKg: parseFloat(row.stock_kg), quantities: [] });
      }
      byProduct.get(row.product_id).quantities.push(parseFloat(row.qty));
    }

    const alpha = 2 / (days + 1);
    const forecast = [...byProduct.entries()].map(([productId, { stockKg, quantities }]) => {
      let ema = quantities[0];
      for (let i = 1; i < quantities.length; i++) {
        ema = alpha * quantities[i] + (1 - alpha) * ema;
      }
      return {
        id: productId,
        avg_daily_usage_kg: Math.round(ema * 100) / 100,
        days_remaining: ema > 0 ? Math.round(stockKg / ema) : null,
      };
    });

    res.json(forecast);
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
