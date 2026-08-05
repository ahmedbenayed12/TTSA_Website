const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../db/database');

// Rate limiter for public endpoints (100 req/min per IP)
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

// GET /api/events
router.get('/events', publicLimiter, (req, res) => {
  const events = db.prepare('SELECT * FROM events WHERE is_published = 1 ORDER BY event_date ASC').all();
  res.json(events);
});

// GET /api/guidelines
router.get('/guidelines', publicLimiter, (req, res) => {
  const guidelines = db.prepare('SELECT * FROM guidelines WHERE is_published = 1 ORDER BY created_at DESC').all();
  res.json(guidelines);
});

// GET /api/settings (public deadline/congress info — blind_review excluded intentionally)
router.get('/settings', publicLimiter, (req, res) => {
  const rows = db.prepare(
    "SELECT key, value FROM settings WHERE key IN ('congress_name','submission_deadline','submission_start','upload_deadline','max_abstracts_per_user','max_words_per_abstract','about_text','criteria1_label','criteria2_label','criteria3_label','criteria4_label')"
  ).all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

module.exports = router;
