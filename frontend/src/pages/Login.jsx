import { useState } from 'react';
import api from '../api';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/login', { password });
      onLogin();
    } catch {
      setError('Wrong password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex',
      flexDirection: 'column', justifyContent: 'center',
      alignItems: 'center', padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Snack Orders
        </h1>
        <p style={{ color: '#666', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Sign in to manage orders
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '0.85rem 1rem',
              border: '1.5px solid #ddd', borderRadius: 10,
              fontSize: '1rem', marginBottom: '0.75rem',
              outline: 'none', background: '#fff',
            }}
          />
          {error && (
            <p style={{ color: '#d00', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '0.85rem',
              background: '#1a1a1a', color: '#fff',
              borderRadius: 10, fontWeight: 600,
              fontSize: '1rem', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}