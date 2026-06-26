const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/events
router.get('/events', (req, res) => {
  const events = db.prepare('SELECT * FROM events WHERE is_published = 1 ORDER BY event_date ASC').all();
  res.json(events);
});

// GET /api/guidelines
router.get('/guidelines', (req, res) => {
  const guidelines = db.prepare('SELECT * FROM guidelines WHERE is_published = 1 ORDER BY created_at DESC').all();
  res.json(guidelines);
});

// GET /api/settings (public deadline/congress info)
router.get('/settings', (req, res) => {
  const rows = db.prepare(
    "SELECT key, value FROM settings WHERE key IN ('congress_name','submission_deadline','submission_start','upload_deadline','max_abstracts_per_user','max_words_per_abstract','about_text','blind_review','criteria1_label','criteria2_label','criteria3_label','criteria4_label')"
  ).all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

module.exports = router;
