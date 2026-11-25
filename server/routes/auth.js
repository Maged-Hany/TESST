const crypto = require('node:crypto');
const express = require('express');
const router = express.Router();
const { queryOne, execute, transaction } = require('../db');
const { getTodayDateString } = require('../utils/calculations');
const { badRequest, readDate, readText } = require('../utils/validate');
const {
  hashPassword,
  verifyPassword,
  sanitizeUser,
  seedUserInitialPlans,
  computeStreakSnapshot,
  recordStreakActivity,
  requireAuth,
} = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register
router.post('/auth/register', (req, res) => {
  const body = req.body || {};
  const name = readText(body.name, '', 80);
  const email = readText(body.email, '', 120).toLowerCase();
  const password = String(body.password || '');
  const clientDate = readDate(body.date, getTodayDateString(), 'date');

  if (!name) throw badRequest('Full name is required');
  if (!email || !EMAIL_RE.test(email)) throw badRequest('Enter a valid email address');
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');

  const existing = queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = hashPassword(password);
  const token = crypto.randomBytes(32).toString('hex');

  const userId = transaction(() => {
    const ins = execute(
      `INSERT INTO users (name, email, password_hash, split_method)
       VALUES (?, ?, ?, 'ppl')`,
      [name, email, passwordHash]
    );
    const newId = Number(ins.lastInsertRowid);
    seedUserInitialPlans(newId, 'ppl');
    execute('INSERT INTO auth_sessions (token, user_id) VALUES (?, ?)', [token, newId]);
    return newId;
  });

  // Record Day 1 of the account's streak on registration
  const streak = recordStreakActivity(userId, clientDate, 'login');
  const user = sanitizeUser(queryOne('SELECT * FROM users WHERE id = ?', [userId]));

  res.status(201).json({
    token,
    user,
    streak,
  });
});

// POST /api/auth/login
router.post('/auth/login', (req, res) => {
  const body = req.body || {};
  const email = readText(body.email, '', 120).toLowerCase();
  const password = String(body.password || '');
  const clientDate = readDate(body.date, getTodayDateString(), 'date');

  if (!email || !password) {
    throw badRequest('Email and password are required');
  }

  const userRow = queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  execute('INSERT INTO auth_sessions (token, user_id) VALUES (?, ?)', [token, userRow.id]);

  // Consecutive daily login extends the account's streak and triggers "You got a streak"
  const streak = recordStreakActivity(userRow.id, clientDate, 'login');
  const refreshedUser = sanitizeUser(queryOne('SELECT * FROM users WHERE id = ?', [userRow.id]));

  res.json({
    token,
    user: refreshedUser,
    streak,
  });
});

// GET /api/auth/me
router.get('/auth/me', requireAuth, (req, res) => {
  const clientDate = readDate(req.query.date, getTodayDateString(), 'date');
  const checkIn = req.query.check_in === '1' || req.query.check_in === 'true';

  const streak = checkIn
    ? recordStreakActivity(req.userId, clientDate, 'login')
    : computeStreakSnapshot(req.userId, clientDate);

  const freshUser = sanitizeUser(queryOne('SELECT * FROM users WHERE id = ?', [req.userId]));
  res.json({
    user: freshUser,
    streak,
  });
});

// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
  if (req.authToken) {
    execute('DELETE FROM auth_sessions WHERE token = ?', [req.authToken]);
  }
  res.json({ ok: true });
});

// GET /api/streak
router.get('/streak', (req, res) => {
  const dateStr = readDate(req.query.date, getTodayDateString(), 'date');
  res.json(computeStreakSnapshot(req.userId, dateStr));
});

// POST /api/streak/check-in
router.post('/streak/check-in', (req, res) => {
  const body = req.body || {};
  const dateStr = readDate(body.date, getTodayDateString(), 'date');
  const source = body.source === 'login' ? 'login' : 'workout';
  const streak = recordStreakActivity(req.userId, dateStr, source);
  res.json(streak);
});

module.exports = {
  router,
};
