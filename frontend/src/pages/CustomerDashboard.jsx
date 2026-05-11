import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const STATUS_COLORS = {
  'Received':       { bg: '#fff7e6', color: '#b45309', border: '#fcd34d' },
  'In Preparation': { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  'Completed':      { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  'Cancelled':      { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
};

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/customers/me').then(r => {
      if (!r.data) {
        navigate('/sign-in');
        return;
      }
      setCustomer(r.data);
      return api.get('/customers/orders').then(o => setOrders(o.data));
    }).catch(() => navigate('/sign-in')).finally(() => setLoading(false));
  }, [navigate]);

  async function signOut() {
    await api.post('/customers/logout');
    navigate('/sign-in');
  }

  function reorder(order) {
    const reorderItems = order.items.map(i => ({
      product_id: i.product_id,
      quantity_kg: parseFloat(i.quantity_kg),
    }));
    navigate('/place-order', { state: { reorderItems } });
  }

  if (loading) return <p style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>Loading...</p>;
  if (!customer) return null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Hi, {customer.name}</h1>
          <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.15rem' }}>{customer.email}</p>
        </div>
        <button
          onClick={() => navigate('/place-order')}
          style={{
            padding: '0.5rem 0.9rem', borderRadius: 10,
            background: '#1a1a1a', color: '#fff',
            fontSize: '0.85rem', fontWeight: 600,
          }}
        >
          + New order
        </button>
      </div>

      {/* Orders */}
      <p style={{ fontWeight: 600, fontSize: '0.85rem', color: '#555', marginBottom: '0.6rem' }}>Order history</p>

      {orders.length === 0 ? (
        <div style={{ background: '#fff', border: '1.5px dashed #ddd', borderRadius: 12, padding: '2rem 1rem', textAlign: 'center' }}>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '0.75rem' }}>You haven't placed any orders yet.</p>
          <button
            onClick={() => navigate('/place-order')}
            style={{
              padding: '0.6rem 1rem', borderRadius: 10,
              background: '#1a1a1a', color: '#fff',
              fontSize: '0.9rem', fontWeight: 600,
            }}
          >
            Place your first order
          </button>
        </div>
      ) : (
        orders.map(order => {
          const sc = STATUS_COLORS[order.status];
          const total = order.items.reduce(
            (sum, i) => sum + parseFloat(i.quantity_kg) * parseFloat(i.price_per_kg), 0
          );
          return (
            <div key={order.id} style={{
              background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 12,
              padding: '1rem', marginBottom: '0.75rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <p style={{ fontSize: '0.8rem', color: '#888' }}>
                  {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <span style={{
                  padding: '0.2rem 0.6rem', borderRadius: 20,
                  background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                  fontSize: '0.72rem', fontWeight: 600,
                }}>
                  {order.status}
                </span>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#333', marginBottom: '0.6rem' }}>
                {order.items.map(i => `${i.product_name} × ${parseFloat(i.quantity_kg)}kg`).join(', ')}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>${total.toFixed(2)}</p>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => navigate(`/track-order?id=${order.id}`)}
                    style={{
                      padding: '0.4rem 0.75rem', borderRadius: 8,
                      background: '#f0f0eb', color: '#555',
                      fontSize: '0.8rem', fontWeight: 500,
                    }}
                  >
                    Track
                  </button>
                  <button
                    onClick={() => reorder(order)}
                    style={{
                      padding: '0.4rem 0.75rem', borderRadius: 8,
                      background: '#1a1a1a', color: '#fff',
                      fontSize: '0.8rem', fontWeight: 600,
                    }}
                  >
                    Reorder
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      <button
        onClick={signOut}
        style={{ display: 'block', margin: '2rem auto 0', color: '#999', background: 'none', fontSize: '0.85rem' }}
      >
        Sign out
      </button>
    </div>
  );
}
