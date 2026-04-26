import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';

const STATUS_COLORS = {
  'Received':       { bg: '#fff7e6', color: '#b45309', border: '#fcd34d' },
  'In Preparation': { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  'Completed':      { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  'Cancelled':      { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
};

const STATUS_DESC = {
  'Received':       'Your order has been received and is waiting to be prepared.',
  'In Preparation': 'Your order is currently being prepared.',
  'Completed':      'Your order has been completed.',
  'Cancelled':      'This order has been cancelled. Please contact us for details.',
};

export default function TrackOrder() {
  const [searchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(searchParams.get('id') || '');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    const id = orderId.trim();
    if (!id) return;
    setError('');
    setOrder(null);
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get(`/orders/track/${id}`);
      setOrder(res.data);
    } catch {
      setError('Order not found. Please check your order ID and try again.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-search if ?id= is in URL on first render
  useState(() => {
    if (searchParams.get('id')) {
      const id = searchParams.get('id').trim();
      setLoading(true);
      setSearched(true);
      api.get(`/orders/track/${id}`)
        .then(res => setOrder(res.data))
        .catch(() => setError('Order not found. Please check your order ID and try again.'))
        .finally(() => setLoading(false));
    }
  });

  const total = order?.items?.reduce(
    (sum, i) => sum + parseFloat(i.quantity_kg) * parseFloat(i.price_per_kg), 0
  ) ?? 0;

  const sc = order ? STATUS_COLORS[order.status] : null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '2rem 1rem 4rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.35rem' }}>Track your order</h1>
      <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '1.5rem' }}>
        Enter the order ID from your confirmation page.
      </p>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          value={orderId}
          onChange={e => setOrderId(e.target.value)}
          placeholder="Order ID"
          style={{
            flex: 1, padding: '0.75rem 0.9rem',
            border: '1.5px solid #ddd', borderRadius: 10,
            fontSize: '0.95rem', fontFamily: 'monospace',
          }}
        />
        <button
          type="submit" disabled={loading}
          style={{
            padding: '0.75rem 1.25rem', borderRadius: 10,
            background: '#1a1a1a', color: '#fff',
            fontWeight: 600, fontSize: '0.95rem',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '...' : 'Track'}
        </button>
      </form>

      {error && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <p style={{ color: '#b91c1c', fontSize: '0.9rem' }}>{error}</p>
        </div>
      )}

      {order && sc && (
        <div>
          {/* Status card */}
          <div style={{ background: sc.bg, border: `1.5px solid ${sc.border}`, borderRadius: 12, padding: '1.25rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: sc.color }}>{order.status}</p>
              <span style={{ fontSize: '0.75rem', color: sc.color, opacity: 0.8 }}>
                {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <p style={{ fontSize: '0.88rem', color: sc.color, opacity: 0.85 }}>{STATUS_DESC[order.status]}</p>
          </div>

          {/* Order info */}
          <div style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 12, padding: '1rem', marginBottom: '0.75rem' }}>
            <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: '#555' }}>Order for {order.customer_name}</p>
            {order.items?.map((item, i) => {
              const subtotal = parseFloat(item.quantity_kg) * parseFloat(item.price_per_kg);
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '0.5rem 0',
                  borderBottom: i < order.items.length - 1 ? '1px solid #f0f0eb' : 'none',
                }}>
                  <div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{item.product_name}</p>
                    <p style={{ fontSize: '0.78rem', color: '#888' }}>{item.quantity_kg}kg × ${parseFloat(item.price_per_kg).toFixed(2)}/kg</p>
                  </div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>${subtotal.toFixed(2)}</p>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1.5px solid #e8e8e3' }}>
              <p style={{ fontWeight: 700 }}>Total</p>
              <p style={{ fontWeight: 700, fontSize: '1.05rem' }}>${total.toFixed(2)}</p>
            </div>
          </div>

          {/* Payment */}
          <div style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 12, padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '0.85rem', color: '#999' }}>Payment (Cash on Delivery)</p>
              <span style={{
                fontSize: '0.82rem', fontWeight: 600,
                color: order.payment_received ? '#15803d' : '#b45309',
              }}>
                {order.payment_received ? 'Received' : 'Pending'}
              </span>
            </div>
          </div>
        </div>
      )}

      {!searched && !order && (
        <p style={{ color: '#bbb', textAlign: 'center', marginTop: '3rem', fontSize: '0.9rem' }}>
          Your order ID was shown on the confirmation page after placing your order.
        </p>
      )}
    </div>
  );
}
