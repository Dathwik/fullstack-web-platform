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

const valueStyle = { fontSize: '0.95rem', color: '#1a1a1a' };

const inputStyle = {
  width: '100%', padding: '0.7rem 0.9rem',
  border: '1.5px solid #ddd', borderRadius: 10,
  fontSize: '0.95rem', background: '#fff',
  marginBottom: '0.6rem',
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

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [paymentUpdating, setPaymentUpdating] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editItems, setEditItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

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

  useEffect(() => {
    if (editing) {
      api.get('/products').then(r => setProducts(r.data.filter(p => p.is_available)));
    }
  }, [editing]);

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

  async function togglePayment() {
    setPaymentUpdating(true);
    try {
      await api.patch(`/orders/${order.id}/payment`, { payment_received: !order.payment_received });
      await fetchOrder();
    } finally {
      setPaymentUpdating(false);
    }
  }

  function startEditing() {
    setEditForm({
      customer_name: order.customer_name,
      phone: order.phone,
      address: order.address,
      email: order.email || '',
      special_instructions: order.special_instructions || '',
    });
    setEditItems(order.items.map(i => ({
      product_id: i.product_id,
      quantity_kg: parseFloat(i.quantity_kg),
    })));
    setEditError('');
    setEditing(true);
  }

  function setEditField(field, value) {
    setEditForm(f => ({ ...f, [field]: value }));
  }

  function setEditItem(index, field, value) {
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function addEditItem() {
    setEditItems(prev => [...prev, { product_id: '', quantity_kg: 1 }]);
  }

  function removeEditItem(index) {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  }

  async function saveEdit() {
    setEditError('');
    for (const item of editItems) {
      if (!item.product_id) return setEditError('Select a product for each item');
      if (item.quantity_kg < 1) return setEditError('Minimum quantity is 1kg per item');
    }
    setSaving(true);
    try {
      await api.patch(`/orders/${order.id}`, { ...editForm, items: editItems });
      setEditing(false);
      await fetchOrder();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
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
  const canEdit = order.status === 'Received' || order.status === 'In Preparation';

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1rem 1rem 5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          onClick={() => editing ? setEditing(false) : navigate('/')}
          style={{ background: 'none', fontSize: '1.25rem', color: '#555', padding: '0.25rem' }}
        >
          ←
        </button>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, flex: 1 }}>
          {editing ? 'Edit order' : 'Order detail'}
        </h1>
        {!editing && (
          <span style={{
            padding: '0.25rem 0.75rem', borderRadius: 20,
            background: sc.bg, color: sc.color,
            border: `1px solid ${sc.border}`,
            fontSize: '0.78rem', fontWeight: 600,
          }}>
            {order.status}
          </span>
        )}
        {!editing && canEdit && (
          <button
            onClick={startEditing}
            style={{
              padding: '0.3rem 0.75rem', borderRadius: 8,
              background: '#f0f0eb', color: '#555',
              fontSize: '0.8rem', fontWeight: 500,
            }}
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        /* ── Edit mode ── */
        <>
          {/* Customer fields */}
          <div style={sectionStyle}>
            <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: '#555' }}>Customer</p>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={editForm.customer_name}
              onChange={e => setEditField('customer_name', e.target.value)} placeholder="Full name" />
            <label style={labelStyle}>Phone *</label>
            <input style={inputStyle} value={editForm.phone}
              onChange={e => setEditField('phone', e.target.value)} placeholder="Phone number" />
            <label style={labelStyle}>Address *</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
              value={editForm.address}
              onChange={e => setEditField('address', e.target.value)} placeholder="Delivery address" />
            <label style={labelStyle}>Email (optional)</label>
            <input style={{ ...inputStyle, marginBottom: 0 }} value={editForm.email}
              onChange={e => setEditField('email', e.target.value)} placeholder="Email" type="email" />
          </div>

          {/* Items */}
          <div style={sectionStyle}>
            <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: '#555' }}>Items</p>
            {editItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <select
                  value={item.product_id}
                  onChange={e => setEditItem(i, 'product_id', e.target.value)}
                  style={{ flex: 2, padding: '0.65rem 0.75rem', border: '1.5px solid #ddd', borderRadius: 10, background: '#fff', fontSize: '0.9rem' }}
                >
                  <option value="">Select product</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (${p.price_per_kg}/kg)</option>
                  ))}
                </select>
                <input
                  type="number" min="1" step="0.5"
                  value={item.quantity_kg}
                  onChange={e => setEditItem(i, 'quantity_kg', parseFloat(e.target.value))}
                  style={{ flex: 1, padding: '0.65rem 0.5rem', border: '1.5px solid #ddd', borderRadius: 10, textAlign: 'center', fontSize: '0.9rem' }}
                />
                <span style={{ fontSize: '0.8rem', color: '#888', minWidth: 20 }}>kg</span>
                {editItems.length > 1 && (
                  <button type="button" onClick={() => removeEditItem(i)}
                    style={{ color: '#d00', background: 'none', fontSize: '1.1rem', padding: '0.2rem' }}>×</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addEditItem}
              style={{ marginTop: '0.5rem', color: '#1a1a1a', background: 'none', fontSize: '0.85rem', fontWeight: 600 }}>
              + Add item
            </button>
          </div>

          {/* Notes */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Special instructions</label>
            <textarea
              style={{ ...inputStyle, marginBottom: 0, resize: 'vertical', minHeight: 60 }}
              value={editForm.special_instructions}
              onChange={e => setEditField('special_instructions', e.target.value)}
              placeholder="Allergy notes, delivery time, etc."
            />
          </div>

          {editError && <p style={{ color: '#d00', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{editError}</p>}

          <button
            onClick={saveEdit} disabled={saving}
            style={{
              width: '100%', padding: '0.9rem',
              background: '#1a1a1a', color: '#fff',
              borderRadius: 12, fontWeight: 700, fontSize: '1rem',
              opacity: saving ? 0.6 : 1, marginBottom: '0.5rem',
            }}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{
              width: '100%', padding: '0.75rem',
              background: 'none', color: '#aaa',
              borderRadius: 12, fontSize: '0.9rem',
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        /* ── Read-only view ── */
        <>
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
                  <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>${subtotal.toFixed(2)}</p>
                </div>
              );
            })}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: '0.75rem', paddingTop: '0.75rem',
              borderTop: '1.5px solid #e8e8e3',
            }}>
              <p style={{ fontWeight: 700 }}>Total</p>
              <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>${total.toFixed(2)}</p>
            </div>
          </div>

          {/* Payment */}
          <div style={{ ...sectionStyle, padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: '#999' }}>Payment (COD)</p>
                <p style={{
                  fontSize: '0.85rem', fontWeight: 600,
                  color: order.payment_received ? '#15803d' : '#b45309',
                  marginTop: '0.15rem',
                }}>
                  {order.payment_received ? 'Received' : 'Pending'}
                </p>
              </div>
              <button
                onClick={togglePayment}
                disabled={paymentUpdating}
                style={{
                  padding: '0.4rem 0.9rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                  background: order.payment_received ? '#f0fdf4' : '#1a1a1a',
                  color: order.payment_received ? '#15803d' : '#fff',
                  border: order.payment_received ? '1.5px solid #86efac' : 'none',
                  opacity: paymentUpdating ? 0.6 : 1,
                }}
              >
                {order.payment_received ? 'Mark unpaid' : 'Mark as paid'}
              </button>
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
        </>
      )}
    </div>
  );
}
