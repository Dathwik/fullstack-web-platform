import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/customers/forgot-password', { email });
    } finally {
      // Always show the same "sent" state regardless of outcome — the backend responds
      // identically whether or not the email is registered, so the UI shouldn't leak that
      // distinction either by branching on success vs. failure here.
      setSubmitting(false);
      setSent(true);
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 0.9rem',
    border: '1.5px solid #ddd', borderRadius: 10,
    fontSize: '1rem', marginBottom: '0.75rem',
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>Reset your password</h1>
      <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '1.5rem' }}>
        Enter the email on your account and we'll send a link to reset your password.
      </p>

      {sent ? (
        <p style={{ fontSize: '0.9rem', color: '#15803d', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: '0.9rem' }}>
          If an account exists for that email, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            style={inputStyle} type="email" placeholder="Email"
            value={email} onChange={e => setEmail(e.target.value)} required
          />
          <button
            type="submit" disabled={submitting}
            style={{
              width: '100%', padding: '0.9rem', background: '#1a1a1a',
              color: '#fff', borderRadius: 12, fontWeight: 700,
              fontSize: '1rem', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      )}

      <p style={{ fontSize: '0.85rem', color: '#888', textAlign: 'center', marginTop: '1.5rem' }}>
        <Link to="/sign-in" style={{ color: '#1a1a1a', fontWeight: 600 }}>Back to sign in</Link>
      </p>
    </div>
  );
}
