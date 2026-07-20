const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { fetchDailyUsage, ema } = require('../services/stockVelocity');

// How many trailing days of history feed the low-stock alert's urgency ranking. Fixed (not a
// query param) since this is only used for sort order on a banner, not displayed as a figure.
const LOW_STOCK_VELOCITY_DAYS = 30;

// GET /api/products/low-stock?threshold=5 — products below their reorder point (auth required)
// Uses each product's own reorder_point_kg when set; falls back to the global threshold default.
// Ordered by projected days-remaining (stock_kg / EMA of trailing daily usage — the same
// fetchDailyUsage/ema helpers stock-forecast uses) rather than raw kg, so a fast-moving product
// at 4kg surfaces above a slow-moving one at 2kg when it will actually run out sooner. Products
// with no recent sales (no usage to project from) sort after any product that does have a
// projection, ordered by raw kg among themselves.
router.get('/low-stock', requireAuth, async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || 5;
    const productsRes = await pool.query(
      `SELECT * FROM products
       WHERE stock_kg IS NOT NULL
         AND stock_kg < COALESCE(reorder_point_kg, $1)`,
      [threshold]
    );
    if (!productsRes.rows.length) return res.json([]);

    const byProduct = await fetchDailyUsage(LOW_STOCK_VELOCITY_DAYS);
    const withForecast = productsRes.rows.map(p => {
      const entry = byProduct.get(p.id);
      const avgDailyUsageKg = entry ? ema(entry.quantities, LOW_STOCK_VELOCITY_DAYS) : 0;
      const stockKg = parseFloat(p.stock_kg);
      return {
        ...p,
        days_remaining: avgDailyUsageKg > 0 ? Math.round(stockKg / avgDailyUsageKg) : null,
      };
    });

    withForecast.sort((a, b) => {
      if (a.days_remaining === null) return b.days_remaining === null ? parseFloat(a.stock_kg) - parseFloat(b.stock_kg) : 1;
      if (b.days_remaining === null) return -1;
      return a.days_remaining - b.days_remaining;
    });

    res.json(withForecast);
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

// GET /api/products/stock-forecast?days=30&smoothing=14 — projected days of stock remaining
// (auth required). avg_daily_usage_kg is an exponential moving average (EMA), not a flat mean,
// so a recent shift in demand is reflected faster than an equally-weighted average would allow.
// `days` sets how much trailing history is fetched; `smoothing` independently sets how reactive
// the EMA is (alpha = 2 / (smoothing + 1)) and defaults to `days` when omitted — separating the
// two lets an administrator look back over a long window while still weighting recent days more
// heavily than a smoothing value equal to the window would. prev_avg_daily_usage_kg is the same
// EMA computed over the immediately preceding `days`-length window, for a trend comparison.
// days_remaining = stock_kg / avg_daily_usage_kg, null when there's no usage to project from.
// Complements reorder_point_kg's fixed-threshold alert with a velocity-aware one.
router.get('/stock-forecast', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 180);
    const smoothing = req.query.smoothing
      ? Math.min(Math.max(parseInt(req.query.smoothing, 10), 1), days)
      : days;

    const byProduct = await fetchDailyUsage(days * 2);
    const forecast = [...byProduct.entries()].map(([productId, { stockKg, quantities }]) => {
      const prevQuantities = quantities.slice(0, days);
      const currQuantities = quantities.slice(days);
      const avgDailyUsageKg = ema(currQuantities, smoothing);
      const prevAvgDailyUsageKg = ema(prevQuantities, smoothing);
      return {
        id: productId,
        avg_daily_usage_kg: Math.round(avgDailyUsageKg * 100) / 100,
        prev_avg_daily_usage_kg: Math.round(prevAvgDailyUsageKg * 100) / 100,
        days_remaining: avgDailyUsageKg > 0 ? Math.round(stockKg / avgDailyUsageKg) : null,
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
