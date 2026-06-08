const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { sendOrderStatusEmail } = require('../services/mailer');

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
    const [todayRes, pendingRes, weekRes, unpaidRes, agingRes] = await Promise.all([
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
      pool.query(
        `SELECT COUNT(*) AS count FROM orders
         WHERE status = 'Received'
           AND created_at < NOW() - INTERVAL '4 hours'`
      ),
    ]);

    res.json({
      today:   { count: parseInt(todayRes.rows[0].count, 10),   revenue: parseFloat(todayRes.rows[0].revenue) },
      pending: { count: parseInt(pendingRes.rows[0].count, 10) },
      week:    { count: parseInt(weekRes.rows[0].count, 10),    revenue: parseFloat(weekRes.rows[0].revenue) },
      unpaid:  { count: parseInt(unpaidRes.rows[0].count, 10) },
      aging:   { count: parseInt(agingRes.rows[0].count, 10) },
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
        ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items,
        row_to_json(r.*) AS review
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN reviews r ON r.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id, r.id`,
      [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/bulk-status — advance or cancel multiple orders at once (auth required)
router.patch('/bulk-status', requireAuth, async (req, res) => {
  try {
    const { order_ids, status } = req.body;
    if (!Array.isArray(order_ids) || order_ids.length === 0)
      return res.status(400).json({ error: 'order_ids must be a non-empty array' });
    if (!['In Preparation', 'Cancelled'].includes(status))
      return res.status(400).json({ error: 'Bulk status update only supports "In Preparation" or "Cancelled"' });

    // Only orders currently in a state that allows this transition are updated;
    // the rest are silently skipped — single UPDATE statement is atomic so either
    // all qualifying rows are committed or none (no partial failure possible).
    const validFrom = status === 'In Preparation' ? ['Received'] : ['Received'];
    const result = await pool.query(
      `UPDATE orders
         SET status = $1::order_status, updated_at = NOW()
       WHERE id = ANY($2::uuid[])
         AND status = ANY($3::order_status[])
       RETURNING id`,
      [status, order_ids, validFrom]
    );

    const updatedIds = new Set(result.rows.map(r => r.id));
    const skipped    = order_ids.filter(id => !updatedIds.has(id));

    res.json({ updated: result.rows.length, skipped: skipped.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/top-customers?limit=10&days=90 — top customers by total spend (auth required)
router.get('/top-customers', requireAuth, async (req, res) => {
  try {
    const days  = Math.min(parseInt(req.query.days,  10) || 90,  365);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10,   50);

    const result = await pool.query(
      `WITH customer_totals AS (
         SELECT
           o.phone,
           MAX(o.customer_name)                        AS customer_name,
           MAX(o.customer_id)                          AS customer_id,
           COUNT(DISTINCT o.id)                        AS total_orders,
           COALESCE(SUM(oi.quantity_kg * p.price_per_kg), 0) AS total_revenue,
           MAX(o.created_at)                           AS last_order_at
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN products p     ON p.id = oi.product_id
         WHERE o.status <> 'Cancelled'
           AND o.created_at >= CURRENT_DATE - ($1 || ' days')::interval
         GROUP BY o.phone
       )
       SELECT
         phone,
         customer_name,
         customer_id,
         total_orders,
         total_revenue,
         last_order_at,
         RANK() OVER (ORDER BY total_revenue DESC) AS rank
       FROM customer_totals
       ORDER BY total_revenue DESC
       LIMIT $2`,
      [days, limit]
    );

    res.json(result.rows.map(r => ({
      phone:          r.phone,
      customer_name:  r.customer_name,
      customer_id:    r.customer_id,
      total_orders:   parseInt(r.total_orders,  10),
      total_revenue:  parseFloat(r.total_revenue),
      last_order_at:  r.last_order_at,
      rank:           parseInt(r.rank, 10),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/analytics — last 7 days of order counts and revenue by day
router.get('/analytics', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         gs.day::date AS date,
         COUNT(DISTINCT o.id) AS orders,
         COALESCE(SUM(oi.quantity_kg * p.price_per_kg), 0) AS revenue
       FROM generate_series(
         CURRENT_DATE - INTERVAL '6 days',
         CURRENT_DATE,
         '1 day'::interval
       ) AS gs(day)
       LEFT JOIN orders o
         ON DATE(o.created_at) = gs.day::date
        AND o.status <> 'Cancelled'
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       GROUP BY gs.day
       ORDER BY gs.day ASC`
    );
    res.json(result.rows.map(r => ({
      date:    r.date,
      orders:  parseInt(r.orders, 10),
      revenue: parseFloat(r.revenue),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders — list all orders with optional status + date + search filters
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, date_from, date_to, search, aging } = req.query;
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
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(o.customer_name ILIKE $${params.length} OR o.phone LIKE $${params.length})`);
    }
    if (aging === 'true') {
      conditions.push(`(o.status = 'Received' AND o.created_at < NOW() - INTERVAL '4 hours')`);
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

// GET /api/orders/:id/invoice — download a PDF invoice for the order (auth required)
router.get('/:id/invoice', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*,
         COALESCE(json_agg(
           json_build_object(
             'product_name', p.name,
             'price_per_kg', p.price_per_kg,
             'quantity_kg', oi.quantity_kg
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

    const order = result.rows[0];
    const total = order.items.reduce(
      (s, i) => s + parseFloat(i.quantity_kg) * parseFloat(i.price_per_kg), 0
    );
    const shortId = order.id.slice(0, 8).toUpperCase();
    const placedAt = new Date(order.created_at).toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${shortId}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', { align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor('#888')
       .text('Spice & Crunch Foods', { align: 'right' })
       .text('support@spiceandcrunch.com', { align: 'right' });
    doc.moveDown(1.5);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e0e0e0').stroke();
    doc.moveDown(0.75);

    // Order meta
    doc.fillColor('#333').fontSize(9).font('Helvetica-Bold').text('ORDER NUMBER');
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a1a1a').text(`#${shortId}`);
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#888').text(`Placed: ${placedAt}`);
    doc.fontSize(9).fillColor(order.status === 'Completed' ? '#15803d' : '#b45309')
       .text(`Status: ${order.status}`);
    doc.moveDown(1);

    // Bill-to block
    doc.fillColor('#888').fontSize(9).font('Helvetica-Bold').text('BILL TO');
    doc.fillColor('#1a1a1a').fontSize(10).font('Helvetica')
       .text(order.customer_name)
       .text(order.phone);
    if (order.email) doc.text(order.email);
    doc.text(order.address);
    if (order.special_instructions) {
      doc.moveDown(0.4);
      doc.fillColor('#888').fontSize(8).text('Special instructions:');
      doc.fillColor('#555').fontSize(9).text(order.special_instructions);
    }
    doc.moveDown(1.25);

    // Items table header
    const COL = { item: 50, qty: 330, rate: 390, amount: 470 };
    doc.fillColor('#1a1a1a').fontSize(9).font('Helvetica-Bold');
    doc.text('ITEM', COL.item, doc.y);
    doc.text('QTY (kg)', COL.qty, doc.y - doc.currentLineHeight(), { width: 55, align: 'right' });
    doc.text('RATE/kg', COL.rate, doc.y - doc.currentLineHeight(), { width: 70, align: 'right' });
    doc.text('AMOUNT', COL.amount, doc.y - doc.currentLineHeight(), { width: 75, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#333').lineWidth(1).stroke();
    doc.moveDown(0.4);

    // Items rows
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a');
    for (const item of order.items) {
      const subtotal = parseFloat(item.quantity_kg) * parseFloat(item.price_per_kg);
      const rowY = doc.y;
      doc.text(item.product_name, COL.item, rowY, { width: 265 });
      doc.text(parseFloat(item.quantity_kg).toFixed(2), COL.qty, rowY, { width: 55, align: 'right' });
      doc.text(`$${parseFloat(item.price_per_kg).toFixed(2)}`, COL.rate, rowY, { width: 70, align: 'right' });
      doc.text(`$${subtotal.toFixed(2)}`, COL.amount, rowY, { width: 75, align: 'right' });
      doc.moveDown(0.6);
    }

    // Total
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    const totalY = doc.y;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a1a');
    doc.text('TOTAL', COL.rate, totalY, { width: 70, align: 'right' });
    doc.text(`$${total.toFixed(2)}`, COL.amount, totalY, { width: 75, align: 'right' });
    doc.moveDown(1.5);

    // Payment status
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(9).fillColor('#888').text('Payment method: ');
    const payMethod = order.payment_method === 'stripe' ? 'Online (Card)' : 'Cash on Delivery';
    const payStatus = order.payment_received ? 'PAID' : 'PENDING';
    const payColor  = order.payment_received ? '#15803d' : '#b45309';
    doc.moveUp();
    doc.fontSize(9).fillColor('#555').text(`${payMethod}  `, { continued: true });
    doc.fillColor(payColor).font('Helvetica-Bold').text(payStatus);

    // Footer
    doc.moveDown(3);
    doc.fillColor('#bbb').fontSize(8).font('Helvetica')
       .text('Thank you for your order!', { align: 'center' });

    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
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
    const {
      customer_name, phone, address, email, special_instructions, items,
      payment_method, stripe_payment_intent_id,
    } = req.body;
    if (!customer_name || !phone || !address)
      return res.status(400).json({ error: 'customer_name, phone, address required' });
    if (!items || items.length === 0)
      return res.status(400).json({ error: 'At least one item required' });

    const method = payment_method === 'stripe' ? 'stripe' : 'cod';

    // For Stripe orders the PaymentIntent must already be confirmed by the frontend
    // before this endpoint is called — we just record the intent ID and the webhook
    // will set payment_received=true when Stripe fires payment_intent.succeeded.
    if (method === 'stripe' && !stripe_payment_intent_id)
      return res.status(400).json({ error: 'stripe_payment_intent_id required for online payments' });

    await client.query('BEGIN');

    const customerId = req.session?.customer_id || null;
    const orderResult = await client.query(
      `INSERT INTO orders
         (customer_name, phone, email, address, special_instructions, customer_id,
          payment_method, stripe_payment_intent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, created_at`,
      [
        customer_name, phone, email || null, address, special_instructions || null,
        customerId, method, method === 'stripe' ? stripe_payment_intent_id : null,
      ]
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
    const updatedOrder = result.rows[0];
    res.json(updatedOrder);

    // Fire-and-forget: send status notification email if the customer provided one.
    sendOrderStatusEmail(updatedOrder, status);
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
