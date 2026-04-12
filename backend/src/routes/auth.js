const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { password } = req.body;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return res.status(500).json({ error: 'Server misconfigured: ADMIN_PASSWORD_HASH not set' });
  const valid = await bcrypt.compare(password, hash);
  if (valid) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Wrong password' });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me — lets the frontend check if session is still valid
router.get('/me', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

module.exports = router;
