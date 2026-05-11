module.exports = function requireCustomer(req, res, next) {
  if (req.session && req.session.customer_id) {
    return next();
  }
  res.status(401).json({ error: 'Not signed in' });
};
