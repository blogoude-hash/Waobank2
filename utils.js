const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

function generateIban() {
  let digits = '';
  for (let i = 0; i < 20; i++) digits += Math.floor(Math.random() * 10);
  return 'FR76 ' + digits.match(/.{1,4}/g).join(' ');
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
}

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, country: u.country, city: u.city,
    phone: u.phone, iban: u.iban, balance: u.balance,
    createdAt: u.created_at, lastLogin: u.last_login
  };
}

module.exports = { generateIban, signToken, authMiddleware, publicUser };
