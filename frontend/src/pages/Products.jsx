import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [saving, setSaving] = useState(false);

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
      await api.post('/products', { name: newName, price_per_kg: parseFloat(newPrice) });
      setNewName(''); setNewPrice(''); setShowAdd(false);
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
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="number" placeholder="Price per kg" value={newPrice} min="0" step="0.5"
              onChange={e => setNewPrice(e.target.value)}
              style={{ flex: 1, padding: '0.75rem', border: '1.5px solid #ddd', borderRadius: 10, fontSize: '1rem' }}
            />
            <button type="submit" disabled={saving}
              style={{ padding: '0.75rem 1.25rem', background: '#1a1a1a', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: '0.95rem' }}>
              Save
            </button>
          </div>
        </form>
      )}

      {products.map(product => (
        <div key={product.id} style={{
          background: '#fff', border: '1.5px solid #e8e8e3', borderRadius: 12,
          padding: '0.9rem 1rem', marginBottom: '0.6rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          opacity: product.is_available ? 1 : 0.5,
        }}>
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
      ))}
    </div>
  );
}