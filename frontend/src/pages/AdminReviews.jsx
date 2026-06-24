import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

function StarBar({ star, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
      <span style={{ fontSize: '0.8rem', color: '#555', minWidth: 14, textAlign: 'right' }}>{star}</span>
      <span style={{ fontSize: '0.85rem', color: '#f59e0b' }}>★</span>
      <div style={{ flex: 1, background: '#f0f0eb', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#f59e0b', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.78rem', color: '#aaa', minWidth: 28, textAlign: 'right' }}>{count}</span>
    </div>
  );
}

export default function AdminReviews() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [reviews, setReviews] = useState(null);

  useEffect(() => {
    api.get('/reviews/stats').then(r => setStats(r.data)).catch(() => setStats({ avg_rating: null, total_count: 0, distribution: {} }));
    api.get('/reviews').then(r => setReviews(r.data)).catch(() => setReviews([]));
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1rem 1rem 4rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', fontSize: '1.25rem', color: '#555' }}>←</button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, flex: 1 }}>Customer reviews</h1>
        {stats && stats.total_count > 0 && (
          <span style={{ fontSize: '0.85rem', color: '#999' }}>{stats.total_count} total</span>
        )}
      </div>

      {/* Rating distribution card */}
      {stats && (
        <div style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
          {stats.total_count === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#aaa', textAlign: 'center', padding: '0.5rem 0' }}>No reviews yet.</p>
          ) : (
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              {/* Large average */}
              <div style={{ textAlign: 'center', minWidth: 64 }}>
                <p style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1a1a1a', lineHeight: 1 }}>
                  {stats.avg_rating !== null ? stats.avg_rating.toFixed(1) : '—'}
                </p>
                <p style={{ fontSize: '1rem', color: '#f59e0b', marginTop: '0.15rem' }}>
                  {stats.avg_rating !== null
                    ? '★'.repeat(Math.round(stats.avg_rating)) + '☆'.repeat(5 - Math.round(stats.avg_rating))
                    : ''}
                </p>
                <p style={{ fontSize: '0.72rem', color: '#bbb', marginTop: '0.2rem' }}>out of 5</p>
              </div>
              {/* Star bars */}
              <div style={{ flex: 1 }}>
                {[5, 4, 3, 2, 1].map(s => (
                  <StarBar key={s} star={s} count={stats.distribution[s] || 0} total={stats.total_count} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reviews list */}
      {reviews === null ? (
        <p style={{ color: '#aaa', textAlign: 'center', marginTop: '2rem' }}>Loading…</p>
      ) : reviews.length === 0 ? (
        <p style={{ color: '#aaa', textAlign: 'center', marginTop: '2rem' }}>No reviews yet.</p>
      ) : reviews.map(r => (
        <div
          key={r.id}
          style={{
            background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 12,
            padding: '0.9rem 1rem', marginBottom: '0.65rem', cursor: 'pointer',
          }}
          onClick={() => navigate(`/orders/${r.order_id}`)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{r.customer_name}</p>
              <p style={{ fontSize: '0.75rem', color: '#aaa' }}>{r.phone}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '1rem', color: '#f59e0b', letterSpacing: '0.05em' }}>
                {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
              </p>
              <p style={{ fontSize: '0.72rem', color: '#bbb', marginTop: '0.1rem' }}>
                {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          {r.comment && (
            <p style={{ fontSize: '0.88rem', color: '#444', marginTop: '0.35rem', lineHeight: 1.45 }}>
              {r.comment}
            </p>
          )}
          <p style={{ fontSize: '0.72rem', color: '#bbb', marginTop: '0.4rem', fontFamily: 'monospace' }}>
            Order #{r.order_id.slice(0, 8).toUpperCase()} →
          </p>
        </div>
      ))}
    </div>
  );
}
