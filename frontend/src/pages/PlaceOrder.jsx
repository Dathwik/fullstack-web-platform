import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function PlaceOrder() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    customer_name: '', phone: '', address: '',
    email: '', special_instructions: '',
  });
  const [items, setItems] = useState([{ product_id: '', quantity_kg: 1 }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/products').then(r => setProducts(r.data.filter(p => p.is_available)));
  }, []);

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function setItem(index, field, value) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function addItem() {
    setItems(prev => [...prev, { product_id: '', quantity_kg: 1 }]);
  }

  function removeItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    for (const item of items) {
      if (!item.product_id) return setError('Please select a product for each item');
      if (item.quantity_kg < 1) return setError('Minimum quantity is 1kg per item');
    }
    setSubmitting(true);
    try {
      const res = await api.post('/orders/public', { ...form, items });
      navigate(`/order-confirmation?id=${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 0.9rem',
    border: '1.5px solid #ddd', borderRadius: 10,
    fontSize: '1rem', background: '#fff', outline: 'none',
    marginBottom: '0.75rem',
  };

  const labelStyle = {
    display: 'block', fontSize: '0.8rem',
    fontWeight: 600, color: '#555',
    marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  };

  const selectedTotal = items.reduce((sum, item) => {
    const product = products.find(p => p.id === item.product_id);
    return product ? sum + item.quantity_kg * parseFloat(product.price_per_kg) : sum;
  }, 0);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>Place an Order</h1>
        <p style={{ fontSize: '0.9rem', color: '#888' }}>Fill in your details and we will deliver to you.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Customer info */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '1rem', marginBottom: '1rem', border: '1.5px solid #e8e8e3' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Your details</p>

          <label style={labelStyle}>Name *</label>
          <input style={inputStyle} placeholder="Full name" value={form.customer_name}
            onChange={e => setField('customer_name', e.target.value)} required />

          <label style={labelStyle}>Phone *</label>
          <input style={inputStyle} placeholder="Phone number" type="tel" value={form.phone}
            onChange={e => setField('phone', e.target.value)} required />

          <label style={labelStyle}>Delivery address *</label>
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
            placeholder="Street, city, zip" value={form.address}
            onChange={e => setField('address', e.target.value)} required />

          <label style={labelStyle}>Email (optional)</label>
          <input style={{ ...inputStyle, marginBottom: 0 }} placeholder="your@email.com" type="email" value={form.email}
            onChange={e => setField('email', e.target.value)} />
        </div>

        {/* Items */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '1rem', marginBottom: '1rem', border: '1.5px solid #e8e8e3' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Items</p>

          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <select
                value={item.product_id}
                onChange={e => setItem(i, 'product_id', e.target.value)}
                style={{ flex: 2, padding: '0.7rem 0.75rem', border: '1.5px solid #ddd', borderRadius: 10, background: '#fff', fontSize: '0.95rem' }}
              >
                <option value="">Select item</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (${p.price_per_kg}/kg)</option>
                ))}
              </select>
              <input
                type="number" min="1" step="0.5"
                value={item.quantity_kg}
                onChange={e => setItem(i, 'quantity_kg', parseFloat(e.target.value))}
                style={{ flex: 1, padding: '0.7rem 0.5rem', border: '1.5px solid #ddd', borderRadius: 10, textAlign: 'center', fontSize: '0.95rem' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#888', minWidth: 20 }}>kg</span>
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(i)}
                  style={{ color: '#d00', background: 'none', fontSize: '1.1rem', padding: '0.2rem' }}>×</button>
              )}
            </div>
          ))}

          <button type="button" onClick={addItem}
            style={{ marginTop: '0.5rem', color: '#1a1a1a', background: 'none', fontSize: '0.85rem', fontWeight: 600, padding: '0.25rem 0' }}>
            + Add another item
          </button>

          {selectedTotal > 0 && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f0f0eb', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', color: '#555' }}>Estimated total</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>${selectedTotal.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '1rem', marginBottom: '1rem', border: '1.5px solid #e8e8e3' }}>
          <label style={labelStyle}>Special instructions (optional)</label>
          <textarea
            style={{ ...inputStyle, marginBottom: 0, resize: 'vertical', minHeight: 60 }}
            placeholder="Allergy notes, preferred delivery time, etc."
            value={form.special_instructions}
            onChange={e => setField('special_instructions', e.target.value)}
          />
        </div>

        {error && <p style={{ color: '#d00', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}

        <button
          type="submit" disabled={submitting}
          style={{
            width: '100%', padding: '1rem', background: '#1a1a1a',
            color: '#fff', borderRadius: 12, fontWeight: 700,
            fontSize: '1rem', opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Placing order...' : 'Place Order'}
        </button>
      </form>
    </div>
  );
}
