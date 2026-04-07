import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  async function fetchOrder() {
    try {
      const res = await api.get(`/orders/${id}`);
      setOrder(res.data);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOrder(); }, [id]);

  async function advanceStatus() {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setUpdating(true);
    await api.patch(`/orders/${order.id}/status`, { status: next });
    await fetchOrder();
    setUpdating(false);
  }

  async function cancelOrder() {
    if (!confirm('Cancel this order?')) return;
    setUpdating(true);
    await api.patch(`/orders/${order.id}/status`, { status: 'Cancelled' });
    await fetchOrder();
    setUpdating(false);
  }

  async function deleteOrder() {
    if (!confirm('Permanently delete this order?')) return;
    await api.delete(`/orders/${order.id}`);
    navigate('/');
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>Loading...</div>
  );

  if (!order) return null;

  const sc = STATUS_COLORS[order.status];
  const next = NEXT_STATUS[order.status];
  const total = order.items?.reduce(
    (sum, i) => sum + parseFloat(i.quantity_kg) * parseFloat(i.price_per_kg), 0
  ) ?? 0;
  const createdAt = new Date(order.created_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const sectionStyle = {
    background: '#fff',
    border: '1.5px solid #e8e8e3',
    borderRadius: 12,
    padding: '1rem',
    marginBottom: '0.75rem',
  };

  const labelStyle = {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.2rem',
  };

  const valueStyle = {
    fontSize: '0.95rem',
    color: '#1a1a1a',
  };

  function Field({ label, value }) {
    if (!value) return null;
    return (
      <div style={{ marginBottom: '0.85rem' }}>
        <p style={labelStyle}>{label}</p>
        <p style={valueStyle}>{value}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1rem 1rem 5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', fontSize: '1.25rem', color: '#555', padding: '0.25rem' }}
        >
          ←
        </button>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, flex: 1 }}>Order detail</h1>
        <span style={{
          padding: '0.25rem 0.75rem',
          borderRadius: 20,
          background: sc.bg,
          color: sc.color,
          border: `1px solid ${sc.border}`,
          fontSize: '0.78rem',
          fontWeight: 600,
        }}>
          {order.status}
        </span>
      </div>

      {/* Customer */}
      <div style={sectionStyle}>
        <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: '#555' }}>Customer</p>
        <Field label="Name" value={order.customer_name} />
        <Field label="Phone" value={order.phone} />
        <Field label="Email" value={order.email} />
        <Field label="Address" value={order.address} />
        {order.special_instructions && (
          <div style={{ marginBottom: 0 }}>
            <p style={labelStyle}>Special instructions</p>
            <p style={{ ...valueStyle, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.9rem' }}>
              {order.special_instructions}
            </p>
          </div>
        )}
      </div>

      {/* Items */}
      <div style={sectionStyle}>
        <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: '#555' }}>Items</p>
        {order.items?.map((item, i) => {
          const subtotal = parseFloat(item.quantity_kg) * parseFloat(item.price_per_kg);
          return (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.6rem 0',
              borderBottom: i < order.items.length - 1 ? '1px solid #f0f0eb' : 'none',
            }}>
              <div>
                <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>{item.product_name}</p>
                <p style={{ fontSize: '0.8rem', color: '#888' }}>
                  {item.quantity_kg}kg × ${parseFloat(item.price_per_kg).toFixed(2)}/kg
                </p>
              </div>
              <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                ${subtotal.toFixed(2)}
              </p>
            </div>
          );
        })}

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '0.75rem', paddingTop: '0.75rem',
          borderTop: '1.5px solid #e8e8e3',
        }}>
          <p style={{ fontWeight: 700 }}>Total</p>
          <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>${total.toFixed(2)}</p>
        </div>
      </div>

      {/* Meta */}
      <div style={{ ...sectionStyle, padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '0.8rem', color: '#999' }}>Placed</p>
          <p style={{ fontSize: '0.8rem', color: '#555' }}>{createdAt}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem' }}>
          <p style={{ fontSize: '0.8rem', color: '#999' }}>Order ID</p>
          <p style={{ fontSize: '0.75rem', color: '#aaa', fontFamily: 'monospace' }}>
            {order.id.slice(0, 8)}…
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
        {next && (
          <button
            onClick={advanceStatus}
            disabled={updating}
            style={{
              width: '100%', padding: '0.9rem',
              background: '#1a1a1a', color: '#fff',
              borderRadius: 12, fontWeight: 700, fontSize: '1rem',
              opacity: updating ? 0.6 : 1,
            }}
          >
            {updating ? 'Updating...' : `Mark as ${next}`}
          </button>
        )}

        {order.status === 'Received' && (
          <button
            onClick={cancelOrder}
            disabled={updating}
            style={{
              width: '100%', padding: '0.9rem',
              background: '#fef2f2', color: '#b91c1c',
              borderRadius: 12, fontWeight: 600, fontSize: '1rem',
              border: '1.5px solid #fca5a5',
              opacity: updating ? 0.6 : 1,
            }}
          >
            Cancel order
          </button>
        )}

        {(order.status === 'Completed' || order.status === 'Cancelled') && (
          <button
            onClick={deleteOrder}
            style={{
              width: '100%', padding: '0.75rem',
              background: 'none', color: '#ccc',
              borderRadius: 12, fontSize: '0.9rem',
            }}
          >
            Delete order
          </button>
        )}
      </div>
    </div>
  );
}