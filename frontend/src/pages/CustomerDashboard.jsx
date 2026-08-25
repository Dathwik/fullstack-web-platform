import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const STATUS_COLORS = {
  'Received':       { bg: '#fff7e6', color: '#b45309', border: '#fcd34d' },
  'In Preparation': { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  'Completed':      { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  'Cancelled':      { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
};

const ORDER_FILTERS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('all');
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState('');
  const [newPasswordDraft, setNewPasswordDraft] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [cancelingEmailChange, setCancelingEmailChange] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletePasswordDraft, setDeletePasswordDraft] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  useEffect(() => {
    api.get('/customers/me').then(r => {
      if (!r.data) {
        navigate('/sign-in');
        return;
      }
      setCustomer(r.data);
      return Promise.all([
        api.get('/customers/orders').then(o => setOrders(o.data)),
        api.get('/customers/stats').then(s => setStats(s.data)),
      ]);
    }).catch(() => navigate('/sign-in')).finally(() => setLoading(false));
  }, [navigate]);

  async function signOut() {
    await api.post('/customers/logout');
    navigate('/sign-in');
  }

  function reorder(order) {
    const reorderItems = order.items.map(i => ({
      product_id: i.product_id,
      quantity_kg: parseFloat(i.quantity_kg),
    }));
    navigate('/place-order', { state: { reorderItems } });
  }

  function startEditProfile() {
    setNameDraft(customer.name);
    setPhoneDraft(customer.phone || '');
    setEditingProfile(true);
  }

  async function saveProfile() {
    if (!nameDraft.trim()) return;
    setSavingProfile(true);
    try {
      const res = await api.patch('/customers/me', { name: nameDraft.trim(), phone: phoneDraft.trim() || null });
      setCustomer(res.data);
      setEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    setPasswordError('');
    setPasswordSuccess('');
    if (newPasswordDraft.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    setSavingPassword(true);
    try {
      await api.patch('/customers/me/password', {
        current_password: currentPasswordDraft,
        new_password: newPasswordDraft,
      });
      setPasswordSuccess('Password updated.');
      setCurrentPasswordDraft('');
      setNewPasswordDraft('');
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setSavingPassword(false);
    }
  }

  async function requestEmailChange() {
    setEmailError('');
    setEmailSuccess('');
    setSavingEmail(true);
    try {
      const res = await api.post('/customers/me/email', { new_email: emailDraft });
      if (res.data.already_current) {
        setEmailSuccess("That's already your email — nothing to confirm.");
      } else {
        setEmailSuccess(`Check ${res.data.pending_email} for a confirmation link to finish the change.`);
        setCustomer(c => ({ ...c, pending_email: res.data.pending_email }));
      }
      setEmailDraft('');
    } catch (err) {
      setEmailError(err.response?.data?.error || 'Failed to request email change');
    } finally {
      setSavingEmail(false);
    }
  }

  async function cancelPendingEmailChange() {
    setCancelingEmailChange(true);
    try {
      await api.post('/customers/me/email/cancel');
      setCustomer(c => ({ ...c, pending_email: null }));
    } catch {
      // A 404 here just means it was already confirmed or cancelled elsewhere in the meantime —
      // either way there's nothing pending, so refetching the current state settles it.
      const r = await api.get('/customers/me');
      if (r.data) setCustomer(r.data);
    } finally {
      setCancelingEmailChange(false);
    }
  }

  async function deleteAccount() {
    setDeleteError('');
    if (!deletePasswordDraft) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    setDeleteInProgress(true);
    try {
      await api.delete('/customers/me', { data: { password: deletePasswordDraft } });
      navigate('/sign-in');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account');
    } finally {
      setDeleteInProgress(false);
    }
  }

  if (loading) return <p style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>Loading...</p>;
  if (!customer) return null;

  const filteredOrders = orders.filter(o => {
    if (filter === 'active')    return o.status === 'Received' || o.status === 'In Preparation';
    if (filter === 'completed') return o.status === 'Completed';
    if (filter === 'cancelled') return o.status === 'Cancelled';
    return true;
  });

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          {editingProfile ? (
            <div>
              <input
                value={nameDraft} autoFocus
                onChange={e => setNameDraft(e.target.value)}
                placeholder="Name"
                style={{ display: 'block', width: '100%', padding: '0.4rem 0.6rem', border: '1.5px solid #93c5fd', borderRadius: 8, fontSize: '1rem', fontWeight: 700, marginBottom: '0.4rem' }}
              />
              <input
                value={phoneDraft}
                onChange={e => setPhoneDraft(e.target.value)}
                placeholder="Phone (optional)"
                style={{ display: 'block', width: '100%', padding: '0.35rem 0.6rem', border: '1.5px solid #93c5fd', borderRadius: 8, fontSize: '0.85rem', marginBottom: '0.4rem' }}
              />
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={saveProfile} disabled={savingProfile}
                  style={{ padding: '0.3rem 0.65rem', borderRadius: 7, background: '#1a1a1a', color: '#fff', fontSize: '0.78rem', fontWeight: 600, opacity: savingProfile ? 0.6 : 1 }}>
                  {savingProfile ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingProfile(false)}
                  style={{ padding: '0.3rem 0.65rem', borderRadius: 7, background: '#f0f0eb', color: '#555', fontSize: '0.78rem' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Hi, {customer.name}</h1>
              <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.15rem' }}>{customer.email}</p>
              {customer.phone && <p style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '0.1rem' }}>{customer.phone}</p>}
              {customer.pending_email && (
                <p style={{ fontSize: '0.75rem', color: '#b45309', marginTop: '0.2rem' }}>
                  Pending change to {customer.pending_email} — check your inbox to confirm.{' '}
                  <button
                    onClick={cancelPendingEmailChange}
                    disabled={cancelingEmailChange}
                    style={{ background: 'none', color: '#1d4ed8', fontSize: '0.75rem', padding: 0, textDecoration: 'underline' }}
                  >
                    {cancelingEmailChange ? 'Cancelling…' : 'Cancel'}
                  </button>
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.3rem' }}>
                <button onClick={startEditProfile} style={{ fontSize: '0.75rem', color: '#1d4ed8', background: 'none', padding: 0 }}>
                  Edit profile
                </button>
                <button onClick={() => setChangingPassword(s => !s)} style={{ fontSize: '0.75rem', color: '#1d4ed8', background: 'none', padding: 0 }}>
                  Change password
                </button>
                <button onClick={() => setChangingEmail(s => !s)} style={{ fontSize: '0.75rem', color: '#1d4ed8', background: 'none', padding: 0 }}>
                  Change email
                </button>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => navigate('/place-order')}
          style={{
            padding: '0.5rem 0.9rem', borderRadius: 10,
            background: '#1a1a1a', color: '#fff',
            fontSize: '0.85rem', fontWeight: 600,
          }}
        >
          + New order
        </button>
      </div>

      {/* Change password */}
      {changingPassword && (
        <div style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#555', marginBottom: '0.5rem' }}>Change password</p>
          <input
            type="password" value={currentPasswordDraft}
            onChange={e => setCurrentPasswordDraft(e.target.value)}
            placeholder="Current password"
            style={{ display: 'block', width: '100%', padding: '0.4rem 0.6rem', border: '1.5px solid #ddd', borderRadius: 8, fontSize: '0.85rem', marginBottom: '0.4rem', boxSizing: 'border-box' }}
          />
          <input
            type="password" value={newPasswordDraft}
            onChange={e => setNewPasswordDraft(e.target.value)}
            placeholder="New password (min 8 characters)"
            style={{ display: 'block', width: '100%', padding: '0.4rem 0.6rem', border: '1.5px solid #ddd', borderRadius: 8, fontSize: '0.85rem', marginBottom: '0.4rem', boxSizing: 'border-box' }}
          />
          {passwordError && <p style={{ color: '#b91c1c', fontSize: '0.78rem', marginBottom: '0.4rem' }}>{passwordError}</p>}
          {passwordSuccess && <p style={{ color: '#15803d', fontSize: '0.78rem', marginBottom: '0.4rem' }}>{passwordSuccess}</p>}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={savePassword} disabled={savingPassword}
              style={{ padding: '0.35rem 0.7rem', borderRadius: 7, background: '#1a1a1a', color: '#fff', fontSize: '0.78rem', fontWeight: 600, opacity: savingPassword ? 0.6 : 1 }}>
              {savingPassword ? 'Saving…' : 'Update password'}
            </button>
            <button onClick={() => { setChangingPassword(false); setPasswordError(''); setPasswordSuccess(''); }}
              style={{ padding: '0.35rem 0.7rem', borderRadius: 7, background: '#f0f0eb', color: '#555', fontSize: '0.78rem' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Change email */}
      {changingEmail && (
        <div style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#555', marginBottom: '0.5rem' }}>Change email</p>
          <p style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '0.5rem' }}>
            We'll email a confirmation link to the new address before it takes effect.
          </p>
          <input
            type="email" value={emailDraft}
            onChange={e => setEmailDraft(e.target.value)}
            placeholder="New email address"
            style={{ display: 'block', width: '100%', padding: '0.4rem 0.6rem', border: '1.5px solid #ddd', borderRadius: 8, fontSize: '0.85rem', marginBottom: '0.4rem', boxSizing: 'border-box' }}
          />
          {emailError && <p style={{ color: '#b91c1c', fontSize: '0.78rem', marginBottom: '0.4rem' }}>{emailError}</p>}
          {emailSuccess && <p style={{ color: '#15803d', fontSize: '0.78rem', marginBottom: '0.4rem' }}>{emailSuccess}</p>}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={requestEmailChange} disabled={savingEmail || !emailDraft}
              style={{ padding: '0.35rem 0.7rem', borderRadius: 7, background: '#1a1a1a', color: '#fff', fontSize: '0.78rem', fontWeight: 600, opacity: savingEmail || !emailDraft ? 0.6 : 1 }}>
              {savingEmail ? 'Sending…' : 'Send confirmation link'}
            </button>
            <button onClick={() => { setChangingEmail(false); setEmailError(''); setEmailSuccess(''); }}
              style={{ padding: '0.35rem 0.7rem', borderRadius: 7, background: '#f0f0eb', color: '#555', fontSize: '0.78rem' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Account stats */}
      {stats && stats.total_orders > 0 && (
        <div style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.85rem', color: '#555' }}>
            <strong>{stats.total_orders}</strong> order{stats.total_orders > 1 ? 's' : ''}
            {' · '}
            <strong>${stats.total_spent.toFixed(2)}</strong> spent
            {' · '}
            member since {new Date(stats.member_since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </p>
        </div>
      )}

      {/* Order status filter */}
      {orders.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {ORDER_FILTERS.map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding: '0.35rem 0.75rem', borderRadius: 20,
              background: filter === val ? '#1a1a1a' : '#f0f0eb',
              color: filter === val ? '#fff' : '#555',
              fontSize: '0.82rem', fontWeight: 500,
            }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Orders */}
      <p style={{ fontWeight: 600, fontSize: '0.85rem', color: '#555', marginBottom: '0.6rem' }}>Order history</p>

      {orders.length === 0 ? (
        <div style={{ background: '#fff', border: '1.5px dashed #ddd', borderRadius: 12, padding: '2rem 1rem', textAlign: 'center' }}>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '0.75rem' }}>You haven't placed any orders yet.</p>
          <button
            onClick={() => navigate('/place-order')}
            style={{
              padding: '0.6rem 1rem', borderRadius: 10,
              background: '#1a1a1a', color: '#fff',
              fontSize: '0.9rem', fontWeight: 600,
            }}
          >
            Place your first order
          </button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <p style={{ color: '#aaa', textAlign: 'center', padding: '2rem 0' }}>
          No {filter === 'all' ? '' : filter} orders here.
        </p>
      ) : (
        filteredOrders.map(order => {
          const sc = STATUS_COLORS[order.status];
          const total = order.items.reduce(
            (sum, i) => sum + parseFloat(i.quantity_kg) * parseFloat(i.price_per_kg), 0
          );
          return (
            <div key={order.id} style={{
              background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 12,
              padding: '1rem', marginBottom: '0.75rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <p style={{ fontSize: '0.8rem', color: '#888' }}>
                  {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <span style={{
                  padding: '0.2rem 0.6rem', borderRadius: 20,
                  background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                  fontSize: '0.72rem', fontWeight: 600,
                }}>
                  {order.status}
                </span>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#333', marginBottom: '0.6rem' }}>
                {order.items.map(i => `${i.product_name} × ${parseFloat(i.quantity_kg)}kg`).join(', ')}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>${total.toFixed(2)}</p>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <a
                    href={`/api/orders/${order.id}/invoice`}
                    download
                    style={{
                      padding: '0.4rem 0.75rem', borderRadius: 8,
                      background: '#f0f0eb', color: '#555',
                      fontSize: '0.8rem', fontWeight: 500,
                      textDecoration: 'none', display: 'inline-block',
                    }}
                  >
                    Invoice
                  </a>
                  <button
                    onClick={() => navigate(`/track-order?id=${order.id}`)}
                    style={{
                      padding: '0.4rem 0.75rem', borderRadius: 8,
                      background: '#f0f0eb', color: '#555',
                      fontSize: '0.8rem', fontWeight: 500,
                    }}
                  >
                    Track
                  </button>
                  <button
                    onClick={() => reorder(order)}
                    style={{
                      padding: '0.4rem 0.75rem', borderRadius: 8,
                      background: '#1a1a1a', color: '#fff',
                      fontSize: '0.8rem', fontWeight: 600,
                    }}
                  >
                    Reorder
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      <button
        onClick={signOut}
        style={{ display: 'block', margin: '2rem auto 0', color: '#999', background: 'none', fontSize: '0.85rem' }}
      >
        Sign out
      </button>

      {/* Danger zone */}
      <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid #f0f0eb' }}>
        {!deletingAccount ? (
          <button
            onClick={() => setDeletingAccount(true)}
            style={{ display: 'block', margin: '0 auto', color: '#b91c1c', background: 'none', fontSize: '0.8rem' }}
          >
            Delete account
          </button>
        ) : (
          <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '0.85rem 1rem' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#b91c1c', marginBottom: '0.4rem' }}>
              Delete your account?
            </p>
            <p style={{ fontSize: '0.75rem', color: '#b91c1c', marginBottom: '0.5rem' }}>
              This can't be undone. Your order history stays on file for our records but will no longer be linked to an account.
            </p>
            <input
              type="password" value={deletePasswordDraft}
              onChange={e => setDeletePasswordDraft(e.target.value)}
              placeholder="Enter your password to confirm"
              style={{ display: 'block', width: '100%', padding: '0.4rem 0.6rem', border: '1.5px solid #fca5a5', borderRadius: 8, fontSize: '0.85rem', marginBottom: '0.4rem', boxSizing: 'border-box' }}
            />
            {deleteError && <p style={{ color: '#b91c1c', fontSize: '0.78rem', marginBottom: '0.4rem' }}>{deleteError}</p>}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button onClick={deleteAccount} disabled={deleteInProgress}
                style={{ padding: '0.35rem 0.7rem', borderRadius: 7, background: '#b91c1c', color: '#fff', fontSize: '0.78rem', fontWeight: 600, opacity: deleteInProgress ? 0.6 : 1 }}>
                {deleteInProgress ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button onClick={() => { setDeletingAccount(false); setDeletePasswordDraft(''); setDeleteError(''); }}
                style={{ padding: '0.35rem 0.7rem', borderRadius: 7, background: '#f0f0eb', color: '#555', fontSize: '0.78rem' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
