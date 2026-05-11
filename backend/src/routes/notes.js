const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');
const requireAuth = require('../middleware/auth');

// All routes are nested under /api/orders/:id/notes and require admin auth.

// GET /api/orders/:id/notes
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, body, created_at
         FROM order_notes
        WHERE order_id=$1
        ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/notes
router.post('/', requireAuth, async (req, res) => {
  try {
    const body = (req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Note body required' });
    if (body.length > 1000) return res.status(400).json({ error: 'Note too long (max 1000 chars)' });

    const orderRes = await pool.query('SELECT id FROM orders WHERE id=$1', [req.params.id]);
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Order not found' });

    const result = await pool.query(
      `INSERT INTO order_notes (order_id, body)
       VALUES ($1, $2)
       RETURNING id, body, created_at`,
      [req.params.id, body]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id/notes/:noteId
router.delete('/:noteId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM order_notes WHERE id=$1 AND order_id=$2 RETURNING id',
      [req.params.noteId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
