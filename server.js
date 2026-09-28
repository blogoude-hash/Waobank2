require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const db = require('./db');
const { generateIban, signToken, authMiddleware, publicUser } = require('./utils');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

const LOAN_RATE = 0.035;

// ---------- Auth ----------

app.post('/api/register', (req, res) => {
  const { name, email, password, country, city, phone } = req.body || {};
  if (!name || !email || !password || !country || !city || !phone) {
    return res.status(400).json({ error: 'Veuillez remplir tous les champs.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  }
  if (!/^\+[1-9][0-9\s]{6,18}$/.test(phone.trim())) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide (format international).' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const iban = generateIban();

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, country, city, phone, iban, balance, created_at, last_login)
    VALUES (@name, @email, @password_hash, @country, @city, @phone, @iban, @balance, @created_at, @last_login)
  `);

  const result = db.transaction(() => {
    const info = insertUser.run({
      name: name.trim(), email: normalizedEmail, password_hash: passwordHash,
      country, city: city.trim(), phone: phone.trim(), iban, balance: 1500,
      created_at: now, last_login: now
    });
    db.prepare(`
      INSERT INTO transactions (user_id, label, amount, type, date)
      VALUES (?, 'Dépôt de bienvenue', 1500, 'in', ?)
    `).run(info.lastInsertRowid, now);
    return info.lastInsertRowid;
  })();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'E-mail et mot de passe requis.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
  }

  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ token: signToken(user), user: publicUser(refreshed) });
});

// ---------- Profile ----------

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ user: publicUser(user) });
});

app.put('/api/me', authMiddleware, (req, res) => {
  const { name, phone } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom ne peut pas être vide.' });

  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?')
    .run(name.trim(), (phone || '').trim(), req.userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(user) });
});

// ---------- Transactions ----------

app.get('/api/transactions', authMiddleware, (req, res) => {
  const rows = db.prepare(
    'SELECT id, label, amount, type, date FROM transactions WHERE user_id = ? ORDER BY date DESC'
  ).all(req.userId);
  res.json({ transactions: rows });
});

// ---------- Transfer ----------

app.post('/api/transfer', authMiddleware, (req, res) => {
  const { destination, amount, note } = req.body || {};
  const amt = parseFloat(amount);

  if (!destination || !destination.trim()) return res.status(400).json({ error: 'Indiquez un IBAN ou un e-mail.' });
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Indiquez un montant valide.' });

  const sender = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (amt > sender.balance) {
    return res.status(400).json({
      error: 'Solde insuffisant.',
      detail: { requested: amt, available: sender.balance }
    });
  }

  const destRaw = destination.trim();
  const destLower = destRaw.toLowerCase();
  const destIbanNorm = destRaw.replace(/\s+/g, '').toUpperCase();

  let recipient = db.prepare('SELECT * FROM users WHERE email = ? AND id != ?').get(destLower, sender.id);
  if (!recipient) {
    recipient = db.prepare('SELECT * FROM users WHERE REPLACE(UPPER(iban), " ", "") = ? AND id != ?')
      .get(destIbanNorm, sender.id);
  }

  const now = new Date().toISOString();
  const label = (note && note.trim()) || (recipient ? `Virement à ${recipient.name}` : `Virement vers ${destRaw}`);

  const run = db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amt, sender.id);
    db.prepare(`INSERT INTO transactions (user_id, label, amount, type, date) VALUES (?, ?, ?, 'out', ?)`)
      .run(sender.id, label, amt, now);

    if (recipient) {
      const inLabel = (note && note.trim()) || `Virement de ${sender.name}`;
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amt, recipient.id);
      db.prepare(`INSERT INTO transactions (user_id, label, amount, type, date) VALUES (?, ?, ?, 'in', ?)`)
        .run(recipient.id, inLabel, amt, now);
    }
  });
  run();

  const updatedSender = db.prepare('SELECT * FROM users WHERE id = ?').get(sender.id);
  res.json({
    message: recipient ? `Virement envoyé à ${recipient.name}.` : 'Virement envoyé (bénéficiaire externe simulé).',
    user: publicUser(updatedSender)
  });
});

// ---------- Loan ----------

app.post('/api/loan/simulate', (req, res) => {
  const { amount, years } = req.body || {};
  const amt = parseFloat(amount);
  const y = parseInt(years, 10);
  if (!amt || amt <= 0 || !y || y < 1 || y > 10) {
    return res.status(400).json({ error: 'Montant ou durée invalide.' });
  }
  const monthlyRate = LOAN_RATE / 12;
  const n = y * 12;
  const monthly = amt * monthlyRate / (1 - Math.pow(1 + monthlyRate, -n));
  const total = monthly * n;
  const interest = total - amt;
  res.json({ rate: LOAN_RATE, monthly, total, interest });
});

app.post('/api/loan/validate', authMiddleware, (req, res) => {
  const { amount, years } = req.body || {};
  const amt = parseFloat(amount);
  const y = parseInt(years, 10);
  if (!amt || amt <= 0 || !y || y < 1 || y > 10) {
    return res.status(400).json({ error: 'Montant ou durée invalide.' });
  }

  const now = new Date().toISOString();
  const label = `Prêt accordé (${y} an${y > 1 ? 's' : ''}, 3,5%)`;

  db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amt, req.userId);
    db.prepare(`INSERT INTO transactions (user_id, label, amount, type, date) VALUES (?, ?, ?, 'in', ?)`)
      .run(req.userId, label, amt, now);
  })();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ message: `Votre compte est crédité de ${amt.toFixed(2)} €.`, user: publicUser(user) });
});

// ---------- Health check ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Wao Bank API en écoute sur le port ${PORT}`));
