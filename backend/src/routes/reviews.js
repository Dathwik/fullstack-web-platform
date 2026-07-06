const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

// POST /api/reviews — submit a review for a completed order (public)
router.post('/', async (req, res) => {
  try {
    const { order_id, rating, comment } = req.body;
    if (!order_id) return res.status(400).json({ error: 'order_id required' });
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ error: 'rating must be between 1 and 5' });

    const orderRes = await pool.query('SELECT status FROM orders WHERE id=$1', [order_id]);
    if (!orderRes.rows.length)
      return res.status(404).json({ error: 'Order not found' });
    if (orderRes.rows[0].status !== 'Completed')
      return res.status(400).json({ error: 'Reviews can only be submitted for completed orders' });

    const result = await pool.query(
      `INSERT INTO reviews (order_id, rating, comment)
       VALUES ($1, $2, $3) RETURNING *`,
      [order_id, rating, comment || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'A review has already been submitted for this order' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reviews/order/:order_id — fetch review for a given order (public)
router.get('/order/:order_id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM reviews WHERE order_id=$1',
      [req.params.order_id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'No review found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reviews/stats?days=30 — rating distribution and average (admin only)
// Registered before / to avoid route shadowing concerns with future nested routes.
// Without `days`, stats cover all reviews ever submitted. With `days`, stats are scoped
// to the trailing window and a `prev_avg_rating` for the equally-sized prior window is
// included so the admin can see whether the average is trending up or down.
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const days = req.query.days ? Math.min(parseInt(req.query.days, 10), 365) : null;
    const whereCurrent = days ? `WHERE created_at >= NOW() - ($1 || ' days')::interval` : '';
    const params = days ? [days] : [];

    const distRes = await pool.query(
      `SELECT rating, COUNT(*) AS star_count FROM reviews ${whereCurrent} GROUP BY rating`,
      params
    );
    const avgRes = await pool.query(
      `SELECT ROUND(AVG(rating)::numeric, 1) AS avg FROM reviews ${whereCurrent}`,
      params
    );

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalCount = 0;
    for (const r of distRes.rows) {
      const count = parseInt(r.star_count, 10);
      distribution[parseInt(r.rating, 10)] = count;
      totalCount += count;
    }
    const avg = avgRes.rows[0].avg !== null ? parseFloat(avgRes.rows[0].avg) : null;

    let prevAvgRating = null;
    if (days) {
      const prevRes = await pool.query(
        `SELECT ROUND(AVG(rating)::numeric, 1) AS avg FROM reviews
         WHERE created_at >= NOW() - ($1 || ' days')::interval
           AND created_at <  NOW() - ($2 || ' days')::interval`,
        [days * 2, days]
      );
      prevAvgRating = prevRes.rows[0].avg !== null ? parseFloat(prevRes.rows[0].avg) : null;
    }

    res.json({ avg_rating: avg, total_count: totalCount, distribution, days, prev_avg_rating: prevAvgRating });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reviews — list all reviews (admin only)
router.get('/', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, o.customer_name, o.phone
       FROM reviews r
       JOIN orders o ON o.id = r.order_id
       ORDER BY r.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
