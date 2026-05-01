const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { sendOTP } = require('../services/email');

const JWT_SECRET = process.env.JWT_SECRET || 'ttsa_jwt_secret_key_2026';

function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/check-email
router.post('/check-email', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.json({ exists: true });
  }
  return res.json({ exists: false });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, nationality, country, profession, specialty, specialty_details, seniority } = req.body;
    if (!email || !password || !first_name || !last_name || !nationality || !profession || !specialty || !seniority) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const lEmail = email.toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(lEmail);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const otp = generateOTP();
    const otpExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    
    // Default country to Tunisia if not provided or if nationality is Tunisian
    const finalCountry = (nationality === 'Tunisian') ? 'Tunisia' : (country || 'Unknown');

    db.prepare(`
      INSERT INTO users(email, password_hash, first_name, last_name, nationality, country, profession, specialty, specialty_details, seniority, otp, otp_expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(lEmail, hash, first_name, last_name, nationality, finalCountry, profession, specialty, specialty_details, seniority, otp, Math.floor(otpExpires / 1000));

    try {
      await sendOTP(email, first_name, otp);
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
    }

    res.status(201).json({ message: 'Registration successful. Check your email for the OTP.', email: email.toLowerCase() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.is_verified) return res.status(400).json({ error: 'Email already verified' });

  const now = Math.floor(Date.now() / 1000);
  if (user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
  if (user.otp_expires_at < now) return res.status(400).json({ error: 'OTP has expired. Request a new one.' });

  db.prepare('UPDATE users SET is_verified = 1, otp = NULL, otp_expires_at = NULL WHERE id = ?').run(user.id);

  const token = generateToken({ id: user.id, email: user.email, role: 'member', name: user.first_name });
  res.json({ message: 'Email verified successfully', token, user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name } });
});

// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.is_verified) return res.status(400).json({ error: 'Email already verified' });

  const otp = generateOTP();
  const otpExpires = Math.floor((Date.now() + 15 * 60 * 1000) / 1000);
  db.prepare('UPDATE users SET otp = ?, otp_expires_at = ? WHERE id = ?').run(otp, otpExpires, user.id);

  try {
    await sendOTP(user.email, user.first_name, otp);
  } catch (err) {
    console.error('Resend OTP failed:', err.message);
  }

  res.json({ message: 'New OTP sent to your email' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const lEmail = email.toLowerCase();

  // Check admin
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(lEmail);
  if (admin) {
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken({ id: admin.id, email: admin.email, role: 'admin', name: admin.first_name });
    return res.json({ token, role: 'admin', name: admin.first_name });
  }

  // Check reviewer
  const reviewer = db.prepare('SELECT * FROM reviewers WHERE email = ?').get(lEmail);
  if (reviewer) {
    const match = await bcrypt.compare(password, reviewer.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken({ id: reviewer.id, email: reviewer.email, role: 'reviewer', name: reviewer.first_name });
    return res.json({ token, role: 'reviewer', name: reviewer.first_name });
  }

  // Check member
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(lEmail);
  if (user) {
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.is_verified) return res.status(403).json({ error: 'Email not verified. Check your inbox for the OTP.', requiresOTP: true, email: lEmail });
    const token = generateToken({ id: user.id, email: user.email, role: 'member', name: user.first_name });
    return res.json({ token, role: 'member', name: user.first_name });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const lEmail = email.toLowerCase();
  const user = db.prepare('SELECT id, email, first_name FROM users WHERE email = ?').get(lEmail);
  
  if (!user) {
    return res.status(404).json({ error: 'This email is not registered. Please create an account.' });
  }

  const otp = generateOTP();
  const otpExpires = Math.floor((Date.now() + 15 * 60 * 1000) / 1000); // 15 mins

  db.prepare('UPDATE users SET otp = ?, otp_expires_at = ? WHERE id = ?').run(otp, otpExpires, user.id);

  try {
    await require('../services/email').sendPasswordResetOTP(user.email, user.first_name, otp);
  } catch (err) {
    console.error('Forgot password email failed:', err.message);
  }

  res.json({ message: 'If that email is registered, a password reset link has been sent.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Email, OTP, and new password required' });

  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const lEmail = email.toLowerCase();
  const user = db.prepare('SELECT id, otp, otp_expires_at FROM users WHERE email = ?').get(lEmail);

  if (!user) return res.status(404).json({ error: 'Invalid request' });

  const now = Math.floor(Date.now() / 1000);
  if (user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
  if (user.otp_expires_at < now) return res.status(400).json({ error: 'OTP has expired. Request a new one.' });

  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ?, otp = NULL, otp_expires_at = NULL WHERE id = ?').run(hash, user.id);

  res.json({ message: 'Password reset successfully. You can now log in.' });
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAnyAuth, (req, res) => {
  const { role, id } = req.user;
  let user;
  if (role === 'admin') user = db.prepare('SELECT id, email, first_name, last_name FROM admins WHERE id = ?').get(id);
  else if (role === 'reviewer') user = db.prepare('SELECT id, email, first_name, last_name FROM reviewers WHERE id = ?').get(id);
  else user = db.prepare('SELECT id, email, first_name, last_name, nationality, profession, specialty, seniority FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ...user, role });
});

module.exports = router;
