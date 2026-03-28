import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const STATUS_COLORS = {
  'Received':       { bg: '#fff7e6', color: '#b45309', border: '#fcd34d' },
  'In Preparation': { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  'Completed':      { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  'Cancelled':      { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
};

const NEXT_STATUS = {
  'Received':       'In Preparation',
  'In Preparation': 'Completed',
};

export default function Orders({ onLogout }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function fetchOrders() {
    try {
      const res = await api.get('/orders');
      setOrders(res.data);
    } catch {
      // session expired
      onLogout();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOrders(); }, []);

  async function advanceStatus(e, order) {
    e.stopPropagation();
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await api.patch(`/orders/${order.id}/status`, { status: next });
    fetchOrders();
  }

  async function cancelOrder(e, order) {
    e.stopPropagation();
    if (!confirm('Cancel this order?')) return;
    await api.patch(`/orders/${order.id}/status`, { status: 'Cancelled' });
    fetchOrders();
  }

  const filtered = orders.filter(o => {
    if (filter === 'active') return o.status === 'Received' || o.status === 'In Preparation';
    if (filter === 'done')   return o.status === 'Completed' || o.status === 'Cancelled';
    return true;
  });

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Orders</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => navigate('/products')}
            style={{ padding: '0.5rem 0.85rem', borderRadius: 8, background: '#f0f0eb', fontSize: '0.85rem', fontWeight: 500 }}
          >
            Products
          </button>
          <button
            onClick={() => navigate('/new-order')}
            style={{ padding: '0.5rem 0.85rem', borderRadius: 8, background: '#1a1a1a', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}
          >
            + New
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[['active','Active'],['done','Done'],['all','All']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '0.4rem 0.85rem', borderRadius: 20,
            background: filter === val ? '#1a1a1a' : '#f0f0eb',
            color: filter === val ? '#fff' : '#555',
            fontSize: '0.85rem', fontWeight: 500,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <p style={{ color: '#888', textAlign: 'center', marginTop: '3rem' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', marginTop: '3rem' }}>No orders here</p>
      ) : (
        filtered.map(order => {
          const sc = STATUS_COLORS[order.status];
          const next = NEXT_STATUS[order.status];
          const total = order.items?.reduce((sum, i) => sum + i.quantity_kg * i.price_per_kg, 0) ?? 0;
          return (
            <div
              key={order.id}
              onClick={() => navigate(`/orders/${order.id}`)}
              style={{
                background: '#fff', border: '1.5px solid #e8e8e3',
                borderRadius: 12, padding: '1rem',
                marginBottom: '0.75rem', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '1rem' }}>{order.customer_name}</p>
                  <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.1rem' }}>{order.phone}</p>
                </div>
                <span style={{
                  padding: '0.25rem 0.6rem', borderRadius: 20,
                  background: sc.bg, color: sc.color,
                  border: `1px solid ${sc.border}`,
                  fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  {order.status}
                </span>
              </div>

              <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: '0.5rem' }}>
                {order.items?.map(i => `${i.product_name} × ${i.quantity_kg}kg`).join(', ')}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  ${total.toFixed(2)}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {order.status === 'Received' && (
                    <button onClick={e => cancelOrder(e, order)} style={{
                      padding: '0.35rem 0.65rem', borderRadius: 7,
                      background: '#fef2f2', color: '#b91c1c',
                      fontSize: '0.8rem', fontWeight: 500,
                    }}>
                      Cancel
                    </button>
                  )}
                  {next && (
                    <button onClick={e => advanceStatus(e, order)} style={{
                      padding: '0.35rem 0.65rem', borderRadius: 7,
                      background: '#1a1a1a', color: '#fff',
                      fontSize: '0.8rem', fontWeight: 600,
                    }}>
                      {next === 'In Preparation' ? 'Start' : 'Complete'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Logout */}
      <button
        onClick={onLogout}
        style={{ display: 'block', margin: '2rem auto 1rem', color: '#999', background: 'none', fontSize: '0.85rem' }}
      >
        Sign out
      </button>
    </div>
  );
}