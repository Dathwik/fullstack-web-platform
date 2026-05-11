import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

export default function CustomerRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8)
      return setError('Password must be at least 8 characters');
    setSubmitting(true);
    try {
      await api.post('/customers/register', form);
      navigate('/account');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
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
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>Create an account</h1>
      <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '1.5rem' }}>
        Save your details and reorder in one click.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          style={inputStyle} placeholder="Full name"
          value={form.name} onChange={e => setField('name', e.target.value)} required
        />
        <input
          style={inputStyle} type="email" placeholder="Email"
          value={form.email} onChange={e => setField('email', e.target.value)} required
        />
        <input
          style={inputStyle} type="tel" placeholder="Phone (optional)"
          value={form.phone} onChange={e => setField('phone', e.target.value)}
        />
        <input
          style={inputStyle} type="password" placeholder="Password (8+ characters)"
          value={form.password} onChange={e => setField('password', e.target.value)} required
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
          {submitting ? 'Creating...' : 'Create account'}
        </button>
      </form>

      <p style={{ fontSize: '0.85rem', color: '#888', textAlign: 'center', marginTop: '1.5rem' }}>
        Already have an account? <Link to="/sign-in" style={{ color: '#1a1a1a', fontWeight: 600 }}>Sign in</Link>
      </p>
    </div>
  );
}
