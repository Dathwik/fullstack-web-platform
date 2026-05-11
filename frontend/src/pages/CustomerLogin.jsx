import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

export default function CustomerLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/customers/login', { email, password });
      navigate('/account');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 0.9rem',
    border: '1.5px solid #ddd', borderRadius: 10,
    fontSize: '1rem', marginBottom: '0.75rem',
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>Sign in</h1>
      <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '1.5rem' }}>
        Sign in to view your past orders and reorder.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          style={inputStyle} type="email" placeholder="Email"
          value={email} onChange={e => setEmail(e.target.value)} required
        />
        <input
          style={inputStyle} type="password" placeholder="Password"
          value={password} onChange={e => setPassword(e.target.value)} required
        />
        {error && <p style={{ color: '#d00', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
        <button
          type="submit" disabled={submitting}
          style={{
            width: '100%', padding: '0.9rem', background: '#1a1a1a',
            color: '#fff', borderRadius: 12, fontWeight: 700,
            fontSize: '1rem', opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p style={{ fontSize: '0.85rem', color: '#888', textAlign: 'center', marginTop: '1.5rem' }}>
        New here? <Link to="/register" style={{ color: '#1a1a1a', fontWeight: 600 }}>Create an account</Link>
      </p>
      <p style={{ fontSize: '0.8rem', color: '#bbb', textAlign: 'center', marginTop: '2.5rem' }}>
        <Link to="/place-order" style={{ color: '#999' }}>Continue as guest</Link>
      </p>
    </div>
  );
}
