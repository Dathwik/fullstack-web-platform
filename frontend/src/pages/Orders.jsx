import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const STATUS_COLORS = {
  'Received':       { bg: '#fff7e6', color: '#b45309', border: '#fcd34d' },
  'In Preparation': { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  'Completed':      { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  'Cancelled':      { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
};

const NEXT_STATUS = {
  'Received':       'In Preparation',
  'In Preparation': 'Completed',
};

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function RevenueChart({ data }) {
  if (!data || data.length === 0) return null;
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  const BAR_H = 80;  // max bar height in px
  const BAR_W = 28;
  const GAP   = 8;
  const PAD   = 16;
  const W = data.length * (BAR_W + GAP) - GAP + PAD * 2;
  const H = BAR_H + 48;

  return (
    <div style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
      <p style={{ fontSize: '0.72rem', color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
        Revenue — last 7 days
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        {data.map((d, i) => {
          const x = PAD + i * (BAR_W + GAP);
          const barH = maxRevenue > 0 ? Math.max((d.revenue / maxRevenue) * BAR_H, d.revenue > 0 ? 3 : 0) : 0;
          const y = BAR_H - barH;
          const day = new Date(d.date + 'T12:00:00');
          const isToday = d.date === new Date().toISOString().slice(0, 10);

          return (
            <g key={d.date}>
              {/* bar */}
              <rect
                x={x} y={y} width={BAR_W} height={barH}
                rx={4}
                fill={isToday ? '#1a1a1a' : '#d4d4ce'}
              />
              {/* revenue label above bar */}
              {d.revenue > 0 && (
                <text
                  x={x + BAR_W / 2} y={y - 4}
                  textAnchor="middle" fontSize="8" fill="#555"
                >
                  ${d.revenue.toFixed(0)}
                </text>
              )}
              {/* day label */}
              <text
                x={x + BAR_W / 2} y={BAR_H + 14}
                textAnchor="middle" fontSize="9"
                fill={isToday ? '#1a1a1a' : '#999'}
                fontWeight={isToday ? '700' : '400'}
              >
                {DAY_LABEL[day.getDay()]}
              </text>
              {/* order count */}
              {d.orders > 0 && (
                <text
                  x={x + BAR_W / 2} y={BAR_H + 26}
                  textAnchor="middle" fontSize="8" fill="#bbb"
                >
                  {d.orders}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Orders({ onLogout }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('active');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState(false);
  const [stats, setStats] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [topCustomers, setTopCustomers] = useState(null);
  const [showTopCustomers, setShowTopCustomers] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState([]);
  const navigate = useNavigate();

  const sessionStartRef = useRef(new Date().toISOString());
  const alertedCountRef = useRef(0);

  async function fetchOrders({ silent = false } = {}) {
    try {
      const params = {};
      if (dateFrom)        params.date_from = dateFrom;
      if (dateTo)          params.date_to   = dateTo;
      if (search)          params.search    = search;
      if (filter === 'aging') params.aging  = 'true';
      const res = await api.get('/orders', { params });
      const newOrders = res.data;

      const newCount = newOrders.filter(
        o => o.status === 'Received' && o.created_at > sessionStartRef.current
      ).length;
      if (newCount > alertedCountRef.current) {
        setNewAlert(true);
        alertedCountRef.current = newCount;
      }

      setOrders(newOrders);
    } catch {
      if (!silent) onLogout();
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => fetchOrders({ silent: true }), 30000);
    return () => clearInterval(interval);
  }, [dateFrom, dateTo, search, filter]);

  useEffect(() => {
    api.get('/orders/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/products/low-stock').then(r => setLowStock(r.data)).catch(() => {});
    api.get('/orders/analytics').then(r => setAnalytics(r.data)).catch(() => {});
    api.get('/payments/webhook-events').then(r => setWebhookEvents(r.data)).catch(() => {});
  }, []);

  async function advanceStatus(e, order) {
    e.stopPropagation();
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await api.patch(`/orders/${order.id}/status`, { status: next });
    fetchOrders({ silent: true });
  }

  async function cancelOrder(e, order) {
    e.stopPropagation();
    if (!confirm('Cancel this order?')) return;
    await api.patch(`/orders/${order.id}/status`, { status: 'Cancelled' });
    fetchOrders({ silent: true });
  }

  async function loadTopCustomers() {
    if (topCustomers) { setShowTopCustomers(s => !s); return; }
    const res = await api.get('/orders/top-customers', { params: { limit: 5, days: 90 } });
    setTopCustomers(res.data);
    setShowTopCustomers(true);
  }

  function toggleSelect(e, id) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function bulkAdvance() {
    if (!selectedIds.size) return;
    setBulkWorking(true);
    try {
      await api.patch('/orders/bulk-status', {
        order_ids: [...selectedIds],
        status: 'In Preparation',
      });
      exitSelectMode();
      fetchOrders({ silent: true });
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkCancel() {
    if (!selectedIds.size) return;
    if (!confirm(`Cancel ${selectedIds.size} order${selectedIds.size > 1 ? 's' : ''}?`)) return;
    setBulkWorking(true);
    try {
      await api.patch('/orders/bulk-status', {
        order_ids: [...selectedIds],
        status: 'Cancelled',
      });
      exitSelectMode();
      fetchOrders({ silent: true });
    } finally {
      setBulkWorking(false);
    }
  }

  function handleExport() {
    window.location.href = '/api/orders/export';
  }

  function clearDates() {
    setDateFrom('');
    setDateTo('');
  }

  function clearSearch() {
    setSearchInput('');
    setSearch('');
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  function dismissAlert() {
    setNewAlert(false);
    sessionStartRef.current = new Date().toISOString();
    alertedCountRef.current = 0;
  }

  const filtered = orders.filter(o => {
    if (filter === 'active') return o.status === 'Received' || o.status === 'In Preparation';
    if (filter === 'done')   return o.status === 'Completed' || o.status === 'Cancelled';
    return true; // 'all' and 'aging' (already filtered server-side)
  });

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>

      {/* New orders banner */}
      {newAlert && (
        <div
          onClick={dismissAlert}
          style={{
            background: '#eff6ff', border: '1.5px solid #93c5fd',
            borderRadius: 10, padding: '0.65rem 1rem',
            marginBottom: '0.75rem', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <p style={{ fontSize: '0.85rem', color: '#1d4ed8', fontWeight: 600 }}>
            New orders received
          </p>
          <span style={{ fontSize: '0.8rem', color: '#93c5fd' }}>Dismiss</span>
        </div>
      )}

      {/* Aging orders alert */}
      {stats?.aging?.count > 0 && filter !== 'aging' && (
        <div
          onClick={() => setFilter('aging')}
          style={{
            background: '#fff7e6', border: '1.5px solid #fcd34d',
            borderRadius: 10, padding: '0.65rem 1rem',
            marginBottom: '0.75rem', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400e' }}>
            {stats.aging.count} order{stats.aging.count > 1 ? 's' : ''} waiting &gt;4 hours — tap to review
          </p>
          <span style={{ fontSize: '0.78rem', color: '#b45309' }}>View</span>
        </div>
      )}

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div
          onClick={() => navigate('/products')}
          style={{
            background: '#fffbeb', border: '1.5px solid #fde68a',
            borderRadius: 10, padding: '0.65rem 1rem',
            marginBottom: '0.75rem', cursor: 'pointer',
          }}
        >
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400e', marginBottom: '0.25rem' }}>
            Low stock — {lowStock.length} product{lowStock.length > 1 ? 's' : ''} need restocking
          </p>
          <p style={{ fontSize: '0.78rem', color: '#b45309' }}>
            {lowStock.map(p => `${p.name} (${parseFloat(p.stock_kg)}kg)`).join(' · ')}
          </p>
        </div>
      )}

      {/* Stats panel */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
          {[
            { label: "Today's orders", value: stats.today.count },
            { label: "Today's revenue", value: `$${stats.today.revenue.toFixed(2)}` },
            { label: 'Pending',         value: stats.pending.count },
            { label: 'Unpaid (COD)',    value: stats.unpaid.count },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 10, padding: '0.75rem 1rem' }}>
              <p style={{ fontSize: '0.72rem', color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{label}</p>
              <p style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1a1a1a' }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 7-day revenue chart */}
      <RevenueChart data={analytics} />

      {/* Top customers */}
      <div style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 10, marginBottom: '1rem', overflow: 'hidden' }}>
        <button
          onClick={loadTopCustomers}
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.65rem 1rem', background: 'none', textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '0.72rem', color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Top customers — last 90 days
          </p>
          <span style={{ fontSize: '0.8rem', color: '#bbb' }}>{showTopCustomers ? '▲' : '▼'}</span>
        </button>
        {showTopCustomers && topCustomers && (
          <div style={{ borderTop: '1px solid #f0f0eb' }}>
            {topCustomers.length === 0 ? (
              <p style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#aaa' }}>No data yet.</p>
            ) : topCustomers.map((c, i) => (
              <div key={c.phone} style={{
                display: 'grid', gridTemplateColumns: '20px 1fr auto',
                gap: '0.5rem', padding: '0.6rem 1rem', alignItems: 'center',
                borderBottom: i < topCustomers.length - 1 ? '1px solid #f0f0eb' : 'none',
              }}>
                <span style={{ fontSize: '0.75rem', color: '#ccc', fontWeight: 700 }}>#{c.rank}</span>
                <div>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1a1a1a' }}>{c.customer_name}</p>
                  <p style={{ fontSize: '0.75rem', color: '#aaa' }}>
                    {c.phone} · {c.total_orders} order{c.total_orders > 1 ? 's' : ''} · last {new Date(c.last_order_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1a1a1a' }}>
                  ${c.total_revenue.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Stripe webhook events */}
      {webhookEvents.length > 0 && (
        <div style={{ background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.72rem', color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
            Recent payment events
          </p>
          {webhookEvents.slice(0, 5).map(ev => (
            <div key={ev.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.3rem 0', borderBottom: '1px solid #f5f5f0',
            }}>
              <div>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: ev.event_type === 'payment_intent.succeeded' ? '#15803d' : '#555' }}>
                  {ev.event_type}
                </p>
                {ev.object_id && (
                  <p style={{ fontSize: '0.72rem', color: '#bbb', fontFamily: 'monospace' }}>
                    {ev.object_id.slice(0, 20)}…
                  </p>
                )}
              </div>
              <p style={{ fontSize: '0.72rem', color: '#bbb' }}>
                {new Date(ev.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Orders</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleExport}
            style={{ padding: '0.5rem 0.85rem', borderRadius: 8, background: '#f0f0eb', fontSize: '0.85rem', fontWeight: 500 }}
          >
            Export CSV
          </button>
          <button
            onClick={() => navigate('/products')}
            style={{ padding: '0.5rem 0.85rem', borderRadius: 8, background: '#f0f0eb', fontSize: '0.85rem', fontWeight: 500 }}
          >
            Products
          </button>
          <button
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            style={{
              padding: '0.5rem 0.85rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 500,
              background: selectMode ? '#fef2f2' : '#f0f0eb',
              color:      selectMode ? '#b91c1c' : '#555',
            }}
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
          <button
            onClick={() => navigate('/new-order')}
            style={{ padding: '0.5rem 0.85rem', borderRadius: 8, background: '#1a1a1a', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}
          >
            + New
          </button>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search by name or phone…"
          style={{
            flex: 1, padding: '0.45rem 0.75rem',
            border: '1.5px solid #ddd', borderRadius: 8, fontSize: '0.85rem',
          }}
        />
        {search ? (
          <button
            type="button"
            onClick={clearSearch}
            style={{ padding: '0.45rem 0.75rem', borderRadius: 8, background: '#f0f0eb', color: '#555', fontSize: '0.82rem' }}
          >
            Clear
          </button>
        ) : (
          <button
            type="submit"
            style={{ padding: '0.45rem 0.75rem', borderRadius: 8, background: '#1a1a1a', color: '#fff', fontSize: '0.82rem', fontWeight: 600 }}
          >
            Search
          </button>
        )}
      </form>

      {search && (
        <p style={{ fontSize: '0.78rem', color: '#888', marginBottom: '0.5rem' }}>
          Showing results for "{search}"
        </p>
      )}

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {[['active','Active'],['done','Done'],['all','All'],['aging','Aging']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '0.4rem 0.85rem', borderRadius: 20,
            background: filter === val ? '#1a1a1a' : '#f0f0eb',
            color: filter === val ? '#fff' : '#555',
            fontSize: '0.85rem', fontWeight: 500,
          }}>
            {label}
            {val === 'aging' && stats?.aging?.count > 0 && (
              <span style={{
                marginLeft: '0.3rem', fontSize: '0.72rem', fontWeight: 700,
                background: filter === 'aging' ? 'rgba(255,255,255,0.25)' : '#fcd34d',
                color: filter === 'aging' ? '#fff' : '#92400e',
                padding: '0.05rem 0.35rem', borderRadius: 10,
              }}>
                {stats.aging.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="date" value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1.5px solid #ddd', borderRadius: 8, fontSize: '0.85rem' }}
        />
        <span style={{ color: '#aaa', fontSize: '0.85rem' }}>–</span>
        <input
          type="date" value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1.5px solid #ddd', borderRadius: 8, fontSize: '0.85rem' }}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={clearDates}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 8, background: '#f0f0eb', color: '#555', fontSize: '0.8rem' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Orders list */}
      {loading ? (
        <p style={{ color: '#888', textAlign: 'center', marginTop: '3rem' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', marginTop: '3rem' }}>No orders here</p>
      ) : (
        filtered.map(order => {
          const sc = STATUS_COLORS[order.status];
          const next = NEXT_STATUS[order.status];
          const total = order.items?.reduce((sum, i) => sum + i.quantity_kg * i.price_per_kg, 0) ?? 0;
          const isSelected = selectedIds.has(order.id);
          return (
            <div
              key={order.id}
              onClick={() => selectMode ? toggleSelect({ stopPropagation: () => {} }, order.id) : navigate(`/orders/${order.id}`)}
              style={{
                background: isSelected ? '#f0f7ff' : '#fff',
                border: `1.5px solid ${isSelected ? '#93c5fd' : '#e8e8e3'}`,
                borderRadius: 12, padding: '1rem',
                marginBottom: '0.75rem', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => toggleSelect(e, order.id)}
                      onClick={e => e.stopPropagation()}
                      style={{ marginTop: '0.2rem', width: 16, height: 16, cursor: 'pointer', accentColor: '#1a1a1a' }}
                    />
                  )}
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '1rem' }}>{order.customer_name}</p>
                    <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.1rem' }}>{order.phone}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {order.payment_received && (
                    <span style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: 600, background: '#f0fdf4', border: '1px solid #86efac', padding: '0.15rem 0.45rem', borderRadius: 20 }}>
                      Paid
                    </span>
                  )}
                  <span style={{
                    padding: '0.25rem 0.6rem', borderRadius: 20,
                    background: sc.bg, color: sc.color,
                    border: `1px solid ${sc.border}`,
                    fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
                  }}>
                    {order.status}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: '0.5rem' }}>
                {order.items?.map(i => `${i.product_name} × ${i.quantity_kg}kg`).join(', ')}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  ${total.toFixed(2)}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {!selectMode && order.status === 'Received' && (
                    <button onClick={e => cancelOrder(e, order)} style={{
                      padding: '0.35rem 0.65rem', borderRadius: 7,
                      background: '#fef2f2', color: '#b91c1c',
                      fontSize: '0.8rem', fontWeight: 500,
                    }}>
                      Cancel
                    </button>
                  )}
                  {!selectMode && next && (
                    <button onClick={e => advanceStatus(e, order)} style={{
                      padding: '0.35rem 0.65rem', borderRadius: 7,
                      background: '#1a1a1a', color: '#fff',
                      fontSize: '0.8rem', fontWeight: 600,
                    }}>
                      {next === 'In Preparation' ? 'Start' : 'Complete'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Bulk action bar (floats at bottom when orders are selected) */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', borderRadius: 14, padding: '0.75rem 1rem',
          display: 'flex', gap: '0.6rem', alignItems: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)', zIndex: 100,
          maxWidth: 420, width: 'calc(100% - 2rem)',
        }}>
          <p style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600, flex: 1 }}>
            {selectedIds.size} selected
          </p>
          <button
            onClick={bulkAdvance}
            disabled={bulkWorking}
            style={{ padding: '0.45rem 0.85rem', borderRadius: 8, background: '#fff', color: '#1a1a1a', fontSize: '0.82rem', fontWeight: 700, opacity: bulkWorking ? 0.6 : 1 }}
          >
            Start all
          </button>
          <button
            onClick={bulkCancel}
            disabled={bulkWorking}
            style={{ padding: '0.45rem 0.85rem', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: '0.82rem', fontWeight: 600, opacity: bulkWorking ? 0.6 : 1 }}
          >
            Cancel all
          </button>
          <button
            onClick={exitSelectMode}
            style={{ color: '#888', background: 'none', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Logout */}
      <button
        onClick={onLogout}
        style={{ display: 'block', margin: '2rem auto 1rem', color: '#999', background: 'none', fontSize: '0.85rem' }}
      >
        Sign out
      </button>
    </div>
  );
}
