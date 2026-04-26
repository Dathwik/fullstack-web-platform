import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingStockId, setEditingStockId] = useState(null);
  const [stockDraft, setStockDraft] = useState('');

  async function fetchProducts() {
    const res = await api.get('/products');
    setProducts(res.data);
  }

  useEffect(() => { fetchProducts(); }, []);

  async function toggleAvailable(product) {
    await api.patch(`/products/${product.id}`, { is_available: !product.is_available });
    fetchProducts();
  }

  async function addProduct(e) {
    e.preventDefault();
    if (!newName || !newPrice) return;
    setSaving(true);
    try {
      await api.post('/products', {
        name: newName,
        price_per_kg: parseFloat(newPrice),
        stock_kg: newStock !== '' ? parseFloat(newStock) : undefined,
      });
      setNewName(''); setNewPrice(''); setNewStock(''); setShowAdd(false);
      fetchProducts();
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    await api.delete(`/products/${id}`);
    fetchProducts();
  }

  function startStockEdit(product) {
    setEditingStockId(product.id);
    setStockDraft(product.stock_kg !== null ? String(product.stock_kg) : '');
  }

  async function saveStock(product) {
    const value = stockDraft.trim();
    const stock_kg = value === '' ? null : parseFloat(value);
    await api.patch(`/products/${product.id}`, { stock_kg });
    setEditingStockId(null);
    fetchProducts();
  }

  function stockLabel(product) {
    if (product.stock_kg === null) return { text: 'Unlimited', color: '#aaa' };
    const kg = parseFloat(product.stock_kg);
    if (kg === 0) return { text: 'Out of stock', color: '#b91c1c' };
    if (kg < 5)  return { text: `${kg}kg — Low`, color: '#b45309' };
    return { text: `${kg}kg`, color: '#15803d' };
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', fontSize: '1.25rem', color: '#555' }}>←</button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, flex: 1 }}>Products</h1>
        <button onClick={() => setShowAdd(s => !s)}
          style={{ padding: '0.5rem 0.85rem', borderRadius: 8, background: '#1a1a1a', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addProduct} style={{ background: '#fff', borderRadius: 12, padding: '1rem', marginBottom: '1rem', border: '1.5px solid #e8e8e3' }}>
          <input
            placeholder="Product name" value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', border: '1.5px solid #ddd', borderRadius: 10, marginBottom: '0.5rem', fontSize: '1rem' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="number" placeholder="Price /kg" value={newPrice} min="0" step="0.5"
              onChange={e => setNewPrice(e.target.value)}
              style={{ flex: 1, padding: '0.75rem', border: '1.5px solid #ddd', borderRadius: 10, fontSize: '1rem' }}
            />
            <input
              type="number" placeholder="Stock kg (optional)" value={newStock} min="0" step="0.5"
              onChange={e => setNewStock(e.target.value)}
              style={{ flex: 1, padding: '0.75rem', border: '1.5px solid #ddd', borderRadius: 10, fontSize: '1rem' }}
            />
          </div>
          <button type="submit" disabled={saving}
            style={{ width: '100%', padding: '0.75rem', background: '#1a1a1a', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: '0.95rem' }}>
            {saving ? 'Saving...' : 'Save product'}
          </button>
        </form>
      )}

      {products.map(product => {
        const stock = stockLabel(product);
        const isEditingStock = editingStockId === product.id;
        return (
          <div key={product.id} style={{
            background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 12,
            padding: '0.9rem 1rem', marginBottom: '0.6rem',
            opacity: product.is_available ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{product.name}</p>
                <p style={{ fontSize: '0.85rem', color: '#666' }}>${product.price_per_kg}/kg</p>
              </div>
              <button onClick={() => toggleAvailable(product)} style={{
                padding: '0.35rem 0.65rem', borderRadius: 7, fontSize: '0.8rem', fontWeight: 500,
                background: product.is_available ? '#f0fdf4' : '#f5f5f0',
                color: product.is_available ? '#15803d' : '#888',
              }}>
                {product.is_available ? 'Available' : 'Hidden'}
              </button>
              <button onClick={() => deleteProduct(product.id)}
                style={{ color: '#ccc', background: 'none', fontSize: '1.1rem', padding: '0.2rem' }}>×</button>
            </div>

            {/* Stock row */}
            <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid #f0f0eb', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 40 }}>Stock</p>
              {isEditingStock ? (
                <>
                  <input
                    type="number" min="0" step="0.5" autoFocus
                    value={stockDraft}
                    onChange={e => setStockDraft(e.target.value)}
                    placeholder="kg (blank = unlimited)"
                    style={{ flex: 1, padding: '0.35rem 0.6rem', border: '1.5px solid #93c5fd', borderRadius: 7, fontSize: '0.85rem' }}
                    onKeyDown={e => { if (e.key === 'Enter') saveStock(product); if (e.key === 'Escape') setEditingStockId(null); }}
                  />
                  <button onClick={() => saveStock(product)}
                    style={{ padding: '0.35rem 0.65rem', borderRadius: 7, background: '#1a1a1a', color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}>
                    Save
                  </button>
                  <button onClick={() => setEditingStockId(null)}
                    style={{ padding: '0.35rem 0.5rem', borderRadius: 7, background: '#f0f0eb', color: '#555', fontSize: '0.8rem' }}>
                    ×
                  </button>
                </>
              ) : (
                <button onClick={() => startStockEdit(product)}
                  style={{ background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: stock.color }}>{stock.text}</span>
                  <span style={{ fontSize: '0.75rem', color: '#bbb', marginLeft: '0.4rem' }}>edit</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
