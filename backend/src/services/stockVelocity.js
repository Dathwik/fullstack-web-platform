const pool = require('../db');

// Fetches a per-day usage series for every stock-tracked product over the trailing `days`
// window. Pre-aggregating order_items/orders by day in the `usage` CTE before the CROSS JOIN
// with `days` is required for correctness — joining order_items directly against a product×day
// cross join lets an order item's raw quantity leak into every day row, not just the day it
// actually sold on.
async function fetchDailyUsage(days) {
  const result = await pool.query(
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
  for (const row of result.rows) {
    if (!byProduct.has(row.product_id)) {
      byProduct.set(row.product_id, { stockKg: parseFloat(row.stock_kg), quantities: [] });
    }
    byProduct.get(row.product_id).quantities.push(parseFloat(row.qty));
  }
  return byProduct;
}

// Exponential moving average over a chronologically-ordered (oldest-first) daily quantity
// series. `smoothingDays` sets alpha = 2 / (smoothingDays + 1), the standard N-day EMA
// smoothing constant — a smaller value reacts faster to recent days, a larger one smooths
// harder. Returns 0 for an empty series (no history to project from).
function ema(quantities, smoothingDays) {
  if (quantities.length === 0) return 0;
  const alpha = 2 / (smoothingDays + 1);
  let value = quantities[0];
  for (let i = 1; i < quantities.length; i++) {
    value = alpha * quantities[i] + (1 - alpha) * value;
  }
  return value;
}

module.exports = { fetchDailyUsage, ema };
