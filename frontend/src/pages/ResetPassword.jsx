import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/customers/reset-password', { token, new_password: password });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 0.9rem',
    border: '1.5px solid #ddd', borderRadius: 10,
    fontSize: '1rem', marginBottom: '0.75rem',
  };

  if (!token) {
    return (
      <div style={{ maxWidth: 400, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#b91c1c', marginBottom: '0.5rem' }}>Invalid link</p>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>This reset link is missing its token.</p>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ maxWidth: 400, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#15803d', marginBottom: '0.5rem' }}>Password updated</p>
        <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Sign in with your new password.
        </p>
        <button
          onClick={() => navigate('/sign-in')}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 10, background: '#1a1a1a', color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}
        >
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>Choose a new password</h1>
      <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '1.5rem' }}>
        At least 8 characters.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          style={inputStyle} type="password" placeholder="New password"
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
          {submitting ? 'Saving...' : 'Reset password'}
        </button>
      </form>

      <p style={{ fontSize: '0.85rem', color: '#888', textAlign: 'center', marginTop: '1.5rem' }}>
        <Link to="/sign-in" style={{ color: '#1a1a1a', fontWeight: 600 }}>Back to sign in</Link>
      </p>
    </div>
  );
}
