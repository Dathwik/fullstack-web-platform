import { useSearchParams, useNavigate } from 'react-router-dom';

export default function OrderConfirmation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get('id');

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '3rem 1.5rem', textAlign: 'center' }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: '#f0fdf4', border: '2px solid #86efac',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.5rem', fontSize: '2rem',
      }}>
        ✓
      </div>

      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Order received!</h1>
      <p style={{ color: '#555', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
        Thank you for your order. We will contact you to confirm delivery.
      </p>

      {orderId && (
        <div style={{
          background: '#f8f8f6', borderRadius: 10, padding: '0.85rem 1.25rem',
          display: 'inline-block', marginBottom: '2rem',
        }}>
          <p style={{ fontSize: '0.75rem', color: '#999', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order reference</p>
          <p style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 600, color: '#1a1a1a' }}>
            {orderId.slice(0, 8).toUpperCase()}
          </p>
        </div>
      )}

      <button
        onClick={() => navigate('/place-order')}
        style={{
          display: 'block', width: '100%', padding: '0.9rem',
          background: '#1a1a1a', color: '#fff',
          borderRadius: 12, fontWeight: 600, fontSize: '1rem',
          marginBottom: '0.75rem',
        }}
      >
        Place another order
      </button>
    </div>
  );
}
