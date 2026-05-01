const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../db/database');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');
const { sendVerdict } = require('../services/email');
const { generateAbstractsExcel } = require('../services/export');

// Multer config for event posters
const eventPosterStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'public', 'uploads', 'events');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `event_${Date.now()}${ext}`);
  }
});
const uploadEventPoster = multer({
  storage: eventPosterStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only JPEG images allowed'));
  }
});

// ─── ABSTRACTS ────────────────────────────────────────────────────────────────

// GET /api/admin/abstracts — all abstracts with review info
router.get('/abstracts', requireAdmin, (req, res) => {
  const abstracts = db.prepare(`
    SELECT a.*, u.first_name || ' ' || u.last_name AS submitter_name, u.email AS submitter_email,
           u.nationality, u.profession, u.specialty, u.seniority,
           rv.first_name || ' ' || rv.last_name AS reviewer_name,
           r.total_score, r.verdict, r.presentation_type, r.criteria1, r.criteria2, r.criteria3, r.criteria4, r.comments
    FROM abstracts a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN reviewer_assignments ra ON ra.abstract_id = a.id
    LEFT JOIN reviewers rv ON rv.id = ra.reviewer_id
    LEFT JOIN reviews r ON r.abstract_id = a.id AND r.reviewer_id = ra.reviewer_id
    ORDER BY COALESCE(r.total_score, -1) DESC, a.id
  `).all();

  abstracts.forEach(abs => {
    abs.authors = db.prepare(
      'SELECT * FROM authors WHERE abstract_id = ? ORDER BY sort_order'
    ).all(abs.id);
  });

  res.json(abstracts);
});

