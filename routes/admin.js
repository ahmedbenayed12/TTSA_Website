const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../db/database');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');
const { sendVerdict, sendFileUploadReminder } = require('../services/email');
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

  const abstract = db.prepare('SELECT id, status FROM abstracts WHERE id = ?').get(abstract_id);
  if (!abstract) return res.status(404).json({ error: 'Abstract not found' });

  // Block assignment once a verdict has been finalized and email sent
  const FINALIZED = ['Waiting for File Upload', 'Final File Uploaded', 'Refused', 'Accepted'];
  if (FINALIZED.includes(abstract.status)) {
    return res.status(403).json({ error: 'Cannot reassign a finalized abstract. The verdict has already been sent to the author.' });
  }

  const reviewer = db.prepare('SELECT id FROM reviewers WHERE id = ?').get(reviewer_id);
  if (!reviewer) return res.status(404).json({ error: 'Reviewer not found' });

  // Remove old assignment if exists
  db.prepare('DELETE FROM reviewer_assignments WHERE abstract_id = ?').run(abstract_id);
  db.prepare('INSERT INTO reviewer_assignments(abstract_id, reviewer_id) VALUES(?,?)').run(abstract_id, reviewer_id);
  // Always set to 'Waiting for Review' on any assignment or reassignment
  db.prepare("UPDATE abstracts SET status='Waiting for Review', updated_at=unixepoch() WHERE id=?").run(abstract_id);

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
      WHERE a.status = 'Waiting for Review'
    `;
    let params = [];
    if (abstract_ids && abstract_ids.length > 0) {
      query += ` AND a.id IN (${abstract_ids.map(() => '?').join(',')})`;
      params = abstract_ids;
    }

    const abstracts = db.prepare(query).all(...params);
    let sent = 0, failed = 0;

    for (const abs of abstracts) {
      // Update status: Accepted → Waiting for File Upload; Refused → Refused
      const newStatus = abs.verdict === 'Admitted' ? 'Waiting for File Upload' : 'Refused';
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

// POST /api/admin/remind-upload — send reminder email to upload presentation
router.post('/remind-upload', requireAdmin, async (req, res) => {
  try {
    const { abstract_ids } = req.body;
    if (!abstract_ids || !abstract_ids.length) return res.status(400).json({ error: 'No abstracts selected' });

    let query = `
      SELECT a.id, a.title, u.email, u.first_name
      FROM abstracts a
      JOIN users u ON u.id = a.user_id
      WHERE a.status = 'Waiting for File Upload'
        AND a.id IN (${abstract_ids.map(() => '?').join(',')})
    `;
    const abstracts = db.prepare(query).all(...abstract_ids);
    
    // Get upload deadline setting
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key='upload_deadline'").get();
    const deadline = settingsRow ? settingsRow.value : null;

    let sent = 0, failed = 0;
    for (const abs of abstracts) {
      try {
        await sendFileUploadReminder(abs.email, abs.first_name, abs.title, deadline);
        sent++;
      } catch (err) {
        console.error(`Reminder failed for abstract ${abs.id}:`, err.message);
        failed++;
      }
    }

    res.json({ message: `Reminders sent: ${sent}, failed: ${failed}`, total: abstracts.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send reminders' });
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
  // Helper to get count by status + presentation_type
  const countByStatusAndType = (status, type) =>
    db.prepare(`SELECT COUNT(*) as c FROM abstracts a
      LEFT JOIN reviews r ON r.abstract_id = a.id
      WHERE a.status = ? AND r.presentation_type = ?`).get(status, type).c;

  const countByStatusesAndType = (statuses, type) =>
    db.prepare(`SELECT COUNT(*) as c FROM abstracts a
      LEFT JOIN reviews r ON r.abstract_id = a.id
      WHERE a.status IN (${statuses.map(() => '?').join(',')}) AND r.presentation_type = ?`).get(...statuses, type).c;

  const stats = {
    total_members:       db.prepare("SELECT COUNT(*) as c FROM users WHERE is_verified = 1").get().c,
    total_abstracts:     db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status != 'Draft'").get().c,
    total_reviewers:     db.prepare("SELECT COUNT(*) as c FROM reviewers").get().c,

    waiting_for_review:        db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status = 'Waiting for Review'").get().c,
    waiting_for_review_oral:   countByStatusAndType('Waiting for Review', 'Oral'),
    waiting_for_review_poster: countByStatusAndType('Waiting for Review', 'Poster'),

    accepted:            db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status IN ('Waiting for File Upload','Final File Uploaded')").get().c,
    accepted_oral:       countByStatusesAndType(['Waiting for File Upload','Final File Uploaded'], 'Oral'),
    accepted_poster:     countByStatusesAndType(['Waiting for File Upload','Final File Uploaded'], 'Poster'),

    refused:             db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status = 'Refused'").get().c,

    waiting_for_upload:        db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status = 'Waiting for File Upload'").get().c,
    waiting_for_upload_oral:   countByStatusAndType('Waiting for File Upload', 'Oral'),
    waiting_for_upload_poster: countByStatusAndType('Waiting for File Upload', 'Poster'),

    final_file_uploaded:        db.prepare("SELECT COUNT(*) as c FROM abstracts WHERE status = 'Final File Uploaded'").get().c,
    final_file_uploaded_oral:   countByStatusAndType('Final File Uploaded', 'Oral'),
    final_file_uploaded_poster: countByStatusAndType('Final File Uploaded', 'Poster'),
  };
  res.json(stats);

});

// PUT /api/admin/profile — update super admin profile
router.put('/profile', requireAdmin, async (req, res) => {
  try {
    const { email, first_name, last_name, password } = req.body;
    const adminId = req.user.id;

    if (!email || !first_name || !last_name) {
      return res.status(400).json({ error: 'Email, first name, and last name are required' });
    }

    const lEmail = email.toLowerCase();

    // Check if email already exists for another admin
    const existing = db.prepare('SELECT id FROM admins WHERE email = ? AND id != ?').get(lEmail, adminId);
    if (existing) {
      return res.status(409).json({ error: 'Email is already in use by another admin' });
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const hash = await bcrypt.hash(password, 12);
      db.prepare('UPDATE admins SET email = ?, first_name = ?, last_name = ?, password_hash = ? WHERE id = ?')
        .run(lEmail, first_name, last_name, hash, adminId);
    } else {
      db.prepare('UPDATE admins SET email = ?, first_name = ?, last_name = ? WHERE id = ?')
        .run(lEmail, first_name, last_name, adminId);
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Failed to update admin profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/admin/users — list all registered participants (users)
router.get('/users', requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, email, first_name, last_name, nationality, profession, specialty, seniority, is_blocked, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (err) {
    console.error('Failed to list users:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// PATCH /api/admin/users/:id/block — block/unblock participant
router.patch('/users/:id/block', requireAdmin, (req, res) => {
  try {
    const { blocked } = req.body;
    const userId = req.params.id;

    if (blocked === undefined) {
      return res.status(400).json({ error: 'blocked status is required' });
    }

    db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(blocked ? 1 : 0, userId);
    res.json({ message: `User account ${blocked ? 'blocked' : 'unblocked'} successfully` });
  } catch (err) {
    console.error('Failed to update block status:', err);
    res.status(500).json({ error: 'Failed to update block status' });
  }
});

// GET /api/admin/test-email — test SMTP connection and send a test email to the logged-in admin
router.get('/test-email', requireAdmin, (req, res) => {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  transporter.verify(async (err, success) => {
    if (err) {
      console.error('SMTP verify failed:', err);
      return res.status(500).json({
        error: `SMTP connection failed: ${err.message}.`,
        debugConfig: {
          host: process.env.SMTP_HOST || '(default: smtp.gmail.com)',
          port: process.env.SMTP_PORT || '(default: 587)',
          secure: process.env.SMTP_SECURE || '(default: false)',
          user: process.env.SMTP_USER || '(not configured)',
          hasPassword: !!process.env.SMTP_PASS
        }
      });
    }

    try {
      const fromEmail = process.env.EMAIL_FROM || '"TTSA" <noreply@ttsa.tn>';
      await transporter.sendMail({
        from: fromEmail,
        to: req.user.email,
        subject: 'TTSA – SMTP Connection Test',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
            <div style="background:#0C589A;padding:24px;text-align:center">
              <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
              <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
            </div>
            <div style="padding:32px">
              <p style="font-size:16px">Hello <strong>${req.user.name || 'Admin'}</strong>,</p>
              <p>This is a test email to verify that the TTSA email notification system is working correctly.</p>
              <div style="background:#dcfce7;border-left:4px solid #166534;color:#166534;padding:16px;border-radius:4px;margin:16px 0;font-weight:bold">
                ✅ SMTP system is fully operational!
              </div>
              <p>Sent from: <code>${fromEmail}</code></p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
              <p style="color:#aaa;font-size:12px;text-align:center">Tunisian Thoracic Surgery Association &copy; 2026</p>
            </div>
          </div>
        `,
      });
      res.json({ message: `SMTP connection verified and test email successfully sent to ${req.user.email}!` });
    } catch (sendErr) {
      console.error('SMTP send failed:', sendErr);
      res.status(500).json({ error: `SMTP verified, but sending email failed: ${sendErr.message}` });
    }
  });
});

module.exports = router;
