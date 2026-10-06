const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
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
    "SELECT key, value FROM settings WHERE key IN ('congress_name','congress_date','submission_deadline','submission_start','upload_deadline','max_abstracts_per_user','max_words_per_abstract','about_text','criteria1_label','criteria2_label','criteria3_label','criteria4_label','ppt_template_file','ppt_template_name')"
  ).all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// GET /api/template/download — download official PPT presentation template
router.get('/template/download', (req, res) => {
  const fileRow = db.prepare("SELECT value FROM settings WHERE key = 'ppt_template_file'").get();
  const nameRow = db.prepare("SELECT value FROM settings WHERE key = 'ppt_template_name'").get();
  if (!fileRow || !fileRow.value) {
    return res.status(404).send('No presentation template file has been uploaded yet.');
  }

  const relativePath = fileRow.value.replace(/^\/uploads\//, '');
  const baseDir = process.env.RENDER === 'true' ? '/data/uploads' : path.join(__dirname, '..', 'public', 'uploads');
  const filePath = path.join(baseDir, relativePath);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Template file not found on server.');
  }

  const downloadName = nameRow && nameRow.value ? nameRow.value : 'TTSA_Presentation_Template.pptx';
  res.download(filePath, downloadName);
});

module.exports = router;