// GET /api/admin/abstracts/:id — single abstract detail
router.get('/abstracts/:id', requireAdmin, (req, res) => {
  const abstract = db.prepare(`
    SELECT a.*, u.first_name || ' ' || u.last_name AS submitter_name, u.email AS submitter_email,
           u.nationality, u.profession, u.specialty, u.seniority
    FROM abstracts a JOIN users u ON a.user_id = u.id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!abstract) return res.status(404).json({ error: 'Abstract not found' });

  abstract.authors = db.prepare('SELECT * FROM authors WHERE abstract_id = ? ORDER BY sort_order').all(abstract.id);
  abstract.review = db.prepare(`
    SELECT r.*, rv.first_name || ' ' || rv.last_name AS reviewer_name
    FROM reviews r JOIN reviewers rv ON r.reviewer_id = rv.id
    WHERE r.abstract_id = ?
  `).get(abstract.id);
  abstract.assignment = db.prepare(`
    SELECT ra.*, rv.first_name || ' ' || rv.last_name AS reviewer_name, rv.email AS reviewer_email
    FROM reviewer_assignments ra JOIN reviewers rv ON rv.id = ra.reviewer_id
    WHERE ra.abstract_id = ?
  `).get(abstract.id);

  res.json(abstract);
});

// ─── REVIEWER MANAGEMENT ─────────────────────────────────────────────────────

// GET /api/admin/reviewers — list all reviewers
router.get('/reviewers', requireAdmin, (req, res) => {
  const reviewers = db.prepare('SELECT id, email, first_name, last_name, created_at FROM reviewers ORDER BY last_name').all();
  res.json(reviewers);
});

// POST /api/admin/reviewers — create reviewer
router.post('/reviewers', requireAdmin, async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name) return res.status(400).json({ error: 'All fields required' });
    const existing = db.prepare('SELECT id FROM reviewers WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already exists' });
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO reviewers(email,password_hash,first_name,last_name) VALUES(?,?,?,?)').run(email.toLowerCase(), hash, first_name, last_name);
    res.status(201).json({ message: 'Reviewer created', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create reviewer' });
  }
});

// DELETE /api/admin/reviewers/:id
router.delete('/reviewers/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM reviewers WHERE id = ?').run(req.params.id);
  res.json({ message: 'Reviewer deleted' });
});

// ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────

// PATCH /api/admin/assignments — assign or reassign reviewer
router.patch('/assignments', requireAdmin, (req, res) => {
  const { abstract_id, reviewer_id } = req.body;
  if (!abstract_id || !reviewer_id) return res.status(400).json({ error: 'abstract_id and reviewer_id required' });

  const abstract = db.prepare('SELECT id FROM abstracts WHERE id = ?').get(abstract_id);
  if (!abstract) return res.status(404).json({ error: 'Abstract not found' });

  const reviewer = db.prepare('SELECT id FROM reviewers WHERE id = ?').get(reviewer_id);
  if (!reviewer) return res.status(404).json({ error: 'Reviewer not found' });

  // Remove old assignment if exists
  db.prepare('DELETE FROM reviewer_assignments WHERE abstract_id = ?').run(abstract_id);
  db.prepare('INSERT INTO reviewer_assignments(abstract_id, reviewer_id) VALUES(?,?)').run(abstract_id, reviewer_id);
  db.prepare("UPDATE abstracts SET status='Submitted', updated_at=unixepoch() WHERE id=? AND status='Draft'").run(abstract_id);

  res.json({ message: 'Reviewer assigned successfully' });
});

// DELETE /api/admin/assignments/:abstract_id — remove assignment
router.delete('/assignments/:abstract_id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM reviewer_assignments WHERE abstract_id = ?').run(req.params.abstract_id);
  res.json({ message: 'Assignment removed' });
});

// ─── BLIND REVIEW ─────────────────────────────────────────────────────────────

// PATCH /api/admin/blind-review
router.patch('/blind-review', requireAdmin, (req, res) => {
  const { enabled } = req.body;
  db.prepare("UPDATE settings SET value=?, updated_at=unixepoch() WHERE key='blind_review'").run(enabled ? 'true' : 'false');
  res.json({ message: `Blind review ${enabled ? 'enabled' : 'disabled'}`, blind_review: enabled });
});

// ─── FINALIZE & EMAIL BLAST ───────────────────────────────────────────────────

// POST /api/admin/finalize — validate verdicts and send email blast
router.post('/finalize', requireAdmin, async (req, res) => {
  try {
    const { abstract_ids } = req.body; // optional: specific IDs; if empty, all reviewed

    let query = `
      SELECT a.id, a.title, a.user_id, r.verdict, r.presentation_type,
             u.email, u.first_name
      FROM abstracts a
      JOIN reviews r ON r.abstract_id = a.id
      JOIN users u ON u.id = a.user_id
      WHERE a.status = 'Under Review'
    `;
    let params = [];
    if (abstract_ids && abstract_ids.length > 0) {
      query += ` AND a.id IN (${abstract_ids.map(() => '?').join(',')})`;
      params = abstract_ids;
    }

    const abstracts = db.prepare(query).all(...params);
    let sent = 0, failed = 0;

    for (const abs of abstracts) {
      // Update status
      const newStatus = abs.verdict === 'Admitted' ? 'Accepted' : 'Refused';
      db.prepare("UPDATE abstracts SET status=?, updated_at=unixepoch() WHERE id=?").run(newStatus, abs.id);

      // Send email
      try {
        await sendVerdict(abs.email, abs.first_name, abs.title, abs.verdict, abs.presentation_type);
        sent++;
      } catch (err) {
        console.error(`Email failed for abstract ${abs.id}:`, err.message);
        failed++;
      }
    }

    res.json({ message: `Finalization complete. Emails sent: ${sent}, failed: ${failed}`, total: abstracts.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Finalization failed' });
  }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

// GET /api/admin/settings
router.get('/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// PUT /api/admin/settings
router.put('/settings', requireAdmin, (req, res) => {
  const updates = req.body; // { key: value, ... }
  const update = db.prepare("UPDATE settings SET value=?, updated_at=unixepoch() WHERE key=?");
  const insert = db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES(?,?)");
  for (const [key, value] of Object.entries(updates)) {
    insert.run(key, String(value));
    update.run(String(value), key);
  }
  res.json({ message: 'Settings updated' });
});

// ─── EVENTS ───────────────────────────────────────────────────────────────────

router.get('/events', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY created_at DESC').all());
});

router.post('/events', uploadEventPoster.single('poster'), requireAdmin, (req, res) => {
  if (!req.body) {
    console.warn('⚠️ Warning: req.body is undefined in POST /events. Ensuring it is an object.');
    req.body = {};
  }
  const { title, description, event_date, event_end_date, location } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  
  const poster_url = req.file ? `/uploads/events/${req.file.filename}` : null;
  const result = db.prepare('INSERT INTO events(title,description,event_date,event_end_date,location,poster_url) VALUES(?,?,?,?,?,?)')
    .run(title, description || '', event_date || '', event_end_date || '', location || '', poster_url);
  res.status(201).json({ message: 'Event created', id: result.lastInsertRowid });
});

router.put('/events/:id', uploadEventPoster.single('poster'), requireAdmin, (req, res) => {
  if (!req.body) {
    console.warn('⚠️ Warning: req.body is undefined in PUT /events. Ensuring it is an object.');
    req.body = {};
  }
  const { title, description, event_date, event_end_date, location, is_published } = req.body;
  
  let poster_url = req.body.poster_url;
  if (req.file) {
    poster_url = `/uploads/events/${req.file.filename}`;
    const oldEvent = db.prepare('SELECT poster_url FROM events WHERE id = ?').get(req.params.id);
    if (oldEvent && oldEvent.poster_url) {
      const oldPath = path.join(__dirname, '..', 'public', oldEvent.poster_url);
      if (fs.existsSync(oldPath)) try { fs.unlinkSync(oldPath); } catch(e){}
    }
  }

  db.prepare('UPDATE events SET title=?,description=?,event_date=?,event_end_date=?,location=?,poster_url=?,is_published=? WHERE id=?')
    .run(title, description || '', event_date || '', event_end_date || '', location || '', poster_url, is_published === 'true' || is_published === 1 ? 1 : 0, req.params.id);
  res.json({ message: 'Event updated' });
});

router.delete('/events/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ message: 'Event deleted' });
});

// ─── GUIDELINES ───────────────────────────────────────────────────────────────

router.get('/guidelines', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM guidelines ORDER BY created_at DESC').all());
});

router.post('/guidelines', requireAdmin, (req, res) => {
  const { title, content, file_url, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const result = db.prepare('INSERT INTO guidelines(title,content,file_url,category) VALUES(?,?,?,?)').run(title, content || '', file_url || '', category || 'General');
  res.status(201).json({ message: 'Guideline created', id: result.lastInsertRowid });
});

router.put('/guidelines/:id', requireAdmin, (req, res) => {
  const { title, content, file_url, category, is_published } = req.body;
  db.prepare('UPDATE guidelines SET title=?,content=?,file_url=?,category=?,is_published=? WHERE id=?')
    .run(title, content || '', file_url || '', category || 'General', is_published ? 1 : 0, req.params.id);
  res.json({ message: 'Guideline updated' });
});

router.delete('/guidelines/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM guidelines WHERE id = ?').run(req.params.id);
  res.json({ message: 'Guideline deleted' });
});

// ─── EXPORT ───────────────────────────────────────────────────────────────────

// GET /api/admin/export — download Excel
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const workbook = await generateAbstractsExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="TTSA_Abstracts_${new Date().toISOString().slice(0,10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/admin/export/files — bulk download uploaded presentation files as ZIP
router.get('/export/files', requireAdmin, (req, res) => {
  const abstracts = db.prepare('SELECT id, title, file_path, file_name FROM abstracts WHERE file_path IS NOT NULL').all();
  if (abstracts.length === 0) return res.status(404).json({ error: 'No uploaded files found' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="TTSA_Presentations_${new Date().toISOString().slice(0,10)}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => { console.error(err); });
  archive.pipe(res);

  for (const abs of abstracts) {
    if (fs.existsSync(abs.file_path)) {
      const ext = path.extname(abs.file_name);
      const safeTitle = abs.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      archive.file(abs.file_path, { name: `abstract_${abs.id}_${safeTitle}${ext}` });
    }
  }

  archive.finalize();
});

// ─── STATS ────────────────────────────────────────────────────────────────────

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  const stats = {
    total_members: db.prepare('SELECT COUNT(*) as c FROM users WHERE is_verified = 1').get().c,
    total_abstracts: db.prepare('SELECT COUNT(*) as c FROM abstracts').get().c,
    submitted: db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status NOT IN ('Draft')").get().c,
    under_review: db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status = 'Under Review'").get().c,
    accepted: db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status = 'Accepted'").get().c,
    refused: db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status = 'Refused'").get().c,
    total_reviewers: db.prepare('SELECT COUNT(*) as c FROM reviewers').get().c,
    files_uploaded: db.prepare('SELECT COUNT(*) as c FROM abstracts WHERE file_path IS NOT NULL').get().c,
  };
  res.json(stats);
});

module.exports = router;
