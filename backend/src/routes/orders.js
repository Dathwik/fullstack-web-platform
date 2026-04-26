const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const VALID_TRANSITIONS = {
  'Received':       ['In Preparation', 'Cancelled'],
  'In Preparation': ['Completed'],
  'Completed':      [],
  'Cancelled':      [],
};

// GET /api/orders/export — download all orders as CSV (registered before /:id)
router.get('/export', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.customer_name, o.phone, o.email, o.address, o.status,
              o.payment_received, o.special_instructions, o.created_at,
              COALESCE(json_agg(
                json_build_object(
                  'product_name', p.name,
                  'quantity_kg', oi.quantity_kg,
                  'price_per_kg', p.price_per_kg
                )
              ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );

    const escape = (val) => {
      if (val == null) return '';
      const s = String(val);
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };

    const headers = ['Order ID', 'Customer Name', 'Phone', 'Email', 'Address', 'Status', 'Payment', 'Items', 'Total ($)', 'Date', 'Special Instructions'];
    const lines = [headers.join(',')];

    for (const row of result.rows) {
      const itemsSummary = row.items.map(i => `${i.product_name} x${i.quantity_kg}kg`).join('; ');
      const total = row.items.reduce((sum, i) => sum + parseFloat(i.quantity_kg) * parseFloat(i.price_per_kg), 0);
      lines.push([
        escape(row.id),
        escape(row.customer_name),
        escape(row.phone),
        escape(row.email),
        escape(row.address),
        escape(row.status),
        escape(row.payment_received ? 'Paid' : 'Unpaid'),
        escape(itemsSummary),
        escape(total.toFixed(2)),
        escape(new Date(row.created_at).toISOString()),
        escape(row.special_instructions),
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/new-since?since=<iso-timestamp> — count of Received orders placed after timestamp
router.get('/new-since', requireAuth, async (req, res) => {
  try {
    const { since } = req.query;
    if (!since) return res.json({ count: 0 });
    const result = await pool.query(
      `SELECT COUNT(*) FROM orders WHERE status='Received' AND created_at > $1::timestamptz`,
      [since]
    );
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/stats — summary metrics for the admin dashboard
router.get('/stats', requireAuth, async (_req, res) => {
  try {
    const [todayRes, pendingRes, weekRes, unpaidRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(DISTINCT o.id) AS count,
                COALESCE(SUM(oi.quantity_kg * p.price_per_kg), 0) AS revenue
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE DATE(o.created_at) = CURRENT_DATE`
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM orders
         WHERE status IN ('Received', 'In Preparation')`
      ),
      pool.query(
        `SELECT COUNT(DISTINCT o.id) AS count,
                COALESCE(SUM(oi.quantity_kg * p.price_per_kg), 0) AS revenue
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE o.created_at >= DATE_TRUNC('week', CURRENT_DATE)`
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM orders
         WHERE payment_received = FALSE AND status <> 'Cancelled'`
      ),
    ]);

    res.json({
      today:   { count: parseInt(todayRes.rows[0].count, 10),   revenue: parseFloat(todayRes.rows[0].revenue) },
      pending: { count: parseInt(pendingRes.rows[0].count, 10) },
      week:    { count: parseInt(weekRes.rows[0].count, 10),    revenue: parseFloat(weekRes.rows[0].revenue) },
      unpaid:  { count: parseInt(unpaidRes.rows[0].count, 10) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/track/:id — public order status lookup for customers
router.get('/track/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.customer_name, o.status, o.payment_received, o.created_at,
        COALESCE(json_agg(
          json_build_object(
            'product_name', p.name,
            'quantity_kg', oi.quantity_kg,
            'price_per_kg', p.price_per_kg
          )
        ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.id = $1
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

// GET /api/orders — list all orders with optional status + date filters
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, date_from, date_to } = req.query;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`o.status=$${params.length}::order_status`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`o.created_at >= $${params.length}::date`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`o.created_at < ($${params.length}::date + interval '1 day')`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

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

// Shared helper: validate items, check stock, insert order_items, deduct stock
async function insertItemsWithStockCheck(client, orderId, items) {
  for (const item of items) {
    if (!item.product_id || !item.quantity_kg || item.quantity_kg < 1)
      throw new Error('Each item needs product_id and quantity_kg (min 1kg)');

    const stockRes = await client.query(
      'SELECT stock_kg FROM products WHERE id=$1 FOR UPDATE',
      [item.product_id]
    );
    if (!stockRes.rows.length) throw new Error('Product not found');

    const stock = stockRes.rows[0].stock_kg;
    if (stock !== null && parseFloat(stock) < parseFloat(item.quantity_kg))
      throw new Error(
        `Not enough stock. Requested ${item.quantity_kg}kg but only ${stock}kg available.`
      );

    await client.query(
      'INSERT INTO order_items (order_id, product_id, quantity_kg) VALUES ($1,$2,$3)',
      [orderId, item.product_id, item.quantity_kg]
    );

    if (stock !== null) {
      await client.query(
        'UPDATE products SET stock_kg = stock_kg - $1 WHERE id=$2',
        [item.quantity_kg, item.product_id]
      );
    }
  }
}

// POST /api/orders/public — customer self-service order (no auth required)
router.post('/public', async (req, res) => {
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
       VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
      [customer_name, phone, email || null, address, special_instructions || null]
    );
    const order = orderResult.rows[0];

    await insertItemsWithStockCheck(client, order.id, items);

    await client.query('COMMIT');
    res.status(201).json({ id: order.id, created_at: order.created_at });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/orders — create a new order (operator, auth required)
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

    await insertItemsWithStockCheck(client, order.id, items);

    await client.query('COMMIT');
    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/orders/:id/status — move order through lifecycle (transitions enforced)
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const current = await pool.query('SELECT status FROM orders WHERE id=$1', [req.params.id]);
    if (!current.rows.length)
      return res.status(404).json({ error: 'Order not found' });

    const currentStatus = current.rows[0].status;
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status))
      return res.status(400).json({
        error: `Cannot transition from "${currentStatus}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`,
      });

    const result = await pool.query(
      `UPDATE orders SET status=$1::order_status, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/payment — toggle payment_received
router.patch('/:id/payment', requireAuth, async (req, res) => {
  try {
    const { payment_received } = req.body;
    const result = await pool.query(
      `UPDATE orders SET payment_received=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [Boolean(payment_received), req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id — edit order details (only Received or In Preparation)
router.patch('/:id', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT status FROM orders WHERE id=$1',
      [req.params.id]
    );
    if (!existing.rows.length)
      return res.status(404).json({ error: 'Order not found' });

    const { status } = existing.rows[0];
    if (status === 'Completed' || status === 'Cancelled')
      return res.status(400).json({ error: 'Cannot edit a completed or cancelled order' });

    const { customer_name, phone, address, email, special_instructions, items } = req.body;
    if (!customer_name || !phone || !address)
      return res.status(400).json({ error: 'customer_name, phone, address required' });
    if (!items || items.length === 0)
      return res.status(400).json({ error: 'At least one item required' });

    await client.query('BEGIN');

    // Restore stock for the existing items before replacing them
    const oldItems = await client.query(
      'SELECT product_id, quantity_kg FROM order_items WHERE order_id=$1',
      [req.params.id]
    );
    for (const old of oldItems.rows) {
      await client.query(
        'UPDATE products SET stock_kg = stock_kg + $1 WHERE id=$2 AND stock_kg IS NOT NULL',
        [old.quantity_kg, old.product_id]
      );
    }

    await client.query('DELETE FROM order_items WHERE order_id=$1', [req.params.id]);

    const orderResult = await client.query(
      `UPDATE orders SET
         customer_name=$1, phone=$2, address=$3,
         email=$4, special_instructions=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [customer_name, phone, address, email || null, special_instructions || null, req.params.id]
    );

    await insertItemsWithStockCheck(client, req.params.id, items);

    await client.query('COMMIT');
    res.json(orderResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/orders/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Restore stock before deleting (only for active orders, not completed/cancelled)
    const orderRes = await client.query('SELECT status FROM orders WHERE id=$1', [req.params.id]);
    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await client.query(
      'SELECT product_id, quantity_kg FROM order_items WHERE order_id=$1',
      [req.params.id]
    );
    for (const item of items.rows) {
      await client.query(
        'UPDATE products SET stock_kg = stock_kg + $1 WHERE id=$2 AND stock_kg IS NOT NULL',
        [item.quantity_kg, item.product_id]
      );
    }

    await client.query('DELETE FROM orders WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
