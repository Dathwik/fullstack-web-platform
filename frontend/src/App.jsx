import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Orders from './pages/Orders';
import NewOrder from './pages/NewOrder';
import Products from './pages/Products';
import OrderDetail from './pages/OrderDetail';
import api from './api';

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking

  useEffect(() => {
    api.get('/auth/me')
      .then(r => setAuthed(r.data.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  async function handleLogout() {
    await api.post('/auth/logout');
    setAuthed(false);
  }

  if (authed === null) return null; // splash while checking session

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <BrowserRouter>
      <Routes>
        
        <Route path="/"            element={<Orders onLogout={handleLogout} />} />
        <Route path="/new-order"   element={<NewOrder />} />
        <Route path="/products"    element={<Products />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="*"            element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
