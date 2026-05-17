import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api from '../api';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

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

// Inner form that has access to Stripe hooks when wrapped in Elements.
function OrderForm({ customer, reorderItems, products }) {
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();

  const [form, setForm] = useState({
    customer_name: '', phone: '', address: '',
    email: '', special_instructions: '',
  });
  const [items, setItems] = useState(
    reorderItems && reorderItems.length
      ? reorderItems
      : [{ product_id: '', quantity_kg: 1 }]
  );
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from logged-in customer
  useEffect(() => {
    if (customer) {
      setForm(f => ({
        ...f,
        customer_name: f.customer_name || customer.name || '',
        phone:         f.phone         || customer.phone || '',
        email:         f.email         || customer.email || '',
      }));
    }
  }, [customer]);

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
      if (paymentMethod === 'stripe') {
        if (!stripe || !elements)
          return setError('Stripe is not ready. Please try again.');

        // 1. Create the PaymentIntent server-side (total calculated from DB prices).
        let intentRes;
        try {
          intentRes = await api.post('/payments/create-intent', { items });
        } catch (err) {
          setError(err.response?.data?.error || 'Could not initialize payment');
          setSubmitting(false);
          return;
        }
        const { client_secret, payment_intent_id } = intentRes.data;

        // 2. Confirm the card payment with Stripe.js — the customer's card details
        //    never touch our server.
        const { error: stripeError } = await stripe.confirmCardPayment(client_secret, {
          payment_method: { card: elements.getElement(CardElement) },
        });
        if (stripeError) {
          setError(stripeError.message);
          setSubmitting(false);
          return;
        }

        // 3. Create the order, linked to the confirmed PaymentIntent.
        const res = await api.post('/orders/public', {
          ...form, items,
          payment_method: 'stripe',
          stripe_payment_intent_id: payment_intent_id,
        });
        navigate(`/order-confirmation?id=${res.data.id}`);
      } else {
        const res = await api.post('/orders/public', { ...form, items, payment_method: 'cod' });
        navigate(`/order-confirmation?id=${res.data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTotal = items.reduce((sum, item) => {
    const product = products.find(p => p.id === item.product_id);
    return product ? sum + item.quantity_kg * parseFloat(product.price_per_kg) : sum;
  }, 0);

  const onlinePaymentAvailable = !!stripePromise;

  return (
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

        <label style={labelStyle}>Email {paymentMethod === 'stripe' ? '*' : '(optional)'}</label>
        <input
          style={{ ...inputStyle, marginBottom: 0 }}
          placeholder="your@email.com" type="email" value={form.email}
          onChange={e => setField('email', e.target.value)}
          required={paymentMethod === 'stripe'}
        />
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
                <option key={p.id} value={p.id}>
                  {p.name} (${p.price_per_kg}/kg{p.stock_kg !== null ? ` — ${parseFloat(p.stock_kg)}kg left` : ''})
                </option>
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

      {/* Special instructions */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '1rem', marginBottom: '1rem', border: '1.5px solid #e8e8e3' }}>
        <label style={labelStyle}>Special instructions (optional)</label>
        <textarea
          style={{ ...inputStyle, marginBottom: 0, resize: 'vertical', minHeight: 60 }}
          placeholder="Allergy notes, preferred delivery time, etc."
          value={form.special_instructions}
          onChange={e => setField('special_instructions', e.target.value)}
        />
      </div>

      {/* Payment method */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '1rem', marginBottom: '1rem', border: '1.5px solid #e8e8e3' }}>
        <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Payment</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: paymentMethod === 'stripe' ? '1rem' : 0 }}>
          {[
            { value: 'cod',    label: 'Cash on Delivery' },
            { value: 'stripe', label: 'Pay by card', disabled: !onlinePaymentAvailable },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              disabled={opt.disabled}
              onClick={() => setPaymentMethod(opt.value)}
              style={{
                flex: 1, padding: '0.6rem 0.5rem', borderRadius: 10,
                border: paymentMethod === opt.value ? '2px solid #1a1a1a' : '1.5px solid #ddd',
                background: paymentMethod === opt.value ? '#f5f5f0' : '#fff',
                fontWeight: paymentMethod === opt.value ? 700 : 400,
                fontSize: '0.85rem', color: opt.disabled ? '#ccc' : '#1a1a1a',
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {opt.label}
              {opt.disabled && (
                <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 400, color: '#bbb' }}>not enabled</span>
              )}
            </button>
          ))}
        </div>

        {paymentMethod === 'stripe' && (
          <div style={{ border: '1.5px solid #ddd', borderRadius: 10, padding: '0.85rem 0.9rem', background: '#fafafa' }}>
            <CardElement options={{ style: { base: { fontSize: '16px', color: '#1a1a1a', '::placeholder': { color: '#aaa' } } } }} />
          </div>
        )}

        {paymentMethod === 'cod' && (
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
            Pay in cash when your order arrives.
          </p>
        )}
      </div>

      {error && <p style={{ color: '#d00', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}

      <button
        type="submit"
        disabled={submitting || (paymentMethod === 'stripe' && !stripe)}
        style={{
          width: '100%', padding: '1rem', background: '#1a1a1a',
          color: '#fff', borderRadius: 12, fontWeight: 700,
          fontSize: '1rem',
          opacity: (submitting || (paymentMethod === 'stripe' && !stripe)) ? 0.6 : 1,
        }}
      >
        {submitting
          ? (paymentMethod === 'stripe' ? 'Processing payment...' : 'Placing order...')
          : (paymentMethod === 'stripe' ? `Pay $${selectedTotal.toFixed(2)} & Place Order` : 'Place Order')}
      </button>
    </form>
  );
}

export default function PlaceOrder() {
  const location = useLocation();
  const reorderItems = location.state?.reorderItems;
  const [products, setProducts] = useState([]);
  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    api.get('/products').then(r =>
      setProducts(r.data.filter(p => p.is_available && (p.stock_kg === null || parseFloat(p.stock_kg) > 0)))
    );
    api.get('/customers/me').then(r => {
      if (r.data) setCustomer(r.data);
    }).catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>Place an Order</h1>
        <p style={{ fontSize: '0.9rem', color: '#888' }}>Fill in your details and we will deliver to you.</p>
        {customer ? (
          <p style={{ fontSize: '0.82rem', color: '#15803d', marginTop: '0.5rem' }}>
            Signed in as <strong>{customer.name}</strong> · <Link to="/account" style={{ color: '#1a1a1a', fontWeight: 600 }}>My account</Link>
          </p>
        ) : (
          <p style={{ fontSize: '0.82rem', color: '#888', marginTop: '0.5rem' }}>
            Have an account? <Link to="/sign-in" style={{ color: '#1a1a1a', fontWeight: 600 }}>Sign in</Link> to save your details.
          </p>
        )}
        {reorderItems && (
          <p style={{ fontSize: '0.8rem', color: '#1d4ed8', marginTop: '0.5rem', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '0.4rem 0.6rem' }}>
            Items pre-filled from your previous order — review the quantities and submit when ready.
          </p>
        )}
      </div>

      {stripePromise ? (
        <Elements stripe={stripePromise}>
          <OrderForm customer={customer} reorderItems={reorderItems} products={products} />
        </Elements>
      ) : (
        <OrderForm customer={customer} reorderItems={reorderItems} products={products} />
      )}
    </div>
  );
}
