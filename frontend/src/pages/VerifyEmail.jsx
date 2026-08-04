import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  // checking | success | error — a missing token is known synchronously from the URL, so it's
  // reflected in the initial state itself rather than set from inside the effect below.
  const [status, setStatus] = useState(token ? 'checking' : 'error');
  const [error, setError] = useState(token ? '' : 'Missing verification token.');

  useEffect(() => {
    if (!token) return;
    api.get('/customers/verify-email', { params: { token } })
      .then(() => setStatus('success'))
      .catch(err => {
        setStatus('error');
        setError(err.response?.data?.error || 'Verification failed.');
      });
  }, [token]);

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '4rem 1rem', textAlign: 'center' }}>
      {status === 'checking' && (
        <p style={{ color: '#888' }}>Confirming your new email address…</p>
      )}
      {status === 'success' && (
        <>
          <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#15803d', marginBottom: '0.5rem' }}>
            Email confirmed
          </p>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Your account's email address has been updated. Sign in with your new email from now on.
          </p>
          <button
            onClick={() => navigate('/sign-in')}
            style={{ padding: '0.6rem 1.2rem', borderRadius: 10, background: '#1a1a1a', color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}
          >
            Go to sign in
          </button>
        </>
      )}
      {status === 'error' && (
        <>
          <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#b91c1c', marginBottom: '0.5rem' }}>
            Verification failed
          </p>
          <p style={{ color: '#888', fontSize: '0.9rem' }}>{error}</p>
        </>
      )}
    </div>
  );
}
